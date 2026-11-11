import { describe, expect, it } from 'vitest';
import { RESEARCH, featureId, itemId } from '../sim/defs';
import { HOUR, clearAround } from '../sim/test-helpers';
import { START_HOUR } from '../sim/constants';
import { Alert, controller } from './controller';

// Numbers and words the interface shows (found by the sixth audit, each first seen failing).

const alerts = (): Alert[] =>
  (controller as unknown as { buildAlerts(t: unknown): Alert[] }).buildAlerts(controller.sim.resourceTotals());
const texts = () => alerts().map((a) => a.text);

function colony(seed: string) {
  controller.newColony(seed);
  const sim = controller.sim;
  const { x, y } = clearAround(sim, 12);
  return { sim, w: sim.world, x, y };
}

describe('the interface says what is so', () => {
  it('counts one wall still to build as one, not "1 walls"', () => {
    const { sim, w, x, y } = colony('audit6-walls');
    // Five in the evening of the first day, no shelter, one wall planned.
    sim.tick = (17 - START_HOUR) * HOUR;
    sim.apply({ type: 'build', feature: featureId('woodWall'), tiles: [w.idx(x + 3, y + 3)] });
    const shelter = texts().find((t) => t.startsWith('No shelter yet'));
    expect(shelter).toBeDefined();
    expect(shelter).not.toMatch(/\b1 walls\b/);
  });

  it('gives a request with 25 hours left as about a day, not two', () => {
    const { sim } = colony('audit6-request');
    sim.diplomacy.request = {
      // (The Meadow Kin.)
      faction: 2,
      kind: 'deliver',
      item: itemId('wood'),
      count: 30,
      quarry: -1,
      until: sim.tick + 25 * HOUR,
      silver: 40,
      recruit: false,
      goodwill: 5,
    } as typeof sim.diplomacy.request;
    const request = texts().find((t) => t.includes('ask for'));
    expect(request).toBeDefined();
    // 25 hours is a day and an hour: "2 days left" has the player a day longer than they have.
    expect(request).not.toContain('2 days left');
  });

  it('says how long food really keeps on the tile card', () => {
    const { sim, w, x, y } = colony('audit6-fresh');
    const i = w.idx(x + 4, y + 4);
    w.addItem(i, itemId('berries'), 10, 2);
    // A cool spot (5°C): food keeps there at half the pace.
    sim.temperatureAt = () => 5;
    controller.selectTile(i);
    const said = controller.getState().selectedTile!.details.find((d) => d.startsWith('Fresh for'))!;
    const days = Number(/Fresh for ([\d.]+) days/.exec(said)![1]);
    // Half a day past what the card gave them, they should have spoiled.
    (sim as unknown as { updateSpoilage(hours: number): void }).updateSpoilage((days + 0.5) * 24);
    expect(w.itemType[i], `the card said "${said}"`).not.toBe(itemId('berries'));
  });

  it('counts every project learned as all of them on the Research screen', () => {
    const { sim } = colony('audit6-research');
    // Everything that can be learned, learned (Further study goes on for ever, and is never "done").
    sim.research.done = RESEARCH.filter((p) => !p.repeatable).map((p) => p.key);
    controller.publish();
    const research = controller.getState().research;
    // What the Research screen's first line says ("{done} of {all} projects learned").
    const line = `${research.filter((p) => p.done).length} of ${research.filter((p) => !p.repeatable).length} projects learned.`;
    // The goal ("Learn every research project") says the same colony has them all.
    const goal = controller.getState().objectives.find((o) => o.id === 'allResearch');
    expect(goal?.progress).toBe(`${RESEARCH.length - 1}/${RESEARCH.length - 1}`);
    expect(line).toBe(`${RESEARCH.length - 1} of ${RESEARCH.length - 1} projects learned.`);
  });
});
