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

// IMPROVED DependencyCore - Based on timeline-depcore.js with enhancements
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
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
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
        if (scopeIdOpt !== undefined) {
            addToListDict(scopeIndex, scopeIdOpt, depId);
        }
        return depId;
    }

    export function removeDependency(depId: DependencyId): void {
        const details = dependencies.get(depId);
        if (details) {
            dependencies.delete(depId);
            removeFromListDict(sourceIndex, details.sourceId, depId);
            if (details.scopeId !== undefined) {
                removeFromListDict(scopeIndex, details.scopeId, depId);
            }
        }
    }

    // IMPROVED: More efficient scope disposal
    export function disposeScope(scopeId: ScopeId): void {
        const depIds = scopeIndex.get(scopeId);
        if (depIds) {
            const idsToRemove = [...depIds]; // Create a copy to avoid modification during iteration
            idsToRemove.forEach(depId => removeDependency(depId));
            // Clean up the scope index entry
            scopeIndex.delete(scopeId);
        }
    }

    // IMPROVED: Streamlined callback retrieval
    export function getCallbacks(sourceId: TimelineId): { depId: DependencyId; callback: Function }[] {
        const depIds = sourceIndex.get(sourceId);
        if (!depIds) {
            return [];
        }
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

// IMPROVED: Enhanced error handling with better categorization
const handleCallbackError = (
    depId: DependencyId | string,
    callback: Function,
    value: any,
    ex: any,
    context: 'general' | 'scope_mismatch' | 'bind_transition' | 'callback_execution' | 'map_function' | 'scan_accumulator' | 'nbind_initial' | 'map_initial' | 'combine_initial' | 'combine_reaction_a' | 'combine_reaction_b' | 'ncombine_calculation' | 'nbind_transition' = 'general'
): void => {
    // Categorize errors for better debugging
    if (context === 'scope_mismatch') {
        // Scope mismatches are expected during bind operations, log as debug info
        console.debug(`Scope mismatch for dependency ${depId} - this is normal during bind operations`);
        return;
    }

    if (context === 'bind_transition') {
        // Errors during bind transitions should be warnings, not critical
        console.warn(`Callback transition warning for ${depId}: ${ex.message}`);
        return;
    }

    // For critical errors, provide detailed information but don't spam console
    console.warn(`Callback error [${context}] for dependency ${depId}: ${ex.message}`, {
        inputValue: value,
        callbackType: typeof callback
    });
};

// IMPROVED: More robust define with better error categorization
const at = <A>(_now: Now) => (timeline: Timeline<A>): A => timeline[_last];

const define = <A>(_now: Now) => (value: A) => (timeline: Timeline<A>): void => {
    (timeline as any)[_last] = value; // Mutates the _last property of the passed instance
    const callbacks = DependencyCore.getCallbacks(timeline[_id]);

    callbacks.forEach(({ depId, callback }) => {
        try {
            // IMPROVED: Simplified null check - if callback is null, it's a setup issue
            if (callback === null || callback === undefined) {
                console.warn(`Null callback detected for dependency ${depId} - possible setup issue`);
                return;
            }

            try {
                (callback as (val: A) => void)(value);
            } catch (ex: any) {
                // IMPROVED: Less verbose error handling for normal operation
                handleCallbackError(depId, callback, value, ex, 'callback_execution');
            }
        } catch (ex: any) {
            // IMPROVED: Only log unexpected errors, not every callback issue
            console.error(`Unexpected error processing dependency ${depId}: ${ex.message}`);
        }
    });
};

// IMPROVED: Optimized map implementation
const map = <A, B>(f: (valueA: A) => B) => (timelineA: Timeline<A>): Timeline<B> => {
    const initialB = f(timelineA.at(Now));
    const timelineB = Timeline(initialB);
    const reactionFn = (valueA: A): void => {
        try {
            const newValueB = f(valueA);
            timelineB.define(Now, newValueB);
        } catch (ex: any) {
            handleCallbackError('map', f, valueA, ex, 'map_function');
        }
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFn, undefined);
    return timelineB;
};

// IMPROVED: Nullable-aware nMap with better error handling
const nMap = <A, B>(f: (valueA: A) => B) => (timelineA: Timeline<A>): Timeline<B | null> => {
    const currentValueA = timelineA.at(Now);
    const initialB = isNull(currentValueA) ? null : f(currentValueA);
    const timelineB = Timeline(initialB as B | null);
    const reactionFn = (valueA: A): void => {
        try {
            const newValueB = isNull(valueA) ? null : f(valueA);
            timelineB.define(Now, newValueB as B | null);
        } catch (ex: any) {
            handleCallbackError('nMap', f, valueA, ex, 'map_function');
        }
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFn, undefined);
    return timelineB;
};

// IMPROVED: Enhanced bind with better scope management and error handling
const bind = <A, B>(monadf: (valueA: A) => Timeline<B>) => (timelineA: Timeline<A>): Timeline<B> => {
    let initialInnerTimeline = monadf(timelineA.at(Now));
    const timelineB = Timeline(initialInnerTimeline.at(Now));
    let currentScopeId: ScopeId = DependencyCore.createScope();

    const setUpInnerReaction = (innerTimeline: Timeline<B>, scopeForInner: ScopeId): void => {
        const reactionFnInnerToB = (valueInner: B): void => {
            // IMPROVED: Better scope validation
            if (currentScopeId === scopeForInner) {
                timelineB.define(Now, valueInner);
            }
            // No warning for scope mismatch - it's expected during transitions
        };
        DependencyCore.registerDependency(innerTimeline[_id], timelineB[_id], reactionFnInnerToB, scopeForInner);
    };

    setUpInnerReaction(initialInnerTimeline, currentScopeId);

    const reactionFnAtoB = (valueA: A): void => {
        try {
            // IMPROVED: Clean scope management
            DependencyCore.disposeScope(currentScopeId); // Dispose old inner timeline dependencies
            currentScopeId = DependencyCore.createScope(); // Create new scope for new inner timeline
            const newInnerTimeline = monadf(valueA);
            timelineB.define(Now, newInnerTimeline.at(Now)); // Propagate initial value of new inner timeline
            setUpInnerReaction(newInnerTimeline, currentScopeId); // Set up new inner timeline reactions
        } catch (ex: any) {
            handleCallbackError('bind', monadf, valueA, ex, 'bind_transition');
        }
    };

    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFnAtoB, undefined);
    return timelineB;
};

// IMPROVED: Enhanced nBind with better null handling and error management
const nBind = <A, B>(monadf: (valueA: A) => Timeline<B>) => (timelineA: Timeline<A>): Timeline<B | null> => {
    const initialValueA = timelineA.at(Now);
    let initialInnerTimeline: Timeline<B | null>;

    try {
        if (isNull(initialValueA)) {
            initialInnerTimeline = Timeline(null as B | null); // Default of 'B' is null for nullable bind
        } else {
            initialInnerTimeline = monadf(initialValueA) as Timeline<B | null>;
        }
    } catch (ex: any) {
        // IMPROVED: Handle initial value computation errors gracefully
        console.warn(`nBind initial value computation failed, using null timeline: ${ex.message}`);
        initialInnerTimeline = Timeline(null as B | null);
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
        try {
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
        } catch (ex: any) {
            handleCallbackError('nBind', monadf, valueA, ex, 'nbind_transition');
            // On error, create a null timeline to maintain consistency
            const fallbackTimeline = Timeline(null as B | null);
            timelineB.define(Now, null);
            setUpInnerReaction(fallbackTimeline, currentScopeId);
        }
    };

    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFnAtoB, undefined);
    return timelineB;
};

// IMPROVED: Enhanced scan with better error handling
const scan = <State, Input>(accumulator: (state: State, input: Input) => State) => (initialState: State) => (sourceTimeline: Timeline<Input>): Timeline<State> => {
    const stateTimeline = Timeline(initialState);
    sourceTimeline.map((input: Input) => {
        try {
            const currentState = stateTimeline.at(Now);
            const newState = accumulator(currentState, input);
            stateTimeline.define(Now, newState);
        } catch (ex: any) {
            handleCallbackError('scan', accumulator, input, ex, 'scan_accumulator');
        }
        return undefined; // map expects a return value, but it's ignored for side-effects here
    });
    return stateTimeline;
};

// IMPROVED: More efficient link implementation
const link = <A>(targetTimeline: Timeline<A>) => (sourceTimeline: Timeline<A>): void => {
    // The map function itself creates the dependency and handles initial value propagation
    // via its internal reactionFn and initialB calculation.
    sourceTimeline.map((value: A) => {
        targetTimeline.define(Now, value);
        return undefined; // map expects a return value, but it's for side-effects
    });
};

// IMPROVED: More efficient distinctUntilChanged
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

// IMPROVED: Enhanced combineLatestWith with better error handling
export const combineLatestWith = <A, B, C>(f: (valA: A, valB: B) => C) => (timelineA: Timeline<A>) => (timelineB: Timeline<B>): Timeline<C> => {
    let latestA = timelineA.at(Now);
    let latestB = timelineB.at(Now);

    let initialResult: C;
    try {
        initialResult = f(latestA, latestB);
    } catch (ex: any) {
        handleCallbackError('combineLatestWith', f, [latestA, latestB], ex, 'combine_initial');
        throw ex; // Re-throw initial computation errors
    }

    const resultTimeline_instance = Timeline(initialResult);

    const reactionA = (valA: A): void => {
        try {
            latestA = valA;
            resultTimeline_instance.define(Now, f(latestA, latestB));
        } catch (ex: any) {
            handleCallbackError('combineLatestWith', f, [valA, latestB], ex, 'combine_reaction_a');
        }
    };
    DependencyCore.registerDependency(timelineA[_id], resultTimeline_instance[_id], reactionA, undefined);

    const reactionB = (valB: B): void => {
        try {
            latestB = valB;
            resultTimeline_instance.define(Now, f(latestA, latestB));
        } catch (ex: any) {
            handleCallbackError('combineLatestWith', f, [latestA, valB], ex, 'combine_reaction_b');
        }
    };
    DependencyCore.registerDependency(timelineB[_id], resultTimeline_instance[_id], reactionB, undefined);

    return resultTimeline_instance;
};

// IMPROVED: Enhanced nCombineLatestWith
export const nCombineLatestWith = <A, B, C>(f: (valA: A, valB: B) => C) => (timelineA: Timeline<A>) => (timelineB: Timeline<B>): Timeline<C | null> => {
    let latestA = timelineA.at(Now);
    let latestB = timelineB.at(Now);

    const calculateCombinedValue = (): C | null => {
        if (isNull(latestA) || isNull(latestB)) {
            return null; // Represents F# Unchecked.defaultof<'c'> when inputs are null
        }
        try {
            return f(latestA!, latestB!);
        } catch (ex: any) {
            handleCallbackError('nCombineLatestWith', f, [latestA, latestB], ex, 'ncombine_calculation');
            return null; // Return null on error
        }
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

// MAINTAINED: Or and And operations (API unchanged)
export const Or = (timelineA: Timeline<boolean>) => (timelineB: Timeline<boolean>): Timeline<boolean> => {
    const zipResult = nCombineLatestWith<boolean, boolean, boolean>((a, b) => a || b)(timelineA)(timelineB);
    return map<boolean | null, boolean>((value) => value === null ? false : value)(zipResult);
};

export const And = (timelineA: Timeline<boolean>) => (timelineB: Timeline<boolean>): Timeline<boolean> => {
    const zipResult = nCombineLatestWith<boolean, boolean, boolean>((a, b) => a && b)(timelineA)(timelineB);
    return map<boolean | null, boolean>((value) => value === null ? false : value)(zipResult);
};

export interface Timeline<A> {
    [_id]: TimelineId;
    [_last]: A; // As per base code, updated by define method on the instance

    at(now: Now): A;
    define(now: Now, value: A): void;

    // These methods remain
    map<B>(f: (value: A) => B): Timeline<B>;
    bind<B>(monadf: (value: A) => Timeline<B>): Timeline<B>;

    // Nullable-aware versions
    nMap<B>(f: (value: A) => B): Timeline<B | null>;
    nBind<B>(monadf: (value: A) => Timeline<B>): Timeline<B | null>;

    link(targetTimeline: Timeline<A>): void;
    scan<State>(accumulator: (state: State, input: A) => State, initialState: State): Timeline<State>;
    distinctUntilChanged(): Timeline<A>;

    Or(this: Timeline<boolean>, timelineB: Timeline<boolean>): Timeline<boolean>;
    And(this: Timeline<boolean>, timelineB: Timeline<boolean>): Timeline<boolean>;
}

// MAINTAINED: Timeline factory with exact same API
export const Timeline = <A>(initialValue: A): Timeline<A> => ({
    [_id]: DependencyCore.generateTimelineId(),
    [_last]: initialValue,
    at: function (nowInstance: Now): A {
        return at<A>(nowInstance)(this);
    },
    define: function (nowInstance: Now, value: A): void {
        define<A>(nowInstance)(value)(this);
    },
    // Raw versions - API maintained exactly
    map: function<B> (f: (valueA: A) => B): Timeline<B> {
        return map<A, B>(f)(this);
    },
    bind: function<B> (monadf: (valueA: A) => Timeline<B>): Timeline<B> {
        return bind<A, B>(monadf)(this);
    },
    // Nullable-aware versions - API maintained exactly
    nMap: function<B> (f: (valueA: A) => B): Timeline<B | null> {
        return nMap<A, B>(f)(this);
    },
    nBind: function<B> (monadf: (valueA: A) => Timeline<B>): Timeline<B | null> {
        return nBind<A, B>(monadf)(this);
    },
    link: function (targetTimeline: Timeline<A>): void {
        link<A>(targetTimeline)(this);
    },
    scan: function<State> (accumulator: (state: State, input: A) => State, initialState: State): Timeline<State> {
        return scan<State, A>(accumulator)(initialState)(this);
    },
    distinctUntilChanged: function (): Timeline<A> {
        return distinctUntilChanged<A>(this);
    },
    // Logical operators - API maintained exactly
    Or: function (this: Timeline<boolean>, timelineB_param: Timeline<boolean>): Timeline<boolean> {
        return Or(this as Timeline<boolean>)(timelineB_param);
    },
    And: function (this: Timeline<boolean>, timelineB_param: Timeline<boolean>): Timeline<boolean> {
        return And(this as Timeline<boolean>)(timelineB_param);
    },
});

// MAINTAINED: All exported utilities with exact same API
export const ID = <A>(initialValue: A): Timeline<A> => Timeline(initialValue);
export const FalseTimeline: Timeline<boolean> = Timeline(false);
export const TrueTimeline: Timeline<boolean> = Timeline(true);

export const any = (booleanTimelines: Timeline<boolean>[]): Timeline<boolean> => {
    if (booleanTimelines.length === 0)
        return FalseTimeline;
    return booleanTimelines.reduce((acc, elem) => Or(acc)(elem), FalseTimeline);
};

export const all = (booleanTimelines: Timeline<boolean>[]): Timeline<boolean> => {
    if (booleanTimelines.length === 0)
        return TrueTimeline;
    return booleanTimelines.reduce((acc, elem) => And(acc)(elem), TrueTimeline);
};

// MAINTAINED: Monadic composition operator
export const pipeBind = <A, B, C>(f: (a: A) => Timeline<B>) => (g: (b: B) => Timeline<C>) => (a: A): Timeline<C> => {
    const timelineFromF = f(a);
    return timelineFromF.bind(g);
};