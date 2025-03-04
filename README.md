# ⏱️ Timeline

## Reactive State Management for Universal Programming Languages

Timeline is a lightweight, functional reactive programming (FRP) library that provides elegant state management across multiple programming languages. Originally implemented in F#, this repository now includes ports to various languages while maintaining the same core principles and API.

## Overview

Timeline offers a simple yet powerful abstraction for managing and propagating state changes throughout your application. At its core, Timeline implements a reactive pattern where values change over time and these changes automatically trigger registered functions, creating a clean, declarative approach to state management.

Key features:

- Minimal dependency footprint
- Functional programming inspired design
- Consistent API across different language implementations
- Composable operations (map, bind, and, or)
- Easy integration with existing codebases

Whether you're building user interfaces, managing application state, handling asynchronous events, or coordinating complex data flows, Timeline provides a unified approach that works seamlessly across language boundaries.

## Usage Examples

<img width="100%" src="https://raw.githubusercontent.com/ken-okabe/web-images/main/javascript.svg">

```js
// Create a new timeline with initial value
const counterTimeline = Timeline(0);

// Register a listener to react to changes
counterTimeline
  .map(count =>
    console.log(`Counter changed to: ${count}`)
  );
// logs: "Counter changed to: 0"

// Update the timeline value
counterTimeline.next(1); // logs: "Counter changed to: 1"
counterTimeline.next(2); // logs: "Counter changed to: 2"
```

<img width="100%" src="https://raw.githubusercontent.com/ken-okabe/web-images/main/typescript.svg">

```ts
// Initialize Timeline with Null
// This creates a new Timeline that can hold either a string or null
const timeline = Timeline<string | null>(null);

// Map the Timeline to register a callback function
// This function will be called whenever the Timeline value changes
// The behavior is similar to a Promise's .then() method
timeline
    .map(value => {
        if (isNullT(value)) {
            // Skip processing when value is null
            // This allows for conditional handling based on value state
        } else {
            // Process and display non-null values
            log(value);
        }
    });

// Update the Timeline with new values
// Each next() call triggers the map function above
timeline.next("Hello");     // Logs: "Hello"
timeline.next("World!");    // Logs: "World!"
timeline.next("TypeScript"); // Logs: "TypeScript"
timeline.next(null);        // No logging occurs (null value)
```

<img width="100%" src="https://raw.githubusercontent.com/ken-okabe/web-images/main/fsharp.svg">

```fsharp
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
```

<img width="100%" src="https://raw.githubusercontent.com/ken-okabe/web-images/main/fsharp.svg">

```fsharp
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
```

<img width="100%" src="https://raw.githubusercontent.com/ken-okabe/web-images/main/fsharp.svg">

```fsharp
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
```

<img width="100%" src="https://raw.githubusercontent.com/ken-okabe/web-images/main/fsharp.svg">

```fsharp
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
```

<img width="100%" src="https://raw.githubusercontent.com/ken-okabe/web-images/main/typescript.svg">

```ts
// Timeline bind sequence
const timeline0 = Timeline<string | null>(null);
const timeline1 = Timeline<string | null>(null);
const timeline2 = Timeline<string | null>(null);
const timeline3 = Timeline<string | null>(null);

// Chain of bindings with setTimeout
timeline0
  .bind(value => {
    if (isNullT(value)) {
      // Do nothing if value is null
    } else {
      setTimeout(() => {
        const msg = "Hello";
        log(msg);
        timeline1.next(msg);
      }, 1000);
    }
    return timeline1;
  }) // Return timeline1 directy to chain the next bind
  .bind(value => {
    if (isNullT(value)) {
      // Do nothing if value is null
    } else {
      setTimeout(() => {
        const msg = "World!";
        log(msg);
        timeline2.next(msg);
      }, 2000);
    }
    return timeline2;
  }) // Return timeline2 directy to chain the next bind
  .bind(value => {
    if (isNullT(value)) {
      // Do nothing if value is null
    } else {
      setTimeout(() => {
        const msg = "Sequence ends.";
        log(msg);
        timeline3.next(msg);
      }, 1000);
    }
    return timeline3;
  }); // Return timeline3 directy to chain the next bind

// Start the sequence to trigger the first bind
timeline0.next("Start!");

```

## 💡 What is Null, Nullable and Option Types?

<img width="100%" src="https://raw.githubusercontent.com/ken-okabe/web-images/main/note.svg">

### [Null pointer](https://en.wikipedia.org/wiki/Null_pointer)

> Because a null pointer does not point to a meaningful object, an attempt to access the data stored at that (invalid) memory location may cause a run-time error or immediate program crash. This is the **null pointer error**. It is one of the most common types of software weaknesses,[[1]](https://en.wikipedia.org/wiki/Null_pointer#cite_note-1) and [Tony Hoare](https://en.wikipedia.org/wiki/Tony_Hoare "Tony Hoare"), who introduced the concept, has referred to it as a  **"billion dollar mistake"** .

#### [History](https://en.wikipedia.org/wiki/Null_pointer#History)

> In 2009,  [Tony Hoare](https://en.wikipedia.org/wiki/Tony_Hoare "Tony Hoare")  stated[[15]](https://en.wikipedia.org/wiki/Null_pointer#cite_note-15)  that he invented the null reference in 1965 as part of the  [ALGOL W](https://en.wikipedia.org/wiki/ALGOL_W "ALGOL W")  language. In that 2009 reference Hoare describes his invention as a "billion-dollar mistake":

>> I call it my billion-dollar mistake. It was the invention of the null reference in 1965. At that time, I was designing the first comprehensive type system for references in an object oriented language (ALGOL W). My goal was to ensure that all use of references should be absolutely safe, with checking performed automatically by the compiler. But I couldn't resist the temptation to put in a null reference, simply because it was so easy to implement. This has led to innumerable errors, vulnerabilities, and system crashes, which have probably caused a billion dollars of pain and damage in the last forty years.

<img width="100%" src="https://raw.githubusercontent.com/ken-okabe/web-images/main/notefooter.svg">

Null values have a notorious reputation in the programming world, often leading to runtime errors and unexpected behavior. In response, functional programming languages like Haskell, OCaml, and F# have adopted a different approach to value representation, favoring the [Option types](https://en.wikipedia.org/wiki/Option_type), represented as  `None | Some a`  in these languages, over traditional null values.

The [Option types](https://en.wikipedia.org/wiki/Option_type), while often perceived as complex for beginners, can be conceptualized using  **the analogy of lists or arrays** . Consider a container structure that can either be  **empty, represented by  `[]`**  , or  **contain a value, represented by  `[a]`**  .The Option types introduce an extended concept:

| Lists/Arrays | Option Types  |
|--------------|------------------------|
| `[]`  |  `None`  |
| `[a]` |  `Some a` |

---

Appearently, the Option types can be useful, but they can also lead to unnecessarily complex structures.

---

Consider a  **Cell** .

![image](https://raw.githubusercontent.com/ken-okabe/web-images4/main/img_1712455522726.png)

This can be represented by

-  `[0]`

-  `Some 0`

---

In a case the cell is empty,

![image](https://raw.githubusercontent.com/ken-okabe/web-images4/main/img_1712816212511.png)

This can be represented by

-  `[]`

-  `None`

This system works so far.

---

However, the List or Option type can be easily nested such as:

-  `[[0]]`

-  `Some (Some 0)`

corresponds to:

![image](https://raw.githubusercontent.com/ken-okabe/web-images4/main/img_1713849900596.png)

or

-  `[[]]`

-  `Some None`

corresponds to:

![image](https://raw.githubusercontent.com/ken-okabe/web-images4/main/img_1713849984060.png)

---

What we need is  **not a nested Cell**  that is weired and meaningless but simply  **an empty Cell** .

---

TypeScript avoids the need for nested Option types by leveraging [Nullable types](https://en.wikipedia.org/wiki/Nullable_type) for optional value representation."

**Let's explore an example of a VSCode Extension that requires extracting the text from the active text editor.**

![image](https://raw.githubusercontent.com/ken-okabe/web-images4/main/img_1713851148106.png)

`vscode.window.activeTextEditor.document.getText()` is the adequate API, in TypeScript.

<img width="100%" src="https://raw.githubusercontent.com/ken-okabe/web-images/main/typescript.svg">

![image](https://raw.githubusercontent.com/ken-okabe/web-images4/main/img_1713851518058.png)

The TypeScript compiler is issuing errors and warnings.

![image](https://raw.githubusercontent.com/ken-okabe/web-images4/main/img_1713851695486.png)

The problem is:

`'vscode.window.activeTextEditor' is possibly 'undefined'.`

In JavaScript,  `undefined`  signifies a variable that has been declared but not yet assigned a value. While both  `undefined`  and  `null`  exist in the language with slight differences, we won't delve into those details here. For our purposes, we can consider  `undefined`  to be similar to  `null` in a general sense.

**To visualize, it's like this!**

![image](https://raw.githubusercontent.com/ken-okabe/web-images4/main/img_1713852091388.png)

Since *VS Code users can close all tabs in the editor,*   `vscode.window.activeTextEditor`  might become  `undefined` .

The situation with  `vscode.window.activeTextEditor`  becoming  `undefined` is similar to having  **an empty cell in a spreadsheet** . Both represent the absence of a value we might expect to be present.

![image](https://raw.githubusercontent.com/ken-okabe/web-images4/main/img_1712816212511.png)

So, the proper type should be as below:

![image](https://raw.githubusercontent.com/ken-okabe/web-images4/main/img_1713853524090.png)

This is the [Nullable type](https://en.wikipedia.org/wiki/Nullable_type) and what we really need.

---

In Functional Programming, everything is an expression or operation.

When constructing expressions for mathematically consistent algebraic structures, it is essential to employ the  **correct types**  and their  **corresponding operators** .

The concept of  ***null references being a "billion-dollar mistake"***  stems from the  **lack of a well-designed null type and corresponding operators**  for programmers to use effectively.

In this case, we should use  **[Optional chaining ( `?.` )](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining) operator**  in JavaScript([ES2020](https://tc39.es/ecma262/2020/))/TypeScript

> The **optional chaining (`?.`)** operator accesses an object's property or calls a function. If the object accessed or function called using this operator is [`undefined`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined) or [`null`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/null), the expression short circuits and evaluates to [`undefined`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined) instead of throwing an error.

Accordingly, the TypeScript code with the error should be fixed as below:

![image](https://raw.githubusercontent.com/ken-okabe/web-images4/main/img_1713854747266.png)

![image](https://raw.githubusercontent.com/ken-okabe/web-images4/main/img_1713854832322.png)

*While the naming convention "optional chaining" evokes Option types, its actual behavior differs from nested Option types. Unlike Option types, which allow values to be either Some(value) or None, nullable chaining deals with values that can either be valid values or null. Therefore, "nullable chaining" might be a more accurate and descriptive name.*

# Timeline Library Specification (F#)

## Overview

Timeline is a lightweight reactive programming library that implements a simple yet powerful observable pattern. It allows values to change over time while automatically propagating those changes to dependent computations.

## Core Concepts

The Timeline library is built around a central data structure called `Timeline<'a>` which:

1. Stores the most recent value of type `'a`
2. Maintains a list of callback functions that execute when the value changes
3. Provides monadic and functor operations for functional composition

## Type Definition

```fsharp
type Timeline<'a> =
    { mutable _last: 'a              // Stores the most recent value
      mutable _fns: list<'a -> unit> }  // List of functions to execute on updates
```

## API Reference

### Constructor

- `Timeline<'a>`: Creates a new Timeline with an initial value
  ```fsharp
  // 'a -> Timeline<'a>
  let timeline = Timeline initialValue
  ```

### Core Operations

- `TL.last`: Retrieves the current value from a Timeline
  ```fsharp
  // Timeline<'a> -> 'a
  let currentValue = timeline |> TL.last
  ```

- `TL.next`: Updates a Timeline with a new value and triggers all registered callbacks
  ```fsharp
  // 'a -> Timeline<'a> -> unit
  timeline |> TL.next newValue
  ```

- `TL.unlink`: Removes all registered callbacks from a Timeline
  ```fsharp
  // Timeline<'a> -> unit
  timeline |> TL.unlink
  ```

### Functional Composition

- `TL.bind`: Monadic bind operation that connects Timelines in sequence
  ```fsharp
  // ('a -> Timeline<'b>) -> Timeline<'a> -> Timeline<'b>
  let timelineB = timelineA |> TL.bind (fun value -> Timeline (transform value))
  ```

- `TL.map`: Functor map operation that transforms Timeline values
  ```fsharp
  // ('a -> 'b) -> Timeline<'a> -> Timeline<'b>
  let timelineB = timelineA |> TL.map transform
  ```

## Detailed Operation Descriptions

### TL.last: Timeline<'a> -> 'a

Retrieves the current value stored in the Timeline. This is a simple accessor that returns the `_last` field of the Timeline record.

### TL.next: 'a -> Timeline<'a> -> unit

Updates the Timeline with a new value and executes all registered callback functions with that value. This is the primary means of pushing new values into the reactive system.

### TL.bind: ('a -> Timeline<'b>) -> Timeline<'a> -> Timeline<'b>

The monadic bind operation connects two Timelines such that:

1. The function is applied to the current value of the source Timeline to create a new target Timeline
2. A propagation function is registered with the source Timeline
3. Future updates to the source will flow through to the target

Bind allows for composing Timelines where each step might depend on the previous value.

### TL.map: ('a -> 'b) -> Timeline<'a> -> Timeline<'b>

The functor map operation creates a derived Timeline where:

1. The function is applied to the current value of the source Timeline
2. A new Timeline is created with the transformed value
3. A propagation function is registered with the source Timeline
4. Future updates to the source will be transformed and propagated to the target

Map allows for simple transformations of values flowing through Timelines.

### TL.unlink: Timeline<'a> -> unit

Removes all registered callback functions from the Timeline, effectively disconnecting it from any dependent Timelines. This is important for preventing memory leaks when a Timeline is no longer needed.

## Reactive Programming Pattern

Timeline implements a reactive programming pattern where:

1. Changes to source Timelines automatically propagate to derived Timelines
2. Computation chains can be constructed using `bind` and `map` operations
3. Asynchronous processes can be sequenced and coordinated through Timeline chains

## Example Usage

```fsharp
// Create source timeline
let source = Timeline 0

// Create a derived timeline that doubles the value
let doubled = source |> TL.map (fun x -> x * 2)

// Create another derived timeline that adds 10
let added = doubled |> TL.map (fun x -> x + 10)

// Update the source
source |> TL.next 5

// Now: source._last = 5, doubled._last = 10, added._last = 20
```

## Asynchronous Chaining

Timeline can be used to coordinate asynchronous operations:

```fsharp
// Implementation of setTimeout API, similar to JavaScript
open System.Timers
let setTimeout f delay =
    let timer = new Timer(float delay)
    timer.AutoReset <- false
    timer.Elapsed.Add(fun _ -> f())
    timer.Start()

// Chain of bindings with setTimeout
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
) // Return timeline1 directy to chain the next bind

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
) // Return timeline2 directy to chain the next bind

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
) // Return timeline3 directy to chain the next bind
|>ignore

// Start the sequence to trigger the first bind
timeline0
|> TL.next "Start!"

System.Console.ReadKey() |> ignore 
// Keep the console window open in debug mode
```

## Implementation Notes

- Timeline uses mutable fields for efficiency
- The bind and map operations maintain references to their source Timelines
- To prevent memory leaks, use `unlink` to clear callbacks when a Timeline is no longer needed