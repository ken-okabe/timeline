module Timeline

type Timeline<'a> =
    { mutable _last: 'a
      mutable _fns: list<'a -> unit> }

let Timeline =
    fun a ->
        { _last = a
          _fns = [] }

let inline Null<'a when 'a:not struct> =
    Unchecked.defaultof<'a >

let isNullT (value: 'a when 'a:not struct) =
    if obj.ReferenceEquals(value, null)
    then true
    else false
 
module TL =
    let last =
        fun timeline ->
            timeline._last

    let next =
        fun a timeline ->
            timeline._last <- a // mutable
            timeline._fns
            |> List.iter (fun f -> f a) //perform all fns in the list

    let bind =
        fun monadf timelineA ->
            let timelineB =
                timelineA._last |> monadf
            let newFn =
                fun a ->
                    let timeline =
                        a |> monadf
                    timelineB
                    |> next timeline._last

            timelineA._fns <- timelineA._fns @ [ newFn ]
            timelineB

    let map =
        fun f timelineA ->
            let timelineB =
                Timeline (timelineA._last |> f)
            let newFn =
                fun a ->
                    timelineB
                    |> next (a |> f)

            timelineA._fns <- timelineA._fns @ [ newFn ]
            timelineB

    let unlink =
        fun timeline ->
            timeline._fns <- []