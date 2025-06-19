// Symbol for internal id property
const _id = Symbol('id');
// --- Symbol for the last value
const _last = Symbol('last');
var DependencyCore;
(function (DependencyCore) {
    const dependencies = new Map();
    const sourceIndex = new Map();
    const scopeIndex = new Map();
    function addToListDict(dict, key, value) {
        if (dict.has(key)) {
            dict.get(key).push(value);
        }
        else {
            dict.set(key, [value]);
        }
    }
    function removeFromListDict(dict, key, value) {
        if (dict.has(key)) {
            const list = dict.get(key);
            const index = list.indexOf(value);
            if (index > -1) {
                list.splice(index, 1);
            }
            if (list.length === 0) {
                dict.delete(key);
            }
        }
    }
    function generateUuid() {
        // Using a simple UUID v4 generation for browser compatibility
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    DependencyCore.generateTimelineId = generateUuid;
    DependencyCore.createScope = generateUuid;
    function registerDependency(sourceId, targetId, callback, scopeIdOpt) {
        const depId = generateUuid();
        const details = { sourceId, targetId, callback, scopeId: scopeIdOpt };
        dependencies.set(depId, details);
        addToListDict(sourceIndex, sourceId, depId);
        if (scopeIdOpt !== undefined) {
            addToListDict(scopeIndex, scopeIdOpt, depId);
        }
        return depId;
    }
    DependencyCore.registerDependency = registerDependency;
    function removeDependency(depId) {
        const details = dependencies.get(depId);
        if (details) {
            dependencies.delete(depId);
            removeFromListDict(sourceIndex, details.sourceId, depId);
            if (details.scopeId !== undefined) {
                removeFromListDict(scopeIndex, details.scopeId, depId);
            }
        }
    }
    DependencyCore.removeDependency = removeDependency;
    DependencyCore.disposeScope = function (scopeId) {
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
    };
    DependencyCore.getCallbacks = function (sourceId) {
        const depIds = sourceIndex.get(sourceId);
        if (!depIds) {
            return [];
        }
        return depIds
            .map(depId => {
            const details = dependencies.get(depId);
            return details ? { depId, callback: details.callback } : undefined;
        })
            .filter((item) => item !== undefined);
    };
})(DependencyCore || (DependencyCore = {}));
export const Now = Symbol("Conceptual time coordinate");
// Internal helper, not exported from module but used by standalone functions
const isNull = (value) => value === null || value === undefined;
// Standalone functions that implement the logic for the methods.
// Their names match the method names.
// _at and _define are core and were part of the original base structure
const at = (_now) => (timeline) => timeline[_last];
const define = (_now) => (value) => (timeline) => {
    timeline[_last] = value; // Mutates the _last property of the passed instance
    const callbacks = DependencyCore.getCallbacks(timeline[_id]);
    callbacks.forEach(({ depId, callback }) => {
        try {
            // F# allows `null` callback objects, so check for that and warn.
            if (callback === null) {
                console.warn(`Warning: Callback object is null for DependencyId ${depId}`);
            }
            else {
                try {
                    callback(value);
                }
                catch (ex) {
                    console.warn(`Error/Warning during callback for DependencyId ${depId}. Input value: ${value}. Error: ${ex.message}`);
                }
            }
        }
        catch (ex) {
            console.error(`Unexpected error during callback iteration for DependencyId ${depId}: ${ex.message}`);
        }
    });
};
// Raw map (based on original map behavior) - No longer exported
const map = (f) => (timelineA) => {
    const initialB = f(timelineA.at(Now));
    const timelineB = Timeline(initialB);
    const reactionFn = (valueA) => {
        const newValueB = f(valueA);
        timelineB.define(Now, newValueB);
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFn, undefined);
    return timelineB;
};
// Nullable-aware nMap - No longer exported
const nMap = (f) => (timelineA) => {
    const currentValueA = timelineA.at(Now);
    const initialB = isNull(currentValueA) ? null : f(currentValueA);
    const timelineB = Timeline(initialB);
    const reactionFn = (valueA) => {
        const newValueB = isNull(valueA) ? null : f(valueA);
        timelineB.define(Now, newValueB);
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFn, undefined);
    return timelineB;
};
// Raw bind (based on original bind behavior) - No longer exported
const bind = (monadf) => (timelineA) => {
    let initialInnerTimeline = monadf(timelineA.at(Now));
    const timelineB = Timeline(initialInnerTimeline.at(Now));
    let currentScopeId = DependencyCore.createScope();
    const setUpInnerReaction = (innerTimeline, scopeForInner) => {
        const reactionFnInnerToB = (valueInner) => {
            if (currentScopeId === scopeForInner) { // Ensure reaction belongs to current active inner timeline
                timelineB.define(Now, valueInner);
            }
        };
        DependencyCore.registerDependency(innerTimeline[_id], timelineB[_id], reactionFnInnerToB, scopeForInner);
    };
    setUpInnerReaction(initialInnerTimeline, currentScopeId);
    const reactionFnAtoB = (valueA) => {
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
const nBind = (monadf) => (timelineA) => {
    const initialValueA = timelineA.at(Now);
    let initialInnerTimeline;
    if (isNull(initialValueA)) {
        initialInnerTimeline = Timeline(null); // Default of 'B' is null for nullable bind
    }
    else {
        initialInnerTimeline = monadf(initialValueA);
    }
    const timelineB = Timeline(initialInnerTimeline.at(Now));
    let currentScopeId = DependencyCore.createScope();
    const setUpInnerReaction = (innerTimeline, scopeForInner) => {
        const reactionFnInnerToB = (valueInner) => {
            if (currentScopeId === scopeForInner) {
                timelineB.define(Now, valueInner);
            }
        };
        DependencyCore.registerDependency(innerTimeline[_id], timelineB[_id], reactionFnInnerToB, scopeForInner);
    };
    setUpInnerReaction(initialInnerTimeline, currentScopeId);
    const reactionFnAtoB = (valueA) => {
        DependencyCore.disposeScope(currentScopeId);
        currentScopeId = DependencyCore.createScope();
        let newInnerTimeline;
        if (isNull(valueA)) {
            newInnerTimeline = Timeline(null);
        }
        else {
            newInnerTimeline = monadf(valueA);
        }
        timelineB.define(Now, newInnerTimeline.at(Now));
        setUpInnerReaction(newInnerTimeline, currentScopeId);
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFnAtoB, undefined);
    return timelineB;
};
// --- START OF MODIFICATIONS BASED ON AGREEMENT ---
// New: scan function added - No longer exported
const scan = (accumulator) => (initialState) => (sourceTimeline) => {
    const stateTimeline = Timeline(initialState);
    sourceTimeline.map((input) => {
        const currentState = stateTimeline.at(Now);
        const newState = accumulator(currentState, input);
        stateTimeline.define(Now, newState);
        return undefined; // map expects a return value, but it's ignored for side-effects here
    });
    return stateTimeline;
};
// Corrected: link function now uses map internally as per F# - No longer exported
const link = (targetTimeline) => (sourceTimeline) => {
    // The map function itself creates the dependency and handles initial value propagation
    // via its internal reactionFn and initialB calculation.
    sourceTimeline.map((value) => {
        targetTimeline.define(Now, value);
        return undefined; // map expects a return value, but it's for side-effects
    });
};
// Corrected: distinctUntilChanged now uses an internal Timeline to hold state as per F# - No longer exported
const distinctUntilChanged = (sourceTimeline) => {
    const initialValue = sourceTimeline.at(Now);
    const resultTimeline_instance = Timeline(initialValue);
    // F# uses a Timeline to hold the last propagated value, mirroring that here.
    const lastPropagatedTimeline = Timeline(initialValue);
    sourceTimeline.map((currentValue) => {
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
export const combineLatestWith = (f) => (timelineA) => (timelineB) => {
    let latestA = timelineA.at(Now);
    let latestB = timelineB.at(Now);
    const resultTimeline_instance = Timeline(f(latestA, latestB));
    const reactionA = (valA) => {
        latestA = valA;
        resultTimeline_instance.define(Now, f(latestA, latestB));
    };
    DependencyCore.registerDependency(timelineA[_id], resultTimeline_instance[_id], reactionA, undefined);
    const reactionB = (valB) => {
        latestB = valB;
        resultTimeline_instance.define(Now, f(latestA, latestB));
    };
    DependencyCore.registerDependency(timelineB[_id], resultTimeline_instance[_id], reactionB, undefined);
    return resultTimeline_instance;
};
// Corrected: nCombineLatestWith argument order (f => timelineA => timelineB) - This remains exported as it's not a method
// F# Unchecked.defaultof<'c'> is represented as `null` in TS for generic type `C`.
export const nCombineLatestWith = (f) => (timelineA) => (timelineB) => {
    let latestA = timelineA.at(Now);
    let latestB = timelineB.at(Now);
    const calculateCombinedValue = () => {
        if (isNull(latestA) || isNull(latestB)) {
            return null; // Represents F# Unchecked.defaultof<'c'> when inputs are null
        }
        return f(latestA, latestB);
    };
    const resultTimeline_instance = Timeline(calculateCombinedValue());
    const reactionA = (valA) => {
        latestA = valA;
        resultTimeline_instance.define(Now, calculateCombinedValue());
    };
    DependencyCore.registerDependency(timelineA[_id], resultTimeline_instance[_id], reactionA, undefined);
    const reactionB = (valB) => {
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
export const Or = (timelineA) => (timelineB) => {
    // nCombineLatestWith is called with (f)(timelineA)(timelineB) as per new order
    const zipResult = nCombineLatestWith((a, b) => a || b)(timelineA)(timelineB);
    // This map ensures the Timeline<boolean|null> from nCombineLatestWith becomes Timeline<boolean>
    return map((value) => value === null ? false : value)(zipResult);
};
export const And = (timelineA) => (timelineB) => {
    // nCombineLatestWith is called with (f)(timelineA)(timelineB) as per new order
    const zipResult = nCombineLatestWith((a, b) => a && b)(timelineA)(timelineB);
    // This map ensures the Timeline<boolean|null> from nCombineLatestWith becomes Timeline<boolean>
    return map((value) => value === null ? false : value)(zipResult);
};
// --- END OF MODIFICATIONS ---
export const Timeline = (initialValue) => ({
    [_id]: DependencyCore.generateTimelineId(),
    [_last]: initialValue,
    at: function (nowInstance) {
        return at(nowInstance)(this);
    },
    define: function (nowInstance, value) {
        define(nowInstance)(value)(this);
    },
    // Raw versions - These methods are KEPT
    map: function (f) {
        return map(f)(this);
    },
    bind: function (monadf) {
        return bind(monadf)(this);
    },
    // Nullable-aware versions - These methods are KEPT
    nMap: function (f) {
        return nMap(f)(this);
    },
    nBind: function (monadf) {
        return nBind(monadf)(this);
    },
    link: function (targetTimeline) {
        link(targetTimeline)(this);
    },
    scan: function (accumulator, initialState) {
        return scan(accumulator)(initialState)(this);
    },
    distinctUntilChanged: function () {
        return distinctUntilChanged(this);
    },
    // Logical operators - These methods are KEPT
    Or: function (timelineB_param) {
        // Pass 'this' (timelineA) as the first argument, and timelineB_param as the second
        return Or(this)(timelineB_param);
    },
    And: function (timelineB_param) {
        // Pass 'this' (timelineA) as the first argument, and timelineB_param as the second
        return And(this)(timelineB_param);
    },
});
// These were originally at the end of the base file, after the Timeline factory export.
// Moved them here to ensure Timeline factory is defined before they use it.
export const ID = (initialValue) => Timeline(initialValue);
export const FalseTimeline = Timeline(false);
export const TrueTimeline = Timeline(true);
// Corrected: any and all now use the standalone Or/And functions
export const any = (booleanTimelines) => {
    if (booleanTimelines.length === 0)
        return FalseTimeline;
    // Or is a standalone export, so it's fine to call it directly here.
    return booleanTimelines.reduce((acc, elem) => Or(acc)(elem), FalseTimeline);
};
export const all = (booleanTimelines) => {
    if (booleanTimelines.length === 0)
        return TrueTimeline;
    // And is a standalone export, so it's fine to call it directly here.
    return booleanTimelines.reduce((acc, elem) => And(acc)(elem), TrueTimeline);
};
// Monadic composition operator (>>>)
// F# type: ('a -> Timeline<'b>) -> ('b -> Timeline<'c>) -> ('a -> Timeline<'c>)
export const pipeBind = (f) => (g) => (a) => {
    const timelineFromF = f(a);
    // bind is a method, so we call it on the timelineFromF instance.
    return timelineFromF.bind(g);
};