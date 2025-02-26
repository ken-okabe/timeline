import { Timeline } from './timeline';
import { isNullT, Or, And } from './timelineEx';
import { AndResult } from './timelineEx';

const log = <A>(a: A): void => console.log(a);

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

console.log("--------------------------------------------");
// Example 1: String Timeline
// Initialize Timeline with Null
const timeline = Timeline<string | null>(null);
// Map the Timeline
// If the value is Null, do nothing
// Otherwise, log the value
// This behavior is similar to Promise .then() method
timeline
    .map(value => {
        if (isNullT(value)) {
            // do nothing on Null
        } else {
            log(value);
        }
    });

timeline.next("Hello");
timeline.next("World!");
timeline.next("TypeScript");
timeline.next(null);

console.log("--------------------------------------------");
// Example 2: Integer Object Timeline
// Initialize Timeline with Null
const timelineNumber = Timeline<number | null>(null);
// Map the Timeline
timelineNumber
    .map((value) => {
        log(value);
    });

timelineNumber.next(1);
timelineNumber.next(2);
timelineNumber.next(3);
timelineNumber.next(null);

console.log("--------------------------------------------");
// Example 3: Command Object Timeline

interface CommandObj {
    cmd: string;
    msg: string;
}
// Initialize Timeline with Null
const timelineObj = Timeline<CommandObj | null>(null);
// Map the Timeline
// If the value is Null, do nothing
// Otherwise, log the value
// This behavior is similar to Promise .then() method
timelineObj
    .map((value) => {
        if (isNullT(value)) {
            // do nothing on Null
        } else {
            log(value);
        }
    });

timelineObj.next({ cmd: "text", msg: "Hello" });
timelineObj.next({ cmd: "text", msg: "Bye" });
timelineObj.next(null); // do nothing

console.log("--------------------------------------------");

let timelineA: Timeline<any>
    = Timeline<object | AndResult<object> | null>(null);
let timelineB: Timeline<any>
    = Timeline<object | AndResult<object> | null>(null);
let timelineC: Timeline<any>
    = Timeline<object | AndResult<object> | null>(null);

let timelineAB =
     And(timelineA, timelineB);
let timelineABC =
     And(timelineAB, timelineC);

timelineABC.map(log);  // No need for |> ignore equivalent in TS

timelineA.next("A");
timelineB.next("B");
timelineC.next("C");