const Timeline = (initialValue) => ({
    _last: initialValue,
    _fns: [],

    last: function () {
        return last(this)
    },
    next: function (a) {
        next(a)(this);
    },
    bind: function (monadf) {
        return bind(monadf)(this);
    },
    map: function (f) {
        return map(f)(this);
    },
    unlink: function () {
        unlink(this);
    }
});

const last = timeline => timeline._last;

const next = a => timeline => {
    timeline._last = a;
    timeline._fns.forEach(f => f(a));
};

const bind = monadf => timelineA => {
    const timelineB = monadf(timelineA._last);
    const newFn = a => {
        const timeline = monadf(a);
        next(timeline._last)(timelineB);
    };
    timelineA._fns.push(newFn);
    return timelineB;
};

const map = f => timelineA => {
    const timelineB = Timeline(f(timelineA._last));
    const newFn = a =>
        next(f(a))(timelineB);
    timelineA._fns.push(newFn);
    return timelineB;
};

const unlink = timeline => {
    timeline._fns = [];
};

export { Timeline }