// For more information see https://aka.ms/fsharp-console-apps
open Timeline
open System.Threading.Tasks

let log = // 'a -> unit
    fun a -> printfn "%A" a

let logIntTimeline = Timeline 5

logIntTimeline
|> TL.map log
|> ignore
// print 5 imidiately


let logStringTimeline =
    Timeline Null<string>

logStringTimeline
|> TL.map (fun value ->
    if isNullT value
    then () // if value is Null, do nothing
    else log value
) |> ignore
// print nothing because the initial value is Null





open System.Net.Http // Required for HttpClient

// Timeline to trigger the request with a URL
let httpRequestUrlTimeline = Timeline Null<string>

// Timeline to receive the response content (or error message)
let httpResponseTimeline = Timeline Null<string>


// Use a single HttpClient instance for efficiency (simplified example)
let httpClient = new HttpClient()

// Set up the reaction on the request timeline
httpRequestUrlTimeline
|> TL.map (fun url ->
    if not (isNullT url) then
        // Asynchronously perform the HTTP GET request
        async {
            try
                let! response = httpClient.GetAsync(url) |> Async.AwaitTask
                response.EnsureSuccessStatusCode() |> ignore // Throw exception on error
                let! content = response.Content.ReadAsStringAsync() |> Async.AwaitTask

                // Define the successful response content onto the response timeline
                httpResponseTimeline |> TL.define Now content

            with ex ->
                // Define an error message onto the response timeline
                let errorMsg = $"HTTP Request Failed: {url} - {ex.Message}"
                httpResponseTimeline |> TL.define Now errorMsg
        }
        |> Async.StartImmediate // Start the async workflow
)
|> ignore

// Assume logStringTimeline is set up as before

// Link the response timeline to the logging timeline
httpResponseTimeline |> TL.link logStringTimeline


// Trigger the HTTP request by defining a URL
httpRequestUrlTimeline |> TL.define Now "https://www.google.co"

// Console Output (after request completes, example):
// <!doctype html><html ... (content of google.com) ... </html>
// or:
// HTTP Request Failed: [https://www.google.com](https://www.google.com) - <error details>


// // Create a new timeline with initial value
// let counterTimeline = Timeline 0

// // Register a listener to react to changes
// counterTimeline
// |> TL.map (fun count ->
//     printfn "Counter changed to: %d" count)
// |> ignore // ignore the returned timeline from map
// // logs: "Counter changed to: 0"

// // Update the timeline value
// counterTimeline |> TL.define Now 1 // logs: "Counter changed to: 1"
// counterTimeline |> TL.define Now 2 // logs: "Counter changed to: 2"

// log "--------------------------------------------"
// // Example 1: String Timeline
// // Initialize Timeline with Null
// let timelineA: Timeline<string>
//     = Timeline Null

// timelineA
// |> TL.link logStringTimeline

// timelineA |> TL.define Now "linked"
// timelineA |> TL.define Now "message!"


// timelineA |> TL.define Now "F#"
// timelineA |> TL.define Now Null

// log "--------------------------------------------"
// // Example 2: IntObj Timeline
// type intObj = {
//     value: int
// }
// // Initialize Timeline with Null
// let timelineIntObj: Timeline<intObj>
//      = Timeline Null
// // Map the Timeline
// timelineIntObj
// |> TL.map(fun value ->
//         if (isNullT value)
//         then log null
//         else log value
//     )
// |> ignore

// timelineIntObj |> TL.define Now {value = 1}
// timelineIntObj |> TL.define Now {value = 2}
// timelineIntObj |> TL.define Now {value = 3}
// timelineIntObj |> TL.define Now Null

// log "--------------------------------------------"
// // Example 3: Command Object Timeline
// type obj = {
//     cmd: string
//     msg: string
// }
// // Initialize Timeline with Null
// let timelineObj: Timeline<obj>
//      = Timeline Null
// // Map the Timeline
// // If the value is Null, do nothing
// // Otherwise, log the value
// // This behavior is similar to Promise .then() method
// timelineObj
// |> TL.map(fun value ->
//         if (isNullT value) then () else //do nothing on Null
//         log value
//     )
// |> ignore

// timelineObj |> TL.define Now {cmd = "text"; msg = "Hello"}
// timelineObj |> TL.define Now {cmd = "text"; msg = "Bye"}
// timelineObj |> TL.define Now Null // do nothing

// log "--------------------------------------------"

// let asyncOr1 =

//     let timelineA = Timeline Null
//     let timelineB = Timeline Null
//     let timelineC = Timeline Null

//     // Or binary operator
//     let (|||) = TL.Or
//     let timelineABC =
//         timelineA ||| timelineB ||| timelineC

//     timelineABC
//     |> TL.map log
//     |> ignore

//     timelineA |> TL.define Now "A" // "A"
//     timelineB |> TL.define Now "B"
//     timelineC |> TL.define Now "C"

// log "--------------------------------------------"

// let asyncOr2 =

//     let timelineA = Timeline Null
//     let timelineB = Timeline Null
//     let timelineC = Timeline Null

//     // Any of these
//     let timelineABC =
//         TL.Any [timelineA; timelineB; timelineC]

//     timelineABC
//     |> TL.map log
//     |> ignore

//     timelineA |> TL.define Now "A" // "A"
//     timelineB |> TL.define Now "B"
//     timelineC |> TL.define Now "C"


// log "--------------------------------------------"

// let asyncAnd1 =

//     let timelineA = Timeline Null
//     let timelineB = Timeline Null
//     let timelineC = Timeline Null

//     // And binary operator
//     let (&&&) = TL.And
//     let timelineABC =
//         timelineA &&& timelineB &&& timelineC

//     timelineABC
//     |> TL.map log
//     |> ignore

//     timelineA |> TL.define Now "A"
//     timelineB |> TL.define Now "B"
//     timelineC |> TL.define Now "C" // { result = ["A"; "B"; "C"] }

// log "--------------------------------------------"

// let asyncAnd2 =

//     let timelineA = Timeline Null
//     let timelineB = Timeline Null
//     let timelineC = Timeline Null

//     // All of these
//     let timelineABC =
//         TL.All [timelineA; timelineB; timelineC]

//     timelineABC
//     |> TL.map log
//     |> ignore

//     timelineA |> TL.define Now "A"
//     timelineB |> TL.define Now "B"
//     timelineC |> TL.define Now "C" // { result = ["A"; "B"; "C"] }

// log "--------------------------------------------"
// open System
// let nullableIntNullable: Nullable<int> = Nullable()
// let nullableIntNullable2: Nullable<int> = Nullable(10)

// let nt = Timeline nullableIntNullable
// nt |> TL.define Now nullableIntNullable2


// log "--------------------------------------------"
// // Implementation of setTimeout API, similar to JavaScript
// open System.Timers
// let setTimeout f delay =
//     let timer = new Timer(float delay)
//     timer.AutoReset <- false
//     timer.Elapsed.Add(fun _ -> f())
//     timer.Start()

// // Timeline bind sequence
// let timeline0 = Timeline Null
// let timeline1 = Timeline Null
// let timeline2 = Timeline Null
// let timeline3 = Timeline Null

// timeline0

// |> TL.bind(fun value ->
//     if (isNullT value)
//     then ()
//     else
//         let f =
//             fun _ ->
//                 let msg = "Hello"
//                 log msg
//                 timeline1
//                 |> TL.define Now msg
//         setTimeout f 1000
//     timeline1
// )

// |> TL.bind(fun value ->
//     if (isNullT value)
//     then ()
//     else
//         let f =
//             fun _ ->
//                 let msg =  value + " World!"
//                 log msg
//                 timeline2
//                 |> TL.define Now msg
//         setTimeout f 2000
//     timeline2
// )

// |> TL.bind(fun value ->
//     if (isNullT value)
//     then ()
//     else
//         let f =
//             fun _ ->
//                 let msg = value + " Sequence ends."
//                 log msg
//                 timeline3
//                 |> TL.define Now msg
//         setTimeout f 1000
//     timeline3
// )
// |>ignore

// timeline0
// |> TL.define Now "Start!"

System.Console.ReadKey() |> ignore
// Keep the console window open in debug mode