// Symbol for internal id property
const _id = Symbol('id');
// --- Symbol for the last value
const _last = Symbol('last');

// --- Core System Abstractions ---
type TimelineId = string;
type DependencyId = string;
type ScopeId = string;

interface DependencyDetails {
    sourceId: TimelineId;
    targetId: TimelineId;
    callback: Function;
    scopeId: ScopeId | undefined;
}

// Namespace for core dependency management functionalities (internal)
namespace DependencyCore {
    const dependencies = new Map<DependencyId, DependencyDetails>();
    const sourceIndex = new Map<TimelineId, DependencyId[]>();
    const scopeIndex = new Map<ScopeId, DependencyId[]>();

    function addToListDict<K, V>(dict: Map<K, V[]>, key: K, value: V): void {
        if (dict.has(key)) {
            dict.get(key)!.push(value);
        } else {
            dict.set(key, [value]);
        }
    }

    function removeFromListDict<K, V>(dict: Map<K, V[]>, key: K, value: V): void {
        if (dict.has(key)) {
            const list = dict.get(key)!;
            const index = list.indexOf(value);
            if (index > -1) {
                list.splice(index, 1);
            }
            if (list.length === 0) {
                dict.delete(key);
            }
        }
    }

    function generateUuid(): string {
        // Using a simple UUID v4 generation for browser compatibility
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0,
                v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    export function generateTimelineId(): TimelineId { return generateUuid(); }
    export function createScope(): ScopeId { return generateUuid(); }
    export function registerDependency(sourceId: TimelineId, targetId: TimelineId, callback: Function, scopeIdOpt: ScopeId | undefined): DependencyId {
        const depId = generateUuid();
        const details: DependencyDetails = { sourceId, targetId, callback, scopeId: scopeIdOpt };
        dependencies.set(depId, details);
        addToListDict(sourceIndex, sourceId, depId);
        if (scopeIdOpt !== undefined) { addToListDict(scopeIndex, scopeIdOpt, depId); }
        return depId;
    }
    export function removeDependency(depId: DependencyId): void {
        const details = dependencies.get(depId);
        if (details) {
            dependencies.delete(depId);
            removeFromListDict(sourceIndex, details.sourceId, depId);
            if (details.scopeId !== undefined) { removeFromListDict(scopeIndex, details.scopeId, depId); }
        }
    }
    export function disposeScope(scopeId: ScopeId): void {
        const depIds = scopeIndex.get(scopeId);
        if (depIds) {
            const idsToRemove = [...depIds]; // Create a copy to avoid modification during iteration
            idsToRemove.forEach(depId => removeDependency(depId));

            // After removing dependencies, check if the list for this scope is now empty
            const remainingDepsInScopeList = scopeIndex.get(scopeId);
            if (remainingDepsInScopeList && remainingDepsInScopeList.length === 0) {
                scopeIndex.delete(scopeId);
            }
        }
    }
    export function getCallbacks(sourceId: TimelineId): { depId: DependencyId; callback: Function }[] {
        const depIds = sourceIndex.get(sourceId);
        if (!depIds) { return []; }
        return depIds
            .map(depId => {
                const details = dependencies.get(depId);
                return details ? { depId, callback: details.callback } : undefined;
            })
            .filter((item): item is { depId: DependencyId; callback: Function } => item !== undefined);
    }
}

export type Now = symbol;
export const Now: Now = Symbol("Conceptual time coordinate");

// Internal helper, not exported from module but used by standalone functions
const isNull = <A>(value: A): boolean => value === null || value === undefined;

// Standalone functions that implement the logic for the methods.
// Their names match the method names.

// _at and _define are core and were part of the original base structure
const at = <A>(_now: Now) => (timeline: Timeline<A>): A => timeline[_last];

const define = <A>(_now: Now) => (value: A) => (timeline: Timeline<A>): void => {
    (timeline as any)[_last] = value; // Mutates the _last property of the passed instance
    const callbacks = DependencyCore.getCallbacks(timeline[_id]);
    callbacks.forEach(({ depId, callback }) => {
        try {
            // F# allows `null` callback objects, so check for that and warn.
            if (callback === null) {
                console.warn(`Warning: Callback object is null for DependencyId ${depId}`);
            } else {
                try {
                    (callback as (val: A) => void)(value);
                } catch (ex: any) {
                    console.warn(`Error/Warning during callback for DependencyId ${depId}. Input value: ${value}. Error: ${ex.message}`);
                }
            }
        } catch (ex: any) {
             console.error(`Unexpected error during callback iteration for DependencyId ${depId}: ${ex.message}`);
        }
    });
};

// Raw map (based on original map behavior) - No longer exported
const map = <A, B>(f: (valueA: A) => B) => (timelineA: Timeline<A>): Timeline<B> => {
    const initialB = f(timelineA.at(Now));
    const timelineB = Timeline(initialB);

    const reactionFn = (valueA: A): void => {
        const newValueB = f(valueA);
        timelineB.define(Now, newValueB);
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFn, undefined);
    return timelineB;
};

// Nullable-aware nMap - No longer exported
const nMap = <A, B>(f: (valueA: A) => B) => (timelineA: Timeline<A>): Timeline<B | null> => {
    const currentValueA = timelineA.at(Now);
    const initialB = isNull(currentValueA) ? null : f(currentValueA);
    const timelineB = Timeline(initialB as B | null);

    const reactionFn = (valueA: A): void => {
        const newValueB = isNull(valueA) ? null : f(valueA);
        timelineB.define(Now, newValueB as B | null);
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFn, undefined);
    return timelineB;
};

// Raw bind (based on original bind behavior) - No longer exported
const bind = <A, B>(monadf: (valueA: A) => Timeline<B>) => (timelineA: Timeline<A>): Timeline<B> => {
    let initialInnerTimeline = monadf(timelineA.at(Now));
    const timelineB = Timeline(initialInnerTimeline.at(Now));
    let currentScopeId: ScopeId = DependencyCore.createScope();

    const setUpInnerReaction = (innerTimeline: Timeline<B>, scopeForInner: ScopeId): void => {
        const reactionFnInnerToB = (valueInner: B): void => {
            if (currentScopeId === scopeForInner) { // Ensure reaction belongs to current active inner timeline
                timelineB.define(Now, valueInner);
            }
        };
        DependencyCore.registerDependency(innerTimeline[_id], timelineB[_id], reactionFnInnerToB, scopeForInner);
    };

    setUpInnerReaction(initialInnerTimeline, currentScopeId);

    const reactionFnAtoB = (valueA: A): void => {
        DependencyCore.disposeScope(currentScopeId); // Dispose old inner timeline dependencies
        currentScopeId = DependencyCore.createScope(); // Create new scope for new inner timeline
        const newInnerTimeline = monadf(valueA);
        timelineB.define(Now, newInnerTimeline.at(Now)); // Propagate initial value of new inner timeline
        setUpInnerReaction(newInnerTimeline, currentScopeId); // Set up new inner timeline reactions
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFnAtoB, undefined);
    return timelineB;
};

// Nullable-aware nBind - No longer exported
const nBind = <A, B>(monadf: (valueA: A) => Timeline<B>) => (timelineA: Timeline<A>): Timeline<B | null> => {
    const initialValueA = timelineA.at(Now);
    let initialInnerTimeline: Timeline<B | null>;

    if (isNull(initialValueA)) {
        initialInnerTimeline = Timeline(null as B | null); // Default of 'B' is null for nullable bind
    } else {
        initialInnerTimeline = monadf(initialValueA) as Timeline<B | null>;
    }

    const timelineB = Timeline(initialInnerTimeline.at(Now));
    let currentScopeId: ScopeId = DependencyCore.createScope();

    const setUpInnerReaction = (innerTimeline: Timeline<B | null>, scopeForInner: ScopeId): void => {
        const reactionFnInnerToB = (valueInner: B | null): void => {
            if (currentScopeId === scopeForInner) {
                timelineB.define(Now, valueInner);
            }
        };
        DependencyCore.registerDependency(innerTimeline[_id], timelineB[_id], reactionFnInnerToB, scopeForInner);
    };

    setUpInnerReaction(initialInnerTimeline, currentScopeId);

    const reactionFnAtoB = (valueA: A): void => {
        DependencyCore.disposeScope(currentScopeId);
        currentScopeId = DependencyCore.createScope();
        let newInnerTimeline: Timeline<B | null>;
        if (isNull(valueA)) {
            newInnerTimeline = Timeline(null as B | null);
        } else {
            newInnerTimeline = monadf(valueA) as Timeline<B | null>;
        }
        timelineB.define(Now, newInnerTimeline.at(Now));
        setUpInnerReaction(newInnerTimeline, currentScopeId);
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFnAtoB, undefined);
    return timelineB;
};

// --- START OF MODIFICATIONS BASED ON AGREEMENT ---

// New: scan function added - No longer exported
const scan = <State, Input>(accumulator: (state: State, input: Input) => State) => (initialState: State) => (sourceTimeline: Timeline<Input>): Timeline<State> => {
    const stateTimeline = Timeline(initialState);

    sourceTimeline.map((input: Input) => {
        const currentState = stateTimeline.at(Now);
        const newState = accumulator(currentState, input);
        stateTimeline.define(Now, newState);
        return undefined; // map expects a return value, but it's ignored for side-effects here
    });

    return stateTimeline;
};

// Corrected: link function now uses map internally as per F# - No longer exported
const link = <A>(targetTimeline: Timeline<A>) => (sourceTimeline: Timeline<A>): void => {
    // The map function itself creates the dependency and handles initial value propagation
    // via its internal reactionFn and initialB calculation.
    sourceTimeline.map((value: A) => {
        targetTimeline.define(Now, value);
        return undefined; // map expects a return value, but it's for side-effects
    });
};

// Corrected: distinctUntilChanged now uses an internal Timeline to hold state as per F# - No longer exported
const distinctUntilChanged = <A>(sourceTimeline: Timeline<A>): Timeline<A> => {
    const initialValue = sourceTimeline.at(Now);
    const resultTimeline_instance = Timeline(initialValue);
    // F# uses a Timeline to hold the last propagated value, mirroring that here.
    const lastPropagatedTimeline = Timeline(initialValue);

    sourceTimeline.map((currentValue: A) => {
        const lastPropagatedValue = lastPropagatedTimeline.at(Now); // Get from the internal Timeline
        if (currentValue !== lastPropagatedValue) {
            lastPropagatedTimeline.define(Now, currentValue); // Define to the internal Timeline
            resultTimeline_instance.define(Now, currentValue);
        }
        return undefined; // map expects a return value
    });

    return resultTimeline_instance;
};

// Corrected: combineLatestWith argument order (f => timelineA => timelineB) - This remains exported as it's not a method
export const combineLatestWith = <A, B, C>(f: (valA: A, valB: B) => C) => (timelineA: Timeline<A>) => (timelineB: Timeline<B>): Timeline<C> => {
    let latestA = timelineA.at(Now);
    let latestB = timelineB.at(Now);
    const resultTimeline_instance = Timeline(f(latestA, latestB));

    const reactionA = (valA: A): void => {
        latestA = valA;
        resultTimeline_instance.define(Now, f(latestA, latestB));
    };
    DependencyCore.registerDependency(timelineA[_id], resultTimeline_instance[_id], reactionA, undefined);

    const reactionB = (valB: B): void => {
        latestB = valB;
        resultTimeline_instance.define(Now, f(latestA, latestB));
    };
    DependencyCore.registerDependency(timelineB[_id], resultTimeline_instance[_id], reactionB, undefined);
    return resultTimeline_instance;
};

// Corrected: nCombineLatestWith argument order (f => timelineA => timelineB) - This remains exported as it's not a method
// F# Unchecked.defaultof<'c'> is represented as `null` in TS for generic type `C`.
export const nCombineLatestWith = <A, B, C>(f: (valA: A, valB: B) => C) => (timelineA: Timeline<A>) => (timelineB: Timeline<B>): Timeline<C | null> => {
    let latestA = timelineA.at(Now);
    let latestB = timelineB.at(Now);

    const calculateCombinedValue = (): C | null => {
        if (isNull(latestA) || isNull(latestB)) {
            return null; // Represents F# Unchecked.defaultof<'c'> when inputs are null
        }
        return f(latestA!, latestB!);
    };

    const resultTimeline_instance = Timeline(calculateCombinedValue());

    const reactionA = (valA: A): void => {
        latestA = valA;
        resultTimeline_instance.define(Now, calculateCombinedValue());
    };
    DependencyCore.registerDependency(timelineA[_id], resultTimeline_instance[_id], reactionA, undefined);

    const reactionB = (valB: B): void => {
        latestB = valB;
        resultTimeline_instance.define(Now, calculateCombinedValue());
    };
    DependencyCore.registerDependency(timelineB[_id], resultTimeline_instance[_id], reactionB, undefined);
    return resultTimeline_instance;
};

// Corrected: Or and And now use the fixed combineLatestWith argument order.
// The map for null -> boolean is retained because nCombineLatestWith returns C | null,
// and boolean operations expect boolean, so null must be explicitly handled.
// These remain exported as they are not Timeline methods in F# style, but standalone logic.
export const Or = (timelineA: Timeline<boolean>) => (timelineB: Timeline<boolean>): Timeline<boolean> => {
    // nCombineLatestWith is called with (f)(timelineA)(timelineB) as per new order
    const zipResult = nCombineLatestWith<boolean, boolean, boolean>((a, b) => a || b)(timelineA)(timelineB);
    // This map ensures the Timeline<boolean|null> from nCombineLatestWith becomes Timeline<boolean>
    return map<boolean | null, boolean>(value => value === null ? false : value)(zipResult);
};

export const And = (timelineA: Timeline<boolean>) => (timelineB: Timeline<boolean>): Timeline<boolean> => {
    // nCombineLatestWith is called with (f)(timelineA)(timelineB) as per new order
    const zipResult = nCombineLatestWith<boolean, boolean, boolean>((a, b) => a && b)(timelineA)(timelineB);
    // This map ensures the Timeline<boolean|null> from nCombineLatestWith becomes Timeline<boolean>
    return map<boolean | null, boolean>(value => value === null ? false : value)(zipResult);
};

// --- END OF MODIFICATIONS ---


export interface Timeline<A> {
    [_id]: TimelineId;
    [_last]: A; // As per base code, updated by define method on the instance

    at(now: Now): A;
    define(now: Now, value: A): void;

    // These methods remain
    map<B>(f: (value: A) => B): Timeline<B>;
    bind<B>(monadf: (value: A) => Timeline<B>): Timeline<B>;
    // combineLatestWith<B, C>(f: (valA: A, valB: B) => C, timelineB: Timeline<B>): Timeline<C>; // REMOVED

    // Nullable-aware versions
    nMap<B>(f: (value: A) => B): Timeline<B | null>;
    nBind<B>(monadf: (value: A) => Timeline<B>): Timeline<B | null>;
    // nCombineLatestWith<B, C>(f: (valA: A, valB: B) => C, timelineB: Timeline<B>): Timeline<C | null>; // REMOVED

    link(targetTimeline: Timeline<A>): void;
    scan<State>(accumulator: (state: State, input: A) => State, initialState: State): Timeline<State>;
    distinctUntilChanged(): Timeline<A>;

    Or(this: Timeline<boolean>, timelineB: Timeline<boolean>): Timeline<boolean>;
    And(this: Timeline<boolean>, timelineB: Timeline<boolean>): Timeline<boolean>;
}


// --- Timeline Factory Function (Exported as 'Timeline') ---
export const Timeline = <A>(initialValue: A): Timeline<A> => ({
    [_id]: DependencyCore.generateTimelineId(),
    [_last]: initialValue,

    at: function(this: Timeline<A>, nowInstance: Now): A {
        return at<A>(nowInstance)(this);
    },
    define: function(this: Timeline<A>, nowInstance: Now, value: A): void {
        define<A>(nowInstance)(value)(this);
    },
    // Raw versions - These methods are KEPT
    map: function<B>(this: Timeline<A>, f: (valueA: A) => B): Timeline<B> {
        return map<A, B>(f)(this);
    },
    bind: function<B>(this: Timeline<A>, monadf: (valueA: A) => Timeline<B>): Timeline<B> {
        return bind<A, B>(monadf)(this);
    },

    // Nullable-aware versions - These methods are KEPT
    nMap: function<B>(this: Timeline<A>, f: (valueA: A) => B): Timeline<B | null> {
        return nMap<A, B>(f)(this);
    },
    nBind: function<B>(this: Timeline<A>, monadf: (valueA: A) => Timeline<B>): Timeline<B | null> {
        return nBind<A, B>(monadf)(this);
    },

    link: function(this: Timeline<A>, targetTimeline: Timeline<A>): void {
        link<A>(targetTimeline)(this);
    },
    scan: function<State>(this: Timeline<A>, accumulator: (state: State, input: A) => State, initialState: State): Timeline<State> {
        return scan<State, A>(accumulator)(initialState)(this);
    },
    distinctUntilChanged: function(this: Timeline<A>): Timeline<A> {
        return distinctUntilChanged<A>(this);
    },

    // Logical operators - These methods are KEPT
    Or: function(this: Timeline<boolean>, timelineB_param: Timeline<boolean>): Timeline<boolean> {
        // Pass 'this' (timelineA) as the first argument, and timelineB_param as the second
        return Or(this as Timeline<boolean>)(timelineB_param);
    },
    And: function(this: Timeline<boolean>, timelineB_param: Timeline<boolean>): Timeline<boolean> {
        // Pass 'this' (timelineA) as the first argument, and timelineB_param as the second
        return And(this as Timeline<boolean>)(timelineB_param);
    },
});

// These were originally at the end of the base file, after the Timeline factory export.
// Moved them here to ensure Timeline factory is defined before they use it.
export const ID = <A>(initialValue: A): Timeline<A> => Timeline(initialValue);
export const FalseTimeline: Timeline<boolean> = Timeline(false);
export const TrueTimeline: Timeline<boolean> = Timeline(true);

// Corrected: any and all now use the standalone Or/And functions
export const any = (booleanTimelines: Timeline<boolean>[]): Timeline<boolean> => {
    if (booleanTimelines.length === 0) return FalseTimeline;
    // Or is a standalone export, so it's fine to call it directly here.
    return booleanTimelines.reduce((acc, elem) => Or(acc)(elem), FalseTimeline);
};

export const all = (booleanTimelines: Timeline<boolean>[]): Timeline<boolean> => {
    if (booleanTimelines.length === 0) return TrueTimeline;
    // And is a standalone export, so it's fine to call it directly here.
    return booleanTimelines.reduce((acc, elem) => And(acc)(elem), TrueTimeline);
};

// Monadic composition operator (>>>)
// F# type: ('a -> Timeline<'b>) -> ('b -> Timeline<'c>) -> ('a -> Timeline<'c>)
export const pipeBind = <A, B, C>(f: (a: A) => Timeline<B>) => (g: (b: B) => Timeline<C>) => (a: A): Timeline<C> => {
    const timelineFromF = f(a);
    // bind is a method, so we call it on the timelineFromF instance.
    return timelineFromF.bind(g);
};