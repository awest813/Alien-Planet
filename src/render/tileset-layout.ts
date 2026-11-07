import { FEATURES, ITEMS, TERRAIN } from '../sim/defs';

// Where each piece of art sits in the generated tileset. Every section starts on a fresh row and is
// sized from the definitions, so new terrain, buildings or items never run out of room. Shared by the
// renderer (which draws the tileset) and the UI (which cuts item icons from it).

export const TILE = 16;
export const TILESET_COLUMNS = 16;

const CROPS = FEATURES.filter((f) => f.crop);
// Each terrain has four looks (plain, and three with details) in each of the four seasons.
export const TERRAIN_VARIANTS = 4;
export const TERRAIN_SEASONS = 4;
const TERRAIN_FRAMES = TERRAIN_VARIANTS * TERRAIN_SEASONS;
// Designations are numbered from 1; frame 0 of the section is left empty.
const DESIGNATION_FRAMES = 5;
const OVERLAY_FRAMES = 3;
const CROP_STAGES = 3;
// Dirt, blood and rubble, each in three amounts.
const FILTH_FRAMES = 9;

const rowsFor = (frames: number) => Math.max(1, Math.ceil(frames / TILESET_COLUMNS));

// Lays the sections out one after another, each starting on a new row.
function layout(sections: Record<string, number>): { starts: Record<string, number>; rows: number } {
  const starts: Record<string, number> = {};
  let row = 0;
  for (const [name, frames] of Object.entries(sections)) {
    starts[name] = row * TILESET_COLUMNS;
    row += rowsFor(frames);
  }
  return { starts, rows: row };
}

const { starts, rows } = layout({
  terrain: TERRAIN.length * TERRAIN_FRAMES,
  features: FEATURES.length,
  blueprints: FEATURES.length,
  designations: DESIGNATION_FRAMES,
  items: ITEMS.length,
  overlays: OVERLAY_FRAMES,
  crops: CROPS.length * CROP_STAGES,
  filth: FILTH_FRAMES,
});

export const TILESET_ROWS = rows;

// Frame indices in the generated tileset.
export const Frames = {
  // `season`: 0 spring, 1 summer, 2 autumn, 3 winter.
  terrain: (terrain: number, variant: number, season = 1) =>
    starts.terrain + terrain * TERRAIN_FRAMES + season * TERRAIN_VARIANTS + variant,
  feature: (feature: number) => starts.features + feature - 1,
  blueprint: (feature: number) => starts.blueprints + feature - 1,
  designation: (designation: number) => starts.designations + designation,
  item: (item: number) => starts.items + item - 1,
  ZONE: starts.overlays,
  INDOOR: starts.overlays + 1,
  GROW_ZONE: starts.overlays + 2,
  // Three growth stages per crop.
  crop: (feature: number, growth: number) =>
    starts.crops +
    CROPS.findIndex((f) => f.id === feature) * CROP_STAGES +
    Math.min(CROP_STAGES - 1, Math.floor(growth * CROP_STAGES)),
  // `kind` and `amount` from 1 to 3 (see Filth in the sim's world).
  filth: (kind: number, amount: number) => starts.filth + (kind - 1) * 3 + amount - 1,
};
