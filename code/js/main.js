import { Timeline } from './timeline.js';

const log = (a) => console.log(a);

console.log("--------------------------------------------");
// Example 1: String Timeline
// Initialize Timeline with Null
const timelineRef = Timeline(null);
// Map the Timeline
timelineRef
    .map(log);

timelineRef.next("Hello");
timelineRef.next("World!");
timelineRef.next("JavaScript");
timelineRef.next(null);

console.log("--------------------------------------------");
// Example 2: Integer Object Timeline
// Initialize Timeline with Null
const timelineNumber = Timeline(null);
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
const isNull = (value) => value === null;

// Initialize Timeline with Null
const timelineObj = Timeline(null);
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

timelineObj.next({ cmd: "text", msg: "Hello" });
timelineObj.next({ cmd: "text", msg: "Bye" });
timelineObj.next(null); // do nothing