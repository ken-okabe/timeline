
import { Timeline } from './timeline';

// Utility Functions

const isNullT =
    <A>(value: A | null | undefined): value is null | undefined =>
        value === null || value === undefined;


// Or operation for two timelines
const Or = <A>(
    timelineA: Timeline<A | null>, timelineB: Timeline<A | null>)
    : Timeline<A | null> => {
    const timelineAB = Timeline<A | null>(null);

    // Map both timelines to update timelineAB only when it's Null
    timelineA.map(a => {
        if (!isNullT(a) && isNullT(timelineAB.last())) {
            timelineAB.next(a);
        }
    });

    timelineB.map(b => {
        if (!isNullT(b) && isNullT(timelineAB.last())) {
            timelineAB.next(b);
        }
    });

    return timelineAB;
};

type AndResult<A> ={
    result: A[]
}
//Type guard: Ensure 'A' is an object type to accommodate potential nested AndResult
const isAndResult =
    <A extends object>(value: A | AndResult<A>): value is AndResult<A> =>
        'result' in Object(value) && Array.isArray((value as any).result);

const andResult =
    <A extends object>(a: A | AndResult<A>): AndResult<A> =>
        isAndResult(a)
            ? a
            : { result: [a] };

const bindResults =
    <A extends object>(
        a: A | AndResult<A>, b: A | AndResult<A>): AndResult<A> => {
        const aResult = andResult(a);
        const bResult = andResult(b)
        return { result: aResult.result.concat(bResult.result) };
    }

const And =
    <A extends object>(
        timelineA: Timeline<A | null | AndResult<A>>,
        timelineB: Timeline<A | null | AndResult<A>>
    ): Timeline<AndResult<A> | null> => {
        const timelineAB = Timeline<AndResult<A> | null>(null);
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
export type { AndResult }