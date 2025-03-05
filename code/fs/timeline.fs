module Timeline
// Timeline type definition
type Timeline<'a> =
    { mutable _last: 'a       // Stores the most recent value
      mutable _fns: list<'a -> unit> }  // List of functions to execute on updates

// Timeline constructor
let Timeline = // 'a -> Timeline<'a>
    fun a ->
        { _last = a          // Initialize with initial value
          _fns = [] }        // Start with empty function list

// Utility functions for null handling
let inline Null<'a when 'a:not struct> =
    Unchecked.defaultof<'a>  // Returns default value for reference types

let isNullT (value: 'a when 'a:not struct) =
    if obj.ReferenceEquals(value, null)  // Checks if value is null
    then true
    else false
    
// Timeline operations module
module TL =
    // Get the last/current value
    let last =
        fun timeline ->
            timeline._last
    // Update timeline with new value and execute all registered functions

    let next =
        fun a timeline ->
            timeline._last <- a                       // Update current value
            timeline._fns |> List.iter (fun f -> f a) // Execute all registered functions

    // Monadic bind operation
    let bind =
        fun monadf timelineA ->
            let timelineB = timelineA._last |> monadf // Create new timeline with monadF
            let newFn =                    // Create function to propagate future updates
                fun a ->
                    let timeline = a |> monadf
                    timelineB |> next timeline._last

            timelineA._fns <- timelineA._fns @ [ newFn ] // Register new function
            timelineB                                    // Return new timeline

    // Functor map operation
    let map =
        fun f timelineA ->
            let timelineB = Timeline (timelineA._last |> f) // Create new timeline with f
            let newFn =                    // Create function to propagate future updates
                fun a ->
                    timelineB |> next (a |> f)

            timelineA._fns <- timelineA._fns @ [ newFn ]    // Register new function
            timelineB                                        // Return new timeline

    // Remove all registered functions
    let unlink =
        fun timeline ->
            timeline._fns <- []


    // -----------------------------------------------------
    // Additional timeline operations
    // -----------------------------------------------------

    // Or operation for two timelines
    let Or timelineA timelineB =
        let timelineAB = Timeline Null

        // Map both timelines to update timelineAB only when it's Null
        timelineA
        |> map (fun a ->
            if not (isNullT a) && isNullT (timelineAB |> last)
            then timelineAB |> next a)
        |> ignore

        timelineB
        |> map (fun b ->
            if not (isNullT b) && isNullT (timelineAB |> last)
            then timelineAB |> next b)
        |> ignore

        timelineAB

    // And operation for two timelines
    type AndResult<'a> =
        { result : list<'a> }

    let andResult (a: obj) =
        match a with
        | :? AndResult<'a> as andResultA -> andResultA
        | _ -> { result = [a :?> 'a] } //wrap the value in a list of results
    let bindResults a b =
        let aResult = andResult a
        let bResult = andResult b
        { result = aResult.result @ bResult.result }

    let And timelineA timelineB =
        let timelineAB: Timeline<obj> = Timeline Null

        // Map both timelines to update timelineAB
        let updateAnd () =
            let lastA = timelineA |> last
            let lastB = timelineB |> last
            match isNullT lastA, isNullT lastB with
            | false, false ->
                timelineAB
                |> next (bindResults lastA lastB)
            | _ -> timelineAB |> next Null

        timelineA
        |> map (fun _ -> updateAnd())
        |> ignore

        timelineB
        |> map (fun _ -> updateAnd())
        |> ignore

        timelineAB

    // Any operation (equivalent to Or but for multiple timelines)
    let Any (timelines: list<Timeline<'a>>) =
        timelines
        |> List.reduce Or

    // All operation (equivalent to And but for multiple timelines)
    let All (timelines: list<Timeline<obj>>) =
        timelines
        |> List.reduce And
