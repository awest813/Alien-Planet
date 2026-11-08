import Phaser from 'phaser';
import { FEATURES, ITEMS, TERRAIN } from '../sim/defs';
import { hash2 } from '../sim/rng';
import { setTilesetImage } from './icons';
import {
  Frames,
  TERRAIN_SEASONS,
  TERRAIN_VARIANTS,
  TILE,
  TILESET_COLUMNS as COLUMNS,
  TILESET_ROWS as ROWS,
} from './tileset-layout';

export { Frames, TILE } from './tileset-layout';
export const TILESET_KEY = 'tiles';

type Ctx = CanvasRenderingContext2D;

// Everything is drawn procedurally so the prototype needs no art assets.
export function createTextures(scene: Phaser.Scene): void {
  const texture = scene.textures.createCanvas(TILESET_KEY, COLUMNS * TILE, ROWS * TILE)!;
  const ctx = texture.getContext();
  ctx.imageSmoothingEnabled = false;

  const at = (frame: number, draw: (ctx: Ctx) => void) => {
    ctx.save();
    ctx.translate((frame % COLUMNS) * TILE, Math.floor(frame / COLUMNS) * TILE);
    ctx.beginPath();
    ctx.rect(0, 0, TILE, TILE);
    ctx.clip();
    draw(ctx);
    ctx.restore();
  };

  TERRAIN.forEach((t) => {
    for (let season = 0; season < TERRAIN_SEASONS; season++) {
      for (let v = 0; v < TERRAIN_VARIANTS; v++) {
        at(Frames.terrain(t.id, v, season), (c) => drawTerrain(c, t.key, v, season));
      }
    }
  });
  FEATURES.forEach((f) => {
    at(Frames.feature(f.id), (c) => drawFeature(c, f.key));
    at(Frames.blueprint(f.id), (c) => {
      drawFeature(c, f.key);
      // Tinted blue, but not flat: the building's own shading shows through, so a door can be told
      // from the wall beside it and a bed from a table.
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(127, 208, 255, 0.72)';
      c.fillRect(0, 0, TILE, TILE);
      // A planned door gets a plain doorway mark, so it stands out in a row of planned walls.
      if (f.door) {
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#123a5a';
        c.fillRect(4, 2, 8, 13);
        c.fillStyle = '#7fd0ff';
        c.fillRect(5, 3, 6, 12);
        c.fillStyle = '#123a5a';
        c.fillRect(9, 8, 1, 2);
      }
    });
  });
  const designationColors = ['', '#ffb347', '#a8e063', '#ff7aa2', '#ff5252'];
  for (let d = 1; d <= 4; d++) {
    at(Frames.designation(d), (c) => drawDesignation(c, designationColors[d], d === 4));
  }
  ITEMS.forEach((item) => at(Frames.item(item.id), (c) => drawItem(c, item.key)));
  at(Frames.ZONE, (c) => {
    c.fillStyle = 'rgba(255, 214, 92, 0.22)';
    c.fillRect(0, 0, TILE, TILE);
    c.fillStyle = 'rgba(255, 214, 92, 0.5)';
    c.fillRect(0, 0, TILE, 1);
    c.fillRect(0, 0, 1, TILE);
  });
  at(Frames.GROW_ZONE, (c) => {
    c.fillStyle = 'rgba(120, 220, 90, 0.16)';
    c.fillRect(0, 0, TILE, TILE);
    c.fillStyle = 'rgba(120, 220, 90, 0.45)';
    c.fillRect(0, 0, TILE, 1);
    c.fillRect(0, 0, 1, TILE);
  });
  FEATURES.filter((f) => f.crop).forEach((f) => {
    for (let stage = 0; stage < 3; stage++) {
      at(Frames.crop(f.id, stage / 3), (c) => drawCrop(c, f.key, stage));
    }
  });
  for (let kind = 1; kind <= 3; kind++) {
    for (let amount = 1; amount <= 3; amount++) {
      at(Frames.filth(kind, amount), (c) => drawFilth(c, kind, amount));
    }
  }
  at(Frames.INDOOR, (c) => {
    c.fillStyle = 'rgba(30, 20, 10, 0.2)';
    c.fillRect(0, 0, TILE, TILE);
  });
  texture.refresh();
  // The UI cuts item icons from the same art.
  setTilesetImage(texture.canvas.toDataURL());

  // Named frames for sprites that reuse tileset art.
  for (let frame = 0; frame < COLUMNS * ROWS; frame++) {
    texture.add(frame, 0, (frame % COLUMNS) * TILE, Math.floor(frame / COLUMNS) * TILE, TILE, TILE);
  }

  createPawnTextures(scene);
}

// Mess on the ground: smudges of dirt, splashes of blood, scattered rubble, more with each amount.
function drawFilth(c: Ctx, kind: number, amount: number): void {
  const seed = 900 + kind * 10 + amount;
  const blob = (x: number, y: number, r: number) => {
    c.beginPath();
    c.ellipse(x, y, r, r * 0.75, 0, 0, Math.PI * 2);
    c.fill();
  };
  const spots = amount * 3;
  for (let k = 0; k < spots; k++) {
    const x = 2 + hash2(k, 1, seed) * (TILE - 4);
    const y = 2 + hash2(k, 2, seed) * (TILE - 4);
    const r = 0.8 + hash2(k, 3, seed) * (kind === 3 ? 1.2 : 1.8);
    if (kind === 1) {
      // Dark enough to show on wood and earth alike.
      c.fillStyle = k % 2 ? 'rgba(48, 36, 26, 0.6)' : 'rgba(70, 54, 38, 0.55)';
      blob(x, y, r + 0.4);
    } else if (kind === 2) {
      c.fillStyle = k % 3 ? 'rgba(130, 16, 20, 0.75)' : 'rgba(170, 30, 30, 0.65)';
      blob(x, y, r);
    } else {
      c.fillStyle = k % 2 ? '#8a8378' : '#6d675e';
      c.fillRect(Math.round(x), Math.round(y), Math.ceil(r), Math.ceil(r));
      c.fillStyle = 'rgba(30, 26, 22, 0.5)';
      c.fillRect(Math.round(x), Math.round(y) + Math.ceil(r), Math.ceil(r), 1);
    }
  }
  // Heavier blood pools in the middle.
  if (kind === 2 && amount >= 2) {
    c.fillStyle = 'rgba(120, 12, 16, 0.7)';
    blob(8, 8, amount * 1.6);
  }
}

function speckle(c: Ctx, seed: number, colors: string[], density: number): void {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const r = hash2(x, y, seed);
      if (r < density) {
        c.fillStyle = colors[Math.floor((r / density) * colors.length)];
        c.fillRect(x, y, 1, 1);
      }
    }
  }
}

// Ground in four looks (0 plain; 1–3 with details) through the four seasons (0 spring … 3 winter).
function drawTerrain(c: Ctx, key: string, variant: number, season: number): void {
  const seed = variant * 97 + season * 31 + key.length * 13;
  const winter = season === 3;
  const palettes: Record<string, [string, string[], number][]> = {
    deepWater: [['#1d4670', ['#24547f', '#2b5f8c'], 0.12]],
    shallowWater: [['#3d7bb0', ['#4a8bc0', '#5a9bd0'], 0.12]],
    sand: [['#d6c286', ['#c9b376', '#e2d199'], 0.18]],
    grass: [
      ['#5f9238', ['#527f30', '#6ea442', '#7ab24c'], 0.22],
      ['#5a8a38', ['#4e7c30', '#679a42', '#72a34a'], 0.22],
      ['#7a8a3a', ['#8a8236', '#6c7c34', '#9a8a3e'], 0.24],
      ['#8a9884', ['#96a290', '#a8b2a6', '#c8d2d4'], 0.16],
    ],
    soil: [['#5f4a2f', ['#544128', '#6c553a'], 0.25]],
    stoneFloor: [['#77746f', ['#6a6762', '#85827c'], 0.25]],
    ice: [['#cfe4ef', ['#bcd6e6', '#e6f3fa'], 0.2]],
  };
  const options = palettes[key];
  const [base, specks, density] = options[Math.min(season, options.length - 1)];
  c.fillStyle = base;
  c.fillRect(0, 0, TILE, TILE);
  speckle(c, seed, specks, density);
  const dot = (x: number, y: number, color: string, w = 1, h = 1) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  // Small details, placed by the variant so neighbouring tiles differ.
  const spot = (k: number) => [
    2 + Math.floor(hash2(variant, k, seed) * 11),
    2 + Math.floor(hash2(k, variant, seed) * 11),
  ];
  if (key === 'grass' && variant > 0) {
    if (variant === 1) {
      // Tufts.
      for (const k of [1, 2]) {
        const [x, y] = spot(k);
        const blade = winter ? '#9aa69a' : season === 2 ? '#6c6a2c' : '#3f6e26';
        dot(x, y, blade, 1, 2);
        dot(x + 1, y - 1, blade, 1, 3);
        dot(x + 2, y, blade, 1, 2);
      }
    } else if (variant === 2) {
      // Flowers in spring and summer, fallen leaves in autumn, snow in winter.
      const colors = [
        ['#f2d24c', '#e85a8a', '#ffffff'],
        ['#f2d24c', '#9b6bd6', '#ffffff'],
        ['#c8642e', '#d89a32', '#a8442a'],
        ['#f4f8fa', '#e6eef2', '#ffffff'],
      ][season];
      for (const k of [1, 2, 3]) {
        const [x, y] = spot(k);
        dot(x, y, colors[k - 1], winter ? 2 : 1, 1);
      }
    } else {
      // A pebble.
      const [x, y] = spot(1);
      dot(x, y, '#8a8780', 2, 2);
      dot(x, y, '#a5a29a');
    }
  }
  if (key === 'soil' && variant > 1) {
    for (const k of [1, 2, 3]) {
      const [x, y] = spot(k);
      dot(x, y, '#7a6a52');
    }
  }
  if (key === 'sand' && variant > 0) {
    // Ripples, and now and then a shell.
    dot(3, 4 + variant * 3, 'rgba(160,130,80,0.45)', 6, 1);
    if (variant === 3) {
      const [x, y] = spot(4);
      dot(x, y, '#f2ead8', 2, 1);
    }
  }
  if (key === 'stoneFloor' && variant > 1) {
    const [x, y] = spot(5);
    dot(x, y, '#5f5c58', 3, 1);
    dot(x + 2, y + 1, '#5f5c58', 1, 2);
  }
  // Frost on open ground in winter.
  if (winter && (key === 'soil' || key === 'sand' || key === 'stoneFloor')) {
    speckle(c, seed + 7, ['rgba(235,242,248,0.7)'], 0.12);
  }
  if (key === 'deepWater' || key === 'shallowWater') {
    c.fillStyle = 'rgba(255,255,255,0.18)';
    const y = 3 + variant * 3;
    c.fillRect(3, y, 4, 1);
    c.fillRect(9, ((y + 6) % 14) + 1, 4, 1);
  }
  if (key === 'ice') {
    c.fillStyle = 'rgba(80,120,150,0.35)';
    if (variant % 2) {
      c.fillRect(2, 5, 5, 1);
      c.fillRect(7, 6, 4, 1);
      c.fillRect(11, 7, 1, 4);
    } else {
      c.fillRect(4, 10, 6, 1);
      c.fillRect(9, 11, 1, 3);
    }
  }
}

function drawFeature(c: Ctx, key: string): void {
  switch (key) {
    case 'tree':
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(3, 13, 10, 2);
      c.fillStyle = '#6b4423';
      c.fillRect(7, 9, 2, 5);
      c.fillStyle = '#2f5d27';
      c.fillRect(3, 3, 10, 7);
      c.fillRect(4, 1, 8, 10);
      c.fillStyle = '#3e7a31';
      c.fillRect(4, 2, 7, 6);
      c.fillStyle = '#58a043';
      c.fillRect(5, 3, 3, 2);
      break;
    case 'berryBush':
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(3, 12, 10, 2);
      c.fillStyle = '#356b2b';
      c.fillRect(3, 6, 10, 7);
      c.fillRect(4, 5, 8, 8);
      c.fillStyle = '#4a8a3a';
      c.fillRect(5, 6, 5, 3);
      c.fillStyle = '#d43a5a';
      [
        [5, 8],
        [9, 7],
        [7, 10],
        [10, 10],
        [4, 11],
      ].forEach(([x, y]) => c.fillRect(x, y, 1, 1));
      break;
    case 'rock':
      c.fillStyle = '#4b4a4f';
      c.fillRect(0, 0, TILE, TILE);
      speckle(c, 5, ['#55545a', '#424146', '#605f66'], 0.35);
      c.fillStyle = '#6d6c73';
      c.fillRect(0, 0, TILE, 2);
      c.fillStyle = '#38373b';
      c.fillRect(3, 6, 4, 1);
      c.fillRect(9, 11, 4, 1);
      break;
    case 'ironVein':
      // Granite shot through with rusty streaks.
      c.fillStyle = '#4b4a4f';
      c.fillRect(0, 0, TILE, TILE);
      speckle(c, 6, ['#55545a', '#424146', '#605f66'], 0.3);
      c.fillStyle = '#6d6c73';
      c.fillRect(0, 0, TILE, 2);
      c.fillStyle = '#a2582e';
      c.fillRect(2, 5, 5, 2);
      c.fillRect(6, 7, 3, 1);
      c.fillRect(9, 10, 5, 2);
      c.fillRect(4, 12, 3, 1);
      c.fillStyle = '#d27a3e';
      c.fillRect(3, 5, 2, 1);
      c.fillRect(10, 10, 2, 1);
      break;
    case 'clayBank':
      // A low mound of wet reddish clay.
      c.fillStyle = 'rgba(0,0,0,0.15)';
      c.fillRect(2, 9, 13, 5);
      c.fillStyle = '#9c5a3c';
      c.fillRect(2, 7, 12, 6);
      c.fillRect(4, 5, 8, 2);
      c.fillStyle = '#b8714f';
      c.fillRect(4, 5, 6, 1);
      c.fillRect(3, 7, 4, 1);
      c.fillStyle = '#7d4430';
      c.fillRect(8, 10, 4, 1);
      break;
    case 'brickWall':
      c.fillStyle = '#6e3a2a';
      c.fillRect(0, 0, TILE, TILE);
      c.fillStyle = '#a65a3e';
      for (let row = 0; row < 4; row++) {
        const offset = row % 2 ? 4 : 0;
        for (let x = -offset; x < TILE; x += 8) {
          c.fillRect(x + 1, row * 4 + 1, 6, 3);
        }
      }
      c.fillStyle = '#c47a58';
      c.fillRect(1, 1, 6, 1);
      c.fillRect(5, 5, 6, 1);
      break;
    case 'brickFloor':
      // Flat pavers in a basket weave, with pale mortar: plainly a floor, not a wall.
      c.fillStyle = '#cbb8a4';
      c.fillRect(0, 0, TILE, TILE);
      c.fillStyle = '#b8734f';
      for (let by = 0; by < 2; by++) {
        for (let bx = 0; bx < 2; bx++) {
          const ox = bx * 8;
          const oy = by * 8;
          if ((bx + by) % 2 === 0) {
            c.fillRect(ox + 1, oy + 1, 6, 3);
            c.fillRect(ox + 1, oy + 4, 6, 3);
          } else {
            c.fillRect(ox + 1, oy + 1, 3, 6);
            c.fillRect(ox + 4, oy + 1, 3, 6);
          }
        }
      }
      break;
    case 'millstone':
      // Two round stones, one on the other, turned by a wooden arm.
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(2, 3, 13, 12);
      c.fillStyle = '#7d7c82';
      c.beginPath();
      c.arc(8, 8, 6, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#a4a3a9';
      c.beginPath();
      c.arc(8, 8, 4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#5c5b60';
      c.fillRect(7, 7, 2, 2);
      c.fillStyle = '#7a5434';
      c.fillRect(8, 7, 7, 2);
      break;
    case 'dryingRack':
      // A wooden frame with strips hung along it.
      c.fillStyle = '#6b4a2e';
      c.fillRect(1, 2, 2, 12);
      c.fillRect(13, 2, 2, 12);
      c.fillStyle = '#8a6040';
      c.fillRect(1, 3, 14, 1);
      c.fillRect(1, 9, 14, 1);
      c.fillStyle = '#9c4a3a';
      for (const x of [4, 7, 10]) {
        c.fillRect(x, 4, 1, 3);
        c.fillRect(x, 10, 1, 3);
      }
      break;
    case 'kiln':
      // A domed brick oven with a glowing mouth.
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(1, 4, 15, 11);
      c.fillStyle = '#7a5a4a';
      c.fillRect(2, 5, 12, 9);
      c.fillRect(4, 3, 8, 2);
      c.fillStyle = '#9a7462';
      c.fillRect(4, 3, 6, 1);
      c.fillRect(2, 5, 3, 1);
      c.fillStyle = '#2a1a12';
      c.fillRect(6, 9, 4, 4);
      c.fillStyle = '#f08a3a';
      c.fillRect(7, 11, 2, 2);
      break;
    case 'mineShaft':
      // A square pit going down into the dark, framed in timber, with a winch over it.
      c.fillStyle = '#3a3428';
      c.fillRect(1, 2, 14, 13);
      c.fillStyle = '#0c0a08';
      c.fillRect(3, 5, 10, 8);
      c.fillStyle = '#1e1a14';
      c.fillRect(3, 5, 10, 2);
      c.fillStyle = '#8a5e34';
      c.fillRect(1, 3, 14, 2);
      c.fillRect(1, 13, 14, 2);
      c.fillRect(1, 3, 2, 12);
      c.fillRect(13, 3, 2, 12);
      c.fillStyle = '#b07a44';
      c.fillRect(1, 3, 14, 1);
      c.fillStyle = '#6a4626';
      c.fillRect(7, 0, 2, 4);
      c.fillStyle = '#c8c4b8';
      c.fillRect(8, 4, 1, 6);
      c.fillStyle = '#6d6c73';
      c.fillRect(7, 10, 3, 2);
      break;
    case 'smelter':
      // A tall brick furnace with a chimney and a pouring lip.
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(2, 3, 13, 12);
      c.fillStyle = '#6e3a2a';
      c.fillRect(3, 4, 10, 10);
      c.fillStyle = '#a65a3e';
      c.fillRect(3, 4, 10, 1);
      c.fillRect(3, 8, 10, 1);
      c.fillStyle = '#4a4a50';
      c.fillRect(10, 0, 3, 5);
      c.fillStyle = '#2a1a12';
      c.fillRect(5, 9, 4, 3);
      c.fillStyle = '#ffb347';
      c.fillRect(6, 10, 2, 2);
      c.fillStyle = '#8a8990';
      c.fillRect(1, 11, 3, 1);
      break;
    case 'woodWall':
      c.fillStyle = '#7a4e27';
      c.fillRect(0, 0, TILE, TILE);
      c.fillStyle = '#8d5d31';
      for (let y = 1; y < TILE; y += 4) {
        c.fillRect(0, y, TILE, 2);
      }
      c.fillStyle = '#5a3818';
      c.fillRect(0, 0, TILE, 1);
      c.fillRect(0, TILE - 1, TILE, 1);
      c.fillRect(5, 3, 1, 1);
      c.fillRect(11, 11, 1, 1);
      break;
    case 'stoneWall':
      c.fillStyle = '#5c5b60';
      c.fillRect(0, 0, TILE, TILE);
      c.fillStyle = '#8a8990';
      for (let row = 0; row < 4; row++) {
        const offset = row % 2 ? 4 : 0;
        for (let x = -offset; x < TILE; x += 8) {
          c.fillRect(x + 1, row * 4 + 1, 6, 2);
        }
      }
      break;
    case 'blockWall':
      c.fillStyle = '#6f6e74';
      c.fillRect(0, 0, TILE, TILE);
      c.fillStyle = '#a3a2a9';
      for (let row = 0; row < 2; row++) {
        const offset = row % 2 ? 8 : 0;
        for (let x = -offset; x < TILE; x += 16) {
          c.fillRect(x + 1, row * 8 + 1, 14, 6);
        }
      }
      c.fillStyle = '#c4c3c9';
      c.fillRect(1, 1, 14, 1);
      c.fillRect(9, 9, 6, 1);
      c.fillRect(0, 9, 7, 1);
      break;
    case 'door':
      c.fillStyle = '#4a2f16';
      c.fillRect(0, 0, TILE, TILE);
      c.fillStyle = '#9a6a3a';
      c.fillRect(2, 1, 12, 14);
      c.fillStyle = '#7a5028';
      c.fillRect(7, 1, 2, 14);
      c.fillStyle = '#e8c35a';
      c.fillRect(11, 8, 1, 2);
      break;
    case 'bed':
      c.fillStyle = '#6b4423';
      c.fillRect(2, 1, 12, 14);
      c.fillStyle = '#eeeae0';
      c.fillRect(3, 2, 10, 3);
      c.fillStyle = '#3f6fb5';
      c.fillRect(3, 6, 10, 8);
      c.fillStyle = '#5585cc';
      c.fillRect(3, 6, 10, 2);
      break;
    case 'hospitalBed':
      // A pale metal frame, clean white sheets and a red cross.
      c.fillStyle = '#9aa3ad';
      c.fillRect(2, 1, 12, 14);
      c.fillStyle = '#f4f2ec';
      c.fillRect(3, 2, 10, 3);
      c.fillStyle = '#e4ecf2';
      c.fillRect(3, 6, 10, 8);
      c.fillStyle = '#d23c3c';
      c.fillRect(7, 7, 2, 6);
      c.fillRect(5, 9, 6, 2);
      break;
    case 'prisonerBed':
      // A plain iron cot with a coarse orange blanket.
      c.fillStyle = '#55565c';
      c.fillRect(2, 1, 12, 14);
      c.fillStyle = '#8a8b92';
      c.fillRect(2, 1, 12, 1);
      c.fillRect(2, 14, 12, 1);
      c.fillStyle = '#d8d2c4';
      c.fillRect(3, 2, 10, 3);
      c.fillStyle = '#c8682a';
      c.fillRect(3, 6, 10, 8);
      c.fillStyle = '#a4521f';
      c.fillRect(3, 9, 10, 1);
      c.fillRect(3, 12, 10, 1);
      break;
    case 'potatoPlant':
    case 'grainPlant':
    case 'cottonPlant':
    case 'healrootPlant':
    case 'poplarPlant':
      drawCrop(c, key, 2);
      break;
    case 'stove':
      c.fillStyle = '#3c3b40';
      c.fillRect(1, 2, 14, 13);
      c.fillStyle = '#6d6c73';
      c.fillRect(1, 2, 14, 2);
      c.fillStyle = '#1e1d21';
      c.fillRect(3, 6, 4, 4);
      c.fillRect(9, 6, 4, 4);
      c.fillStyle = '#ff8a3d';
      c.fillRect(4, 11, 8, 2);
      c.fillStyle = '#ffd166';
      c.fillRect(6, 11, 4, 1);
      break;
    case 'craftingBench':
      c.fillStyle = '#5a3818';
      c.fillRect(1, 9, 2, 6);
      c.fillRect(13, 9, 2, 6);
      c.fillStyle = '#9a6a3a';
      c.fillRect(0, 4, 16, 6);
      c.fillStyle = '#b8864f';
      c.fillRect(0, 4, 16, 1);
      c.fillStyle = '#9aa0a8';
      c.fillRect(3, 2, 4, 2);
      c.fillRect(10, 1, 1, 3);
      break;
    case 'stonecutterTable':
      c.fillStyle = '#5a3818';
      c.fillRect(1, 10, 2, 5);
      c.fillRect(13, 10, 2, 5);
      c.fillStyle = '#7d7c82';
      c.fillRect(0, 5, 16, 6);
      c.fillStyle = '#a3a2a9';
      c.fillRect(0, 5, 16, 1);
      c.fillRect(3, 2, 5, 3);
      c.fillStyle = '#c9ccd2';
      c.fillRect(10, 1, 2, 4);
      c.fillRect(9, 1, 4, 1);
      break;
    case 'table':
      c.fillStyle = '#5a3818';
      c.fillRect(2, 10, 2, 5);
      c.fillRect(12, 10, 2, 5);
      c.fillStyle = '#a0703c';
      c.fillRect(1, 3, 14, 8);
      c.fillStyle = '#b8864f';
      c.fillRect(1, 3, 14, 2);
      break;
    case 'chessTable': {
      // A small table with a checkered board.
      c.fillStyle = '#5a3818';
      c.fillRect(3, 11, 2, 4);
      c.fillRect(11, 11, 2, 4);
      c.fillStyle = '#8a5c30';
      c.fillRect(1, 2, 14, 10);
      for (let by = 0; by < 4; by++) {
        for (let bx = 0; bx < 4; bx++) {
          c.fillStyle = (bx + by) % 2 ? '#2a2420' : '#e8dcc0';
          c.fillRect(4 + bx * 2, 3 + by * 2, 2, 2);
        }
      }
      // Two pieces.
      c.fillStyle = '#f4f0e6';
      c.fillRect(5, 4, 1, 1);
      c.fillStyle = '#121010';
      c.fillRect(10, 9, 1, 1);
      break;
    }
    case 'cardTable':
      // A round green-baize table with cards on it.
      c.fillStyle = '#5a3818';
      c.fillRect(7, 12, 2, 3);
      c.fillStyle = '#6b4424';
      c.fillRect(2, 3, 12, 10);
      c.fillRect(3, 2, 10, 12);
      c.fillStyle = '#2f6b45';
      c.fillRect(3, 4, 10, 8);
      c.fillRect(4, 3, 8, 10);
      c.fillStyle = '#f2efe6';
      c.fillRect(5, 6, 2, 3);
      c.fillRect(9, 7, 2, 3);
      c.fillStyle = '#c0392b';
      c.fillRect(5, 7, 1, 1);
      c.fillRect(10, 8, 1, 1);
      break;
    case 'telescope':
      // A brass tube on a wooden tripod, pointing up at the sky.
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(3, 13, 10, 2);
      c.fillStyle = '#6b4424';
      c.fillRect(7, 8, 2, 6);
      c.fillRect(4, 12, 2, 2);
      c.fillRect(10, 12, 2, 2);
      c.fillRect(5, 11, 1, 1);
      c.fillRect(10, 11, 1, 1);
      c.fillStyle = '#c99a3a';
      c.fillRect(4, 6, 2, 2);
      c.fillRect(6, 5, 2, 2);
      c.fillRect(8, 4, 2, 2);
      c.fillRect(10, 3, 2, 2);
      c.fillStyle = '#e8c565';
      c.fillRect(12, 2, 2, 2);
      c.fillStyle = '#7fb3d9';
      c.fillRect(13, 2, 1, 1);
      break;
    case 'signalBeacon':
      // A lattice mast with a dish and a light at the top.
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(2, 14, 12, 2);
      c.fillStyle = '#5a5a64';
      c.fillRect(3, 12, 10, 3);
      c.fillStyle = '#9a9aa6';
      c.fillRect(7, 3, 2, 10);
      c.fillRect(5, 8, 6, 1);
      c.fillRect(6, 5, 4, 1);
      c.fillStyle = '#c8ccd6';
      c.fillRect(3, 4, 4, 3);
      c.fillRect(2, 5, 1, 1);
      c.fillStyle = '#7fe0ff';
      c.fillRect(7, 1, 2, 2);
      break;
    case 'torch':
      // A wooden post with a flame on top.
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(5, 14, 6, 1);
      c.fillStyle = '#5a3818';
      c.fillRect(7, 6, 2, 9);
      c.fillStyle = '#3a2414';
      c.fillRect(6, 5, 4, 2);
      c.fillStyle = '#ff7a2a';
      c.fillRect(6, 2, 4, 3);
      c.fillStyle = '#ffd166';
      c.fillRect(7, 1, 2, 3);
      c.fillStyle = '#fff4c0';
      c.fillRect(7, 3, 1, 1);
      break;
    case 'standingLamp':
      // A slim lamp with a warm shade.
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(4, 14, 8, 1);
      c.fillStyle = '#4a4a52';
      c.fillRect(5, 13, 6, 2);
      c.fillRect(7, 6, 2, 8);
      c.fillStyle = '#e8d29a';
      c.fillRect(4, 2, 8, 4);
      c.fillRect(5, 1, 6, 1);
      c.fillStyle = '#fff1c8';
      c.fillRect(5, 5, 6, 1);
      break;
    case 'grave':
      // A mound of earth with a wooden marker.
      c.fillStyle = '#5b4030';
      c.fillRect(3, 6, 10, 9);
      c.fillStyle = '#6e5038';
      c.fillRect(4, 7, 8, 7);
      c.fillStyle = '#7d5c40';
      c.fillRect(5, 8, 6, 2);
      c.fillStyle = '#8a6a44';
      c.fillRect(7, 1, 2, 6);
      c.fillRect(5, 2, 6, 2);
      c.fillStyle = '#a8865a';
      c.fillRect(7, 1, 1, 6);
      break;
    case 'memorial':
      // A rounded headstone with carved lines and a flower at its foot.
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(2, 13, 12, 2);
      c.fillStyle = '#8e8d93';
      c.fillRect(3, 4, 10, 10);
      c.fillRect(4, 3, 8, 1);
      c.fillRect(5, 2, 6, 1);
      c.fillStyle = '#b4b3b8';
      c.fillRect(4, 4, 8, 9);
      c.fillRect(5, 3, 6, 1);
      c.fillStyle = '#6e6d73';
      c.fillRect(6, 5, 4, 1);
      c.fillRect(5, 7, 6, 1);
      c.fillRect(5, 9, 6, 1);
      c.fillRect(6, 11, 4, 1);
      c.fillStyle = '#e85a8a';
      c.fillRect(12, 12, 2, 2);
      c.fillStyle = '#3f8a3a';
      c.fillRect(12, 14, 1, 1);
      break;
    case 'drum':
      // A hide drum on short legs.
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(3, 13, 10, 2);
      c.fillStyle = '#7a4a2a';
      c.fillRect(4, 6, 8, 7);
      c.fillStyle = '#9a6238';
      c.fillRect(4, 6, 8, 1);
      c.fillRect(4, 9, 8, 1);
      c.fillStyle = '#e6d6b0';
      c.fillRect(4, 4, 8, 2);
      c.fillRect(5, 3, 6, 1);
      c.fillStyle = '#5a3818';
      c.fillRect(5, 13, 1, 2);
      c.fillRect(10, 13, 1, 2);
      break;
    case 'flute':
      // A pale wooden flute held upright on the diagonal in a little stand, finger holes showing.
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(3, 14, 10, 1);
      c.fillStyle = '#5a3818';
      c.fillRect(3, 12, 6, 2);
      c.fillRect(5, 11, 2, 1);
      for (let k = 0; k < 10; k++) {
        c.fillStyle = '#7a5a34';
        c.fillRect(4 + k, 11 - k, 2, 2);
        c.fillStyle = '#ead7a6';
        c.fillRect(4 + k, 11 - k, 1, 1);
      }
      c.fillStyle = '#3a2414';
      for (const k of [3, 5, 7]) {
        c.fillRect(5 + k, 11 - k, 1, 1);
      }
      c.fillStyle = '#c99a3a';
      c.fillRect(13, 1, 2, 2);
      break;
    case 'lute':
      // A round-backed lute propped on its stand.
      c.fillStyle = '#5a3818';
      c.fillRect(7, 12, 2, 3);
      c.fillRect(5, 14, 6, 1);
      c.fillStyle = '#a8672e';
      c.fillRect(4, 7, 8, 6);
      c.fillRect(5, 6, 6, 8);
      c.fillStyle = '#3a2414';
      c.fillRect(7, 9, 2, 2);
      c.fillStyle = '#7a4a22';
      c.fillRect(7, 1, 2, 6);
      c.fillRect(6, 1, 4, 1);
      c.fillStyle = '#e8dcc0';
      c.fillRect(7, 6, 1, 6);
      c.fillRect(8, 6, 1, 6);
      break;
    case 'harp':
      // A tall frame harp, gilded.
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(3, 14, 10, 1);
      c.fillStyle = '#c99a3a';
      c.fillRect(3, 2, 2, 12);
      c.fillRect(3, 2, 9, 2);
      c.fillRect(11, 3, 2, 3);
      c.fillRect(4, 13, 9, 2);
      c.fillStyle = '#e8c565';
      c.fillRect(3, 2, 1, 12);
      c.fillStyle = '#f2efe6';
      for (const [k, sx] of [6, 8, 9, 11].entries()) {
        c.fillRect(sx, 4 + k, 1, 9 - k);
      }
      break;
    case 'sculptureSmall':
      // A carved wooden figure on a low plinth.
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(3, 13, 10, 2);
      c.fillStyle = '#6b4a2e';
      c.fillRect(4, 11, 8, 3);
      c.fillStyle = '#a8794a';
      c.fillRect(7, 3, 2, 2);
      c.fillRect(6, 5, 4, 4);
      c.fillRect(6, 9, 1, 2);
      c.fillRect(9, 9, 1, 2);
      c.fillRect(5, 6, 1, 2);
      c.fillRect(10, 5, 1, 2);
      c.fillStyle = '#c8955e';
      c.fillRect(7, 3, 1, 1);
      c.fillRect(6, 5, 1, 3);
      break;
    case 'sculptureLarge':
      // A granite figure, arms raised, on a square plinth.
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(2, 13, 12, 2);
      c.fillStyle = '#7d7c82';
      c.fillRect(3, 11, 10, 3);
      c.fillStyle = '#b4b3b8';
      c.fillRect(7, 1, 2, 2);
      c.fillRect(6, 3, 4, 5);
      c.fillRect(4, 2, 2, 1);
      c.fillRect(10, 2, 2, 1);
      c.fillRect(5, 3, 1, 2);
      c.fillRect(10, 3, 1, 2);
      c.fillRect(6, 8, 1, 3);
      c.fillRect(9, 8, 1, 3);
      c.fillStyle = '#d6d5da';
      c.fillRect(7, 1, 1, 1);
      c.fillRect(6, 3, 1, 4);
      break;
    case 'legendarySculpture':
      // A soaring figure in pale stone, wreathed in gold, on a broad stepped plinth.
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(1, 13, 14, 3);
      c.fillStyle = '#6f6e74';
      c.fillRect(1, 12, 14, 3);
      c.fillStyle = '#8f8e95';
      c.fillRect(3, 10, 10, 2);
      c.fillStyle = '#e4e2dc';
      c.fillRect(7, 0, 2, 2);
      c.fillRect(6, 2, 4, 5);
      c.fillRect(3, 1, 3, 1);
      c.fillRect(10, 1, 3, 1);
      c.fillRect(5, 7, 2, 3);
      c.fillRect(9, 7, 2, 3);
      c.fillStyle = '#e8b93a';
      c.fillRect(6, 4, 4, 1);
      c.fillRect(2, 0, 1, 2);
      c.fillRect(13, 0, 1, 2);
      c.fillRect(3, 10, 10, 1);
      c.fillStyle = '#fff1a8';
      c.fillRect(7, 4, 1, 1);
      break;
    case 'sculptureGrand':
      // Granite with silver inlay on a stepped base.
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(1, 13, 14, 2);
      c.fillStyle = '#6e6d73';
      c.fillRect(2, 12, 12, 2);
      c.fillStyle = '#8f8e94';
      c.fillRect(3, 10, 10, 2);
      c.fillStyle = '#c4c3c8';
      c.fillRect(6, 2, 4, 8);
      c.fillRect(5, 4, 6, 4);
      c.fillRect(7, 0, 2, 2);
      c.fillStyle = '#e8edf2';
      c.fillRect(7, 4, 2, 4);
      c.fillRect(6, 2, 1, 1);
      c.fillRect(9, 2, 1, 1);
      c.fillStyle = '#ffffff';
      c.fillRect(7, 5, 1, 1);
      break;
    case 'flowerPot':
      // A clay pot of flowers.
      c.fillStyle = '#9a4f2e';
      c.fillRect(5, 10, 6, 5);
      c.fillStyle = '#b8643c';
      c.fillRect(4, 9, 8, 2);
      c.fillStyle = '#3f8a3a';
      c.fillRect(7, 5, 1, 4);
      c.fillRect(5, 6, 1, 3);
      c.fillRect(10, 6, 1, 3);
      c.fillStyle = '#e85a8a';
      c.fillRect(6, 3, 3, 2);
      c.fillStyle = '#f2c94c';
      c.fillRect(4, 5, 2, 2);
      c.fillStyle = '#9b6bd6';
      c.fillRect(10, 4, 2, 2);
      break;
    case 'banner':
      // A pole with a hanging cloth banner.
      c.fillStyle = '#5a3818';
      c.fillRect(7, 1, 2, 14);
      c.fillRect(4, 1, 8, 1);
      c.fillStyle = '#2f5fa8';
      c.fillRect(4, 2, 8, 9);
      c.fillRect(5, 11, 2, 2);
      c.fillRect(9, 11, 2, 2);
      c.fillStyle = '#f2c94c';
      c.fillRect(7, 4, 2, 2);
      c.fillRect(6, 6, 4, 1);
      break;
    case 'armchair':
      c.fillStyle = '#7a2e3a';
      c.fillRect(2, 2, 12, 12);
      c.fillStyle = '#a3404f';
      c.fillRect(4, 5, 8, 8);
      c.fillStyle = '#5a1f28';
      c.fillRect(2, 2, 12, 2);
      c.fillRect(2, 4, 2, 10);
      c.fillRect(12, 4, 2, 10);
      break;
    case 'horseshoePin':
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(3, 12, 10, 2);
      c.fillStyle = '#8a8990';
      c.fillRect(7, 4, 2, 9);
      c.fillStyle = '#c0c0c8';
      c.fillRect(3, 10, 4, 1);
      c.fillRect(3, 8, 1, 2);
      c.fillRect(6, 8, 1, 2);
      c.fillRect(10, 11, 4, 1);
      c.fillRect(10, 9, 1, 2);
      c.fillRect(13, 9, 1, 2);
      break;
    case 'woodFloor':
      // Staggered planks.
      for (let y = 0; y < 16; y += 4) {
        c.fillStyle = (y / 4) % 2 ? '#9a7048' : '#a77a50';
        c.fillRect(0, y, 16, 4);
        c.fillStyle = '#7a5434';
        c.fillRect(0, y + 3, 16, 1);
        c.fillRect((y * 5) % 16, y, 1, 3);
      }
      break;
    case 'stoneTiles':
      c.fillStyle = '#a4a3a8';
      c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#8c8b91';
      c.fillRect(0, 7, 16, 1);
      c.fillRect(7, 0, 1, 16);
      c.fillRect(0, 15, 16, 1);
      c.fillRect(15, 0, 1, 16);
      c.fillStyle = '#b8b7bc';
      c.fillRect(1, 1, 5, 1);
      c.fillRect(9, 9, 5, 1);
      break;
    case 'carpet':
      c.fillStyle = '#8c3a3a';
      c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#a24848';
      c.fillRect(2, 2, 12, 12);
      c.fillStyle = '#d9b35a';
      c.fillRect(7, 4, 2, 8);
      c.fillRect(4, 7, 8, 2);
      break;
    case 'roof':
      // Drawn over the map, so mostly see-through: a faint shade with diagonal battens.
      c.fillStyle = 'rgba(25, 18, 12, 0.3)';
      c.fillRect(0, 0, 16, 16);
      c.fillStyle = 'rgba(200, 150, 95, 0.55)';
      for (let k = -16; k < 16; k += 6) {
        for (let t = 0; t < 16; t++) {
          c.fillRect(k + t, t, 1, 1);
        }
      }
      // A faint seam so neighbouring roof tiles read as one surface with a grain.
      c.fillStyle = 'rgba(25, 18, 12, 0.25)';
      c.fillRect(0, 15, 16, 1);
      break;
    case 'bridge':
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(0, 14, 16, 2);
      for (let x = 0; x < 16; x += 4) {
        c.fillStyle = x % 8 ? '#8a6038' : '#9b6d42';
        c.fillRect(x, 0, 3, 15);
        c.fillStyle = '#6b4423';
        c.fillRect(x + 3, 0, 1, 15);
      }
      c.fillStyle = '#5a3a1f';
      c.fillRect(0, 2, 16, 1);
      c.fillRect(0, 12, 16, 1);
      break;
    case 'fishingSpot':
      c.fillStyle = '#9b6d42';
      c.fillRect(2, 6, 12, 8);
      c.fillStyle = '#6b4423';
      c.fillRect(2, 9, 12, 1);
      c.fillRect(2, 13, 12, 1);
      c.fillStyle = '#4a2e18';
      c.fillRect(3, 1, 1, 6);
      c.fillStyle = '#d8d8de';
      c.fillRect(4, 1, 8, 1);
      c.fillRect(12, 1, 1, 4);
      c.fillStyle = '#ff5c5c';
      c.fillRect(12, 5, 1, 1);
      break;
    case 'embrasure':
      // A block wall with a dark slit to shoot through.
      c.fillStyle = '#8a8990';
      c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#a4a3aa';
      c.fillRect(0, 0, 16, 2);
      c.fillRect(0, 8, 16, 1);
      c.fillStyle = '#1c1c22';
      c.fillRect(6, 3, 4, 10);
      c.fillStyle = '#3a3a42';
      c.fillRect(6, 3, 4, 1);
      break;
    case 'spikeTrap':
      c.fillStyle = 'rgba(70, 50, 30, 0.45)';
      c.fillRect(2, 2, 12, 12);
      c.fillStyle = '#c9ced4';
      for (const [x, y] of [
        [4, 5],
        [8, 4],
        [11, 7],
        [5, 10],
        [9, 10],
      ]) {
        c.fillRect(x, y, 1, 2);
        c.fillRect(x, y - 1, 1, 1);
      }
      break;
    case 'sandbags':
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(1, 12, 14, 3);
      for (const [x, y] of [
        [1, 8],
        [6, 8],
        [11, 8],
        [3, 4],
        [8, 4],
      ]) {
        c.fillStyle = '#a89068';
        c.fillRect(x, y, 5, 4);
        c.fillStyle = '#c4ab7f';
        c.fillRect(x, y, 5, 1);
        c.fillStyle = '#7d6a4a';
        c.fillRect(x + 4, y + 1, 1, 3);
      }
      break;
    case 'researchBench':
      c.fillStyle = '#5a3818';
      c.fillRect(1, 9, 2, 6);
      c.fillRect(13, 9, 2, 6);
      c.fillStyle = '#8d5d31';
      c.fillRect(0, 4, 16, 6);
      c.fillStyle = '#e8e4da';
      c.fillRect(2, 2, 5, 4);
      c.fillStyle = '#5c86b8';
      c.fillRect(9, 1, 2, 4);
      c.fillStyle = '#c94040';
      c.fillRect(11, 2, 2, 3);
      break;
    case 'hearth':
      c.fillStyle = '#5c5b60';
      c.fillRect(1, 2, 14, 13);
      c.fillStyle = '#8a8990';
      c.fillRect(1, 2, 14, 2);
      c.fillRect(1, 2, 2, 13);
      c.fillRect(13, 2, 2, 13);
      c.fillStyle = '#2a1a10';
      c.fillRect(4, 6, 8, 8);
      c.fillStyle = '#ff6b2d';
      c.fillRect(5, 9, 6, 5);
      c.fillStyle = '#ffd166';
      c.fillRect(6, 11, 4, 3);
      break;
    case 'fineBed':
      c.fillStyle = '#4a2f16';
      c.fillRect(1, 1, 14, 14);
      c.fillStyle = '#f4f1e8';
      c.fillRect(2, 2, 12, 3);
      c.fillStyle = '#7a2e3a';
      c.fillRect(2, 6, 12, 8);
      c.fillStyle = '#a3404f';
      c.fillRect(2, 6, 12, 2);
      c.fillStyle = '#e8c35a';
      c.fillRect(2, 10, 12, 1);
      break;
    case 'woodGenerator':
      c.fillStyle = '#3c3b40';
      c.fillRect(1, 3, 14, 12);
      c.fillStyle = '#6d6c73';
      c.fillRect(1, 3, 14, 2);
      c.fillStyle = '#2a1a10';
      c.fillRect(3, 7, 5, 6);
      c.fillStyle = '#ff8a3d';
      c.fillRect(4, 10, 3, 3);
      c.fillStyle = '#ffd166';
      c.fillRect(10, 7, 3, 5);
      c.fillStyle = '#1e1d21';
      c.fillRect(11, 0, 2, 3);
      break;
    case 'solarPanel':
      c.fillStyle = '#5c5b60';
      c.fillRect(7, 12, 2, 3);
      c.fillStyle = '#1f3d6b';
      c.fillRect(1, 2, 14, 10);
      c.fillStyle = '#3f6fb5';
      for (let y = 3; y < 11; y += 3) {
        for (let x = 2; x < 14; x += 4) {
          c.fillRect(x, y, 3, 2);
        }
      }
      break;
    case 'battery':
      c.fillStyle = '#4a4a52';
      c.fillRect(2, 3, 12, 12);
      c.fillStyle = '#6d6c73';
      c.fillRect(5, 1, 2, 2);
      c.fillRect(9, 1, 2, 2);
      c.fillStyle = '#8fe36b';
      c.fillRect(4, 6, 8, 2);
      c.fillRect(4, 9, 8, 2);
      c.fillStyle = '#2e2e34';
      c.fillRect(4, 12, 8, 1);
      break;
    case 'electricHeater':
      c.fillStyle = '#6d6c73';
      c.fillRect(2, 2, 12, 12);
      c.fillStyle = '#ff6b2d';
      for (let y = 4; y < 13; y += 3) {
        c.fillRect(4, y, 8, 1);
      }
      c.fillStyle = '#ffd166';
      c.fillRect(12, 3, 1, 1);
      break;
    case 'airConditioner':
    case 'freezer':
      c.fillStyle = key === 'freezer' ? '#cfe3ff' : '#d8d8de';
      c.fillRect(2, 2, 12, 12);
      c.fillStyle = key === 'freezer' ? '#5585cc' : '#7fa8e0';
      for (let x = 4; x < 13; x += 2) {
        c.fillRect(x, 4, 1, 8);
      }
      c.fillStyle = '#2e2e34';
      c.fillRect(2, 13, 12, 1);
      break;
    case 'shelf':
      // Three wooden boards on uprights, seen from above.
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(2, 2, 13, 13);
      c.fillStyle = '#5c3d22';
      c.fillRect(1, 1, 2, 14);
      c.fillRect(13, 1, 2, 14);
      c.fillStyle = '#9a6b3e';
      for (const y of [2, 7, 12]) {
        c.fillRect(1, y, 14, 2);
      }
      c.fillStyle = '#b8854f';
      for (const y of [2, 7, 12]) {
        c.fillRect(1, y, 14, 1);
      }
      break;
    case 'icebox':
      c.fillStyle = '#9ad1ff';
      c.fillRect(1, 1, 14, 14);
      c.fillStyle = '#cfe8ff';
      c.fillRect(2, 2, 12, 2);
      c.fillStyle = '#5585cc';
      c.fillRect(1, 1, 14, 1);
      c.fillRect(1, 14, 14, 1);
      c.fillRect(7, 5, 2, 8);
      c.fillRect(4, 8, 8, 2);
      break;
    case 'sunLamp':
      c.fillStyle = '#5c5b60';
      c.fillRect(7, 7, 2, 8);
      c.fillRect(5, 14, 6, 1);
      c.fillStyle = '#ffe680';
      c.fillRect(4, 2, 8, 5);
      c.fillStyle = '#fff6c0';
      c.fillRect(5, 3, 6, 3);
      break;
    case 'campfire':
      c.fillStyle = '#5c5b60';
      [
        [3, 11],
        [6, 13],
        [10, 13],
        [12, 11],
        [3, 8],
        [12, 8],
      ].forEach(([x, y]) => c.fillRect(x, y, 2, 2));
      c.fillStyle = '#5a3818';
      c.fillRect(5, 10, 6, 2);
      c.fillStyle = '#ff6b2d';
      c.fillRect(5, 5, 6, 5);
      c.fillStyle = '#ffb347';
      c.fillRect(6, 3, 4, 6);
      c.fillStyle = '#fff1a8';
      c.fillRect(7, 6, 2, 3);
      break;
  }
}

function drawCrop(c: Ctx, key: string, stage: number): void {
  if (key === 'poplarPlant') {
    // Young poplars in rows: whips at first, slim trees by the time they're ready to cut.
    c.fillStyle = 'rgba(70, 45, 25, 0.5)';
    c.fillRect(1, 2, 14, 12);
    for (const x of [3, 8, 13]) {
      const h = 3 + stage * 3;
      c.fillStyle = '#6a4626';
      c.fillRect(x, 14 - h, 1, h);
      c.fillStyle = stage === 2 ? '#3f7a34' : '#5a9a44';
      c.fillRect(x - 1, 14 - h - 1, 3, Math.max(2, h - 2));
    }
    return;
  }
  const leaf =
    key === 'potatoPlant'
      ? '#4f9a3a'
      : key === 'healrootPlant'
        ? '#3f8f6a'
        : key === 'grainPlant'
          ? '#8fa64a'
          : '#6d8f4a';
  const fruit =
    key === 'potatoPlant'
      ? '#d6b25e'
      : key === 'healrootPlant'
        ? '#e8f0a0'
        : key === 'grainPlant'
          ? '#e6c35a'
          : '#f4f1e8';
  const spots: [number, number][] = [
    [3, 4],
    [10, 4],
    [6, 10],
    [12, 11],
    [2, 11],
  ];
  c.fillStyle = 'rgba(70, 45, 25, 0.5)';
  c.fillRect(1, 2, 14, 12);
  for (const [x, y] of spots) {
    const size = stage + 1;
    c.fillStyle = leaf;
    c.fillRect(x, y + 2 - size, 2, size + 1);
    if (stage > 0) {
      c.fillRect(x - 1, y + 1 - size, 4, 1);
    }
    if (stage === 2) {
      c.fillStyle = fruit;
      c.fillRect(x, y - 2, 2, 2);
    }
  }
}

function drawDesignation(c: Ctx, color: string, cross: boolean): void {
  c.fillStyle = color;
  const l = 4;
  c.fillRect(0, 0, l, 1);
  c.fillRect(0, 0, 1, l);
  c.fillRect(TILE - l, 0, l, 1);
  c.fillRect(TILE - 1, 0, 1, l);
  c.fillRect(0, TILE - 1, l, 1);
  c.fillRect(0, TILE - l, 1, l);
  c.fillRect(TILE - l, TILE - 1, l, 1);
  c.fillRect(TILE - 1, TILE - l, 1, l);
  if (cross) {
    for (let i = 4; i < 12; i++) {
      c.fillRect(i, i, 1, 1);
      c.fillRect(TILE - 1 - i, i, 1, 1);
    }
  } else {
    c.fillRect(7, 7, 2, 2);
  }
}

// Simple side-on animals, facing right.
function createAnimalTextures(scene: Phaser.Scene): void {
  const draw = (key: string, paint: (c: Ctx) => void) => {
    const texture = scene.textures.createCanvas(`animal-${key}`, TILE, TILE)!;
    const ctx = texture.getContext();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(3, 13, 10, 2);
    paint(ctx);
    texture.refresh();
  };
  draw('deer', (c) => {
    c.fillStyle = '#a0703c';
    c.fillRect(3, 6, 8, 4);
    c.fillRect(10, 3, 3, 4);
    c.fillStyle = '#7a5028';
    c.fillRect(4, 10, 1, 4);
    c.fillRect(9, 10, 1, 4);
    c.fillStyle = '#e8d8c0';
    c.fillRect(2, 6, 1, 2);
    c.fillStyle = '#5a3818';
    c.fillRect(10, 1, 1, 2);
    c.fillRect(12, 1, 1, 2);
    c.fillStyle = '#222';
    c.fillRect(12, 4, 1, 1);
  });
  draw('hare', (c) => {
    c.fillStyle = '#b8a890';
    c.fillRect(5, 9, 6, 4);
    c.fillRect(10, 7, 3, 3);
    c.fillRect(10, 4, 1, 3);
    c.fillRect(12, 4, 1, 3);
    c.fillStyle = '#f0e8e0';
    c.fillRect(4, 10, 1, 2);
    c.fillStyle = '#222';
    c.fillRect(12, 8, 1, 1);
  });
  draw('wolf', (c) => {
    c.fillStyle = '#7d7f86';
    c.fillRect(2, 7, 9, 4);
    c.fillRect(10, 5, 4, 4);
    c.fillStyle = '#5b5d63';
    c.fillRect(11, 3, 1, 2);
    c.fillRect(13, 3, 1, 2);
    c.fillRect(1, 6, 2, 2);
    c.fillRect(3, 11, 1, 3);
    c.fillRect(9, 11, 1, 3);
    c.fillStyle = '#d8d8dc';
    c.fillRect(12, 8, 2, 1);
    c.fillStyle = '#ffd166';
    c.fillRect(12, 6, 1, 1);
  });
  draw('fox', (c) => {
    c.fillStyle = '#d0702c';
    c.fillRect(4, 8, 7, 3);
    c.fillRect(10, 6, 3, 3);
    c.fillRect(1, 7, 3, 2);
    c.fillStyle = '#f2ece2';
    c.fillRect(1, 7, 1, 1);
    c.fillRect(11, 9, 2, 1);
    c.fillStyle = '#3a2418';
    c.fillRect(10, 5, 1, 1);
    c.fillRect(12, 5, 1, 1);
    c.fillRect(5, 11, 1, 3);
    c.fillRect(9, 11, 1, 3);
    c.fillStyle = '#222';
    c.fillRect(12, 7, 1, 1);
  });
  draw('muskox', (c) => {
    c.fillStyle = '#4e3a2c';
    c.fillRect(1, 5, 11, 7);
    c.fillRect(11, 7, 3, 4);
    c.fillStyle = '#3a2a1f';
    c.fillRect(1, 11, 11, 1);
    c.fillRect(2, 12, 1, 2);
    c.fillRect(10, 12, 1, 2);
    c.fillStyle = '#d8ccb0';
    c.fillRect(11, 6, 3, 1);
    c.fillRect(13, 7, 1, 2);
    c.fillStyle = '#111';
    c.fillRect(12, 8, 1, 1);
  });
  draw('grouse', (c) => {
    c.fillStyle = '#8a6a48';
    c.fillRect(5, 8, 6, 4);
    c.fillRect(9, 6, 3, 3);
    c.fillStyle = '#5e4630';
    c.fillRect(3, 8, 2, 2);
    c.fillRect(6, 9, 3, 1);
    c.fillStyle = '#d23c2c';
    c.fillRect(10, 5, 1, 1);
    c.fillStyle = '#e0a040';
    c.fillRect(12, 7, 1, 1);
    c.fillStyle = '#222';
    c.fillRect(10, 7, 1, 1);
    c.fillStyle = '#c08040';
    c.fillRect(7, 12, 1, 2);
    c.fillRect(9, 12, 1, 2);
  });
  draw('crawler', (c) => {
    // Pale, segmented and many-legged.
    c.fillStyle = '#3a3440';
    for (const x of [3, 5, 7, 9, 11]) {
      c.fillRect(x, 12, 1, 2);
      c.fillRect(x - 1, 7, 1, 1);
    }
    c.fillStyle = '#b8b0a4';
    c.fillRect(2, 8, 10, 4);
    c.fillRect(11, 7, 3, 4);
    c.fillStyle = '#8a8276';
    for (const x of [4, 7, 10]) {
      c.fillRect(x, 8, 1, 4);
    }
    c.fillStyle = '#d8f0a0';
    c.fillRect(13, 8, 1, 1);
    c.fillRect(12, 8, 1, 1);
    c.fillStyle = '#5a5248';
    c.fillRect(14, 10, 1, 2);
  });
  draw('boar', (c) => {
    c.fillStyle = '#4a3a34';
    c.fillRect(2, 7, 10, 5);
    c.fillRect(11, 8, 3, 3);
    c.fillStyle = '#2e2420';
    c.fillRect(3, 6, 7, 1);
    c.fillRect(3, 12, 1, 2);
    c.fillRect(10, 12, 1, 2);
    c.fillStyle = '#f0e8d0';
    c.fillRect(13, 10, 1, 1);
    c.fillStyle = '#ff5c5c';
    c.fillRect(12, 8, 1, 1);
  });
}

function drawItem(c: Ctx, key: string): void {
  switch (key) {
    case 'wood':
      c.fillStyle = '#5a3818';
      c.fillRect(2, 9, 12, 3);
      c.fillRect(3, 6, 10, 3);
      c.fillStyle = '#9a6a3a';
      c.fillRect(2, 9, 11, 2);
      c.fillRect(3, 6, 9, 2);
      c.fillStyle = '#d9b07a';
      c.fillRect(13, 9, 1, 2);
      c.fillRect(12, 6, 1, 2);
      break;
    case 'stone':
      c.fillStyle = '#5c5b60';
      c.fillRect(3, 8, 5, 4);
      c.fillRect(8, 6, 5, 6);
      c.fillStyle = '#8a8990';
      c.fillRect(3, 8, 4, 1);
      c.fillRect(8, 6, 4, 1);
      break;
    case 'toolKit':
      // A hammer across a saw.
      c.fillStyle = '#b7bcc2';
      c.fillRect(2, 10, 10, 3);
      c.fillStyle = '#8c9197';
      for (let x = 2; x < 12; x += 2) {
        c.fillRect(x, 13, 1, 1);
      }
      c.fillStyle = '#7a5434';
      c.fillRect(12, 10, 3, 3);
      c.fillRect(7, 3, 2, 8);
      c.fillStyle = '#6f757c';
      c.fillRect(5, 2, 6, 3);
      break;
    case 'wool':
      c.fillStyle = '#e6e0d2';
      c.fillRect(3, 7, 10, 6);
      c.fillRect(5, 5, 6, 2);
      c.fillStyle = '#c9c1b0';
      c.fillRect(4, 9, 2, 2);
      c.fillRect(9, 8, 2, 2);
      c.fillRect(7, 11, 2, 1);
      break;
    case 'egg':
      c.fillStyle = '#efe6d2';
      c.fillRect(6, 5, 4, 8);
      c.fillRect(5, 7, 6, 5);
      c.fillStyle = '#c9b48a';
      c.fillRect(7, 8, 1, 1);
      c.fillRect(9, 10, 1, 1);
      break;
    case 'grain':
      // A bundle of golden stalks.
      c.fillStyle = '#b08a3a';
      c.fillRect(5, 6, 1, 8);
      c.fillRect(7, 5, 1, 9);
      c.fillRect(9, 6, 1, 8);
      c.fillStyle = '#e6c35a';
      c.fillRect(4, 3, 3, 4);
      c.fillRect(7, 2, 2, 4);
      c.fillRect(9, 3, 3, 4);
      c.fillStyle = '#7a5434';
      c.fillRect(4, 10, 7, 1);
      break;
    case 'flour':
      // A tied sack, dusted white.
      c.fillStyle = '#d8d0bc';
      c.fillRect(4, 6, 8, 8);
      c.fillRect(5, 4, 6, 2);
      c.fillStyle = '#b8ae96';
      c.fillRect(6, 4, 4, 1);
      c.fillRect(4, 13, 8, 1);
      c.fillStyle = '#f6f2e8';
      c.fillRect(5, 7, 3, 2);
      break;
    case 'bread':
      c.fillStyle = '#9c5e2a';
      c.fillRect(3, 7, 10, 6);
      c.fillRect(4, 6, 8, 1);
      c.fillStyle = '#c8873e';
      c.fillRect(4, 7, 8, 2);
      c.fillStyle = '#e8b870';
      c.fillRect(5, 8, 1, 3);
      c.fillRect(8, 8, 1, 3);
      c.fillRect(11, 8, 1, 3);
      break;
    case 'driedMeat':
      c.fillStyle = '#6a2e22';
      c.fillRect(3, 5, 3, 9);
      c.fillRect(7, 4, 3, 10);
      c.fillRect(11, 6, 3, 8);
      c.fillStyle = '#8a4434';
      c.fillRect(3, 5, 1, 9);
      c.fillRect(7, 4, 1, 10);
      c.fillRect(11, 6, 1, 8);
      break;
    case 'driedBerries':
      c.fillStyle = '#5a2438';
      [
        [4, 8],
        [7, 6],
        [10, 9],
        [6, 11],
        [9, 12],
      ].forEach(([x, y]) => c.fillRect(x, y, 2, 2));
      c.fillStyle = '#7a3a52';
      c.fillRect(7, 6, 1, 1);
      c.fillRect(10, 9, 1, 1);
      break;
    case 'clay':
      c.fillStyle = '#9c5a3c';
      c.fillRect(3, 8, 10, 5);
      c.fillRect(5, 6, 6, 2);
      c.fillStyle = '#b8714f';
      c.fillRect(5, 6, 4, 1);
      c.fillRect(3, 8, 3, 1);
      break;
    case 'bricks':
      c.fillStyle = '#8a4430';
      c.fillRect(2, 10, 6, 3);
      c.fillRect(8, 10, 6, 3);
      c.fillRect(5, 6, 6, 3);
      c.fillStyle = '#c06a4a';
      c.fillRect(2, 10, 6, 1);
      c.fillRect(8, 10, 6, 1);
      c.fillRect(5, 6, 6, 1);
      break;
    case 'ironOre':
      c.fillStyle = '#5c5b60';
      c.fillRect(3, 8, 5, 4);
      c.fillRect(8, 6, 5, 6);
      c.fillStyle = '#b0602e';
      c.fillRect(4, 9, 2, 1);
      c.fillRect(9, 8, 3, 2);
      c.fillRect(6, 11, 1, 1);
      break;
    case 'iron':
      // Two dark bars.
      c.fillStyle = '#4a4c52';
      c.fillRect(2, 9, 12, 4);
      c.fillStyle = '#7a7e86';
      c.fillRect(3, 7, 10, 3);
      c.fillStyle = '#a4a8b0';
      c.fillRect(4, 7, 5, 1);
      break;
    case 'ironSword':
      c.fillStyle = '#c4c8d0';
      c.fillRect(7, 1, 2, 10);
      c.fillStyle = '#e8ecf2';
      c.fillRect(7, 1, 1, 9);
      c.fillStyle = '#6a6e76';
      c.fillRect(4, 11, 8, 1);
      c.fillStyle = '#7a5434';
      c.fillRect(7, 12, 2, 3);
      break;
    case 'ironMail':
      c.fillStyle = '#6a6e76';
      c.fillRect(3, 3, 10, 11);
      c.fillRect(1, 4, 2, 5);
      c.fillRect(13, 4, 2, 5);
      c.fillStyle = '#9ca0a8';
      for (let y = 4; y < 14; y += 2) {
        for (let x = 3 + (y % 4 ? 1 : 0); x < 13; x += 2) {
          c.fillRect(x, y, 1, 1);
        }
      }
      c.fillStyle = '#3a3c42';
      c.fillRect(6, 3, 4, 2);
      break;
    case 'stoneBlocks':
      c.fillStyle = '#8a8990';
      c.fillRect(2, 9, 6, 4);
      c.fillRect(8, 9, 6, 4);
      c.fillRect(5, 5, 6, 4);
      c.fillStyle = '#b4b3ba';
      c.fillRect(2, 9, 6, 1);
      c.fillRect(8, 9, 6, 1);
      c.fillRect(5, 5, 6, 1);
      break;
    case 'silver':
      c.fillStyle = '#9aa3ad';
      c.fillRect(3, 9, 10, 4);
      c.fillStyle = '#d8dee5';
      c.fillRect(4, 7, 8, 3);
      c.fillStyle = '#f2f5f8';
      c.fillRect(5, 7, 3, 1);
      break;
    case 'potatoes':
      c.fillStyle = '#a07a3a';
      [
        [3, 9],
        [7, 8],
        [10, 10],
        [5, 11],
      ].forEach(([x, y]) => c.fillRect(x, y, 4, 3));
      c.fillStyle = '#c9a25a';
      [
        [4, 9],
        [8, 8],
        [11, 10],
      ].forEach(([x, y]) => c.fillRect(x, y, 2, 1));
      break;
    case 'meal':
      c.fillStyle = '#e8e4da';
      c.fillRect(2, 8, 12, 5);
      c.fillStyle = '#c3bfb4';
      c.fillRect(3, 12, 10, 1);
      c.fillStyle = '#c96a2e';
      c.fillRect(4, 7, 8, 3);
      c.fillStyle = '#7fb347';
      c.fillRect(6, 7, 2, 1);
      break;
    case 'cotton':
      c.fillStyle = '#f4f1e8';
      [
        [3, 8],
        [7, 6],
        [10, 9],
        [6, 10],
      ].forEach(([x, y]) => c.fillRect(x, y, 4, 4));
      break;
    case 'rawMeat':
      c.fillStyle = '#8f2f3a';
      c.fillRect(3, 7, 10, 6);
      c.fillStyle = '#c4505f';
      c.fillRect(4, 8, 7, 3);
      c.fillStyle = '#f0e0d0';
      c.fillRect(11, 9, 3, 2);
      break;
    case 'fineMeal':
      c.fillStyle = '#e8e2d0';
      c.fillRect(2, 8, 12, 5);
      c.fillStyle = '#c9c1a8';
      c.fillRect(2, 12, 12, 1);
      c.fillStyle = '#c4503a';
      c.fillRect(4, 6, 4, 3);
      c.fillStyle = '#7fbf5a';
      c.fillRect(8, 6, 3, 3);
      c.fillStyle = '#e8b04a';
      c.fillRect(10, 7, 2, 2);
      break;
    case 'tunic':
    case 'parka': {
      const parka = key === 'parka';
      c.fillStyle = parka ? '#8a5a32' : '#5d7fa8';
      c.fillRect(4, 3, 8, 11);
      c.fillRect(1, 4, 3, 7);
      c.fillRect(12, 4, 3, 7);
      c.fillStyle = parka ? '#e8dcc0' : '#41618a';
      c.fillRect(5, 2, 6, 2);
      if (parka) {
        c.fillRect(1, 10, 3, 1);
        c.fillRect(12, 10, 3, 1);
        c.fillRect(4, 13, 8, 1);
      }
      break;
    }
    case 'rawFish':
      c.fillStyle = '#6f8fa8';
      c.fillRect(3, 8, 8, 4);
      c.fillRect(2, 9, 1, 2);
      c.fillStyle = '#9cb8cc';
      c.fillRect(4, 8, 6, 1);
      c.fillStyle = '#56738a';
      c.fillRect(11, 7, 1, 2);
      c.fillRect(11, 11, 1, 2);
      c.fillRect(12, 6, 1, 8);
      c.fillStyle = '#1e1d21';
      c.fillRect(4, 9, 1, 1);
      break;
    case 'leather':
      c.fillStyle = '#7a4e2a';
      c.fillRect(2, 6, 12, 7);
      c.fillRect(1, 7, 1, 4);
      c.fillRect(14, 8, 1, 3);
      c.fillStyle = '#9a6a3a';
      c.fillRect(3, 7, 10, 2);
      break;
    case 'shortBow':
      c.fillStyle = '#8a6038';
      c.fillRect(5, 3, 2, 10);
      c.fillRect(6, 2, 2, 1);
      c.fillRect(6, 13, 2, 1);
      c.fillStyle = '#e8e4da';
      c.fillRect(8, 2, 1, 12);
      break;
    case 'longbow':
      c.fillStyle = '#7a5434';
      c.fillRect(5, 1, 2, 14);
      c.fillRect(6, 0, 2, 1);
      c.fillRect(6, 15, 2, 1);
      c.fillStyle = '#e8e4da';
      c.fillRect(9, 0, 1, 16);
      break;
    case 'crossbow':
      c.fillStyle = '#6b4423';
      c.fillRect(7, 3, 2, 11);
      c.fillStyle = '#9aa0a6';
      c.fillRect(2, 5, 12, 2);
      c.fillStyle = '#e8e4da';
      c.fillRect(2, 7, 1, 2);
      c.fillRect(13, 7, 1, 2);
      c.fillRect(3, 9, 10, 1);
      break;
    case 'knife':
      c.fillStyle = '#c9ced4';
      c.fillRect(7, 2, 2, 8);
      c.fillRect(8, 1, 1, 1);
      c.fillStyle = '#5a3a1f';
      c.fillRect(6, 10, 4, 1);
      c.fillRect(7, 11, 2, 4);
      break;
    case 'club':
      c.fillStyle = '#7a5434';
      c.fillRect(7, 6, 2, 9);
      c.fillStyle = '#8a6038';
      c.fillRect(5, 1, 6, 6);
      c.fillStyle = '#6b4423';
      c.fillRect(6, 2, 1, 1);
      c.fillRect(9, 4, 1, 1);
      break;
    case 'spear':
      c.fillStyle = '#7a5434';
      c.fillRect(7, 4, 2, 12);
      c.fillStyle = '#8c8b91';
      c.fillRect(6, 1, 4, 4);
      c.fillRect(7, 0, 2, 1);
      break;
    case 'leatherArmor':
      c.fillStyle = '#8a5a34';
      c.fillRect(3, 3, 10, 10);
      c.fillRect(1, 3, 2, 4);
      c.fillRect(13, 3, 2, 4);
      c.fillStyle = '#6b4423';
      c.fillRect(6, 3, 4, 2);
      c.fillRect(3, 8, 10, 1);
      break;
    case 'scaleArmor':
      c.fillStyle = '#8c8b91';
      c.fillRect(3, 3, 10, 10);
      c.fillRect(1, 3, 2, 4);
      c.fillRect(13, 3, 2, 4);
      c.fillStyle = '#b4b3ba';
      for (let y = 4; y < 13; y += 3) {
        for (let x = 3 + ((y / 3) % 2); x < 13; x += 3) {
          c.fillRect(x, y, 2, 1);
        }
      }
      c.fillStyle = '#6b6a70';
      c.fillRect(6, 3, 4, 2);
      break;
    case 'recurveBow':
      c.fillStyle = '#6b4423';
      c.fillRect(4, 2, 2, 2);
      c.fillRect(3, 4, 2, 8);
      c.fillRect(4, 12, 2, 2);
      c.fillRect(6, 1, 2, 1);
      c.fillRect(6, 14, 2, 1);
      c.fillStyle = '#e8e4da';
      c.fillRect(8, 1, 1, 14);
      break;
    case 'herbalMedicine':
      c.fillStyle = '#e8e4da';
      c.fillRect(3, 6, 10, 8);
      c.fillStyle = '#c3bfb4';
      c.fillRect(3, 13, 10, 1);
      c.fillStyle = '#3f8f6a';
      c.fillRect(7, 7, 2, 6);
      c.fillRect(5, 9, 6, 2);
      break;
    case 'cloth':
      c.fillStyle = '#5c86b8';
      c.fillRect(2, 7, 12, 6);
      c.fillStyle = '#7aa3d4';
      c.fillRect(2, 7, 12, 2);
      c.fillStyle = '#41658f';
      c.fillRect(2, 11, 12, 1);
      break;
    case 'berries':
      c.fillStyle = '#8a5a2e';
      c.fillRect(3, 10, 10, 3);
      c.fillStyle = '#d43a5a';
      [
        [4, 8],
        [6, 7],
        [8, 8],
        [10, 7],
        [5, 9],
        [9, 9],
        [11, 9],
      ].forEach(([x, y]) => c.fillRect(x, y, 2, 2));
      break;
  }
}

function createPawnTextures(scene: Phaser.Scene): void {
  createAnimalTextures(scene);

  // Raiders: a hooded head over the same tintable body.
  const hood = scene.textures.createCanvas('raider-head', TILE, TILE)!;
  const r = hood.getContext();
  r.fillStyle = '#4a3a34';
  r.fillRect(4, 1, 8, 6);
  r.fillStyle = '#d8b48c';
  r.fillRect(6, 3, 4, 3);
  r.fillStyle = '#ff5c5c';
  r.fillRect(6, 4, 1, 1);
  r.fillRect(9, 4, 1, 1);
  hood.refresh();

  const body = scene.textures.createCanvas('pawn-body', TILE, TILE)!;
  const b = body.getContext();
  b.fillStyle = '#ffffff';
  b.fillRect(5, 7, 6, 6);
  b.fillRect(4, 8, 8, 4);
  b.fillStyle = '#d0d0d0';
  b.fillRect(5, 12, 6, 1);
  body.refresh();

  const head = scene.textures.createCanvas('pawn-head', TILE, TILE)!;
  const h = head.getContext();
  h.fillStyle = '#f1c9a0';
  h.fillRect(5, 2, 6, 5);
  h.fillStyle = '#4a3020';
  h.fillRect(5, 1, 6, 2);
  h.fillRect(5, 1, 1, 4);
  h.fillStyle = '#222';
  h.fillRect(7, 4, 1, 1);
  h.fillRect(9, 4, 1, 1);
  head.refresh();

  // The ship that answers the beacon: a stubby lander on its legs, 32 pixels across.
  const ship = scene.textures.createCanvas('ship', TILE * 2, TILE * 2)!;
  const s = ship.getContext();
  s.fillStyle = 'rgba(0,0,0,0.3)';
  s.fillRect(4, 27, 24, 4);
  s.fillStyle = '#4a4e5a';
  s.fillRect(5, 22, 2, 7);
  s.fillRect(25, 22, 2, 7);
  s.fillRect(3, 28, 6, 1);
  s.fillRect(23, 28, 6, 1);
  s.fillStyle = '#c8ccd6';
  s.fillRect(8, 8, 16, 16);
  s.fillRect(10, 5, 12, 3);
  s.fillRect(13, 2, 6, 3);
  s.fillStyle = '#e8ecf2';
  s.fillRect(9, 9, 6, 13);
  s.fillStyle = '#7fe0ff';
  s.fillRect(13, 10, 6, 4);
  s.fillStyle = '#d94b4b';
  s.fillRect(8, 18, 16, 2);
  s.fillStyle = '#5a5e6a';
  s.fillRect(14, 20, 4, 4);
  s.fillStyle = '#ffb060';
  s.fillRect(12, 24, 8, 2);
  ship.refresh();

  // Shadow and feet, apart from the rest so they can stride: standing, then each foot forward.
  for (const [frame, left, right] of [
    [0, 13, 13],
    [1, 12, 14],
    [2, 14, 12],
  ]) {
    const legs = scene.textures.createCanvas(`pawn-legs-${frame}`, TILE, TILE)!;
    const l = legs.getContext();
    l.fillStyle = 'rgba(0,0,0,0.3)';
    l.fillRect(4, 14, 8, 2);
    l.fillStyle = '#3a3a48';
    l.fillRect(5, left, 2, 15 - left);
    l.fillRect(9, right, 2, 15 - right);
    legs.refresh();
  }
}
