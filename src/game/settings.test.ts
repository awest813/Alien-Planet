import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, Settings, loadSettings, resetSettings, storeSettings } from './settings';

// Settings kept between visits: only what the player changed, read back safely whatever is stored.

const KEY = 'colony-alpha:settings';
const store = new Map<string, string>();
const g = globalThis as unknown as { localStorage?: unknown };

beforeEach(() => {
  store.clear();
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

afterEach(() => {
  delete g.localStorage;
});

describe('settings', () => {
  it('keep only what was changed, so defaults that follow the screen keep following it', () => {
    const screenDefault = DEFAULT_SETTINGS.uiScale;
    storeSettings({ ...DEFAULT_SETTINGS, masterVolume: 0.3 });
    expect(JSON.parse(store.get(KEY)!)).toEqual({ masterVolume: 0.3 });
    // A later visit on another screen (its own default size): that size, and the volume chosen.
    try {
      DEFAULT_SETTINGS.uiScale = 1.15;
      const later = loadSettings();
      expect(later.uiScale).toBe(1.15);
      expect(later.masterVolume).toBe(0.3);
    } finally {
      DEFAULT_SETTINGS.uiScale = screenDefault;
    }
    // A size the player picked stays picked.
    storeSettings({ ...DEFAULT_SETTINGS, uiScale: 0.85 });
    expect(loadSettings().uiScale).toBe(0.85);
  });

  it('a size picked on purpose is kept, though it was that visit’s default; after a reset, defaults follow again', () => {
    const screenDefault = DEFAULT_SETTINGS.uiScale;
    try {
      // A small window: the default is Normal, and the player picks Normal.
      DEFAULT_SETTINGS.uiScale = 1;
      loadSettings();
      storeSettings({ ...DEFAULT_SETTINGS, uiScale: 1 }, ['uiScale']);
      // Next visit, maximised: the default would be Huge, but Normal was their choice.
      DEFAULT_SETTINGS.uiScale = 1.3;
      expect(loadSettings().uiScale).toBe(1);
      // Reset: the choice forgotten, the screen's default again (the sound kept).
      const mine = { ...loadSettings(), sound: true };
      storeSettings(mine, ['sound']);
      storeSettings(resetSettings(mine));
      expect(loadSettings().uiScale).toBe(1.3);
      expect(loadSettings().sound).toBe(true);
    } finally {
      DEFAULT_SETTINGS.uiScale = screenDefault;
    }
  });

  it('read back anything stored safely: broken, of the wrong kind, or out of range', () => {
    for (const stored of ['not json', 'null', '[1,2]', '"text"']) {
      store.set(KEY, stored);
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    }
    store.set(
      KEY,
      JSON.stringify({ uiScale: 0, masterVolume: 5, musicVolume: -1, sound: 'yes', panSpeed: 99, scroll: 7, extra: 1 }),
    );
    const s: Settings = loadSettings();
    expect(s.uiScale).toBe(DEFAULT_SETTINGS.uiScale);
    expect(s.masterVolume).toBe(1);
    expect(s.musicVolume).toBe(0);
    expect(s.sound).toBe(DEFAULT_SETTINGS.sound);
    expect(s.panSpeed).toBe(DEFAULT_SETTINGS.panSpeed);
    expect(s.scroll).toBe(DEFAULT_SETTINGS.scroll);
    expect('extra' in s).toBe(false);
  });

  it('reset puts everything back but the sound being on and the last new colony’s choices', () => {
    const mine: Settings = {
      ...DEFAULT_SETTINGS,
      sound: true,
      masterVolume: 0.2,
      showNames: false,
      newDifficulty: 'harsh',
      newMapSize: 96,
      newBiome: 'desert',
      newMap: 'island',
      newSupplies: 'tools',
    };
    const reset = resetSettings(mine);
    expect(reset).toEqual({
      ...DEFAULT_SETTINGS,
      sound: true,
      newDifficulty: 'harsh',
      newMapSize: 96,
      newBiome: 'desert',
      newMap: 'island',
      newSupplies: 'tools',
    });
  });

  it('with no storage at all, the defaults, and nothing thrown', () => {
    delete g.localStorage;
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => storeSettings({ ...DEFAULT_SETTINGS, sound: true })).not.toThrow();
  });
});
