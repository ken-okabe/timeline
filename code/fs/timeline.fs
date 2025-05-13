module Timeline

// --- Now Type Definition ---
type Now = Now of string
// NOTE: This is a value, not a function, so the style guide for function definitions doesn't apply directly.
// However, if it were intended as a simple factory/constant function, it might look like:
// let Now : unit -> Now = fun () -> Now "Conceptual time coordinate"
// But the original seems like a module-level constant value, which is fine as is.
let Now = Now "Conceptual time coordinate"

// --- Core System Abstractions ---
type TimelineId = System.Guid
type DependencyId = System.Guid
type ScopeId = System.Guid

type internal DependencyDetails =
    { SourceId: TimelineId
      TargetId: TimelineId
      Callback: obj
      ScopeId: ScopeId option // User confirmed Option usage is acceptable here.
    }

// --- Dependency Management Core ---
module internal DependencyCore =
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
            | None -> () // Option usage confirmed acceptable.
            depId

    let removeDependency : DependencyId -> unit =
        fun depId ->
            match dependencies.TryGetValue(depId) with
            | true, details ->
                dependencies.Remove(depId) |> ignore
                removeFromListDict sourceIndex details.SourceId depId
                match details.ScopeId with
                | Some sId -> removeFromListDict scopeIndex sId depId
                | None -> () // Option usage confirmed acceptable.
            | false, _ -> ()

    let disposeScope : ScopeId -> unit =
        fun scopeId ->
            match scopeIndex.TryGetValue(scopeId) with
            | true, depIds ->
                let idsToRemove = depIds |> List.ofSeq // Avoid modifying collection while iterating
                idsToRemove |> List.iter removeDependency // Correct: Calling removeDependency defined above
                // Check if the key still exists before attempting removal,
                // as removeDependency might have already removed it if it was the last one.
                if scopeIndex.ContainsKey(scopeId) then
                    scopeIndex.Remove(scopeId) |> ignore
            | false, _ -> ()

    let getCallbacks : TimelineId -> list<DependencyId * obj> =
        fun sourceId ->
            match sourceIndex.TryGetValue(sourceId) with
            | true, depIds ->
                depIds
                |> Seq.choose (fun depId ->
                    match dependencies.TryGetValue(depId) with
                    | true, details -> Some (depId, details.Callback) // Option usage confirmed acceptable.
                    | false, _ -> None) // Option usage confirmed acceptable.
                |> List.ofSeq
            | false, _ -> List.empty


// --- Timeline Type Definition ---
type Timeline<'a> =
    private
        { id: TimelineId
          mutable _last: 'a }

// --- Timeline Factory Function ---
// Corrected style for the factory function
let Timeline<'a> : 'a -> Timeline<'a> =
    fun initialValue ->
        let newId = DependencyCore.generateTimelineId()
        { id = newId; _last = initialValue }

// --- Core Timeline Operations Module ---
module TL =

    // --- Core Operations (from baseline) ---

    let at<'a> : Now -> Timeline<'a> -> 'a =
        fun now timeline -> // 'now' parameter is kept for potential future use/consistency, even if unused now
            timeline._last

    let define<'a> : Now -> 'a -> Timeline<'a> -> unit =
        fun now value timeline -> // 'now' parameter is kept for potential future use/consistency
            timeline._last <- value
            let callbacks = timeline.id |> DependencyCore.getCallbacks // Correct: Using DependencyCore function
            callbacks
            |> List.iter (fun (depId, callbackObj) ->
                try
                    let callback = callbackObj :?> ('a -> unit)
                    callback value
                with
                | :? System.InvalidCastException ->
                    // Provide more context in error message if possible
                    printfn "Warning: Callback type mismatch for DependencyId %A. Timeline Value Type: %s. Callback expected different input." depId (value.GetType().Name)
                | ex ->
                    printfn "Error executing callback for DependencyId %A: %s" depId ex.Message
            )

    let map<'a, 'b> : ('a -> 'b) -> Timeline<'a> -> Timeline<'b> =
        fun f timelineA ->
            let initialB = f timelineA._last
            let timelineB = Timeline initialB // Correct: Using factory function
            let reactionFn (valueA: 'a) =
                    let newValueB = f valueA
                    // Pass 'Now' explicitly if define requires it, using the module constant
                    timelineB |> define Now newValueB // Correct: Calling define within TL module
            // Pass scopeIdOpt as None explicitly for registerDependency
            let _depId = DependencyCore.registerDependency timelineA.id timelineB.id (reactionFn :> obj) None // Correct: Using DependencyCore function
            timelineB

    let bind<'a, 'b> : ('a -> Timeline<'b>) -> Timeline<'a> -> Timeline<'b> =
        fun monadf timelineA ->
            // Initial inner timeline and its scope
            let initialInnerTimeline = monadf timelineA._last
            let timelineB = Timeline initialInnerTimeline._last // Correct: Using factory function
            let mutable currentScopeId : ScopeId = DependencyCore.createScope() // Correct: Using DependencyCore function

            // Function to set up dependency from an inner timeline to timelineB
            let setUpInnerReaction (innerTimeline: Timeline<'b>) (scopeForInner: ScopeId) =
                let reactionFnInnerToB (valueInner: 'b) =
                    match currentScopeId with // Use the module-level mutable currentScopeId
                    | activeScope when activeScope = scopeForInner -> // React only if this is the active scope
                        // Pass 'Now' explicitly if define requires it
                        timelineB |> define Now valueInner // Correct: Calling define within TL module
                    | _ -> () // Stale update from a disposed scope, ignore
                // Pass scopeIdOpt explicitly for registerDependency
                ignore(DependencyCore.registerDependency innerTimeline.id timelineB.id (reactionFnInnerToB :> obj) (Some scopeForInner)) // Correct: Using DependencyCore function

            // Set up reaction for the initial inner timeline
            setUpInnerReaction initialInnerTimeline currentScopeId

            // Main reaction when timelineA updates
            let reactionFnAtoB (valueA: 'a) =
                    DependencyCore.disposeScope currentScopeId // Correct: Using DependencyCore function

                    let newScope = DependencyCore.createScope() // Correct: Using DependencyCore function
                    currentScopeId <- newScope                  // Update currentScopeId

                    let newInnerTimeline = valueA |> monadf // Apply the monadic function
                    // Pass 'Now' explicitly if define requires it
                    timelineB |> define Now newInnerTimeline._last // Immediately update timelineB, Correct: Calling define

                    setUpInnerReaction newInnerTimeline newScope // Set up reaction for the new inner timeline
                    () // reactionFnAtoB returns unit

            // Register main dependency from timelineA to this re-binding logic
            // Note: The initial value of timelineA has already been processed to set up timelineB and its first inner reaction.
            // This dependency handles *subsequent* updates to timelineA.
            // Pass scopeIdOpt as None explicitly for registerDependency
            let _mainDepId = DependencyCore.registerDependency timelineA.id timelineB.id (reactionFnAtoB :> obj) None // Correct: Using DependencyCore function
            timelineB

    let link<'a> : Timeline<'a> -> Timeline<'a> -> unit =
        fun targetTimeline sourceTimeline ->
            let reactionFn (value: 'a) =
                    // Pass 'Now' explicitly if define requires it
                    targetTimeline |> define Now value // Correct: Calling define within TL module
            // Pass scopeIdOpt as None explicitly for registerDependency
            let _depId = DependencyCore.registerDependency sourceTimeline.id targetTimeline.id (reactionFn :> obj) None // Correct: Using DependencyCore function
             // Initial sync: Pass 'Now' explicitly if define requires it
            targetTimeline |> define Now sourceTimeline._last // Correct: Calling define within TL module

    let ID<'a> : 'a -> Timeline<'a> =
        fun a ->
            Timeline a // Correct: Using factory function

    let inline (>>>) (f: 'a -> Timeline<'b>) (g: 'b -> Timeline<'c>) : 'a -> Timeline<'c> =
        // This function definition style itself needs correction.
        // It defines a function that takes f and g and RETURNS a function ('a -> Timeline<'c>)
        fun a -> // This 'a' is the parameter for the *returned* function
            // Corrected to be directly applicable: (f >>> g) aValue
            let timelineFromF = f a // Apply f to 'a' first
            timelineFromF |> bind g // Then bind the result with g, Correct: Calling bind within TL module


    // --- New additions for Unit 5 Section 1 ---

    // -- From New Chapter 3 & 4: Pure Monoidal Operations and Identities --
    // These are values, not functions, so the definition style guide doesn't apply.
    let FalseTimeline : Timeline<bool> = Timeline false
    let TrueTimeline : Timeline<bool> = Timeline true

    /// <summary>
    /// (Pure Monoid OR) Combines two boolean timelines based on logical OR.
    /// Updates when either input timeline updates, reflecting the OR of their current states.
    /// Forms a Monoid with TL.FalseTimeline.
    /// </summary>
    let Or : Timeline<bool> -> Timeline<bool> -> Timeline<bool> =
        fun timelineB timelineA -> // Parameter order for (timelineA |> Or timelineB) pipeline
            let initialValA = timelineA |> at Now // Correct: Calling at within TL module
            let initialValB = timelineB |> at Now // Correct: Calling at within TL module
            let resultTimeline = Timeline (initialValA || initialValB) // Correct: Using factory function

            let reactionToA (_newValA: bool) = // newValA is implicitly used via at Now from timelineA
                let currentValA = timelineA |> at Now // Ensure we use the absolute latest from the source
                let currentValB = timelineB |> at Now
                 // Pass 'Now' explicitly
                resultTimeline |> define Now (currentValA || currentValB) // Correct: Calling define within TL module
            // Pass scopeIdOpt as None
            ignore (DependencyCore.registerDependency timelineA.id resultTimeline.id (reactionToA :> obj) None) // Correct: Using DependencyCore function

            let reactionToB (_newValB: bool) = // newValB is implicitly used via at Now from timelineB
                let currentValA = timelineA |> at Now
                let currentValB = timelineB |> at Now // Ensure we use the absolute latest from the source
                 // Pass 'Now' explicitly
                resultTimeline |> define Now (currentValA || currentValB) // Correct: Calling define within TL module
            // Pass scopeIdOpt as None
            ignore (DependencyCore.registerDependency timelineB.id resultTimeline.id (reactionToB :> obj) None) // Correct: Using DependencyCore function
            resultTimeline

    /// <summary>
    /// (Pure Monoid AND) Combines two boolean timelines based on logical AND.
    /// Updates when either input timeline updates, reflecting the AND of their current states.
    /// Forms a Monoid with TL.TrueTimeline.
    /// </summary>
    let And : Timeline<bool> -> Timeline<bool> -> Timeline<bool> =
        fun timelineB timelineA -> // Parameter order for (timelineA |> And timelineB) pipeline
            let initialValA = timelineA |> at Now // Correct: Calling at within TL module
            let initialValB = timelineB |> at Now // Correct: Calling at within TL module
            let resultTimeline = Timeline (initialValA && initialValB) // Correct: Using factory function

            let reactionToA (_newValA: bool) =
                let currentValA = timelineA |> at Now
                let currentValB = timelineB |> at Now
                 // Pass 'Now' explicitly
                resultTimeline |> define Now (currentValA && currentValB) // Correct: Calling define within TL module
            // Pass scopeIdOpt as None
            ignore (DependencyCore.registerDependency timelineA.id resultTimeline.id (reactionToA :> obj) None) // Correct: Using DependencyCore function

            let reactionToB (_newValB: bool) =
                let currentValA = timelineA |> at Now
                let currentValB = timelineB |> at Now
                 // Pass 'Now' explicitly
                resultTimeline |> define Now (currentValA && currentValB) // Correct: Calling define within TL module
            // Pass scopeIdOpt as None
            ignore (DependencyCore.registerDependency timelineB.id resultTimeline.id (reactionToB :> obj) None) // Correct: Using DependencyCore function
            resultTimeline

    // -- From New Chapter 6: distinctUntilChanged --
    let distinctUntilChanged<'a when 'a : equality> : Timeline<'a> -> Timeline<'a> =
        fun sourceTimeline ->
            let initialValue = sourceTimeline |> at Now // Correct: Calling at within TL module
            let resultTimeline = Timeline initialValue // Correct: Using factory function
            // Store the last value that resultTimeline itself propagated
            let mutable lastPropagatedValueByResult = initialValue

            let reactionFn (newValueFromSource: 'a) =
                if newValueFromSource <> lastPropagatedValueByResult then
                    lastPropagatedValueByResult <- newValueFromSource
                     // Pass 'Now' explicitly
                    resultTimeline |> define Now newValueFromSource // Correct: Calling define within TL module
            // Pass scopeIdOpt as None
            ignore (DependencyCore.registerDependency sourceTimeline.id resultTimeline.id (reactionFn :> obj) None) // Correct: Using DependencyCore function
            resultTimeline

    // -- From New Chapter 7: zipWith --
    // For pipeline: timelineA |> zipWith f timelineB
    // Definition order for currying: f -> timelineB -> timelineA -> result
    let zipWith<'a, 'b, 'c> : ('a -> 'b -> 'c) -> Timeline<'b> -> Timeline<'a> -> Timeline<'c> =
        fun f timelineB timelineA ->
            let mutable latestA = timelineA |> at Now // Correct: Calling at within TL module
            let mutable latestB = timelineB |> at Now // Correct: Calling at within TL module

            let calculateCombinedValue () =
                // This version assumes inputs are always "valid" in terms of null-ness for their types
                // as per Chapter 0 philosophy (e.g. Timeline<bool> is false/true, not null).
                // For truly generic version with reference types that can be null before combining:
                // if isNull latestA || isNull latestB then Unchecked.defaultof<'c> else f latestA latestB
                f latestA latestB // No need for null checks based on user's acceptance of Option use elsewhere

            let resultTimeline = Timeline (calculateCombinedValue()) // Correct: Using factory function

            let reactionA (valA: 'a) =
                latestA <- valA
                // Pass 'Now' explicitly
                resultTimeline |> define Now (calculateCombinedValue()) // Correct: Calling define within TL module
            // Pass scopeIdOpt as None
            ignore (DependencyCore.registerDependency timelineA.id resultTimeline.id (reactionA :> obj) None) // Correct: Using DependencyCore function

            let reactionB (valB: 'b) =
                latestB <- valB
                // Pass 'Now' explicitly
                resultTimeline |> define Now (calculateCombinedValue()) // Correct: Calling define within TL module
            // Pass scopeIdOpt as None
            ignore (DependencyCore.registerDependency timelineB.id resultTimeline.id (reactionB :> obj) None) // Correct: Using DependencyCore function
            resultTimeline

    // -- From New Chapter 8: Practical Or-like (anyTrue) --
    /// <summary>
    /// (Practical OR) Creates a timeline that is true if either of the input timelines is true.
    /// Implemented using TL.zipWith (||).
    /// Forms a Monoid with TL.FalseTimeline.
    /// </summary>
    let anyTrue : Timeline<bool> -> Timeline<bool> -> Timeline<bool> =
        fun timelineB timelineA -> // Parameter order for (timelineA |> anyTrue timelineB) pipeline
            timelineA |> zipWith (||) timelineB // Correct: Calling zipWith within TL module

    // -- From New Chapter 9: Practical And-like (allTrue) --
    /// <summary>
    /// (Practical AND) Creates a timeline that is true only if both input timelines are true.
    /// Implemented using TL.zipWith (&&).
    /// Forms a Monoid with TL.TrueTimeline.
    /// </summary>
    let allTrue : Timeline<bool> -> Timeline<bool> -> Timeline<bool> =
        fun timelineB timelineA -> // Parameter order for (timelineA |> allTrue timelineB) pipeline
            timelineA |> zipWith (&&) timelineB // Correct: Calling zipWith within TL module

    // -- From New Chapter 10: N-ary OR and AND --
    let anyTrueInList : list<Timeline<bool>> -> Timeline<bool> =
        fun booleanTimelines ->
            // Fold requires ('State -> 'T -> 'State).
            // anyTrue is (Timeline<bool> -> Timeline<bool> -> Timeline<bool>)
            // For List.fold, the accumulator comes first.
            // So we need (fun accumulator element -> accumulator |> anyTrue element)
            // Or simply use List.fold with the function reference if parameter order matches.
            // Let's check anyTrue: fun timelineB timelineA -> ... applies A to B.
            // Fold accumulator is like A, element is like B.
            // So we need List.fold (fun acc elem -> elem |> anyTrue acc) ? No, that's reversed.
            // We need List.fold (fun acc elem -> acc |> anyTrue elem) -> Yes, this works.
            List.fold anyTrue FalseTimeline booleanTimelines // Correct: Calling anyTrue within TL module

    let allTrueInList : list<Timeline<bool>> -> Timeline<bool> =
        fun booleanTimelines ->
            // Similar logic for fold with allTrue
            List.fold allTrue TrueTimeline booleanTimelines // Correct: Calling allTrue within TL module