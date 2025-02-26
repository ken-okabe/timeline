// For more information see https://aka.ms/fsharp-console-apps
open Timeline
open System.Threading.Tasks

let log = // 'a -> unit
    fun a -> printfn "%A" a

// Create a new timeline with initial value
let counterTimeline = Timeline 0

// Register a listener to react to changes
counterTimeline
|> TL.map (fun count ->
    printfn "Counter changed to: %d" count)
|> ignore // ignore the returned timeline from map
// logs: "Counter changed to: 0"

// Update the timeline value
counterTimeline |> TL.next 1 // logs: "Counter changed to: 1"
counterTimeline |> TL.next 2 // logs: "Counter changed to: 2"

log "--------------------------------------------"
// Example 1: String Timeline
// Initialize Timeline with Null
let timelineRef: Timeline<string>
    = Timeline Null
// Map the Timeline
timelineRef
    |> TL.map log
    |> ignore

timelineRef |> TL.next "Hello"
timelineRef |> TL.next "World!"
timelineRef |> TL.next "F#"
timelineRef |> TL.next Null

log "--------------------------------------------"
// Example 2: IntObj Timeline
type intObj = {
    value: int
}
// Initialize Timeline with Null
let timelineIntObj: Timeline<intObj>
     = Timeline Null
// Map the Timeline
timelineIntObj
|> TL.map(fun value ->
        if (isNullT value)
        then log null
        else log value
    )
|> ignore

timelineIntObj |> TL.next {value = 1}
timelineIntObj |> TL.next {value = 2}
timelineIntObj |> TL.next {value = 3}
timelineIntObj |> TL.next Null

log "--------------------------------------------"
// Example 3: Command Object Timeline
type obj = {
    cmd: string
    msg: string
}
// Initialize Timeline with Null
let timelineObj: Timeline<obj>
     = Timeline Null
// Map the Timeline
// If the value is Null, do nothing
// Otherwise, log the value
// This behavior is similar to Promise .then() method
timelineObj
|> TL.map(fun value ->
        if (isNullT value) then () else //do nothing on Null
        log value
    )
|> ignore

timelineObj |> TL.next {cmd = "text"; msg = "Hello"}
timelineObj |> TL.next {cmd = "text"; msg = "Bye"}
timelineObj |> TL.next Null // do nothing

log "--------------------------------------------"

let asyncOr1 =

    let timelineA = Timeline Null
    let timelineB = Timeline Null
    let timelineC = Timeline Null

    // Or binary operator
    let (|||) = TL.Or
    let timelineABC =
        timelineA ||| timelineB ||| timelineC

    timelineABC
    |> TL.map log
    |> ignore

    timelineA |> TL.next "A" // "A"
    timelineB |> TL.next "B"
    timelineC |> TL.next "C"

log "--------------------------------------------"

let asyncOr2 =

    let timelineA = Timeline Null
    let timelineB = Timeline Null
    let timelineC = Timeline Null

    // Any of these
    let timelineABC =
        TL.Any [timelineA; timelineB; timelineC]

    timelineABC
    |> TL.map log
    |> ignore

    timelineA |> TL.next "A" // "A"
    timelineB |> TL.next "B"
    timelineC |> TL.next "C"


log "--------------------------------------------"

let asyncAnd1 =

    let timelineA = Timeline Null
    let timelineB = Timeline Null
    let timelineC = Timeline Null

    // And binary operator
    let (&&&) = TL.And
    let timelineABC =
        timelineA &&& timelineB &&& timelineC

    timelineABC
    |> TL.map log
    |> ignore

    timelineA |> TL.next "A"
    timelineB |> TL.next "B"
    timelineC |> TL.next "C" // { result = ["A"; "B"; "C"] }

log "--------------------------------------------"

let asyncAnd2 =

    let timelineA = Timeline Null
    let timelineB = Timeline Null
    let timelineC = Timeline Null

    // All of these
    let timelineABC =
        TL.All [timelineA; timelineB; timelineC]

    timelineABC
    |> TL.map log
    |> ignore

    timelineA |> TL.next "A"
    timelineB |> TL.next "B"
    timelineC |> TL.next "C" // { result = ["A"; "B"; "C"] }

log "--------------------------------------------"




log "--------------------------------------------"

open System.Timers
let setTimeout f delay =
    let timer = new Timer(float delay)
    timer.AutoReset <- false
    timer.Elapsed.Add(fun _ -> f())
    timer.Start()

// Timeline bind sequence
let timeline0 = Timeline Null
let timeline1 = Timeline Null
let timeline2 = Timeline Null
let timeline3 = Timeline Null

timeline0

|> TL.bind(fun value ->
    if (isNullT value)
    then ()
    else
        let f =
            fun _ ->
                let msg = "Hello"
                log msg
                timeline1
                |> TL.next msg
        setTimeout f 1000
    timeline1
)

|> TL.bind(fun value ->
    if (isNullT value)
    then ()
    else
        let f =
            fun _ ->
                let msg = "World!"
                log msg
                timeline2
                |> TL.next msg
        setTimeout f 2000
    timeline2
)

|> TL.bind(fun value ->
    if (isNullT value)
    then ()
    else
        let f =
            fun _ ->
                let msg = "Sequence ends."
                log msg
                timeline3
                |> TL.next msg
        setTimeout f 1000
    timeline3
)
|>ignore

timeline0
|> TL.next "Start!"

System.Console.ReadKey() |> ignore // Keep the console window open in debug mode