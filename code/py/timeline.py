from __future__ import annotations
from typing import Callable, Generic, List, TypeVar, Optional

A = TypeVar('A')
B = TypeVar('B')

class Timeline(Generic[A]):
    def __init__(self, a: A):
        self._last: A = a
        self._fns: List[Callable[[A], None]] = []

    def last(self) -> A:
        return last(self)

    def next(self, a: A) -> None:
        next(self, a)

    def bind(self, monadf: Callable[[A], Timeline[B]]) -> Timeline[B]:
        return bind(self, monadf)

    def map(self, f: Callable[[A], B]) -> Timeline[B]:
        return map(self, f)

    def unlink(self) -> None:
        unlink(self)

def last(timeline: Timeline[A]) -> A:
    return timeline._last

def next(timeline: Timeline[A], a: A) -> None:
    timeline._last = a
    for f in timeline._fns:
        f(a)

def bind(timelineA: Timeline[A], monadf: Callable[[A], Timeline[B]]) -> Timeline[B]:
    timelineB: Timeline[B] = monadf(timelineA._last)

    def newFn(a: A) -> None:
        timeline: Timeline[B] = monadf(a)
        next(timelineB, timeline._last)

    timelineA._fns.append(newFn)
    return timelineB

def map(timelineA: Timeline[A], f: Callable[[A], B]) -> Timeline[B]:
    timelineB: Timeline[B] = Timeline(f(timelineA._last))

    def newFn(a: A) -> None:
        next(timelineB, f(a))

    timelineA._fns.append(newFn)
    return timelineB

def unlink(timeline: Timeline[A]) -> None:
    timeline._fns = []