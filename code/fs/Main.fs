
open Timeline // Access the library module and Now type/value

open System // For DateTime, TimeSpan, Thread
open System.Timers
open System.Diagnostics // Required for Stopwatch

// --- Stopwatch for Elapsed Time ---
let stopwatch = Stopwatch()

// Helper: Executes function f after 'delay' ms (simple version)
let setTimeout : (unit -> unit) -> int -> unit =
    fun f delay ->
        let timer = new Timer(float delay)
        timer.AutoReset <- false
        timer.Elapsed.Add(fun _ -> f()) // Execute the callback directly
        timer.Start()
        // Error handling and Dispose are omitted for simplicity

// --- Logging Timeline Setup ---
// Timeline dedicated to receiving log messages
let logTimeline : Timeline<string> = Timeline null // Initialize with null

// Reaction: Print any message defined on logTimeline with elapsed time
logTimeline
|> TL.map (fun message -> // Using TL.map
    // Only print if the message is not null
    if not (isNull message) then // Use the isNull helper
        // Get current elapsed time and format it
        let elapsedMs = stopwatch.Elapsed.TotalMilliseconds
        printfn "[+%7.1fms] %s" elapsedMs message // Format: [+  123.4ms] Log Message
)
|> ignore // Setup the side effect, ignore the resulting Timeline<unit>

// --- Step Timelines Definition ---
// Timelines to hold results (string) or indicate absence (null)
// These act as receivers for each asynchronous step's completion.
let step0 : Timeline<string> = Timeline null // Initial trigger (using null)
let step1 : Timeline<string> = Timeline null // Receiver for step 1 result
let step2 : Timeline<string> = Timeline null // Receiver for step 2 result
let step3 : Timeline<string> = Timeline null // Receiver for step 3 (final) result

// --- Asynchronous Chain Construction ---
// Build the chain starting from step0, linking binds sequentially
let asyncChainResultTimeline = // This variable will ultimately point to the same timeline as step3
    step0
    |> TL.bind (fun value -> // Reacts to step0 updates. 'value' is string
        // Check if the trigger value is valid (not null)
        if isNull value
        then ()
        else
            logTimeline |> TL.define Now $"Step 0 Triggered with: '{value}'"
            // Define the async work for step 1
            let work1 () = // Callback for setTimeout
                let result1 = value + " -> The" // Perform some work
                logTimeline |> TL.define Now $"Step 1 Produced Result: '{result1}'" // Log the result
                // Define the result onto the *next* step's timeline to trigger downstream bind
                step1 |> TL.define Now result1 // Define the string result directly
            // Schedule the async work
            logTimeline |> TL.define Now "Scheduling Step 1 (2000ms delay)..."
            setTimeout work1 2000 // 2000ms delay
        // IMPORTANT: bind must synchronously return the timeline for the next step
        step1 // Return step1 timeline as the result of this bind operation
    )
    |> TL.bind (fun value -> // Reacts to step1 updates. 'value' is string
        if isNull value
        then ()
        else
            logTimeline |> TL.define Now $"Step 2 Received the Result from Step 1: '{value}'"
            // Define the async work for step 2
            let work2 () =
                let result2 = value + " -> Sequence" // Perform some work
                logTimeline |> TL.define Now $"Step 2 Produced Result: '{result2}'"
                step2 |> TL.define Now result2 // Define the string result directly
            logTimeline |> TL.define Now "Scheduling Step 2 (3000ms delay)..."
            setTimeout work2 3000 // 3000ms delay
        step2
    )
    |> TL.bind (fun value -> // Reacts to step2 updates. 'value' is string
        if isNull value
        then ()
        else
            logTimeline |> TL.define Now $"Step 3 Received the Result from Step 2: '{value}'"
            // Define the async work for step 3
            let work3 () =
                let result3 = value + " -> Done!!"
                logTimeline |> TL.define Now $"Step 3 Produced Result: '{result3}'"
                step3 |> TL.define Now result3 // Define the string result directly
            logTimeline |> TL.define Now "Scheduling Step 3 (1000ms delay)..."
            setTimeout work3 1000 // 1000ms delay
        step3
    )

// --- Sequence Start ---
logTimeline |> TL.define Now "Starting sequence..."
stopwatch.Start() // Start measuring elapsed time
step0 |> TL.define Now "Hello!" // Define the initial string value directly

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
//     let create<'a> (initialValue: 'a) : Timeline.Timeline<'a> = { _last = initialValue }
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