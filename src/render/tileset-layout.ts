import { FEATURES, ITEMS, TERRAIN } from '../sim/defs';

// Where each piece of art sits in the generated tileset. Every section starts on a fresh row and is
// sized from the definitions, so new terrain, buildings or items never run out of room. Shared by the
// renderer (which draws the tileset) and the UI (which cuts item icons from it).

export const TILE = 16;
export const TILESET_COLUMNS = 16;

const CROPS = FEATURES.filter((f) => f.crop);
// Designations are numbered from 1; frame 0 of the section is left empty.
const DESIGNATION_FRAMES = 5;
const OVERLAY_FRAMES = 3;
const CROP_STAGES = 3;

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
  terrain: TERRAIN.length * 2,
  features: FEATURES.length,
  blueprints: FEATURES.length,
  designations: DESIGNATION_FRAMES,
  items: ITEMS.length,
  overlays: OVERLAY_FRAMES,
  crops: CROPS.length * CROP_STAGES,
});

export const TILESET_ROWS = rows;

// Frame indices in the generated tileset.
export const Frames = {
  terrain: (terrain: number, variant: number) => starts.terrain + terrain * 2 + variant,
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
};
