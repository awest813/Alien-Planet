import { describe, expect, it } from 'vitest';
import { FACTIONS, itemId } from '../sim/defs';
import { RUINS } from '../sim/expeditions';
import { HOUR, clearAround, run } from '../sim/test-helpers';
import { UiState, controller } from './controller';

// What the interface would show right now.
const view = (): UiState => (controller as unknown as { buildState(): UiState }).buildState();

function colony(seed: string) {
  controller.newColony(seed);
  const sim = controller.sim;
  const { x, y } = clearAround(sim, 12);
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  sim.apply({ type: 'zone', rect: { x0: x - 4, y0: y + 4, x1: x + 4, y1: y + 7 }, zone: 1 });
  sim.world.addItem(sim.world.idx(x, y + 6), itemId('silver'), 400);
  return sim;
}

describe('the wider world on screen', () => {
  it('shows colonists away on an expedition as away, not dead, and the party on the Factions screen', () => {
    const sim = colony('world-1');
    const [a] = sim.colonists;
    const before = view();
    expect(before.diplomacy.travellers.find((t) => t.id === a.id)?.why).toBeNull();
    expect(before.diplomacy.destinations.map((d) => d.to)).toContain(RUINS);
    controller.command({
      type: 'world',
      action: { kind: 'expedition', to: RUINS, purpose: 'salvage', colonists: [a.id] },
    });
    run(sim, HOUR * 8);
    const state = view();
    const shown = state.colonists.find((c) => c.id === a.id)!;
    expect(shown.status).toBe('Away');
    expect(shown.dead).toBe(false);
    expect(shown.activity).toMatch(/ruins/);
    expect(state.diplomacy.expeditions).toHaveLength(1);
    expect(state.diplomacy.expeditions[0].who).toContain(a.name);
    // Nobody can draft them from the bar.
    controller.toggleDraftAll();
    expect(a.drafted).toBe(false);
  });

  it("shows raiders' goodwill and the second friendly faction", () => {
    colony('world-2');
    const state = view();
    for (const f of state.factions) {
      expect(Number.isFinite(f.goodwill)).toBe(true);
    }
    expect(state.factions.filter((f) => !f.hostile)).toHaveLength(2);
    expect(state.factions.find((f) => f.hostile)!.relation).toBe('Hostile');
    expect(state.factions.map((f) => f.name)).toEqual(FACTIONS.map((f) => f.name));
  });
});
