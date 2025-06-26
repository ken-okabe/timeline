module Timeline

// --- Now Type Definition ---
type NowType = NOW of string
let Now = NOW "Conceptual time coordinate"

// --- Core System Abstractions ---
type TimelineId = System.Guid
type DependencyId = System.Guid
type ScopeId = System.Guid

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

// --- Improved Dependency Details ---
type internal DependencyDetails =
    { SourceId: TimelineId
      TargetId: TimelineId
      Callback: obj // Still obj for practical reasons, but with better error handling
      ScopeId: ScopeId option
    }

// --- Enhanced Dependency Management Core ---
module internal DependencyCore =
    let private dependencies = System.Collections.Generic.Dictionary<DependencyId, DependencyDetails>()
    let private sourceIndex = System.Collections.Generic.Dictionary<TimelineId, System.Collections.Generic.HashSet<DependencyId>>()
    let private scopeIndex = System.Collections.Generic.Dictionary<ScopeId, System.Collections.Generic.HashSet<DependencyId>>()

    let private addToHashSetDict<'K, 'V when 'K : equality and 'V : equality> : System.Collections.Generic.Dictionary<'K, System.Collections.Generic.HashSet<'V>> -> 'K -> 'V -> unit =
        fun dict key value ->
            match dict.TryGetValue(key) with
            | true, hashSet -> hashSet.Add(value) |> ignore
            | false, _ ->
                let newHashSet = System.Collections.Generic.HashSet<'V>()
                newHashSet.Add(value) |> ignore
                dict.Add(key, newHashSet)

    let private removeFromHashSetDict<'K, 'V when 'K : equality and 'V : equality> : System.Collections.Generic.Dictionary<'K, System.Collections.Generic.HashSet<'V>> -> 'K -> 'V -> unit =
        fun dict key value ->
            match dict.TryGetValue(key) with
            | true, hashSet ->
                hashSet.Remove(value) |> ignore
                if hashSet.Count = 0 then
                    dict.Remove(key) |> ignore
            | false, _ -> ()

    let generateTimelineId : unit -> TimelineId =
        fun () -> System.Guid.NewGuid()

    let createScope : unit -> ScopeId =
        fun () -> System.Guid.NewGuid()

    let registerDependency : TimelineId -> TimelineId -> obj -> ScopeId option -> DependencyId =
        fun sourceId targetId callback scopeIdOpt ->
            let depId = System.Guid.NewGuid()
            let details = { SourceId = sourceId; TargetId = targetId; Callback = callback; ScopeId = scopeIdOpt }
            dependencies.Add(depId, details)
            addToHashSetDict sourceIndex sourceId depId
            match scopeIdOpt with
            | Some sId -> addToHashSetDict scopeIndex sId depId
            | None -> ()
            depId

    let removeDependency : DependencyId -> unit =
        fun depId ->
            match dependencies.TryGetValue(depId) with
            | true, details ->
                dependencies.Remove(depId) |> ignore
                removeFromHashSetDict sourceIndex details.SourceId depId
                match details.ScopeId with
                | Some sId -> removeFromHashSetDict scopeIndex sId depId
                | None -> ()
            | false, _ -> ()

    // --- FIXED: Improved disposeScope implementation ---
    let disposeScope : ScopeId -> unit =
        fun scopeId ->
            match scopeIndex.TryGetValue(scopeId) with
            | true, depIds ->
                // Create a copy to avoid modification during iteration
                let idsToRemove = depIds |> Array.ofSeq
                // Remove scope from index first to prevent inconsistencies
                scopeIndex.Remove(scopeId) |> ignore
                // Then remove all dependencies
                idsToRemove |> Array.iter removeDependency
            | false, _ -> ()

    let getCallbacks : TimelineId -> list<DependencyId * obj> =
        fun sourceId ->
            match sourceIndex.TryGetValue(sourceId) with
            | true, depIds ->
                depIds
                |> Seq.choose (fun depId ->
                    match dependencies.TryGetValue(depId) with
                    | true, details -> Some (depId, details.Callback)
                    | false, _ -> None)
                |> List.ofSeq
            | false, _ -> List.empty

// --- Timeline Type Definition ---
type Timeline<'a> =
    private
        { _id: TimelineId
          mutable _last: 'a }

// --- Timeline Factory Function ---
let Timeline<'a> : 'a -> Timeline<'a> =
    fun initialValue ->
        let newId = DependencyCore.generateTimelineId()
        { _id = newId; _last = initialValue }

// --- Enhanced Timeline Operations Module ---
module TL =
    let isNull (value: 'a) : bool =
        match box value with
        | null -> true
        | _ -> false

    let at<'a> : NowType -> Timeline<'a> -> 'a =
        fun _now timeline ->
            timeline._last

    // --- IMPROVED: Enhanced define with better error handling ---
    let define<'a> : NowType -> 'a -> Timeline<'a> -> unit =
        fun _now value timeline ->
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

    // --- IMPROVED: Enhanced map with better error handling ---
    let map<'a, 'b> : ('a -> 'b) -> Timeline<'a> -> Timeline<'b> =
        fun f timelineA ->
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

            DependencyCore.registerDependency timelineA._id timelineB._id (reactionFn :> obj) None |> ignore
            timelineB

    // --- IMPROVED: Enhanced nMap with better null handling ---
    let nMap<'a, 'b> : ('a -> 'b) -> Timeline<'a> -> Timeline<'b> =
        fun f timelineA ->
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

            DependencyCore.registerDependency timelineA._id timelineB._id (reactionFn :> obj) None |> ignore
            timelineB

    // --- IMPROVED: Enhanced bind with better scope management ---
    let bind<'a, 'b> : ('a -> Timeline<'b>) -> Timeline<'a> -> Timeline<'b> =
        fun monadf timelineA ->
            let initialInnerTimeline = monadf (timelineA |> at Now)
            let timelineB = Timeline (initialInnerTimeline |> at Now)
            let mutable currentScopeId : ScopeId = DependencyCore.createScope()

            let setUpInnerReaction (innerTimeline: Timeline<'b>) (scopeForInner: ScopeId) : unit =
                let reactionFnInnerToB : 'b -> unit =
                    fun valueInner ->
                        if currentScopeId = scopeForInner then
                            timelineB |> define Now valueInner
                        // No warning for scope mismatch - expected during transitions

                DependencyCore.registerDependency innerTimeline._id timelineB._id (reactionFnInnerToB :> obj) (Some scopeForInner) |> ignore

            setUpInnerReaction initialInnerTimeline currentScopeId

            let reactionFnAtoB : 'a -> unit =
                fun valueA ->
                    try
                        // Clean scope management
                        DependencyCore.disposeScope currentScopeId
                        currentScopeId <- DependencyCore.createScope()
                        let newInnerTimeline = monadf valueA
                        timelineB |> define Now (newInnerTimeline |> at Now)
                        setUpInnerReaction newInnerTimeline currentScopeId
                    with
                    | ex ->
                        handleCallbackError System.Guid.Empty BindTransition ex (Some (box valueA))

            DependencyCore.registerDependency timelineA._id timelineB._id (reactionFnAtoB :> obj) None |> ignore
            timelineB

    // --- IMPROVED: Enhanced nBind with better null handling ---
    let nBind<'a, 'b> : ('a -> Timeline<'b>) -> Timeline<'a> -> Timeline<'b> =
        fun monadf timelineA ->
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
            let mutable currentScopeId : ScopeId = DependencyCore.createScope()

            let setUpInnerReaction (innerTimeline: Timeline<'b>) (scopeForInner: ScopeId) : unit =
                let reactionFnInnerToB : 'b -> unit =
                    fun valueInner ->
                        if currentScopeId = scopeForInner then
                            timelineB |> define Now valueInner

                DependencyCore.registerDependency innerTimeline._id timelineB._id (reactionFnInnerToB :> obj) (Some scopeForInner) |> ignore

            setUpInnerReaction initialInnerTimeline currentScopeId

            let reactionFnAtoB : 'a -> unit =
                fun valueA ->
                    try
                        DependencyCore.disposeScope currentScopeId
                        currentScopeId <- DependencyCore.createScope()
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
                        // On error, create a null timeline to maintain consistency
                        let fallbackTimeline = Timeline Unchecked.defaultof<'b>
                        timelineB |> define Now Unchecked.defaultof<'b>
                        setUpInnerReaction fallbackTimeline currentScopeId

            DependencyCore.registerDependency timelineA._id timelineB._id (reactionFnAtoB :> obj) None |> ignore
            timelineB

    let link<'a> : Timeline<'a> -> Timeline<'a> -> unit =
        fun targetTimeline sourceTimeline ->
            sourceTimeline
            |> map (fun value ->
                targetTimeline |> define Now value
            )
            |> ignore

    // --- IMPROVED: Enhanced scan with better error handling ---
    let scan<'state, 'input> (accumulator: 'state -> 'input -> 'state) (initialState: 'state) (sourceTimeline: Timeline<'input>) : Timeline<'state> =
        let stateTimeline = Timeline initialState

        sourceTimeline
        |> map (fun input ->
            try
                let currentState = stateTimeline |> at Now
                let newState = accumulator currentState input
                stateTimeline |> define Now newState
            with
            | ex ->
                handleCallbackError System.Guid.Empty ScanAccumulator ex (Some (box input))
        )
        |> ignore

        stateTimeline

    let distinctUntilChanged<'a when 'a : equality> (sourceTimeline: Timeline<'a>) : Timeline<'a> =
        let initialValue = sourceTimeline |> at Now
        let resultTimeline = Timeline initialValue
        let lastPropagatedTimeline = Timeline initialValue

        sourceTimeline
        |> map (fun currentValue ->
            let lastPropagatedValue = lastPropagatedTimeline |> at Now
            if currentValue <> lastPropagatedValue then
                lastPropagatedTimeline |> define Now currentValue
                resultTimeline |> define Now currentValue
        )
        |> ignore

        resultTimeline

    // --- IMPROVED: Enhanced combineLatestWith with better error handling ---
    let combineLatestWith<'a, 'b, 'c> : ('a -> 'b -> 'c) -> Timeline<'a> -> Timeline<'b> -> Timeline<'c> =
        fun f timelineA timelineB ->
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

            timelineA
            |> map (fun newA ->
                try
                    let latestB = timelineB |> at Now
                    resultTimeline |> define Now (f newA latestB)
                with
                | ex ->
                    handleCallbackError System.Guid.Empty CombineReactionA ex (Some (box newA))
            )
            |> ignore

            timelineB
            |> map (fun newB ->
                try
                    let latestA = timelineA |> at Now
                    resultTimeline |> define Now (f latestA newB)
                with
                | ex ->
                    handleCallbackError System.Guid.Empty CombineReactionB ex (Some (box newB))
            )
            |> ignore

            resultTimeline

    // --- IMPROVED: Enhanced nCombineLatestWith ---
    let nCombineLatestWith<'a, 'b, 'c> : ('a -> 'b -> 'c) -> Timeline<'a> -> Timeline<'b> -> Timeline<'c> =
        fun f timelineA timelineB ->
            let initialA = timelineA |> at Now
            let initialB = timelineB |> at Now
            let initialResult =
                if isNull initialA || isNull initialB then
                    Unchecked.defaultof<'c>
                else
                    try
                        f initialA initialB
                    with
                    | ex ->
                        handleCallbackError System.Guid.Empty CombineInitial ex (Some (box (initialA, initialB)))
                        Unchecked.defaultof<'c>

            let resultTimeline = Timeline initialResult

            timelineA
            |> map (fun newA ->
                let latestB = timelineB |> at Now
                let newResult =
                    if isNull newA || isNull latestB then
                        Unchecked.defaultof<'c>
                    else
                        try
                            f newA latestB
                        with
                        | ex ->
                            handleCallbackError System.Guid.Empty CombineReactionA ex (Some (box newA))
                            Unchecked.defaultof<'c>
                resultTimeline |> define Now newResult
            )
            |> ignore

            timelineB
            |> map (fun newB ->
                let latestA = timelineA |> at Now
                let newResult =
                    if isNull latestA || isNull newB then
                        Unchecked.defaultof<'c>
                    else
                        try
                            f latestA newB
                        with
                        | ex ->
                            handleCallbackError System.Guid.Empty CombineReactionB ex (Some (box newB))
                            Unchecked.defaultof<'c>
                resultTimeline |> define Now newResult
            )
            |> ignore

            resultTimeline

    let ID<'a> : 'a -> Timeline<'a> =
        fun a -> Timeline a

    let inline (>>>) (f: 'a -> Timeline<'b>) (g: 'b -> Timeline<'c>) : ('a -> Timeline<'c>) =
        fun a ->
            let timelineFromF = f a
            timelineFromF |> bind g

    let FalseTimeline : Timeline<bool> = Timeline false
    let TrueTimeline : Timeline<bool> = Timeline true

    let Or (timelineA: Timeline<bool>) (timelineB: Timeline<bool>) : Timeline<bool> =
        nCombineLatestWith (||) timelineA timelineB

    let And (timelineA: Timeline<bool>) (timelineB: Timeline<bool>) : Timeline<bool> =
        nCombineLatestWith (&&) timelineA timelineB

    let any (booleanTimelines: list<Timeline<bool>>) : Timeline<bool> =
        List.fold Or FalseTimeline booleanTimelines

    let all (booleanTimelines: list<Timeline<bool>>) : Timeline<bool> =
        List.fold And TrueTimeline booleanTimelines