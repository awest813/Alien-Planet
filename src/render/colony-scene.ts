import Phaser from 'phaser';
import { TOOLS, Tool, controller } from '../game/controller';
import { NONE, featureDef, terrainId } from '../sim/defs';
import { hash2 } from '../sim/rng';
import { beaconTile, transmitting } from '../sim/beacon';
import { EXCELLENT, MASTERWORK } from '../sim/art';
import { ADULT, TEEN } from '../sim/lifespans';
import { NIGHT_END, NIGHT_START } from '../sim/simulation';
import { Animal, Colonist, Enemy } from '../sim/types';
import { Designation, GROW_ZONE, World } from '../sim/world';
import { Frames, TILE, TILESET_KEY, createTextures } from './textures';
import { LightBuffer, LitTile, litTiles } from './lighting';
import { auroraOn, eclipseOn } from '../sim/storyteller';

interface PawnView {
  root: Phaser.GameObjects.Container;
  figure: Phaser.GameObjects.Container;
  carry: Phaser.GameObjects.Image;
  zzz: Phaser.GameObjects.Text;
  alert: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
}

interface Layers {
  terrain: Phaser.Tilemaps.TilemapGPULayer;
  floor: Phaser.Tilemaps.TilemapLayer;
  floorPlan: Phaser.Tilemaps.TilemapLayer;
  filth: Phaser.Tilemaps.TilemapLayer;
  zone: Phaser.Tilemaps.TilemapLayer;
  indoor: Phaser.Tilemaps.TilemapLayer;
  feature: Phaser.Tilemaps.TilemapLayer;
  items: Phaser.Tilemaps.TilemapLayer;
  roof: Phaser.Tilemaps.TilemapLayer;
  blueprint: Phaser.Tilemaps.TilemapLayer;
  designation: Phaser.Tilemaps.TilemapLayer;
}

const SHALLOW = terrainId('shallowWater');
const DEEP = terrainId('deepWater');
const isWater = (t: number) => t === SHALLOW || t === DEEP;

// Light from fires and heaters, and the dimmer glow of a stove (buildings without their own light).
const FIRE_LIGHT = { radius: 3.6, color: '#ff9a3c', flicker: true };
const STOVE_LIGHT = { radius: 2.4, color: '#ff9a3c', flicker: true };
// An electric heater glows steady.
const HEATER_LIGHT = { radius: 2.8, color: '#ff8a50', flicker: false };

// The colour laid over the map at a given hour, how strongly, and how dark it is (0 day … 1 night,
// for how brightly lights show).
function skyAt(hour: number): { color: number; alpha: number; dark: number } {
  const NIGHT = Phaser.Display.Color.ValueToColor(0x0a1230);
  const DUSK = Phaser.Display.Color.ValueToColor(0x4a2a5a);
  const GOLD = Phaser.Display.Color.ValueToColor(0xffa040);
  const DAWN = Phaser.Display.Color.ValueToColor(0xff8a7a);
  const mix = (a: Phaser.Display.Color, b: Phaser.Display.Color, t: number) => {
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, Math.round(Math.max(0, Math.min(1, t)) * 100));
    return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
  };
  if (hour >= NIGHT_START || hour < NIGHT_END) {
    return { color: 0x0a1230, alpha: 0.55, dark: 1 };
  }
  if (hour < NIGHT_END + 1) {
    // Dawn: night lifting quickly, leaving a faint rosy light.
    const t = hour - NIGHT_END;
    return { color: mix(NIGHT, DAWN, t), alpha: 0.55 * (1 - t) * (1 - t) + 0.08 * t, dark: 1 - t };
  }
  if (hour < NIGHT_END + 2) {
    const t = hour - NIGHT_END - 1;
    return { color: 0xff8a7a, alpha: 0.08 * (1 - t), dark: 0 };
  }
  if (hour >= NIGHT_START - 2) {
    // Dusk: the golden light deepening to night.
    const t = (hour - (NIGHT_START - 2)) / 2;
    const color = t < 0.5 ? mix(GOLD, DUSK, t * 2) : mix(DUSK, NIGHT, t * 2 - 1);
    return { color, alpha: 0.14 + t * 0.41, dark: t };
  }
  if (hour >= NIGHT_START - 4) {
    // Golden hour.
    const t = (hour - (NIGHT_START - 4)) / 2;
    return { color: 0xffa040, alpha: 0.14 * t, dark: 0 };
  }
  return { color: 0xffffff, alpha: 0, dark: 0 };
}

// The legs frame for a figure: a two-step stride while walking, standing otherwise.
const stride = (moving: boolean, time: number) =>
  moving ? `pawn-legs-${1 + (Math.floor(time / 140) % 2)}` : 'pawn-legs-0';

// Mostly plain ground, with details here and there.
const terrainVariant = (x: number, y: number) => {
  const r = hash2(x, y, 17);
  return r < 0.5 ? 0 : r < 0.75 ? 1 : r < 0.9 ? 2 : 3;
};
// Sculptures below this quality are poor work.
const POOR_ART = 4;
const SEASON_INDEX: Record<string, number> = { Spring: 0, Summer: 1, Autumn: 2, Winter: 3 };

// Below this zoom, map text (names, stack counts) is too small to read.
const READABLE_ZOOM = 0.9;
const Depth = { WATER: 0.5, OVERLAY: 20, NIGHT: 30, PAWNS: 40, LABELS: 41, PREVIEW: 50 };
const PAN_SPEED = 700;
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

const TOOL_COLORS: Record<string, number> = {
  designate: 0xffd166,
  cancel: 0xff5252,
  zone: 0xffd65c,
  build: 0x7fd0ff,
  hunt: 0xff5c5c,
  capture: 0xffa040,
  forbid: 0xff6b6b,
  select: 0xffffff,
};

// Renders the simulation. Holds no game state of its own: every frame it pulls
// changes from the simulation (dirty tiles, colonist positions) and draws them.
export class ColonyScene extends Phaser.Scene {
  private map: Phaser.Tilemaps.Tilemap | null = null;
  private layers: Layers;
  private pawns = new Map<number, PawnView>();
  private raiders = new Map<number, Phaser.GameObjects.Container>();
  // Raiders' and allies' names, on the names' own layer above every figure (as colonists' are).
  private raiderLabels = new Map<number, Phaser.GameObjects.Text>();
  private labelsReadable = true;
  // Raiders lying wounded and prisoners, by id.
  private captives = new Map<number, Phaser.GameObjects.Container>();
  private traders = new Map<number, Phaser.GameObjects.Container>();
  private beasts = new Map<number, Phaser.GameObjects.Container>();
  private itemLabels = new Map<number, Phaser.GameObjects.Text>();
  private overlay: Phaser.GameObjects.Graphics;
  private preview: Phaser.GameObjects.Graphics;
  private night: Phaser.GameObjects.Rectangle;
  private beaconFx!: Phaser.GameObjects.Graphics;
  // Marks of quality drawn over sculptures.
  private artFx!: Phaser.GameObjects.Graphics;
  private ship: Phaser.GameObjects.Image | undefined;
  // The season the ground is drawn for (0 spring … 3 winter); a change repaints it.
  private terrainSeason = 1;
  // A ground tile changed this frame: the ground's texture of tile indexes is remade once, after them all.
  private groundChanged = false;
  // Light after dark, one pixel a tile, stretched smoothly over the map (see lighting.ts).
  private light: Phaser.GameObjects.Image | undefined;
  private lightTexture: Phaser.Textures.CanvasTexture | undefined;
  private lightPixels: ImageData | undefined;
  private lightBuffer: LightBuffer | undefined;
  // The tiles each light reaches, worked out again when features change.
  private lightReach = new Map<string, LitTile[]>();
  private heatmap: Phaser.GameObjects.Graphics;
  private fireFx!: Phaser.GameObjects.Graphics;
  private weatherFx!: Phaser.GameObjects.Graphics;
  private water!: Phaser.GameObjects.Graphics;
  private waterAt = 0;
  private heatmapAt = 0;
  private heatmapView = '';
  // Tiles holding a heat/light source, refreshed when features change.
  private glowSources: {
    tile: number;
    radius: number;
    color: number;
    flicker: boolean;
    strength: number;
    powered: boolean;
    // A fire that goes dark when it runs out of wood.
    burns: boolean;
  }[] = [];
  private glowVersion = -1;
  private builtFor = -1;
  private roomsVersion = -1;
  private readonly held = new Set<string>();
  private drag: { start: number; end: number } | null = null;
  private pan: { x: number; y: number; scrollX: number; scrollY: number; moved: boolean; button: number } | null = null;
  // Two fingers on a touch screen: the gap between them when the pinch began, and the zoom then.
  private pinch: { distance: number; zoom: number } | null = null;

  constructor() {
    super('ColonyScene');
  }

  public create(): void {
    createTextures(this);
    // Above the night's shading (rings, shots and progress bars stay bright after dark), below the figures.
    this.overlay = this.add.graphics().setDepth(Depth.NIGHT + 0.5);
    this.preview = this.add.graphics().setDepth(Depth.PREVIEW);
    this.night = this.add.rectangle(0, 0, 1, 1, 0x0a1230, 0).setOrigin(0).setDepth(Depth.NIGHT);
    // Flames show through the night shading; weather sits over everything on the map.
    this.fireFx = this.add.graphics().setDepth(Depth.NIGHT + 1);
    this.beaconFx = this.add.graphics().setDepth(Depth.NIGHT + 1);
    // With the buildings, so night shades it like the sculpture under it.
    this.artFx = this.add.graphics().setDepth(3.5);
    this.weatherFx = this.add.graphics().setDepth(Depth.NIGHT + 3);
    // Above the tiles and night shading, below colonists.
    this.heatmap = this.add.graphics().setDepth(Depth.NIGHT + 2);
    this.water = this.add.graphics().setDepth(Depth.WATER);
    this.cameras.main.setZoom(2);
    this.setupPointer();
    this.setupKeyboard();
  }

  public update(_time: number, delta: number): void {
    controller.frame();
    if (controller.simVersion !== this.builtFor) {
      this.buildWorld();
    }
    // Zoomed far out, text shrinks to a few pixels: names and stack counts are left off until it reads again.
    const readable = this.cameras.main.zoom >= READABLE_ZOOM;
    if (readable !== this.labelsReadable) {
      this.labelsReadable = readable;
      this.itemLabels.forEach((label) => label.setVisible(readable));
    }
    const world = controller.sim.world;
    this.syncDirty(world);
    this.syncSeason(world);
    if (this.groundChanged) {
      this.groundChanged = false;
      this.layers.terrain.generateLayerDataTexture();
    }
    if (world.structureVersion !== this.roomsVersion) {
      this.roomsVersion = world.structureVersion;
      this.glowVersion = -1;
      this.syncIndoor(world);
    }
    this.syncPawns();
    this.syncRaiders();
    this.syncCaptives();
    this.syncTraders();
    this.syncAnimals();
    this.drawOverlay();
    this.updateCamera(delta);
    this.updateNight();
    this.syncBeacon();
    this.drawArt();
    this.drawHeatmap();
    this.drawWater();
    this.drawFires();
    this.drawWeather();
    this.showRoofs();
  }

  // Roofs stay out of the way: they only show while roofs are being built or taken down.
  private showRoofs(): void {
    const tool = controller.tool;
    const visible =
      (tool.kind === 'build' && featureDef(tool.feature).layer === 'roof') ||
      (tool.kind === 'designate' && tool.designation === 'deconstruct') ||
      tool.kind === 'cancel';
    if (this.layers.roof.visible !== visible) {
      this.layers.roof.setVisible(visible);
    }
  }

  // Flickering flames on burning tiles in view.
  private drawFires(): void {
    const g = this.fireFx;
    g.clear();
    const sim = controller.sim;
    if (sim.burning.size === 0) {
      return;
    }
    const world = sim.world;
    const view = this.visibleTiles();
    const now = this.time.now;
    for (const i of sim.burning) {
      const x = world.xOf(i);
      const y = world.yOf(i);
      if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) {
        continue;
      }
      const px = x * TILE;
      const py = y * TILE;
      const base = py + TILE - 2;
      // Embers along the bottom, three tongues of flame each flickering to its own height, a bright core,
      // and a puff of smoke drifting up out of it.
      g.fillStyle(0x8a2a08, 0.85).fillRect(px + 2, base - 2, TILE - 4, 3);
      for (let k = 0; k < 3; k++) {
        const cx = px + 4 + k * 4;
        const lick = 0.6 + 0.4 * Math.abs(Math.sin(now / (90 + k * 23) + i * 1.7 + k * 2.1));
        const h = (k === 1 ? 12 : 9) * lick;
        g.fillStyle(0xe8590c, 0.9).fillTriangle(cx - 3, base, cx + 3, base, cx, base - h);
        g.fillStyle(0xffb347, 0.95).fillTriangle(cx - 1.5, base, cx + 1.5, base, cx, base - h * 0.6);
      }
      g.fillStyle(0xfff3b0, 0.9).fillRect(px + 6, base - 3, TILE - 12, 2);
      const rise = (now / 1400 + hash2(i, 1, 31)) % 1;
      g.fillStyle(0x5a5a60, 0.35 * (1 - rise)).fillCircle(
        px + 8 + Math.sin(now / 500 + i) * 2,
        py - rise * 10,
        2.5 + rise * 3,
      );
    }
  }

  // An aurora: slow green and violet curtains rippling across the top of the night sky.
  private drawAurora(g: Phaser.GameObjects.Graphics, v: Phaser.Geom.Rectangle, now: number): void {
    const sim = controller.sim;
    if (!auroraOn(sim) || !sim.isNight()) {
      return;
    }
    const bands = 24;
    for (let k = 0; k < bands; k++) {
      const x = v.x + (k / bands) * v.width;
      const wave = Math.sin(now / 1400 + k * 0.6) * 0.5 + 0.5;
      const height = v.height * (0.25 + 0.2 * wave);
      g.fillStyle(k % 3 === 0 ? 0x9a6bff : 0x55ffaa, 0.06 + 0.06 * wave).fillRect(x, v.y, v.width / bands + 1, height);
    }
  }

  // Rain, snow, fog and storm flashes over whatever part of the map is in view.
  private drawWeather(): void {
    const g = this.weatherFx;
    g.clear();
    const sim = controller.sim;
    const kind = sim.weather.kind;
    if (kind === 'clear') {
      this.drawAurora(g, this.cameras.main.worldView, this.time.now);
      return;
    }
    const cam = this.cameras.main;
    const v = cam.worldView;
    const s = 1 / cam.zoom;
    const now = this.time.now;
    const frac = (n: number) => n - Math.floor(n);
    if (kind === 'rain' || kind === 'storm') {
      if (kind === 'storm') {
        g.fillStyle(0x10141c, 0.2).fillRect(v.x, v.y, v.width, v.height);
      }
      g.fillStyle(0xa8c8ff, kind === 'storm' ? 0.55 : 0.4);
      const drops = kind === 'storm' ? 260 : 160;
      // Each drop has its own place and pace (hashed), so they scatter rather than fall in lines.
      for (let k = 0; k < drops; k++) {
        const x = v.x + frac(hash2(k, 3, 11) + now * 0.00004) * v.width;
        const y =
          v.y +
          frac(hash2(k, 5, 13) + now * (kind === 'storm' ? 0.0014 : 0.001) * (0.8 + 0.4 * hash2(k, 7, 17))) * v.height;
        g.fillRect(x, y, s, 7 * s);
      }
      // Lightning: a white flash that fades over a second of game time.
      const age = sim.tick - sim.lastLightning;
      if (controller.settings.lightningFlashes && sim.lastLightning >= 0 && age < 20) {
        g.fillStyle(0xffffff, 0.45 * (1 - age / 20)).fillRect(v.x, v.y, v.width, v.height);
      }
    } else if (kind === 'snow') {
      g.fillStyle(0xffffff, 0.85);
      for (let k = 0; k < 140; k++) {
        const drift = Math.sin(now / 900 + k) * 6 * s;
        const x = v.x + frac(hash2(k, 3, 19)) * v.width + drift;
        const y = v.y + frac(hash2(k, 5, 23) + now * 0.00018 * (0.7 + 0.6 * hash2(k, 9, 29))) * v.height;
        g.fillRect(x, y, 2 * s, 2 * s);
      }
    } else if (kind === 'fog') {
      g.fillStyle(0xc8ccd2, 0.3).fillRect(v.x, v.y, v.width, v.height);
    } else if (kind === 'drought') {
      g.fillStyle(0xffa040, 0.08).fillRect(v.x, v.y, v.width, v.height);
    }
    this.drawAurora(g, v, now);
  }

  // Drifting glints on open water, and foam where it meets the shore.
  private drawWater(): void {
    const now = this.time.now;
    if (now - this.waterAt < 120) {
      return;
    }
    this.waterAt = now;
    const g = this.water;
    g.clear();
    const world = controller.sim.world;
    const view = this.visibleTiles();
    for (let y = view.y0; y <= view.y1; y++) {
      for (let x = view.x0; x <= view.x1; x++) {
        const i = world.idx(x, y);
        const t = world.terrain[i];
        if (!isWater(t)) {
          continue;
        }
        const px = x * TILE;
        const py = y * TILE;
        g.fillStyle(0xffffff, 0.35);
        if (y > 0 && !isWater(world.terrain[i - world.width])) {
          g.fillRect(px, py, TILE, 1);
        }
        if (y < world.height - 1 && !isWater(world.terrain[i + world.width])) {
          g.fillRect(px, py + TILE - 1, TILE, 1);
        }
        if (x > 0 && !isWater(world.terrain[i - 1])) {
          g.fillRect(px, py, 1, TILE);
        }
        if (x < world.width - 1 && !isWater(world.terrain[i + 1])) {
          g.fillRect(px + TILE - 1, py, 1, TILE);
        }
        const seed = hash2(x, y, 5);
        const shine = Math.sin(now / 700 + seed * 12);
        if (shine > 0.4) {
          const drift = Math.floor((now / 160 + seed * 16) % 12);
          g.fillStyle(0xffffff, (shine - 0.4) * (t === DEEP ? 0.35 : 0.5));
          g.fillRect(px + 1 + drift, py + 3 + Math.floor(seed * 9), 3, 1);
        }
      }
    }
  }

  // The tiles the camera can see (plus a one-tile border), so per-frame drawing skips the rest
  // of a big map.
  private visibleTiles(): { x0: number; y0: number; x1: number; y1: number } {
    const world = controller.sim.world;
    const view = this.cameras.main.worldView;
    return {
      x0: Math.max(0, Math.floor(view.x / TILE) - 1),
      y0: Math.max(0, Math.floor(view.y / TILE) - 1),
      x1: Math.min(world.width - 1, Math.ceil(view.right / TILE) + 1),
      y1: Math.min(world.height - 1, Math.ceil(view.bottom / TILE) + 1),
    };
  }

  // ---- World tiles ----

  private buildWorld(): void {
    this.builtFor = controller.simVersion;
    this.ship?.destroy();
    this.ship = undefined;
    // A new or loaded map can share the old one's version numbers: work the lights out afresh.
    this.glowVersion = -1;
    this.terrainSeason = SEASON_INDEX[controller.sim.season] ?? 1;
    // A drag or pan begun on the old map mustn't carry its tile indexes onto the new one.
    this.drag = null;
    this.pan = null;
    this.pinch = null;
    const world = controller.sim.world;
    this.map?.destroy();
    this.itemLabels.forEach((label) => label.destroy());
    this.itemLabels.clear();
    this.pawns.forEach((pawn) => {
      pawn.root.destroy();
      pawn.label.destroy();
    });
    this.pawns.clear();
    this.raiders.forEach((raider) => raider.destroy());
    this.raiders.clear();
    this.raiderLabels.forEach((label) => label.destroy());
    this.raiderLabels.clear();
    this.captives.forEach((captive) => captive.destroy());
    this.captives.clear();
    this.traders.forEach((trader) => trader.destroy());
    this.traders.clear();
    this.beasts.forEach((beast) => beast.destroy());
    this.beasts.clear();

    const map = this.make.tilemap({ width: world.width, height: world.height, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage(TILESET_KEY, TILESET_KEY, TILE, TILE, 0, 0)!;
    const layer = (name: string, depth: number) => map.createBlankLayer(name, tileset)!.setDepth(depth);
    // The ground covers every tile and seldom changes (a season, ice on the water), so the GPU draws it from a
    // texture of tile indexes in one go. Drawn tile by tile like the other layers, it was the biggest part of a
    // zoomed-out frame on a slow phone.
    map.createBlankLayer('terrain', tileset)!.destroy(false);
    const ground = new Phaser.Tilemaps.TilemapGPULayer(this, map, map.getLayerIndex('terrain')!, tileset);
    this.add.existing(ground.setDepth(0));
    this.layers = {
      terrain: ground,
      floor: layer('floor', 0.6),
      // Planned floors show under furniture rather than over it.
      floorPlan: layer('floorPlan', 0.7).setAlpha(0.55),
      filth: layer('filth', 0.8),
      zone: layer('zone', 1),
      indoor: layer('indoor', 2),
      feature: layer('feature', 3),
      items: layer('items', 4),
      roof: layer('roof', 4.6),
      blueprint: layer('blueprint', 5).setAlpha(0.55),
      designation: layer('designation', 6),
    };
    this.map = map;
    this.filled.clear();
    for (const l of Object.values(this.layers)) {
      if (l instanceof Phaser.Tilemaps.TilemapLayer) {
        this.cullFilled(l);
      }
    }

    for (let i = 0; i < world.size; i++) {
      this.drawTile(world, i);
    }
    this.syncIndoor(world);
    this.roomsVersion = world.structureVersion;
    world.dirty.clear();

    this.buildLight(world);
    const size = world.width * TILE;
    this.night.setSize(size + 4000, size + 4000).setPosition(-2000, -2000);
    this.cameras.main.setBounds(-TILE * 8, -TILE * 8, size + TILE * 16, size + TILE * 16);
    for (const c of controller.sim.colonists) {
      this.pawns.set(c.id, this.createPawn(c));
    }
  }

  // Every tile has ground, and most redraws of a tile leave it as it was.
  private putGround(x: number, y: number, frame: number): void {
    const tile = this.layers.terrain.getTileAt(x, y, true);
    if (tile?.index !== frame) {
      this.layers.terrain.putTileAt(frame, x, y, false);
      this.groundChanged = true;
    }
  }

  private put(layer: Phaser.Tilemaps.TilemapLayer, x: number, y: number, frame: number): Phaser.Tilemaps.Tile | null {
    const filled = this.filled.get(layer);
    if (frame < 0) {
      filled?.delete(y * layer.layer.width + x);
      layer.removeTileAt(x, y, false, false);
      return null;
    }
    filled?.add(y * layer.layer.width + x);
    return layer.putTileAt(frame, x, y, false);
  }

  // Most layers are mostly empty, but Phaser finds the tiles to draw by looking at every tile in view, which
  // zoomed out on a big map is thousands a layer, every frame. So each layer keeps a list of its filled tiles,
  // and when that's the shorter list, those are the ones looked at.
  private filled = new Map<Phaser.Tilemaps.TilemapLayer, Set<number>>();
  private cullFilled(layer: Phaser.Tilemaps.TilemapLayer): void {
    const filled = new Set<number>();
    this.filled.set(layer, filled);
    const scan = layer.cullCallback;
    const width = layer.layer.width;
    const height = layer.layer.height;
    layer.cullCallback = (
      data: Phaser.Tilemaps.LayerData,
      camera: Phaser.Cameras.Scene2D.Camera,
      out: Phaser.Tilemaps.Tile[],
      order: number,
    ) => {
      const view = camera.worldView;
      const x0 = Math.max(0, Math.floor(view.x / TILE) - 1);
      const y0 = Math.max(0, Math.floor(view.y / TILE) - 1);
      const x1 = Math.min(width - 1, Math.ceil(view.right / TILE));
      const y1 = Math.min(height - 1, Math.ceil(view.bottom / TILE));
      if (filled.size >= (x1 - x0 + 1) * (y1 - y0 + 1)) {
        return scan(data, camera, out, order);
      }
      // (Tiles on a layer never overlap, so the order they're drawn in doesn't matter.)
      out.length = 0;
      for (const i of filled) {
        const x = i % width;
        const y = (i - x) / width;
        if (x < x0 || x > x1 || y < y0 || y > y1) {
          continue;
        }
        const tile = data.data[y][x];
        if (tile && tile.index !== -1 && tile.visible && tile.alpha !== 0) {
          out.push(tile);
        }
      }
      return out;
    };
  }

  // Trees and bushes turn with the seasons (warm in autumn, frosted in winter), and a crop that's ready to
  // harvest ripens to gold, so it can be told from one still growing.
  private featureTint(world: World, i: number): number {
    const f = world.feature[i];
    if (f === NONE) {
      return 0xffffff;
    }
    const def = featureDef(f);
    if (def.crop) {
      return world.growth[i] >= 1 ? 0xffe27a : 0xffffff;
    }
    const plant = def.natural && (def.harvest?.work === 'chop' || def.harvest?.work === 'forage');
    return !plant ? 0xffffff : this.terrainSeason === 2 ? 0xffb36b : this.terrainSeason === 3 ? 0xc4d0de : 0xffffff;
  }

  // The signal beacon: a pulse spreading from it while it transmits, and the ship beside it once landed.
  private syncBeacon(): void {
    const sim = controller.sim;
    const tile = beaconTile(sim);
    this.beaconFx.clear();
    if (tile === undefined) {
      this.ship?.setVisible(false);
      return;
    }
    const world = sim.world;
    const x = (world.xOf(tile) + 0.5) * TILE;
    const y = (world.yOf(tile) + 0.5) * TILE;
    if (transmitting(sim)) {
      const t = (this.time.now % 2400) / 2400;
      this.beaconFx.lineStyle(1, 0x7fe0ff, 0.6 * (1 - t)).strokeCircle(x, y - 6, 4 + t * TILE * 3);
    }
    // After boarding the ship stays, the colonists gone aboard.
    if (sim.beacon.landed) {
      // With the buildings: shaded at night, under the rain.
      this.ship ??= this.add.image(0, 0, 'ship').setDepth(Depth.NIGHT - 1);
      this.ship.setPosition(x + TILE * 1.5, y - TILE * 0.5).setVisible(true);
    } else {
      this.ship?.setVisible(false);
    }
  }

  // Each sculpture shows how well it was made: poor work is cracked, excellent work gleams silver,
  // and a masterwork stands on a gold-trimmed plinth that catches the light.
  private drawArt(): void {
    const g = this.artFx;
    g.clear();
    const sim = controller.sim;
    const world = sim.world;
    const view = this.visibleTiles();
    const time = this.time.now;
    for (const [i, art] of sim.artworks) {
      const x0 = world.xOf(i);
      const y0 = world.yOf(i);
      if (x0 < view.x0 || x0 > view.x1 || y0 < view.y0 || y0 > view.y1 || !sim.artworkAt(i)) {
        continue;
      }
      const x = x0 * TILE;
      const y = y0 * TILE;
      if (art.quality < POOR_ART) {
        g.lineStyle(1, 0x2a221c, 0.8);
        g.lineBetween(x + 6, y + 4, x + 8, y + 7).lineBetween(x + 8, y + 7, x + 7, y + 10);
        g.lineBetween(x + 10, y + 11, x + 12, y + 13);
      } else if (art.quality >= MASTERWORK) {
        g.fillStyle(0xe8b93a, 1).fillRect(x + 3, y + 13, 10, 1);
        g.fillStyle(0xfff1a8, 1).fillRect(x + 4, y + 13, 2, 1);
        // A slow twinkle, off-beat from its neighbours.
        const twinkle = 0.5 + 0.5 * Math.sin(time / 380 + i * 1.7);
        const sx = x + 3 + Math.floor(hash2(i, 1, 41) * 10);
        const sy = y + 2 + Math.floor(hash2(i, 2, 41) * 6);
        g.fillStyle(0xfff6c8, twinkle).fillRect(sx, sy, 1, 1);
        g.fillStyle(0xfff6c8, twinkle * 0.6)
          .fillRect(sx - 1, sy, 1, 1)
          .fillRect(sx + 1, sy, 1, 1)
          .fillRect(sx, sy - 1, 1, 1)
          .fillRect(sx, sy + 1, 1, 1);
      } else if (art.quality >= EXCELLENT) {
        g.fillStyle(0xd8e4ee, 0.9).fillRect(x + 3, y + 13, 10, 1);
        const gleam = 0.35 + 0.35 * Math.sin(time / 600 + i);
        g.fillStyle(0xffffff, gleam).fillRect(x + 7, y + 3, 1, 3);
      }
    }
  }

  // The ground changes with the seasons: green in spring and summer, golden in autumn, frosted in winter.
  private syncSeason(world: World): void {
    const season = SEASON_INDEX[controller.sim.season] ?? 1;
    if (season === this.terrainSeason) {
      return;
    }
    this.terrainSeason = season;
    for (let i = 0; i < world.size; i++) {
      const x = world.xOf(i);
      const y = world.yOf(i);
      this.putGround(x, y, Frames.terrain(world.terrain[i], terrainVariant(x, y), season));
    }
    for (const i of world.tilesWith('features')) {
      const tile = this.layers.feature.getTileAt(world.xOf(i), world.yOf(i));
      if (tile) {
        tile.tint = this.featureTint(world, i);
      }
    }
  }

  private drawTile(world: World, i: number): void {
    const x = world.xOf(i);
    const y = world.yOf(i);
    const L = this.layers;
    this.putGround(x, y, Frames.terrain(world.terrain[i], terrainVariant(x, y), this.terrainSeason));
    this.put(L.floor, x, y, world.floor[i] !== NONE ? Frames.feature(world.floor[i]) : -1);
    this.put(L.roof, x, y, world.roof[i] !== NONE ? Frames.feature(world.roof[i]) : -1);
    this.put(L.filth, x, y, world.filth[i] !== 0 ? Frames.filth(world.filthKind(i), world.filthAmount(i)) : -1);
    const zone = world.zone[i];
    this.put(L.zone, x, y, zone === 0 ? -1 : zone >= GROW_ZONE ? Frames.GROW_ZONE : Frames.ZONE);
    const f = world.feature[i];
    const featureFrame = f === NONE ? -1 : featureDef(f).crop ? Frames.crop(f, world.growth[i]) : Frames.feature(f);
    const featureTile = this.put(L.feature, x, y, featureFrame);
    if (featureTile) {
      featureTile.tint = this.featureTint(world, i);
    }
    this.put(L.items, x, y, world.itemType[i] !== NONE ? Frames.item(world.itemType[i]) : -1);
    const bp = world.blueprint[i];
    const floorPlan = bp !== NONE && featureDef(bp).layer === 'floor';
    this.put(L.blueprint, x, y, bp !== NONE && !floorPlan ? Frames.blueprint(bp) : -1);
    this.put(L.floorPlan, x, y, floorPlan ? Frames.blueprint(bp) : -1);
    this.put(
      L.designation,
      x,
      y,
      world.designation[i] !== Designation.NONE ? Frames.designation(world.designation[i]) : -1,
    );
    this.updateItemLabel(world, i);
  }

  private updateItemLabel(world: World, i: number): void {
    const count = world.itemType[i] !== NONE ? world.itemCount[i] : 0;
    let label = this.itemLabels.get(i);
    if (count <= 1) {
      label?.destroy();
      this.itemLabels.delete(i);
      return;
    }
    if (!label) {
      // A small badge in the tile's corner, so the item itself still shows.
      label = this.add
        .text((world.xOf(i) + 1) * TILE, (world.yOf(i) + 1) * TILE, '', {
          fontFamily: 'monospace',
          fontSize: '5px',
          color: '#ffffff',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          padding: { x: 1, y: 0 },
        })
        .setOrigin(1, 1)
        .setResolution(6)
        .setDepth(4.5)
        .setVisible(this.labelsReadable);
      this.itemLabels.set(i, label);
    }
    label.setText(count >= 1000 ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k` : String(count));
  }

  private syncDirty(world: World): void {
    if (world.dirty.size === 0) {
      return;
    }
    world.dirty.forEach((i) => this.drawTile(world, i));
    world.dirty.clear();
  }

  private syncIndoor(world: World): void {
    const sim = controller.sim;
    for (let i = 0; i < world.size; i++) {
      this.put(
        this.layers.indoor,
        world.xOf(i),
        world.yOf(i),
        !world.blocksRoom(i) && sim.isIndoors(i) ? Frames.INDOOR : -1,
      );
    }
  }

  // ---- Colonists ----

  private createPawn(c: Colonist): PawnView {
    const color = Phaser.Display.Color.HexStringToColor(c.color).color;
    const legs = this.add.image(0, 0, 'pawn-legs-0');
    const body = this.add.image(0, 0, 'pawn-body').setTint(color);
    const head = this.add.image(0, 0, 'pawn-head');
    const figure = this.add.container(0, 0, [legs, body, head]);
    const carry = this.add.image(5, 3, TILESET_KEY, Frames.item(1)).setScale(0.55).setVisible(false);
    const label = this.add
      .text(0, -11, c.name, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '6px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1)
      .setResolution(4)
      // Names go on their own layer, above every figure, so a neighbour never hides one.
      .setDepth(Depth.PAWNS + 0.5);
    const zzz = this.add
      .text(6, -6, 'z', { fontFamily: 'monospace', fontSize: '6px', color: '#cfe3ff' })
      .setResolution(4)
      .setVisible(false);
    const alert = this.add
      .text(0, -18, '!', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#ff7a5c',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1)
      .setResolution(4)
      .setVisible(false);
    const root = this.add.container(0, 0, [figure, carry, zzz, alert]).setDepth(Depth.PAWNS);
    return { root, figure, carry, zzz, alert, label };
  }

  private pawnPosition(c: Colonist): { x: number; y: number } {
    const world = controller.sim.world;
    const from = c.tile;
    const to = c.path.length > 0 ? c.path[0] : c.tile;
    // Extrapolate into the next tick so movement stays smooth at any frame rate.
    const t = Math.min(1, c.moveProgress + controller.tickFraction * controller.sim.moveRate(c));
    const x = world.xOf(from) + (world.xOf(to) - world.xOf(from)) * t;
    const y = world.yOf(from) + (world.yOf(to) - world.yOf(from)) * t;
    return { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
  }

  private syncPawns(): void {
    const time = this.time.now;
    for (const c of controller.sim.colonists) {
      let pawn = this.pawns.get(c.id);
      if (!pawn) {
        // Newcomers who joined mid-game.
        pawn = this.createPawn(c);
        this.pawns.set(c.id, pawn);
      }
      const { x, y } = this.pawnPosition(c);
      const moving = c.path.length > 0;
      const { dead, downed } = c.health;
      // A bob in the step when walking (not when crawling).
      pawn.root.setPosition(x, y + (moving && !downed ? -Math.abs(Math.sin(time / 90)) * 1.2 : 0));
      // Once the colony has boarded the ship, nobody is left on the map.
      pawn.root.setVisible(!controller.sim.departed);
      (pawn.figure.getAt(0) as Phaser.GameObjects.Image).setTexture(stride(moving && !downed && !dead, time));
      pawn.root.setAlpha(dead ? 0.55 : 1);
      pawn.figure.setAngle(c.sleeping || dead || downed ? 90 : 0);
      // Children are small, teens nearly grown.
      pawn.figure.setScale(c.age < TEEN ? 0.7 : c.age < ADULT ? 0.85 : 1);
      pawn.zzz.setVisible(c.sleeping).setY(-6 - ((time / 400) % 3));
      pawn.label.setVisible(controller.settings.showNames && this.labelsReadable && pawn.root.visible);
      // Only when it changes: setting a text's colour redraws and re-uploads it, every frame, for every pawn.
      const mark = downed ? '+' : '!';
      if (pawn.alert.text !== mark) {
        pawn.alert.setText(mark).setColor(downed ? '#ff5c5c' : '#ff7a5c');
      }
      pawn.alert.setVisible(downed || controller.sim.inMentalBreak(c));
      if (c.carrying) {
        pawn.carry.setFrame(Frames.item(c.carrying.item)).setVisible(true);
      } else {
        pawn.carry.setVisible(false);
      }
    }
    this.staggerNames();
    this.fadeCountsUnderNames();
  }

  // Colonists side by side would run their names together: one that would overlap a neighbour's goes up
  // a line (up to two lines), and one that still would is faded out rather than drawn over the others.
  // A colonist's "!" or "+" sits just above their own name.
  private staggerNames(): void {
    const NAME_Y = -11;
    const LINE = 7;
    const LEVELS = 3;
    const pawns = [...this.pawns.values()].sort((a, b) => a.root.x - b.root.x);
    const placed: { left: number; right: number; y: number; level: number }[] = [];
    for (const pawn of pawns) {
      const half = pawn.label.width / 2;
      const left = pawn.root.x - half;
      const right = pawn.root.x + half;
      const clash = (level: number) =>
        placed.some(
          (o) => o.level === level && Math.abs(o.y - pawn.root.y) < 8 && o.right + 1 > left && o.left < right + 1,
        );
      let level = 0;
      while (level < LEVELS && clash(level)) {
        level++;
      }
      const fits = level < LEVELS;
      const offset = NAME_Y - (fits ? level : 0) * LINE;
      pawn.label.setPosition(pawn.root.x, pawn.root.y + offset).setAlpha(fits ? this.nameAlpha(pawn.label) : 0);
      pawn.alert.setY(pawn.label.visible && fits ? offset - LINE : NAME_Y - LINE);
      if (fits) {
        placed.push({ left, right, y: pawn.root.y, level });
      }
    }
  }

  // A name covers part of the tile above its owner: it fades while the mouse is over it, so what lies
  // there can be seen (and clicked). (Not for a finger: its last tap would leave the name faded.)
  private nameAlpha(label: Phaser.GameObjects.Text): number {
    const pointer = this.input.activePointer;
    if (!pointer || pointer.wasTouch) {
      return 1;
    }
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const half = label.width / 2 + 1;
    // (Its anchor is its bottom edge.)
    const over = Math.abs(point.x - label.x) <= half && point.y >= label.y - 9 && point.y <= label.y + 1;
    return over ? 0.2 : 1;
  }

  // A stack's count under a colonist's name makes both hard to read: the count fades while a name is
  // over it.
  private fadedCounts = new Set<number>();
  private fadeCountsUnderNames(): void {
    const world = controller.sim.world;
    const covered = new Set<number>();
    if (controller.settings.showNames && this.itemLabels.size > 0) {
      for (const pawn of this.pawns.values()) {
        if (!pawn.root.visible) {
          continue;
        }
        // The name sits above the figure's head, centred, about 8px tall (a line higher if staggered).
        const half = pawn.label.width / 2 + 2;
        // (Its anchor is its bottom edge.)
        const top = pawn.label.y - 9;
        const bottom = pawn.label.y + 1;
        for (let ty = Math.floor(top / TILE); ty <= Math.floor(bottom / TILE); ty++) {
          for (let tx = Math.floor((pawn.root.x - half) / TILE); tx <= Math.floor((pawn.root.x + half) / TILE); tx++) {
            if (tx >= 0 && ty >= 0 && tx < world.width && ty < world.height) {
              const i = world.idx(tx, ty);
              if (this.itemLabels.has(i)) {
                covered.add(i);
              }
            }
          }
        }
      }
    }
    for (const i of this.fadedCounts) {
      if (!covered.has(i)) {
        this.itemLabels.get(i)?.setAlpha(1);
      }
    }
    for (const i of covered) {
      this.itemLabels.get(i)?.setAlpha(0.15);
    }
    this.fadedCounts = covered;
  }

  // Visiting traders: green-clad figures with green name labels.
  private syncTraders(): void {
    const sim = controller.sim;
    const world = sim.world;
    const visitors = sim.caravan?.visitors ?? [];
    const present = new Set(visitors.map((v) => v.id));
    for (const [id, trader] of this.traders) {
      if (!present.has(id)) {
        trader.destroy();
        this.traders.delete(id);
      }
    }
    for (const v of visitors) {
      let trader = this.traders.get(v.id);
      if (!trader) {
        const legs = this.add.image(0, 0, 'pawn-legs-0');
        const body = this.add.image(0, 0, 'pawn-body').setTint(0x5f9a4a);
        const head = this.add.image(0, 0, 'pawn-head');
        const label = this.add
          .text(0, -11, v.name, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '6px',
            color: '#9fe38a',
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5, 1)
          .setResolution(4);
        trader = this.add.container(0, 0, [legs, body, head, label]).setDepth(Depth.PAWNS);
        this.traders.set(v.id, trader);
      }
      const to = v.path.length > 0 ? v.path[0] : v.tile;
      const x = world.xOf(v.tile) + (world.xOf(to) - world.xOf(v.tile)) * v.moveProgress;
      const y = world.yOf(v.tile) + (world.yOf(to) - world.yOf(v.tile)) * v.moveProgress;
      trader.setPosition((x + 0.5) * TILE, (y + 0.5) * TILE);
      (trader.getAt(0) as Phaser.GameObjects.Image).setTexture(stride(v.path.length > 0, this.time.now));
      (trader.getAt(3) as Phaser.GameObjects.Text).setVisible(controller.settings.showNames && this.labelsReadable);
    }
  }

  private createRaider(e: Enemy, ally = false): Phaser.GameObjects.Container {
    // Allies wear the Meadow Kin's blue-green warband tunic (their traders wear plain green).
    const tint = ally ? 0x3f7f8a : e.faction === 0 ? 0x8a5a3c : 0x5a5a64;
    // Raiders' boots are darker than colonists'.
    const legs = this.add.image(0, 0, 'pawn-legs-0').setTint(0x9a9aa0);
    const body = this.add.image(0, 0, 'pawn-body').setTint(tint);
    // Allies go bareheaded, like the traders from the same valley; raiders wear hoods.
    const head = this.add.image(0, 0, ally ? 'pawn-head' : 'raider-head');
    // Allies carry a small round shield on the arm, so they read as fighters rather than traders.
    const parts: Phaser.GameObjects.GameObject[] = [legs, body, head];
    if (ally) {
      const shield = this.add.graphics();
      shield.fillStyle(0x3a2814, 1).fillCircle(-4, 2, 3.8);
      shield.fillStyle(0x7a5530, 1).fillCircle(-4, 2, 3.1);
      shield.fillStyle(0xe8d27a, 1).fillCircle(-4, 2, 1.2);
      parts.push(shield);
    }
    return this.add.container(0, 0, parts).setDepth(Depth.PAWNS);
  }

  private syncAnimals(): void {
    const sim = controller.sim;
    const world = sim.world;
    const alive = new Set(sim.animals.map((a) => a.id));
    for (const [id, beast] of this.beasts) {
      if (!alive.has(id)) {
        beast.destroy();
        this.beasts.delete(id);
      }
    }
    for (const a of sim.animals) {
      let beast = this.beasts.get(a.id);
      if (!beast) {
        beast = this.createAnimal(a);
        this.beasts.set(a.id, beast);
      }
      const to = a.path.length > 0 ? a.path[0] : a.tile;
      const x = world.xOf(a.tile) + (world.xOf(to) - world.xOf(a.tile)) * a.moveProgress;
      const y = world.yOf(a.tile) + (world.yOf(to) - world.yOf(a.tile)) * a.moveProgress;
      // A little hop with each step while on the move.
      const hop = a.path.length > 0 ? Math.abs(Math.sin(this.time.now / 80 + a.id)) * 1.5 : 0;
      beast.setPosition((x + 0.5) * TILE, (y + 0.5) * TILE - hop);
      // Face the direction of travel.
      const body = beast.getAt(0) as Phaser.GameObjects.Image;
      if (to !== a.tile) {
        body.setFlipX(world.xOf(to) < world.xOf(a.tile));
      }
      body.setTint(a.revengeOn >= 0 ? 0xff8a8a : 0xffffff);
      (beast.getAt(1) as Phaser.GameObjects.Graphics).setVisible(a.hunted);
      (beast.getAt(2) as Phaser.GameObjects.Graphics).setVisible(a.taming);
      (beast.getAt(3) as Phaser.GameObjects.Graphics).setVisible(a.tame);
    }
  }

  private createAnimal(a: Animal): Phaser.GameObjects.Container {
    // The great beast is drawn larger than life.
    const body = this.add.image(0, 0, `animal-${a.kind}`).setScale(a.kind === 'greatBeast' ? 1.8 : 1);
    // A red crosshair over animals marked for hunting.
    const marker = this.add.graphics();
    marker.lineStyle(1, 0xff5c5c, 0.9).strokeCircle(0, -9, 3);
    marker.lineBetween(-5, -9, -2, -9).lineBetween(2, -9, 5, -9).lineBetween(0, -14, 0, -11).lineBetween(0, -7, 0, -4);
    // A green ring over animals to be tamed, and a collar on tame ones.
    const taming = this.add.graphics();
    taming.lineStyle(1, 0x8fe36b, 0.9).strokeCircle(0, -9, 3);
    const collar = this.add.graphics();
    collar.fillStyle(0xd94b4b, 1).fillRect(-2, -3, 4, 1);
    collar.fillStyle(0xffd166, 1).fillRect(0, -2, 1, 1);
    return this.add.container(0, 0, [body, marker, taming, collar]).setDepth(Depth.PAWNS - 1);
  }

  private syncRaiders(): void {
    const sim = controller.sim;
    const world = sim.world;
    // Raiders, and the fighters a friendly faction sent to help (drawn in its green).
    const allies = new Set(sim.allies.map((a) => a.id));
    const fighters = [...sim.enemies, ...sim.allies];
    const alive = new Set(fighters.map((e) => e.id));
    for (const [id, raider] of this.raiders) {
      if (!alive.has(id)) {
        raider.destroy();
        this.raiders.delete(id);
        this.raiderLabels.get(id)?.destroy();
        this.raiderLabels.delete(id);
      }
    }
    for (const e of fighters) {
      let raider = this.raiders.get(e.id);
      if (!raider) {
        raider = this.createRaider(e, allies.has(e.id));
        this.raiders.set(e.id, raider);
        this.raiderLabels.set(
          e.id,
          this.add
            .text(0, 0, e.name, {
              fontFamily: 'system-ui, sans-serif',
              fontSize: '6px',
              color: allies.has(e.id) ? '#8fe0d8' : '#ff8a8a',
              stroke: '#000000',
              strokeThickness: 2,
            })
            .setOrigin(0.5, 1)
            .setResolution(4)
            .setDepth(Depth.PAWNS + 0.5),
        );
      }
      const to = e.path.length > 0 ? e.path[0] : e.tile;
      const t = e.moveProgress;
      const x = world.xOf(e.tile) + (world.xOf(to) - world.xOf(e.tile)) * t;
      const y = world.yOf(e.tile) + (world.yOf(to) - world.yOf(e.tile)) * t;
      raider.setPosition((x + 0.5) * TILE, (y + 0.5) * TILE).setAlpha(e.fleeing ? 0.6 : 1);
      (raider.getAt(0) as Phaser.GameObjects.Image).setTexture(stride(e.path.length > 0, this.time.now));
      this.raiderLabels.get(e.id)!.setVisible(controller.settings.showNames && this.labelsReadable && raider.visible);
    }
    // A camp or a melee packs them close: a name that would overlap another goes up a line (or two), or fades
    // out if there's still no room. Compared where the labels actually sit, rows above and below included.
    const placed: { left: number; right: number; y: number }[] = [];
    for (const [id, raider] of [...this.raiders].sort(([, a], [, b]) => a.y - b.y || a.x - b.x)) {
      const label = this.raiderLabels.get(id)!;
      const half = label.width / 2;
      const left = raider.x - half;
      const right = raider.x + half;
      const free = (y: number) =>
        !placed.some((o) => Math.abs(o.y - y) < 7 && o.right + 1 > left && o.left < right + 1);
      const offset = [-11, -18, -25, -4].find((dy) => free(raider.y + dy));
      label.setPosition(raider.x, raider.y + (offset ?? -11));
      label.setAlpha(offset === undefined ? 0 : raider.alpha * this.nameAlpha(label));
      if (offset !== undefined) {
        placed.push({ left, right, y: raider.y + offset });
      }
    }
  }

  // Raiders lying where they fell, and prisoners in their beds (in prison orange), both lying down.
  private syncCaptives(): void {
    const sim = controller.sim;
    const world = sim.world;
    const present = new Set(sim.captives.map((p) => p.id));
    for (const [id, captive] of this.captives) {
      if (!present.has(id)) {
        captive.destroy();
        this.captives.delete(id);
      }
    }
    for (const p of sim.captives) {
      let captive = this.captives.get(p.id);
      if (!captive) {
        const body = this.add.image(0, 0, 'pawn-body');
        const head = this.add.image(0, 0, 'raider-head');
        const label = this.add
          .text(0, -7, p.name, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '6px',
            color: '#ffb070',
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5, 1)
          .setResolution(4);
        // Lying down as a downed colonist does (legs and all, turned the same way), the label kept upright.
        const legs = this.add.image(0, 0, 'pawn-legs-0').setTint(0x9a9aa0);
        const figure = this.add.container(0, 0, [legs, body, head]).setAngle(90);
        captive = this.add.container(0, 0, [figure, label]).setDepth(Depth.PAWNS);
        this.captives.set(p.id, captive);
      }
      const figure = captive.getAt(0) as Phaser.GameObjects.Container;
      (figure.getAt(1) as Phaser.GameObjects.Image).setTint(
        p.state === 'prisoner' ? 0xd0702c : p.faction === 0 ? 0x8a5a3c : 0x5a5a64,
      );
      // Being carried: drawn upright beside whoever carries them.
      const carried = sim.colonists.some(
        (c) => c.job?.type === 'capture' && c.job.stage === 1 && c.job.patient === p.id && c.tile === p.tile,
      );
      figure.setAngle(carried ? 0 : 90);
      captive
        .setPosition((world.xOf(p.tile) + 0.5) * TILE + (carried ? 4 : 0), (world.yOf(p.tile) + 0.5) * TILE)
        .setAlpha(p.state === 'downed' ? 0.85 : 1);
      (captive.getAt(1) as Phaser.GameObjects.Text).setVisible(controller.settings.showNames && this.labelsReadable);
    }
  }

  // ---- Overlay: progress bars, hover, selection, drag preview ----

  private drawOverlay(): void {
    const g = this.overlay;
    const sim = controller.sim;
    const world = sim.world;
    g.clear();

    for (const c of sim.colonists) {
      const progress = sim.jobProgress(c);
      if (progress) {
        const x = world.xOf(progress.tile) * TILE + 2;
        const y = world.yOf(progress.tile) * TILE + TILE - 3;
        g.fillStyle(0x000000, 0.7).fillRect(x, y, TILE - 4, 2);
        g.fillStyle(0x8fe36b, 1).fillRect(x, y, (TILE - 4) * progress.ratio, 2);
      }
    }

    // Drafted colonists get a red ring; recent attacks draw as arrows or sparks.
    for (const c of sim.colonists) {
      if (c.drafted) {
        const { x, y } = this.pawnPosition(c);
        g.lineStyle(1, 0xff5c5c, 0.9).strokeCircle(x, y, 7);
      }
    }
    for (const shot of sim.shots) {
      const fx = (world.xOf(shot.from) + 0.5) * TILE;
      const fy = (world.yOf(shot.from) + 0.5) * TILE;
      const tx = (world.xOf(shot.to) + 0.5) * TILE;
      const ty = (world.yOf(shot.to) + 0.5) * TILE;
      if (shot.ranged) {
        g.lineStyle(1, shot.hit ? 0xffe08a : 0x9aa0a8, 0.8).lineBetween(fx, fy, tx, ty);
      } else if (shot.hit) {
        // A ring round the one struck (a dot would sit under their figure).
        g.lineStyle(1.5, 0xff5c5c, 0.9).strokeCircle(tx, ty, 6);
      }
    }

    const view = this.visibleTiles();
    // Locked doors: a padlock.
    for (let ty = view.y0; ty <= view.y1; ty++) {
      for (let tx = view.x0; tx <= view.x1; tx++) {
        if (world.locked[world.idx(tx, ty)]) {
          const x = tx * TILE + TILE / 2;
          const y = ty * TILE + TILE / 2;
          g.lineStyle(1.5, 0xffd166, 1).strokeCircle(x, y - 2, 2);
          g.fillStyle(0xffd166, 1).fillRect(x - 3, y - 1, 6, 5);
          g.fillStyle(0x3a2a10, 1).fillRect(x - 0.5, y + 1, 1, 2);
        }
      }
    }
    // Forbidden items: a small red cross in the corner.
    for (const i of world.tilesWith('items')) {
      if (!world.forbidden[i]) {
        continue;
      }
      const tx = world.xOf(i);
      const ty = world.yOf(i);
      if (tx >= view.x0 && tx <= view.x1 && ty >= view.y0 && ty <= view.y1) {
        const x = tx * TILE + TILE - 5;
        const y = ty * TILE + 1;
        g.lineStyle(1.5, 0xff4d4d, 0.95)
          .lineBetween(x, y, x + 4, y + 4)
          .lineBetween(x + 4, y, x, y + 4);
      }
    }
    // Downed raiders marked for capture.
    for (const p of sim.captives) {
      if (p.state === 'downed' && p.capture) {
        g.lineStyle(1, 0xffa040, 0.9).strokeRect(
          world.xOf(p.tile) * TILE + 1,
          world.yOf(p.tile) * TILE + 1,
          TILE - 2,
          TILE - 2,
        );
      }
    }

    const selected = controller.selectedColonist !== null ? sim.colonists[controller.selectedColonist] : null;
    if (selected) {
      const { x, y } = this.pawnPosition(selected);
      g.lineStyle(1, 0xffffff, 0.9).strokeCircle(x, y, 8);
      if (selected.path.length > 0) {
        g.lineStyle(1, 0xffffff, 0.35).beginPath();
        g.moveTo(x, y);
        for (const step of selected.path) {
          g.lineTo((world.xOf(step) + 0.5) * TILE, (world.yOf(step) + 0.5) * TILE);
        }
        g.strokePath();
      }
    }

    const p = this.preview;
    p.clear();
    const tool = controller.tool;
    // Allowing is the friendly half of forbidding: green, not red.
    const color = tool.kind === 'forbid' && !tool.on ? 0x8fe36b : TOOL_COLORS[tool.kind];
    if (this.drag) {
      for (const i of this.dragTiles(tool, this.drag.start, this.drag.end)) {
        const blocked = tool.kind === 'build' && !controller.sim.canPlaceBlueprint(i, tool.feature);
        p.fillStyle(blocked ? 0xff5252 : color, 0.25).fillRect(world.xOf(i) * TILE, world.yOf(i) * TILE, TILE, TILE);
      }
      const r = this.dragRect(this.drag.start, this.drag.end);
      p.lineStyle(1, color, 0.9).strokeRect(
        r.x0 * TILE,
        r.y0 * TILE,
        (r.x1 - r.x0 + 1) * TILE,
        (r.y1 - r.y0 + 1) * TILE,
      );
    } else if (controller.hoverTile !== null) {
      const i = controller.hoverTile;
      p.lineStyle(1, color, 0.8).strokeRect(world.xOf(i) * TILE, world.yOf(i) * TILE, TILE, TILE);
    }
  }

  // The sky through the day: clear at midday, a warm golden hour and dusk, deep blue at night and a
  // rosy dawn. An eclipse brings dusk in the middle of the day.
  private updateNight(): void {
    const sim = controller.sim;
    if (!controller.settings.dayNightLighting) {
      this.night.setFillStyle(0x0a1230, 0);
      this.drawGlow(0);
      return;
    }
    const { color, alpha, dark } = skyAt(sim.hour);
    if (eclipseOn(sim)) {
      this.night.setFillStyle(0x0a1230, Math.max(alpha, 0.47));
      this.drawGlow(Math.max(dark, 0.85));
      return;
    }
    this.night.setFillStyle(color, alpha);
    this.drawGlow(dark);
  }

  // Temperature overlay: blue for freezing through green for comfortable to red for hot.
  private drawHeatmap(): void {
    const g = this.heatmap;
    if (controller.overlay !== 'temperature') {
      g.setVisible(false);
      return;
    }
    g.setVisible(true);
    const now = this.time.now;
    const view = this.visibleTiles();
    const viewKey = `${view.x0},${view.y0},${view.x1},${view.y1}`;
    // Redraw twice a second, or straight away when the view moves.
    if (now - this.heatmapAt < 500 && viewKey === this.heatmapView) {
      return;
    }
    this.heatmapAt = now;
    this.heatmapView = viewKey;
    g.clear();
    const sim = controller.sim;
    const world = sim.world;
    // Strong enough to read over grass and snow; each row's runs of one colour drawn as one rectangle (a
    // zoomed-out view is thousands of tiles).
    const colorAt = (i: number) => {
      if (world.blocksRoom(i)) {
        return -1;
      }
      const t = sim.temperatureAt(i);
      return t <= 0 ? 0x4f7cff : t < 10 ? 0x7fc8ff : t <= 26 ? 0x8fe36b : t <= 32 ? 0xffb347 : 0xff5c5c;
    };
    for (let y = view.y0; y <= view.y1; y++) {
      let x = view.x0;
      while (x <= view.x1) {
        const color = colorAt(world.idx(x, y));
        let end = x + 1;
        while (end <= view.x1 && colorAt(world.idx(end, y)) === color) {
          end++;
        }
        if (color >= 0) {
          g.fillStyle(color, 0.42).fillRect(x * TILE, y * TILE, (end - x) * TILE, TILE);
        }
        x = end;
      }
    }
  }

  // Pools of light after dark: fires and heaters flicker warm, stoves glow dimly, lamps (while the
  // grid is powered) shine steady.
  private drawGlow(dark: number): void {
    const world = controller.sim.world;
    if (world.featureVersion !== this.glowVersion) {
      this.glowVersion = world.featureVersion;
      this.glowSources = [];
      this.lightReach.clear();
      for (let i = 0; i < world.size; i++) {
        const f = world.feature[i];
        if (f === NONE) {
          continue;
        }
        const def = featureDef(f);
        const light =
          def.light ??
          (def.heater > 0
            ? def.power?.draw
              ? HEATER_LIGHT
              : FIRE_LIGHT
            : def.workbench === 'cooking'
              ? STOVE_LIGHT
              : undefined);
        if (light) {
          this.glowSources.push({
            tile: i,
            radius: light.radius,
            color: Phaser.Display.Color.HexStringToColor(light.color).color,
            flicker: light.flicker,
            strength: light === STOVE_LIGHT ? 0.4 : 1,
            powered: !!def.power?.draw,
            burns: !!def.burns,
          });
        }
      }
    }
    const buffer = this.lightBuffer;
    if (!buffer || !this.lightPixels || !this.lightTexture) {
      return;
    }
    if (dark > 0) {
      const time = this.time.now;
      const view = this.visibleTiles();
      const gridOn = controller.sim.power.powered;
      const near = (i: number, reach: number) =>
        world.xOf(i) >= view.x0 - reach &&
        world.xOf(i) <= view.x1 + reach &&
        world.yOf(i) >= view.y0 - reach &&
        world.yOf(i) <= view.y1 + reach;
      for (const source of this.glowSources) {
        const i = source.tile;
        if ((source.powered && !gridOn) || (source.burns && world.fuel[i] <= 0) || !near(i, Math.ceil(source.radius))) {
          continue;
        }
        const flicker = source.flicker ? 0.85 + 0.15 * Math.sin(time / 110 + i) : 1;
        const amount = 0.4 * dark * source.strength * flicker;
        for (const lit of this.reachOf(i, source.radius)) {
          buffer.add(lit.tile, source.color, amount * lit.share);
        }
      }
      // A fire burning (a tree, a wall) lights the night round it too (the nearest few dozen in view).
      let burning = 0;
      for (const i of controller.sim.burning) {
        if (burning >= 60 || !near(i, 3)) {
          continue;
        }
        burning++;
        const amount = 0.3 * dark * (0.8 + 0.2 * Math.sin(time / 90 + i));
        for (const lit of this.reachOf(i, 3)) {
          buffer.add(lit.tile, 0xff8c2a, amount * lit.share);
        }
      }
    }
    if (buffer.flush(this.lightPixels.data)) {
      this.lightTexture.context.putImageData(this.lightPixels, 0, 0);
      // A canvas upload takes the game's pixel-art filtering; the light wants smooth.
      this.lightTexture.refresh().setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }

  // The tiles a light reaches, kept until features change (a wall built or knocked down).
  private reachOf(tile: number, radius: number): LitTile[] {
    const key = `${tile}:${radius}`;
    let reach = this.lightReach.get(key);
    if (!reach) {
      reach = litTiles(controller.sim.world, tile, radius);
      this.lightReach.set(key, reach);
    }
    return reach;
  }

  // The light texture for a new map: one black pixel a tile, smoothly stretched over it.
  private buildLight(world: World): void {
    this.light?.destroy();
    if (this.textures.exists('light-map')) {
      this.textures.remove('light-map');
    }
    const texture = this.textures.createCanvas('light-map', world.width, world.height)!;
    const pixels = texture.context.createImageData(world.width, world.height);
    for (let p = 3; p < pixels.data.length; p += 4) {
      pixels.data[p] = 255;
    }
    texture.context.putImageData(pixels, 0, 0);
    texture.refresh().setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.lightTexture = texture;
    this.lightPixels = pixels;
    this.lightBuffer = new LightBuffer(world.size);
    this.lightReach.clear();
    this.light = this.add
      .image(0, 0, 'light-map')
      .setOrigin(0)
      .setScale(TILE)
      .setDepth(Depth.NIGHT + 1)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  // ---- Input ----

  private tileAt(pointer: Phaser.Input.Pointer): number | null {
    const world = controller.sim.world;
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x = Math.floor(point.x / TILE);
    const y = Math.floor(point.y / TILE);
    return world.inBounds(x, y) ? world.idx(x, y) : null;
  }

  private dragRect(a: number, b: number) {
    const world = controller.sim.world;
    return {
      x0: Math.min(world.xOf(a), world.xOf(b)),
      y0: Math.min(world.yOf(a), world.yOf(b)),
      x1: Math.max(world.xOf(a), world.xOf(b)),
      y1: Math.max(world.yOf(a), world.yOf(b)),
    };
  }

  // Walls are placed as a rectangle outline; everything else fills the rectangle.
  private dragTiles(tool: Tool, a: number, b: number): number[] {
    const world = controller.sim.world;
    const r = this.dragRect(a, b);
    const outline = tool.kind === 'build' && featureDef(tool.feature).blocksRoom && !featureDef(tool.feature).door;
    const tiles: number[] = [];
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        if (!outline || x === r.x0 || x === r.x1 || y === r.y0 || y === r.y1) {
          tiles.push(world.idx(x, y));
        }
      }
    }
    return tiles;
  }

  private applyDrag(start: number, end: number): void {
    const tool = controller.tool;
    const rect = this.dragRect(start, end);
    switch (tool.kind) {
      case 'designate':
        controller.command({ type: 'designate', rect, kind: tool.designation });
        break;
      case 'cancel':
        controller.command({ type: 'cancel', rect });
        controller.command({ type: 'hunt', rect, add: false });
        controller.command({ type: 'tame', rect, add: false });
        controller.command({ type: 'capture', rect, add: false });
        break;
      case 'hunt':
        controller.command({ type: 'hunt', rect, add: true });
        break;
      case 'tame':
        controller.command({ type: 'tame', rect, add: true });
        break;
      case 'capture':
        controller.command({ type: 'capture', rect, add: true });
        break;
      case 'forbid':
        controller.command({ type: 'forbid', rect, on: tool.on });
        break;
      case 'zone':
        controller.command({ type: 'zone', rect, zone: tool.zone });
        break;
      case 'build':
        controller.command({ type: 'build', feature: tool.feature, tiles: this.dragTiles(tool, start, end) });
        break;
    }
  }

  private pickColonist(pointer: Phaser.Input.Pointer): number | null {
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    let best: number | null = null;
    let bestDist = TILE * 0.75;
    for (const c of controller.sim.colonists) {
      const { x, y } = this.pawnPosition(c);
      const d = Math.hypot(x - point.x, y - point.y);
      if (d < bestDist) {
        bestDist = d;
        best = c.id;
      }
    }
    return best;
  }

  private setupPointer(): void {
    this.input.mouse?.disableContextMenu();
    // Room for a second finger, for pinch zoom.
    this.input.addPointer(1);
    const cam = this.cameras.main;
    const fingerGap = () => {
      const a = this.input.pointer1;
      const b = this.input.pointer2;
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch && this.input.pointer1.isDown && this.input.pointer2.isDown) {
        // A second finger turns whatever the first was doing into a pinch.
        this.drag = null;
        this.pan = null;
        this.pinch = { distance: Math.max(1, fingerGap()), zoom: cam.zoom };
        return;
      }
      // On a touch screen one finger drags the map in Select mode; a tap still selects.
      if (pointer.button !== 0 || (pointer.wasTouch && controller.tool.kind === 'select')) {
        this.pan = {
          x: pointer.x,
          y: pointer.y,
          scrollX: cam.scrollX,
          scrollY: cam.scrollY,
          moved: false,
          button: pointer.button,
        };
        return;
      }
      if (controller.tool.kind === 'select') {
        // Clicking a colonist selects them; clicking anything else inspects that tile.
        const colonist = this.pickColonist(pointer);
        if (colonist !== null) {
          controller.selectColonist(colonist);
        } else {
          controller.selectTile(this.tileAt(pointer));
        }
        return;
      }
      const tile = this.tileAt(pointer);
      if (tile !== null) {
        this.drag = { start: tile, end: tile };
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.pinch) {
        if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
          this.zoomAround(this.pinch.zoom * (fingerGap() / this.pinch.distance), {
            x: (this.input.pointer1.x + this.input.pointer2.x) / 2,
            y: (this.input.pointer1.y + this.input.pointer2.y) / 2,
          });
        }
        return;
      }
      if (this.pan) {
        const dx = pointer.x - this.pan.x;
        const dy = pointer.y - this.pan.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) {
          this.pan.moved = true;
        }
        cam.setScroll(this.pan.scrollX - dx / cam.zoom, this.pan.scrollY - dy / cam.zoom);
      }
      const tile = this.tileAt(pointer);
      controller.setHover(tile, this.pickColonist(pointer));
      if (this.drag && tile !== null) {
        this.drag.end = tile;
      }
    });

    const release = (pointer: Phaser.Input.Pointer) => {
      if (this.pinch) {
        // Lifting either finger ends the pinch; nothing else happens until both are up.
        if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) {
          this.pinch = null;
        }
        return;
      }
      if (this.pan && this.pan.button === 0 && pointer.button === 0) {
        // A one-finger touch pan; a tap that didn't move selects, as a click would. With a drafted colonist
        // selected, a tap on the ground (or on a raider) sends them there instead, as a right-click does.
        if (!this.pan.moved) {
          const colonist = this.pickColonist(pointer);
          const tile = this.tileAt(pointer);
          if (colonist !== null) {
            controller.selectColonist(colonist);
          } else if (tile === null || controller.tool.kind !== 'select' || !controller.orderMove(tile)) {
            controller.selectTile(tile);
          }
        }
        this.pan = null;
        return;
      }
      if (this.pan && pointer.button === this.pan.button) {
        // A right click without dragging drops the current tool.
        if (!this.pan.moved && this.pan.button === 2) {
          // Right-click sends a selected drafted colonist there; otherwise it drops the tool.
          const tile = this.tileAt(pointer);
          if (controller.tool.kind !== 'select' || tile === null || !controller.orderMove(tile)) {
            this.drag = null;
            controller.setTool({ kind: 'select' });
          }
        }
        this.pan = null;
        return;
      }
      if (this.drag && pointer.button === 0) {
        this.applyDrag(this.drag.start, this.drag.end);
        this.drag = null;
      }
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    this.input.on('gameout', () => controller.setHover(null));

    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      this.zoomAround(cam.zoom * (dy > 0 ? 1 / 1.15 : 1.15), pointer);
    });
  }

  // Zooms the camera, keeping the world point under `at` (a screen position) where it is.
  private zoomAround(target: number, at: { x: number; y: number }): void {
    const cam = this.cameras.main;
    const oldZoom = cam.zoom;
    const zoom = Phaser.Math.Clamp(target, this.minZoom(), MAX_ZOOM);
    const worldX = cam.scrollX + cam.width / 2 + (at.x - cam.width / 2) / oldZoom;
    const worldY = cam.scrollY + cam.height / 2 + (at.y - cam.height / 2) / oldZoom;
    cam.setZoom(zoom);
    cam.setScroll(
      worldX - cam.width / 2 - (at.x - cam.width / 2) / zoom,
      worldY - cam.height / 2 - (at.y - cam.height / 2) / zoom,
    );
  }

  private setupKeyboard(): void {
    const isTyping = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    };
    const onDown = (event: KeyboardEvent) => {
      // Menus and screens own the keyboard while they're open.
      if (isTyping(event) || event.ctrlKey || event.metaKey || event.altKey || controller.modalOpen) {
        return;
      }
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      // Escape is handled by the interface (close screens, drop the tool, open the menu).
      if (key === 'Escape') {
        return;
      }
      this.held.add(key);
      // Holding a toggle key mustn't flicker it.
      if (event.repeat && (key === ' ' || key === 'q' || key === 'Tab')) {
        event.preventDefault();
        return;
      }
      if (key === 'Tab' && document.activeElement && document.activeElement !== document.body) {
        // Leave Tab to the browser when a button or field has focus.
        this.held.delete(key);
        return;
      }
      if (key === ' ') {
        event.preventDefault();
        controller.togglePause();
      } else if (key === '1' || key === '2' || key === '3') {
        controller.setSpeed(Number(key));
      } else if (key === 'Tab') {
        event.preventDefault();
        controller.cycleColonist();
      } else if (key === 'h') {
        controller.focusHome();
      } else if (key === 'q') {
        if (controller.selectedColonist !== null) {
          controller.toggleDraft(controller.selectedColonist);
        } else {
          controller.toggleDraftAll();
        }
      } else {
        const tool = TOOLS.find((t) => t.hotkey === key);
        if (tool) {
          this.drag = null;
          controller.setTool(tool.tool);
        }
      }
    };
    const onUp = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      this.held.delete(key);
    };
    const onBlur = () => this.held.clear();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    });
  }

  // Far enough out to see the whole map at once, and never less than that.
  private minZoom(): number {
    const world = controller.sim.world;
    const cam = this.cameras.main;
    return Math.min(MIN_ZOOM, cam.width / ((world.width + 4) * TILE), cam.height / ((world.height + 4) * TILE));
  }

  private updateCamera(delta: number): void {
    const cam = this.cameras.main;
    if (controller.focusRequest !== null) {
      const world = controller.sim.world;
      const i = controller.focusRequest;
      controller.focusRequest = null;
      cam.centerOn((world.xOf(i) + 0.5) * TILE, (world.yOf(i) + 0.5) * TILE);
    }
    controller.cameraView = this.visibleTiles();
    const h = this.held;
    const dx = (h.has('d') || h.has('ArrowRight') ? 1 : 0) - (h.has('a') || h.has('ArrowLeft') ? 1 : 0);
    const dy = (h.has('s') || h.has('ArrowDown') ? 1 : 0) - (h.has('w') || h.has('ArrowUp') ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      const step = (PAN_SPEED * controller.settings.panSpeed * delta) / 1000 / cam.zoom;
      cam.setScroll(cam.scrollX + dx * step, cam.scrollY + dy * step);
    }
  }
}
