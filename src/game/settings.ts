// Player preferences, remembered in browser storage between visits. Storage can be unavailable
// (private mode, blocked site data), so reading and writing never throw; the game just falls
// back to the defaults.

export interface Settings {
  // Save to the autosave slot every dawn and when the player leaves the page.
  autosave: boolean;
  // Pause the game when a raid begins.
  pauseOnRaid: boolean;
  // Pause the game when a colonist dies or collapses (outside a raid).
  pauseOnEmergency: boolean;
  // Size of the whole interface, as a multiple of normal.
  uiScale: number;
  // Name labels over colonists and raiders.
  showNames: boolean;
  showMinimap: boolean;
  // The screen flash when lightning strikes.
  lightningFlashes: boolean;
  // Dusk, night and dawn shading, with lamps and fires lighting the dark.
  dayNightLighting: boolean;
  // How long notification cards stay up.
  noticeSeconds: number;
  // Keyboard panning speed, as a multiple of normal.
  panSpeed: number;
  // Sound, off until the player turns it on, and its volumes (0..1).
  sound: boolean;
  masterVolume: number;
  musicVolume: number;
  effectsVolume: number;
  // The last new colony's difficulty, map size, land and map, offered again next time.
  newDifficulty: string;
  newMapSize: number;
  newBiome: string;
  newMap: string;
}

function defaultScale(): number {
  try {
    const { innerWidth: w, innerHeight: h } = window;
    return w >= 2400 && h >= 1300 ? 1.3 : w >= 1800 && h >= 1000 ? 1.15 : 1;
  } catch {
    return 1;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export const DEFAULT_SETTINGS: Settings = {
  autosave: true,
  pauseOnRaid: true,
  pauseOnEmergency: true,
  // Bigger screens start with a bigger interface.
  uiScale: defaultScale(),
  showNames: true,
  showMinimap: true,
  // Off for anyone whose system asks for less motion.
  lightningFlashes: !prefersReducedMotion(),
  dayNightLighting: true,
  noticeSeconds: 8,
  panSpeed: 1,
  sound: false,
  masterVolume: 0.7,
  musicVolume: 0.8,
  effectsVolume: 0.8,
  newDifficulty: 'standard',
  newMapSize: 64,
  newBiome: 'temperate',
  newMap: 'valley',
};

export const UI_SCALES = [
  { value: 0.85, label: 'Small' },
  { value: 1, label: 'Normal' },
  { value: 1.15, label: 'Large' },
  { value: 1.3, label: 'Huge' },
];

export const NOTICE_TIMES = [
  { value: 5, label: 'Short' },
  { value: 8, label: 'Normal' },
  { value: 14, label: 'Long' },
];

export const PAN_SPEEDS = [
  { value: 0.6, label: 'Slow' },
  { value: 1, label: 'Normal' },
  { value: 1.6, label: 'Fast' },
];

const KEY = 'colony-alpha:settings';

export function loadSettings(): Settings {
  const settings = { ...DEFAULT_SETTINGS };
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (stored && typeof stored === 'object') {
      // Take only known keys with the right type, so an old or edited entry can't break anything.
      for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
        const value = (stored as Record<string, unknown>)[key];
        if (typeof value === typeof DEFAULT_SETTINGS[key]) {
          (settings as Record<string, unknown>)[key] = value;
        }
      }
    }
  } catch {
    // Unreadable: use the defaults.
  }
  // An old or edited entry can hold a number no option offers (a scale of 0 would hide the whole
  // interface, Settings included): snap the choices to their options and keep volumes in 0..1.
  const snap = (value: number, options: { value: number }[], fallback: number) =>
    options.some((o) => o.value === value) ? value : fallback;
  settings.uiScale = snap(settings.uiScale, UI_SCALES, DEFAULT_SETTINGS.uiScale);
  settings.noticeSeconds = snap(settings.noticeSeconds, NOTICE_TIMES, DEFAULT_SETTINGS.noticeSeconds);
  settings.panSpeed = snap(settings.panSpeed, PAN_SPEEDS, DEFAULT_SETTINGS.panSpeed);
  for (const key of ['masterVolume', 'musicVolume', 'effectsVolume'] as const) {
    const v = settings[key];
    settings[key] = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_SETTINGS[key];
  }
  return settings;
}

export function storeSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not remembered; the settings still apply for this visit.
  }
}

// Whether the welcome help has been seen (it opens by itself on a first colony until then).
const HELP_SEEN_KEY = 'colony-alpha:help-seen';

export function helpSeen(): boolean {
  try {
    return localStorage.getItem(HELP_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markHelpSeen(): void {
  try {
    localStorage.setItem(HELP_SEEN_KEY, '1');
  } catch {
    // Not remembered; the help will show again next time.
  }
}

export function forgetHelp(): void {
  try {
    localStorage.removeItem(HELP_SEEN_KEY);
  } catch {
    // Nothing stored to forget.
  }
}
