import { describe, expect, it } from 'vitest';
import { canRomance, kinOf, related } from './lifespans';
import { deserialize, serialize } from './serialize';
import { Simulation } from './simulation';
import { RIVAL_OPINION, checkMarriages, compatibility, mutualOpinion, updateSocial } from './social';
import { HOUR, clearAround } from './test-helpers';

const DAY = HOUR * 24;

function quiet(seed: number, people = 4) {
  const sim = Simulation.newColony(seed);
  clearAround(sim, 12);
  sim.weather = { kind: 'clear', until: Number.MAX_SAFE_INTEGER };
  sim.story.lastEventTick = Number.MAX_SAFE_INTEGER;
  while (sim.colonists.length < people) {
    sim.addWanderer();
  }
  for (const c of sim.colonists) {
    c.age = 30;
    c.traits = [];
    c.tile = sim.colonists[0].tile;
  }
  return sim;
}

describe('kinship over many generations', () => {
  it('keeps great-grandparents, second cousins and their kin apart, and strangers free to court', () => {
    const sim = quiet(1, 10);
    const [elder, gA, gB, pA, pB, kidA, kidB, inLaw, stranger, greatKid] = sim.colonists;
    // Four generations: an elder, two of their children, a grandchild from each, a great-grandchild from
    // each grandchild (the two great-grandchildren are second cousins).
    gA.parents = [elder.id];
    gB.parents = [elder.id];
    pA.parents = [gA.id, inLaw.id];
    pB.parents = [gB.id];
    kidA.parents = [pA.id];
    kidB.parents = [pB.id];
    greatKid.parents = [kidA.id];
    expect(related(sim, elder, kidA)).toBe(true);
    expect(related(sim, elder, greatKid)).toBe(true);
    expect(related(sim, kidA, kidB)).toBe(true);
    expect(related(sim, greatKid, kidB)).toBe(true);
    expect(related(sim, inLaw, kidA)).toBe(true);
    expect(related(sim, inLaw, gB)).toBe(false);
    expect(related(sim, stranger, kidA)).toBe(false);
    expect(canRomance(sim, kidA, kidB)).toBe(false);
    expect(canRomance(sim, kidA, stranger)).toBe(true);
    expect(kinOf(sim, kidA, pA)).toBe('parent');
    expect(kinOf(sim, pA, kidA)).toBe('child');
    expect(kinOf(sim, gA, gB)).toBe('sibling');
    expect(kinOf(sim, kidA, gA)).toBe('grandparent');
    expect(kinOf(sim, gA, kidA)).toBe('grandchild');
    expect(kinOf(sim, kidA, kidB)).toBe('kin');
    expect(kinOf(sim, kidA, stranger)).toBeNull();
  });
});

describe('quarrels', () => {
  it('turn talk between people who dislike each other into arguments, logged, with a thought', () => {
    const sim = quiet(2, 2);
    const [a, b] = sim.colonists;
    a.opinions[b.id] = -20;
    b.opinions[a.id] = -20;
    for (let k = 0; k < 4000 && !sim.log.some((l) => l.text.includes('argued')); k++) {
      updateSocial(sim);
    }
    expect(sim.log.some((l) => l.text.includes('argued bitterly'))).toBe(true);
    expect([a, b].every((c) => c.thoughts.some((t) => t.key === 'argued'))).toBe(true);
    expect(mutualOpinion(a, b)).toBeLessThan(-12);
    expect(sim.stats.arguments).toBeGreaterThan(0);
  });

  it('can come to blows between bitter rivals: bruises, broken up, and nobody badly hurt', () => {
    const sim = quiet(3, 3);
    const [a, b] = sim.colonists;
    a.traits = ['abrasive'];
    for (let k = 0; k < 20000 && !sim.stats.fights; k++) {
      a.opinions[b.id] = -80;
      b.opinions[a.id] = -80;
      // Clear the cooldown so the rows keep coming.
      a.thoughts = [];
      b.thoughts = [];
      updateSocial(sim);
    }
    expect(sim.stats.fights).toBe(1);
    const fight = sim.log.find((l) => l.text.includes('came to blows'))!;
    expect(fight.text).toContain('pulled them apart');
    for (const c of [a, b]) {
      expect(c.health.injuries.some((i) => i.label === 'Bruise')).toBe(true);
      expect(c.health.downed).toBe(false);
      expect(c.health.dead).toBe(false);
      expect(c.thoughts.some((t) => t.key === 'fistfight')).toBe(true);
    }
    expect(mutualOpinion(a, b)).toBeLessThanOrEqual(RIVAL_OPINION);
  });

  it('is rare in a happy colony: kind people never start one', () => {
    const sim = quiet(4, 2);
    const [a, b] = sim.colonists;
    a.traits = ['kind'];
    b.traits = ['kind'];
    a.opinions[b.id] = -50;
    b.opinions[a.id] = -50;
    for (let k = 0; k < 3000; k++) {
      updateSocial(sim);
    }
    expect(sim.stats.arguments ?? 0).toBe(0);
  });
});

describe('marriages that end', () => {
  it('can sour when one spouse grows close to someone else', () => {
    const sim = quiet(8, 6);
    // A married pair, and someone one of them has real chemistry with.
    const [a, ...others] = sim.colonists;
    const close = others.find((o) => compatibility(sim, a, o) >= 0.5)!;
    const spouse = others.find((o) => o !== close)!;
    expect(close).toBeDefined();
    for (const o of others) {
      if (o !== close && o !== spouse) {
        o.tile = sim.world.idx(1, 1);
      }
    }
    a.spouse = spouse.id;
    spouse.spouse = a.id;
    a.lover = spouse.id;
    spouse.lover = a.id;
    spouse.opinions[a.id] = 90;
    a.opinions[spouse.id] = 90;
    spouse.tile = sim.world.idx(1, 1);
    for (let k = 0; k < 5000 && !sim.log.some((l) => l.text.includes('jealous')); k++) {
      a.opinions[close.id] = 80;
      close.opinions[a.id] = 80;
      updateSocial(sim);
    }
    expect(sim.log.some((l) => l.text.includes(`${spouse.name} is jealous of how close`))).toBe(true);
    expect(spouse.thoughts.some((t) => t.key === 'jealous')).toBe(true);
    expect(spouse.opinions[a.id]).toBeLessThan(90);
  });

  it('part an unhappy couple after a long rough patch, which weighs on both and their children', () => {
    const sim = quiet(5, 3);
    const [a, b, kid] = sim.colonists;
    a.spouse = b.id;
    b.spouse = a.id;
    a.lover = b.id;
    b.lover = a.id;
    kid.parents = [a.id, b.id];
    kid.age = 9;
    a.opinions[b.id] = -10;
    b.opinions[a.id] = -10;
    let day = 0;
    for (; day < 40 && a.spouse >= 0; day++) {
      sim.tick += DAY;
      checkMarriages(sim);
    }
    expect(sim.log.some((l) => l.text.includes('rough patch'))).toBe(true);
    expect(day).toBeGreaterThanOrEqual(6);
    expect(a.spouse).toBe(-1);
    expect(b.spouse).toBe(-1);
    expect(a.lover).toBe(-1);
    expect(a.separatedFrom).toBe(b.id);
    expect(a.thoughts.some((t) => t.key === 'separated')).toBe(true);
    expect(b.thoughts.some((t) => t.key === 'separated')).toBe(true);
    expect(kid.thoughts.some((t) => t.key === 'parentsSeparated')).toBe(true);
    expect(sim.stats.separations).toBe(1);
  });

  it('keep a couple who are fond of each other together', () => {
    const sim = quiet(6, 2);
    const [a, b] = sim.colonists;
    a.spouse = b.id;
    b.spouse = a.id;
    a.opinions[b.id] = 60;
    b.opinions[a.id] = 60;
    for (let day = 0; day < 40; day++) {
      sim.tick += DAY;
      checkMarriages(sim);
    }
    expect(a.spouse).toBe(b.id);
  });
});

describe('a saved family', () => {
  it('keeps separations, retirement, childhood, grief and ailments', () => {
    const sim = quiet(7, 2);
    const [a, b] = sim.colonists;
    a.separatedFrom = b.id;
    a.retired = true;
    a.childhood = { hard: 3, happy: 9 };
    a.grief = [{ id: b.id, name: b.name, day: 1, weight: 2 }];
    a.health.ailments = ['soreBack'];
    const copy = deserialize(structuredClone(serialize(sim))).colonists[0];
    expect(copy.separatedFrom).toBe(b.id);
    expect(copy.retired).toBe(true);
    expect(copy.childhood).toEqual({ hard: 3, happy: 9 });
    expect(copy.grief).toEqual(a.grief);
    expect(copy.health.ailments).toEqual(['soreBack']);
  });
});
