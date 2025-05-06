
open Timeline // Access the library module and Now type/value

open System // For DateTime, TimeSpan, Thread
open System.Timers
open System.Diagnostics // Required for Stopwatch

// --- Helper Functions ---

// Helper: Executes function f after 'delay' ms (simple version)
let setTimeout : (unit -> unit) -> int -> unit =
    fun f delay ->
        let timer = new Timer(float delay)
        timer.AutoReset <- false
        timer.Elapsed.Add(fun _ -> f()) // Execute the callback directly
        timer.Start()
        // Error handling and Dispose are omitted for simplicity

// Helper: Checks if a reference type or Nullable is null
let internal isNull<'a when 'a : null> (value: 'a) : bool = // Using isNull as per baseline
     obj.ReferenceEquals(value, null)

// --- Stopwatch for Elapsed Time ---
// Stopwatch instance to measure elapsed time for logs
let stopwatch = Stopwatch()

// --- Logging Timeline Setup ---
// Timeline dedicated to receiving log messages
let logTimeline : Timeline<string> = Timeline null // Uses the Timeline factory from 'open Timeline'

// Reaction: Print any message defined on logTimeline with elapsed time
logTimeline
|> TL.map (fun message -> // Using TL.map as per baseline
    // Only print if the message is not null
    if not (isNull message) then // Use the local isNull helper
        // Get current elapsed time and format it
        let elapsedMs = stopwatch.Elapsed.TotalMilliseconds
        printfn "[+%7.1fms] %s" elapsedMs message // Format: [+  123.4ms] Log Message
)
|> ignore // Setup the side effect, ignore the resulting Timeline<unit>

// --- Step Timelines Definition ---
// Timelines to hold results (as Some result) or indicate absence (None)
// These act as receivers for each asynchronous step's completion.
let step0 : Timeline<string option> = Timeline None // Initial trigger
let step1 : Timeline<string option> = Timeline None // Receiver for step 1 result
let step2 : Timeline<string option> = Timeline None // Receiver for step 2 result
let step3 : Timeline<string option> = Timeline None // Receiver for step 3 (final) result

// --- Asynchronous Chain Construction ---
// Build the chain starting from step0, linking binds sequentially
let asyncChainResultTimeline = // This variable will ultimately point to the same timeline as step3
    step0
    |> TL.bind (fun maybeValue -> // Using TL.bind as per baseline; Reacts to step0 updates
        match maybeValue with
        | None -> () // Do nothing if initial value is None
        | Some value ->
            // Log the trigger event
            logTimeline |> TL.define Now $"Step 0 Triggered with: '{value}'" // Using TL.define as per baseline
            // Define the async work for step 1
            let work1 () = // Callback for setTimeout
                let result1 = value + " -> Step 1 Result" // Perform some work
                logTimeline |> TL.define Now "Step 1 Async Work Complete."
                logTimeline |> TL.define Now $"Step 1 Produced Result: '{result1}'" // Log the result
                // Define the result onto the *next* step's timeline to trigger downstream bind
                step1 |> TL.define Now (Some result1)
            // Schedule the async work
            logTimeline |> TL.define Now "Scheduling Step 1 (2000ms delay)..."
            setTimeout work1 2000 // 2000ms delay
        // IMPORTANT: bind must synchronously return the timeline for the next step
        step1 // Return step1 timeline as the result of this bind operation
    )
    |> TL.bind (fun maybeValue -> // Using TL.bind; Reacts to step1 updates
        match maybeValue with
        | None -> ()
        | Some value ->
            logTimeline |> TL.define Now $"Step 1 Result Received: '{value}'"
            // Define the async work for step 2
            let work2 () =
                let result2 = value + " -> Step 2 Result"
                logTimeline |> TL.define Now "Step 2 Async Work Complete."
                logTimeline |> TL.define Now $"Step 2 Produced Result: '{result2}'"
                step2 |> TL.define Now (Some result2)
            logTimeline |> TL.define Now "Scheduling Step 2 (3000ms delay)..."
            setTimeout work2 3000 // 3000ms delay
        step2
    )
    |> TL.bind (fun maybeValue -> // Using TL.bind; Reacts to step2 updates
        match maybeValue with
        | None -> ()
        | Some value ->
            logTimeline |> TL.define Now $"Step 2 Result Received: '{value}'"
            // Define the async work for step 3
            let work3 () =
                let result3 = value + " -> Step 3 Result (End)"
                logTimeline |> TL.define Now "Step 3 Async Work Complete."
                logTimeline |> TL.define Now $"Step 3 Produced Result: '{result3}'"
                step3 |> TL.define Now (Some result3)
            logTimeline |> TL.define Now "Scheduling Step 3 (1000ms delay)..."
            setTimeout work3 1000 // 1000ms delay
        step3
    )

// --- Sequence Start ---
logTimeline |> TL.define Now "Starting sequence..."
stopwatch.Start() // Start measuring elapsed time
step0 |> TL.define Now (Some "Sequence Start")

// --- Wait for Completion (Simple Demo Method) ---
// Wait long enough for all async operations (2s + 3s + 1s = 6s) to complete.
// NOTE: Thread.Sleep blocks the current thread and is generally not suitable
// for production applications (especially UI apps), but serves for this simple console demo.
System.Threading.Thread.Sleep(7000) // Wait 7 seconds

stopwatch.Stop() // Stop measuring time
logTimeline |> TL.define Now $"Sequence finished. Total elapsed: {stopwatch.Elapsed}"

// Assuming Timeline type and TL module (including map, define, link, isNull, Now)
// are defined elsewhere and accessible.
// For example:
// module Timeline =
//     type Time = System.DateTimeOffset // Or any suitable time representation
//     let Now : Time = System.DateTimeOffset.UtcNow
//
//     type Timeline<'a> = { mutable _last: 'a ; (* other fields if any *) } // Simplified stub
//
//     // Factory function for Timeline
//     let create<'a> (initialValue: 'a) : Timeline<'a> = { _last = initialValue }
//
//     // Helper for null checks if 'a can be null
//     let isNull<'a> (value: 'a) : bool = match box value with null -> true | _ -> false
//
// module TL =
//     // Simplified stub for define
//     let define<'a> (_time: Timeline.Time) (newValue: 'a) (timeline: Timeline.Timeline<'a>) : unit =
//         timeline._last <- newValue
//         // Here, actual implementation would trigger dependent updates
//
//     // Simplified stub for map
//     let map<'a, 'b> (f: 'a -> 'b) (timeline: Timeline.Timeline<'a>) : Timeline.Timeline<'b> =
//         let initialMappedValue = f timeline._last
//         let newTimeline = Timeline initialMappedValue
//         // In a real implementation, a dependency would be registered so that
//         // when 'timeline' updates, 'f' is called and 'newTimeline' is updated.
//         // For immediate effect of initial value as per document:
//         ignore(f timeline._last) // Simulates immediate application for side-effecting functions
//         newTimeline
//
//     // Simplified stub for link
//     let link<'a> (source: Timeline.Timeline<'a>) (target: Timeline.Timeline<'a>) : unit =
//         // Propagate initial value
//         define Now source._last target
//         // In a real implementation, a dependency would be registered so that
//         // when 'source' updates, 'target' is also updated.
//         // For simulation purposes, we can conceptualize it as:
//         // source |> map (fun v -> target |> define Now v) |> ignore
//         ()


// // Required for HttpClient
// open System.Net.Http

// // Start of code from the document "4-timeline-eco.md"
// module TimelineEcoExample =

//     // Helper function for generic logging (as provided in the document)
//     let log : 'a -> unit = // Type signature matching F# style guide
//         fun a -> printfn "%A" a

//     // Example 1: Integer Logging Timeline
//     let runExample1 () : unit = // Encapsulated in a function for clarity
//         printfn "--- Running Example 1: Integer Logging ---"
//         // Assuming Timeline factory and TL module are accessible as per document
//         // For F# style compliance, if Timeline is a module with a 'create' function:
//         // let logIntTimeline : Timeline.Timeline<int> = Timeline 5
//         // If Timeline is a function that acts as a factory:
//         let logIntTimeline : Timeline.Timeline<int> = Timeline 5 // Using our stubbed factory

//         logIntTimeline
//         |> TL.map log // Apply the 'log' function whenever the timeline updates
//         |> ignore   // We ignore the resulting timeline (often Timeline<unit>)
//         printfn "--- End of Example 1 ---"

//     // Example 2: String Logging Timeline (with Null Handling)
//     let runExample2 () : unit = // Encapsulated in a function
//         printfn "\n--- Running Example 2: String Logging ---"
//         let logStringTimeline : Timeline.Timeline<string> = Timeline null // Using our stubbed factory

//         logStringTimeline
//         |> TL.map (fun value -> // The function passed to map performs the check
//             if not (isNull value) then // Using our stubbed isNull
//                 log value // Log only if the value is not null
//             // No else branch needed as we return unit implicitly
//         )
//         |> ignore // Setup the reaction, ignore the resulting Timeline<unit>

//         // Later, define a new value onto the timeline
//         logStringTimeline |> TL.define Now "Hello" // Using stubbed Now and define
//         // Output: Hello (printed when define is called)

//         logStringTimeline |> TL.define Now "Timeline I/O!"
//         // Output: Timeline I/O! (printed when define is called)

//         logStringTimeline |> TL.define Now null // Define null again
//         // Output: (nothing printed)
//         printfn "--- End of Example 2 ---"


//     // Example 3: Linking Timelines for Debugging
//     let runExample3 () : unit =
//         printfn "\n--- Running Example 3: Linking Timelines ---"
//         // Setup logStringTimeline (as in Example 2, simplified for this example)
//         let logStringTimeline : Timeline.Timeline<string> = Timeline null
//         logStringTimeline
//         |> TL.map (fun value ->
//             if not (isNull value) then
//                 log value
//         )
//         |> ignore

//         // An arbitrary timeline in your application
//         let timelineA : Timeline.Timeline<string> = Timeline null // Start with null

//         // Simply link timelineA to your logging timeline!
//         timelineA |> TL.link logStringTimeline // Using stubbed link
//         // Output: (nothing printed initially as timelineA is null, due to stub link behavior)
//         // Real link would propagate initial null, map would prevent logging.

//         // Now, whenever timelineA is updated...
//         timelineA |> TL.define Now "linked"
//         // Output: linked (propagated to logStringTimeline and printed)

//         timelineA |> TL.define Now "message!"
//         // Output: message! (propagated and printed)

//         timelineA |> TL.define Now null
//         // Output: (nothing printed)
//         printfn "--- End of Example 3 ---"

//     // Example 4: Handling Asynchronous Input: HTTP Request Example
//     // Note: This example involves actual network I/O.
//     // The stubbed Timeline won't fully represent the async nature without a real scheduler.
//     let runExample4Async () : Async<unit> = // Encapsulated and made async
//         async {
//             printfn "\n--- Running Example 4: Async HTTP Request ---"
//             // 1. Define Timelines for Request and Response
//             let httpRequestUrlTimeline : Timeline.Timeline<string> = Timeline null
//             let httpResponseTimeline : Timeline.Timeline<string> = Timeline null

//             // Setup logger for httpResponseTimeline (similar to logStringTimeline)
//             httpResponseTimeline
//             |> TL.map (fun value ->
//                 if not (isNull value) then
//                     log value
//             )
//             |> ignore

//             // 2. Set up the I/O Handler (Async Request)
//             // Use a single HttpClient instance for efficiency
//             use httpClient = new HttpClient() // 'use' for proper disposal

//             httpRequestUrlTimeline
//             |> TL.map (fun url -> // Function executed when httpRequestUrlTimeline updates
//                 if not (isNull url) then
//                     // Asynchronously perform the HTTP GET request
//                     async {
//                         try
//                             // Perform the async operations
//                             let! response = httpClient.GetAsync(url) |> Async.AwaitTask
//                             response.EnsureSuccessStatusCode() |> ignore // Throw exception on HTTP error
//                             let! content = response.Content.ReadAsStringAsync() |> Async.AwaitTask

//                             // Define the successful response content onto the response timeline
//                             httpResponseTimeline |> TL.define Now content

//                         with ex ->
//                             // Define an error message onto the response timeline
//                             let errorMsg = $"HTTP Request Failed: {url} - {ex.Message}"
//                             httpResponseTimeline |> TL.define Now errorMsg
//                     }
//                     |> Async.StartImmediate // Start the async workflow
//                 // No return value needed for the mapped function if it's for side effects primarily
//             )
//             |> ignore // Ignore the Timeline<Async<unit>> or Timeline<unit> result of map

//             // 3. (Covered by setting up logger for httpResponseTimeline above)

//             // 4. Trigger the Request
//             // For testing, ensure you have internet or use a local test server URL.
//             // Using a placeholder that might not be reachable to demonstrate error handling too.
//             printfn "Triggering HTTP request to a test URL (example.com)..."
//             httpRequestUrlTimeline |> TL.define Now "http://example.com" // Changed to http for simplicity in some environments

//             // Allow some time for the async operation to complete in a test environment
//             // In a real app, you wouldn't typically Thread.Sleep here.
//             // The reaction to httpResponseTimeline would handle the result when it arrives.
//             // For a simple console test to see output:
//             do! Async.Sleep 5000 // Wait 5 seconds for the request to likely complete

//             printfn "--- End of Example 4 ---"
//         }

//     // Main execution function to run examples
//     let runAllExamples () : unit =
//         runExample1()
//         runExample2()
//         runExample3()
//         runExample4Async() |> Async.RunSynchronously // Run the async example

// // To run the examples (e.g., in an F# script or a main function):
// TimelineEcoExample.runAllExamples()













// open System // For DateTime, TimeSpan, Thread
// open System.Timers
// open System.Diagnostics // Required for Stopwatch
// open Timeline
// open TL // Using bind, define, map

// // --- Helper Functions ---

// // Helper: Executes function f after 'delay' ms (simple version)
// let setTimeout : (unit -> unit) -> int -> unit =
//     fun f delay ->
//         let timer = new Timer(float delay)
//         timer.AutoReset <- false
//         timer.Elapsed.Add(fun _ -> f()) // Execute the callback directly
//         timer.Start()
//         // Error handling and Dispose are omitted for simplicity

// // Helper: Checks if a reference type or Nullable is null
// let internal isNull<'a when 'a : null> (value: 'a) : bool =
//      obj.ReferenceEquals(value, null)

// // --- Stopwatch for Elapsed Time ---
// // Stopwatch instance to measure elapsed time for logs
// let stopwatch = Stopwatch()

// // --- Logging Timeline Setup ---
// // Timeline dedicated to receiving log messages
// let logTimeline : Timeline<string> = Timeline null

// // Reaction: Print any message defined on logTimeline with elapsed time
// logTimeline
// |> map (fun message ->
//     // Only print if the message is not null
//     if not (isNull message) then
//         // Get current elapsed time and format it
//         let elapsedMs = stopwatch.Elapsed.TotalMilliseconds
//         printfn "[+%7.1fms] %s" elapsedMs message // Format: [+  123.4ms] Log Message
// )
// |> ignore // Setup the side effect, ignore the resulting Timeline<unit>

// // --- Step Timelines Definition ---
// // Timelines to hold results (as Some result) or indicate absence (None)
// // These act as receivers for each asynchronous step's completion.
// let step0 : Timeline<string option> = Timeline None // Initial trigger
// let step1 : Timeline<string option> = Timeline None // Receiver for step 1 result
// let step2 : Timeline<string option> = Timeline None // Receiver for step 2 result
// let step3 : Timeline<string option> = Timeline None // Receiver for step 3 (final) result

// // --- Asynchronous Chain Construction ---
// // Build the chain starting from step0, linking binds sequentially
// let asyncChainResultTimeline = // This variable will ultimately point to the same timeline as step3
//     step0
//     |> bind (fun maybeValue -> // Reacts to step0 updates
//         match maybeValue with
//         | None -> () // Do nothing if initial value is None
//         | Some value ->
//             // Log the trigger event
//             logTimeline |> define Now $"Step 0 Triggered with: '{value}'"
//             // Define the async work for step 1
//             let work1 () = // Callback for setTimeout
//                 let result1 = value + " -> Step 1 Result" // Perform some work
//                 logTimeline |> define Now "Step 1 Async Work Complete."
//                 logTimeline |> define Now $"Step 1 Produced Result: '{result1}'" // Log the result
//                 // Define the result onto the *next* step's timeline to trigger downstream bind
//                 step1 |> define Now (Some result1)
//             // Schedule the async work
//             logTimeline |> define Now "Scheduling Step 1 (2000ms delay)..."
//             setTimeout work1 2000 // 2000ms delay
//         // IMPORTANT: bind must synchronously return the timeline for the next step
//         step1 // Return step1 timeline as the result of this bind operation
//     )
//     |> bind (fun maybeValue -> // Reacts to step1 updates
//         match maybeValue with
//         | None -> ()
//         | Some value ->
//             logTimeline |> define Now $"Step 1 Result Received: '{value}'"
//             let work2 () =
//                 let result2 = value + " -> Step 2 Result"
//                 logTimeline |> define Now "Step 2 Async Work Complete."
//                 logTimeline |> define Now $"Step 2 Produced Result: '{result2}'"
//                 step2 |> define Now (Some result2)
//             logTimeline |> define Now "Scheduling Step 2 (3000ms delay)..."
//             setTimeout work2 3000 // 3000ms delay
//         step2
//     )
//     |> bind (fun maybeValue -> // Reacts to step2 updates
//         match maybeValue with
//         | None -> ()
//         | Some value ->
//             logTimeline |> define Now $"Step 2 Result Received: '{value}'"
//             let work3 () =
//                 let result3 = value + " -> Step 3 Result (End)"
//                 logTimeline |> define Now "Step 3 Async Work Complete."
//                 logTimeline |> define Now $"Step 3 Produced Result: '{result3}'"
//                 step3 |> define Now (Some result3)
//             logTimeline |> define Now "Scheduling Step 3 (1000ms delay)..."
//             setTimeout work3 1000 // 1000ms delay
//         step3
//     )

// // --- Sequence Start ---
// logTimeline |> define Now "Starting sequence..."
// stopwatch.Start() // Start measuring elapsed time
// step0 |> define Now (Some "Sequence Start")

// // --- Wait for Completion (Simple Demo Method) ---
// // Wait long enough for all async operations (2s + 3s + 1s = 6s) to complete.
// // NOTE: Thread.Sleep blocks the current thread and is generally not suitable
// // for production applications (especially UI apps), but serves for this simple console demo.
// System.Threading.Thread.Sleep(7000) // Wait 7 seconds

// stopwatch.Stop() // Stop measuring time
// logTimeline |> define Now $"Sequence finished. Total elapsed: {stopwatch.Elapsed}"





















// // --- Simple Assertion Helper ---
// let assertEqual expected actual message =
//     if expected <> actual then
//         printfn "Assertion Failed: %s. Expected: %A, Actual: %A" message expected actual
//     // else printfn "Assertion Passed: %s" message // Optional: uncomment for verbose success messages

// let mutable testCounter = 0
// let runTest testName testFn =
//     testCounter <- testCounter + 1
//     printfn "\n--- Test %d: %s ---" testCounter testName
//     try
//         testFn()
//         printfn "Result: Passed"
//     with
//     | ex -> printfn "Result: FAILED with Exception: %s\n%s" ex.Message ex.StackTrace // Added stack trace

// // --- Test Cases ---

// runTest "Timeline Creation and TL.at" <| fun () ->
//     let t1 = Timeline 10
//     let value = t1 |> TL.at Now // Use Now
//     assertEqual 10 value "Initial value should be 10"

// runTest "TL.define and TL.at" <| fun () ->
//     let t1 = Timeline "initial"
//     t1 |> TL.define Now "updated" // Use Now
//     let value = t1 |> TL.at Now // Use Now
//     assertEqual "updated" value "Value should be updated after define"

// runTest "TL.map basic functionality" <| fun () ->
//     let t1 = Timeline 5
//     let t2 = t1 |> TL.map (fun x -> x * 2)
//     assertEqual 10 (t2 |> TL.at Now) "Mapped timeline initial value" // Use Now

//     t1 |> TL.define Now 7 // Use Now
//     assertEqual 14 (t2 |> TL.at Now) "Mapped timeline value after source update" // Use Now

// runTest "TL.map - Functor Law 1: Identity (map id = id)" <| fun () ->
//     let t1 = Timeline 100
//     let t_map_id = t1 |> TL.map id
//     assertEqual (t1 |> TL.at Now) (t_map_id |> TL.at Now) "Identity Law: Initial value" // Use Now

//     t1 |> TL.define Now 200 // Use Now
//     assertEqual (t1 |> TL.at Now) (t_map_id |> TL.at Now) "Identity Law: Value after update" // Use Now

// runTest "TL.map - Functor Law 2: Composition (map (f >> g) = map f >> map g)" <| fun () ->
//     // Add explicit type annotation to 'x' in function 'f'
//     let f = fun (x: int) -> sprintf "N:%d" x
//     // Add explicit type annotation to 's' in function 'g'
//     let g = fun (s: string) -> s.Length > 4
//     let t1 = Timeline 123
//     let t_lhs = t1 |> TL.map (f >> g)
//     let t_rhs = t1 |> TL.map f |> TL.map g

//     assertEqual (t_lhs |> TL.at Now) (t_rhs |> TL.at Now) "Composition Law: Initial value" // Use Now

//     t1 |> TL.define Now 98765 // Use Now
//     assertEqual (t_lhs |> TL.at Now) (t_rhs |> TL.at Now) "Composition Law: Value after update (true)" // Use Now

//     t1 |> TL.define Now 1 // Use Now
//     assertEqual (t_lhs |> TL.at Now) (t_rhs |> TL.at Now) "Composition Law: Value after update (false)" // Use Now

// runTest "TL.bind basic functionality" <| fun () ->
//     let tSource = Timeline 1
//     let monadf x = Timeline (x + 10) // Use global Timeline factory
//     let tResult = tSource |> TL.bind monadf

//     assertEqual 11 (tResult |> TL.at Now) "Bind: Initial result value" // Use Now

//     tSource |> TL.define Now 5 // Use Now
//     assertEqual 15 (tResult |> TL.at Now) "Bind: Result value after source update" // Use Now

// runTest "TL.bind - Monad Law 1: Left Identity (ID a |> bind f = f a)" <| fun () ->
//     let x = 50
//     let f = fun i -> Timeline (sprintf "Val: %d" i) // Use global Timeline factory
//     let t_lhs = (TL.ID x) |> TL.bind f
//     let t_rhs = f x

//     assertEqual (t_lhs |> TL.at Now) (t_rhs |> TL.at Now) "Left Identity Law" // Use Now

// runTest "TL.bind - Monad Law 2: Right Identity (m |> bind ID = m)" <| fun () ->
//     let m = Timeline "hello" // Use global Timeline factory
//     let t_lhs = m |> TL.bind TL.ID

//     assertEqual (m |> TL.at Now) (t_lhs |> TL.at Now) "Right Identity Law: Initial value" // Use Now

//     m |> TL.define Now "world" // Use Now
//     assertEqual (m |> TL.at Now) (t_lhs |> TL.at Now) "Right Identity Law: Value after update" // Use Now

// runTest "TL.bind - Monad Law 3: Associativity ((t >>= f) >>= g = t >>= (\\x -> f x >>= g))" <| fun () ->
//     let t = Timeline 10 // Use global Timeline factory
//     let f = fun i -> Timeline (float i / 2.0) // Use global Timeline factory
//     let g = fun fl -> Timeline (fl > 3.0) // Use global Timeline factory

//     let t_lhs = t |> TL.bind f |> TL.bind g
//     let t_rhs = t |> TL.bind (TL.(>>>) f g) // Use qualified operator

//     assertEqual (t_lhs |> TL.at Now) (t_rhs |> TL.at Now) "Associativity Law: Initial value (true)" // Use Now

//     t |> TL.define Now 4 // Use Now
//     assertEqual (t_lhs |> TL.at Now) (t_rhs |> TL.at Now) "Associativity Law: Value after update (false)" // Use Now

//     t |> TL.define Now 20 // Use Now
//     assertEqual (t_lhs |> TL.at Now) (t_rhs |> TL.at Now) "Associativity Law: Value after update (true)" // Use Now

// runTest "TL.bind - Scope Cleanup Verification" <| fun () ->
//     let source = Timeline 1 // Use global Timeline factory
//     let mutable innerTimeline1 : Timeline<string> option = None
//     let mutable innerTimeline2 : Timeline<string> option = None

//     let monadf x =
//         let prefix = sprintf "Inner(%d):" x
//         let newInner = Timeline (prefix + "Initial") // Use global Timeline factory
//         if x = 1 then innerTimeline1 <- Some newInner
//         elif x = 2 then innerTimeline2 <- Some newInner
//         newInner

//     let result = source |> TL.bind monadf

//     assertEqual "Inner(1):Initial" (result |> TL.at Now) "Initial bind result" // Use Now
//     assertEqual true (innerTimeline1.IsSome) "Inner timeline 1 should exist"

//     source |> TL.define Now 2 // Use Now
//     assertEqual "Inner(2):Initial" (result |> TL.at Now) "Result after source update" // Use Now
//     assertEqual true (innerTimeline2.IsSome) "Inner timeline 2 should exist"

//     match innerTimeline1 with
//     | Some t1 -> t1 |> TL.define Now "Inner(1):UpdatedLATER" // Use Now
//     | None -> failwith "innerTimeline1 was None, test setup failed"

//     assertEqual "Inner(2):Initial" (result |> TL.at Now) "Result should NOT reflect update from disposed scope's timeline" // Use Now

//     match innerTimeline2 with
//     | Some t2 -> t2 |> TL.define Now "Inner(2):UpdatedNOW" // Use Now
//     | None -> failwith "innerTimeline2 was None, test setup failed"

//     assertEqual "Inner(2):UpdatedNOW" (result |> TL.at Now) "Result SHOULD reflect update from current scope's timeline" // Use Now

// runTest "TL.link basic functionality" <| fun () ->
//     let tSource = Timeline "A" // Use global Timeline factory
//     let tTarget = Timeline "InitialTarget" // Use global Timeline factory

//     tSource |> TL.link tTarget

//     assertEqual "A" (tTarget |> TL.at Now) "Link: Target should have source's initial value immediately" // Use Now

//     tSource |> TL.define Now "B" // Use Now
//     assertEqual "B" (tTarget |> TL.at Now) "Link: Target should update when source updates" // Use Now

// // --- Combinators Tests ---

// runTest "Combinators.map2 basic functionality" <| fun () ->
//     let tA = Timeline 10
//     let tB = Timeline "hello"
//     let tC = Combinators.map2 (fun a b -> sprintf "%s-%d" b a) tA tB

//     assertEqual (Some "hello-10") (tC |> TL.at Now) "map2: Initial value"

//     tA |> TL.define Now 20
//     assertEqual (Some "hello-20") (tC |> TL.at Now) "map2: After tA update"

//     tB |> TL.define Now "world"
//     assertEqual (Some "world-20") (tC |> TL.at Now) "map2: After tB update"
//     // Add test for None case if one input hasn't fired (depends on map2 initial state handling)

// runTest "Combinators.Or basic functionality" <| fun () ->
//     let tA = Timeline null // Start with null
//     let tB = Timeline null // Start with null
//     let tOr = Combinators.Or tA tB

//     assertEqual null (tOr |> TL.at Now) "Or: Initial value should be null"

//     tA |> TL.define Now "First A"
//     assertEqual "First A" (tOr |> TL.at Now) "Or: Should take first non-null from A"

//     tB |> TL.define Now "First B" // Should be ignored as tOr is already non-null
//     assertEqual "First A" (tOr |> TL.at Now) "Or: Should ignore B as it already has a value"

//     // Reset A to null and check if B's value comes through (resetting not directly supported, new Or needed)
//     let tA2 = Timeline null
//     let tB2 = Timeline "Value B"
//     let tOr2 = Combinators.Or tA2 tB2
//     assertEqual "Value B" (tOr2 |> TL.at Now) "Or: Should take initial non-null from B"

// runTest "Combinators.And (All-based) basic functionality" <| fun () ->
//     let tA = Timeline 1
//     let tB = Timeline 2
//     let tAnd = Combinators.And tA tB // Result is Timeline<list<int> option>

//     assertEqual (Some [1; 2]) (tAnd |> TL.at Now) "And: Initial value with both ready"

//     tA |> TL.define Now 10
//     assertEqual (Some [10; 2]) (tAnd |> TL.at Now) "And: After tA update"

//     tB |> TL.define Now 20
//     assertEqual (Some [10; 20]) (tAnd |> TL.at Now) "And: After tB update"

//     // Test None case (difficult to test without ability to reset a timeline to 'not ready')
//     // The current 'All'/'And' assumes initial values mean 'ready'.

// runTest "Combinators.Any basic functionality" <| fun () ->
//     let t1 = Timeline null
//     let t2 = Timeline null
//     let t3 = Timeline "Third"
//     let tAny = Combinators.Any [t1; t2; t3]

//     assertEqual "Third" (tAny |> TL.at Now) "Any: Should take the first non-null initial value"

//     t1 |> TL.define Now "First"
//     assertEqual "Third" (tAny |> TL.at Now) "Any: Should still hold the first value encountered"

//     // Test with all starting null
//     let t4 = Timeline null
//     let t5 = Timeline null
//     let tAny2 = Combinators.Any [t4; t5]
//     assertEqual null (tAny2 |> TL.at Now) "Any: Should be null initially if all inputs are null"
//     t5 |> TL.define Now "From t5"
//     assertEqual "From t5" (tAny2 |> TL.at Now) "Any: Should update when first value appears"
//     t4 |> TL.define Now "From t4"
//     assertEqual "From t5" (tAny2 |> TL.at Now) "Any: Should ignore subsequent values"

// runTest "Combinators.All basic functionality" <| fun () ->
//     let t1 = Timeline 1
//     let t2 = Timeline "A"
//     // Note: All requires list of same type due to list result
//     let tInt1 = Timeline 10
//     let tInt2 = Timeline 20
//     let tInt3 = Timeline 30
//     let tAll = Combinators.All [tInt1; tInt2; tInt3]

//     assertEqual (Some [10; 20; 30]) (tAll |> TL.at Now) "All: Initial value with all ready"

//     tInt2 |> TL.define Now 25
//     assertEqual (Some [10; 25; 30]) (tAll |> TL.at Now) "All: After one update"

//     // Test empty list case
//     let tAllEmpty : Timeline<list<int> option> = Combinators.All []
//     assertEqual (Some []) (tAllEmpty |> TL.at Now) "All: Empty list should result in Some([])"

//     // Test case where one timeline might not be 'ready' (difficult with current setup)
//     // Requires a way to signal 'no value yet' distinct from initial value.

// printfn "\n--- All Tests Run ---"
