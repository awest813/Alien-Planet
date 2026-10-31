import Phaser from 'phaser';
import { FEATURES, ITEMS, TERRAIN } from '../sim/defs';
import { hash2 } from '../sim/rng';

export const TILE = 16;
export const TILESET_KEY = 'tiles';
const COLUMNS = 16;
// Room for 48 buildings, 48 blueprints and 32 items before the layout needs to grow again.
const ROWS = 13;
const MAX_FEATURES = 48;
const MAX_ITEMS = 32;

const CROPS = FEATURES.filter((f) => f.crop);

if (FEATURES.length > MAX_FEATURES || ITEMS.length > MAX_ITEMS) {
  throw new Error('Too many features or items for the tileset layout');
}

// Frame indices in the generated tileset.
export const Frames = {
  terrain: (terrain: number, variant: number) => terrain * 2 + variant,
  feature: (feature: number) => 16 + feature - 1,
  blueprint: (feature: number) => 64 + feature - 1,
  designation: (designation: number) => 112 + designation,
  item: (item: number) => 128 + item - 1,
  ZONE: 160,
  INDOOR: 161,
  GROW_ZONE: 162,
  // Three growth stages per crop.
  crop: (feature: number, growth: number) =>
    176 + CROPS.findIndex((f) => f.id === feature) * 3 + Math.min(2, Math.floor(growth * 3)),
};

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
    for (let v = 0; v < 2; v++) {
      at(Frames.terrain(t.id, v), (c) => drawTerrain(c, t.key, v));
    }
  });
  FEATURES.forEach((f) => {
    at(Frames.feature(f.id), (c) => drawFeature(c, f.key));
    at(Frames.blueprint(f.id), (c) => {
      drawFeature(c, f.key);
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = '#7fd0ff';
      c.fillRect(0, 0, TILE, TILE);
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
  CROPS.forEach((f) => {
    for (let stage = 0; stage < 3; stage++) {
      at(Frames.crop(f.id, stage / 3), (c) => drawCrop(c, f.key, stage));
    }
  });
  at(Frames.INDOOR, (c) => {
    c.fillStyle = 'rgba(30, 20, 10, 0.2)';
    c.fillRect(0, 0, TILE, TILE);
  });
  texture.refresh();

  // Named frames for sprites that reuse tileset art.
  for (let frame = 0; frame < COLUMNS * ROWS; frame++) {
    texture.add(frame, 0, (frame % COLUMNS) * TILE, Math.floor(frame / COLUMNS) * TILE, TILE, TILE);
  }

  createPawnTextures(scene);
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

function drawTerrain(c: Ctx, key: string, variant: number): void {
  const seed = variant * 97 + key.length * 13;
  const palette: Record<string, [string, string[], number]> = {
    deepWater: ['#1d4670', ['#24547f', '#2b5f8c'], 0.12],
    shallowWater: ['#3d7bb0', ['#4a8bc0', '#5a9bd0'], 0.12],
    sand: ['#d6c286', ['#c9b376', '#e2d199'], 0.18],
    grass: ['#5a8a38', ['#4e7c30', '#679a42', '#72a34a'], 0.22],
    soil: ['#5f4a2f', ['#544128', '#6c553a'], 0.25],
    stoneFloor: ['#77746f', ['#6a6762', '#85827c'], 0.25],
    ice: ['#cfe4ef', ['#bcd6e6', '#e6f3fa'], 0.2],
  };
  const [base, specks, density] = palette[key];
  c.fillStyle = base;
  c.fillRect(0, 0, TILE, TILE);
  speckle(c, seed, specks, density);
  if (key === 'deepWater' || key === 'shallowWater') {
    c.fillStyle = 'rgba(255,255,255,0.18)';
    const y = variant ? 4 : 10;
    c.fillRect(3, y, 4, 1);
    c.fillRect(9, y + 3, 4, 1);
  }
  if (key === 'ice') {
    c.fillStyle = 'rgba(80,120,150,0.35)';
    if (variant) {
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
    case 'potatoPlant':
    case 'cottonPlant':
    case 'healrootPlant':
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
    case 'table':
      c.fillStyle = '#5a3818';
      c.fillRect(2, 10, 2, 5);
      c.fillRect(12, 10, 2, 5);
      c.fillStyle = '#a0703c';
      c.fillRect(1, 3, 14, 8);
      c.fillStyle = '#b8864f';
      c.fillRect(1, 3, 14, 2);
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
  const leaf = key === 'potatoPlant' ? '#4f9a3a' : key === 'healrootPlant' ? '#3f8f6a' : '#6d8f4a';
  const fruit = key === 'potatoPlant' ? '#d6b25e' : key === 'healrootPlant' ? '#e8f0a0' : '#f4f1e8';
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
  r.fillStyle = 'rgba(0,0,0,0.3)';
  r.fillRect(4, 14, 8, 2);
  r.fillStyle = '#2a2a30';
  r.fillRect(5, 13, 2, 2);
  r.fillRect(9, 13, 2, 2);
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
  h.fillStyle = 'rgba(0,0,0,0.3)';
  h.fillRect(4, 14, 8, 2);
  h.fillStyle = '#3a3a48';
  h.fillRect(5, 13, 2, 2);
  h.fillRect(9, 13, 2, 2);
  h.fillStyle = '#f1c9a0';
  h.fillRect(5, 2, 6, 5);
  h.fillStyle = '#4a3020';
  h.fillRect(5, 1, 6, 2);
  h.fillRect(5, 1, 1, 4);
  h.fillStyle = '#222';
  h.fillRect(7, 4, 1, 1);
  h.fillRect(9, 4, 1, 1);
  head.refresh();
}
