module Timeline

// --- Now Type Definition ---
type NowType = NOW of string
let Now = NOW "Conceptual time coordinate"

// --- Core System Abstractions ---
type TimelineId = System.Guid
type DependencyId = System.Guid
type ScopeId = System.Guid

type internal DependencyDetails =
    { SourceId: TimelineId
      TargetId: TimelineId
      Callback: obj
      ScopeId: ScopeId option
    }

// --- Dependency Management Core ---
module internal DependencyCore =
    let private dependencies = System.Collections.Generic.Dictionary<DependencyId, DependencyDetails>()
    let private sourceIndex = System.Collections.Generic.Dictionary<TimelineId, System.Collections.Generic.List<DependencyId>>()
    let private scopeIndex = System.Collections.Generic.Dictionary<ScopeId, System.Collections.Generic.List<DependencyId>>()

    let private addToListDict<'K, 'V when 'K : equality> : System.Collections.Generic.Dictionary<'K, System.Collections.Generic.List<'V>> -> 'K -> 'V -> unit =
        fun dict key value ->
            match dict.TryGetValue(key) with
            | true, list -> list.Add(value)
            | false, _ ->
                let newList = System.Collections.Generic.List<'V>()
                newList.Add(value)
                dict.Add(key, newList)

    let private removeFromListDict<'K, 'V when 'K : equality> : System.Collections.Generic.Dictionary<'K, System.Collections.Generic.List<'V>> -> 'K -> 'V -> unit =
        fun dict key value ->
            match dict.TryGetValue(key) with
            | true, list ->
                list.Remove(value) |> ignore
                if list.Count = 0 then
                    dict.Remove(key) |> ignore
            | false, _ -> ()

    let generateTimelineId : unit -> TimelineId =
        fun () ->
            System.Guid.NewGuid()

    let createScope : unit -> ScopeId =
        fun () ->
            System.Guid.NewGuid()

    let registerDependency : TimelineId -> TimelineId -> obj -> ScopeId option -> DependencyId =
        fun sourceId targetId callback scopeIdOpt ->
            let depId = System.Guid.NewGuid()
            let details = { SourceId = sourceId; TargetId = targetId; Callback = callback; ScopeId = scopeIdOpt }
            dependencies.Add(depId, details)
            addToListDict sourceIndex sourceId depId
            match scopeIdOpt with
            | Some sId -> addToListDict scopeIndex sId depId
            | None -> ()
            depId

    let removeDependency : DependencyId -> unit =
        fun depId ->
            match dependencies.TryGetValue(depId) with
            | true, details ->
                dependencies.Remove(depId) |> ignore
                removeFromListDict sourceIndex details.SourceId depId
                match details.ScopeId with
                | Some sId -> removeFromListDict scopeIndex sId depId
                | None -> ()
            | false, _ -> ()

    // Updated disposeScope logic
    let disposeScope : ScopeId -> unit =
        fun scopeId ->
            match scopeIndex.TryGetValue(scopeId) with
            | true, depIds ->
                let idsToRemove = depIds |> List.ofSeq // Avoid modifying collection while iterating
                idsToRemove |> List.iter removeDependency // removeDependency might modify scopeIndex

                // Re-check the scope's status in scopeIndex after all removeDependency calls
                match scopeIndex.TryGetValue(scopeId) with
                | true, remainingDepsInScopeList ->
                    if remainingDepsInScopeList.Count = 0 then
                        // If the scope still exists and its list is now empty, remove the scope itself
                        scopeIndex.Remove(scopeId) |> ignore
                    // else: If list is not empty (should not happen if all deps were in idsToRemove), do nothing.
                | false, _ -> () // Key no longer exists, already removed by removeDependency (via removeFromListDict)
            | false, _ -> () // ScopeId did not exist in scopeIndex initially

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

// --- Global Helper ---

// --- Core Timeline Operations Module ---
module TL =
    let isNull (value: 'a) : bool =
        match box value with
        | null -> true
        | _ -> false

    let at<'a> : NowType -> Timeline<'a> -> 'a =
        fun _now timeline ->
            timeline._last

    let define<'a> : NowType -> 'a -> Timeline<'a> -> unit =
        fun _now value timeline ->
            timeline._last <- value
            let callbacks = timeline._id |> DependencyCore.getCallbacks
            callbacks
            |> List.iter (fun (depId, callbackObj) ->
                try
                    if callbackObj = null then
                        printfn "Warning: Callback object is null for DependencyId %A" depId
                    else
                        try
                            let callback = callbackObj :?> ('a -> unit)
                            callback value
                        with
                        | ex ->
                            printfn "Error/Warning during callback for DependencyId %A. Input value (%%A): %A. JS Error: %s" depId value ex.Message
                with
                | ex ->
                    printfn "Unexpected error during callback iteration for DependencyId %A: %s" depId ex.Message
            )
    // Raw version: passes null to f if timelineA holds null
    let map<'a, 'b> : ('a -> 'b) -> Timeline<'a> -> Timeline<'b> =
        fun f timelineA ->
            let initialB = f (timelineA |> at Now)
            let timelineB = Timeline initialB
            let reactionFn : 'a -> unit =
                fun valueA ->
                    let newValueB = f valueA
                    timelineB |> define Now newValueB
            DependencyCore.registerDependency timelineA._id timelineB._id (reactionFn :> obj) None |> ignore
            timelineB

    // Nullable-aware version: f is not called if timelineA holds null; resultTimeline holds defaultof<'b>
    let nMap<'a, 'b> : ('a -> 'b) -> Timeline<'a> -> Timeline<'b> =
        fun f timelineA ->
            let currentValueA = timelineA |> at Now
            let initialB =
                if isNull currentValueA then
                    Unchecked.defaultof<'b>
                else
                    f currentValueA
            let timelineB = Timeline initialB
            let reactionFn : 'a -> unit =
                fun valueA ->
                    let newValueB =
                        if isNull valueA then
                            Unchecked.defaultof<'b>
                        else
                            f valueA
                    timelineB |> define Now newValueB
            DependencyCore.registerDependency timelineA._id timelineB._id (reactionFn :> obj) None |> ignore
            timelineB

    // Raw version: passes null to monadf if timelineA holds null
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
                DependencyCore.registerDependency innerTimeline._id timelineB._id (reactionFnInnerToB :> obj) (Some scopeForInner) |> ignore

            setUpInnerReaction initialInnerTimeline currentScopeId

            let reactionFnAtoB : 'a -> unit =
                fun valueA ->
                    DependencyCore.disposeScope currentScopeId
                    let newScope = DependencyCore.createScope()
                    currentScopeId <- newScope
                    let newInnerTimeline = monadf valueA
                    timelineB |> define Now (newInnerTimeline |> at Now)
                    setUpInnerReaction newInnerTimeline newScope
            DependencyCore.registerDependency timelineA._id timelineB._id (reactionFnAtoB :> obj) None |> ignore
            timelineB

    // Nullable-aware version: monadf is not called if timelineA holds null;
    // resultTimeline holds Timeline (Unchecked.defaultof<'b>)
    let nBind<'a, 'b> : ('a -> Timeline<'b>) -> Timeline<'a> -> Timeline<'b> =
        fun monadf timelineA ->
            let initialValueA = timelineA |> at Now
            let initialInnerTimeline =
                if isNull initialValueA then
                    Timeline (Unchecked.defaultof<'b>)
                else
                    monadf initialValueA

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
                    DependencyCore.disposeScope currentScopeId
                    let newScope = DependencyCore.createScope()
                    currentScopeId <- newScope
                    let newInnerTimeline =
                        if isNull valueA then
                            Timeline (Unchecked.defaultof<'b>)
                        else
                            monadf valueA
                    timelineB |> define Now (newInnerTimeline |> at Now)
                    setUpInnerReaction newInnerTimeline newScope
            DependencyCore.registerDependency timelineA._id timelineB._id (reactionFnAtoB :> obj) None |> ignore
            timelineB

    // Raw version: f is called even if latestA or latestB is null
    let combineLatestWith<'a, 'b, 'c> : ('a -> 'b -> 'c) -> Timeline<'b> -> Timeline<'a> -> Timeline<'c> =
        fun f timelineB timelineA ->
            let mutable latestA = timelineA |> at Now
            let mutable latestB = timelineB |> at Now

            let resultTimeline = Timeline (f latestA latestB)

            let reactionA (valA: 'a) : unit =
                latestA <- valA
                resultTimeline |> define Now (f latestA latestB)
            DependencyCore.registerDependency timelineA._id resultTimeline._id (reactionA :> obj) None |> ignore

            let reactionB (valB: 'b) : unit =
                latestB <- valB
                resultTimeline |> define Now (f latestA latestB)
            DependencyCore.registerDependency timelineB._id resultTimeline._id (reactionB :> obj) None |> ignore
            resultTimeline

    // Nullable-aware version (original combineLatestWith behavior)
    let nCombineLatestWith<'a, 'b, 'c> : ('a -> 'b -> 'c) -> Timeline<'b> -> Timeline<'a> -> Timeline<'c> =
        fun f timelineB timelineA ->
            let mutable latestA = timelineA |> at Now
            let mutable latestB = timelineB |> at Now

            let calculateCombinedValue () =
                if isNull latestA || isNull latestB then
                    Unchecked.defaultof<'c>
                else
                    f latestA latestB

            let resultTimeline = Timeline (calculateCombinedValue())

            let reactionA (valA: 'a) : unit =
                latestA <- valA
                resultTimeline |> define Now (calculateCombinedValue())
            DependencyCore.registerDependency timelineA._id resultTimeline._id (reactionA :> obj) None |> ignore

            let reactionB (valB: 'b) : unit =
                latestB <- valB
                resultTimeline |> define Now (calculateCombinedValue())
            DependencyCore.registerDependency timelineB._id resultTimeline._id (reactionB :> obj) None |> ignore
            resultTimeline

    // Other fundamental operations
    let link<'a> : Timeline<'a> -> Timeline<'a> -> unit =
        fun targetTimeline sourceTimeline ->
            let reactionFn : 'a -> unit =
                fun value ->
                    targetTimeline |> define Now value
            DependencyCore.registerDependency sourceTimeline._id targetTimeline._id (reactionFn :> obj) None |> ignore
            targetTimeline |> define Now (sourceTimeline |> at Now)

    let ID<'a> : 'a -> Timeline<'a> =
        fun a ->
            Timeline a

    let inline (>>>) (f: 'a -> Timeline<'b>) (g: 'b -> Timeline<'c>) : ('a -> Timeline<'c>) =
        fun a ->
            let timelineFromF = f a
            timelineFromF |> bind g // Uses the raw bind

    let distinctUntilChanged<'a when 'a : equality> : Timeline<'a> -> Timeline<'a> =
        fun sourceTimeline ->
            let initialValue = sourceTimeline |> at Now
            let resultTimeline = Timeline initialValue
            let mutable lastPropagatedValueByResult = initialValue

            let reactionFn (newValueFromSource: 'a) : unit =
                if newValueFromSource <> lastPropagatedValueByResult then
                    lastPropagatedValueByResult <- newValueFromSource
                    resultTimeline |> define Now newValueFromSource
            DependencyCore.registerDependency sourceTimeline._id resultTimeline._id (reactionFn :> obj) None |> ignore
            resultTimeline

    // Logical operations and constants
    let FalseTimeline : Timeline<bool> = Timeline false
    let TrueTimeline : Timeline<bool> = Timeline true

    // Or and And use nCombineLatestWith for robust boolean logic
    let Or : Timeline<bool> -> Timeline<bool> -> Timeline<bool> =
        fun timelineB timelineA ->
            timelineA |> nCombineLatestWith (||) timelineB

    let And : Timeline<bool> -> Timeline<bool> -> Timeline<bool> =
        fun timelineB timelineA ->
            timelineA |> nCombineLatestWith (&&) timelineB

    let any : list<Timeline<bool>> -> Timeline<bool> =
        fun booleanTimelines ->
            if List.isEmpty booleanTimelines then FalseTimeline
            else List.fold (fun acc elem -> acc |> Or elem) FalseTimeline booleanTimelines

    let all : list<Timeline<bool>> -> Timeline<bool> =
        fun booleanTimelines ->
            if List.isEmpty booleanTimelines then TrueTimeline
            else List.fold (fun acc elem -> acc |> And elem) TrueTimeline booleanTimelines
