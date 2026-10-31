import Phaser from 'phaser';
import { TOOLS, Tool, controller } from '../game/controller';
import { NONE, featureDef, terrainId } from '../sim/defs';
import { hash2 } from '../sim/rng';
import { NIGHT_END, NIGHT_START } from '../sim/simulation';
import { Animal, Colonist, Enemy } from '../sim/types';
import { Designation, GROW_ZONE, World } from '../sim/world';
import { Frames, TILE, TILESET_KEY, createTextures } from './textures';

interface PawnView {
  root: Phaser.GameObjects.Container;
  figure: Phaser.GameObjects.Container;
  carry: Phaser.GameObjects.Image;
  zzz: Phaser.GameObjects.Text;
  alert: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
}

interface Layers {
  terrain: Phaser.Tilemaps.TilemapLayer;
  floor: Phaser.Tilemaps.TilemapLayer;
  floorPlan: Phaser.Tilemaps.TilemapLayer;
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
  select: 0xffffff,
};

// Renders the simulation. Holds no game state of its own: every frame it pulls
// changes from the simulation (dirty tiles, colonist positions) and draws them.
export class ColonyScene extends Phaser.Scene {
  private map: Phaser.Tilemaps.Tilemap | null = null;
  private layers: Layers;
  private pawns = new Map<number, PawnView>();
  private raiders = new Map<number, Phaser.GameObjects.Container>();
  private traders = new Map<number, Phaser.GameObjects.Container>();
  private beasts = new Map<number, Phaser.GameObjects.Container>();
  private itemLabels = new Map<number, Phaser.GameObjects.Text>();
  private overlay: Phaser.GameObjects.Graphics;
  private preview: Phaser.GameObjects.Graphics;
  private night: Phaser.GameObjects.Rectangle;
  private glow: Phaser.GameObjects.Graphics;
  private heatmap: Phaser.GameObjects.Graphics;
  private fireFx!: Phaser.GameObjects.Graphics;
  private weatherFx!: Phaser.GameObjects.Graphics;
  private water!: Phaser.GameObjects.Graphics;
  private waterAt = 0;
  private heatmapAt = 0;
  private heatmapView = '';
  // Tiles holding a heat/light source, refreshed when features change.
  private glowSources: number[] = [];
  private glowVersion = -1;
  private builtFor = -1;
  private roomsVersion = -1;
  private readonly held = new Set<string>();
  private drag: { start: number; end: number } | null = null;
  private pan: { x: number; y: number; scrollX: number; scrollY: number; moved: boolean; button: number } | null = null;

  constructor() {
    super('ColonyScene');
  }

  public create(): void {
    createTextures(this);
    this.overlay = this.add.graphics().setDepth(Depth.OVERLAY);
    this.preview = this.add.graphics().setDepth(Depth.PREVIEW);
    this.night = this.add.rectangle(0, 0, 1, 1, 0x0a1230, 0).setOrigin(0).setDepth(Depth.NIGHT);
    this.glow = this.add
      .graphics()
      .setDepth(Depth.NIGHT + 1)
      .setBlendMode(Phaser.BlendModes.ADD);
    // Flames show through the night shading; weather sits over everything on the map.
    this.fireFx = this.add.graphics().setDepth(Depth.NIGHT + 1);
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
    const world = controller.sim.world;
    this.syncDirty(world);
    if (world.structureVersion !== this.roomsVersion) {
      this.roomsVersion = world.structureVersion;
      this.glowVersion = -1;
      this.syncIndoor(world);
    }
    this.syncPawns();
    this.syncRaiders();
    this.syncTraders();
    this.syncAnimals();
    this.drawOverlay();
    this.updateCamera(delta);
    this.updateNight();
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
      const flicker = 0.75 + 0.25 * Math.sin(now / 70 + i * 1.7);
      const px = x * TILE;
      const py = y * TILE;
      g.fillStyle(0xd9480f, 0.8).fillRect(px + 2, py + 5, TILE - 4, TILE - 6);
      g.fillStyle(0xff8c1a, 0.9 * flicker).fillRect(px + 4, py + 3 + 2 * (1 - flicker), TILE - 8, TILE - 6);
      g.fillStyle(0xffe066, flicker).fillRect(px + 6, py + 7, TILE - 12, TILE - 10);
    }
  }

  // Rain, snow, fog and storm flashes over whatever part of the map is in view.
  private drawWeather(): void {
    const g = this.weatherFx;
    g.clear();
    const sim = controller.sim;
    const kind = sim.weather.kind;
    if (kind === 'clear') {
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
      for (let k = 0; k < drops; k++) {
        const x = v.x + frac(k * 0.6180339 + now * 0.00004) * v.width;
        const y = v.y + frac(k * 0.3819 + now * (kind === 'storm' ? 0.0014 : 0.001)) * v.height;
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
        const x = v.x + frac(k * 0.6180339) * v.width + drift;
        const y = v.y + frac(k * 0.3819 + now * 0.00018) * v.height;
        g.fillRect(x, y, 2 * s, 2 * s);
      }
    } else if (kind === 'fog') {
      g.fillStyle(0xc8ccd2, 0.3).fillRect(v.x, v.y, v.width, v.height);
    } else if (kind === 'drought') {
      g.fillStyle(0xffa040, 0.08).fillRect(v.x, v.y, v.width, v.height);
    }
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
    const world = controller.sim.world;
    this.map?.destroy();
    this.itemLabels.forEach((label) => label.destroy());
    this.itemLabels.clear();
    this.pawns.forEach((pawn) => pawn.root.destroy());
    this.pawns.clear();
    this.raiders.forEach((raider) => raider.destroy());
    this.raiders.clear();
    this.traders.forEach((trader) => trader.destroy());
    this.traders.clear();
    this.beasts.forEach((beast) => beast.destroy());
    this.beasts.clear();

    const map = this.make.tilemap({ width: world.width, height: world.height, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage(TILESET_KEY, TILESET_KEY, TILE, TILE, 0, 0)!;
    const layer = (name: string, depth: number) => map.createBlankLayer(name, tileset)!.setDepth(depth);
    this.layers = {
      terrain: layer('terrain', 0),
      floor: layer('floor', 0.6),
      // Planned floors show under furniture rather than over it.
      floorPlan: layer('floorPlan', 0.7).setAlpha(0.55),
      zone: layer('zone', 1),
      indoor: layer('indoor', 2),
      feature: layer('feature', 3),
      items: layer('items', 4),
      roof: layer('roof', 4.6),
      blueprint: layer('blueprint', 5).setAlpha(0.55),
      designation: layer('designation', 6),
    };
    this.map = map;

    for (let i = 0; i < world.size; i++) {
      this.drawTile(world, i);
    }
    this.syncIndoor(world);
    this.roomsVersion = world.structureVersion;
    world.dirty.clear();

    const size = world.width * TILE;
    this.night.setSize(size + 4000, size + 4000).setPosition(-2000, -2000);
    this.cameras.main.setBounds(-TILE * 8, -TILE * 8, size + TILE * 16, size + TILE * 16);
    for (const c of controller.sim.colonists) {
      this.pawns.set(c.id, this.createPawn(c));
    }
  }

  private put(layer: Phaser.Tilemaps.TilemapLayer, x: number, y: number, frame: number): void {
    if (frame < 0) {
      layer.removeTileAt(x, y, false, false);
    } else {
      layer.putTileAt(frame, x, y, false);
    }
  }

  private drawTile(world: World, i: number): void {
    const x = world.xOf(i);
    const y = world.yOf(i);
    const L = this.layers;
    const variant = hash2(x, y, 17) < 0.5 ? 0 : 1;
    this.put(L.terrain, x, y, Frames.terrain(world.terrain[i], variant));
    this.put(L.floor, x, y, world.floor[i] !== NONE ? Frames.feature(world.floor[i]) : -1);
    this.put(L.roof, x, y, world.roof[i] !== NONE ? Frames.feature(world.roof[i]) : -1);
    const zone = world.zone[i];
    this.put(L.zone, x, y, zone === 0 ? -1 : zone >= GROW_ZONE ? Frames.GROW_ZONE : Frames.ZONE);
    const f = world.feature[i];
    const featureFrame = f === NONE ? -1 : featureDef(f).crop ? Frames.crop(f, world.growth[i]) : Frames.feature(f);
    this.put(L.feature, x, y, featureFrame);
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
      label = this.add
        .text((world.xOf(i) + 1) * TILE - 1, (world.yOf(i) + 1) * TILE, '', {
          fontFamily: 'monospace',
          fontSize: '6px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(1, 1)
        .setResolution(4)
        .setDepth(4.5);
      this.itemLabels.set(i, label);
    }
    label.setText(String(count));
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
    const body = this.add.image(0, 0, 'pawn-body').setTint(color);
    const head = this.add.image(0, 0, 'pawn-head');
    const figure = this.add.container(0, 0, [body, head]);
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
      .setResolution(4);
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
    const root = this.add.container(0, 0, [figure, carry, label, zzz, alert]).setDepth(Depth.PAWNS);
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
      pawn.root.setPosition(x, y + (moving ? -Math.abs(Math.sin(time / 90)) * 1.2 : 0));
      pawn.root.setAlpha(dead ? 0.55 : 1);
      pawn.figure.setAngle(c.sleeping || dead || downed ? 90 : 0);
      pawn.zzz.setVisible(c.sleeping).setY(-6 - ((time / 400) % 3));
      pawn.label.setVisible(controller.settings.showNames);
      pawn.alert
        .setText(downed ? '+' : '!')
        .setColor(downed ? '#ff5c5c' : '#ff7a5c')
        .setVisible(downed || controller.sim.inMentalBreak(c));
      if (c.carrying) {
        pawn.carry.setFrame(Frames.item(c.carrying.item)).setVisible(true);
      } else {
        pawn.carry.setVisible(false);
      }
    }
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
        trader = this.add.container(0, 0, [body, head, label]).setDepth(Depth.PAWNS);
        this.traders.set(v.id, trader);
      }
      const to = v.path.length > 0 ? v.path[0] : v.tile;
      const x = world.xOf(v.tile) + (world.xOf(to) - world.xOf(v.tile)) * v.moveProgress;
      const y = world.yOf(v.tile) + (world.yOf(to) - world.yOf(v.tile)) * v.moveProgress;
      trader.setPosition((x + 0.5) * TILE, (y + 0.5) * TILE);
      (trader.getAt(2) as Phaser.GameObjects.Text).setVisible(controller.settings.showNames);
    }
  }

  private createRaider(e: Enemy): Phaser.GameObjects.Container {
    const tint = e.faction === 0 ? 0x8a5a3c : 0x5a5a64;
    const body = this.add.image(0, 0, 'pawn-body').setTint(tint);
    const head = this.add.image(0, 0, 'raider-head');
    const label = this.add
      .text(0, -11, e.name, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '6px',
        color: '#ff8a8a',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1)
      .setResolution(4);
    return this.add.container(0, 0, [body, head, label]).setDepth(Depth.PAWNS);
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
      beast.setPosition((x + 0.5) * TILE, (y + 0.5) * TILE);
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
    const body = this.add.image(0, 0, `animal-${a.kind}`);
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
    const alive = new Set(sim.enemies.map((e) => e.id));
    for (const [id, raider] of this.raiders) {
      if (!alive.has(id)) {
        raider.destroy();
        this.raiders.delete(id);
      }
    }
    for (const e of sim.enemies) {
      let raider = this.raiders.get(e.id);
      if (!raider) {
        raider = this.createRaider(e);
        this.raiders.set(e.id, raider);
      }
      const to = e.path.length > 0 ? e.path[0] : e.tile;
      const t = e.moveProgress;
      const x = world.xOf(e.tile) + (world.xOf(to) - world.xOf(e.tile)) * t;
      const y = world.yOf(e.tile) + (world.yOf(to) - world.yOf(e.tile)) * t;
      raider.setPosition((x + 0.5) * TILE, (y + 0.5) * TILE).setAlpha(e.fleeing ? 0.6 : 1);
      // The name label is the container's last child.
      (raider.getAt(2) as Phaser.GameObjects.Text).setVisible(controller.settings.showNames);
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
        g.fillStyle(0xff5c5c, 0.9).fillCircle(tx, ty, 3);
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
    const color = TOOL_COLORS[tool.kind];
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

  private updateNight(): void {
    const hour = controller.sim.hour;
    // Fade over two hours around dusk and dawn.
    let dark: number;
    if (hour >= NIGHT_START || hour < NIGHT_END) {
      dark = 1;
    } else if (hour >= NIGHT_START - 2) {
      dark = (hour - (NIGHT_START - 2)) / 2;
    } else if (hour < NIGHT_END + 1) {
      dark = 1 - (hour - NIGHT_END);
    } else {
      dark = 0;
    }
    this.night.setFillStyle(0x0a1230, dark * 0.55);
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
    for (let y = view.y0; y <= view.y1; y++) {
      for (let x = view.x0; x <= view.x1; x++) {
        const i = world.idx(x, y);
        if (world.blocksRoom(i)) {
          continue;
        }
        const t = sim.temperatureAt(i);
        const color = t <= 0 ? 0x4f7cff : t < 10 ? 0x7fc8ff : t <= 26 ? 0x8fe36b : t <= 32 ? 0xffb347 : 0xff5c5c;
        g.fillStyle(color, 0.28).fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }

  private drawGlow(dark: number): void {
    const world = controller.sim.world;
    if (world.featureVersion !== this.glowVersion) {
      this.glowVersion = world.featureVersion;
      this.glowSources = [];
      for (let i = 0; i < world.size; i++) {
        const f = world.feature[i];
        if (f !== NONE && (featureDef(f).heater > 0 || featureDef(f).workbench === 'cooking')) {
          this.glowSources.push(i);
        }
      }
    }
    const g = this.glow;
    g.clear();
    if (dark <= 0) {
      return;
    }
    const time = this.time.now;
    // Glow reaches about four tiles, so skip fires well off screen.
    const view = this.visibleTiles();
    for (const i of this.glowSources) {
      if (
        world.xOf(i) < view.x0 - 4 ||
        world.xOf(i) > view.x1 + 4 ||
        world.yOf(i) < view.y0 - 4 ||
        world.yOf(i) > view.y1 + 4
      ) {
        continue;
      }
      const strength = featureDef(world.feature[i]).heater > 0 ? 1 : 0.4;
      const flicker = 0.85 + 0.15 * Math.sin(time / 110 + i);
      const x = (world.xOf(i) + 0.5) * TILE;
      const y = (world.yOf(i) + 0.5) * TILE;
      for (const radius of [3.6, 3, 2.4, 1.8, 1.2, 0.7]) {
        g.fillStyle(0xff9a3c, 0.035 * dark * strength * flicker).fillCircle(x, y, radius * TILE);
      }
    }
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
        break;
      case 'hunt':
        controller.command({ type: 'hunt', rect, add: true });
        break;
      case 'tame':
        controller.command({ type: 'tame', rect, add: true });
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
    const cam = this.cameras.main;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) {
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
      const oldZoom = cam.zoom;
      const zoom = Phaser.Math.Clamp(oldZoom * (dy > 0 ? 1 / 1.15 : 1.15), this.minZoom(), MAX_ZOOM);
      // Keep the point under the cursor fixed while zooming.
      const worldX = cam.scrollX + cam.width / 2 + (pointer.x - cam.width / 2) / oldZoom;
      const worldY = cam.scrollY + cam.height / 2 + (pointer.y - cam.height / 2) / oldZoom;
      cam.setZoom(zoom);
      cam.setScroll(
        worldX - cam.width / 2 - (pointer.x - cam.width / 2) / zoom,
        worldY - cam.height / 2 - (pointer.y - cam.height / 2) / zoom,
      );
    });
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
