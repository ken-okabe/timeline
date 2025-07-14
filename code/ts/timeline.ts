/**
 * @file timeline.ts
 * @title Type-Safe Functional Reactive Programming Library
 * @description A lightweight, powerful library for building reactive systems in TypeScript.
 * It provides type-safe, composable primitives for managing state and side effects over time,
 * inspired by Functional Reactive Programming (FRP).
 */

// --- Core System Abstractions ---
// These are the fundamental type definitions that form the backbone of the dependency
// tracking system. They define unique identifiers for timelines, dependencies, and illusions.
// ---
type TimelineId = string;
type DependencyId = string;
type IllusionId = string;
type DisposeCallback = () => void;

interface DependencyDetails {
    sourceId: TimelineId;
    targetId: TimelineId;
    callback: (value: any) => void;
    illusionId: IllusionId | undefined;
    onDispose: DisposeCallback | undefined;
}

const cleanupRegistry = new FinalizationRegistry((illusionId: IllusionId) => {
    DependencyCore.disposeIllusion(illusionId);
});

// --- Type-safe Resource definition ---
// This interface provides a structured way to handle resources that require cleanup,
// such as event listeners or network connections. It pairs the resource with its
// disposal logic, ensuring no leaks occur when the resource is no longer needed.
// ---
interface Resource<A> {
    readonly resource: A;
    readonly cleanup: DisposeCallback;
}

type ResourceFactory<A, B> = (value: A) => Resource<B> | null;

export const createResource = <A>(resource: A, cleanup: DisposeCallback): Resource<A> => ({
    resource,
    cleanup
} as const);

// --- Type definitions for debug information ---
// When debug mode is enabled, these interfaces provide detailed metadata about
// illusions and dependencies. This information is crucial for visualizing the
// dependency graph and diagnosing issues in complex reactive systems.
// ---
interface DebugInfo {
    illusionId: IllusionId;
    dependencyIds: DependencyId[];
    createdAt: number;
    parentIllusion?: IllusionId;
}

interface DependencyDebugInfo {
    id: DependencyId;
    sourceId: TimelineId;
    targetId: TimelineId;
    illusionId?: IllusionId;
    hasCleanup: boolean;
    createdAt: number;
}

// --- Environment-independent debug mode determination ---
// This logic robustly determines whether to enable debug mode by checking various
// environment signals, such as Node.js environment variables, browser URL parameters,
// and localStorage flags. This ensures flexible control during development and testing.
// ---
declare var process: any;

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

const isDebugEnabled = (): boolean => {
    // Check for temporary enablement
    if (typeof window !== 'undefined' && (window as any).__TIMELINE_DEBUG_TEMP__) {
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

    isEnabled: () => isDebugEnabled(),

    enableTemporary: () => {
        if (typeof window !== 'undefined') {
            (window as any).__TIMELINE_DEBUG_TEMP__ = true;
            console.log('Timeline debug mode temporarily enabled for this session.');
        }
    }
};

// --- DependencyCore: The Engine of Reactivity ---
// This namespace is the heart of the library, managing the entire graph of
// dependencies. It handles the registration, removal, and notification of all
// reactive relationships between timelines, forming a robust and efficient core.
// ---
namespace DependencyCore {
    const dependencies = new Map<DependencyId, DependencyDetails>();
    const sourceIndex = new Map<TimelineId, Set<DependencyId>>();
    const illusionIndex = new Map<IllusionId, Set<DependencyId>>();

    const illusionDebugInfo = new Map<IllusionId, DebugInfo>();
    const dependencyDebugInfo = new Map<DependencyId, DependencyDebugInfo>();

    function addToListDict<K, V>(dict: Map<K, Set<V>>, key: K, value: V): void {
        if (dict.has(key)) {
            dict.get(key)!.add(value);
        } else {
            dict.set(key, new Set([value]));
        }
    }

    function removeFromListDict<K, V>(dict: Map<K, Set<V>>, key: K, value: V): void {
        const aSet = dict.get(key);
        if (aSet) {
            aSet.delete(value);
            if (aSet.size === 0) {
                dict.delete(key);
            }
        }
    }

    function generateUuid(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    export function generateTimelineId(): TimelineId { return generateUuid(); }

    export function createIllusion(parentIllusion?: IllusionId): IllusionId {
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

    export function registerDependency(
        sourceId: TimelineId,
        targetId: TimelineId,
        callback: (value: any) => void,
        illusionIdOpt: IllusionId | undefined,
        onDisposeOpt: DisposeCallback | undefined
    ): DependencyId {
        const depId = generateUuid();
        const details: DependencyDetails = { sourceId, targetId, callback, illusionId: illusionIdOpt, onDispose: onDisposeOpt };

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

    export function removeDependency(depId: DependencyId): void {
        const details = dependencies.get(depId);
        if (details) {
            if (details.onDispose) {
                try {
                    details.onDispose();
                } catch (ex: any) {
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

    export function disposeIllusion(illusionId: IllusionId): void {
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

    export function getCallbacks(sourceId: TimelineId): { depId: DependencyId; callback: (value: any) => void }[] {
        const depIds = sourceIndex.get(sourceId); // depIds is a Set<DependencyId>
        if (!depIds) { return []; }
        return Array.from(depIds)
            .map(depId => {
                const details = dependencies.get(depId);
                return details ? { depId, callback: details.callback } : undefined;
            })
            .filter((item): item is { depId: DependencyId; callback: (value: any) => void } => item !== undefined);
    }

    export function getDebugInfo(): {
        illusions: DebugInfo[];
        dependencies: DependencyDebugInfo[];
        totalIllusions: number;
        totalDependencies: number;
    } {
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

    /**
     * Outputs the dependency tree to the console, styled like the Linux 'tree' command.
     * This function is fully backward compatible with the original printDebugTree.
     */
    export function printDebugTree(): void {
        // 1. The original debug mode check is maintained for compatibility.
        if (!isDebugEnabled()) {
            console.log('Debug mode is disabled');
            return;
        }

        // 2. Get all dependency information (same as original).
        const info = DependencyCore.getDebugInfo();

        // 3. Parse and build the tree structure.
        const illusionMap = new Map(info.illusions.map(s => [s.illusionId, s]));
        const childrenMap = new Map<IllusionId, IllusionId[]>();
        const rootIllusions = new Set<IllusionId>(info.illusions.map(i => i.illusionId));

        info.illusions.forEach(illusion => {
            if (illusion.parentIllusion && illusionMap.has(illusion.parentIllusion)) {
                if (!childrenMap.has(illusion.parentIllusion)) {
                    childrenMap.set(illusion.parentIllusion, []);
                }
                childrenMap.get(illusion.parentIllusion)!.push(illusion.illusionId);
                rootIllusions.delete(illusion.illusionId);
            }
        });

        const treeData = { rootIllusions, illusionMap, childrenMap, dependencies: info.dependencies };

        // 4. Logic to recursively draw the tree.
        const lines: string[] = [];
        const printRecursive = (illusionId: IllusionId, prefix: string, isLast: boolean) => {
            const illusion = treeData.illusionMap.get(illusionId);
            if (!illusion) return;

            lines.push(`${prefix}${isLast ? '└──' : '├──'} Illusion: ${illusion.illusionId.substring(0, 8)}...`);

            const childPrefix = `${prefix}${isLast ? '    ' : '│   '}`;

            const deps = illusion.dependencyIds.map(id => treeData.dependencies.find(d => d.id === id)).filter(Boolean);
            const children = treeData.childrenMap.get(illusionId) || [];

            deps.forEach((dep, i) => {
                const isLastDep = i === deps.length - 1 && children.length === 0;
                lines.push(`${childPrefix}${isLastDep ? '└──' : '├──'} Dep: ${dep!.id.substring(0, 8)} (src: ${dep!.sourceId.substring(0, 8)} -> tgt: ${dep!.targetId.substring(0, 8)}) ${dep!.hasCleanup ? '🧹' : ''}`);
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

    /**
     * Detects all circular references in the dependency graph and returns a list of their paths.
     * @returns {string[][]} An array of cycle paths, where each path is an array of TimelineIds.
     */
    export function findAllCycles(): string[][] {
        if (!isDebugEnabled()) {
            console.warn('Debug mode is not enabled. Cannot find cycles.');
            return [];
        }

        // 1. Build the dependency graph and list all nodes.
        const graph = new Map<TimelineId, Set<TimelineId>>();
        const allNodes = new Set<TimelineId>();
        for (const details of dependencies.values()) {
            if (!graph.has(details.sourceId)) {
                graph.set(details.sourceId, new Set());
            }
            graph.get(details.sourceId)!.add(details.targetId);
            allNodes.add(details.sourceId);
            allNodes.add(details.targetId);
        }

        // 2. Prepare for cycle detection.
        const cycles: string[][] = [];
        const visited = new Set<TimelineId>();      // Tracks nodes whose exploration is complete.
        const recursionStack = new Set<TimelineId>(); // Tracks nodes on the current exploration path.

        // 3. Run DFS starting from every node.
        for (const node of allNodes) {
            if (!visited.has(node)) {
                dfsForCycleDetection(node, graph, visited, recursionStack, [], cycles);
            }
        }

        return cycles;
    }

    /**
     * A Depth-First Search (DFS) helper function for cycle detection.
     */
    function dfsForCycleDetection(
        node: TimelineId,
        graph: Map<TimelineId, Set<TimelineId>>,
        visited: Set<TimelineId>,
        recursionStack: Set<TimelineId>,
        path: TimelineId[], // The current traversal path (maintains order).
        cycles: string[][]
    ): void {
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
}
// --- Core API: The Building Blocks of Timelines ---
// This section defines the fundamental operations for creating and manipulating
// timelines. It includes functions for reading values (`at`), writing values (`define`),
// and transforming timelines with core operators like `map` and `bind`.
// ---
export type Now = symbol;
export const Now: Now = Symbol("Conceptual time coordinate");

const _id = Symbol('id');
const _last = Symbol('last');

const isNull = <A>(value: A | null | undefined): value is null | undefined => value === null || value === undefined;

export type TimelineErrorHandler = (error: any, context: {
    dependencyId?: DependencyId | string;
    inputValue?: any;
    context?: string;
}) => void;

let globalErrorHandler: TimelineErrorHandler | null = null;

export const setErrorHandler = (handler: TimelineErrorHandler | null): void => {
    globalErrorHandler = handler;
};

const handleCallbackError = (
    depId: DependencyId | string,
    callback: Function,
    value: any,
    ex: any,
    context: string = 'general'
): void => {
    if (context === 'illusion_mismatch' || context === 'bind_transition') {
        console.debug(`Transition info[${context}] for ${depId}: ${ex.message} `);
        return;
    }

    if (globalErrorHandler) {
        try {
            globalErrorHandler(ex, { dependencyId: depId, inputValue: value, context });
        } catch (handlerError) {
            console.error('The custom timeline error handler itself failed:', handlerError);
            console.error('Original error was:', ex);
        }
    } else {
        console.warn(`Callback error[${context}] for dependency ${depId}: ${ex.message} `, {
            inputValue: value,
            callbackType: typeof callback
        });
    }
};

const at = <A>(_now: Now) => (timeline: Timeline<A>): A => timeline[_last];

const currentlyUpdating = new Set<TimelineId>();

const define = <A>(_now: Now) => (value: A) => (timeline: Timeline<A>): void => {
    const timelineId = timeline[_id];

    if (isDebugEnabled()) {
        if (currentlyUpdating.has(timelineId)) {
            console.warn(`Circular dependency detected: Update loop on Timeline ID: ${timelineId}. Aborting update.`);
            return;
        }
        currentlyUpdating.add(timelineId);
    }

    (timeline as any)[_last] = value;
    const callbacks = DependencyCore.getCallbacks(timelineId);
    callbacks.forEach(({ depId, callback }) => {
        try {
            (callback as (val: A) => void)(value);
        } catch (ex: any) {
            handleCallbackError(depId, callback, value, ex, 'callback_execution');
        }
    });

    if (isDebugEnabled()) {
        currentlyUpdating.delete(timelineId);
    }
};

const map = <A, B>(f: (valueA: A) => B) => (timelineA: Timeline<A>): Timeline<B> => {
    const initialB = f(timelineA.at(Now));
    const timelineB = Timeline(initialB);
    const reactionFn = (valueA: A): void => {
        try {
            timelineB.define(Now, f(valueA));
        } catch (ex: any) {
            handleCallbackError('map', f, valueA, ex, 'map_function');
        }
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFn, undefined, undefined);
    return timelineB;
};

const nMap = <A, B>(f: (valueA: A) => B) => (timelineA: Timeline<A | null>): Timeline<B | null> => {
    const currentValueA = timelineA.at(Now);
    let initialB: B | null;
    if (isNull(currentValueA)) {
        initialB = null;
    } else {
        initialB = f(currentValueA);
    }
    const timelineB = Timeline(initialB);
    const reactionFn = (valueA: A | null): void => {
        try {
            if (isNull(valueA)) {
                timelineB.define(Now, null);
            } else {
                timelineB.define(Now, f(valueA));
            }
        } catch (ex: any) {
            handleCallbackError('nMap', f, valueA, ex, 'map_function');
        }
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFn, undefined, undefined);
    return timelineB;
};

const bind = <A, B>(monadf: (valueA: A) => Timeline<B>) => (timelineA: Timeline<A>): Timeline<B> => {
    const initialInnerTimeline = monadf(timelineA.at(Now));
    const timelineB = Timeline(initialInnerTimeline.at(Now));
    let currentIllusionId: IllusionId = DependencyCore.createIllusion();
    const setUpInnerReaction = (innerTimeline: Timeline<B>, illusionForInner: IllusionId): void => {
        const reactionFnInnerToB = (valueInner: B): void => {
            if (currentIllusionId === illusionForInner) {
                timelineB.define(Now, valueInner);
            }
        };
        DependencyCore.registerDependency(innerTimeline[_id], timelineB[_id], reactionFnInnerToB, illusionForInner, undefined);
    };
    setUpInnerReaction(initialInnerTimeline, currentIllusionId);
    const reactionFnAtoB = (valueA: A): void => {
        try {
            const parentIllusionId = currentIllusionId;
            DependencyCore.disposeIllusion(parentIllusionId);
            currentIllusionId = DependencyCore.createIllusion(parentIllusionId);
            const newInnerTimeline = monadf(valueA);
            timelineB.define(Now, newInnerTimeline.at(Now));
            setUpInnerReaction(newInnerTimeline, currentIllusionId);
        } catch (ex: any) {
            handleCallbackError('bind', monadf, valueA, ex, 'bind_transition');
        }
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFnAtoB, undefined, undefined);
    return timelineB;
};

const nBind = <A, B>(monadf: (valueA: A) => Timeline<B>) => (timelineA: Timeline<A | null>): Timeline<B | null> => {
    const initialValueA = timelineA.at(Now);
    let initialInnerTimeline: Timeline<B | null>;
    if (isNull(initialValueA)) {
        initialInnerTimeline = Timeline<B | null>(null);
    } else {
        try {
            initialInnerTimeline = monadf(initialValueA);
        } catch (ex: any) {
            handleCallbackError('nBind_initial', monadf, initialValueA, ex);
            initialInnerTimeline = Timeline<B | null>(null);
        }
    }
    const timelineB = Timeline(initialInnerTimeline.at(Now));
    let currentIllusionId: IllusionId = DependencyCore.createIllusion();
    const setUpInnerReaction = (innerTimeline: Timeline<B | null>, illusionForInner: IllusionId): void => {
        const reactionFnInnerToB = (valueInner: B | null): void => {
            if (currentIllusionId === illusionForInner) {
                timelineB.define(Now, valueInner);
            }
        };
        DependencyCore.registerDependency(innerTimeline[_id], timelineB[_id], reactionFnInnerToB, illusionForInner, undefined);
    };
    setUpInnerReaction(initialInnerTimeline, currentIllusionId);
    const reactionFnAtoB = (valueA: A | null): void => {
        try {
            const parentIllusionId = currentIllusionId;
            DependencyCore.disposeIllusion(parentIllusionId);
            currentIllusionId = DependencyCore.createIllusion(parentIllusionId);
            let newInnerTimeline: Timeline<B | null>;
            if (isNull(valueA)) {
                newInnerTimeline = Timeline<B | null>(null);
            } else {
                newInnerTimeline = monadf(valueA);
            }
            timelineB.define(Now, newInnerTimeline.at(Now));
            setUpInnerReaction(newInnerTimeline, currentIllusionId);
        } catch (ex: any) {
            handleCallbackError('nBind', monadf, valueA, ex, 'nbind_transition');
            const fallbackTimeline = Timeline<B | null>(null);
            timelineB.define(Now, null);
            setUpInnerReaction(fallbackTimeline, currentIllusionId);
        }
    };
    DependencyCore.registerDependency(timelineA[_id], timelineB[_id], reactionFnAtoB, undefined, undefined);
    return timelineB;
};

const scan = <State, Input>(accumulator: (state: State, input: Input) => State) => (initialState: State) => (sourceTimeline: Timeline<Input>): Timeline<State> => {
    const stateTimeline = Timeline(initialState);
    const reactionFn = (input: Input) => {
        try {
            stateTimeline.define(Now, accumulator(stateTimeline.at(Now), input));
        } catch (ex: any) {
            handleCallbackError('scan', accumulator, input, ex, 'scan_accumulator');
        }
    };
    DependencyCore.registerDependency(sourceTimeline[_id], stateTimeline[_id], reactionFn, undefined, undefined);
    stateTimeline.define(Now, accumulator(initialState, sourceTimeline.at(Now)));
    return stateTimeline;
};

const link = <A>(targetTimeline: Timeline<A>) => (sourceTimeline: Timeline<A>): void => {
    const reactionFn = (value: A) => targetTimeline.define(Now, value);
    reactionFn(sourceTimeline.at(Now));
    DependencyCore.registerDependency(sourceTimeline[_id], targetTimeline[_id], reactionFn, undefined, undefined);
};

const distinctUntilChanged = <A>(sourceTimeline: Timeline<A>): Timeline<A> => {
    let lastValue = sourceTimeline.at(Now);
    const resultTimeline = Timeline(lastValue);
    const reactionFn = (currentValue: A) => {
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
const using = <A, B>(resourceFactory: ResourceFactory<A, B>) => (sourceTimeline: Timeline<A>): Timeline<B | null> => {
    const resultTimeline = Timeline<B | null>(null);
    let currentIllusionId: IllusionId | null = null;
    const reactionFn = (value: A): void => {
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
            } else {
                resultTimeline.define(Now, null);
            }
        } catch (ex: any) {
            handleCallbackError('using', resourceFactory, value, ex);
        }
    };
    reactionFn(sourceTimeline.at(Now));
    DependencyCore.registerDependency(sourceTimeline[_id], resultTimeline[_id], reactionFn, undefined, undefined);
    return resultTimeline;
};

const nUsing = <A, B>(resourceFactory: ResourceFactory<A, B>) => (sourceTimeline: Timeline<A | null>): Timeline<B | null> => {
    const wrappedFactory: ResourceFactory<A | null, B> = (value: A | null): Resource<B> | null => {
        if (isNull(value)) { return null; }
        return resourceFactory(value);
    };
    return using(wrappedFactory)(sourceTimeline);
};

// --- Timeline Interface & Factory ---
// This is the public-facing API of the library. The `Timeline` interface defines
// the available methods on a timeline instance, while the `Timeline` factory
// function constructs new timelines and intelligently equips them with nullable-aware
// methods (`nMap`, `nBind`) if they are created with a null initial value.
// ---
export interface Timeline<A> {
    readonly [_id]: TimelineId;
    readonly [_last]: A;
    at(now: Now): A;
    define(now: Now, value: A): void;
    map<B>(f: (value: A) => B): Timeline<B>;
    bind<B>(monadf: (value: A) => Timeline<B>): Timeline<B>;
    scan<State>(accumulator: (state: State, input: A) => State, initialState: State): Timeline<State>;
    link(targetTimeline: Timeline<A>): void;
    distinctUntilChanged(): Timeline<A>;
    using<B>(resourceFactory: ResourceFactory<A, B>): Timeline<B | null>;
}

export interface NullableTimeline<A> extends Timeline<A | null> {
    nMap<B>(f: (value: A) => B): Timeline<B | null>;
    nBind<B>(monadf: (value: A) => Timeline<B>): Timeline<B | null>;
    nUsing<B>(resourceFactory: ResourceFactory<A, B>): Timeline<B | null>;
}

export const Timeline = <A>(initialValue: A): Timeline<A> & (A extends null | undefined ? never : A extends infer U | null ? NullableTimeline<Exclude<U, null>> : {}) => {
    const timelineInstance: Omit<Timeline<A>, keyof Timeline<any>> & { [_id]: TimelineId;[_last]: A } = {
        [_id]: DependencyCore.generateTimelineId(),
        [_last]: initialValue,
    };

    const baseTimeline = {
        at: (now: Now): A => at<A>(now)(timelineInstance as Timeline<A>),
        define: (now: Now, value: A): void => define<A>(now)(value)(timelineInstance as Timeline<A>),
        map: <B>(f: (value: A) => B): Timeline<B> => map<A, B>(f)(timelineInstance as Timeline<A>),
        bind: <B>(monadf: (value: A) => Timeline<B>): Timeline<B> => bind<A, B>(monadf)(timelineInstance as Timeline<A>),
        scan: <State>(accumulator: (state: State, input: A) => State, initialState: State): Timeline<State> => scan<State, A>(accumulator)(initialState)(timelineInstance as Timeline<A>),
        link: (target: Timeline<A>): void => link<A>(target)(timelineInstance as Timeline<A>),
        distinctUntilChanged: (): Timeline<A> => distinctUntilChanged<A>(timelineInstance as Timeline<A>),
        using: <B>(resourceFactory: ResourceFactory<A, B>): Timeline<B | null> => using<A, B>(resourceFactory)(timelineInstance as Timeline<A>)
    };

    if ((initialValue as any) == null) {
        return Object.assign(timelineInstance, baseTimeline, {
            nMap: <B>(f: (value: Exclude<A, null | undefined>) => B): Timeline<B | null> =>
                nMap<Exclude<A, null | undefined>, B>(f)(timelineInstance as Timeline<Exclude<A, null | undefined> | null>),
            nBind: <B>(monadf: (value: Exclude<A, null | undefined>) => Timeline<B>): Timeline<B | null> =>
                nBind<Exclude<A, null | undefined>, B>(monadf)(timelineInstance as Timeline<Exclude<A, null | undefined> | null>),
            nUsing: <B>(resourceFactory: ResourceFactory<Exclude<A, null | undefined>, B>): Timeline<B | null> =>
                nUsing<Exclude<A, null | undefined>, B>(resourceFactory)(timelineInstance as Timeline<Exclude<A, null | undefined> | null>)
        }) as any;
    }

    return Object.assign(timelineInstance, baseTimeline) as any;
};

// --- Exported Utilities ---
// A collection of helper functions and pre-defined timeline constants that
// simplify common use cases and improve the readability of reactive code.
// ---
export const ID = <A>(initialValue: A): Timeline<A> => Timeline(initialValue);
export const FalseTimeline: Timeline<boolean> = Timeline(false);
export const TrueTimeline: Timeline<boolean> = Timeline(true);

export const pipeBind = <A, B, C>(f: (a: A) => Timeline<B>) => (g: (b: B) => Timeline<C>) => (a: A): Timeline<C> => {
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
export const combineLatestWith = <A, B, C>(f: (valA: A, valB: B) => C) => (timelineA: Timeline<A>) => (timelineB: Timeline<B>): Timeline<C> => {
    let latestA = timelineA.at(Now);
    let latestB = timelineB.at(Now);
    const resultTimeline = Timeline(f(latestA, latestB));
    const illusionId = (resultTimeline as any)[_id] as IllusionId;
    const weakResultRef = new WeakRef(resultTimeline);

    const reactionA = (valA: A): void => {
        latestA = valA;
        const strongResult = weakResultRef.deref();
        if (strongResult) {
            strongResult.define(Now, f(latestA, latestB));
        }
    };
    DependencyCore.registerDependency(timelineA[_id], resultTimeline[_id], reactionA, illusionId, undefined);

    const reactionB = (valB: B): void => {
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

export const nCombineLatestWith = <A, B, C>(f: (valA: A, valB: B) => C) => (timelineA: Timeline<A | null>) => (timelineB: Timeline<B | null>): Timeline<C | null> => {
    let latestA = timelineA.at(Now);
    let latestB = timelineB.at(Now);

    const calculateCombinedValue = (): C | null => {
        if (isNull(latestA) || isNull(latestB)) {
            return null;
        }
        return f(latestA, latestB);
    };

    const resultTimeline = Timeline(calculateCombinedValue());
    const illusionId = (resultTimeline as any)[_id] as IllusionId;
    const weakResultRef = new WeakRef(resultTimeline);

    const reactionA = (valA: A | null): void => {
        latestA = valA;
        const strongResult = weakResultRef.deref();
        if (strongResult) {
            strongResult.define(Now, calculateCombinedValue());
        }
    };
    DependencyCore.registerDependency(timelineA[_id], resultTimeline[_id], reactionA, illusionId, undefined);

    const reactionB = (valB: B | null): void => {
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

const orOf = (timelineA: Timeline<boolean>, timelineB: Timeline<boolean>): Timeline<boolean> =>
    combineLatestWith((a: boolean, b: boolean) => a || b)(timelineA)(timelineB);

const andOf = (timelineA: Timeline<boolean>, timelineB: Timeline<boolean>): Timeline<boolean> =>
    combineLatestWith((a: boolean, b: boolean) => a && b)(timelineA)(timelineB);

const addOf = (timelineA: Timeline<number>, timelineB: Timeline<number>): Timeline<number> =>
    combineLatestWith((a: number, b: number) => a + b)(timelineA)(timelineB);

const maxOf2 = (timelineA: Timeline<number>, timelineB: Timeline<number>): Timeline<number> =>
    combineLatestWith((a: number, b: number) => Math.max(a, b))(timelineA)(timelineB);

const minOf2 = (timelineA: Timeline<number>, timelineB: Timeline<number>): Timeline<number> =>
    combineLatestWith((a: number, b: number) => Math.min(a, b))(timelineA)(timelineB);

const concatOf = (timelineA: Timeline<any[]>, timelineB: Timeline<any>): Timeline<any[]> =>
    combineLatestWith((arrayA: any[], valueB: any) => arrayA.concat(valueB))(timelineA)(timelineB);

export const foldTimelines = <A, B>(
    timelines: readonly Timeline<A>[],
    initialTimeline: Timeline<B>,
    accumulator: (acc: Timeline<B>, current: Timeline<A>) => Timeline<B>
): Timeline<B> => {
    return timelines.reduce(accumulator, initialTimeline);
};


export const anyOf = (booleanTimelines: readonly Timeline<boolean>[]): Timeline<boolean> => {
    return foldTimelines(booleanTimelines, FalseTimeline, orOf);
};

export const allOf = (booleanTimelines: readonly Timeline<boolean>[]): Timeline<boolean> => {
    return foldTimelines(booleanTimelines, TrueTimeline, andOf);
};

export const sumOf = (numberTimelines: readonly Timeline<number>[]): Timeline<number> => {
    return foldTimelines(numberTimelines, Timeline(0), addOf);
};

export const maxOf = (numberTimelines: readonly Timeline<number>[]): Timeline<number> => {
    return foldTimelines(numberTimelines, Timeline(-Infinity), maxOf2);
};

export const minOf = (numberTimelines: readonly Timeline<number>[]): Timeline<number> => {
    return foldTimelines(numberTimelines, Timeline(Infinity), minOf2);
};

export const averageOf = (numberTimelines: readonly Timeline<number>[]): Timeline<number> => {
    if (numberTimelines.length === 0) return Timeline(0);
    return sumOf(numberTimelines).map(sum => sum / numberTimelines.length);
};

export const listOf = <A>(
    timelines: readonly Timeline<A>[]
): Timeline<A[]> => {
    const emptyArrayTimeline = Timeline<A[]>([]);
    return foldTimelines(timelines, emptyArrayTimeline, concatOf) as Timeline<A[]>;
};

const nOrOf = (timelineA: Timeline<boolean | null>, timelineB: Timeline<boolean | null>): Timeline<boolean | null> =>
    nCombineLatestWith((a: boolean, b: boolean) => a || b)(timelineA)(timelineB);

const nAndOf = (timelineA: Timeline<boolean | null>, timelineB: Timeline<boolean | null>): Timeline<boolean | null> =>
    nCombineLatestWith((a: boolean, b: boolean) => a && b)(timelineA)(timelineB);

const nAddOf = (timelineA: Timeline<number | null>, timelineB: Timeline<number | null>): Timeline<number | null> =>
    nCombineLatestWith((a: number, b: number) => a + b)(timelineA)(timelineB);

const nConcatOf = (timelineA: Timeline<any[] | null>, timelineB: Timeline<any | null>): Timeline<any[] | null> =>
    nCombineLatestWith((arrayA: any[], valueB: any) => arrayA.concat(valueB))(timelineA)(timelineB);

export const nAnyOf = (booleanTimelines: readonly Timeline<boolean | null>[]): Timeline<boolean | null> => {
    return foldTimelines(booleanTimelines, Timeline<boolean | null>(false), nOrOf);
};

export const nAllOf = (booleanTimelines: readonly Timeline<boolean | null>[]): Timeline<boolean | null> => {
    return foldTimelines(booleanTimelines, Timeline<boolean | null>(true), nAndOf);
};

export const nSumOf = (numberTimelines: readonly Timeline<number | null>[]): Timeline<number | null> => {
    return foldTimelines(numberTimelines, Timeline<number | null>(0), nAddOf);
};

export const nListOf = (timelines: readonly Timeline<any | null>[]): Timeline<any[] | null> => {
    return foldTimelines(timelines, Timeline<any[] | null>([]), nConcatOf) as Timeline<any[] | null>;
};

type TimelinesToValues<T extends readonly Timeline<any>[]> = {
    -readonly [P in keyof T]: T[P] extends Timeline<infer V> ? V : never
};

/**
 * A generic utility to combine multiple timelines with an N-ary function.
 * This is highly performant and should be used for complex combinations that cannot
 * be expressed with simpler helpers like `anyOf`, `sumOf`, etc.
 */
export const combineLatest = <T extends readonly Timeline<any>[], R>(
    combinerFn: (...values: TimelinesToValues<T>) => R
) => (timelines: T): Timeline<R> => {
    if (!timelines || timelines.length === 0) {
        throw new Error("combineLatest requires at least one timeline.");
    }

    const latestValues = timelines.map(t => t.at(Now)) as TimelinesToValues<T>;
    const resultTimeline = Timeline(combinerFn(...latestValues));
    const illusionId = (resultTimeline as any)[_id] as IllusionId;
    const weakResultRef = new WeakRef(resultTimeline);

    timelines.forEach((timeline, index) => {
        const reactionFn = (value: any) => {
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
export const nCombineLatest = <T extends readonly (Timeline<any | null>)[], R>(
    combinerFn: (...values: TimelinesToValues<T>) => R
) => (timelines: T): Timeline<R | null> => {
    if (!timelines || timelines.length === 0) {
        return Timeline<R | null>(null);
    }

    const latestValues = timelines.map(t => t.at(Now)) as TimelinesToValues<T>;

    const calculateResult = (): R | null => {
        if (latestValues.some(isNull)) {
            return null;
        }
        return combinerFn(...latestValues);
    };

    const resultTimeline = Timeline<R | null>(calculateResult());
    const illusionId = (resultTimeline as any)[_id] as IllusionId;
    const weakResultRef = new WeakRef(resultTimeline);

    timelines.forEach((timeline, index) => {
        const reactionFn = (value: any | null) => {
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

// --- Usage Examples and Tests ---
// This section demonstrates how to use the library's features, providing clear
// examples for both basic and advanced composition functions. It serves as a
// practical guide and a quick test suite for the core functionality.
// ---
const demonstrateUsage = (): void => {
    // --- Setup ---
    console.log('=== Setting up initial timelines ===');
    const timeline1: Timeline<number> = Timeline(1);
    const timeline2: Timeline<number> = Timeline(2);
    const timeline3: Timeline<number> = Timeline(3);
    const timeline4: Timeline<number> = Timeline(4);

    // --- Demo of fold-based helper functions (Recommended standard method) ---
    console.log('\n=== Fold-based helpers (Recommended) Demo ===');
    const boolTimelines: readonly Timeline<boolean>[] = [Timeline(true), Timeline(false), Timeline(true)];
    const numberTimelines: readonly Timeline<number>[] = [10, 20, 30].map(Timeline);

    console.log('anyOf([true, false, true]):', anyOf(boolTimelines).at(Now));       // true
    console.log('allOf([true, false, true]):', allOf(boolTimelines).at(Now));       // false
    console.log('sumOf([10, 20, 30]):', sumOf(numberTimelines).at(Now));       // 60
    console.log('maxOf([10, 20, 30]):', maxOf(numberTimelines).at(Now));       // 30
    console.log('minOf([10, 20, 30]):', minOf(numberTimelines).at(Now));       // 10
    console.log('averageOf([10, 20, 30]):', averageOf(numberTimelines).at(Now)); // 20

    // --- listOf Demo ---
    const listResult: Timeline<number[]> = listOf([timeline1, timeline2, timeline3]);
    console.log('listOf([t1, t2, t3]) initial:', listResult.at(Now)); // [1, 2, 3]

    // --- combineLatest Demo (for complex, N-ary operations) ---
    console.log('\n=== combineLatest (for complex, non-foldable functions) Demo ===');
    const sumTimeline: Timeline<number> = combineLatest(
        (a: number, b: number, c: number, d: number) => a + b + c + d
    )([timeline1, timeline2, timeline3, timeline4]);

    console.log('combineLatest sum (initial):', sumTimeline.at(Now)); // 1 + 2 + 3 + 4 = 10

    // --- Reactivity Test ---
    console.log('\n=== Reactivity Test ===');
    console.log('Updating timeline1 from 1 to 10...');
    timeline1.define(Now, 10);
    console.log('... update complete.');
    console.log('listOf result after update:', listResult.at(Now)); // [10, 2, 3]
    console.log('combineLatest sum after update:', sumTimeline.at(Now)); // 10 + 2 + 3 + 4 = 19
};

// Uncomment the following line to run the demo
// demonstrateUsage();