// For more information see https://aka.ms/fsharp-console-apps
open Timeline

let log = // 'a -> unit
    fun a -> printfn "%A" a

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