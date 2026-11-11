import { App as CapacitorApp } from '@capacitor/app';
import Phaser from 'phaser';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { sound } from './game/audio';
import { controller } from './game/controller';
import { ColonyScene } from './render/colony-scene';
import { SHARPNESS_AUTO, autoSharpness, canvasRatio, retrySharp } from './render/sharpness';
import { triggerEvent } from './sim/storyteller';
import { App } from './ui/App';
import './ui/styles.css';

// Phaser draws the world; React draws the management UI on top of it.
//
// On a sharp (high-density) screen the canvas has more pixels than the page gives it, and is shown at the page's
// size: drawn at the page's resolution, the browser blew it up and the map looked soft. How many more is the
// "Map sharpness" setting's (render/sharpness.ts); Auto drops to the page's resolution if the frames run slow.
const pixelRatio = () => canvasRatio(controller.settings.mapSharpness, window.devicePixelRatio, autoSharpness.slow);
let ratio = pixelRatio();
const pageSize = () => {
  const box = document.getElementById('game')!.getBoundingClientRect();
  return { width: Math.max(1, Math.round(box.width)), height: Math.max(1, Math.round(box.height)) };
};
const start = pageSize();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#10141c',
  pixelArt: true,
  // The game makes its own sound (game/audio.ts), and only once the player turns it on.
  audio: { noAudio: true },
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.NONE,
    width: Math.round(start.width * ratio),
    height: Math.round(start.height * ratio),
    zoom: 1 / ratio,
  },
  scene: [ColonyScene],
});

// Follows the page's size (a window resized, a phone turned) and its pixel density (the browser zoomed, the
// window moved to another screen).
const fit = () => {
  const next = pixelRatio();
  const page = pageSize();
  const width = Math.round(page.width * next);
  const height = Math.round(page.height * next);
  if (next !== ratio || game.scale.width !== width || game.scale.height !== height) {
    ratio = next;
    game.scale.resize(width, height);
    // (After the resize, and every time: it's what sets the canvas's size on the page. A resize alone leaves that
    // as it was when the zoom is 1, and going from sharp to fast showed the map at twice the size, a quarter of
    // it on screen.)
    game.scale.setZoom(1 / ratio);
  }
};
new ResizeObserver(fit).observe(document.getElementById('game')!);
window.addEventListener('resize', fit);
// The density can change with no resize (the window dragged to another screen): a media query for the present
// density says when it stops matching. (A narrow range round it, not the exact figure: a fractional density, 1.1
// at 110%, is 1.100000023841858 to the page, and a browser that rounds it differently would never match the
// exact query, so never say when it changed.)
const watchDensity = () => {
  const dpr = window.devicePixelRatio;
  window
    .matchMedia(`(min-resolution: ${dpr - 0.005}dppx) and (max-resolution: ${dpr + 0.005}dppx)`)
    .addEventListener('change', () => (fit(), watchDensity()), { once: true });
};
watchDensity();

// The setting changed (and switching back to Auto from Sharp or Fast gives sharp another try; so does the button
// for it in Settings).
let setting = controller.settings.mapSharpness;
controller.subscribe(() => {
  if (controller.settings.mapSharpness !== setting) {
    setting = controller.settings.mapSharpness;
    if (setting === SHARPNESS_AUTO) {
      retrySharp();
    }
  }
  fit();
});

// Auto, drawing sharp: watch for slow frames. (Timed by the clock: Phaser's own frame time is smoothed, and said
// 17 ms for frames a quarter of a second apart.)
let lastStep = performance.now();
game.events.on(Phaser.Core.Events.STEP, () => {
  const now = performance.now();
  const delta = now - lastStep;
  lastStep = now;
  if (autoSharpness.slow || ratio <= 1 || controller.settings.mapSharpness !== SHARPNESS_AUTO || document.hidden) {
    return;
  }
  if (autoSharpness.watch.frame(delta)) {
    autoSharpness.slow = true;
    fit();
    controller.hint('The map is drawn less sharply to keep the game running smoothly (Settings: Map sharpness).');
  }
});

createRoot(document.getElementById('ui')!).render(createElement(App));

// Handy for poking at the simulation from the browser console during development,
// e.g. `colonyEvent(colony.sim, 'raid')`; `colonyGame` is the Phaser game, for timing frames.
if (import.meta.env.DEV) {
  Object.assign(window, { colony: controller, colonyEvent: triggerEvent, colonySound: sound, colonyGame: game });
}

// Minimise instead of quitting when the Android back button is pressed.
CapacitorApp.addListener('backButton', () => {
  CapacitorApp.minimizeApp();
});
