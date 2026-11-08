import { describe, expect, it } from 'vitest';
import { featureDef, featureId, itemId } from './defs';
import { Simulation } from './simulation';
import { clearAround, outline } from './test-helpers';
import { updateWeather } from './weather';

describe('the first day', () => {
  it('walls and a door go up before the beds inside', () => {
    const sim = Simulation.newColony(31);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    const x0 = x + 3;
    const y0 = y - 2;
    const door = w.idx(x0 + 2, y0 + 4);
    sim.apply({
      type: 'build',
      feature: featureId('woodWall'),
      tiles: outline(w, x0, y0, x0 + 4, y0 + 4).filter((i) => i !== door),
    });
    sim.apply({ type: 'build', feature: featureId('door'), tiles: [door] });
    sim.apply({ type: 'build', feature: featureId('bed'), tiles: [w.idx(x0 + 1, y0 + 1), w.idx(x0 + 3, y0 + 1)] });
    for (let k = 0; k < 6; k++) {
      w.addItem(w.idx(x - 4 + k, y + 4), itemId('wood'), 25);
    }
    let wallsLeftAtFirstBed = -1;
    for (let t = 0; t < 200 * 30 && wallsLeftAtFirstBed < 0; t++) {
      sim.step();
      if (sim.countFeature((f) => featureDef(f).bed) > 0) {
        wallsLeftAtFirstBed = [...w.tilesWith('blueprints')].filter(
          (i) => featureDef(w.blueprint[i]).blocksRoom,
        ).length;
      }
    }
    expect(wallsLeftAtFirstBed).toBe(0);
  });

  it('brings rain but no lightning storms', () => {
    const sim = Simulation.newColony(32);
    for (let n = 0; n < 200; n++) {
      sim.weather.until = 0;
      updateWeather(sim);
      expect(sim.weather.kind).not.toBe('storm');
    }
  });
});
