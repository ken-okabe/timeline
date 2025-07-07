
export const createResource = (resource, cleanup) => ({
    resource,
    cleanup
});

// --- Improvement: Environment-independent debug mode determination ---
const debugMode = (() => {
    // Check in Node.js environment
    if (typeof process !== 'undefined' && process.env) {
        return process.env.NODE_ENV === 'development';
    }

    // Check in browser environment (more strict check)
    if (
        typeof window !== 'undefined' &&
        typeof window.location !== 'undefined' &&
        typeof URLSearchParams !== 'undefined'
    ) {
        // 1. Control via URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('debug')) {
            return urlParams.get('debug') !== 'false';
        }

        // 2. Control via localStorage (persistence)
        try {
            const debugFlag = localStorage.getItem('timeline-debug');
            if (debugFlag !== null) {
                return debugFlag === 'true';
            }
        } catch (e) {
            // Ignore if localStorage is not available
        }

        // 3. Detect development build (e.g., webpack)
        if (typeof __DEV__ !== 'undefined') {
            return __DEV__;
        }

        // 4. Detect production environment (common patterns)
        if (window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.startsWith('192.168.') ||
            window.location.port !== '') {
            return true; // Estimated as development environment
        }
    }

    // Default is disabled
    return false;
})();

// Judgment function for use within DependencyCore
const isDebugEnabled = () => {
    // Check for temporary enablement
    if (typeof window !== 'undefined' && window.__TIMELINE_DEBUG_TEMP__) {
        return true;
    }
    return debugMode;
};

// Utility functions for more flexible control
export const DebugControl = {
    // Dynamically enable/disable debug mode
    enable: () => {
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('timeline-debug', 'true');
                console.log('Timeline debug mode enabled. Reload to take effect.');
            } catch (e) {
                console.warn('Could not enable debug mode: localStorage not available');
            }
        }
    },

    disable: () => {
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('timeline-debug', 'false');
                console.log('Timeline debug mode disabled. Reload to take effect.');
            } catch (e) {
                console.warn('Could not disable debug mode: localStorage not available');
            }
        }
    },

    // Check current state
    isEnabled: () => isDebugEnabled(),

    // Temporarily enable during the session (no reload required)
    enableTemporary: () => {
        if (typeof window !== 'undefined') {
            window.__TIMELINE_DEBUG_TEMP__ = true;
            console.log('Timeline debug mode temporarily enabled for this session.');
        }
    }
};

// -----------------------------------------------------------------------------
// DependencyCore: Enhanced Debugging Support Version
// -----------------------------------------------------------------------------
const DependencyCore = (() => {
    const dependencies = new Map();
    const sourceIndex = new Map();
    const scopeIndex = new Map();

    const scopeDebugInfo = new Map();
    const dependencyDebugInfo = new Map();

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
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    return {
        generateTimelineId: () => generateUuid(),
        createScope: (parentScope) => {
            const scopeId = generateUuid();
            if (isDebugEnabled()) {
                scopeDebugInfo.set(scopeId, {
                    scopeId,
                    dependencyIds: [],
                    createdAt: Date.now(),
                    parentScope
                });
            }
            return scopeId;
        },
        registerDependency: (sourceId, targetId, callback, scopeIdOpt, onDisposeOpt) => {
            const depId = generateUuid();
            const details = { sourceId, targetId, callback, scopeId: scopeIdOpt, onDispose: onDisposeOpt };
            dependencies.set(depId, details);
            addToListDict(sourceIndex, sourceId, depId);
            if (scopeIdOpt !== undefined) {
                addToListDict(scopeIndex, scopeIdOpt, depId);
                if (isDebugEnabled()) {
                    const debugInfo = scopeDebugInfo.get(scopeIdOpt);
                    if (debugInfo) {
                        debugInfo.dependencyIds.push(depId);
                    }
                }
            }
            if (isDebugEnabled()) {
                dependencyDebugInfo.set(depId, {
                    id: depId,
                    sourceId,
                    targetId,
                    scopeId: scopeIdOpt,
                    hasCleanup: !!onDisposeOpt,
                    createdAt: Date.now()
                });
            }
            return depId;
        },
        removeDependency: (depId) => {
            const details = dependencies.get(depId);
            if (details) {
                if (details.onDispose) {
                    try {
                        details.onDispose();
                    } catch (ex) {
                        console.error(`Error during onDispose for dependency ${depId}: ${ex.message}`);
                    }
                }
                dependencies.delete(depId);
                removeFromListDict(sourceIndex, details.sourceId, depId);
                if (details.scopeId !== undefined) {
                    removeFromListDict(scopeIndex, details.scopeId, depId);
                }
                if (isDebugEnabled()) {
                    dependencyDebugInfo.delete(depId);
                    if (details.scopeId) {
                        const debugInfo = scopeDebugInfo.get(details.scopeId);
                        if (debugInfo) {
                            const index = debugInfo.dependencyIds.indexOf(depId);
                            if (index > -1) {
                                debugInfo.dependencyIds.splice(index, 1);
                            }
                        }
                    }
                }
            }
        },
        disposeScope: (scopeId) => {
            const depIds = scopeIndex.get(scopeId);
            if (depIds) {
                const idsToRemove = [...depIds];
                idsToRemove.forEach(depId => DependencyCore.removeDependency(depId));
                scopeIndex.delete(scopeId);
                if (isDebugEnabled()) {
                    scopeDebugInfo.delete(scopeId);
                }
            }
        },
        getCallbacks: (sourceId) => {
            const depIds = sourceIndex.get(sourceId);
            if (!depIds) return [];
            return depIds
                .map(depId => {
                    const details = dependencies.get(depId);
                    return details ? { depId, callback: details.callback } : undefined;
                })
                .filter(item => item !== undefined);
        },
        getDebugInfo: () => {
            if (!isDebugEnabled()) {
                return { scopes: [], dependencies: [], totalScopes: 0, totalDependencies: 0 };
            }
            return {
                scopes: Array.from(scopeDebugInfo.values()),
                dependencies: Array.from(dependencyDebugInfo.values()),
                totalScopes: scopeDebugInfo.size,
                totalDependencies: dependencyDebugInfo.size
            };
        },
        printDebugTree: () => {
            if (!isDebugEnabled()) {
                console.log('Debug mode is disabled');
                return;
            }
            const info = DependencyCore.getDebugInfo();
            console.group('Timeline Dependency Tree');
            console.log(`Total Scopes: ${info.totalScopes}`);
            console.log(`Total Dependencies: ${info.totalDependencies}`);
            info.scopes.forEach(scope => {
                console.group(`Scope: ${scope.scopeId.substring(0, 8)}...`);
                console.log(`Created: ${new Date(scope.createdAt).toISOString()}`);
                console.log(`Dependencies: ${scope.dependencyIds.length}`);
                if (scope.parentScope) {
                    console.log(`Parent: ${scope.parentScope.substring(0, 8)}...`);
                }
                scope.dependencyIds.forEach(depId => {
                    const dep = info.dependencies.find(d => d.id === depId);
                    if (dep) {
                        console.log(`  - ${depId.substring(0, 8)}... (cleanup: ${dep.hasCleanup})`);
                    }
                });
                console.groupEnd();
            });
            console.groupEnd();
        }
    };
})();

// -----------------------------------------------------------------------------
// Core API
// -----------------------------------------------------------------------------
export const Now = Symbol("Conceptual time coordinate");

const isNull = (value) => value === null || value === undefined;

const handleCallbackError = (depId, callback, value, ex, context = 'general') => {
    if (context === 'scope_mismatch' || context === 'bind_transition') {
        console.debug(`Transition info [${context}] for ${depId}: ${ex.message}`);
        return;
    }
    console.warn(`Callback error [${context}] for dependency ${depId}: ${ex.message}`, {
        inputValue: value,
        callbackType: typeof callback
    });
};

const at = (_now) => (timeline) => timeline[_last];

const define = (_now) => (value) => (timeline) => {
    timeline[_last] = value;
    const callbacks = DependencyCore.getCallbacks(timeline[_id]);
    callbacks.forEach(({ depId, callback }) => {
        try {
            callback(value);
        } catch (ex) {
            handleCallbackError(depId, callback, value, ex, 'callback_execution');
        }
    });
};

const map = (f) => (timelineA) => {
    const initialB = f(timelineA.at(Now));
    const timelineB = Timeline(initialB);
    const reactionFn = (valueA) => {
        try {
            timelineB.define(Now, f(valueA));
        } catch (ex) {
            handleCallbackError('map', f, valueA, ex, 'map_function');
        }
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFn, undefined, undefined);
    return timelineB;
};

const nMap = (f) => (timelineA) => {
    const currentValueA = timelineA.at(Now);
    let initialB;
    if (isNull(currentValueA)) {
        initialB = null;
    } else {
        initialB = f(currentValueA);
    }
    const timelineB = Timeline(initialB);
    const reactionFn = (valueA) => {
        try {
            if (isNull(valueA)) {
                timelineB.define(Now, null);
            } else {
                timelineB.define(Now, f(valueA));
            }
        } catch (ex) {
            handleCallbackError('nMap', f, valueA, ex, 'map_function');
        }
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFn, undefined, undefined);
    return timelineB;
};

const bind = (monadf) => (timelineA) => {
    const initialInnerTimeline = monadf(timelineA.at(Now));
    const timelineB = Timeline(initialInnerTimeline.at(Now));
    let currentScopeId = DependencyCore.createScope();
    const setUpInnerReaction = (innerTimeline, scopeForInner) => {
        const reactionFnInnerToB = (valueInner) => {
            if (currentScopeId === scopeForInner) {
                timelineB.define(Now, valueInner);
            }
        };
        DependencyCore.registerDependency(innerTimeline[_id], timelineB[_id], reactionFnInnerToB, scopeForInner, undefined);
    };
    setUpInnerReaction(initialInnerTimeline, currentScopeId);
    const reactionFnAtoB = (valueA) => {
        try {
            DependencyCore.disposeScope(currentScopeId);
            currentScopeId = DependencyCore.createScope();
            const newInnerTimeline = monadf(valueA);
            timelineB.define(Now, newInnerTimeline.at(Now));
            setUpInnerReaction(newInnerTimeline, currentScopeId);
        } catch (ex) {
            handleCallbackError('bind', monadf, valueA, ex, 'bind_transition');
        }
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFnAtoB, undefined, undefined);
    return timelineB;
};

const nBind = (monadf) => (timelineA) => {
    const initialValueA = timelineA.at(Now);
    let initialInnerTimeline;
    if (isNull(initialValueA)) {
        initialInnerTimeline = Timeline(null);
    } else {
        try {
            initialInnerTimeline = monadf(initialValueA);
        } catch (ex) {
            handleCallbackError('nBind_initial', monadf, initialValueA, ex);
            initialInnerTimeline = Timeline(null);
        }
    }
    const timelineB = Timeline(initialInnerTimeline.at(Now));
    let currentScopeId = DependencyCore.createScope();
    const setUpInnerReaction = (innerTimeline, scopeForInner) => {
        const reactionFnInnerToB = (valueInner) => {
            if (currentScopeId === scopeForInner) {
                timelineB.define(Now, valueInner);
            }
        };
        DependencyCore.registerDependency(innerTimeline[_id], timelineB[_id], reactionFnInnerToB, scopeForInner, undefined);
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
            const fallbackTimeline = Timeline(null);
            timelineB.define(Now, null);
            setUpInnerReaction(fallbackTimeline, currentScopeId);
        }
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFnAtoB, undefined, undefined);
    return timelineB;
};

const scan = (accumulator) => (initialState) => (sourceTimeline) => {
    const stateTimeline = Timeline(initialState);
    const reactionFn = (input) => {
        try {
            stateTimeline.define(Now, accumulator(stateTimeline.at(Now), input));
        } catch (ex) {
            handleCallbackError('scan', accumulator, input, ex, 'scan_accumulator');
        }
    };
    DependencyCore.registerDependency(sourceTimeline[_id], stateTimeline[_id], reactionFn, undefined, undefined);
    stateTimeline.define(Now, accumulator(initialState, sourceTimeline.at(Now)));
    return stateTimeline;
};

const link = (targetTimeline) => (sourceTimeline) => {
    const reactionFn = (value) => targetTimeline.define(Now, value);
    reactionFn(sourceTimeline.at(Now));
    DependencyCore.registerDependency(sourceTimeline[_id], targetTimeline[_id], reactionFn, undefined, undefined);
};

const distinctUntilChanged = (sourceTimeline) => {
    let lastValue = sourceTimeline.at(Now);
    const resultTimeline = Timeline(lastValue);
    const reactionFn = (currentValue) => {
        if (currentValue !== lastValue) {
            lastValue = currentValue;
            resultTimeline.define(Now, currentValue);
        }
    };
    DependencyCore.registerDependency(sourceTimeline[_id], resultTimeline[_id], reactionFn, undefined, undefined);
    return resultTimeline;
};

const using = (resourceFactory) => (sourceTimeline) => {
    const resultTimeline = Timeline(null);
    let currentScopeId = null;
    const reactionFn = (value) => {
        try {
            if (currentScopeId) {
                DependencyCore.disposeScope(currentScopeId);
            }
            currentScopeId = DependencyCore.createScope();
            const resourceData = resourceFactory(value);
            if (resourceData) {
                const { resource, cleanup } = resourceData;
                resultTimeline.define(Now, resource);
                DependencyCore.registerDependency(sourceTimeline[_id], resultTimeline[_id], () => { }, currentScopeId, cleanup);
            } else {
                resultTimeline.define(Now, null);
            }
        } catch (ex) {
            handleCallbackError('using', resourceFactory, value, ex);
        }
    };
    reactionFn(sourceTimeline.at(Now));
    DependencyCore.registerDependency(sourceTimeline[_id], resultTimeline[_id], reactionFn, undefined, undefined);
    return resultTimeline;
};

const nUsing = (resourceFactory) => (sourceTimeline) => {
    const wrappedFactory = (value) => {
        if (isNull(value)) { return null; }
        return resourceFactory(value);
    };
    return using(wrappedFactory)(sourceTimeline);
};

export const Timeline = (initialValue) => {
    const timelineInstance = {
        [_id]: DependencyCore.generateTimelineId(),
        [_last]: initialValue,
    };

    const baseTimeline = {
        at: (now) => at(now)(timelineInstance),
        define: (now, value) => define(now)(value)(timelineInstance),
        map: (f) => map(f)(timelineInstance),
        bind: (monadf) => bind(monadf)(timelineInstance),
        scan: (accumulator, initialState) => scan(accumulator)(initialState)(timelineInstance),
        link: (target) => link(target)(timelineInstance),
        distinctUntilChanged: () => distinctUntilChanged(timelineInstance),
        using: (resourceFactory) => using(resourceFactory)(timelineInstance)
    };

    if (initialValue == null) {
        return Object.assign(timelineInstance, baseTimeline, {
            nMap: (f) => nMap(f)(timelineInstance),
            nBind: (monadf) => nBind(monadf)(timelineInstance),
            nUsing: (resourceFactory) => nUsing(resourceFactory)(timelineInstance)
        });
    }

    return Object.assign(timelineInstance, baseTimeline);
};

export const ID = (initialValue) => Timeline(initialValue);
export const FalseTimeline = Timeline(false);
export const TrueTimeline = Timeline(true);

export const pipeBind = (f) => (g) => (a) => {
    const timelineFromF = f(a);
    return timelineFromF.bind(g);
};

export const DebugUtils = {
    getInfo: DependencyCore.getDebugInfo,
    printTree: DependencyCore.printDebugTree
};

// =============================================================================
// ===== Refreshed Composition Functions Section (Start) =====
// =============================================================================

export const combineLatestWith = (f) => (timelineA) => (timelineB) => {
    let latestA = timelineA.at(Now);
    let latestB = timelineB.at(Now);
    const resultTimeline = Timeline(f(latestA, latestB));

    const reactionA = (valA) => {
        latestA = valA;
        resultTimeline.define(Now, f(latestA, latestB));
    };
    DependencyCore.registerDependency(timelineA[_id], resultTimeline[_id], reactionA, undefined, undefined);

    const reactionB = (valB) => {
        latestB = valB;
        resultTimeline.define(Now, f(latestA, latestB));
    };
    DependencyCore.registerDependency(timelineB[_id], resultTimeline[_id], reactionB, undefined, undefined);

    return resultTimeline;
};

export const nCombineLatestWith = (f) => (timelineA) => (timelineB) => {
    let latestA = timelineA.at(Now);
    let latestB = timelineB.at(Now);

    const calculateCombinedValue = () => {
        if (isNull(latestA) || isNull(latestB)) {
            return null;
        }
        return f(latestA, latestB);
    };

    const resultTimeline = Timeline(calculateCombinedValue());

    const reactionA = (valA) => {
        latestA = valA;
        resultTimeline.define(Now, calculateCombinedValue());
    };
    DependencyCore.registerDependency(timelineA[_id], resultTimeline[_id], reactionA, undefined, undefined);

    const reactionB = (valB) => {
        latestB = valB;
        resultTimeline.define(Now, calculateCombinedValue());
    };
    DependencyCore.registerDependency(timelineB[_id], resultTimeline[_id], reactionB, undefined, undefined);

    return resultTimeline;
};

const orOf = (timelineA, timelineB) =>
    combineLatestWith((a, b) => a || b)(timelineA)(timelineB);

const andOf = (timelineA, timelineB) =>
    combineLatestWith((a, b) => a && b)(timelineA)(timelineB);

const addOf = (timelineA, timelineB) =>
    combineLatestWith((a, b) => a + b)(timelineA)(timelineB);

const maxOf2 = (timelineA, timelineB) =>
    combineLatestWith((a, b) => Math.max(a, b))(timelineA)(timelineB);

const minOf2 = (timelineA, timelineB) =>
    combineLatestWith((a, b) => Math.min(a, b))(timelineA)(timelineB);

const concatOf = (timelineA, timelineB) =>
    combineLatestWith((arrayA, valueB) => arrayA.concat(valueB))(timelineA)(timelineB);


export const foldTimelines = (timelines, initialTimeline, accumulator) => {
    return timelines.reduce(accumulator, initialTimeline);
};


export const anyOf = (booleanTimelines) => {
    return foldTimelines(booleanTimelines, FalseTimeline, orOf);
};

export const allOf = (booleanTimelines) => {
    return foldTimelines(booleanTimelines, TrueTimeline, andOf);
};

export const sumOf = (numberTimelines) => {
    return foldTimelines(numberTimelines, Timeline(0), addOf);
};

export const maxOf = (numberTimelines) => {
    return foldTimelines(numberTimelines, Timeline(-Infinity), maxOf2);
};

export const minOf = (numberTimelines) => {
    return foldTimelines(numberTimelines, Timeline(Infinity), minOf2);
};

export const averageOf = (numberTimelines) => {
    if (numberTimelines.length === 0) return Timeline(0);
    return sumOf(numberTimelines).map(sum => sum / numberTimelines.length);
};

export const listOf = (timelines) => {
    const emptyArrayTimeline = Timeline([]);
    return foldTimelines(timelines, emptyArrayTimeline, concatOf);
};


// --- Nullable version of advanced functions ---

// Nullable version of binary operators
const nOrOf = (timelineA, timelineB) =>
    nCombineLatestWith((a, b) => a || b)(timelineA)(timelineB);

const nAndOf = (timelineA, timelineB) =>
    nCombineLatestWith((a, b) => a && b)(timelineA)(timelineB);

const nAddOf = (timelineA, timelineB) =>
    nCombineLatestWith((a, b) => a + b)(timelineA)(timelineB);

const nConcatOf = (timelineA, timelineB) =>
    nCombineLatestWith((arrayA, valueB) => arrayA.concat(valueB))(timelineA)(timelineB);

// Nullable version of high-level helper functions
export const nAnyOf = (booleanTimelines) => {
    return foldTimelines(booleanTimelines, FalseTimeline, nOrOf);
};

export const nAllOf = (booleanTimelines) => {
    return foldTimelines(booleanTimelines, TrueTimeline, nAndOf);
};

export const nSumOf = (numberTimelines) => {
    return foldTimelines(numberTimelines, Timeline(0), nAddOf);
};

export const nListOf = (timelines) => {
    const emptyArrayTimeline = Timeline([]);
    return foldTimelines(timelines, emptyArrayTimeline, nConcatOf);
};


// --- Utilities for special cases ---
export const combineLatest = (combinerFn) => (timelines) => {
    if (!Array.isArray(timelines) || timelines.length === 0) {
        return Timeline([]);
    }
    if (timelines.length === 1) {
        return timelines[0].map(value => combinerFn(...[value]));
    }

    const arrayTimeline = timelines.reduce(
        (acc, timeline, index) => {
            if (index === 0) {
                return timeline.map(value => [value]);
            }
            return combineLatestWith((accArray, newValue) => [...accArray, newValue])(acc)(timeline);
        },
        undefined
    );

    return arrayTimeline.map(valueArray => combinerFn(...valueArray));
};

export const nCombineLatest = (combinerFn) => (timelines) => {
    if (!Array.isArray(timelines) || timelines.length === 0) {
        return Timeline(null);
    }

    const arrayTimeline = timelines.reduce(
        (acc, timeline, index) => {
            if (index === 0) {
                return timeline.nMap(value => [value]);
            }
            return nCombineLatestWith(
                (accArray, newValue) => [...accArray, newValue]
            )(acc)(timeline);
        },
        undefined
    );

    return arrayTimeline.nMap(valueArray => combinerFn(...valueArray));
};


// -----------------------------------------------------------------------------
// Usage Examples and Tests
// -----------------------------------------------------------------------------

const demonstrateUsage = () => {
    // --- Setup ---
    // Prepare basic timelines for testing.
    console.log('=== Setting up initial timelines ===');
    const timeline1 = Timeline(1);
    const timeline2 = Timeline(2);
    const timeline3 = Timeline(3);
    const timeline4 = Timeline(4);

    // --- Demo of fold-based helper functions (Recommended standard method) ---
    console.log('\n=== fold-based helpers (Recommended) Demo ===');
    const boolTimelines = [Timeline(true), Timeline(false), Timeline(true)];
    const numberTimelines = [10, 20, 30].map(Timeline);

    // Check the initial values of each helper function.
    console.log('anyOf([true, false, true]):', anyOf(boolTimelines).at(Now));       // true
    console.log('allOf([true, false, true]):', allOf(boolTimelines).at(Now));       // false
    console.log('sumOf([10, 20, 30]):', sumOf(numberTimelines).at(Now));       // 60
    console.log('maxOf([10, 20, 30]):', maxOf(numberTimelines).at(Now));       // 30
    console.log('minOf([10, 20, 30]):', minOf(numberTimelines).at(Now));       // 10
    console.log('averageOf([10, 20, 30]):', averageOf(numberTimelines).at(Now)); // 20

    /**
     * --- listOf Demo (Combining multiple timelines) ---
     * `listOf` combines multiple timelines into a single timeline,
     * providing its values as an array.
     *
     * Note: `listOf` assumes that all elements in the array are of the same type.
    */
    const listResult = listOf([timeline1, timeline2, timeline3]);
    console.log('listOf([t1, t2, t3]) initial:', listResult.at(Now)); // [1, 2, 3]

    // --- combineLatest Demo (for special cases / N-ary operations) ---
    console.log('\n=== combineLatest (for complex, non-foldable functions) Demo ===');
    // `combineLatest` is used when combining with complex N-ary functions that cannot be expressed with fold.
    const sumTimeline = combineLatest(
        (a, b, c, d) => a + b + c + d
    )([timeline1, timeline2, timeline3, timeline4]);

    // Initial sum: 1 + 2 + 3 + 4 = 10
    console.log('combineLatest sum (initial):', sumTimeline.at(Now));

    // --- Reactivity Test ---
    console.log('\n=== Reactivity Test ===');
    // When timeline1's value is updated, confirm that all timelines dependent on it
    // (`listResult`, `sumTimeline`) automatically reflect the new value.
    console.log('Updating timeline1 from 1 to 10...');
    timeline1.define(Now, 10);
    console.log('... update complete.');
    console.log('listOf result after update:', listResult.at(Now)); // [10, 2, 3]
    console.log('combineLatest sum after update:', sumTimeline.at(Now)); // 10 + 2 + 3 + 4 = 19
};

// Uncomment the following line to run the demo
// demonstrateUsage();