import { afterEach, describe, expect, it, vi } from 'vitest';

// The save database when opening it goes wrong (found by the fourth audit). IndexedDB isn't there in these
// tests: each stubs `indexedDB.open` with a request that fails or is blocked.

const pending = Symbol('pending');
const settle = <T>(p: Promise<T>, ms = 200) =>
  Promise.race([
    p.then(
      (v) => ({ ok: v }),
      (e) => ({ err: String(e) }),
    ),
    new Promise((r) => setTimeout(() => r(pending), ms)),
  ]);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('the save database', () => {
  it('gives up, saying why, when another tab blocks its upgrade (rather than hanging every save)', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        const req: Record<string, unknown> = {};
        // Another tab holds an older connection: the browser says "blocked" and nothing more until it closes.
        setTimeout(() => (req.onblocked as (() => void) | undefined)?.(), 0);
        return req;
      },
    });
    const store = await import('./save-store');
    const result = await settle(store.listSaves());
    expect(result).toHaveProperty('err');
    expect((result as { err: string }).err).toContain('another tab');
  });

  it('tries again after an open that failed', async () => {
    let opens = 0;
    vi.stubGlobal('indexedDB', {
      open: () => {
        opens++;
        const req: Record<string, unknown> = { error: new Error('transient') };
        setTimeout(() => (req.onerror as () => void)(), 0);
        return req;
      },
    });
    const store = await import('./save-store');
    expect(await settle(store.listSaves())).toHaveProperty('err');
    expect(await settle(store.listSaves())).toHaveProperty('err');
    expect(opens).toBe(2);
  });
});

describe('a save', () => {
  it('counts colonists away on a trip in the slot summary', async () => {
    const writes: { colonists?: number }[] = [];
    vi.doMock('./save-store', () => ({
      writeSave: async (meta: { colonists?: number }) => {
        writes.push(meta);
      },
      readSave: async () => null,
      deleteSave: async () => undefined,
      listSaves: async () => [],
    }));
    const { controller } = await import('./controller');
    controller.newColony('away-meta');
    controller.setSpeed(1);
    for (const c of controller.sim.colonists) {
      c.away = 'gone';
    }
    expect(await controller.save('slot-1')).toBe(true);
    expect(writes.at(-1)!.colonists).toBe(controller.sim.colonists.length);
    vi.doUnmock('./save-store');
  });
});
