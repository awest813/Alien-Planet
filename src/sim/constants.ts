// Shared simulation constants, kept separate so helper modules can use them without
// importing the Simulation class (which imports them).
export const MAP_SIZE = 64;

// Map sizes a new colony can be founded on (tiles per side). Wildlife scales with the area, and so
// do the people: how many land, and how many the valley can hold before newcomers stop asking to join.
export const MAP_SIZES = [
  {
    size: 64,
    label: 'Tiny',
    colonists: 3,
    maxColonists: 6,
    description: '64×64. Three colonists, room for six. Everything close at hand.',
  },
  {
    size: 96,
    label: 'Small',
    colonists: 4,
    maxColonists: 9,
    description: '96×96. Four colonists, room for nine. More wildlife, longer walks.',
  },
  {
    size: 128,
    label: 'Medium',
    colonists: 5,
    maxColonists: 12,
    description: '128×128. Five colonists, room for twelve. Raiders come from farther off.',
  },
  {
    size: 192,
    label: 'Large',
    colonists: 6,
    maxColonists: 15,
    description: '192×192. Six colonists, room for fifteen. Long walks: settle with care.',
  },
];

// The population settings for a map this many tiles across (the nearest size at or below it).
export const populationFor = (width: number) => [...MAP_SIZES].reverse().find((m) => m.size <= width) ?? MAP_SIZES[0];
export const TICKS_PER_HOUR = 200;
export const START_HOUR = 7;
export const NIGHT_START = 22;
export const NIGHT_END = 6;
export const MOVE_SPEED = 0.22;
// Slow systems (mood, crops, temperature, health) update every this many ticks.
export const SLOW_TICKS = 20;
