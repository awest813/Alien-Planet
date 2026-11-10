import { TOUCH } from './touch';
import { useEffect, useRef, useState } from 'react';
import { controller } from '../game/controller';
import { NONE, featureDef, terrainDef } from '../sim/defs';

// Minimap colours by terrain, then by what stands on it.
const TERRAIN_COLORS: Record<string, string> = {
  deepWater: '#1d4670',
  shallowWater: '#3d7bb0',
  ice: '#cfe4ef',
  sand: '#d6c286',
  grass: '#5a8a38',
  soil: '#6c553a',
  stoneFloor: '#77746f',
};
const FEATURE_COLORS: Record<string, string> = { tree: '#2f5d27', rock: '#4a4a4f', berryBush: '#3e7a31' };
const BUILDING_COLOR = '#d9c9a3';
// The terrain picture is rebuilt this often; colonists and the view box are drawn every frame.
const TERRAIN_REFRESH_MS = 2000;
// On-screen size of the minimap, in CSS pixels.
const SIZE = 150;

function terrainImage(): HTMLCanvasElement {
  const world = controller.sim.world;
  const canvas = document.createElement('canvas');
  canvas.width = world.width;
  canvas.height = world.height;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(world.width, world.height);
  const rgb = (hex: string) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  const cache = new Map<string, number[]>();
  const colorOf = (hex: string) => cache.get(hex) ?? (cache.set(hex, rgb(hex)), cache.get(hex)!);
  for (let i = 0; i < world.size; i++) {
    const f = world.feature[i];
    let hex = TERRAIN_COLORS[terrainDef(world.terrain[i]).key] ?? '#000000';
    if (f !== NONE) {
      const def = featureDef(f);
      hex = FEATURE_COLORS[def.key] ?? (def.natural || def.crop ? hex : BUILDING_COLOR);
    }
    const [r, g, b] = colorOf(hex);
    image.data.set([r, g, b, 255], i * 4);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// A small overview of the whole map: click or drag on it to move the view.
export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!open) {
      return;
    }
    let frame = 0;
    let terrain: HTMLCanvasElement | null = null;
    let builtAt = -Infinity;
    let builtFor = -1;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) {
        return;
      }
      const sim = controller.sim;
      const world = sim.world;
      if (!terrain || now - builtAt > TERRAIN_REFRESH_MS || builtFor !== controller.simVersion) {
        terrain = terrainImage();
        builtAt = now;
        builtFor = controller.simVersion;
      }
      const scale = canvas.width / Math.max(world.width, world.height);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#0d0f14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(terrain, 0, 0, world.width * scale, world.height * scale);
      const dot = (tile: number, color: string, size: number) => {
        ctx.fillStyle = color;
        ctx.fillRect(
          (world.xOf(tile) + 0.5) * scale - size / 2,
          (world.yOf(tile) + 0.5) * scale - size / 2,
          size,
          size,
        );
      };
      for (const a of sim.animals) {
        if (a.tame) {
          dot(a.tile, '#ffd166', 3);
        }
      }
      for (const c of sim.colonists) {
        if (c.health.dead || c.away === 'gone') {
          continue;
        }
        dot(c.tile, c.color, 4);
      }
      for (const e of sim.enemies) {
        dot(e.tile, '#ff3b3b', 4);
      }
      const view = controller.cameraView;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        view.x0 * scale + 0.5,
        view.y0 * scale + 0.5,
        (view.x1 - view.x0) * scale,
        (view.y1 - view.y0) * scale,
      );
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Centre the view on the clicked spot, and keep following while the button is held.
  const panTo = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const world = controller.sim.world;
    const rect = canvas.getBoundingClientRect();
    const tilesPerPixel = Math.max(world.width, world.height) / rect.width;
    const x = Math.floor((event.clientX - rect.left) * tilesPerPixel);
    const y = Math.floor((event.clientY - rect.top) * tilesPerPixel);
    if (world.inBounds(x, y)) {
      controller.focusRequest = world.idx(x, y);
    }
  };

  if (!open) {
    return (
      <button className="panel minimap-toggle" onClick={() => setOpen(true)} title="Show the minimap">
        Map
      </button>
    );
  }
  return (
    <div className="panel minimap">
      <div className="minimap-head">
        <span className="muted">Map</span>
        <button onClick={() => setOpen(false)} title="Hide the minimap" aria-label="Hide the minimap">
          ▾
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={SIZE * 2}
        height={SIZE * 2}
        style={{ width: SIZE, height: SIZE }}
        aria-label={TOUCH ? 'Minimap: tap to move the view' : 'Minimap: click to move the view'}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          panTo(e);
        }}
        onPointerMove={(e) => e.buttons === 1 && panTo(e)}
      />
    </div>
  );
}
