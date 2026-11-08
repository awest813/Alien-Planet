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
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#10141c',
  pixelArt: true,
  // The game makes its own sound (game/audio.ts), and only once the player turns it on.
  audio: { noAudio: true },
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  scene: [ColonyScene],
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
