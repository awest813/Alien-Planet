import { App as CapacitorApp } from '@capacitor/app';
import Phaser from 'phaser';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { sound } from './game/audio';
import { controller } from './game/controller';
import { ColonyScene } from './render/colony-scene';
import { triggerEvent } from './sim/storyteller';
import { App } from './ui/App';
import './ui/styles.css';

// Phaser draws the world; React draws the management UI on top of it.
//
// On a sharp (high-density) screen the canvas has that many more pixels than the page gives it, and is shown at
// the page's size: drawn at the page's resolution, the browser blew it up and the map looked soft. (At most
// twice: three times over, a phone's GPU paints more than twice the pixels again for little to see.)
const pixelRatio = () => Math.min(2, Math.max(1, window.devicePixelRatio || 1));
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
  if (next !== ratio) {
    ratio = next;
    game.scale.setZoom(1 / ratio);
  }
  const page = pageSize();
  const width = Math.round(page.width * ratio);
  const height = Math.round(page.height * ratio);
  if (game.scale.width !== width || game.scale.height !== height) {
    game.scale.resize(width, height);
  }
};
new ResizeObserver(fit).observe(document.getElementById('game')!);
window.addEventListener('resize', fit);

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
