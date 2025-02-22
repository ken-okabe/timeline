import { Timeline } from './timeline';

// Utility Functions

const isNullT = (value) => value === null || value === undefined;

// Or operation for two timelines
const Or = (timelineA, timelineB) => {
    const timelineAB = Timeline(null);

    // Map both timelines to update timelineAB only when it's Null
    timelineA.map((a) => {
        if (!isNullT(a) && isNullT(timelineAB.last())) {
            timelineAB.next(a);
        }
    });

    timelineB.map((b) => {
        if (!isNullT(b) && isNullT(timelineAB.last())) {
            timelineAB.next(b);
        }
    });

    return timelineAB;
};

//Type guard:
const isAndResult = (value) =>
 'result' in Object(value) && Array.isArray(value?.result);

const andResult = (a) =>
    isAndResult(a)
        ? a
        : { result: [a] };

const bindResults = (a, b) => {
    const aResult = andResult(a);
    const bResult = andResult(b);
    return { result: aResult.result.concat(bResult.result) };
};

const And = (timelineA, timelineB) => {
        const timelineAB = Timeline(null);
        const updateAnd = () => {
            const lastA = timelineA.last();
            const lastB = timelineB.last();
            if (!isNullT(lastA) && !isNullT(lastB)) {
                timelineAB.next(bindResults(lastA, lastB));
            } else {
                timelineAB.next(null);
            }
        };

        timelineA.map((_) => updateAnd());
        timelineB.map((_) => updateAnd());

        return timelineAB;
};

export { isNullT, Or, And };
