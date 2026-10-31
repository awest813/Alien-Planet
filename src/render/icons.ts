// Item icons for the React UI, cut from the generated tileset. The tileset is drawn when the
// game scene starts; until then (and outside the game) icons are simply blank.

const TILE = 16;
const COLUMNS = 16;
// Must match Frames.item in textures.ts.
const itemFrame = (item: number) => 128 + item - 1;

let tilesetUrl = '';

export function setTilesetImage(url: string): void {
  tilesetUrl = url;
}

// Inline style for a 16×16 element showing an item's icon.
export function itemIconStyle(item: number): { backgroundImage?: string; backgroundPosition?: string } {
  if (!tilesetUrl) {
    return {};
  }
  const frame = itemFrame(item);
  return {
    backgroundImage: `url(${tilesetUrl})`,
    backgroundPosition: `-${(frame % COLUMNS) * TILE}px -${Math.floor(frame / COLUMNS) * TILE}px`,
  };
}
