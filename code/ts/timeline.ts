type Function<A, B> = (a: A) => B;
type MonadFunction<A, B> = (a: A) => Timeline<B>;

interface Timeline<A> {
    _last: A;
    _fns: ((a: A) => void)[];

    last: () => A;
    next: (a: A) => void;
    bind: <B>(monadf: MonadFunction<A, B>) => Timeline<B>;
    map: <B>(f: (a: A) => B) => Timeline<B>;
    unlink: () => void;
}

const Timeline = <A>(initialValue: A): Timeline<A> => ({
    _last: initialValue,
    _fns: [],

    last: function () {
        return last(this)
    },
    next: function (a: A) {
        next(a)(this);
    },
    bind: function <B>(monadf: MonadFunction<A, B>): Timeline<B> {
        return bind(monadf)(this);
    },
    map: function <B>(f: (a: A) => B): Timeline<B> {
        return map(f)(this);
    },
    unlink: function () {
        unlink(this);
    }
});

type Last = <A>(timeline: Timeline<A>) => A;
const last: Last = timeline => timeline._last;

type Next = <A>(a: A) => (timeline: Timeline<A>) => void;
const next: Next = a => timeline => {
    timeline._last = a;
    timeline._fns.forEach(f => f(a));
};

const bind = <A, B>(monadf: MonadFunction<A, B>) => (timelineA: Timeline<A>) => {
    const timelineB = monadf(timelineA._last);
    const newFn = (a: A) => {
        const timeline = monadf(a);
        next(timeline._last)(timelineB);
    };
    timelineA._fns.push(newFn);
    return timelineB;
};

const map = <A, B>(f: Function<A, B>) => (timelineA: Timeline<A>) => {
    const timelineB = Timeline(f(timelineA._last));
    const newFn = (a: A) =>
        next(f(a))(timelineB);
    timelineA._fns.push(newFn);
    return timelineB;
};

type Unlink = <A>(timeline: Timeline<A>) => void;
const unlink: Unlink = timeline => {
    timeline._fns = [];
};

export { Timeline }