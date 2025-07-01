// Symbol for internal id property
const _id = Symbol('id');
// --- Symbol for the last value
const _last = Symbol('last');

// --- Core System Abstractions ---
type TimelineId = string;
type DependencyId = string;
type ScopeId = string;
type DisposeCallback = () => void;

interface DependencyDetails {
    sourceId: TimelineId;
    targetId: TimelineId;
    callback: Function;
    scopeId: ScopeId | undefined;
    onDispose: DisposeCallback | undefined;
}

// --- 改良: 型安全なResource定義 ---
interface Resource<A> {
    readonly resource: A;
    readonly cleanup: DisposeCallback;
}

type ResourceFactory<A, B> = (value: A) => Resource<B> | null;

export const createResource = <A>(resource: A, cleanup: DisposeCallback): Resource<A> => ({
    resource,
    cleanup
} as const);

// --- 改良: デバッグ情報の型定義 ---
interface DebugInfo {
    scopeId: ScopeId;
    dependencyIds: DependencyId[];
    createdAt: number;
    parentScope?: ScopeId;
}

interface DependencyDebugInfo {
    id: DependencyId;
    sourceId: TimelineId;
    targetId: TimelineId;
    scopeId?: ScopeId;
    hasCleanup: boolean;
    createdAt: number;
}

// --- 改良: 環境に依存しないデバッグモード判定 ---
// Add global declaration for process to avoid TypeScript error in browser context
declare var process: any;

const debugMode = (() => {
    // Node.js環境での判定
    if (typeof process !== 'undefined' && process.env) {
        return process.env.NODE_ENV === 'development';
    }

    // ブラウザ環境での判定（より厳密なチェック）
    if (
        typeof window !== 'undefined' &&
        typeof window.location !== 'undefined' &&
        typeof URLSearchParams !== 'undefined'
    ) {
        // 1. URLパラメータでの制御
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('debug')) {
            return urlParams.get('debug') !== 'false';
        }

        // 2. localStorageでの制御（永続化）
        try {
            const debugFlag = localStorage.getItem('timeline-debug');
            if (debugFlag !== null) {
                return debugFlag === 'true';
            }
        } catch (e) {
            // localStorage が使えない環境では無視
        }

        // 3. developmentビルドの検出（webpack等）
        // @ts-ignore
        if (typeof __DEV__ !== 'undefined') {
            // @ts-ignore
            return __DEV__;
        }

        // 4. 本番環境の検出（一般的なパターン）
        if (window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.startsWith('192.168.') ||
            window.location.port !== '') {
            return true; // 開発環境と推定
        }
    }

    // デフォルトは無効
    return false;
})();

// DependencyCore内で使用する際の判定関数
const isDebugEnabled = (): boolean => {
    // 一時的な有効化をチェック
    if (typeof window !== 'undefined' && (window as any).__TIMELINE_DEBUG_TEMP__) {
        return true;
    }
    return debugMode;
};

// より柔軟な制御のためのユーティリティ関数
export const DebugControl = {
    // 動的にデバッグモードを有効/無効化
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

    // 現在の状態を確認
    isEnabled: () => isDebugEnabled(),

    // セッション中の一時的な有効化（リロード不要）
    enableTemporary: () => {
        if (typeof window !== 'undefined') {
            (window as any).__TIMELINE_DEBUG_TEMP__ = true;
            console.log('Timeline debug mode temporarily enabled for this session.');
        }
    }
};

// -----------------------------------------------------------------------------
// DependencyCore: デバッグ支援強化版
// -----------------------------------------------------------------------------
namespace DependencyCore {
    const dependencies = new Map<DependencyId, DependencyDetails>();
    const sourceIndex = new Map<TimelineId, DependencyId[]>();
    const scopeIndex = new Map<ScopeId, DependencyId[]>();

    // デバッグ関連
    const scopeDebugInfo = new Map<ScopeId, DebugInfo>();
    const dependencyDebugInfo = new Map<DependencyId, DependencyDebugInfo>();

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
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    export function generateTimelineId(): TimelineId { return generateUuid(); }

    export function createScope(parentScope?: ScopeId): ScopeId {
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
    }

    export function registerDependency(
        sourceId: TimelineId,
        targetId: TimelineId,
        callback: Function,
        scopeIdOpt: ScopeId | undefined,
        onDisposeOpt: DisposeCallback | undefined
    ): DependencyId {
        const depId = generateUuid();
        const details: DependencyDetails = { sourceId, targetId, callback, scopeId: scopeIdOpt, onDispose: onDisposeOpt };

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
    }

    export function removeDependency(depId: DependencyId): void {
        const details = dependencies.get(depId);
        if (details) {
            if (details.onDispose) {
                try {
                    details.onDispose();
                } catch (ex: any) {
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
    }

    export function disposeScope(scopeId: ScopeId): void {
        const depIds = scopeIndex.get(scopeId);
        if (depIds) {
            const idsToRemove = [...depIds];
            idsToRemove.forEach(depId => removeDependency(depId));
            scopeIndex.delete(scopeId);

            if (isDebugEnabled()) {
                scopeDebugInfo.delete(scopeId);
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

    export function getDebugInfo(): {
        scopes: DebugInfo[];
        dependencies: DependencyDebugInfo[];
        totalScopes: number;
        totalDependencies: number;
    } {
        if (!isDebugEnabled()) {
            return { scopes: [], dependencies: [], totalScopes: 0, totalDependencies: 0 };
        }

        return {
            scopes: Array.from(scopeDebugInfo.values()),
            dependencies: Array.from(dependencyDebugInfo.values()),
            totalScopes: scopeDebugInfo.size,
            totalDependencies: dependencyDebugInfo.size
        };
    }

    export function printDebugTree(): void {
        if (!isDebugEnabled()) {
            console.log('Debug mode is disabled');
            return;
        }

        const info = getDebugInfo();
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
}

// -----------------------------------------------------------------------------
// Core API
// -----------------------------------------------------------------------------
export type Now = symbol;
export const Now: Now = Symbol("Conceptual time coordinate");

const isNull = <A>(value: A | null | undefined): value is null | undefined => value === null || value === undefined;

const handleCallbackError = (
    depId: DependencyId | string,
    callback: Function,
    value: any,
    ex: any,
    context: string = 'general'
): void => {
    if (context === 'scope_mismatch' || context === 'bind_transition') {
        console.debug(`Transition info [${context}] for ${depId}: ${ex.message}`);
        return;
    }
    console.warn(`Callback error [${context}] for dependency ${depId}: ${ex.message}`, {
        inputValue: value,
        callbackType: typeof callback
    });
};

const at = <A>(_now: Now) => (timeline: Timeline<A>): A => timeline[_last];

const define = <A>(_now: Now) => (value: A) => (timeline: Timeline<A>): void => {
    (timeline as any)[_last] = value;
    const callbacks = DependencyCore.getCallbacks(timeline[_id]);
    callbacks.forEach(({ depId, callback }) => {
        try {
            (callback as (val: A) => void)(value);
        } catch (ex: any) {
            handleCallbackError(depId, callback, value, ex, 'callback_execution');
        }
    });
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
    let currentScopeId: ScopeId = DependencyCore.createScope();
    const setUpInnerReaction = (innerTimeline: Timeline<B>, scopeForInner: ScopeId): void => {
        const reactionFnInnerToB = (valueInner: B): void => {
            if (currentScopeId === scopeForInner) {
                timelineB.define(Now, valueInner);
            }
        };
        DependencyCore.registerDependency(innerTimeline[_id], timelineB[_id], reactionFnInnerToB, scopeForInner, undefined);
    };
    setUpInnerReaction(initialInnerTimeline, currentScopeId);
    const reactionFnAtoB = (valueA: A): void => {
        try {
            DependencyCore.disposeScope(currentScopeId);
            currentScopeId = DependencyCore.createScope();
            const newInnerTimeline = monadf(valueA);
            timelineB.define(Now, newInnerTimeline.at(Now));
            setUpInnerReaction(newInnerTimeline, currentScopeId);
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
    let currentScopeId: ScopeId = DependencyCore.createScope();
    const setUpInnerReaction = (innerTimeline: Timeline<B | null>, scopeForInner: ScopeId): void => {
        const reactionFnInnerToB = (valueInner: B | null): void => {
            if (currentScopeId === scopeForInner) {
                timelineB.define(Now, valueInner);
            }
        };
        DependencyCore.registerDependency(innerTimeline[_id], timelineB[_id], reactionFnInnerToB, scopeForInner, undefined);
    };
    setUpInnerReaction(initialInnerTimeline, currentScopeId);
    const reactionFnAtoB = (valueA: A | null): void => {
        try {
            DependencyCore.disposeScope(currentScopeId);
            currentScopeId = DependencyCore.createScope();
            let newInnerTimeline: Timeline<B | null>;
            if (isNull(valueA)) {
                newInnerTimeline = Timeline<B | null>(null);
            } else {
                newInnerTimeline = monadf(valueA);
            }
            timelineB.define(Now, newInnerTimeline.at(Now));
            setUpInnerReaction(newInnerTimeline, currentScopeId);
        } catch (ex: any) {
            handleCallbackError('nBind', monadf, valueA, ex, 'nbind_transition');
            const fallbackTimeline = Timeline<B | null>(null);
            timelineB.define(Now, null);
            setUpInnerReaction(fallbackTimeline, currentScopeId);
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

// -----------------------------------------------------------------------------
// 改良されたリソース管理プリミティブの実装
// -----------------------------------------------------------------------------
const using = <A, B>(resourceFactory: ResourceFactory<A, B>) => (sourceTimeline: Timeline<A>): Timeline<B | null> => {
    const resultTimeline = Timeline<B | null>(null);
    let currentScopeId: ScopeId | null = null;
    const reactionFn = (value: A): void => {
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

// -----------------------------------------------------------------------------
// Timeline Interface & Factory: 進化の統合
// -----------------------------------------------------------------------------
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

    // ★★★ 修正箇所 ★★★
    // initialValueがnullまたはundefinedの場合のみNullableTimelineを返すように修正
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

// -----------------------------------------------------------------------------
// Exported Utilities
// -----------------------------------------------------------------------------
export const ID = <A>(initialValue: A): Timeline<A> => Timeline(initialValue);
export const FalseTimeline: Timeline<boolean> = Timeline(false);
export const TrueTimeline: Timeline<boolean> = Timeline(true);

export const pipeBind = <A, B, C>(f: (a: A) => Timeline<B>) => (g: (b: B) => Timeline<C>) => (a: A): Timeline<C> => {
    const timelineFromF = f(a);
    return timelineFromF.bind(g);
};

export const DebugUtils = {
    getInfo: DependencyCore.getDebugInfo,
    printTree: DependencyCore.printDebugTree
};

// =============================================================================
// ===== 刷新された合成関数セクション (ここから) =====
// =============================================================================

// --- レベル1: 基本的な二項演算の器（二項演算なので３つ以上は使えない） ---
export const combineLatestWith = <A, B, C>(f: (valA: A, valB: B) => C) => (timelineA: Timeline<A>) => (timelineB: Timeline<B>): Timeline<C> => {
    let latestA = timelineA.at(Now);
    let latestB = timelineB.at(Now);
    const resultTimeline = Timeline(f(latestA, latestB));

    const reactionA = (valA: A): void => {
        latestA = valA;
        resultTimeline.define(Now, f(latestA, latestB));
    };
    DependencyCore.registerDependency(timelineA[_id], resultTimeline[_id], reactionA, undefined, undefined);

    const reactionB = (valB: B): void => {
        latestB = valB;
        resultTimeline.define(Now, f(latestA, latestB));
    };
    DependencyCore.registerDependency(timelineB[_id], resultTimeline[_id], reactionB, undefined, undefined);

    return resultTimeline;
};

// ---  (Nullable版) ---
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

    const reactionA = (valA: A | null): void => {
        latestA = valA;
        resultTimeline.define(Now, calculateCombinedValue());
    };
    DependencyCore.registerDependency(timelineA[_id], resultTimeline[_id], reactionA, undefined, undefined);

    const reactionB = (valB: B | null): void => {
        latestB = valB;
        resultTimeline.define(Now, calculateCombinedValue());
    };
    DependencyCore.registerDependency(timelineB[_id], resultTimeline[_id], reactionB, undefined, undefined);

    return resultTimeline;
};

// --- レベル2: 具体的な二項演算の定義 ---
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

// --- レベル3: 汎用的な畳み込み ---
export const foldTimelines = <A, B>(
    timelines: readonly Timeline<A>[],
    initialTimeline: Timeline<B>,
    accumulator: (acc: Timeline<B>, current: Timeline<A>) => Timeline<B>
): Timeline<B> => {
    return timelines.reduce(accumulator, initialTimeline);
};


// --- レベル4: foldを利用した高レベルヘルパー関数の実装 ---
export const anyOf = (booleanTimelines: readonly Timeline<boolean>[]): Timeline<boolean> => {
    // orOfによる畳み込み。単位元は `false`
    return foldTimelines(booleanTimelines, FalseTimeline, orOf);
};

export const allOf = (booleanTimelines: readonly Timeline<boolean>[]): Timeline<boolean> => {
    // andOfによる畳み込み。単位元は `true`
    return foldTimelines(booleanTimelines, TrueTimeline, andOf);
};

export const sumOf = (numberTimelines: readonly Timeline<number>[]): Timeline<number> => {
    // addOfによる畳み込み。単位元は `0`
    return foldTimelines(numberTimelines, Timeline(0), addOf);
};

export const maxOf = (numberTimelines: readonly Timeline<number>[]): Timeline<number> => {
    // maxOf2による畳み込み。単位元は `-Infinity`
    return foldTimelines(numberTimelines, Timeline(-Infinity), maxOf2);
};

export const minOf = (numberTimelines: readonly Timeline<number>[]): Timeline<number> => {
    // minOf2による畳み込み。単位元は `Infinity`
    return foldTimelines(numberTimelines, Timeline(Infinity), minOf2);
};

export const averageOf = (numberTimelines: readonly Timeline<number>[]): Timeline<number> => {
    // averageは単純なfoldではないため、sumOfの結果をmapして計算する
    if (numberTimelines.length === 0) return Timeline(0); // ゼロ除算を避ける
    return sumOf(numberTimelines).map(sum => sum / numberTimelines.length);
};

export const listOf = <A>(
    timelines: readonly Timeline<A>[]
): Timeline<A[]> => {
    const emptyArrayTimeline = Timeline<A[]>([]);
    return foldTimelines(timelines, emptyArrayTimeline, concatOf) as Timeline<A[]>;
};

// --- Nullable版の応用関数 ---

// Nullable版の二項演算子
// --- Nullable版の二項演算子 (修正版) ---

const nOrOf = (timelineA: Timeline<boolean | null>, timelineB: Timeline<boolean | null>): Timeline<boolean | null> =>
    nCombineLatestWith((a: boolean, b: boolean) => a || b)(timelineA)(timelineB);

const nAndOf = (timelineA: Timeline<boolean | null>, timelineB: Timeline<boolean | null>): Timeline<boolean | null> =>
    nCombineLatestWith((a: boolean, b: boolean) => a && b)(timelineA)(timelineB);

const nAddOf = (timelineA: Timeline<number | null>, timelineB: Timeline<number | null>): Timeline<number | null> =>
    nCombineLatestWith((a: number, b: number) => a + b)(timelineA)(timelineB);

const nConcatOf = (timelineA: Timeline<any[] | null>, timelineB: Timeline<any | null>): Timeline<any[] | null> =>
    nCombineLatestWith((arrayA: any[], valueB: any) => arrayA.concat(valueB))(timelineA)(timelineB);

// Nullable版の高レベルヘルパー関数
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

// --- 特殊ケースのためのユーティリティ ---
// 型ヘルパー：Timelineの配列から、それが持つ値の型のタプルを抽出する
type TimelinesToValues<T extends readonly Timeline<any>[]> = {
    -readonly [P in keyof T]: T[P] extends Timeline<infer V> ? V : never
};

/**
 * 複数のタイムラインを、foldでは表現できない複雑なN項関数で結合するための汎用ユーティリティ。
 * (例: (a, b, c) => (a + b) / c)
 * 通常は、より宣言的な `anyOf`, `sumOf`, `listOf` の使用を推奨。
 */
export const combineLatest = <T extends readonly Timeline<any>[], R>(
    combinerFn: (...values: TimelinesToValues<T>) => R
) => (timelines: T): Timeline<R> => {
    if (!Array.isArray(timelines) || timelines.length === 0) {
        // an empty array is a valid input for some use cases, so we should not throw an error
        // for now, we will return a timeline with an empty array
        // @ts-ignore
        return Timeline([] as any) as Timeline<R>;
    }
    if (timelines.length === 1) {
        return timelines[0].map(value => combinerFn(...([value] as TimelinesToValues<T>)));
    }

    const arrayTimeline = timelines.reduce(
        (acc, timeline, index) => {
            if (index === 0) {
                return timeline.map(value => [value]);
            }
            return combineLatestWith((accArray: any[], newValue: any) => [...accArray, newValue])(acc as Timeline<any[]>)(timeline);
        },
        undefined as unknown as Timeline<any[]>
    );

    return arrayTimeline.map(valueArray => combinerFn(...(valueArray as any)));
};

/**
 * 複数のタイムラインを結合する汎用ユーティリティのNullable版。
 * 入力されるタイムラインのいずれかがnullを持つ場合、結果もnullとなる。
 */
export const nCombineLatest = <T extends readonly Timeline<any | null>[], R>(
    combinerFn: (...values: TimelinesToValues<T>) => R
) => (timelines: T): Timeline<R | null> => {

    if (!Array.isArray(timelines) || timelines.length === 0) {
        return Timeline(null);
    }

    // reduceを使って、値の配列を持つタイムライン、またはnullを持つタイムラインを生成する
    const arrayTimeline = timelines.reduce(
        (acc, timeline, index) => {
            if (index === 0) {
                // 最初の要素: nMapを使い、値がnullなら結果もnull、さもなければ配列でラップする
                return (timeline as NullableTimeline<any>).nMap(value => [value]);
            }
            // 2番目以降の要素: nCombineLatestWithを使い、nullを伝播させながら配列に要素を追加する
            // ★★★ 修正箇所 ★★★
            return nCombineLatestWith(
                (accArray: any[], newValue: any) => [...accArray, newValue]
            )(acc as Timeline<any[] | null>)(timeline);
        },
        undefined as unknown as Timeline<any[] | null>
    );

    // 最終結果: arrayTimelineがnull値を持っていればそのままnullを、さもなければcombinerFnを適用
    return (arrayTimeline as NullableTimeline<any[]>).nMap(
        valueArray => combinerFn(...(valueArray as any))
    );
};

// -----------------------------------------------------------------------------
// 使用例とテスト
// -----------------------------------------------------------------------------

const demonstrateUsage = (): void => {
    // --- セットアップ ---
    // テストで使用する基本的なタイムラインを準備します。
    console.log('=== Setting up initial timelines ===');
    const timeline1: Timeline<number> = Timeline(1);
    const timeline2: Timeline<number> = Timeline(2);
    const timeline3: Timeline<number> = Timeline(3);
    const timeline4: Timeline<number> = Timeline(4);

    // --- foldベースのヘルパー関数のデモ (推奨される標準的な方法) ---
    console.log('\n=== fold-based helpers (Recommended) Demo ===');
    const boolTimelines: readonly Timeline<boolean>[] = [Timeline(true), Timeline(false), Timeline(true)];
    const numberTimelines: readonly Timeline<number>[] = [10, 20, 30].map(Timeline);

    // 各ヘルパー関数の初期値を確認します。
    console.log('anyOf([true, false, true]):', anyOf(boolTimelines).at(Now));       // true
    console.log('allOf([true, false, true]):', allOf(boolTimelines).at(Now));       // false
    console.log('sumOf([10, 20, 30]):', sumOf(numberTimelines).at(Now));       // 60
    console.log('maxOf([10, 20, 30]):', maxOf(numberTimelines).at(Now));       // 30
    console.log('minOf([10, 20, 30]):', minOf(numberTimelines).at(Now));       // 10
    console.log('averageOf([10, 20, 30]):', averageOf(numberTimelines).at(Now)); // 20

    /**
     * --- listOf のデモ (複数タイムラインの結合) ---
     * `listOf` は、複数のタイムラインを単一のタイムラインに結合し、
     * その値を配列として提供します。
     * 
     * 注意: `listOf` は、配列の要素がすべて同じ型であることを前提としています。
    */
    const listResult: Timeline<number[]> = listOf([timeline1, timeline2, timeline3]);
    console.log('listOf([t1, t2, t3]) initial:', listResult.at(Now)); // [1, 2, 3]

    // --- combineLatest のデモ (特殊ケース・N項演算用) ---
    console.log('\n=== combineLatest (for complex, non-foldable functions) Demo ===');
    // `combineLatest` は、foldで表現できない複雑なN項関数で結合する場合に使います。
    const sumTimeline: Timeline<number> = combineLatest(
        (a: number, b: number, c: number, d: number) => a + b + c + d
    )([timeline1, timeline2, timeline3, timeline4]);

    // 初期値の合計: 1 + 2 + 3 + 4 = 10
    console.log('combineLatest sum (initial):', sumTimeline.at(Now));

    // --- リアクティブな更新のテスト ---
    console.log('\n=== Reactivity Test ===');
    // timeline1の値を更新すると、それに依存する全てのタイムライン (`listResult`, `sumTimeline`)が
    // 自動的に新しい値を反映することを確認します。
    console.log('Updating timeline1 from 1 to 10...');
    timeline1.define(Now, 10);
    console.log('... update complete.');
    console.log('listOf result after update:', listResult.at(Now)); // [10, 2, 3]
    console.log('combineLatest sum after update:', sumTimeline.at(Now)); // 10 + 2 + 3 + 4 = 19
};

// デモを実行したい場合は以下のコメントを外してください
// demonstrateUsage();