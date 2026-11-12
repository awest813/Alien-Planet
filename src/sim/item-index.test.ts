import { describe, expect, it } from 'vitest';
import { NONE, itemId } from './defs';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { HOUR, clearAround, run } from './test-helpers';
import { World } from './world';

// The world files item stacks by type, so a search for one kind of thing goes past no other: the files must always
// agree with the map, through play, saving and loading.
function agrees(w: World): void {
  const byMap = new Map<number, number[]>();
  for (let i = 0; i < w.size; i++) {
    if (w.itemType[i] !== NONE) {
      byMap.set(w.itemType[i], [...(byMap.get(w.itemType[i]) ?? []), i]);
    }
  }
  for (const [item, tiles] of byMap) {
    expect([...w.tilesWithItem(item)].sort((a, b) => a - b)).toEqual(tiles);
  }
  expect(w.itemTypesAbout().sort((a, b) => a - b)).toEqual([...byMap.keys()].sort((a, b) => a - b));
}

describe('the item index', () => {
  it('agrees with the map through days of play, and after a load', () => {
    const sim = Simulation.newColony(21);
    agrees(sim.world);
    for (let day = 0; day < 4; day++) {
      run(sim, HOUR * 24);
      agrees(sim.world);
    }
    agrees(deserialize(structuredClone(serialize(sim))).world);
  }, 60000);

  it('follows stacks added, taken, moved and changed by hand', () => {
    const sim = Simulation.newColony(22);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    for (const i of [...w.tilesWith('items')]) {
      w.takeItem(i, w.itemCount[i]);
    }
    const [a, b, c, d] = [w.idx(x + 2, y), w.idx(x + 3, y), w.idx(x + 4, y), w.idx(x + 6, y + 6)];
    const [wood, stone, knife] = [itemId('wood'), itemId('stone'), itemId('knife')];
    w.addItem(a, wood, 10);
    w.addItem(b, wood, 5);
    w.addItem(c, knife, 1);
    expect(w.tilesWithItem(wood).size).toBe(2);
    agrees(w);
    w.takeItem(a, 10);
    agrees(w);
    w.pickUp(b, 5);
    agrees(w);
    w.dropItemNear(d, stone, 30);
    agrees(w);
    expect(w.tilesWithItem(wood).size).toBe(0);
    expect(w.itemTypesAbout()).not.toContain(wood);
  });
});
