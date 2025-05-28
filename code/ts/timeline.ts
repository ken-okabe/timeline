
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
    // Updated disposeScope logic (agreed upon)
    export function disposeScope(scopeId: ScopeId): void {
        const depIds = scopeIndex.get(scopeId); 
        if (depIds) {
            const idsToRemove = [...depIds]; 
            idsToRemove.forEach(depId => removeDependency(depId)); 

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
// This is the base code version.
export const isNull = <A>(value: A): boolean => value === null || value === undefined;

// Standalone functions that implement the logic for the methods.
// These are not exported from the module directly but are called by the methods.
// Their names match the method names.

// _at and _define are core and were part of the original base structure
const at = <A>(_now: Now) => (timeline: Timeline<A>): A => timeline[_last];

const define = <A>(_now: Now) => (value: A) => (timeline: Timeline<A>): void => {
    (timeline as any)._last = value; // Mutates the _last property of the passed instance
    const callbacks = DependencyCore.getCallbacks(timeline[_id]);
    callbacks.forEach(({ depId, callback }) => {
        try {
            (callback as (val: A) => void)(value);
        } catch (ex: any) {
            if (ex instanceof TypeError) {
                 console.warn(`Warning: Callback execution error for DependencyId ${depId}. TL Value: ${typeof value}. Err: ${ex.message}`);
            } else {
                 console.error(`Error executing callback for DepId ${depId}: ${ex.message}`);
            }
        }
    });
};

// Raw map (based on original map behavior)
const map = <A, B>(f: (valueA: A) => B) => (timelineA: Timeline<A>): Timeline<B> => {
    const initialB = f(timelineA.at(Now)); // Call interface method
    const timelineB = Timeline(initialB); 

    const reactionFn = (valueA: A): void => {
        const newValueB = f(valueA);
        timelineB.define(Now, newValueB); // Call interface method
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFn, undefined);
    return timelineB;
};

// Nullable-aware nMap
const nMap = <A, B>(f: (valueA: A) => B) => (timelineA: Timeline<A>): Timeline<B | null> => {
    const currentValueA = timelineA.at(Now); // Call interface method
    const initialB = isNull(currentValueA) ? null : f(currentValueA);
    const timelineB = Timeline(initialB as B | null);

    const reactionFn = (valueA: A): void => {
        const newValueB = isNull(valueA) ? null : f(valueA);
        timelineB.define(Now, newValueB as B | null); // Call interface method
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFn, undefined);
    return timelineB;
};

// Raw bind (based on original bind behavior)
const bind = <A, B>(monadf: (valueA: A) => Timeline<B>) => (timelineA: Timeline<A>): Timeline<B> => {
    let initialInnerTimeline = monadf(timelineA.at(Now)); // Call interface method
    const timelineB = Timeline(initialInnerTimeline.at(Now)); // Call interface method
    let currentScopeId: ScopeId = DependencyCore.createScope();

    const setUpInnerReaction = (innerTimeline: Timeline<B>, scopeForInner: ScopeId): void => {
        const reactionFnInnerToB = (valueInner: B): void => {
            if (currentScopeId === scopeForInner) {
                timelineB.define(Now, valueInner); // Call interface method
            }
        };
        DependencyCore.registerDependency(innerTimeline[_id], timelineB[_id], reactionFnInnerToB, scopeForInner);
    };

    setUpInnerReaction(initialInnerTimeline, currentScopeId);

    const reactionFnAtoB = (valueA: A): void => {
        DependencyCore.disposeScope(currentScopeId);
        currentScopeId = DependencyCore.createScope();
        const newInnerTimeline = monadf(valueA);
        timelineB.define(Now, newInnerTimeline.at(Now)); // Call interface method
        setUpInnerReaction(newInnerTimeline, currentScopeId);
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFnAtoB, undefined);
    return timelineB;
};

// Nullable-aware nBind
const nBind = <A, B>(monadf: (valueA: A) => Timeline<B>) => (timelineA: Timeline<A>): Timeline<B | null> => {
    const initialValueA = timelineA.at(Now); // Call interface method
    let initialInnerTimeline: Timeline<B | null>; 

    if (isNull(initialValueA)) {
        initialInnerTimeline = Timeline(null as B | null); 
    } else {
        initialInnerTimeline = monadf(initialValueA) as Timeline<B | null>; 
    }
    
    const timelineB = Timeline(initialInnerTimeline.at(Now)); // Call interface method
    let currentScopeId: ScopeId = DependencyCore.createScope();

    const setUpInnerReaction = (innerTimeline: Timeline<B | null>, scopeForInner: ScopeId): void => {
        const reactionFnInnerToB = (valueInner: B | null): void => {
            if (currentScopeId === scopeForInner) {
                timelineB.define(Now, valueInner); // Call interface method
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
        timelineB.define(Now, newInnerTimeline.at(Now)); // Call interface method
        setUpInnerReaction(newInnerTimeline, currentScopeId);
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFnAtoB, undefined);
    return timelineB;
};

// New "raw" zipWith: f is called directly, f is responsible for handling nulls
const zipWith = <A, B, C>(f: (valA: A, valB: B) => C) => (timelineB: Timeline<B>) => (timelineA: Timeline<A>): Timeline<C> => {
    let latestA = timelineA.at(Now); // Call interface method
    let latestB = timelineB.at(Now); // Call interface method
    const resultTimeline_instance = Timeline(f(latestA, latestB));

    const reactionA = (valA: A): void => {
        latestA = valA;
        resultTimeline_instance.define(Now, f(latestA, latestB)); // Call interface method
    };
    DependencyCore.registerDependency(timelineA[_id], resultTimeline_instance[_id], reactionA, undefined);

    const reactionB = (valB: B): void => {
        latestB = valB;
        resultTimeline_instance.define(Now, f(latestA, latestB)); // Call interface method
    };
    DependencyCore.registerDependency(timelineB[_id], resultTimeline_instance[_id], reactionB, undefined);
    return resultTimeline_instance;
};

// Nullable-aware nZipWith (original zipWith behavior from base code)
const nZipWith = <A, B, C>(f: (valA: A, valB: B) => C) => (timelineB: Timeline<B>) => (timelineA: Timeline<A>): Timeline<C | null> => {
    let latestA = timelineA.at(Now); // Call interface method
    let latestB = timelineB.at(Now); // Call interface method

    const calculateCombinedValue = (): C | null => {
        if (isNull(latestA) || isNull(latestB)) { return null; }
        return f(latestA!, latestB!); 
    };

    const resultTimeline_instance = Timeline(calculateCombinedValue());

    const reactionA = (valA: A): void => {
        latestA = valA;
        resultTimeline_instance.define(Now, calculateCombinedValue()); // Call interface method
    };
    DependencyCore.registerDependency(timelineA[_id], resultTimeline_instance[_id], reactionA, undefined);

    const reactionB = (valB: B): void => {
        latestB = valB;
        resultTimeline_instance.define(Now, calculateCombinedValue()); // Call interface method
    };
    DependencyCore.registerDependency(timelineB[_id], resultTimeline_instance[_id], reactionB, undefined);
    return resultTimeline_instance;
};

const link = <A>(targetTimeline: Timeline<A>) => (sourceTimeline: Timeline<A>): void => {
    const reactionFn = (value: A): void => {
        targetTimeline.define(Now, value); // Call interface method
    };
    DependencyCore.registerDependency(sourceTimeline[_id], targetTimeline[_id], reactionFn, undefined);
    targetTimeline.define(Now, sourceTimeline.at(Now)); // Call interface method
};

const distinctUntilChanged = <A>(sourceTimeline: Timeline<A>): Timeline<A> => {
    const initialValue = sourceTimeline.at(Now); // Call interface method
    const resultTimeline_instance = Timeline(initialValue);
    let lastPropagatedValue = initialValue;

    const reactionFn = (newValue: A): void => {
        if (newValue !== lastPropagatedValue) {
            lastPropagatedValue = newValue;
            resultTimeline_instance.define(Now, newValue); // Call interface method
        }
    };
    DependencyCore.registerDependency(sourceTimeline[_id], resultTimeline_instance[_id], reactionFn, undefined);
    return resultTimeline_instance;
};

// Or and And use nZipWith for robust boolean logic
const Or = (timelineB: Timeline<boolean>) => (timelineA: Timeline<boolean>): Timeline<boolean> => {
    const zipResult = nZipWith<boolean, boolean, boolean>((a, b) => a || b)(timelineB)(timelineA);
    return map<boolean | null, boolean>(value => value === null ? false : value)(zipResult);
};

const And = (timelineB: Timeline<boolean>) => (timelineA: Timeline<boolean>): Timeline<boolean> => {
    const zipResult = nZipWith<boolean, boolean, boolean>((a, b) => a && b)(timelineB)(timelineA);
    return map<boolean | null, boolean>(value => value === null ? false : value)(zipResult);
};



export interface Timeline<A> {
    [_id]: TimelineId;
    [_last]: A; // As per base code, updated by define method on the instance

    at(now: Now): A;
    define(now: Now, value: A): void;

    // Raw versions
    map<B>(f: (value: A) => B): Timeline<B>;
    bind<B>(monadf: (value: A) => Timeline<B>): Timeline<B>;
    zipWith<B, C>(f: (valA: A, valB: B) => C, timelineB: Timeline<B>): Timeline<C>;

    // Nullable-aware versions
    nMap<B>(f: (value: A) => B): Timeline<B | null>;
    nBind<B>(monadf: (value: A) => Timeline<B>): Timeline<B | null>;
    nZipWith<B, C>(f: (valA: A, valB: B) => C, timelineB: Timeline<B>): Timeline<C | null>;

    link(targetTimeline: Timeline<A>): void;
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
    // Raw versions
    map: function<B>(this: Timeline<A>, f: (valueA: A) => B): Timeline<B> {
        return map<A, B>(f)(this);
    },
    bind: function<B>(this: Timeline<A>, monadf: (valueA: A) => Timeline<B>): Timeline<B> {
        return bind<A, B>(monadf)(this);
    },
    zipWith: function<B, C>(this: Timeline<A>, f: (valA: A, valB: B) => C, timelineB_param: Timeline<B>): Timeline<C> {
        return zipWith<A, B, C>(f)(timelineB_param)(this);
    },

    // Nullable-aware versions
    nMap: function<B>(this: Timeline<A>, f: (valueA: A) => B): Timeline<B | null> {
        return nMap<A, B>(f)(this);
    },
    nBind: function<B>(this: Timeline<A>, monadf: (valueA: A) => Timeline<B>): Timeline<B | null> {
        return nBind<A, B>(monadf)(this);
    },
    nZipWith: function<B, C>(this: Timeline<A>, f: (valA: A, valB: B) => C, timelineB_param: Timeline<B>): Timeline<C | null> {
        return nZipWith<A, B, C>(f)(timelineB_param)(this);
    },

    link: function(this: Timeline<A>, targetTimeline: Timeline<A>): void {
        link<A>(targetTimeline)(this);
    },
    distinctUntilChanged: function(this: Timeline<A>): Timeline<A> {
        return distinctUntilChanged<A>(this);
    },

    // Logical operators
    Or: function(this: Timeline<boolean>, timelineB_param: Timeline<boolean>): Timeline<boolean> {
        return Or(timelineB_param)(this as Timeline<boolean>);
    },
    And: function(this: Timeline<boolean>, timelineB_param: Timeline<boolean>): Timeline<boolean> {
        return And(timelineB_param)(this as Timeline<boolean>);
    },
});

// These were originally at the end of the base file, after the Timeline factory export.
// Moved them here to ensure Timeline factory is defined before they use it.
export const ID = <A>(initialValue: A): Timeline<A> => Timeline(initialValue);
export const FalseTimeline: Timeline<boolean> = Timeline(false);
export const TrueTimeline: Timeline<boolean> = Timeline(true);

export const any = (booleanTimelines: Timeline<boolean>[]): Timeline<boolean> => {
    if (booleanTimelines.length === 0) return FalseTimeline;
    return booleanTimelines.reduce((acc, elem) => acc.Or(elem), FalseTimeline);
};

export const all = (booleanTimelines: Timeline<boolean>[]): Timeline<boolean> => {
    if (booleanTimelines.length === 0) return TrueTimeline;
    return booleanTimelines.reduce((acc, elem) => acc.And(elem), TrueTimeline);
};

