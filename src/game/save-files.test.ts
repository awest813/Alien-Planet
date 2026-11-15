import { describe, expect, it } from 'vitest';
import { serialize } from '../sim/serialize';
import { controller } from './controller';

// Colonies to and from files, and a damaged save never taking the colony in play with it.

const toast = () => controller.getState().toast ?? '';

describe('a colony as a file', () => {
  it('exports, and imports back as the same colony, paused', () => {
    controller.newColony('file-a');
    const sim = controller.sim;
    for (let t = 0; t < 600; t++) {
      sim.step();
    }
    const { name, text } = controller.exportColony();
    expect(name).toMatch(/^colony-alpha-\d+-day-\d+\.json$/);
    const before = JSON.stringify(serialize(sim), (_k, v: unknown) =>
      ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v,
    );
    controller.newColony('file-b');
    expect(controller.sim.seed).not.toBe(sim.seed);
    expect(controller.importColony(text)).toBe(true);
    const after = JSON.stringify(serialize(controller.sim), (_k, v: unknown) =>
      ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v,
    );
    expect(after).toBe(before);
    controller.publish();
    expect(controller.getState().speed).toBe(0);
  });

  it('a damaged file, or one from another version, leaves the colony in play as it was, and says so', () => {
    controller.newColony('file-c');
    const seed = controller.sim.seed;
    const sim = controller.sim;
    const good = JSON.parse(controller.exportColony().text) as Record<string, unknown>;
    // Missing parts: refused before anything is swapped in.
    for (const key of ['weather', 'animals', 'research', 'power']) {
      const broken = { ...good };
      delete broken[key];
      expect(controller.importColony(JSON.stringify(broken))).toBe(false);
      expect(controller.sim).toBe(sim);
    }
    expect(toast()).toMatch(/isn't a colony the game can load\. The colony you had is still here/);
    // Not a save at all.
    expect(controller.importColony('not json')).toBe(false);
    expect(controller.importColony('{"hello":1}')).toBe(false);
    // Another version.
    expect(controller.importColony(JSON.stringify({ ...good, version: (good.version as number) + 1 }))).toBe(false);
    expect(toast()).toMatch(/from a newer version/);
    expect(controller.sim.seed).toBe(seed);
    // And the colony still runs and shows.
    controller.sim.step();
    expect(() => controller.publish()).not.toThrow();
  });
});
