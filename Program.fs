// For more information see https://aka.ms/fsharp-console-apps
open Timeline

let log = // 'a -> unit
    fun a -> printfn "%A" a

log "--------------------------------------------"
let timelineRef: Timeline<string>
    = Timeline Null

timelineRef
    |> TL.map log
    |> ignore

timelineRef |> TL.next "Hello"
timelineRef |> TL.next "World!"
timelineRef |> TL.next "F#"
timelineRef |> TL.next Null

log "--------------------------------------------"

type intObj = {
    value: int
}
let timelineIntObj: Timeline<intObj>
     = Timeline Null

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

type obj = {
    cmd: string
    msg: string
}

let timelineObj: Timeline<obj>
     = Timeline Null

timelineObj
|> TL.map(fun value ->
        if (isNullT value) then () else //do nothing on Null

        log value

    )
|> ignore

timelineObj |> TL.next {cmd = "text"; msg = "Hello"}
timelineObj |> TL.next {cmd = "text"; msg = "Bye"}
