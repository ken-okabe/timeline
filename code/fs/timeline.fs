module Timeline

// --- Core System Abstractions ---
type TimelineId = System.Guid
type DependencyId = System.Guid
type ScopeId = System.Guid

// --- Resource Management Types ---
// A record in F# is a reference type and can be null by default.
type Resource<'a> =
    { Resource: 'a
      Cleanup: unit -> unit }

// A function that takes a value of type 'a and returns a Resource<'b> or null.
type ResourceFactory<'a, 'b> = 'a -> Resource<'b>

// Helper function to create a Resource<'a> instance.
let createResource<'a> (resource: 'a) (cleanup: unit -> unit) : Resource<'a> =
    { Resource = resource; Cleanup = cleanup }

// --- Type definitions for debug information ---
type ScopeDebugInfo =
    { ScopeId: ScopeId
      DependencyIds: System.Collections.Generic.List<DependencyId> // For mutable addition
      CreatedAt: int64
      ParentScope: ScopeId option
    }

type DependencyDebugInfo =
    { Id: DependencyId
      SourceId: TimelineId
      TargetId: TimelineId
      ScopeId: ScopeId option
      HasCleanup: bool
      CreatedAt: int64
    }

// --- Enhanced debug mode determination ---
// 1. Default check from environment variable
let private defaultDebugMode =
    match System.Environment.GetEnvironmentVariable "NODE_ENV" with
    | "development" -> true
    | _ -> false

// 2. Flags for dynamic control
let mutable private temporaryDebugEnabled = false
// Simulates localStorage state: None=not set, Some true=enabled, Some false=disabled
let mutable private persistentDebugEnabled: bool option = None

// 3. Central function to check debug status
let private isDebugEnabled () =
    if temporaryDebugEnabled then true
    else
        match persistentDebugEnabled with
        | Some state -> state
        | None -> defaultDebugMode

// --- Improved Error Handling ---
type ErrorContext =
    | General
    | ScopeMismatch
    | BindTransition
    | CallbackExecution
    | MapFunction
    | ScanAccumulator
    | CombineInitial
    | CombineReactionA
    | CombineReactionB
    | UsingFunction

let private handleCallbackError (depId: DependencyId) (context: ErrorContext) (ex: System.Exception) (value: obj option) =
    match context with
    | ScopeMismatch ->
        // Scope mismatches are expected during bind operations
        System.Diagnostics.Debug.WriteLine($"Scope mismatch for dependency {depId} - normal during bind operations")
    | BindTransition ->
        // Errors during bind transitions should be warnings
        System.Diagnostics.Debug.WriteLine($"Callback transition warning for {depId}: {ex.Message}")
    | _ ->
        // For other errors, provide detailed information
        let valueStr = value |> Option.map (fun v -> v.ToString()) |> Option.defaultValue "N/A"
        System.Diagnostics.Debug.WriteLine($"Callback error [{context}] for dependency {depId}: {ex.Message}, Value: {valueStr}")

// --- DependencyDetails with OnDispose ---
type internal DependencyDetails =
    { SourceId: TimelineId
      TargetId: TimelineId
      Callback: obj
      ScopeId: ScopeId option
      OnDispose: (unit -> unit) option
    }

// --- GC-Integrated Cleanup Registry ---
// This module mimics the behavior of TypeScript's FinalizationRegistry
// to prevent memory leaks in derived timelines (e.g., from combineLatestWith).
module internal GcRegistry =
    open System.Collections.Concurrent

    // Holds weak references to timeline objects and their associated cleanup actions.
    let private registry = ConcurrentDictionary<System.WeakReference, unit -> unit>()

    // Registers an object to be monitored. When the object is garbage-collected,
    // the cleanup action will be executed.
    let register (target: obj) (cleanup: unit -> unit) =
        // A strong reference to the target is not held, allowing it to be collected.
        let weakRef = System.WeakReference(target)
        registry.TryAdd(weakRef, cleanup) |> ignore

    // A timer that periodically scans the registry for collected objects.
    let private cleanupTimer =
        let callback = fun (_: obj) ->
            for kvp in registry do
                // If the target of the weak reference has been collected, IsAlive will be false.
                if not kvp.Key.IsAlive then
                    try
                        // Execute the associated cleanup action.
                        kvp.Value()
                    with ex ->
                        System.Diagnostics.Debug.WriteLine($"Error during GC-triggered cleanup: {ex.Message}")

                    // Use TryRemove to remove the entry from the registry
                    registry.TryRemove(kvp.Key) |> ignore

        // The 'new Timer' expression is the value assigned to 'cleanupTimer'.
        new System.Threading.Timer(callback, null, 5000, 5000)

// --- Enhanced Dependency Management Core ---
module internal DependencyCore =
    let private dependencies = System.Collections.Generic.Dictionary<DependencyId, DependencyDetails>()
    let private sourceIndex = System.Collections.Generic.Dictionary<TimelineId, System.Collections.Generic.HashSet<DependencyId>>()
    let private scopeIndex = System.Collections.Generic.Dictionary<ScopeId, System.Collections.Generic.HashSet<DependencyId>>()

    // --- Debugging related storage ---
    let private scopeDebugInfo = System.Collections.Generic.Dictionary<ScopeId, ScopeDebugInfo>()
    let private dependencyDebugInfo = System.Collections.Generic.Dictionary<DependencyId, DependencyDebugInfo>()


    let private addToHashSetDict<'K, 'V when 'K : equality and 'V : equality> (dict: System.Collections.Generic.Dictionary<'K, System.Collections.Generic.HashSet<'V>>) (key: 'K) (value: 'V) : unit =
        match dict.TryGetValue(key) with
        | true, hashSet -> hashSet.Add(value) |> ignore
        | false, _ ->
            let newHashSet = System.Collections.Generic.HashSet<'V>()
            newHashSet.Add(value) |> ignore
            dict.Add(key, newHashSet)

    let private removeFromHashSetDict<'K, 'V when 'K : equality and 'V : equality> (dict: System.Collections.Generic.Dictionary<'K, System.Collections.Generic.HashSet<'V>>) (key: 'K) (value: 'V) : unit =
        match dict.TryGetValue(key) with
        | true, hashSet ->
            hashSet.Remove(value) |> ignore
            if hashSet.Count = 0 then
                dict.Remove(key) |> ignore
        | false, _ -> ()

    let generateTimelineId () : TimelineId =
        System.Guid.NewGuid()

    // --- UPDATED: createScope with debug info ---
    let createScope (parentScope: ScopeId option) : ScopeId =
        let scopeId = System.Guid.NewGuid()
        if isDebugEnabled() then
            let debugInfo =
                { ScopeId = scopeId
                  DependencyIds = System.Collections.Generic.List<DependencyId>()
                  CreatedAt = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                  ParentScope = parentScope
                }
            scopeDebugInfo.Add(scopeId, debugInfo)
        scopeId

    // --- UPDATED: registerDependency with OnDispose and debug info ---
    let registerDependency (sourceId: TimelineId) (targetId: TimelineId) (callback: obj) (scopeIdOpt: ScopeId option) (onDisposeOpt: (unit -> unit) option) : DependencyId =
        let depId = System.Guid.NewGuid()
        let details = { SourceId = sourceId; TargetId = targetId; Callback = callback; ScopeId = scopeIdOpt; OnDispose = onDisposeOpt }
        dependencies.Add(depId, details)
        addToHashSetDict sourceIndex sourceId depId
        match scopeIdOpt with
        | Some sId ->
            addToHashSetDict scopeIndex sId depId
            if isDebugEnabled() then
                match scopeDebugInfo.TryGetValue(sId) with
                | true, debugInfo -> debugInfo.DependencyIds.Add(depId)
                | false, _ -> ()
        | None -> ()

        if isDebugEnabled() then
            let depDebugInfo =
                { Id = depId
                  SourceId = sourceId
                  TargetId = targetId
                  ScopeId = scopeIdOpt
                  HasCleanup = onDisposeOpt.IsSome
                  CreatedAt = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                }
            dependencyDebugInfo.Add(depId, depDebugInfo)

        depId

    // --- UPDATED: removeDependency with OnDispose and debug info ---
    let removeDependency (depId: DependencyId) : unit =
        match dependencies.TryGetValue(depId) with
        | true, details ->
            // Execute cleanup function if it exists
            match details.OnDispose with
            | Some disposeFn ->
                try
                    disposeFn()
                with ex ->
                    System.Diagnostics.Debug.WriteLine($"Error during onDispose for dependency {depId}: {ex.Message}")
            | None -> ()

            dependencies.Remove(depId) |> ignore
            removeFromHashSetDict sourceIndex details.SourceId depId
            match details.ScopeId with
            | Some sId ->
                removeFromHashSetDict scopeIndex sId depId
                if isDebugEnabled() then
                    match scopeDebugInfo.TryGetValue(sId) with
                    | true, dbgInfo ->
                        dbgInfo.DependencyIds.Remove(depId) |> ignore
                    | false, _ -> ()
            | None -> ()

            if isDebugEnabled() then
                dependencyDebugInfo.Remove(depId) |> ignore
        | false, _ -> ()

    // --- UPDATED: disposeScope with debug info ---
    let disposeScope (scopeId: ScopeId) : unit =
        match scopeIndex.TryGetValue(scopeId) with
        | true, depIds ->
            let idsToRemove = depIds |> Array.ofSeq
            scopeIndex.Remove(scopeId) |> ignore
            idsToRemove |> Array.iter removeDependency

            if isDebugEnabled() then
                scopeDebugInfo.Remove(scopeId) |> ignore
        | false, _ -> ()

    let getCallbacks (sourceId: TimelineId) : (DependencyId * obj) list =
        match sourceIndex.TryGetValue(sourceId) with
        | true, depIds ->
            depIds
            |> Seq.choose (fun depId ->
                match dependencies.TryGetValue(depId) with
                | true, details -> Some (depId, details.Callback)
                | false, _ -> None)
            |> List.ofSeq
        | false, _ -> List.empty

    // --- Functions to get debug info ---
    let getDebugInfo () =
        if not (isDebugEnabled()) then
            ([], []), (0, 0)
        else
            let scopes = scopeDebugInfo.Values |> Seq.toList
            let deps = dependencyDebugInfo.Values |> Seq.toList
            (scopes, deps), (scopeDebugInfo.Count, dependencyDebugInfo.Count)

    // --- ADDED: Cycle Detection Logic ---
    // Detects all circular references in the dependency graph.
    let findAllCycles () : TimelineId list list =
        if not (isDebugEnabled()) then
            System.Diagnostics.Debug.WriteLine("Warning: Debug mode is not enabled. Cannot find cycles.")
            []
        else
            // 1. Build the dependency graph and list all nodes.
            let graph = System.Collections.Generic.Dictionary<TimelineId, System.Collections.Generic.HashSet<TimelineId>>()
            let allNodes = System.Collections.Generic.HashSet<TimelineId>()
            for details in dependencies.Values do
                if not (graph.ContainsKey(details.SourceId)) then
                    graph.Add(details.SourceId, System.Collections.Generic.HashSet<TimelineId>())
                graph.[details.SourceId].Add(details.TargetId) |> ignore
                allNodes.Add(details.SourceId) |> ignore
                allNodes.Add(details.TargetId) |> ignore

            // 2. Prepare for cycle detection.
            let cycles = System.Collections.Generic.List<TimelineId list>()
            let visited = System.Collections.Generic.HashSet<TimelineId>()      // Tracks nodes whose exploration is complete.
            let recursionStack = System.Collections.Generic.HashSet<TimelineId>() // Tracks nodes on the current exploration path.

            // A Depth-First Search (DFS) helper function for cycle detection.
            let rec dfsForCycleDetection (node: TimelineId) (path: TimelineId list) =
                // Mark the current node as being visited on the current recursion path.
                recursionStack.Add(node) |> ignore
                let currentPath = node :: path

                match graph.TryGetValue(node) with
                | true, neighbors ->
                    for neighbor in neighbors do
                        // Case 1: If the neighbor is on the current recursion stack, a cycle is detected.
                        if recursionStack.Contains(neighbor) then
                            let cycleStartIndex = currentPath |> List.findIndex ((=) neighbor)
                            let cyclePath = currentPath |> List.take (cycleStartIndex + 1) |> List.rev
                            cycles.Add(cyclePath)
                        // Case 2: If the neighbor has not been visited yet, explore it recursively.
                        else if not (visited.Contains(neighbor)) then
                            dfsForCycleDetection neighbor currentPath
                | false, _ -> ()

                // Backtrack: The exploration from this node is complete.
                recursionStack.Remove(node) |> ignore
                visited.Add(node) |> ignore

            // 3. Run DFS starting from every node.
            for node in allNodes do
                if not (visited.Contains(node)) then
                    dfsForCycleDetection node []

            cycles |> Seq.toList

// --- Now Type Definition ---
type NowType = NOW of string
let Now = NOW "Conceptual time coordinate"

// --- Timeline Type Definition ---
type Timeline<'a> =
    private
        { _id: TimelineId
          mutable _last: 'a }

// --- Timeline Factory Function ---
let Timeline<'a> (initialValue: 'a) : Timeline<'a> =
    let newId = DependencyCore.generateTimelineId()
    { _id = newId; _last = initialValue }

// --- Enhanced Timeline Operations Module ---
module TL =
    // ADDED: A set to track timelines currently being updated to detect runtime loops.
    let private currentlyUpdating = System.Collections.Generic.HashSet<TimelineId>()

    let isNull<'a when 'a : null> =
        fun (value: 'a) ->
            match (value :> obj) with
            | null -> true
            | _ -> false

    let at<'a> =
        fun (_now: NowType) ->
        fun (timeline: Timeline<'a>) ->
            timeline._last

    // MODIFIED: Added runtime check for circular updates.
    let define<'a> =
        fun (_now: NowType) ->
        fun (value: 'a) ->
        fun (timeline: Timeline<'a>) ->
            let timelineId = timeline._id

            if isDebugEnabled() && currentlyUpdating.Contains(timelineId) then
                System.Diagnostics.Debug.WriteLine($"Circular dependency detected: Update loop on Timeline ID: {timelineId}. Aborting update.")
            else
                if isDebugEnabled() then
                    currentlyUpdating.Add(timelineId) |> ignore

                try
                    timeline._last <- value
                    let callbacks = timeline._id |> DependencyCore.getCallbacks
                    callbacks
                    |> List.iter (fun (depId, callbackObj) ->
                        try
                            if callbackObj = null then
                                handleCallbackError depId General (System.Exception("Null callback")) None
                            else
                                try
                                    let callback = callbackObj :?> ('a -> unit)
                                    callback value
                                with
                                | :? System.InvalidCastException as ex ->
                                    handleCallbackError depId CallbackExecution ex (Some (box value))
                                | ex ->
                                    handleCallbackError depId CallbackExecution ex (Some (box value))
                        with
                        | ex ->
                            handleCallbackError depId General ex (Some (box value))
                    )
                finally
                    // Ensure the ID is removed even if callbacks fail.
                    if isDebugEnabled() then
                        currentlyUpdating.Remove(timelineId) |> ignore

    let map<'a, 'b> =
        fun (f: 'a -> 'b) ->
        fun (timelineA: Timeline<'a>) ->
            let initialB =
                try
                    f (timelineA |> at Now)
                with
                | ex ->
                    handleCallbackError System.Guid.Empty MapFunction ex (Some (box (timelineA |> at Now)))
                    reraise()

            let timelineB = Timeline initialB
            let reactionFn : 'a -> unit =
                fun valueA ->
                    try
                        let newValueB = f valueA
                        timelineB |> define Now newValueB
                    with
                    | ex ->
                        handleCallbackError System.Guid.Empty MapFunction ex (Some (box valueA))

            DependencyCore.registerDependency timelineA._id timelineB._id (reactionFn :> obj) None None |> ignore
            timelineB

    let nMap<'a, 'b when 'a : null and 'b : null> =
        fun (f: 'a -> 'b) ->
        fun (timelineA: Timeline<'a>) ->
            let currentValueA = timelineA |> at Now
            let initialB =
                if isNull currentValueA then
                    null
                else
                    try
                        f currentValueA
                    with ex ->
                        handleCallbackError System.Guid.Empty MapFunction ex (Some (box currentValueA))
                        null

            let timelineB = Timeline initialB
            let reactionFn : 'a -> unit =
                fun valueA ->
                    let newValueB =
                        if isNull valueA then
                            null
                        else
                            try
                                f valueA
                            with ex ->
                                handleCallbackError System.Guid.Empty MapFunction ex (Some (box valueA))
                                null
                    timelineB |> define Now newValueB

            DependencyCore.registerDependency timelineA._id timelineB._id (reactionFn :> obj) None None |> ignore
            timelineB

    let bind<'a, 'b> =
        fun (monadf: 'a -> Timeline<'b>) ->
        fun (timelineA: Timeline<'a>) ->
            let initialInnerTimeline = monadf (timelineA |> at Now)
            let timelineB = Timeline (initialInnerTimeline |> at Now)
            let mutable currentScopeId : ScopeId = DependencyCore.createScope (Some timelineA._id)

            let setUpInnerReaction (innerTimeline: Timeline<'b>) (scopeForInner: ScopeId) : unit =
                let reactionFnInnerToB : 'b -> unit =
                    fun valueInner ->
                        if currentScopeId = scopeForInner then
                            timelineB |> define Now valueInner

                DependencyCore.registerDependency innerTimeline._id timelineB._id (reactionFnInnerToB :> obj) (Some scopeForInner) None |> ignore

            setUpInnerReaction initialInnerTimeline currentScopeId
            let reactionFnAtoB : 'a -> unit =
                fun valueA ->
                    try
                        DependencyCore.disposeScope currentScopeId
                        currentScopeId <- DependencyCore.createScope (Some timelineA._id)
                        let newInnerTimeline = monadf valueA
                        timelineB |> define Now (newInnerTimeline |> at Now)
                        setUpInnerReaction newInnerTimeline currentScopeId
                    with
                    | ex ->
                        handleCallbackError System.Guid.Empty BindTransition ex (Some (box valueA))

            DependencyCore.registerDependency timelineA._id timelineB._id (reactionFnAtoB :> obj) None None |> ignore
            timelineB

    let nBind<'a, 'b when 'a : null and 'b : null> =
        fun (monadf: 'a -> Timeline<'b>) ->
        fun (timelineA: Timeline<'a>) ->
            let initialValueA = timelineA |> at Now
            let initialInnerTimeline =
                if isNull initialValueA then
                    Timeline null
                else
                    try
                        monadf initialValueA
                    with
                    | ex ->
                        handleCallbackError System.Guid.Empty BindTransition ex (Some (box initialValueA))
                        Timeline null

            let timelineB = Timeline (initialInnerTimeline |> at Now)
            let mutable currentScopeId : ScopeId = DependencyCore.createScope (Some timelineA._id)
            let setUpInnerReaction (innerTimeline: Timeline<'b>) (scopeForInner: ScopeId) : unit =
                let reactionFnInnerToB : 'b -> unit =
                    fun valueInner ->
                        if currentScopeId = scopeForInner then
                            timelineB |> define Now valueInner

                DependencyCore.registerDependency innerTimeline._id timelineB._id (reactionFnInnerToB :> obj) (Some scopeForInner) None |> ignore

            setUpInnerReaction initialInnerTimeline currentScopeId
            let reactionFnAtoB : 'a -> unit =
                fun valueA ->
                    try
                        DependencyCore.disposeScope currentScopeId
                        currentScopeId <- DependencyCore.createScope (Some timelineA._id)
                        let newInnerTimeline =
                            if isNull valueA then
                                Timeline null
                            else
                                 monadf valueA
                        timelineB |> define Now (newInnerTimeline |> at Now)
                        setUpInnerReaction newInnerTimeline currentScopeId
                    with
                    | ex ->
                        handleCallbackError System.Guid.Empty BindTransition ex (Some (box valueA))
                        let fallbackTimeline = Timeline null
                        timelineB |> define Now null
                        setUpInnerReaction fallbackTimeline currentScopeId

            DependencyCore.registerDependency timelineA._id timelineB._id (reactionFnAtoB :> obj) None None |> ignore
            timelineB

    let link<'a> =
        fun (targetTimeline: Timeline<'a>) ->
        fun (sourceTimeline: Timeline<'a>) ->
            let reactionFn = fun value -> targetTimeline |> define Now value
            DependencyCore.registerDependency sourceTimeline._id targetTimeline._id (reactionFn :> obj) None None |> ignore
            reactionFn (sourceTimeline |> at Now)

    let scan<'state, 'input> =
        fun (accumulator: 'state -> 'input -> 'state) ->
        fun (initialState: 'state) ->
        fun (sourceTimeline: Timeline<'input>) ->
            let stateTimeline = Timeline initialState
            let reactionFn = fun input ->
                try
                    let currentState = stateTimeline |> at Now
                    let newState = accumulator currentState input
                    stateTimeline |> define Now newState
                with
                | ex ->
                    handleCallbackError System.Guid.Empty ScanAccumulator ex (Some (box input))

            DependencyCore.registerDependency sourceTimeline._id stateTimeline._id (reactionFn :> obj) None None |> ignore
            reactionFn (sourceTimeline |> at Now)
            stateTimeline

    let distinctUntilChanged<'a when 'a : equality> =
        fun (sourceTimeline: Timeline<'a>) ->
            let resultTimeline = Timeline (sourceTimeline |> at Now)
            let mutable lastValue = sourceTimeline |> at Now
            let reactionFn = fun currentValue ->
                if currentValue <> lastValue then
                    lastValue <- currentValue
                    resultTimeline |> define Now currentValue

            DependencyCore.registerDependency sourceTimeline._id resultTimeline._id (reactionFn :> obj) None None |> ignore
            resultTimeline

    let using<'a, 'b when 'b: null> =
        fun (resourceFactory: ResourceFactory<'a, 'b>) ->
        fun (sourceTimeline: Timeline<'a>) ->
            let nullValue = box null |> unbox<'b>
            let resultTimeline = Timeline nullValue
            let mutable currentScopeIdOpt: ScopeId option = None
            let reactionFn = fun (value: 'a) ->
                try
                    currentScopeIdOpt |> Option.iter DependencyCore.disposeScope
                    let newScopeId = DependencyCore.createScope (Some sourceTimeline._id)
                    currentScopeIdOpt <- Some newScopeId
                    let resourceData = resourceFactory value

                    if (resourceData :> obj) = null then
                        resultTimeline |> define Now nullValue
                    else
                        resultTimeline |> define Now resourceData.Resource
                        DependencyCore.registerDependency
                            sourceTimeline._id
                            resultTimeline._id
                            (fun (_:obj) -> () :> obj) // No-op callback
                            (Some newScopeId)
                            (Some resourceData.Cleanup)
                        |> ignore
                with
                | ex ->
                    handleCallbackError System.Guid.Empty UsingFunction ex (Some (box value))
                    resultTimeline |> define Now nullValue

            let mainReactionFn = fun (v: 'a) -> reactionFn v
            DependencyCore.registerDependency sourceTimeline._id resultTimeline._id (mainReactionFn :> obj) None None |> ignore
            reactionFn (sourceTimeline |> at Now)
            resultTimeline

    let nUsing<'a, 'b when 'a : null and 'b : null> =
        fun (resourceFactory: 'a -> Resource<'b>) ->
        fun (sourceTimeline: Timeline<'a>) ->
            let wrappedFactory (value: 'a) : Resource<'b> =
                if isNull value then
                    box null |> unbox
                else
                    try
                        resourceFactory value
                    with ex ->
                        handleCallbackError System.Guid.Empty UsingFunction ex (Some (box value))
                        box null |> unbox
            using wrappedFactory sourceTimeline

    let combineLatestWith<'a, 'b, 'c> =
        fun (f: 'a -> 'b -> 'c) ->
        fun (timelineA: Timeline<'a>) ->
        fun (timelineB: Timeline<'b>) ->
            let initialA = timelineA |> at Now
            let initialB = timelineB |> at Now
            let initialResult =
                try
                    f initialA initialB
                with
                | ex ->
                    handleCallbackError System.Guid.Empty CombineInitial ex (Some (box (initialA, initialB)))
                    reraise()

            let resultTimeline = Timeline initialResult
            // A scope is created for the combined timeline's dependencies.
            let scopeId = resultTimeline._id :> ScopeId
            let mutable latestA = initialA
            let mutable latestB = initialB
            let reactionA = fun newA ->
                latestA <- newA
                try
                    resultTimeline |> define Now (f latestA latestB)
                with ex -> handleCallbackError System.Guid.Empty CombineReactionA ex (Some (box newA))
            let reactionB = fun newB ->
                latestB <- newB
                try
                    resultTimeline |> define Now (f latestA latestB)
                with ex -> handleCallbackError System.Guid.Empty CombineReactionB ex (Some (box newB))

            DependencyCore.registerDependency timelineA._id resultTimeline._id (reactionA :> obj) (Some scopeId) None |> ignore
            DependencyCore.registerDependency timelineB._id resultTimeline._id (reactionB :> obj) (Some scopeId) None |> ignore

            // Register for automatic cleanup upon garbage collection.
            GcRegistry.register resultTimeline (fun () -> DependencyCore.disposeScope scopeId)

            resultTimeline

    let nCombineLatestWith<'a, 'b, 'c when 'a: null and 'b: null and 'c: null> =
        fun (f: 'a -> 'b -> 'c) ->
        fun (timelineA: Timeline<'a>) ->
        fun (timelineB: Timeline<'b>) ->
            let initialA = timelineA |> at Now
            let initialB = timelineB |> at Now
            let nullValue = box null |> unbox<'c>
            let initialResult =
                if isNull initialA || isNull initialB then
                    nullValue
                else
                    try
                        f initialA initialB
                    with
                    | ex ->
                        handleCallbackError System.Guid.Empty CombineInitial ex (Some (box (initialA, initialB)))
                        nullValue

            let resultTimeline = Timeline initialResult
            // A scope is created for the combined timeline's dependencies.
            let scopeId = resultTimeline._id :> ScopeId
            let mutable latestA = initialA
            let mutable latestB = initialB
            let reactionA = fun newA ->
                latestA <- newA
                let newResult =
                    if isNull newA || isNull latestB then
                        nullValue
                    else
                        try f newA latestB with ex -> handleCallbackError System.Guid.Empty CombineReactionA ex (Some (box newA)); nullValue
                resultTimeline |> define Now newResult
            let reactionB = fun newB ->
                latestB <- newB
                let newResult =
                    if isNull latestA || isNull newB then
                        nullValue
                    else
                        try f latestA newB with ex -> handleCallbackError System.Guid.Empty CombineReactionB ex (Some (box newB)); nullValue
                resultTimeline |> define Now newResult

            DependencyCore.registerDependency timelineA._id resultTimeline._id (reactionA :> obj) (Some scopeId) None |> ignore
            DependencyCore.registerDependency timelineB._id resultTimeline._id (reactionB :> obj) (Some scopeId) None |> ignore

            // Register for automatic cleanup upon garbage collection.
            GcRegistry.register resultTimeline (fun () -> DependencyCore.disposeScope scopeId)

            resultTimeline

    let ID<'a> =
        fun (a: 'a) ->
            Timeline a

    let inline (>>>) (f: 'a -> Timeline<'b>) (g: 'b -> Timeline<'c>) : ('a -> Timeline<'c>) =
        fun a ->
            let timelineFromF = f a
            timelineFromF |> bind g

    let FalseTimeline : Timeline<bool> = Timeline false
    let TrueTimeline : Timeline<bool> = Timeline true

    let orOf =
        fun (timelineA: Timeline<bool>) ->
        fun (timelineB: Timeline<bool>) ->
            combineLatestWith (||) timelineA timelineB

    let andOf =
        fun (timelineA: Timeline<bool>) ->
        fun (timelineB: Timeline<bool>) ->
            combineLatestWith (&&) timelineA timelineB

    let concatOf (timelineA: Timeline<'a list>) (timelineB: Timeline<'a>) : Timeline<'a list> =
        combineLatestWith (fun list item -> list @ [item]) timelineA timelineB


    // --- N-ary Operations ---
    let combineLatest<'a, 'r> =
        fun (combiner: 'a array -> 'r) ->
        fun (timelines: list<Timeline<'a>>) ->
            let timelineArray = List.toArray timelines
            if timelineArray.Length = 0 then
                // If there are no timelines, call combiner with an empty array.
                Timeline (combiner [||])
            else
                // Create a mutable array to hold the latest value from each timeline.
                let latestValues = timelineArray |> Array.map (at Now)
                let resultTimeline = Timeline (combiner latestValues)
                let scopeId = resultTimeline._id :> ScopeId

                // For each timeline, register a dependency that updates the array.
                timelineArray
                |> Array.iteri (fun i timeline ->
                    let reactionFn (value: 'a) =
                        // Directly update the value at the specific index.
                        latestValues.[i] <- value
                        // Call the combiner with the updated array and update the result.
                        resultTimeline |> define Now (combiner latestValues)

                    DependencyCore.registerDependency timeline._id resultTimeline._id (reactionFn :> obj) (Some scopeId) None |> ignore
                )

                // Register for automatic cleanup.
                GcRegistry.register resultTimeline (fun () -> DependencyCore.disposeScope scopeId)

                resultTimeline

    // --- Level 3: Generic folding ---
    let foldTimelines<'a, 'b> =
        fun (accumulator: Timeline<'b> -> Timeline<'a> -> Timeline<'b>) ->
        fun (initialState: Timeline<'b>) ->
        fun (timelines: list<Timeline<'a>>) ->
            List.fold accumulator initialState timelines

    let anyOf =
        fun (booleanTimelines: list<Timeline<bool>>) ->
            foldTimelines orOf FalseTimeline booleanTimelines

    let allOf =
        fun (booleanTimelines: list<Timeline<bool>>) ->
            foldTimelines andOf TrueTimeline booleanTimelines

    let listOf (timelines: Timeline<'a> list) : Timeline<'a list> =
        let emptyListTimeline = Timeline []
        foldTimelines concatOf emptyListTimeline timelines

    // --- Nullable version of applied functions ---
    let nListOf<'a when 'a : null> =
        fun (timelines: list<Timeline<'a>>) ->
            // Use the performant combineLatest to gather all values into a list.
            // The combiner simply converts the final array to a list.
            combineLatest List.ofArray timelines

// --- Public Debug Modules ---
module DebugControl =
    let enable () =
        persistentDebugEnabled <- Some true
        printfn "Timeline persistent debug mode enabled."

    let disable () =
        persistentDebugEnabled <- Some false
        printfn "Timeline persistent debug mode disabled."

    let enableTemporary () =
        temporaryDebugEnabled <- true
        printfn "Timeline debug mode temporarily enabled for this session."

    let isEnabled () =
        isDebugEnabled()

module Debug =
    let getInfo () =
        let (scopes, deps), (totalScopes, totalDeps) = DependencyCore.getDebugInfo()
        {| Scopes = scopes
           Dependencies = deps
           TotalScopes = totalScopes
           TotalDependencies = totalDeps |}

    let printTree () =
        if not (isDebugEnabled()) then
            printfn "Debug mode is disabled. Use DebugControl.enable() to activate."
        else
            let info = getInfo()
            printfn "--- Timeline Dependency Tree ---"
            printfn "Total Scopes: %d" info.TotalScopes
            printfn "Total Dependencies: %d" info.TotalDependencies
            printfn "--------------------------------"
            let depsById = info.Dependencies |> List.map (fun d -> d.Id, d) |> Map.ofList
            let scopesByParent = info.Scopes |> List.groupBy (fun s -> s.ParentScope) |> Map.ofList
            let rec printScope (indent: string) (scope: ScopeDebugInfo) =
                printfn "%sScope: %s..." indent (scope.ScopeId.ToString().Substring(0, 8))
                printfn "%s  Created: %O" indent (System.DateTimeOffset.FromUnixTimeMilliseconds(scope.CreatedAt))
                printfn "%s  Dependencies: %d" indent scope.DependencyIds.Count
                scope.ParentScope |> Option.iter (fun p -> printfn "%s  Parent: %s..." indent (p.ToString().Substring(0, 8)))
                scope.DependencyIds |> Seq.iter (fun depId ->
                    match Map.tryFind depId depsById with
                    | Some dep ->
                        printfn "%s  - %s... (cleanup: %b, target: %s...)" indent (dep.Id.ToString().Substring(0, 8)) dep.HasCleanup (dep.TargetId.ToString().Substring(0,8))
                    | None -> ()
                )
                // Recursively print child scopes
                match Map.tryFind (Some scope.ScopeId) scopesByParent with
                | Some childScopes -> childScopes |> List.iter (printScope (indent + "  "))
                | None -> ()
            // Print root scopes (no parent)
            match Map.tryFind None scopesByParent with
            | Some rootScopes -> rootScopes |> List.iter (printScope "")
            | None -> ()
            printfn "--------------------------------"

    // ADDED: Exposes the cycle detection functionality.
    let findAllCycles () =
        DependencyCore.findAllCycles()