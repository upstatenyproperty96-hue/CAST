// A tiny value store so the playhead can update 60 times a second
// without re-rendering the whole editor.
import { useSyncExternalStore } from "react";

export type Store<T> = { get: () => T; set: (v: T) => void; subscribe: (fn: () => void) => () => void };

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (v) => { if (v !== value) { value = v; subs.forEach((f) => f()); } },
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  };
}

export function useStore<T>(store: Store<T>) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export const fmtTime = (s: number, precise = false) => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return precise ? `${m}:${sec.toFixed(1).padStart(4, "0")}` : `${m}:${String(Math.floor(sec)).padStart(2, "0")}`;
};
