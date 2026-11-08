import { describe, expect, it } from 'vitest';
import { CHRONICLE_LIMIT, ChronicleEntry, addToChronicle, chronicleKind } from './chronicle';
import { die } from './health';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';

describe('the chronicle', () => {
  it('records the founding and the moments that matter, and nothing ordinary', () => {
    const sim = Simulation.newColony(1);
    expect(sim.chronicle[0].kind).toBe('founding');
    die(sim, sim.colonists[0], 'old age');
    sim.addLog('Research complete: Masonry. Builders know their trade.', 'good', true);
    sim.addLog('Ada reached cooking 4.');
    const kinds = sim.chronicle.map((e) => e.kind);
    expect(kinds).toContain('death');
    expect(kinds).toContain('discovery');
    expect(sim.chronicle.find((e) => e.kind === 'discovery')!.text).toBe('The colony learned Masonry.');
    expect(sim.chronicle.some((e) => e.text.includes('reached cooking'))).toBe(false);
  });

  it('knows its kinds of history', () => {
    expect(chronicleKind('Ada and Bram are married!')).toBe('marriage');
    expect(chronicleKind('Kip is born to Ada and Bram.')).toBe('birth');
    expect(chronicleKind('The raid is over. 4 raiders fell. Colonists stand down.')).toBe('battle');
    expect(chronicleKind('The colony has chosen Ada as its leader (3 of 4 votes).')).toBe('leader');
    expect(chronicleKind('Ada insulted Bram.')).toBeNull();
  });

  it('keeps a long game, dropping discoveries before anything else when full', () => {
    const chronicle: ChronicleEntry[] = [{ day: 1, kind: 'founding', text: 'Landed.' }];
    addToChronicle(chronicle, { day: 2, kind: 'discovery', text: 'Learned.' });
    for (let k = 0; k < CHRONICLE_LIMIT; k++) {
      addToChronicle(chronicle, { day: 3, kind: 'death', text: `Died ${k}.` });
    }
    expect(chronicle.length).toBe(CHRONICLE_LIMIT);
    expect(chronicle[0].kind).toBe('founding');
    expect(chronicle.some((e) => e.kind === 'discovery')).toBe(false);
  });

  it('is saved with the colony, and an older save starts one from its story log', () => {
    const sim = Simulation.newColony(2);
    die(sim, sim.colonists[1], 'blood loss');
    const data = structuredClone(serialize(sim));
    expect(deserialize(structuredClone(data)).chronicle).toEqual(sim.chronicle);
    delete (data as { chronicle?: unknown }).chronicle;
    expect(deserialize(data).chronicle.map((e) => e.kind)).toContain('death');
  });
});

describe('the chronicle rules', () => {
  it('records the last goal and the end of the beast once', () => {
    expect(chronicleKind('Every goal is complete. The colony is thriving: play on for as long as you like.')).toBe(
      'milestone',
    );
    expect(chronicleKind('Colonists stand down.')).toBeNull();
  });
});

describe('the history', () => {
  it('notes the colony each dawn, and keeps it in the save', () => {
    const sim = Simulation.newColony(7);
    for (let t = 0; t < 3 * 24 * 200; t++) {
      sim.step();
    }
    expect(sim.history.length).toBeGreaterThanOrEqual(2);
    const [day, people, mood, wealth, food] = sim.history.at(-1)!;
    expect(day).toBe(sim.day);
    expect(people).toBe(sim.living().length);
    expect(mood).toBeGreaterThan(0);
    expect(wealth).toBeGreaterThan(0);
    expect(food).toBeGreaterThanOrEqual(0);
    expect(deserialize(structuredClone(serialize(sim))).history).toEqual(sim.history);
  });
});
