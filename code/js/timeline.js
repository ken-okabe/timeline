/**
 * @file timeline.ts
 * @title Type-Safe Functional Reactive Programming Library
 * @description A lightweight, powerful library for building reactive systems in TypeScript.
 * It provides type-safe, composable primitives for managing state and side effects over time,
 * inspired by Functional Reactive Programming (FRP).
 */
"use strict";

const cleanupRegistry = new FinalizationRegistry((illusionId) => {
    DependencyCore.disposeIllusion(illusionId);
});

export const createResource = (resource, cleanup) => ({
    resource,
    cleanup
});

const debugMode = (() => {
    // Check in Node.js environment
    if (typeof process !== 'undefined' && process.env) {
        return process.env.NODE_ENV === 'development';
    }
    // Check in browser environment (more strict check)
    if (typeof window !== 'undefined' &&
        typeof window.location !== 'undefined' &&
        typeof URLSearchParams !== 'undefined') {
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
        }
        catch (e) {
            // Ignore if localStorage is not available
        }
        // 3. Detect development build (e.g., webpack)
        // @ts-ignore
        if (typeof __DEV__ !== 'undefined') {
            // @ts-ignore
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

const isDebugEnabled = () => {
    // Check for temporary enablement
    if (typeof window !== 'undefined' && window.__TIMELINE_DEBUG_TEMP__) {
        return true;
    }
    return debugMode;
};

export const DebugControl = {
    enable: () => {
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('timeline-debug', 'true');
                console.log('Timeline debug mode enabled. Reload to take effect.');
            }
            catch (e) {
                console.warn('Could not enable debug mode: localStorage not available');
            }
        }
    },
    disable: () => {
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('timeline-debug', 'false');
                console.log('Timeline debug mode disabled. Reload to take effect.');
            }
            catch (e) {
                console.warn('Could not disable debug mode: localStorage not available');
            }
        }
    },
    isEnabled: () => isDebugEnabled(),
    enableTemporary: () => {
        if (typeof window !== 'undefined') {
            window.__TIMELINE_DEBUG_TEMP__ = true;
            console.log('Timeline debug mode temporarily enabled for this session.');
        }
    }
};

// --- DependencyCore: The Engine of Reactivity ---
// This namespace is the heart of the library, managing the entire graph of
// dependencies. It handles the registration, removal, and notification of all
// reactive relationships between timelines, forming a robust and efficient core.
// ---
var DependencyCore;
(function (DependencyCore) {
    const dependencies = new Map();
    const sourceIndex = new Map();
    const illusionIndex = new Map();
    const illusionDebugInfo = new Map();
    const dependencyDebugInfo = new Map();
    function addToListDict(dict, key, value) {
        if (dict.has(key)) {
            dict.get(key).add(value);
        }
        else {
            dict.set(key, new Set([value]));
        }
    }
    function removeFromListDict(dict, key, value) {
        const aSet = dict.get(key);
        if (aSet) {
            aSet.delete(value);
            if (aSet.size === 0) {
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
    function generateTimelineId() { return generateUuid(); }
    DependencyCore.generateTimelineId = generateTimelineId;
    function createIllusion(parentIllusion) {
        const illusionId = generateUuid();
        if (isDebugEnabled()) {
            illusionDebugInfo.set(illusionId, {
                illusionId,
                dependencyIds: [],
                createdAt: Date.now(),
                parentIllusion
            });
        }
        return illusionId;
    }
    DependencyCore.createIllusion = createIllusion;
    function registerDependency(sourceId, targetId, callback, illusionIdOpt, onDisposeOpt) {
        const depId = generateUuid();
        const details = { sourceId, targetId, callback, illusionId: illusionIdOpt, onDispose: onDisposeOpt };
        dependencies.set(depId, details);
        addToListDict(sourceIndex, sourceId, depId);
        if (illusionIdOpt !== undefined) {
            addToListDict(illusionIndex, illusionIdOpt, depId);
            if (isDebugEnabled()) {
                const debugInfo = illusionDebugInfo.get(illusionIdOpt);
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
                illusionId: illusionIdOpt,
                hasCleanup: !!onDisposeOpt,
                createdAt: Date.now()
            });
        }
        return depId;
    }
    DependencyCore.registerDependency = registerDependency;
    function removeDependency(depId) {
        const details = dependencies.get(depId);
        if (details) {
            if (details.onDispose) {
                try {
                    details.onDispose();
                }
                catch (ex) {
                    console.error(`Error during onDispose for dependency ${depId}: ${ex.message} `);
                }
            }
            dependencies.delete(depId);
            removeFromListDict(sourceIndex, details.sourceId, depId);
            if (details.illusionId !== undefined) {
                removeFromListDict(illusionIndex, details.illusionId, depId);
            }
            if (isDebugEnabled()) {
                dependencyDebugInfo.delete(depId);
                if (details.illusionId) {
                    const debugInfo = illusionDebugInfo.get(details.illusionId);
                    if (debugInfo) {
                        const index = debugInfo.dependencyIds.indexOf(depId);
                        if (index > -1) {
                            debugInfo.dependencyIds.splice(index, 1);
                        }
                    }
                }
            }
        }
    }
    DependencyCore.removeDependency = removeDependency;
    function disposeIllusion(illusionId) {
        const depIds = illusionIndex.get(illusionId);
        if (depIds) {
            const idsToRemove = [...depIds];
            idsToRemove.forEach(depId => removeDependency(depId));
            illusionIndex.delete(illusionId);
            if (isDebugEnabled()) {
                illusionDebugInfo.delete(illusionId);
            }
        }
    }
    DependencyCore.disposeIllusion = disposeIllusion;
    function getCallbacks(sourceId) {
        const depIds = sourceIndex.get(sourceId);
        if (!depIds) {
            return [];
        }
        return Array.from(depIds)
            .map(depId => {
            const details = dependencies.get(depId);
            return details ? { depId, callback: details.callback } : undefined;
        })
            .filter((item) => item !== undefined);
    }
    DependencyCore.getCallbacks = getCallbacks;
    function getDebugInfo() {
        if (!isDebugEnabled()) {
            return { illusions: [], dependencies: [], totalIllusions: 0, totalDependencies: 0 };
        }
        return {
            illusions: Array.from(illusionDebugInfo.values()),
            dependencies: Array.from(dependencyDebugInfo.values()),
            totalIllusions: illusionDebugInfo.size,
            totalDependencies: dependencyDebugInfo.size
        };
    }
    DependencyCore.getDebugInfo = getDebugInfo;
    /**
     * Outputs the dependency tree to the console, styled like the Linux 'tree' command.
     * This function is fully backward compatible with the original printDebugTree.
     */
    function printDebugTree() {
        if (!isDebugEnabled()) {
            console.log('Debug mode is disabled');
            return;
        }
        const info = DependencyCore.getDebugInfo();
        const illusionMap = new Map(info.illusions.map(s => [s.illusionId, s]));
        const childrenMap = new Map();
        const rootIllusions = new Set(info.illusions.map(i => i.illusionId));
        info.illusions.forEach(illusion => {
            if (illusion.parentIllusion && illusionMap.has(illusion.parentIllusion)) {
                if (!childrenMap.has(illusion.parentIllusion)) {
                    childrenMap.set(illusion.parentIllusion, []);
                }
                childrenMap.get(illusion.parentIllusion).push(illusion.illusionId);
                rootIllusions.delete(illusion.illusionId);
            }
        });
        const treeData = { rootIllusions, illusionMap, childrenMap, dependencies: info.dependencies };
        const lines = [];
        const printRecursive = (illusionId, prefix, isLast) => {
            const illusion = treeData.illusionMap.get(illusionId);
            if (!illusion)
                return;
            lines.push(`${prefix}${isLast ? '└──' : '├──'} Illusion: ${illusion.illusionId.substring(0, 8)}...`);
            const childPrefix = `${prefix}${isLast ? '    ' : '│   '}`;
            const deps = illusion.dependencyIds.map(id => treeData.dependencies.find(d => d.id === id)).filter(Boolean);
            const children = treeData.childrenMap.get(illusionId) || [];
            deps.forEach((dep, i) => {
                const isLastDep = i === deps.length - 1 && children.length === 0;
                lines.push(`${childPrefix}${isLastDep ? '└──' : '├──'} Dep: ${dep.id.substring(0, 8)} (src: ${dep.sourceId.substring(0, 8)} -> tgt: ${dep.targetId.substring(0, 8)}) ${dep.hasCleanup ? '🧹' : ''}`);
            });
            children.forEach((childId, i) => {
                printRecursive(childId, childPrefix, i === children.length - 1);
            });
        };
        console.group('Timeline Dependency Tree');
        console.log(`Total Illusions: ${info.totalIllusions}, Total Dependencies: ${info.totalDependencies}`);
        Array.from(treeData.rootIllusions).forEach((id, i) => {
            printRecursive(id, '', i === treeData.rootIllusions.size - 1);
        });
        console.log(lines.join('\n'));
        console.groupEnd();
    }
    DependencyCore.printDebugTree = printDebugTree;
    /**
     * Detects all circular references in the dependency graph and returns a list of their paths.
     * @returns {string[][]} An array of cycle paths, where each path is an array of TimelineIds.
     */
    function findAllCycles() {
        if (!isDebugEnabled()) {
            console.warn('Debug mode is not enabled. Cannot find cycles.');
            return [];
        }
        const graph = new Map();
        const allNodes = new Set();
        for (const details of dependencies.values()) {
            if (!graph.has(details.sourceId)) {
                graph.set(details.sourceId, new Set());
            }
            graph.get(details.sourceId).add(details.targetId);
            allNodes.add(details.sourceId);
            allNodes.add(details.targetId);
        }
        const cycles = [];
        const visited = new Set();
        const recursionStack = new Set();
        for (const node of allNodes) {
            if (!visited.has(node)) {
                dfsForCycleDetection(node, graph, visited, recursionStack, [], cycles);
            }
        }
        return cycles;
    }
    DependencyCore.findAllCycles = findAllCycles;
    /**
     * A Depth-First Search (DFS) helper function for cycle detection.
     */
    function dfsForCycleDetection(node, graph, visited, recursionStack, path, // The current traversal path (maintains order).
    cycles) {
        recursionStack.add(node);
        path.push(node);
        const neighbors = graph.get(node);
        if (neighbors) {
            for (const neighbor of neighbors) {
                if (recursionStack.has(neighbor)) {
                    const cycleStartIndex = path.indexOf(neighbor);
                    const cyclePath = path.slice(cycleStartIndex);
                    cycles.push(cyclePath);
                    continue;
                }
                if (!visited.has(neighbor)) {
                    dfsForCycleDetection(neighbor, graph, visited, recursionStack, path, cycles);
                }
            }
        }
        visited.add(node);
        recursionStack.delete(node);
        path.pop();
    }
})(DependencyCore || (DependencyCore = {}));

export const Now = Symbol("Conceptual time coordinate");
const _id = Symbol('id');
const _last = Symbol('last');
const isNull = (value) => value === null || value === undefined;
let globalErrorHandler = null;

export const setErrorHandler = (handler) => {
    globalErrorHandler = handler;
};

const handleCallbackError = (depId, callback, value, ex, context = 'general') => {
    if (context === 'illusion_mismatch' || context === 'bind_transition') {
        console.debug(`Transition info[${context}] for ${depId}: ${ex.message} `);
        return;
    }
    if (globalErrorHandler) {
        try {
            globalErrorHandler(ex, { dependencyId: depId, inputValue: value, context });
        }
        catch (handlerError) {
            console.error('The custom timeline error handler itself failed:', handlerError);
            console.error('Original error was:', ex);
        }
    }
    else {
        console.warn(`Callback error[${context}] for dependency ${depId}: ${ex.message} `, {
            inputValue: value,
            callbackType: typeof callback
        });
    }
};

const at = (_now) => (timeline) => timeline[_last];
const currentlyUpdating = new Set();

const define = (_now) => (value) => (timeline) => {
    const timelineId = timeline[_id];
    if (isDebugEnabled()) {
        if (currentlyUpdating.has(timelineId)) {
            console.warn(`Circular dependency detected: Update loop on Timeline ID: ${timelineId}. Aborting update.`);
            return;
        }
        currentlyUpdating.add(timelineId);
    }
    timeline[_last] = value;
    const callbacks = DependencyCore.getCallbacks(timelineId);
    callbacks.forEach(({ depId, callback }) => {
        try {
            callback(value);
        }
        catch (ex) {
            handleCallbackError(depId, callback, value, ex, 'callback_execution');
        }
    });
    if (isDebugEnabled()) {
        currentlyUpdating.delete(timelineId);
    }
};

const map = (f) => (timelineA) => {
    const initialB = f(timelineA.at(Now));
    const timelineB = Timeline(initialB);
    const reactionFn = (valueA) => {
        try {
            timelineB.define(Now, f(valueA));
        }
        catch (ex) {
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
    }
    else {
        initialB = f(currentValueA);
    }
    const timelineB = Timeline(initialB);
    const reactionFn = (valueA) => {
        try {
            if (isNull(valueA)) {
                timelineB.define(Now, null);
            }
            else {
                timelineB.define(Now, f(valueA));
            }
        }
        catch (ex) {
            handleCallbackError('nMap', f, valueA, ex, 'map_function');
        }
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFn, undefined, undefined);
    return timelineB;
};

const bind = (monadf) => (timelineA) => {
    const initialInnerTimeline = monadf(timelineA.at(Now));
    const timelineB = Timeline(initialInnerTimeline.at(Now));
    let currentIllusionId = DependencyCore.createIllusion();
    const setUpInnerReaction = (innerTimeline, illusionForInner) => {
        const reactionFnInnerToB = (valueInner) => {
            if (currentIllusionId === illusionForInner) {
                timelineB.define(Now, valueInner);
            }
        };
        DependencyCore.registerDependency(innerTimeline[_id], timelineB[_id], reactionFnInnerToB, illusionForInner, undefined);
    };
    setUpInnerReaction(initialInnerTimeline, currentIllusionId);
    const reactionFnAtoB = (valueA) => {
        try {
            const parentIllusionId = currentIllusionId;
            DependencyCore.disposeIllusion(parentIllusionId);
            currentIllusionId = DependencyCore.createIllusion(parentIllusionId);
            const newInnerTimeline = monadf(valueA);
            timelineB.define(Now, newInnerTimeline.at(Now));
            setUpInnerReaction(newInnerTimeline, currentIllusionId);
        }
        catch (ex) {
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
    }
    else {
        try {
            initialInnerTimeline = monadf(initialValueA);
        }
        catch (ex) {
            handleCallbackError('nBind_initial', monadf, initialValueA, ex);
            initialInnerTimeline = Timeline(null);
        }
    }
    const timelineB = Timeline(initialInnerTimeline.at(Now));
    let currentIllusionId = DependencyCore.createIllusion();
    const setUpInnerReaction = (innerTimeline, illusionForInner) => {
        const reactionFnInnerToB = (valueInner) => {
            if (currentIllusionId === illusionForInner) {
                timelineB.define(Now, valueInner);
            }
        };
        DependencyCore.registerDependency(innerTimeline[_id], timelineB[_id], reactionFnInnerToB, illusionForInner, undefined);
    };
    setUpInnerReaction(initialInnerTimeline, currentIllusionId);
    const reactionFnAtoB = (valueA) => {
        try {
            const parentIllusionId = currentIllusionId;
            DependencyCore.disposeIllusion(parentIllusionId);
            currentIllusionId = DependencyCore.createIllusion(parentIllusionId);
            let newInnerTimeline;
            if (isNull(valueA)) {
                newInnerTimeline = Timeline(null);
            }
            else {
                newInnerTimeline = monadf(valueA);
            }
            timelineB.define(Now, newInnerTimeline.at(Now));
            setUpInnerReaction(newInnerTimeline, currentIllusionId);
        }
        catch (ex) {
            handleCallbackError('nBind', monadf, valueA, ex, 'nbind_transition');
            const fallbackTimeline = Timeline(null);
            timelineB.define(Now, null);
            setUpInnerReaction(fallbackTimeline, currentIllusionId);
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
        }
        catch (ex) {
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

// --- Resource Management Primitives ---
// This section implements the `using` operator, a powerful primitive for declarative
// resource management. It automatically handles the lifecycle of resources in response
// to changes in a source timeline, ensuring proper acquisition and cleanup.
// ---
const using = (resourceFactory) => (sourceTimeline) => {
    const resultTimeline = Timeline(null);
    let currentIllusionId = null;
    const reactionFn = (value) => {
        try {
            const parentIllusionId = currentIllusionId;
            if (parentIllusionId) {
                DependencyCore.disposeIllusion(parentIllusionId);
            }
            currentIllusionId = DependencyCore.createIllusion(parentIllusionId ?? undefined);
            const resourceData = resourceFactory(value);
            if (resourceData) {
                const { resource, cleanup } = resourceData;
                resultTimeline.define(Now, resource);
                DependencyCore.registerDependency(sourceTimeline[_id], resultTimeline[_id], () => { }, currentIllusionId, cleanup);
            }
            else {
                resultTimeline.define(Now, null);
            }
        }
        catch (ex) {
            handleCallbackError('using', resourceFactory, value, ex);
        }
    };
    reactionFn(sourceTimeline.at(Now));
    DependencyCore.registerDependency(sourceTimeline[_id], resultTimeline[_id], reactionFn, undefined, undefined);
    return resultTimeline;
};

const nUsing = (resourceFactory) => (sourceTimeline) => {
    const wrappedFactory = (value) => {
        if (isNull(value)) {
            return null;
        }
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

// --- Exported Utilities ---
// A collection of helper functions and pre-defined timeline constants that
// simplify common use cases and improve the readability of reactive code.
// ---
export const ID = (initialValue) => Timeline(initialValue);
export const FalseTimeline = Timeline(false);
export const TrueTimeline = Timeline(true);

export const pipeBind = (f) => (g) => (a) => {
    const timelineFromF = f(a);
    return timelineFromF.bind(g);
};

export const DebugUtils = {
    getInfo: DependencyCore.getDebugInfo,
    printTree: DependencyCore.printDebugTree,
    findAllCycles: DependencyCore.findAllCycles
};

// --- Composition Functions ---
// This section provides a rich set of functions for combining multiple timelines
// into a single one. It features a layered design, starting with a basic binary
// combiner (`combineLatestWith`), building up to generic folding, and culminating
// in high-level, declarative helpers like `anyOf`, `allOf`, and `sumOf`.
// ---
export const combineLatestWith = (f) => (timelineA) => (timelineB) => {
    let latestA = timelineA.at(Now);
    let latestB = timelineB.at(Now);
    const resultTimeline = Timeline(f(latestA, latestB));
    const illusionId = resultTimeline[_id];
    const weakResultRef = new WeakRef(resultTimeline);
    const reactionA = (valA) => {
        latestA = valA;
        const strongResult = weakResultRef.deref();
        if (strongResult) {
            strongResult.define(Now, f(latestA, latestB));
        }
    };
    DependencyCore.registerDependency(timelineA[_id], resultTimeline[_id], reactionA, illusionId, undefined);
    const reactionB = (valB) => {
        latestB = valB;
        const strongResult = weakResultRef.deref();
        if (strongResult) {
            strongResult.define(Now, f(latestA, latestB));
        }
    };
    DependencyCore.registerDependency(timelineB[_id], resultTimeline[_id], reactionB, illusionId, undefined);
    cleanupRegistry.register(resultTimeline, illusionId);
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
    const illusionId = resultTimeline[_id];
    const weakResultRef = new WeakRef(resultTimeline);
    const reactionA = (valA) => {
        latestA = valA;
        const strongResult = weakResultRef.deref();
        if (strongResult) {
            strongResult.define(Now, calculateCombinedValue());
        }
    };
    DependencyCore.registerDependency(timelineA[_id], resultTimeline[_id], reactionA, illusionId, undefined);
    const reactionB = (valB) => {
        latestB = valB;
        const strongResult = weakResultRef.deref();
        if (strongResult) {
            strongResult.define(Now, calculateCombinedValue());
        }
    };
    DependencyCore.registerDependency(timelineB[_id], resultTimeline[_id], reactionB, illusionId, undefined);
    cleanupRegistry.register(resultTimeline, illusionId);
    return resultTimeline;
};

const orOf = (timelineA, timelineB) => combineLatestWith((a, b) => a || b)(timelineA)(timelineB);
const andOf = (timelineA, timelineB) => combineLatestWith((a, b) => a && b)(timelineA)(timelineB);
const addOf = (timelineA, timelineB) => combineLatestWith((a, b) => a + b)(timelineA)(timelineB);
const maxOf2 = (timelineA, timelineB) => combineLatestWith((a, b) => Math.max(a, b))(timelineA)(timelineB);
const minOf2 = (timelineA, timelineB) => combineLatestWith((a, b) => Math.min(a, b))(timelineA)(timelineB);
const concatOf = (timelineA, timelineB) => combineLatestWith((arrayA, valueB) => arrayA.concat(valueB))(timelineA)(timelineB);

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
    if (numberTimelines.length === 0)
        return Timeline(0);
    return sumOf(numberTimelines).map(sum => sum / numberTimelines.length);
};

export const listOf = (timelines) => {
    const emptyArrayTimeline = Timeline([]);
    return foldTimelines(timelines, emptyArrayTimeline, concatOf);
};

const nOrOf = (timelineA, timelineB) => nCombineLatestWith((a, b) => a || b)(timelineA)(timelineB);
const nAndOf = (timelineA, timelineB) => nCombineLatestWith((a, b) => a && b)(timelineA)(timelineB);
const nAddOf = (timelineA, timelineB) => nCombineLatestWith((a, b) => a + b)(timelineA)(timelineB);
const nConcatOf = (timelineA, timelineB) => nCombineLatestWith((arrayA, valueB) => arrayA.concat(valueB))(timelineA)(timelineB);

export const nAnyOf = (booleanTimelines) => {
    return foldTimelines(booleanTimelines, Timeline(false), nOrOf);
};

export const nAllOf = (booleanTimelines) => {
    return foldTimelines(booleanTimelines, Timeline(true), nAndOf);
};

export const nSumOf = (numberTimelines) => {
    return foldTimelines(numberTimelines, Timeline(0), nAddOf);
};

export const nListOf = (timelines) => {
    return foldTimelines(timelines, Timeline([]), nConcatOf);
};

/**
 * A generic utility to combine multiple timelines with an N-ary function.
 * This is highly performant and should be used for complex combinations that cannot
 * be expressed with simpler helpers like `anyOf`, `sumOf`, etc.
 */
export const combineLatest = (combinerFn) => (timelines) => {
    if (!timelines || timelines.length === 0) {
        throw new Error("combineLatest requires at least one timeline.");
    }
    const latestValues = timelines.map(t => t.at(Now));
    const resultTimeline = Timeline(combinerFn(...latestValues));
    const illusionId = resultTimeline[_id];
    const weakResultRef = new WeakRef(resultTimeline);
    timelines.forEach((timeline, index) => {
        const reactionFn = (value) => {
            latestValues[index] = value;
            const strongResult = weakResultRef.deref();
            if (strongResult) {
                strongResult.define(Now, combinerFn(...latestValues));
            }
        };
        DependencyCore.registerDependency(timeline[_id], resultTimeline[_id], reactionFn, illusionId, undefined);
    });
    cleanupRegistry.register(resultTimeline, illusionId);
    return resultTimeline;
};

/**
 * Nullable version of the generic utility to combine multiple timelines.
 * If any of the input timelines contain null, the result will also be null.
 */
export const nCombineLatest = (combinerFn) => (timelines) => {
    if (!timelines || timelines.length === 0) {
        return Timeline(null);
    }
    const latestValues = timelines.map(t => t.at(Now));
    const calculateResult = () => {
        if (latestValues.some(isNull)) {
            return null;
        }
        return combinerFn(...latestValues);
    };
    const resultTimeline = Timeline(calculateResult());
    const illusionId = resultTimeline[_id];
    const weakResultRef = new WeakRef(resultTimeline);
    timelines.forEach((timeline, index) => {
        const reactionFn = (value) => {
            latestValues[index] = value;
            const strongResult = weakResultRef.deref();
            if (strongResult) {
                strongResult.define(Now, calculateResult());
            }
        };
        DependencyCore.registerDependency(timeline[_id], resultTimeline[_id], reactionFn, illusionId, undefined);
    });
    cleanupRegistry.register(resultTimeline, illusionId);
    return resultTimeline;
};
