import { TICKS_PER_HOUR } from './constants';
import { GatheringKind } from './types';

// Gatherings bring the colony together: parties, the seasonal festivals, weddings and funerals.
// Parties and festivals are for whoever is off duty; weddings and funerals are rites, and anyone
// not dealing with an emergency turns out for them.

export interface GatheringDef {
  // "the harvest festival": used in log lines and activities.
  name: string;
  // Rites draw people away from their work, not just from their free time.
  rite: boolean;
  hours: number;
  // The thought everyone who stayed for it takes away.
  thought: string;
}

export const GATHERINGS: Record<GatheringKind, GatheringDef> = {
  party: { name: 'the party', rite: false, hours: 2, thought: 'attendedParty' },
  plantingDay: { name: 'Planting Day', rite: false, hours: 2, thought: 'plantingDay' },
  harvestFestival: { name: 'the harvest festival', rite: false, hours: 2.5, thought: 'harvestFestival' },
  midwinter: { name: 'the midwinter bonfire', rite: false, hours: 2.5, thought: 'midwinterBonfire' },
  wedding: { name: 'the wedding', rite: true, hours: 2, thought: 'attendedWedding' },
  funeral: { name: 'the funeral', rite: true, hours: 1.5, thought: 'saidGoodbye' },
};

// The festivals of the year: on which day of which season, and at what hour.
export const FESTIVALS: { kind: GatheringKind; season: string; day: number; hour: number }[] = [
  { kind: 'plantingDay', season: 'Spring', day: 2, hour: 18 },
  { kind: 'harvestFestival', season: 'Autumn', day: 4, hour: 18 },
  { kind: 'midwinter', season: 'Winter', day: 3, hour: 19 },
];

// Staying this long counts as having been there.
export const ATTENDED_TICKS = TICKS_PER_HOUR / 2;
// Weddings are held in the evening of the day they're announced.
export const WEDDING_HOUR = 17;
// Parties: thrown in the evening by someone in good spirits, no more often than this.
export const PARTY_FROM = 18;
export const PARTY_UNTIL = 21;
export const PARTY_MOOD = 65;
export const PARTY_GAP_TICKS = TICKS_PER_HOUR * 24 * 3;
// Lovers who think this well of each other may marry.
export const WEDDING_OPINION = 60;
// Funerals are held by day.
export const FUNERAL_FROM = 8;
export const FUNERAL_UNTIL = 19;
// Thoughts of grief that a funeral or a memorial eases.
export const GRIEF = ['friendDied', 'loverDied', 'colonistDied'];
// "One of us lies unburied" lasts this long after a death, if nobody is buried.
export const UNBURIED_DAYS = 4;
