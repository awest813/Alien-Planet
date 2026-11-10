// Structural sharing for the UI's snapshots: `share(prev, next)` gives back `prev` itself wherever `next` holds
// the same values, so a screen that shows only unchanged parts can tell at a glance (by identity) that it has
// nothing to redraw, and a publish that changed nothing need not wake the UI at all.
//
// `next` may share objects with the simulation that it goes on changing in place (a colonist's needs, say), so by
// default what comes back never holds on to them: every object and array in it is either from `prev` or a copy.
// `owned` says `next` is made from snapshots already, which never change: then a part that is the same object is
// the same, and is kept without being looked through.

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
};

export function share<T>(prev: T | undefined, next: T, owned = false): T {
  if (Object.is(prev, next) && (owned || next === null || typeof next !== 'object')) {
    return next;
  }
  if (Array.isArray(next)) {
    const before: unknown[] | undefined = Array.isArray(prev) ? prev : undefined;
    let same = !!before && before.length === next.length;
    const out: unknown[] = new Array(next.length);
    for (let i = 0; i < next.length; i++) {
      const was = before && i < before.length ? before[i] : undefined;
      const value = share(was, next[i] as unknown, owned);
      out[i] = value;
      if (same && !Object.is(value, was)) {
        same = false;
      }
    }
    return (same ? before : out) as T;
  }
  if (isPlain(next)) {
    const before = isPlain(prev) ? prev : undefined;
    const keys = Object.keys(next);
    let same = !!before && Object.keys(before).length === keys.length;
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const was = before?.[key];
      const value = share(was, next[key], owned);
      out[key] = value;
      if (same && (!Object.is(value, was) || !(key in before!))) {
        same = false;
      }
    }
    return (same ? before : out) as T;
  }
  // Anything else (a number, a string, a function) is a value of its own.
  return next;
}
