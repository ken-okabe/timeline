/**
 * @file timeline.ts
 * @title Type-Safe Functional Reactive Programming Library
 * @description A lightweight, powerful library for building reactive systems in TypeScript.
 * It provides type-safe, composable primitives for managing state and side effects over time,
 * inspired by Functional Reactive Programming (FRP).
 */
define("timeline", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.nCombineLatest = exports.combineLatest = exports.nListOf = exports.nSumOf = exports.nAllOf = exports.nAnyOf = exports.listOf = exports.averageOf = exports.minOf = exports.maxOf = exports.sumOf = exports.allOf = exports.anyOf = exports.foldTimelines = exports.nCombineLatestWith = exports.combineLatestWith = exports.DebugUtils = exports.pipeBind = exports.TrueTimeline = exports.FalseTimeline = exports.ID = exports.Timeline = exports.setErrorHandler = exports.Now = exports.DebugControl = exports.createResource = void 0;
    const cleanupRegistry = new FinalizationRegistry((illusionId) => {
        DependencyCore.disposeIllusion(illusionId);
    });
    const createResource = (resource, cleanup) => ({
        resource,
        cleanup
    });
    exports.createResource = createResource;
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
    exports.DebugControl = {
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
            const depIds = sourceIndex.get(sourceId); // depIds is a Set<DependencyId>
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
            // 1. The original debug mode check is maintained for compatibility.
            if (!isDebugEnabled()) {
                console.log('Debug mode is disabled');
                return;
            }
            // 2. Get all dependency information (same as original).
            const info = DependencyCore.getDebugInfo();
            // 3. Parse and build the tree structure.
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
            // 4. Logic to recursively draw the tree.
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
            // 5. Format and output the final result to the console.
            console.group('Timeline Dependency Tree');
            console.log(`Total Illusions: ${info.totalIllusions}, Total Dependencies: ${info.totalDependencies}`);
            Array.from(treeData.rootIllusions).forEach((id, i) => {
                printRecursive(id, '', i === treeData.rootIllusions.size - 1);
            });
            console.log(lines.join('\n')); // Output the generated string at once
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
            // 1. Build the dependency graph and list all nodes.
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
            // 2. Prepare for cycle detection.
            const cycles = [];
            const visited = new Set(); // Tracks nodes whose exploration is complete.
            const recursionStack = new Set(); // Tracks nodes on the current exploration path.
            // 3. Run DFS starting from every node.
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
            // Mark the current node as being visited on the current recursion path and add it to the path.
            recursionStack.add(node);
            path.push(node);
            const neighbors = graph.get(node);
            if (neighbors) {
                for (const neighbor of neighbors) {
                    // Case 1: If the neighbor is on the current recursion stack, a cycle is detected.
                    if (recursionStack.has(neighbor)) {
                        // Find the start of the cycle in the path and slice the subarray from that point.
                        const cycleStartIndex = path.indexOf(neighbor);
                        const cyclePath = path.slice(cycleStartIndex);
                        cycles.push(cyclePath); // Add the detected cycle to the results.
                        continue; // No need to explore this path further.
                    }
                    // Case 2: If the neighbor has not been visited yet, explore it recursively.
                    if (!visited.has(neighbor)) {
                        dfsForCycleDetection(neighbor, graph, visited, recursionStack, path, cycles);
                    }
                }
            }
            // Backtrack: The exploration from this node is complete.
            // Mark as fully visited, and remove from the recursion stack and path.
            visited.add(node);
            recursionStack.delete(node);
            path.pop();
        }
    })(DependencyCore || (DependencyCore = {}));
    exports.Now = Symbol("Conceptual time coordinate");
    const _id = Symbol('id');
    const _last = Symbol('last');
    const isNull = (value) => value === null || value === undefined;
    let globalErrorHandler = null;
    const setErrorHandler = (handler) => {
        globalErrorHandler = handler;
    };
    exports.setErrorHandler = setErrorHandler;
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
        const initialB = f(timelineA.at(exports.Now));
        const timelineB = (0, exports.Timeline)(initialB);
        const reactionFn = (valueA) => {
            try {
                timelineB.define(exports.Now, f(valueA));
            }
            catch (ex) {
                handleCallbackError('map', f, valueA, ex, 'map_function');
            }
        };
        DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFn, undefined, undefined);
        return timelineB;
    };
    const nMap = (f) => (timelineA) => {
        const currentValueA = timelineA.at(exports.Now);
        let initialB;
        if (isNull(currentValueA)) {
            initialB = null;
        }
        else {
            initialB = f(currentValueA);
        }
        const timelineB = (0, exports.Timeline)(initialB);
        const reactionFn = (valueA) => {
            try {
                if (isNull(valueA)) {
                    timelineB.define(exports.Now, null);
                }
                else {
                    timelineB.define(exports.Now, f(valueA));
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
        const initialInnerTimeline = monadf(timelineA.at(exports.Now));
        const timelineB = (0, exports.Timeline)(initialInnerTimeline.at(exports.Now));
        let currentIllusionId = DependencyCore.createIllusion();
        const setUpInnerReaction = (innerTimeline, illusionForInner) => {
            const reactionFnInnerToB = (valueInner) => {
                if (currentIllusionId === illusionForInner) {
                    timelineB.define(exports.Now, valueInner);
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
                timelineB.define(exports.Now, newInnerTimeline.at(exports.Now));
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
        const initialValueA = timelineA.at(exports.Now);
        let initialInnerTimeline;
        if (isNull(initialValueA)) {
            initialInnerTimeline = (0, exports.Timeline)(null);
        }
        else {
            try {
                initialInnerTimeline = monadf(initialValueA);
            }
            catch (ex) {
                handleCallbackError('nBind_initial', monadf, initialValueA, ex);
                initialInnerTimeline = (0, exports.Timeline)(null);
            }
        }
        const timelineB = (0, exports.Timeline)(initialInnerTimeline.at(exports.Now));
        let currentIllusionId = DependencyCore.createIllusion();
        const setUpInnerReaction = (innerTimeline, illusionForInner) => {
            const reactionFnInnerToB = (valueInner) => {
                if (currentIllusionId === illusionForInner) {
                    timelineB.define(exports.Now, valueInner);
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
                    newInnerTimeline = (0, exports.Timeline)(null);
                }
                else {
                    newInnerTimeline = monadf(valueA);
                }
                timelineB.define(exports.Now, newInnerTimeline.at(exports.Now));
                setUpInnerReaction(newInnerTimeline, currentIllusionId);
            }
            catch (ex) {
                handleCallbackError('nBind', monadf, valueA, ex, 'nbind_transition');
                const fallbackTimeline = (0, exports.Timeline)(null);
                timelineB.define(exports.Now, null);
                setUpInnerReaction(fallbackTimeline, currentIllusionId);
            }
        };
        DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFnAtoB, undefined, undefined);
        return timelineB;
    };
    const scan = (accumulator) => (initialState) => (sourceTimeline) => {
        const stateTimeline = (0, exports.Timeline)(initialState);
        const reactionFn = (input) => {
            try {
                stateTimeline.define(exports.Now, accumulator(stateTimeline.at(exports.Now), input));
            }
            catch (ex) {
                handleCallbackError('scan', accumulator, input, ex, 'scan_accumulator');
            }
        };
        DependencyCore.registerDependency(sourceTimeline[_id], stateTimeline[_id], reactionFn, undefined, undefined);
        stateTimeline.define(exports.Now, accumulator(initialState, sourceTimeline.at(exports.Now)));
        return stateTimeline;
    };
    const link = (targetTimeline) => (sourceTimeline) => {
        const reactionFn = (value) => targetTimeline.define(exports.Now, value);
        reactionFn(sourceTimeline.at(exports.Now));
        DependencyCore.registerDependency(sourceTimeline[_id], targetTimeline[_id], reactionFn, undefined, undefined);
    };
    const distinctUntilChanged = (sourceTimeline) => {
        let lastValue = sourceTimeline.at(exports.Now);
        const resultTimeline = (0, exports.Timeline)(lastValue);
        const reactionFn = (currentValue) => {
            if (currentValue !== lastValue) {
                lastValue = currentValue;
                resultTimeline.define(exports.Now, currentValue);
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
        const resultTimeline = (0, exports.Timeline)(null);
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
                    resultTimeline.define(exports.Now, resource);
                    DependencyCore.registerDependency(sourceTimeline[_id], resultTimeline[_id], () => { }, currentIllusionId, cleanup);
                }
                else {
                    resultTimeline.define(exports.Now, null);
                }
            }
            catch (ex) {
                handleCallbackError('using', resourceFactory, value, ex);
            }
        };
        reactionFn(sourceTimeline.at(exports.Now));
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
    const Timeline = (initialValue) => {
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
    exports.Timeline = Timeline;
    // --- Exported Utilities ---
    // A collection of helper functions and pre-defined timeline constants that
    // simplify common use cases and improve the readability of reactive code.
    // ---
    const ID = (initialValue) => (0, exports.Timeline)(initialValue);
    exports.ID = ID;
    exports.FalseTimeline = (0, exports.Timeline)(false);
    exports.TrueTimeline = (0, exports.Timeline)(true);
    const pipeBind = (f) => (g) => (a) => {
        const timelineFromF = f(a);
        return timelineFromF.bind(g);
    };
    exports.pipeBind = pipeBind;
    exports.DebugUtils = {
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
    const combineLatestWith = (f) => (timelineA) => (timelineB) => {
        let latestA = timelineA.at(exports.Now);
        let latestB = timelineB.at(exports.Now);
        const resultTimeline = (0, exports.Timeline)(f(latestA, latestB));
        const illusionId = resultTimeline[_id];
        const weakResultRef = new WeakRef(resultTimeline);
        const reactionA = (valA) => {
            latestA = valA;
            const strongResult = weakResultRef.deref();
            if (strongResult) {
                strongResult.define(exports.Now, f(latestA, latestB));
            }
        };
        DependencyCore.registerDependency(timelineA[_id], resultTimeline[_id], reactionA, illusionId, undefined);
        const reactionB = (valB) => {
            latestB = valB;
            const strongResult = weakResultRef.deref();
            if (strongResult) {
                strongResult.define(exports.Now, f(latestA, latestB));
            }
        };
        DependencyCore.registerDependency(timelineB[_id], resultTimeline[_id], reactionB, illusionId, undefined);
        cleanupRegistry.register(resultTimeline, illusionId);
        return resultTimeline;
    };
    exports.combineLatestWith = combineLatestWith;
    const nCombineLatestWith = (f) => (timelineA) => (timelineB) => {
        let latestA = timelineA.at(exports.Now);
        let latestB = timelineB.at(exports.Now);
        const calculateCombinedValue = () => {
            if (isNull(latestA) || isNull(latestB)) {
                return null;
            }
            return f(latestA, latestB);
        };
        const resultTimeline = (0, exports.Timeline)(calculateCombinedValue());
        const illusionId = resultTimeline[_id];
        const weakResultRef = new WeakRef(resultTimeline);
        const reactionA = (valA) => {
            latestA = valA;
            const strongResult = weakResultRef.deref();
            if (strongResult) {
                strongResult.define(exports.Now, calculateCombinedValue());
            }
        };
        DependencyCore.registerDependency(timelineA[_id], resultTimeline[_id], reactionA, illusionId, undefined);
        const reactionB = (valB) => {
            latestB = valB;
            const strongResult = weakResultRef.deref();
            if (strongResult) {
                strongResult.define(exports.Now, calculateCombinedValue());
            }
        };
        DependencyCore.registerDependency(timelineB[_id], resultTimeline[_id], reactionB, illusionId, undefined);
        cleanupRegistry.register(resultTimeline, illusionId);
        return resultTimeline;
    };
    exports.nCombineLatestWith = nCombineLatestWith;
    const orOf = (timelineA, timelineB) => (0, exports.combineLatestWith)((a, b) => a || b)(timelineA)(timelineB);
    const andOf = (timelineA, timelineB) => (0, exports.combineLatestWith)((a, b) => a && b)(timelineA)(timelineB);
    const addOf = (timelineA, timelineB) => (0, exports.combineLatestWith)((a, b) => a + b)(timelineA)(timelineB);
    const maxOf2 = (timelineA, timelineB) => (0, exports.combineLatestWith)((a, b) => Math.max(a, b))(timelineA)(timelineB);
    const minOf2 = (timelineA, timelineB) => (0, exports.combineLatestWith)((a, b) => Math.min(a, b))(timelineA)(timelineB);
    const concatOf = (timelineA, timelineB) => (0, exports.combineLatestWith)((arrayA, valueB) => arrayA.concat(valueB))(timelineA)(timelineB);
    const foldTimelines = (timelines, initialTimeline, accumulator) => {
        return timelines.reduce(accumulator, initialTimeline);
    };
    exports.foldTimelines = foldTimelines;
    const anyOf = (booleanTimelines) => {
        return (0, exports.foldTimelines)(booleanTimelines, exports.FalseTimeline, orOf);
    };
    exports.anyOf = anyOf;
    const allOf = (booleanTimelines) => {
        return (0, exports.foldTimelines)(booleanTimelines, exports.TrueTimeline, andOf);
    };
    exports.allOf = allOf;
    const sumOf = (numberTimelines) => {
        return (0, exports.foldTimelines)(numberTimelines, (0, exports.Timeline)(0), addOf);
    };
    exports.sumOf = sumOf;
    const maxOf = (numberTimelines) => {
        return (0, exports.foldTimelines)(numberTimelines, (0, exports.Timeline)(-Infinity), maxOf2);
    };
    exports.maxOf = maxOf;
    const minOf = (numberTimelines) => {
        return (0, exports.foldTimelines)(numberTimelines, (0, exports.Timeline)(Infinity), minOf2);
    };
    exports.minOf = minOf;
    const averageOf = (numberTimelines) => {
        if (numberTimelines.length === 0)
            return (0, exports.Timeline)(0);
        return (0, exports.sumOf)(numberTimelines).map(sum => sum / numberTimelines.length);
    };
    exports.averageOf = averageOf;
    const listOf = (timelines) => {
        const emptyArrayTimeline = (0, exports.Timeline)([]);
        return (0, exports.foldTimelines)(timelines, emptyArrayTimeline, concatOf);
    };
    exports.listOf = listOf;
    const nOrOf = (timelineA, timelineB) => (0, exports.nCombineLatestWith)((a, b) => a || b)(timelineA)(timelineB);
    const nAndOf = (timelineA, timelineB) => (0, exports.nCombineLatestWith)((a, b) => a && b)(timelineA)(timelineB);
    const nAddOf = (timelineA, timelineB) => (0, exports.nCombineLatestWith)((a, b) => a + b)(timelineA)(timelineB);
    const nConcatOf = (timelineA, timelineB) => (0, exports.nCombineLatestWith)((arrayA, valueB) => arrayA.concat(valueB))(timelineA)(timelineB);
    const nAnyOf = (booleanTimelines) => {
        return (0, exports.foldTimelines)(booleanTimelines, (0, exports.Timeline)(false), nOrOf);
    };
    exports.nAnyOf = nAnyOf;
    const nAllOf = (booleanTimelines) => {
        return (0, exports.foldTimelines)(booleanTimelines, (0, exports.Timeline)(true), nAndOf);
    };
    exports.nAllOf = nAllOf;
    const nSumOf = (numberTimelines) => {
        return (0, exports.foldTimelines)(numberTimelines, (0, exports.Timeline)(0), nAddOf);
    };
    exports.nSumOf = nSumOf;
    const nListOf = (timelines) => {
        return (0, exports.foldTimelines)(timelines, (0, exports.Timeline)([]), nConcatOf);
    };
    exports.nListOf = nListOf;
    /**
     * A generic utility to combine multiple timelines with an N-ary function.
     * This is highly performant and should be used for complex combinations that cannot
     * be expressed with simpler helpers like `anyOf`, `sumOf`, etc.
     */
    const combineLatest = (combinerFn) => (timelines) => {
        if (!timelines || timelines.length === 0) {
            throw new Error("combineLatest requires at least one timeline.");
        }
        const latestValues = timelines.map(t => t.at(exports.Now));
        const resultTimeline = (0, exports.Timeline)(combinerFn(...latestValues));
        const illusionId = resultTimeline[_id];
        const weakResultRef = new WeakRef(resultTimeline);
        timelines.forEach((timeline, index) => {
            const reactionFn = (value) => {
                latestValues[index] = value;
                const strongResult = weakResultRef.deref();
                if (strongResult) {
                    strongResult.define(exports.Now, combinerFn(...latestValues));
                }
            };
            DependencyCore.registerDependency(timeline[_id], resultTimeline[_id], reactionFn, illusionId, undefined);
        });
        cleanupRegistry.register(resultTimeline, illusionId);
        return resultTimeline;
    };
    exports.combineLatest = combineLatest;
    /**
     * Nullable version of the generic utility to combine multiple timelines.
     * If any of the input timelines contain null, the result will also be null.
     */
    const nCombineLatest = (combinerFn) => (timelines) => {
        if (!timelines || timelines.length === 0) {
            return (0, exports.Timeline)(null);
        }
        const latestValues = timelines.map(t => t.at(exports.Now));
        const calculateResult = () => {
            if (latestValues.some(isNull)) {
                return null;
            }
            return combinerFn(...latestValues);
        };
        const resultTimeline = (0, exports.Timeline)(calculateResult());
        const illusionId = resultTimeline[_id];
        const weakResultRef = new WeakRef(resultTimeline);
        timelines.forEach((timeline, index) => {
            const reactionFn = (value) => {
                latestValues[index] = value;
                const strongResult = weakResultRef.deref();
                if (strongResult) {
                    strongResult.define(exports.Now, calculateResult());
                }
            };
            DependencyCore.registerDependency(timeline[_id], resultTimeline[_id], reactionFn, illusionId, undefined);
        });
        cleanupRegistry.register(resultTimeline, illusionId);
        return resultTimeline;
    };
    exports.nCombineLatest = nCombineLatest;
    // --- Usage Examples and Tests ---
    // This section demonstrates how to use the library's features, providing clear
    // examples for both basic and advanced composition functions. It serves as a
    // practical guide and a quick test suite for the core functionality.
    // ---
    const demonstrateUsage = () => {
        // --- Setup ---
        console.log('=== Setting up initial timelines ===');
        const timeline1 = (0, exports.Timeline)(1);
        const timeline2 = (0, exports.Timeline)(2);
        const timeline3 = (0, exports.Timeline)(3);
        const timeline4 = (0, exports.Timeline)(4);
        // --- Demo of fold-based helper functions (Recommended standard method) ---
        console.log('\n=== Fold-based helpers (Recommended) Demo ===');
        const boolTimelines = [(0, exports.Timeline)(true), (0, exports.Timeline)(false), (0, exports.Timeline)(true)];
        const numberTimelines = [10, 20, 30].map(exports.Timeline);
        console.log('anyOf([true, false, true]):', (0, exports.anyOf)(boolTimelines).at(exports.Now)); // true
        console.log('allOf([true, false, true]):', (0, exports.allOf)(boolTimelines).at(exports.Now)); // false
        console.log('sumOf([10, 20, 30]):', (0, exports.sumOf)(numberTimelines).at(exports.Now)); // 60
        console.log('maxOf([10, 20, 30]):', (0, exports.maxOf)(numberTimelines).at(exports.Now)); // 30
        console.log('minOf([10, 20, 30]):', (0, exports.minOf)(numberTimelines).at(exports.Now)); // 10
        console.log('averageOf([10, 20, 30]):', (0, exports.averageOf)(numberTimelines).at(exports.Now)); // 20
        // --- listOf Demo ---
        const listResult = (0, exports.listOf)([timeline1, timeline2, timeline3]);
        console.log('listOf([t1, t2, t3]) initial:', listResult.at(exports.Now)); // [1, 2, 3]
        // --- combineLatest Demo (for complex, N-ary operations) ---
        console.log('\n=== combineLatest (for complex, non-foldable functions) Demo ===');
        const sumTimeline = (0, exports.combineLatest)((a, b, c, d) => a + b + c + d)([timeline1, timeline2, timeline3, timeline4]);
        console.log('combineLatest sum (initial):', sumTimeline.at(exports.Now)); // 1 + 2 + 3 + 4 = 10
        // --- Reactivity Test ---
        console.log('\n=== Reactivity Test ===');
        console.log('Updating timeline1 from 1 to 10...');
        timeline1.define(exports.Now, 10);
        console.log('... update complete.');
        console.log('listOf result after update:', listResult.at(exports.Now)); // [10, 2, 3]
        console.log('combineLatest sum after update:', sumTimeline.at(exports.Now)); // 10 + 2 + 3 + 4 = 19
    };
});
// Uncomment the following line to run the demo
// demonstrateUsage();
