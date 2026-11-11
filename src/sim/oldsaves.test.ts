import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { RECIPES, RESEARCH } from './defs';
import { SaveData, deserialize, serialize } from './serialize';

// Saves written by earlier versions of the game (same save version, fewer fields): each must load, play on,
// and save again. To add one, run the game at that commit, serialize a colony and gzip the JSON (see
// src/sim/fixtures/README.md).
const FIXTURES = [
  { file: 'save-e7b99bc.json.gz', from: 'the first version-16 save, before fuel, ages, injuries and the village' },
  { file: 'save-240bac0.json.gz', from: 'before mine shafts, the chronicle, the great beast and allies' },
];

const load = (file: string): SaveData =>
  JSON.parse(gunzipSync(readFileSync(new URL(`./fixtures/${file}`, import.meta.url))).toString('utf8'));

describe('saves from earlier versions', () => {
  for (const { file, from } of FIXTURES) {
    it(`load and play on: ${from}`, () => {
      const data = load(file);
      const sim = deserialize(structuredClone(data));
      expect(sim.living().length).toBe(data.colonists.filter((c) => !c.health.dead).length);
      expect(sim.day).toBeGreaterThan(1);
      // The map itself (a layer through JSON is {"0": …}, which loaded as an empty map, and every test here passed
      // on a blank world).
      expect([...sim.world.terrain]).toEqual(Object.values(data.layers.terrain));
      expect(new Set(sim.world.terrain).size).toBeGreaterThan(2);
      // What's new since starts out sensibly.
      expect(sim.chronicle.length).toBeGreaterThan(0);
      expect(sim.allies).toEqual([]);
      // A bill for every recipe, those added since included.
      expect(sim.bills.map((b) => b.recipe)).toEqual(RECIPES.map((r) => r.id));
      // A day's play without anything going wrong.
      for (let t = 0; t < 200 * 24; t++) {
        sim.step();
      }
      expect(sim.living().length).toBeGreaterThan(0);
      // And it saves and loads again as it is.
      const again = serialize(sim);
      expect(serialize(deserialize(structuredClone(again)))).toEqual(again);
    });

    it(`play on with everything researched: ${from}`, () => {
      const sim = deserialize(load(file));
      // (Newer recipes crashed the crafting of an older save once their research was done.)
      sim.research.done.push(...RESEARCH.map((p) => p.key).filter((k) => !sim.research.done.includes(k)));
      expect(() => {
        for (let t = 0; t < 200 * 6; t++) {
          sim.step();
        }
      }).not.toThrow();
    });
  }
});
