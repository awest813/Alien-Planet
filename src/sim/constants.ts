// Shared simulation constants, kept separate so helper modules can use them without
// importing the Simulation class (which imports them).
export const MAP_SIZE = 64;
export const COLONIST_COUNT = 5;
export const TICKS_PER_HOUR = 200;
export const START_HOUR = 7;
export const NIGHT_START = 22;
export const NIGHT_END = 6;
export const MOVE_SPEED = 0.22;
// Slow systems (mood, crops, temperature, health) update every this many ticks.
export const SLOW_TICKS = 20;
