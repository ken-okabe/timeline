module Timeline

// --- Now Type Definition ---
type Now = Now of string
let Now = Now "Conceptual time coordinate"

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
    // ... (DependencyCore implementation remains the same as the previous version) ...
    let private dependencies = System.Collections.Generic.Dictionary<DependencyId, DependencyDetails>()
    let private sourceIndex = System.Collections.Generic.Dictionary<TimelineId, System.Collections.Generic.List<DependencyId>>()
    let private scopeIndex = System.Collections.Generic.Dictionary<ScopeId, System.Collections.Generic.List<DependencyId>>()

    let private addToListDict<'K, 'V> : System.Collections.Generic.Dictionary<'K, System.Collections.Generic.List<'V>> -> 'K -> 'V -> unit =
        fun dict key value ->
            match dict.TryGetValue(key) with
            | true, list -> list.Add(value)
            | false, _ ->
                let newList = System.Collections.Generic.List<'V>()
                newList.Add(value)
                dict.Add(key, newList)

    let private removeFromListDict<'K, 'V> : System.Collections.Generic.Dictionary<'K, System.Collections.Generic.List<'V>> -> 'K -> 'V -> unit =
        fun dict key value ->
            match dict.TryGetValue(key) with
            | true, list ->
                list.Remove(value) |> ignore
                if list.Count = 0 then
                    dict.Remove(key) |> ignore
            | false, _ -> ()

    let generateTimelineId : unit -> TimelineId = fun () -> System.Guid.NewGuid()
    let createScope : unit -> ScopeId = fun () -> System.Guid.NewGuid()

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

    let disposeScope : ScopeId -> unit =
        fun scopeId ->
            match scopeIndex.TryGetValue(scopeId) with
            | true, depIds ->
                let idsToRemove = depIds |> List.ofSeq
                idsToRemove |> List.iter removeDependency
                scopeIndex.Remove(scopeId) |> ignore
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
        { id: TimelineId
          mutable _last: 'a }

// --- Timeline Factory Function ---
let Timeline : 'a -> Timeline<'a> =
    fun initialValue ->
        let newId = DependencyCore.generateTimelineId()
        { id = newId; _last = initialValue }

// --- Core Timeline Operations Module ---
module TL =

    // --- Core Operations ---

    let at<'a> : Now -> Timeline<'a> -> 'a =
        fun now timeline ->
            timeline._last

    // define calls DependencyCore.getCallbacks but no other TL functions
    let define<'a> : Now -> 'a -> Timeline<'a> -> unit =
        fun now value timeline ->
            timeline._last <- value
            let callbacks = timeline.id |> DependencyCore.getCallbacks
            callbacks
            |> List.iter (fun (depId, callbackObj) ->
                try
                    let callback = callbackObj :?> ('a -> unit)
                    callback value
                with
                | :? System.InvalidCastException ->
                    printfn "Warning: Callback type mismatch for DependencyId %A (Expected: %s -> unit)" depId (typeof<'a>.Name)
                | ex ->
                    printfn "Error executing callback for DependencyId %A: %s" depId ex.Message
            )

    // map calls define
    let map<'a, 'b> : ('a -> 'b) -> Timeline<'a> -> Timeline<'b> =
        fun f timelineA ->
            let initialB = f timelineA._last
            let timelineB = Timeline initialB
            let reactionFn valueA =
                    let newValueB = f valueA
                    // CORRECTED: No TL. prefix needed for define called within TL module
                    timelineB |> define Now newValueB
            let _depId = DependencyCore.registerDependency timelineA.id timelineB.id (reactionFn :> obj) None
            timelineB

    // bind calls define
    let bind<'a, 'b> : ('a -> Timeline<'b>) -> Timeline<'a> -> Timeline<'b> =
        fun monadf timelineA ->
            let timelineB = Timeline (Unchecked.defaultof<'b>)
            let mutable currentScopeId : ScopeId option = None

            let reactionFnAtoB valueA =
                    match currentScopeId with
                    | Some oldScopeId -> DependencyCore.disposeScope oldScopeId
                    | None -> ()
                    let newScopeId = DependencyCore.createScope()
                    currentScopeId <- Some newScopeId
                    let newInnerTimeline = valueA |> monadf
                    // CORRECTED: No TL. prefix needed for define called within TL module
                    timelineB |> define Now newInnerTimeline._last

                    let reactionFnInnerToB valueInner =
                             match currentScopeId with
                             | Some activeScope when activeScope = newScopeId ->
                                 // CORRECTED: No TL. prefix needed for define called within TL module
                                 timelineB |> define Now valueInner
                             | _ -> ()
                    let _innerDepId = DependencyCore.registerDependency newInnerTimeline.id timelineB.id (reactionFnInnerToB :> obj) (Some newScopeId)
                    ()
            reactionFnAtoB timelineA._last
            let _mainDepId = DependencyCore.registerDependency timelineA.id timelineB.id (reactionFnAtoB :> obj) None
            timelineB

    // link calls define
    let link<'a> : Timeline<'a> -> Timeline<'a> -> unit =
        fun targetTimeline sourceTimeline ->
            let reactionFn value =
                    // CORRECTED: No TL. prefix needed for define called within TL module
                    targetTimeline |> define Now value
            let _depId = DependencyCore.registerDependency sourceTimeline.id targetTimeline.id (reactionFn :> obj) None
            // CORRECTED: No TL. prefix needed for define called within TL module
            targetTimeline |> define Now sourceTimeline._last

    let ID<'a> : 'a -> Timeline<'a> =
        fun a -> Timeline a

    // (>>>) calls bind
    let inline (>>>) f g =
        fun a ->
            let timelineFromF = a |> f
            // CORRECTED: No TL. prefix needed for bind called within TL module
            timelineFromF |> bind g

// --- Additional Timeline Combinators Module ---
module Combinators =

    open TL // Access core operations

    // map2 calls TL.define and TL.at from *outside* the TL module
    let map2<'a, 'b, 'c> : ('a -> 'b -> 'c) -> Timeline<'a> -> Timeline<'b> -> Timeline<'c option> =
        fun f timelineA timelineB ->
            let timelineC = Timeline None
            let mutable lastA : 'a option = None
            let mutable lastB : 'b option = None

            let updateC () =
                match lastA, lastB with
                | Some a, Some b ->
                    // Keep TL. prefix when calling from Combinators into TL
                    timelineC |> TL.define Now (Some (f a b))
                | _, _ ->
                    // Keep TL. prefix when calling from Combinators into TL
                    let isSome = timelineC |> TL.at Now |> Option.isSome
                    if isSome then
                        // Keep TL. prefix when calling from Combinators into TL
                        timelineC |> TL.define Now None

            let reactionA valueA =
                lastA <- Some valueA
                updateC()

            let reactionB valueB =
                lastB <- Some valueB
                updateC()

            let _depA = DependencyCore.registerDependency timelineA.id timelineC.id (reactionA :> obj) None
            let _depB = DependencyCore.registerDependency timelineB.id timelineC.id (reactionB :> obj) None

            // Keep TL. prefix when calling from Combinators into TL
            lastA <- Some (timelineA |> TL.at Now)
            lastB <- Some (timelineB |> TL.at Now)
            updateC()

            timelineC

    // Or calls TL.define and TL.at from *outside* the TL module
    let Or<'a when 'a : null> : Timeline<'a> -> Timeline<'a> -> Timeline<'a> =
        fun timelineA timelineB ->
            let timelineAB = Timeline null
            let reactionA a =
                // Keep TL. prefix when calling from Combinators into TL
                let currentVal = timelineAB |> TL.at Now
                if not (isNull a) && isNull currentVal then
                     // Keep TL. prefix when calling from Combinators into TL
                    timelineAB |> TL.define Now a

            let reactionB b =
                // Keep TL. prefix when calling from Combinators into TL
                let currentVal = timelineAB |> TL.at Now
                if not (isNull b) && isNull currentVal then
                     // Keep TL. prefix when calling from Combinators into TL
                    timelineAB |> TL.define Now b

            let _depA = DependencyCore.registerDependency timelineA.id timelineAB.id (reactionA :> obj) None
            let _depB = DependencyCore.registerDependency timelineB.id timelineAB.id (reactionB :> obj) None

            // Keep TL. prefix when calling from Combinators into TL
            reactionA (timelineA |> TL.at Now)
            reactionB (timelineB |> TL.at Now)

            timelineAB

    // All calls TL.map, TL.define, TL.at from *outside* the TL module
    let All<'a> : list<Timeline<'a>> -> Timeline<list<'a> option> =
        fun timelines ->
            match timelines with
            | [] -> Timeline(Some [])
            | head :: tail ->
                // Keep TL. prefix when calling from Combinators into TL
                let initialAccTimeline = head |> TL.map (fun h -> Some [h])

                let combine : Timeline<list<'a> option> -> Timeline<'a> -> Timeline<list<'a> option> =
                    fun accTimeline nextTimeline ->
                        let resultTimeline = Timeline None
                        let mutable lastAcc : list<'a> option option = None
                        let mutable lastNext : 'a option = None

                        let updateResult() =
                            match lastAcc, lastNext with
                            | Some (Some accList), Some nextVal ->
                                // Keep TL. prefix
                                resultTimeline |> TL.define Now (Some (accList @ [nextVal]))
                            | Some None, _ ->
                                // Keep TL. prefix
                                resultTimeline |> TL.define Now None
                            | _, _ ->
                                 // Keep TL. prefix
                                 let isSome = resultTimeline |> TL.at Now |> Option.isSome
                                 if isSome then
                                     // Keep TL. prefix
                                     resultTimeline |> TL.define Now None

                        let reactionAcc accListOpt =
                            lastAcc <- Some accListOpt
                            updateResult()

                        let reactionNext nextVal =
                            lastNext <- Some nextVal
                            updateResult()

                        let _depAcc = DependencyCore.registerDependency accTimeline.id resultTimeline.id (reactionAcc :> obj) None
                        let _depNext = DependencyCore.registerDependency nextTimeline.id resultTimeline.id (reactionNext :> obj) None

                        // Keep TL. prefix
                        lastAcc <- Some (accTimeline |> TL.at Now)
                        lastNext <- Some (nextTimeline |> TL.at Now)
                        updateResult()

                        resultTimeline
                tail |> List.fold combine initialAccTimeline

    // And calls All (which handles TL prefixes correctly)
    let And<'a> : Timeline<'a> -> Timeline<'a> -> Timeline<list<'a> option> =
        fun timelineA timelineB ->
            All [timelineA; timelineB] // No TL. prefix needed for local module function

    // Any calls Or (which handles TL prefixes correctly)
    let Any<'a when 'a : null> : list<Timeline<'a>> -> Timeline<'a> =
        fun timelines ->
            match timelines with
            | [] -> Timeline null
            | head :: tail -> tail |> List.fold Or head // No TL. prefix needed for local module function