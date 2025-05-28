import { Timeline, Now, isNull } from './timeline';

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
counterTimeline.define(Now, 1); // logs: "Counter changed to: 1"
counterTimeline.define(Now, 2); // logs: "Counter changed to: 2"

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
        if (isNull(value)) {
            // do nothing on Null
        } else {
            log(value);
        }
    });

timeline.define(Now, "Hello");
timeline.define(Now, "World!");
timeline.define(Now, "TypeScript");
timeline.define(Now, null);

console.log("--------------------------------------------");
// Example 2: Integer Object Timeline
// Initialize Timeline with Null
const timelineNumber = Timeline<number | null>(null);
// Map the Timeline
timelineNumber
    .map((value) => {
        log(value);
    });

timelineNumber.define(Now, 1);
timelineNumber.define(Now, 2);
timelineNumber.define(Now, 3);
timelineNumber.define(Now, null);

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
        if (isNull(value)) {
            // do nothing on Null
        } else {
            log(value);
        }
    });

timelineObj.define(Now, { cmd: "text", msg: "Hello" });
timelineObj.define(Now, { cmd: "text", msg: "Bye" });
timelineObj.define(Now, null); // do nothing

console.log("--------------------------------------------");
 