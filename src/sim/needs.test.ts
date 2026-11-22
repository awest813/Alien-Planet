import { describe, expect, it } from 'vitest';
import { comfortRange } from './apparel';
import { featureId, itemDef, itemId } from './defs';
import { STARVING_MOVE, STARVING_WORK, damage, healthFactor, updateExposure } from './health';
import { deserialize, serialize } from './serialize';
import { Simulation, START_HOUR, splitBundle } from './simulation';
import { HOUR, clearAround, outline, run } from './test-helpers';

const PARKA = itemId('parka');

// The first hour of the year whose outdoor temperature passes `test`.
function setHour(sim: Simulation, test: (t: number) => boolean): void {
  for (let h = 0; h < 24 * 24; h++) {
    sim.tick = (h - START_HOUR) * HOUR;
    if (test(sim.outdoorTemperature())) {
      return;
    }
  }
  throw new Error('No such hour');
}

describe('hunger', () => {
  it('slows a starving colonist down at work and on foot, until they eat', () => {
    const sim = Simulation.newColony(5);
    const c = sim.colonists[0];
    const w = sim.world;
    c.path = [w.neighbors(c.tile).find((n) => w.isPassable(n))!];
    c.needs.food = 0.5;
    const [work, walk] = [healthFactor(c), sim.moveRate(c)];
    c.needs.food = 0;
    expect(healthFactor(c)).toBeCloseTo(work * STARVING_WORK);
    expect(sim.moveRate(c)).toBeCloseTo(walk * STARVING_MOVE);
    expect(STARVING_WORK).toBeLessThan(1);
    expect(STARVING_MOVE).toBeLessThan(1);
    c.needs.food = 0.05;
    expect(healthFactor(c)).toBeCloseTo(work);
  });
});

describe('clothing and exposure', () => {
  it('lets the cold build into hypothermia, less so in a parka', () => {
    const sim = Simulation.newColony(1);
    clearAround(sim, 4);
    setHour(sim, (t) => t < -5);
    const [bare, wrapped] = sim.colonists;
    bare.apparel = null;
    wrapped.apparel = { item: PARKA, quality: 6, wear: 1 };
    expect(comfortRange(wrapped).min).toBeLessThan(comfortRange(bare).min - 10);
    updateExposure(sim, bare, 2);
    updateExposure(sim, wrapped, 2);
    expect(bare.health.hypothermia).toBeGreaterThan(0.12);
    expect(wrapped.health.hypothermia).toBeLessThan(bare.health.hypothermia / 2);
  });

  it('has colonists change into a parka from storage when it turns cold', () => {
    const sim = Simulation.newColony(2);
    const w = sim.world;
    const { x, y } = clearAround(sim, 8);
    w.addItem(w.idx(x + 2, y), PARKA, 1, 1, 10);
    // A cold morning, when colonists are up and about.
    setHour(sim, (t) => t < 3 && sim.hour >= 8 && sim.hour < 12);
    sim.syncClock();
    run(sim, HOUR * 2);
    const wearer = sim.colonists.find((c) => c.apparel?.item === PARKA);
    expect(wearer).toBeDefined();
    expect(wearer!.apparel!.quality).toBe(10);
    // The tunic they took off is left behind, not destroyed.
    expect(sim.stockOf(itemId('tunic'))).toBe(1);
  });

  it('wears clothes out over time', () => {
    const sim = Simulation.newColony(3);
    const c = sim.colonists[0];
    run(sim, HOUR * 24);
    expect(c.apparel!.wear).toBeLessThan(1);
    expect(c.apparel!.wear).toBeGreaterThan(0.9);
  });
});

describe('rescue', () => {
  it('has a doctor carry a collapsed colonist from outdoors to a bed', () => {
    const sim = Simulation.newColony(7);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    // A small heated bedroom east of the colonists, with a door.
    for (const t of outline(w, x + 4, y - 2, x + 8, y + 2)) {
      w.setFeature(t, featureId('woodWall'));
    }
    w.setFeature(w.idx(x + 4, y), featureId('door'));
    w.setFeature(w.idx(x + 7, y - 1), featureId('campfire'));
    const bed = w.idx(x + 6, y + 1);
    w.setFeature(bed, featureId('bed'));
    run(sim, HOUR * 3);
    const patient = sim.colonists[0];
    patient.tile = w.idx(x - 4, y);
    damage(sim, patient, 0.45, 'cut');
    damage(sim, patient, 0.45, 'cut');
    expect(patient.health.downed).toBe(true);
    run(sim, HOUR * 4);
    expect(sim.isIndoors(patient.tile)).toBe(true);
  });
});

describe('cooking', () => {
  function kitchen(cookSkill: number) {
    const sim = Simulation.newColony(4);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    w.setFeature(w.idx(x + 3, y), featureId('stove'));
    w.dropItemNear(w.idx(x, y + 3), itemId('potatoes'), 120);
    // Fine meals need meat or fish as well as vegetables.
    w.dropItemNear(w.idx(x - 3, y + 3), itemId('rawMeat'), 40);
    const fine = sim.bills.findIndex((b) => b.recipe === 1);
    sim.bills[0].target = 0;
    sim.bills[fine].target = 5;
    for (const c of sim.colonists) {
      c.skills.cooking = cookSkill;
      c.priorities.cooking = 1;
      c.needs.food = 1;
    }
    run(sim, HOUR * 6);
    return sim;
  }

  it('needs a skilled cook for fine meals', () => {
    expect(kitchen(3).stockOf(itemId('fineMeal'))).toBe(0);
    expect(kitchen(10).stockOf(itemId('fineMeal'))).toBeGreaterThan(0);
  });

  // A stove with no food about but what the test lays out, and a hungry-for-work cook.
  function bareKitchen(seed: number) {
    const sim = Simulation.newColony(seed);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    // No wildlife either: a predator's kill would leave extra meat about.
    sim.animals = [];
    for (const i of [...w.tilesWith('items')]) {
      if (itemDef(w.itemType[i]).nutrition > 0) {
        w.takeItem(i, w.itemCount[i]);
      }
    }
    w.setFeature(w.idx(x + 3, y), featureId('stove'));
    sim.bills[0].target = 30;
    for (const c of sim.colonists) {
      c.priorities.cooking = 1;
    }
    const fed = (hours: number) => {
      for (let h = 0; h < hours; h++) {
        for (const c of sim.colonists) {
          c.needs.food = 1;
        }
        run(sim, HOUR);
      }
    };
    return { sim, w, x, y, fed };
  }

  it('makes a meal from a mix of small stacks of different raw food', () => {
    const { sim, w, x, y, fed } = bareKitchen(31);
    w.addItem(w.idx(x - 3, y + 3), itemId('berries'), 3);
    w.addItem(w.idx(x - 1, y + 3), itemId('potatoes'), 2);
    w.addItem(w.idx(x + 1, y + 3), itemId('rawMeat'), 1);
    fed(4);
    expect(sim.stockOf(itemId('meal'))).toBe(1);
    expect(sim.stockOf(itemId('berries')) + sim.stockOf(itemId('potatoes')) + sim.stockOf(itemId('rawMeat'))).toBe(0);
  });

  it('gives back exactly the food it gathered when a meal is abandoned', () => {
    const { sim, w, x, y, fed } = bareKitchen(33);
    w.addItem(w.idx(x - 3, y + 3), itemId('berries'), 3);
    w.addItem(w.idx(x - 1, y + 3), itemId('potatoes'), 3);
    // Wait for a cook to have both kinds in hand, then pull them off the job.
    let cook;
    for (let t = 0; t < HOUR * 3 && !cook; t++) {
      sim.step();
      cook = sim.colonists.find((c) => c.carrying?.mix?.length);
    }
    expect(cook).toBeDefined();
    sim.endJob(cook!);
    sim.dropCarried(cook!);
    expect(sim.stockOf(itemId('berries'))).toBe(3);
    expect(sim.stockOf(itemId('potatoes'))).toBe(3);
    void fed;
  });

  it('cooks in batches: the food for several fetched at once, each meal set down as it is done', () => {
    // (A cook spent half again as long fetching six vegetables and walking to the stove as cooking, for one meal.)
    const { sim, w, x, y, fed } = bareKitchen(34);
    // Room for one cook only, so the batch is theirs.
    for (const c of sim.colonists.slice(1)) {
      c.priorities.cooking = 0;
    }
    w.addItem(w.idx(x - 3, y + 3), itemId('berries'), 30);
    w.addItem(w.idx(x - 1, y + 3), itemId('potatoes'), 20);
    // A batch of four: six apiece, from both stacks, carried together.
    let batch = 0;
    for (let t = 0; t < HOUR * 2 && batch === 0; t++) {
      sim.step();
      const job = sim.colonists[0].job;
      batch = job?.type === 'craft' ? (job.batch ?? 0) : 0;
    }
    expect(batch).toBe(4);
    let activity = '';
    for (let t = 0; t < HOUR * 2 && !activity.includes('of 4'); t++) {
      sim.step();
      activity = sim.describe(sim.colonists[0]);
    }
    expect(activity).toMatch(/^Cook simple meal \(\d of 4\)$/);
    fed(12);
    // Batches of four, then two, then one and one, as the food runs down (no more than half of it at a time):
    // eight meals, and the two left over (not enough for another) still about.
    expect(sim.stockOf(itemId('meal'))).toBe(8);
    expect(sim.stockOf(itemId('berries')) + sim.stockOf(itemId('potatoes'))).toBe(2);
  });

  it("a batch takes the stock no further than half the target again, and an interrupted one gives back what's left", () => {
    const { sim, w, x, y } = bareKitchen(35);
    for (const c of sim.colonists.slice(1)) {
      c.priorities.cooking = 0;
    }
    sim.bills[0].target = 2;
    w.addItem(w.idx(x - 3, y + 3), itemId('potatoes'), 40);
    let job;
    for (let t = 0; t < HOUR * 2 && !job; t++) {
      sim.step();
      job = sim.colonists[0].job?.type === 'craft' ? sim.colonists[0].job : undefined;
    }
    // Two wanted: up to three made.
    expect(job!.batch).toBe(3);
    // Pulled off it once the first meal is done: one meal, and the rest of the food back on the ground.
    const cook = sim.colonists[0];
    for (let t = 0; t < HOUR * 3 && sim.stockOf(itemId('meal')) === 0; t++) {
      cook.needs.food = 1;
      sim.step();
    }
    expect(sim.stockOf(itemId('meal'))).toBe(1);
    sim.endJob(cook);
    sim.dropCarried(cook);
    expect(sim.stockOf(itemId('potatoes'))).toBe(34);
  });

  it('takes no more than half the food there is for a batch, leaving the rest for the hungry', () => {
    for (const [potatoes, expected] of [
      [13, 1],
      [24, 2],
      [60, 4],
    ]) {
      const { sim, w, x, y } = bareKitchen(37);
      for (const c of sim.colonists.slice(1)) {
        c.priorities.cooking = 0;
      }
      w.addItem(w.idx(x - 3, y + 3), itemId('potatoes'), potatoes);
      let batch: number | undefined;
      for (let t = 0; t < HOUR * 2 && batch === undefined; t++) {
        sim.colonists[0].needs.food = 1;
        sim.step();
        batch = sim.colonists[0].job?.type === 'craft' ? sim.colonists[0].job.batch : undefined;
      }
      expect(batch).toBe(expected);
    }
  });

  it('at bedtime a cook finishes the meal on the stove, sets the rest of the batch down, and goes to bed', () => {
    const { sim, w, x, y } = bareKitchen(36);
    for (const c of sim.colonists.slice(1)) {
      c.priorities.cooking = 0;
    }
    w.addItem(w.idx(x - 3, y + 3), itemId('potatoes'), 48);
    const cook = sim.colonists[0];
    cook.schedule.fill('W');
    for (let t = 0; t < HOUR * 3 && !(cook.job?.type === 'craft' && cook.job.progress > 10); t++) {
      cook.needs.food = 1;
      sim.step();
    }
    expect(cook.job?.batch).toBe(4);
    // Bedtime, not yet tired out.
    cook.schedule.fill('S');
    cook.needs.rest = 0.6;
    for (let t = 0; t < HOUR && cook.job?.type === 'craft'; t++) {
      cook.needs.food = 1;
      sim.step();
    }
    expect(cook.job?.type).not.toBe('craft');
    // The meal on the stove was finished, and nothing went missing.
    expect(sim.stockOf(itemId('meal'))).toBe(1);
    expect(sim.stockOf(itemId('potatoes'))).toBe(42);
    expect(cook.carrying).toBeNull();
  });

  it('takes one share of a mixed bundle, the stalest first, and keeps the rest as it was', () => {
    const berries = { item: itemId('berries'), count: 4, fresh: 2 };
    const potatoes = { item: itemId('potatoes'), count: 8, fresh: 20 };
    const [taken, rest] = splitBundle({ ...berries, count: 12, fresh: 14, mix: [berries, potatoes] }, 6);
    expect(taken.count).toBe(6);
    expect(taken.mix).toEqual([berries, { ...potatoes, count: 2 }]);
    expect(taken.fresh).toBeCloseTo((4 * 2 + 2 * 20) / 6);
    expect(rest).toMatchObject({ item: itemId('potatoes'), count: 6, fresh: 20, mix: undefined });
    // The last share leaves nothing.
    expect(splitBundle(rest!, 6)[1]).toBeNull();
  });

  it('cannot turn food on the turn into fresh meals', () => {
    const { w, x, y, fed } = bareKitchen(32);
    w.dropItemNear(w.idx(x - 3, y + 3), itemId('rawMeat'), 6, 0.3);
    fed(4);
    const meals = [...w.tilesWith('items')].filter((i) => w.itemType[i] === itemId('meal'));
    expect(meals.length).toBeGreaterThan(0);
    expect(meals.every((i) => w.fresh[i] <= 1)).toBe(true);
  });
});

describe('tailoring', () => {
  it('gathers leather from several small stacks to make a parka', () => {
    const sim = Simulation.newColony(8);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    sim.research.done.push('tailoring');
    w.setFeature(w.idx(x + 3, y), featureId('craftingBench'));
    for (let k = 0; k < 6; k++) {
      w.addItem(w.idx(x - 4 + k, y + 4), itemId('leather'), 4);
    }
    for (const c of sim.colonists) {
      c.priorities.crafting = 1;
      c.needs.food = 1;
    }
    run(sim, HOUR * 8);
    expect(sim.stockOf(PARKA) + sim.colonists.filter((c) => c.apparel?.item === PARKA).length).toBeGreaterThan(0);
  });
});

describe('food poisoning', () => {
  it('slows work while it lasts', () => {
    const sim = Simulation.newColony(5);
    const c = sim.colonists[0];
    const before = healthFactor(c);
    c.health.poisoned = 5;
    expect(healthFactor(c)).toBeLessThan(before);
    run(sim, HOUR * 6);
    expect(c.health.poisoned).toBe(0);
  });
});

describe('saving', () => {
  it('keeps clothing, exposure and item quality', () => {
    const sim = Simulation.newColony(6);
    const w = sim.world;
    const tile = w.idx(w.xOf(sim.colonists[0].tile) + 2, w.yOf(sim.colonists[0].tile));
    w.addItem(tile, itemId('meal'), 3, undefined, 12);
    sim.colonists[0].health.hypothermia = 0.3;
    const copy = deserialize(structuredClone(serialize(sim)));
    expect(copy.colonists[0].apparel).toEqual(sim.colonists[0].apparel);
    expect(copy.colonists[0].health.hypothermia).toBeCloseTo(0.3);
    expect(copy.world.quality[tile]).toBeCloseTo(w.quality[tile]);
  });
});

describe('richer production', () => {
  function workshop(seed: number) {
    const sim = Simulation.newColony(seed);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    for (const c of sim.colonists) {
      c.needs.food = 1;
      c.priorities.crafting = 1;
      c.priorities.cooking = 1;
      c.skills.cooking = 10;
      c.skills.crafting = 10;
    }
    return { sim, w, x, y };
  }

  it('cooks fine meals only with both meat and vegetables', () => {
    const { sim, w, x, y } = workshop(21);
    w.setFeature(w.idx(x + 3, y), featureId('stove'));
    w.dropItemNear(w.idx(x, y + 3), itemId('potatoes'), 60);
    sim.bills[0].target = 0;
    run(sim, HOUR * 4);
    expect(sim.stockOf(itemId('fineMeal'))).toBe(0);
    w.dropItemNear(w.idx(x - 3, y + 3), itemId('rawFish'), 30);
    run(sim, HOUR * 6);
    expect(sim.stockOf(itemId('fineMeal'))).toBeGreaterThan(0);
  });

  it('cuts granite into blocks at a stonecutter', () => {
    const { sim, w, x, y } = workshop(22);
    w.setFeature(w.idx(x + 3, y), featureId('stonecutterTable'));
    w.dropItemNear(w.idx(x, y + 3), itemId('stone'), 20);
    run(sim, HOUR * 4);
    expect(sim.stockOf(itemId('stoneBlocks'))).toBeGreaterThan(0);
  });

  it('mends worn clothing, keeping its quality', () => {
    const { sim, w, x, y } = workshop(23);
    sim.research.done.push('tailoring');
    w.setFeature(w.idx(x + 3, y), featureId('craftingBench'));
    const tile = w.idx(x - 2, y + 3);
    w.addItem(tile, PARKA, 1, 0.3, 15);
    // A warm summer day, so nobody wants to wear the parka instead of mending it.
    setHour(sim, (t) => t > 22 && sim.hour >= 9 && sim.hour < 12);
    sim.syncClock();
    w.dropItemNear(w.idx(x + 1, y + 4), itemId('cloth'), 10);
    run(sim, HOUR * 6);
    const parka = [...w.tilesWith('items')].find((i) => w.itemType[i] === PARKA);
    const worn = sim.colonists.find((c) => c.apparel?.item === PARKA)?.apparel;
    const wear = parka !== undefined ? w.fresh[parka] : worn?.wear;
    const quality = parka !== undefined ? w.quality[parka] : worn?.quality;
    expect(wear).toBeGreaterThan(0.9);
    expect(quality).toBeCloseTo(15);
  });

  it('drops half-gathered ingredients instead of losing them', () => {
    const { sim, w, x, y } = workshop(24);
    w.setFeature(w.idx(x + 3, y), featureId('stove'));
    w.dropItemNear(w.idx(x, y + 3), itemId('potatoes'), 30);
    w.dropItemNear(w.idx(x - 3, y + 3), itemId('rawMeat'), 30);
    const food = () => sim.stockOf(itemId('potatoes')) + sim.stockOf(itemId('rawMeat'));
    const before = food();
    sim.bills[0].target = 0;
    run(sim, 60);
    for (const c of sim.colonists) {
      sim.dropCarried(c);
      sim.endJob(c);
    }
    // Whatever was gathered is back on the ground (nothing was cooked in that time).
    expect(food()).toBe(before);
  });
});

describe('downed and alone', () => {
  // Everyone down, one of them starving, a meal a few tiles away.
  function stranded(seed: number) {
    const sim = Simulation.newColony(seed);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    sim.tick = (12 - START_HOUR) * HOUR;
    sim.syncClock();
    for (const item of [...w.tilesWith('items')]) {
      w.takeItem(item, w.itemCount[item]);
    }
    for (const c of sim.colonists) {
      c.tile = w.idx(x, y);
      // Weak from blood loss: down for hours, in no danger.
      c.health.bloodLoss = 0.8;
      c.health.downed = true;
    }
    const c = sim.colonists[0];
    c.needs.food = 0.05;
    const food = w.idx(x + 4, y);
    w.addItem(food, itemId('meal'), 1);
    return { sim, w, c, food };
  }

  it('crawl to food when nobody is on their feet to bring it', () => {
    const { sim, c } = stranded(31);
    for (let t = 0; t < HOUR * 6 && c.needs.food < 0.5; t++) {
      sim.step();
    }
    expect(c.needs.food).toBeGreaterThan(0.5);
    expect(c.health.downed).toBe(true);
  });

  it('wait for a doctor instead when someone can help', () => {
    const { sim, c, food, w } = stranded(32);
    const doctor = sim.colonists[1];
    doctor.health.bloodLoss = 0;
    doctor.health.downed = false;
    doctor.priorities.doctor = 1;
    run(sim, 40);
    expect(sim.describe(c)).not.toBe('Crawling to some food');
    expect(w.itemType[food] !== 0 || c.needs.food > 0.5).toBe(true);
  });
});

describe('doctors', () => {
  it("feed a starving patient before tending a wound that isn't bleeding", () => {
    const sim = Simulation.newColony(33);
    const w = sim.world;
    const { x, y } = clearAround(sim, 10);
    sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    sim.tick = (12 - START_HOUR) * HOUR;
    sim.syncClock();
    const [doctor, wounded, starving] = sim.colonists;
    for (const c of sim.colonists) {
      c.tile = w.idx(x, y);
      c.needs.food = 1;
      c.needs.rest = 1;
    }
    doctor.priorities.doctor = 1;
    wounded.health.injuries = [{ label: 'Bruise', severity: 0.4, bleeding: 0, tended: 0 }];
    wounded.health.bloodLoss = 0.8;
    wounded.health.downed = true;
    starving.health.bloodLoss = 0.8;
    starving.health.downed = true;
    starving.needs.food = 0.02;
    w.addItem(w.idx(x + 3, y), itemId('meal'), 3);
    let first: string | undefined;
    for (let t = 0; t < HOUR && !first; t++) {
      sim.step();
      const job = doctor.job?.type;
      if (job === 'feed' || job === 'tend') {
        first = job;
      }
    }
    expect(first).toBe('feed');
  });
});

describe('downed and alone: edge cases', () => {
  it('eat food they crawled to outdoors instead of crawling back inside first', () => {
    const sim = Simulation.newColony(34);
    const w = sim.world;
    const { x, y } = clearAround(sim, 12);
    sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
    sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
    sim.tick = (12 - START_HOUR) * HOUR;
    sim.syncClock();
    for (const item of [...w.tilesWith('items')]) {
      w.takeItem(item, w.itemCount[item]);
    }
    // A room to the east, the only meal a few tiles west of its door.
    for (const i of outline(w, x + 4, y - 2, x + 8, y + 2)) {
      w.setFeature(i, featureId('woodWall'));
    }
    w.setFeature(w.idx(x + 4, y), featureId('door'));
    w.addItem(w.idx(x + 1, y), itemId('meal'), 1);
    for (const c of sim.colonists) {
      c.tile = w.idx(x + 6, y);
      c.health.bloodLoss = 0.8;
      c.health.downed = true;
    }
    const c = sim.colonists[0];
    c.needs.food = 0.05;
    for (let t = 0; t < HOUR * 8 && c.needs.food < 0.5; t++) {
      sim.step();
      // Whatever they're doing, describing it never fails.
      expect(typeof sim.describe(c)).toBe('string');
    }
    expect(c.needs.food).toBeGreaterThan(0.5);
  });
});

describe('a drafted colonist starving', () => {
  // A colony with its food a little way off and one colonist drafted, starving, at a post of their own.
  function drafted(seed: number) {
    const sim = Simulation.newColony(seed);
    const w = sim.world;
    const { x, y } = clearAround(sim, 14);
    sim.animals = [];
    for (let i = 0; i < w.size; i++) {
      if (w.itemType[i] !== 0 && (itemDef(w.itemType[i]).nutrition ?? 0) > 0) {
        w.takeItem(i, w.itemCount[i]);
      }
    }
    w.dropItemNear(w.idx(x - 8, y), itemId('meal'), 5);
    const c = sim.colonists[0];
    const post = w.idx(x + 6, y);
    sim.apply({ type: 'draft', colonist: c.id, drafted: true });
    sim.apply({ type: 'move', colonist: c.id, tile: post });
    run(sim, HOUR);
    expect(c.tile).toBe(post);
    c.needs.food = 0.02;
    return { sim, w, c, post, x, y };
  }

  it('goes for a bite with nobody to fight near, and comes back to their post still drafted', () => {
    const { sim, c, post } = drafted(41);
    let ate = false;
    for (let t = 0; t < HOUR * 2 && !(ate && c.tile === post); t++) {
      sim.step();
      ate ||= c.needs.food > 0.3;
    }
    expect(ate).toBe(true);
    expect(c.drafted).toBe(true);
    expect(c.tile).toBe(post);
    expect(sim.describe(c)).not.toBe('Drafted: getting something to eat');
  });

  it('stays put with a raider near, and an order calls a meal off', () => {
    const { sim, w, c, post } = drafted(42);
    // An angry boar fifteen tiles off: no meal.
    sim.animals.push({
      id: sim.nextAnimalId++,
      kind: 'boar',
      tile: w.idx(w.xOf(post) + 15, w.yOf(post)),
      path: [],
      moveProgress: 0,
      hp: 50,
      hunted: false,
      taming: false,
      tame: false,
      revengeOn: c.id,
      cooldown: 0,
      restUntil: 0,
      revengeUntil: sim.tick + HOUR * 9,
    });
    for (let t = 0; t < 40; t++) {
      sim.step();
    }
    expect(c.job?.type).not.toBe('eat');
    // Gone for a meal, then sent elsewhere: the order stands.
    sim.animals = [];
    for (let t = 0; t < 40 && c.job?.type !== 'eat'; t++) {
      sim.step();
    }
    expect(c.job?.type).toBe('eat');
    const there = w.idx(w.xOf(post), w.yOf(post) + 4);
    sim.apply({ type: 'move', colonist: c.id, tile: there });
    for (let t = 0; t < HOUR && c.tile !== there; t++) {
      sim.step();
    }
    expect(c.tile).toBe(there);
    expect(c.job?.type).not.toBe('eat');
  });
});
