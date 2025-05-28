open System
open System.Net.Http
open Timeline // Your Timeline module (assuming Timeline type and factory function are here)
// TL module is opened implicitly or its functions are fully qualified like TL.map

// --- Dedicated Log Timeline Setup (as per Unit 4 style) ---
let logTimeline : Timeline<string> = Timeline null // Initialize with null (Timeline. explicit)

// Helper to check for null, assuming 'a can be null
let internal isNullHelper (value: 'a) = obj.ReferenceEquals(value, null)

// Reaction to print any non-null message defined on logTimeline
logTimeline
|> TL.map (fun message -> // Explicit TL.map
    if not (isNullHelper message) then // Using our local helper for clarity
        printfn "[App Log ] %s" message
)
|> ignore // We only care about the side effect of logging

// --- Main Logic ---

logTimeline |> TL.define Now "--- Practical Example: Aggregating HTTP Request Success & Logging Results via logTimeline ---"

// --- Helper Types and Functions ---

type HttpResponseInfo = {
    Url: string
    StatusCode: int option // Option to represent potential failure before status
    IsSuccess: bool      // True if status code indicates success (e.g., 2xx)
    ContentSummary: string option // Placeholder for content or error message
}

// Shared HttpClient instance for efficiency (in a real app, manage its lifecycle)
let private httpClient = new HttpClient()

/// <summary>
/// Asynchronously makes an HTTP GET request to the given URL.
/// Returns a Timeline that will be updated with HttpResponseInfo upon completion.
/// </summary>
let makeAsyncHttpRequest (url: string) : Timeline<HttpResponseInfo> =
    let resultTimeline = Timeline { Url = url; StatusCode = None; IsSuccess = false; ContentSummary = Some "Request pending..." }

    async {
        try
            logTimeline |> TL.define Now (sprintf "[HTTP Log] Starting request to: %s" url)
            use! response = httpClient.GetAsync(url) |> Async.AwaitTask

            let statusCode = int response.StatusCode
            let success = response.IsSuccessStatusCode
            let! content = response.Content.ReadAsStringAsync() |> Async.AwaitTask
            let summary =
                if success then Some (sprintf "OK (Content Length: %d)" content.Length)
                else Some (sprintf "Failed (Status: %d)" statusCode)

            let responseInfo = {
                Url = url
                StatusCode = Some statusCode
                IsSuccess = success
                ContentSummary = summary
            }
            logTimeline |> TL.define Now (sprintf "[HTTP Log] Request to %s completed. Status: %d, Success: %b" url statusCode success)
            resultTimeline |> TL.define Now responseInfo
        with
        | ex ->
            logTimeline |> TL.define Now (sprintf "[HTTP Log] Request to %s FAILED. Error: %s" url ex.Message)
            let errorInfo = {
                Url = url
                StatusCode = None
                IsSuccess = false
                ContentSummary = Some (sprintf "Exception: %s" ex.Message)
            }
            resultTimeline |> TL.define Now errorInfo
    }
    |> Async.StartImmediate
    resultTimeline


// 1. Define URLs
let urlsToFetch = [
    "https://www.google.com";    // Google US
    "https://www.google.co.uk"; // Google UK
    "https://www.google.ca"; // Google Canada
    // "https://nonexistent-domain123456.com"; // Uncomment to test a failure case
]

// 2. Create a list of Timelines, each representing an HTTP request result
//    Each call to makeAsyncHttpRequest starts an async operation.
let httpResultTimelines: list<Timeline<HttpResponseInfo>> =
    urlsToFetch
    |> List.map makeAsyncHttpRequest

// 3. Step 1 of "Map to Boolean" pattern:
//    Map each HttpResponseInfo timeline to a Timeline<bool> indicating its success.
let wasRequestSuccessful (responseInfo: HttpResponseInfo) : bool =
    responseInfo.IsSuccess // Directly use the IsSuccess flag from our record

let successStatusTimelines: list<Timeline<bool>> =
    httpResultTimelines
    |> List.map (fun tlOfResponseInfo -> tlOfResponseInfo |> TL.map wasRequestSuccessful) // Explicit TL.map

// 4. Step 2 of "Map to Boolean" pattern:
//    Aggregate these boolean success timelines using TL.allTrueInList.
//    This timeline will be true only if all individual successStatusTimelines are true.
let allRequestsInitiallySucceededSignal: Timeline<bool> =
    successStatusTimelines |> TL.all // Explicit TL.allTrueInList

// 5. Optimize the final aggregated signal to propagate only on actual changes.
let finalAllSuccessSignal: Timeline<bool> =
    allRequestsInitiallySucceededSignal |> TL.distinctUntilChanged // Explicit TL.distinctUntilChanged

// 6. React to the final_all_success_signal.
//    When it becomes true, gather all current results and log them via logTimeline.
finalAllSuccessSignal
|> TL.map (fun allSucceeded -> // Explicit TL.map
    if allSucceeded then
        // All requests have reported success. Now, collect and log their details.
        let headerMsg = "EVENT: All HTTP requests reported success! Details:"
        logTimeline |> TL.define Now headerMsg // Log header (TL. explicit)

        httpResultTimelines
        |> List.iteri (fun i individualResultTimeline ->
            let resultData = individualResultTimeline |> TL.at Now // Get current data (TL. explicit)
            let detailMsg =
                sprintf "  %d. URL: %-25s Status: %-3A Success: %-5b Summary: %A"
                    (i + 1)
                    resultData.Url
                    (match resultData.StatusCode with Some s -> string s | None -> "N/A")
                    resultData.IsSuccess
                    resultData.ContentSummary
            logTimeline |> TL.define Now detailMsg // Log each detail line (TL. explicit)
        )
        logTimeline |> TL.define Now "-----------------------------------------------------" // Log footer (TL. explicit)
    else
        // This branch will be hit if:
        // a) Initially not all are successful (e.g., one failed, or some are still pending and thus IsSuccess=false)
        // b) After being all successful, one of them changes to not successful.
        // We can log a "waiting" or "partial failure" status if desired.
        // For this example, we only log detailed results on full success.
        // logTimeline |> TL.define Now "STATUS: Not all requests have succeeded, or some are still pending/failed."
        () // Do nothing specific in this branch for this example
)
|> ignore // We are only interested in the side effect of logging to logTimeline.

// --- Keep the program alive to allow async operations to complete ---
logTimeline |> TL.define Now "Program initiated. HTTP requests dispatched..."
logTimeline |> TL.define Now "(Network dependent. Final aggregated log will appear if all succeed.)"

// Simulate a waiting period for the async HTTP requests
// In a real UI or server application, the application lifetime would manage this.
System.Threading.Thread.Sleep(20000) // Wait 20 seconds for demo purposes. Adjust if needed.

logTimeline |> TL.define Now "Demo finished. Check [App Log] entries above."
// open Timeline // Access the library module and Now type/value

// open System // For DateTime, TimeSpan, Thread
// open System.Timers
// open System.Diagnostics // Required for Stopwatch

// // --- Stopwatch for Elapsed Time ---
// let stopwatch = Stopwatch()

// // Helper: Executes function f after 'delay' ms (simple version)
// let setTimeout : (unit -> unit) -> int -> unit =
//     fun f delay ->
//         let timer = new Timer(float delay)
//         timer.AutoReset <- false
//         timer.Elapsed.Add(fun _ -> f()) // Execute the callback directly
//         timer.Start()
//         // Error handling and Dispose are omitted for simplicity

// // --- Logging Timeline Setup ---
// // Timeline dedicated to receiving log messages
// let logTimeline : Timeline<string> = Timeline null // Initialize with null

// // Reaction: Print any message defined on logTimeline with elapsed time
// logTimeline
// |> TL.map (fun message -> // Using TL.map
//     // Only print if the message is not null
//     if not (isNull message) then // Use the isNull helper
//         // Get current elapsed time and format it
//         let elapsedMs = stopwatch.Elapsed.TotalMilliseconds
//         printfn "[+%7.1fms] %s" elapsedMs message // Format: [+  123.4ms] Log Message
// )
// |> ignore // Setup the side effect, ignore the resulting Timeline<unit>

// // --- Step Timelines Definition ---
// // Timelines to hold results (string) or indicate absence (null)
// // These act as receivers for each asynchronous step's completion.
// let step0 : Timeline<string> = Timeline null // Initial trigger (using null)
// let step1 : Timeline<string> = Timeline null // Receiver for step 1 result
// let step2 : Timeline<string> = Timeline null // Receiver for step 2 result
// let step3 : Timeline<string> = Timeline null // Receiver for step 3 (final) result

// // --- Asynchronous Chain Construction ---
// // Build the chain starting from step0, linking binds sequentially
// let asyncChainResultTimeline = // This variable will ultimately point to the same timeline as step3
//     step0
//     |> TL.bind (fun value -> // Reacts to step0 updates. 'value' is string
//         // Check if the trigger value is valid (not null)
//         if isNull value
//         then ()
//         else
//             logTimeline |> TL.define Now $"Step 0 Triggered with: '{value}'"
//             // Define the async work for step 1
//             let work1 () = // Callback for setTimeout
//                 let result1 = value + " -> The" // Perform some work
//                 logTimeline |> TL.define Now $"Step 1 Produced Result: '{result1}'" // Log the result
//                 // Define the result onto the *next* step's timeline to trigger downstream bind
//                 step1 |> TL.define Now result1 // Define the string result directly
//             // Schedule the async work
//             logTimeline |> TL.define Now "Scheduling Step 1 (2000ms delay)..."
//             setTimeout work1 2000 // 2000ms delay
//         // IMPORTANT: bind must synchronously return the timeline for the next step
//         step1 // Return step1 timeline as the result of this bind operation
//     )
//     |> TL.bind (fun value -> // Reacts to step1 updates. 'value' is string
//         if isNull value
//         then ()
//         else
//             logTimeline |> TL.define Now $"Step 2 Received the Result from Step 1: '{value}'"
//             // Define the async work for step 2
//             let work2 () =
//                 let result2 = value + " -> Sequence" // Perform some work
//                 logTimeline |> TL.define Now $"Step 2 Produced Result: '{result2}'"
//                 step2 |> TL.define Now result2 // Define the string result directly
//             logTimeline |> TL.define Now "Scheduling Step 2 (3000ms delay)..."
//             setTimeout work2 3000 // 3000ms delay
//         step2
//     )
//     |> TL.bind (fun value -> // Reacts to step2 updates. 'value' is string
//         if isNull value
//         then ()
//         else
//             logTimeline |> TL.define Now $"Step 3 Received the Result from Step 2: '{value}'"
//             // Define the async work for step 3
//             let work3 () =
//                 let result3 = value + " -> Done!!"
//                 logTimeline |> TL.define Now $"Step 3 Produced Result: '{result3}'"
//                 step3 |> TL.define Now result3 // Define the string result directly
//             logTimeline |> TL.define Now "Scheduling Step 3 (1000ms delay)..."
//             setTimeout work3 1000 // 1000ms delay
//         step3
//     )

// // --- Sequence Start ---
// logTimeline |> TL.define Now "Starting sequence..."
// stopwatch.Start() // Start measuring elapsed time
// step0 |> TL.define Now "Hello!" // Define the initial string value directly

// // --- Wait for Completion (Simple Demo Method) ---
// // Wait long enough for all async operations (2s + 3s + 1s = 6s) to complete.
// // NOTE: Thread.Sleep blocks the current thread and is generally not suitable
// // for production applications (especially UI apps), but serves for this simple console demo.
// System.Threading.Thread.Sleep(7000) // Wait 7 seconds

// stopwatch.Stop() // Stop measuring time
// logTimeline |> TL.define Now $"Sequence finished. Total elapsed: {stopwatch.Elapsed}"





// // Assuming Timeline type and TL module (including map, define, link, isNull, Now)
// // are defined elsewhere and accessible.
// // For example:
// // module Timeline =
// //     type Time = System.DateTimeOffset // Or any suitable time representation
// //     let Now : Time = System.DateTimeOffset.UtcNow
// //
// //     type Timeline<'a> = { mutable _last: 'a ; (* other fields if any *) } // Simplified stub
// //
// //     // Factory function for Timeline
// //     let create<'a> (initialValue: 'a) : Timeline<'a> = { _last = initialValue }
// //
// //     // Helper for null checks if 'a can be null
// //     let isNull<'a> (value: 'a) : bool = match box value with null -> true | _ -> false
// //
// // module TL =
// //     // Simplified stub for define
// //     let define<'a> (_time: Timeline.Time) (newValue: 'a) (timeline: Timeline<'a>) : unit =
// //         timeline._last <- newValue
// //         // Here, actual implementation would trigger dependent updates
// //
// //     // Simplified stub for map
// //     let map<'a, 'b> (f: 'a -> 'b) (timeline: Timeline<'a>) : Timeline<'b> =
// //         let initialMappedValue = f timeline._last
// //         let newTimeline = Timeline initialMappedValue
// //         // In a real implementation, a dependency would be registered so that
// //         // when 'timeline' updates, 'f' is called and 'newTimeline' is updated.
// //         // For immediate effect of initial value as per document:
// //         ignore(f timeline._last) // Simulates immediate application for side-effecting functions
// //         newTimeline
// //
// //     // Simplified stub for link
// //     let link<'a> (source: Timeline<'a>) (target: Timeline<'a>) : unit =
// //         // Propagate initial value
// //         define Now source._last target
// //         // In a real implementation, a dependency would be registered so that
// //         // when 'source' updates, 'target' is also updated.
// //         // For simulation purposes, we can conceptualize it as:
// //         // source |> map (fun v -> target |> define Now v) |> ignore
// //         ()