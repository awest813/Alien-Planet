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
  // How long notification cards stay up.
  noticeSeconds: number;
  // Keyboard panning speed, as a multiple of normal.
  panSpeed: number;
  // The last new colony's difficulty and map size, offered again next time.
  newDifficulty: string;
  newMapSize: number;
}

export const DEFAULT_SETTINGS: Settings = {
  autosave: true,
  pauseOnRaid: true,
  pauseOnEmergency: true,
  uiScale: 1,
  showNames: true,
  showMinimap: true,
  noticeSeconds: 8,
  panSpeed: 1,
  newDifficulty: 'standard',
  newMapSize: 64,
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
