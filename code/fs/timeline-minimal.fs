module Timeline

type Now = Now of string
let Now = Now "Conceptual time coordinate"

type Timeline<'a> =
    {
        mutable _last: 'a
        mutable _fns: ('a -> unit) list
    }

let Timeline =
    fun initialValue ->
        { _last = initialValue; _fns = [] }

module TL =
    let isNull (value: 'a) : bool =
        match box value with
        | null -> true
        | _ -> false

    let at =
        fun _ timeline ->
            timeline._last

    let define =
        fun _ a timeline ->
            timeline._last <- a
            timeline._fns
            |> List.iter (fun f -> f a)

    let map =
        fun f timelineA ->
            let timelineB = Timeline (f (timelineA |> at Now))
            let newFn =
                fun valueA ->
                    timelineB
                    |> define Now (f valueA)
            
            timelineA._fns <- timelineA._fns @ [newFn]
            timelineB

    let bind =
        fun monadf timelineA ->
            let initialInnerTimeline = monadf (timelineA |> at Now)
            let timelineB = Timeline (initialInnerTimeline |> at Now)

            let newFn =
                fun valueA ->
                    let newInnerTimeline = monadf valueA
                    timelineB
                    |> define Now (newInnerTimeline |> at Now)
            
            timelineA._fns <- timelineA._fns @ [newFn]
            timelineB