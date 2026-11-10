import { describe, expect, it } from 'vitest';
import { share } from './share';

describe('share', () => {
  it('keeps the old snapshot when nothing changed', () => {
    const prev = share(undefined, { a: 1, b: [1, 2, { c: 'x' }], d: null, e: NaN });
    expect(share(prev, { a: 1, b: [1, 2, { c: 'x' }], d: null, e: NaN })).toBe(prev);
  });

  it('keeps the unchanged parts and replaces the changed ones', () => {
    const prev = share(undefined, { a: { x: 1 }, b: { y: [1, 2] }, list: [{ id: 1 }, { id: 2 }] });
    const next = share(prev, { a: { x: 1 }, b: { y: [1, 3] }, list: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    expect(next).not.toBe(prev);
    expect(next.a).toBe(prev.a);
    expect(next.b).not.toBe(prev.b);
    expect(next.b.y).toEqual([1, 3]);
    expect(next.list).not.toBe(prev.list);
    expect(next.list[0]).toBe(prev.list[0]);
    expect(next.list[1]).toBe(prev.list[1]);
  });

  it('notices keys coming and going, and a shorter list', () => {
    const prev = share(undefined, { a: 1, list: [1, 2] } as { a?: number; b?: number; list: number[] });
    expect(share(prev, { b: 1, list: [1, 2] })).not.toBe(prev);
    expect(share(prev, { a: 1, list: [1] }).list).toEqual([1]);
    expect(share(prev, { a: undefined, list: [1, 2] })).not.toBe(prev);
  });

  it('never keeps hold of objects that may change in place', () => {
    const live = { needs: { food: 0.5 } };
    const first = share(undefined, live);
    expect(first.needs).not.toBe(live.needs);
    live.needs.food = 0.4;
    const second = share(first, live);
    expect(second).not.toBe(first);
    expect(second.needs.food).toBe(0.4);
    expect(first.needs.food).toBe(0.5);
  });

  it('takes the same object as unchanged when the parts are snapshots', () => {
    const part = { x: 1 };
    const prev = { a: part, b: 2 };
    expect(share(prev, { a: part, b: 2 }, true)).toBe(prev);
  });
});
