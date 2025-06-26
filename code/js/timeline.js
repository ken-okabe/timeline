// Symbol for internal id property
const _id = Symbol('id');
// --- Symbol for the last value
const _last = Symbol('last');

// IMPROVED DependencyCore - Based on timeline-depcore.js with enhancements
var DependencyCore;
(function (DependencyCore) {
    const dependencies = new Map();
    const sourceIndex = new Map();
    const scopeIndex = new Map();

    function addToListDict(dict, key, value) {
        if (dict.has(key)) {
            dict.get(key).push(value);
        } else {
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

    // IMPROVED: More efficient scope disposal
    DependencyCore.disposeScope = function (scopeId) {
        const depIds = scopeIndex.get(scopeId);
        if (depIds) {
            const idsToRemove = [...depIds]; // Create a copy to avoid modification during iteration
            idsToRemove.forEach(depId => removeDependency(depId));
            // Clean up the scope index entry
            scopeIndex.delete(scopeId);
        }
    };

    // IMPROVED: Streamlined callback retrieval
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

// IMPROVED: Enhanced error handling with better categorization
const handleCallbackError = (depId, callback, value, ex, context = 'general') => {
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
const at = (_now) => (timeline) => timeline[_last];

const define = (_now) => (value) => (timeline) => {
    timeline[_last] = value; // Mutates the _last property of the passed instance
    const callbacks = DependencyCore.getCallbacks(timeline[_id]);

    callbacks.forEach(({ depId, callback }) => {
        try {
            // IMPROVED: Simplified null check - if callback is null, it's a setup issue
            if (callback === null || callback === undefined) {
                console.warn(`Null callback detected for dependency ${depId} - possible setup issue`);
                return;
            }

            try {
                callback(value);
            } catch (ex) {
                // IMPROVED: Less verbose error handling for normal operation
                handleCallbackError(depId, callback, value, ex, 'callback_execution');
            }
        } catch (ex) {
            // IMPROVED: Only log unexpected errors, not every callback issue
            console.error(`Unexpected error processing dependency ${depId}: ${ex.message}`);
        }
    });
};

// IMPROVED: Optimized map implementation
const map = (f) => (timelineA) => {
    const initialB = f(timelineA.at(Now));
    const timelineB = Timeline(initialB);
    const reactionFn = (valueA) => {
        try {
            const newValueB = f(valueA);
            timelineB.define(Now, newValueB);
        } catch (ex) {
            handleCallbackError('map', f, valueA, ex, 'map_function');
        }
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFn, undefined);
    return timelineB;
};

// IMPROVED: Nullable-aware nMap with better error handling
const nMap = (f) => (timelineA) => {
    const currentValueA = timelineA.at(Now);
    const initialB = isNull(currentValueA) ? null : f(currentValueA);
    const timelineB = Timeline(initialB);
    const reactionFn = (valueA) => {
        try {
            const newValueB = isNull(valueA) ? null : f(valueA);
            timelineB.define(Now, newValueB);
        } catch (ex) {
            handleCallbackError('nMap', f, valueA, ex, 'nmap_function');
        }
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFn, undefined);
    return timelineB;
};

// IMPROVED: Enhanced bind with better scope management and error handling
const bind = (monadf) => (timelineA) => {
    let initialInnerTimeline = monadf(timelineA.at(Now));
    const timelineB = Timeline(initialInnerTimeline.at(Now));
    let currentScopeId = DependencyCore.createScope();

    const setUpInnerReaction = (innerTimeline, scopeForInner) => {
        const reactionFnInnerToB = (valueInner) => {
            // IMPROVED: Better scope validation
            if (currentScopeId === scopeForInner) {
                timelineB.define(Now, valueInner);
            }
            // No warning for scope mismatch - it's expected during transitions
        };
        DependencyCore.registerDependency(innerTimeline[_id], timelineB[_id], reactionFnInnerToB, scopeForInner);
    };

    setUpInnerReaction(initialInnerTimeline, currentScopeId);

    const reactionFnAtoB = (valueA) => {
        try {
            // IMPROVED: Clean scope management
            DependencyCore.disposeScope(currentScopeId); // Dispose old inner timeline dependencies
            currentScopeId = DependencyCore.createScope(); // Create new scope for new inner timeline
            const newInnerTimeline = monadf(valueA);
            timelineB.define(Now, newInnerTimeline.at(Now)); // Propagate initial value of new inner timeline
            setUpInnerReaction(newInnerTimeline, currentScopeId); // Set up new inner timeline reactions
        } catch (ex) {
            handleCallbackError('bind', monadf, valueA, ex, 'bind_transition');
        }
    };

    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFnAtoB, undefined);
    return timelineB;
};

// IMPROVED: Enhanced nBind with better null handling and error management
const nBind = (monadf) => (timelineA) => {
    const initialValueA = timelineA.at(Now);
    let initialInnerTimeline;

    try {
        if (isNull(initialValueA)) {
            initialInnerTimeline = Timeline(null); // Default of 'B' is null for nullable bind
        } else {
            initialInnerTimeline = monadf(initialValueA);
        }
    } catch (ex) {
        // IMPROVED: Handle initial value computation errors gracefully
        console.warn(`nBind initial value computation failed, using null timeline: ${ex.message}`);
        initialInnerTimeline = Timeline(null);
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
        try {
            DependencyCore.disposeScope(currentScopeId);
            currentScopeId = DependencyCore.createScope();
            let newInnerTimeline;
            if (isNull(valueA)) {
                newInnerTimeline = Timeline(null);
            } else {
                newInnerTimeline = monadf(valueA);
            }
            timelineB.define(Now, newInnerTimeline.at(Now));
            setUpInnerReaction(newInnerTimeline, currentScopeId);
        } catch (ex) {
            handleCallbackError('nBind', monadf, valueA, ex, 'nbind_transition');
            // On error, create a null timeline to maintain consistency
            const fallbackTimeline = Timeline(null);
            timelineB.define(Now, null);
            setUpInnerReaction(fallbackTimeline, currentScopeId);
        }
    };

    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFnAtoB, undefined);
    return timelineB;
};

// IMPROVED: Enhanced scan with better error handling
const scan = (accumulator) => (initialState) => (sourceTimeline) => {
    const stateTimeline = Timeline(initialState);
    sourceTimeline.map((input) => {
        try {
            const currentState = stateTimeline.at(Now);
            const newState = accumulator(currentState, input);
            stateTimeline.define(Now, newState);
        } catch (ex) {
            handleCallbackError('scan', accumulator, input, ex, 'scan_accumulator');
        }
        return undefined; // map expects a return value, but it's ignored for side-effects here
    });
    return stateTimeline;
};

// IMPROVED: More efficient link implementation
const link = (targetTimeline) => (sourceTimeline) => {
    // The map function itself creates the dependency and handles initial value propagation
    // via its internal reactionFn and initialB calculation.
    sourceTimeline.map((value) => {
        targetTimeline.define(Now, value);
        return undefined; // map expects a return value, but it's for side-effects
    });
};

// IMPROVED: More efficient distinctUntilChanged
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

// IMPROVED: Enhanced combineLatestWith with better error handling
export const combineLatestWith = (f) => (timelineA) => (timelineB) => {
    let latestA = timelineA.at(Now);
    let latestB = timelineB.at(Now);

    let initialResult;
    try {
        initialResult = f(latestA, latestB);
    } catch (ex) {
        handleCallbackError('combineLatestWith', f, [latestA, latestB], ex, 'combine_initial');
        initialResult = null; // Fallback to null on error
    }

    const resultTimeline_instance = Timeline(initialResult);

    const reactionA = (valA) => {
        try {
            latestA = valA;
            resultTimeline_instance.define(Now, f(latestA, latestB));
        } catch (ex) {
            handleCallbackError('combineLatestWith', f, [valA, latestB], ex, 'combine_reaction_a');
        }
    };
    DependencyCore.registerDependency(timelineA[_id], resultTimeline_instance[_id], reactionA, undefined);

    const reactionB = (valB) => {
        try {
            latestB = valB;
            resultTimeline_instance.define(Now, f(latestA, latestB));
        } catch (ex) {
            handleCallbackError('combineLatestWith', f, [latestA, valB], ex, 'combine_reaction_b');
        }
    };
    DependencyCore.registerDependency(timelineB[_id], resultTimeline_instance[_id], reactionB, undefined);

    return resultTimeline_instance;
};

// IMPROVED: Enhanced nCombineLatestWith
export const nCombineLatestWith = (f) => (timelineA) => (timelineB) => {
    let latestA = timelineA.at(Now);
    let latestB = timelineB.at(Now);

    const calculateCombinedValue = () => {
        if (isNull(latestA) || isNull(latestB)) {
            return null; // Represents F# Unchecked.defaultof<'c'> when inputs are null
        }
        try {
            return f(latestA, latestB);
        } catch (ex) {
            handleCallbackError('nCombineLatestWith', f, [latestA, latestB], ex, 'ncombine_calculation');
            return null; // Return null on error
        }
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

// MAINTAINED: Or and And operations (API unchanged)
export const Or = (timelineA) => (timelineB) => {
    const zipResult = nCombineLatestWith((a, b) => a || b)(timelineA)(timelineB);
    return map((value) => value === null ? false : value)(zipResult);
};

export const And = (timelineA) => (timelineB) => {
    const zipResult = nCombineLatestWith((a, b) => a && b)(timelineA)(timelineB);
    return map((value) => value === null ? false : value)(zipResult);
};

// MAINTAINED: Timeline factory with exact same API
export const Timeline = (initialValue) => ({
    [_id]: DependencyCore.generateTimelineId(),
    [_last]: initialValue,
    at: function (nowInstance) {
        return at(nowInstance)(this);
    },
    define: function (nowInstance, value) {
        define(nowInstance)(value)(this);
    },
    // Raw versions - API maintained exactly
    map: function (f) {
        return map(f)(this);
    },
    bind: function (monadf) {
        return bind(monadf)(this);
    },
    // Nullable-aware versions - API maintained exactly
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
    // Logical operators - API maintained exactly
    Or: function (timelineB_param) {
        return Or(this)(timelineB_param);
    },
    And: function (timelineB_param) {
        return And(this)(timelineB_param);
    },
});

// MAINTAINED: All exported utilities with exact same API
export const ID = (initialValue) => Timeline(initialValue);
export const FalseTimeline = Timeline(false);
export const TrueTimeline = Timeline(true);

export const any = (booleanTimelines) => {
    if (booleanTimelines.length === 0)
        return FalseTimeline;
    return booleanTimelines.reduce((acc, elem) => Or(acc)(elem), FalseTimeline);
};

export const all = (booleanTimelines) => {
    if (booleanTimelines.length === 0)
        return TrueTimeline;
    return booleanTimelines.reduce((acc, elem) => And(acc)(elem), TrueTimeline);
};

// MAINTAINED: Monadic composition operator
export const pipeBind = (f) => (g) => (a) => {
    const timelineFromF = f(a);
    return timelineFromF.bind(g);
};