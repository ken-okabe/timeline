// For more information see https://aka.ms/fsharp-console-apps
open Timeline

let log = // 'a -> unit
    fun a -> printfn "%A" a

log "Hello from F#"

//--------------------------------------------
let timelineRef: Timeline<string | null>
    = Timeline null

timelineRef
    |> TL.map log
    |> ignore

timelineRef |> TL.next "Hello"
timelineRef |> TL.next "World!"
timelineRef |> TL.next "F#"
timelineRef |> TL.next null

//--------------------------------------------

//ERROR-> let timelineInt: Timeline<int | null>
let timelineIntObj: Timeline<obj | null>
     = Timeline null

timelineIntObj
    |> TL.map log
    |> ignore

timelineIntObj |> TL.next 1
timelineIntObj |> TL.next 2
timelineIntObj |> TL.next 3
timelineIntObj |> TL.next null
