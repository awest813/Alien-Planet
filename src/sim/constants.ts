// Shared simulation constants, kept separate so helper modules can use them without
// importing the Simulation class (which imports them).
export const MAP_SIZE = 64;

// Map sizes a new colony can be founded on (tiles per side). Wildlife scales with the area.
export const MAP_SIZES = [
  { size: 64, label: 'Small', description: '64×64. A compact valley: everything is close at hand.' },
  { size: 96, label: 'Medium', description: '96×96. More room, more wildlife, longer walks.' },
  { size: 128, label: 'Large', description: '128×128. A wide frontier. Raiders and herds come from farther off.' },
];
export const COLONIST_COUNT = 5;
export const TICKS_PER_HOUR = 200;
export const START_HOUR = 7;
export const NIGHT_START = 22;
export const NIGHT_END = 6;
export const MOVE_SPEED = 0.22;
// Slow systems (mood, crops, temperature, health) update every this many ticks.
export const SLOW_TICKS = 20;
