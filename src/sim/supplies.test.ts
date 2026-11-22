import { describe, expect, it } from 'vitest';
import { itemId } from './defs';
import { Simulation, TICKS_PER_HOUR } from './simulation';
import { SUPPLIES } from './supplies';

// What the colonists land with: chosen on the New colony screen, in place of the purse of silver.

const stock = (sim: Simulation, key: string) => sim.stockOf(itemId(key));

describe('landing supplies', () => {
  it('silver, the default, lands what a colony always did, and says nothing more', () => {
    const plain = Simulation.newColony(5, 'standard', 64);
    const chosen = Simulation.newColony(5, 'standard', 64, { supplies: 'silver' });
    expect(stock(plain, 'silver')).toBe(100);
    for (const key of ['silver', 'meal', 'wood', 'toolKit', 'stone', 'herbalMedicine']) {
      expect(stock(chosen, key)).toBe(stock(plain, key));
    }
    expect(plain.log[0].text).toMatch(/landed with a few days of rations and some salvaged timber\./);
  });

  it('each other choice lands its goods and a pocket of silver, and the log says what came', () => {
    const landing = Simulation.newColony(5, 'standard', 64).living().length;
    const base = Simulation.newColony(5, 'standard', 64);
    for (const def of SUPPLIES.filter((s) => s.key !== 'silver')) {
      const sim = Simulation.newColony(5, 'standard', 64, { supplies: def.key });
      for (const [item, count] of def.goods(landing)) {
        // (On top of the rations and timber every colony has.)
        const already = item === 'silver' ? 0 : stock(base, item);
        expect(stock(sim, item), `${def.key}: ${item}`).toBe(already + count);
      }
      expect(stock(sim, 'silver')).toBe(20);
      expect(sim.log[0].text).toContain(`rations, some salvaged timber and ${def.words!(landing)}.`);
    }
  });

  it('is worth about what the silver was, whichever is chosen', async () => {
    const { itemDef } = await import('./defs');
    for (const landing of [3, 6]) {
      for (const def of SUPPLIES) {
        const value = def.goods(landing).reduce((sum, [item, n]) => sum + itemDef(itemId(item)).value * n, 0);
        expect(value, `${def.key} for ${landing}`).toBeGreaterThanOrEqual(80);
        expect(value, `${def.key} for ${landing}`).toBeLessThanOrEqual(200);
      }
    }
  });

  it('tool kits brought are taken up by those who do tool work', () => {
    const sim = Simulation.newColony(5, 'standard', 64, { supplies: 'tools' });
    // (Within a day and a half.)
    for (let t = 0; t < TICKS_PER_HOUR * 36 && sim.living().filter((c) => c.tool).length < 2; t++) {
      sim.step();
    }
    expect(sim.living().filter((c) => c.tool).length).toBe(2);
  });

  it('the New colony screen remembers the choice', async () => {
    const { controller } = await import('../game/controller');
    controller.newColony('supplies', 'standard', 64, 'temperate', 'valley', 'medicine');
    expect(controller.settings.newSupplies).toBe('medicine');
    expect(controller.sim.stockOf(itemId('herbalMedicine'))).toBeGreaterThanOrEqual(6);
  });
});
