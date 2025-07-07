module Timeline

// --- Now Type Definition ---
type NowType = NOW of string
let Now = NOW "Conceptual time coordinate"

// --- Core System Abstractions ---
type TimelineId = System.Guid
type DependencyId = System.Guid
type ScopeId = System.Guid

// --- NEW: Resource Management Types ---
// A record in F# is a reference type and can be null by default.
type Resource<'a> =
    { Resource: 'a
      Cleanup: unit -> unit }

// A function that takes a value of type 'a and returns a Resource<'b> or null.
type ResourceFactory<'a, 'b> = 'a -> Resource<'b>

// Helper function to create a Resource<'a> instance.
let createResource<'a> (resource: 'a) (cleanup: unit -> unit) : Resource<'a> =
    { Resource = resource; Cleanup = cleanup }

// --- NEW: Type definitions for debug information ---
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

// --- UPDATED: Enhanced debug mode determination ---
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

// --- UPDATED: DependencyDetails with OnDispose ---
type internal DependencyDetails =
    { SourceId: TimelineId
      TargetId: TimelineId
      Callback: obj
      ScopeId: ScopeId option
      OnDispose: (unit -> unit) option // NEW
    }

// --- Enhanced Dependency Management Core ---
module internal DependencyCore =
    let private dependencies = System.Collections.Generic.Dictionary<DependencyId, DependencyDetails>()
    let private sourceIndex = System.Collections.Generic.Dictionary<TimelineId, System.Collections.Generic.HashSet<DependencyId>>()
    let private scopeIndex = System.Collections.Generic.Dictionary<ScopeId, System.Collections.Generic.HashSet<DependencyId>>()

    // --- NEW: Debugging related storage ---
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

    // --- NEW: Functions to get debug info ---
    let getDebugInfo () =
        if not (isDebugEnabled()) then
            ([], []), (0, 0)
        else
            let scopes = scopeDebugInfo.Values |> Seq.toList
            let deps = dependencyDebugInfo.Values |> Seq.toList
            (scopes, deps), (scopeDebugInfo.Count, dependencyDebugInfo.Count)

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
    let isNull (value: 'a) : bool =
        match box value with
        | null -> true
        | _ -> false

    let at<'a> ( _now: NowType) (timeline: Timeline<'a>) : 'a =
        timeline._last

    let define<'a> (_now: NowType) (value: 'a) (timeline: Timeline<'a>) : unit =
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

    let map<'a, 'b> (f: 'a -> 'b) (timelineA: Timeline<'a>) : Timeline<'b> =
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

    let nMap<'a, 'b> (f: 'a -> 'b) (timelineA: Timeline<'a>) : Timeline<'b> =
        let currentValueA = timelineA |> at Now
        let initialB =
            if isNull currentValueA then
                Unchecked.defaultof<'b>
            else
                try
                    f currentValueA
                with
                | ex ->
                    handleCallbackError System.Guid.Empty MapFunction ex (Some (box currentValueA))
                    Unchecked.defaultof<'b>

        let timelineB = Timeline initialB
        let reactionFn : 'a -> unit =
            fun valueA ->
                try
                    let newValueB =
                        if isNull valueA then
                            Unchecked.defaultof<'b>
                        else
                            f valueA
                    timelineB |> define Now newValueB
                with
                | ex ->
                    handleCallbackError System.Guid.Empty MapFunction ex (Some (box valueA))
                    timelineB |> define Now Unchecked.defaultof<'b>

        DependencyCore.registerDependency timelineA._id timelineB._id (reactionFn :> obj) None None |> ignore
        timelineB

    let bind<'a, 'b> (monadf: 'a -> Timeline<'b>) (timelineA: Timeline<'a>) : Timeline<'b> =
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

    let nBind<'a, 'b> (monadf: 'a -> Timeline<'b>) (timelineA: Timeline<'a>) : Timeline<'b> =
        let initialValueA = timelineA |> at Now
        let initialInnerTimeline =
            if isNull initialValueA then
                Timeline Unchecked.defaultof<'b>
            else
                try
                    monadf initialValueA
                with
                | ex ->
                    handleCallbackError System.Guid.Empty BindTransition ex (Some (box initialValueA))
                    Timeline Unchecked.defaultof<'b>

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
                            Timeline Unchecked.defaultof<'b>
                        else
                            monadf valueA
                    timelineB |> define Now (newInnerTimeline |> at Now)
                    setUpInnerReaction newInnerTimeline currentScopeId
                with
                | ex ->
                    handleCallbackError System.Guid.Empty BindTransition ex (Some (box valueA))
                    let fallbackTimeline = Timeline Unchecked.defaultof<'b>
                    timelineB |> define Now Unchecked.defaultof<'b>
                    setUpInnerReaction fallbackTimeline currentScopeId

        DependencyCore.registerDependency timelineA._id timelineB._id (reactionFnAtoB :> obj) None None |> ignore
        timelineB

    let link<'a> (targetTimeline: Timeline<'a>) (sourceTimeline: Timeline<'a>) : unit =
        let reactionFn value = targetTimeline |> define Now value
        DependencyCore.registerDependency sourceTimeline._id targetTimeline._id (reactionFn :> obj) None None |> ignore
        reactionFn (sourceTimeline |> at Now)

    let scan<'state, 'input> (accumulator: 'state -> 'input -> 'state) (initialState: 'state) (sourceTimeline: Timeline<'input>) : Timeline<'state> =
        let stateTimeline = Timeline initialState
        let reactionFn input =
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

    let distinctUntilChanged<'a when 'a : equality> (sourceTimeline: Timeline<'a>) : Timeline<'a> =
        let resultTimeline = Timeline (sourceTimeline |> at Now)
        let mutable lastValue = sourceTimeline |> at Now
        let reactionFn currentValue =
            if currentValue <> lastValue then
                lastValue <- currentValue
                resultTimeline |> define Now currentValue

        DependencyCore.registerDependency sourceTimeline._id resultTimeline._id (reactionFn :> obj) None None |> ignore
        resultTimeline

    let using<'a, 'b when 'b: null> (resourceFactory: ResourceFactory<'a, 'b>) (sourceTimeline: Timeline<'a>) : Timeline<'b> =
        let resultTimeline = Timeline (Unchecked.defaultof<'b>)
        let mutable currentScopeIdOpt: ScopeId option = None

        let reactionFn (value: 'a) : unit =
            try
                currentScopeIdOpt |> Option.iter DependencyCore.disposeScope
                let newScopeId = DependencyCore.createScope (Some sourceTimeline._id)
                currentScopeIdOpt <- Some newScopeId
                let resourceData = resourceFactory value

                if not (isNull resourceData) then
                    resultTimeline |> define Now resourceData.Resource
                    DependencyCore.registerDependency
                        sourceTimeline._id
                        resultTimeline._id
                        (fun (_:obj) -> () :> obj)
                        (Some newScopeId)
                        (Some resourceData.Cleanup)
                    |> ignore
                else
                    resultTimeline |> define Now (Unchecked.defaultof<'b>)
            with
            | ex ->
                handleCallbackError System.Guid.Empty UsingFunction ex (Some (box value))
                resultTimeline |> define Now (Unchecked.defaultof<'b>)

        let mainReactionFn (v: 'a) = reactionFn v
        DependencyCore.registerDependency sourceTimeline._id resultTimeline._id (mainReactionFn :> obj) None None |> ignore
        reactionFn (sourceTimeline |> at Now)
        resultTimeline

    // ############ 変更範囲 START ############

    let nUsing<'a, 'b when 'b: null> (resourceFactory: 'a -> Resource<'b>) (sourceTimeline: Timeline<'a>) : Timeline<'b> =
        let wrappedFactory (value: 'a) : Resource<'b> =
            if isNull value then
                Unchecked.defaultof<Resource<'b>> // 修正: 'b 型ではなく Resource<'b> 型のデフォルト値を返す
            else
                resourceFactory value
        using wrappedFactory sourceTimeline

    let combineLatestWith<'a, 'b, 'c> (f: 'a -> 'b -> 'c) (timelineA: Timeline<'a>) (timelineB: Timeline<'b>) : Timeline<'c> =
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
        let mutable latestA = initialA
        let mutable latestB = initialB

        let reactionA newA =
            latestA <- newA
            try
                resultTimeline |> define Now (f latestA latestB)
            with ex -> handleCallbackError System.Guid.Empty CombineReactionA ex (Some (box newA))

        let reactionB newB =
            latestB <- newB
            try
                resultTimeline |> define Now (f latestA latestB)
            with ex -> handleCallbackError System.Guid.Empty CombineReactionB ex (Some (box newB))

        DependencyCore.registerDependency timelineA._id resultTimeline._id (reactionA :> obj) None None |> ignore
        DependencyCore.registerDependency timelineB._id resultTimeline._id (reactionB :> obj) None None |> ignore

        resultTimeline

    let nCombineLatestWith<'a, 'b, 'c> (f: 'a -> 'b -> 'c) (timelineA: Timeline<'a>) (timelineB: Timeline<'b>) : Timeline<'c> =
        let initialA = timelineA |> at Now
        let initialB = timelineB |> at Now
        let initialResult =
            try
                f initialA initialB
            with
            | ex ->
                handleCallbackError System.Guid.Empty CombineInitial ex (Some (box (initialA, initialB)))
                Unchecked.defaultof<'c>

        let resultTimeline = Timeline initialResult
        let mutable latestA = initialA
        let mutable latestB = initialB

        let reactionA newA =
            latestA <- newA
            let newResult =
                try f newA latestB with ex -> handleCallbackError System.Guid.Empty CombineReactionA ex (Some (box newA)); Unchecked.defaultof<'c>
            resultTimeline |> define Now newResult

        let reactionB newB =
            latestB <- newB
            let newResult =
                try f latestA newB with ex -> handleCallbackError System.Guid.Empty CombineReactionB ex (Some (box newB)); Unchecked.defaultof<'c>
            resultTimeline |> define Now newResult

        DependencyCore.registerDependency timelineA._id resultTimeline._id (reactionA :> obj) None None |> ignore
        DependencyCore.registerDependency timelineB._id resultTimeline._id (reactionB :> obj) None None |> ignore

        resultTimeline

    let ID<'a> (a: 'a) : Timeline<'a> =
        Timeline a

    let inline (>>>) (f: 'a -> Timeline<'b>) (g: 'b -> Timeline<'c>) : ('a -> Timeline<'c>) =
        fun a ->
            let timelineFromF = f a
            timelineFromF |> bind g

    let FalseTimeline : Timeline<bool> = Timeline false
    let TrueTimeline : Timeline<bool> = Timeline true

    let Or (timelineA: Timeline<bool>) (timelineB: Timeline<bool>) : Timeline<bool> =
        combineLatestWith (||) timelineA timelineB

    let And (timelineA: Timeline<bool>) (timelineB: Timeline<bool>) : Timeline<bool> =
        combineLatestWith (&&) timelineA timelineB

    let any (booleanTimelines: list<Timeline<bool>>) : Timeline<bool> =
        List.fold Or FalseTimeline booleanTimelines

    let all (booleanTimelines: list<Timeline<bool>>) : Timeline<bool> =
        List.fold And TrueTimeline booleanTimelines

    // --- Composition Functions Section ---

    // --- N-ary Operations ---
    // 修正: 型シグネチャをより正確に
    let combineLatest<'a, 'r> (combiner: list<'a> -> 'r) (timelines: list<Timeline<'a>>) : Timeline<'r> =
        if List.isEmpty timelines then
            Timeline (combiner [])
        else
            let arrayTimeline =
                timelines
                |> List.map (map (fun v -> [v]))
                |> List.reduce (combineLatestWith (fun listA listB -> List.append listA listB))

            arrayTimeline |> map combiner

    // --- Level 3: Generic folding ---
    let foldTimelines<'a, 'b> (accumulator: Timeline<'b> -> Timeline<'a> -> Timeline<'b>) (initialState: Timeline<'b>) (timelines: list<Timeline<'a>>) : Timeline<'b> =
        List.fold accumulator initialState timelines

    // --- Level 2 & 4: High-level helper functions ---
    let sumOf (numberTimelines: list<Timeline<float>>) : Timeline<float> =
        let addOf (t1: Timeline<float>) (t2: Timeline<float>) = combineLatestWith (+) t1 t2
        foldTimelines addOf (Timeline 0.0) numberTimelines

    let maxOf (numberTimelines: list<Timeline<float>>) : Timeline<float> =
        let maxOf2 (t1: Timeline<float>) (t2: Timeline<float>) = combineLatestWith max t1 t2
        foldTimelines maxOf2 (Timeline System.Double.NegativeInfinity) numberTimelines

    let minOf (numberTimelines: list<Timeline<float>>) : Timeline<float> =
        let minOf2 (t1: Timeline<float>) (t2: Timeline<float>) = combineLatestWith min t1 t2
        foldTimelines minOf2 (Timeline System.Double.PositiveInfinity) numberTimelines

    let averageOf (numberTimelines: list<Timeline<float>>) : Timeline<float> =
        if List.isEmpty numberTimelines then
            Timeline 0.0
        else
            sumOf numberTimelines
            |> map (fun sum -> sum / (float numberTimelines.Length))

    let listOf<'a> (timelines: list<Timeline<'a>>) : Timeline<list<'a>> =
        let concatOf (acc: Timeline<list<'a>>) (curr: Timeline<'a>) =
            combineLatestWith (fun list item -> List.append list [item]) acc curr
        foldTimelines concatOf (Timeline []) timelines

    // --- Nullable version of applied functions ---
    // 修正: このセクション全体を、box化/unbox化を避け、型安全な方法に書き換え

    let nSumOf (numberTimelines: list<Timeline<System.Nullable<float>>>) : Timeline<System.Nullable<float>> =
        let nAddOf (acc: Timeline<System.Nullable<float>>) (curr: Timeline<System.Nullable<float>>) =
            nCombineLatestWith (fun (a: System.Nullable<float>) (b: System.Nullable<float>) -> if a.HasValue && b.HasValue then System.Nullable(a.Value + b.Value) else System.Nullable()) acc curr
        foldTimelines nAddOf (Timeline(System.Nullable 0.0)) numberTimelines

    let nMaxOf (numberTimelines: list<Timeline<System.Nullable<float>>>) : Timeline<System.Nullable<float>> =
        let nMaxOf2 (acc: Timeline<System.Nullable<float>>) (curr: Timeline<System.Nullable<float>>) =
            nCombineLatestWith (fun (a: System.Nullable<float>) (b: System.Nullable<float>) ->
                if a.HasValue && b.HasValue then System.Nullable(max a.Value b.Value)
                else if a.HasValue then a
                else b) acc curr
        foldTimelines nMaxOf2 (Timeline(System.Nullable System.Double.NegativeInfinity)) numberTimelines

    let nMinOf (numberTimelines: list<Timeline<System.Nullable<float>>>) : Timeline<System.Nullable<float>> =
        let nMinOf2 (acc: Timeline<System.Nullable<float>>) (curr: Timeline<System.Nullable<float>>) =
            nCombineLatestWith (fun (a: System.Nullable<float>) (b: System.Nullable<float>) ->
                if a.HasValue && b.HasValue then System.Nullable(min a.Value b.Value)
                else if a.HasValue then a
                else b) acc curr
        foldTimelines nMinOf2 (Timeline(System.Nullable System.Double.PositiveInfinity)) numberTimelines

    let nAverageOf (numberTimelines: list<Timeline<System.Nullable<float>>>) : Timeline<System.Nullable<float>> =
        if List.isEmpty numberTimelines then
            Timeline(System.Nullable()) // null を返す
        else
            let sumTimeline = nSumOf numberTimelines
            sumTimeline |> nMap (fun sum ->
                if sum.HasValue then System.Nullable(sum.Value / (float numberTimelines.Length))
                else System.Nullable()
            )
    // `nListOf` のためのアキュムレータ関数
    let private nConcatOf<'a when 'a : null> (accTimeline: Timeline<ResizeArray<'a>>) (currTimeline: Timeline<'a>) : Timeline<ResizeArray<'a>> =
        nCombineLatestWith (fun (arr: ResizeArray<'a>) (item: 'a) ->
            let newArr = ResizeArray(arr) // 不変性を保つため防衛的コピー
            newArr.Add(item)
            newArr
        ) accTimeline currTimeline

    // `null` を扱える `ResizeArray<'a>` を返すように変更
    let nListOf<'a when 'a : null> (timelines: list<Timeline<'a>>) : Timeline<ResizeArray<'a>> =
        // 初期状態: `null` ではない空の ResizeArray
        let initialTimeline = Timeline(ResizeArray<'a>())
        // fold を使って畳み込み
        foldTimelines nConcatOf initialTimeline timelines

    // ############ 変更範囲 END ############

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