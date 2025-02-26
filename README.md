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

TypeScript cleverly avoids the  **complexity of nested Option types**  by employing the [Nullable types](https://en.wikipedia.org/wiki/Nullable_type) instead.

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

In Functional Programming, everything is an expression or operation ([💡 What is Functional Programming?](./README-whatisFP.md)).

When constructing expressions for mathematically consistent algebraic structures, it is essential to employ the  **correct types**  and their  **corresponding operators** .

The concept of  ***null references being a "billion-dollar mistake"***  stems from the  **lack of a well-designed null type and corresponding operators**  for programmers to use effectively.

In this case, we should use  **[Optional chaining ( `?.` )](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining) operator**  in JavaScript([ES2020](https://tc39.es/ecma262/2020/))/TypeScript

> The **optional chaining (`?.`)** operator accesses an object's property or calls a function. If the object accessed or function called using this operator is [`undefined`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined) or [`null`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/null), the expression short circuits and evaluates to [`undefined`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined) instead of throwing an error.

Accordingly, the TypeScript code with the error should be fixed as below:

![image](https://raw.githubusercontent.com/ken-okabe/web-images4/main/img_1713854747266.png)

![image](https://raw.githubusercontent.com/ken-okabe/web-images4/main/img_1713854832322.png)

*While the naming convention "optional chaining" evokes Option types, its actual behavior differs from nested Option types. Unlike Option types, which allow values to be either Some(value) or None, nullable chaining deals with values that can either be valid values or null. Therefore, "nullable chaining" might be a more accurate and descriptive name.*