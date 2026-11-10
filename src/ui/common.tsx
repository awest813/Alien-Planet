import { useRef, useSyncExternalStore } from 'react';
import { HoverView, UiState, controller } from '../game/controller';
import { share } from '../game/share';
import { ScheduleSlot, WorkTypeKey } from '../sim/types';

// The part of the interface's state a panel shows, picked out by `pick`: the panel redraws only when that part
// changes (a clock ticking over doesn't redraw the work grid). What `pick` gives back is compared by value, so it
// may build a new object or list each time.
export function useUi<T>(pick: (state: UiState) => T): T {
  const cache = useRef<{ state: UiState; pick: (state: UiState) => T; value: T } | null>(null);
  const snapshot = (): T => {
    const state = controller.getState();
    const last = cache.current;
    if (last && last.state === state && last.pick === pick) {
      return last.value;
    }
    const value = share(last?.value as T, pick(state), true);
    cache.current = { state, pick, value };
    return value;
  };
  return useSyncExternalStore(controller.subscribe, snapshot);
}

// A pick of some of the state's fields as they are, for useUi.
export function fields<K extends keyof UiState>(...keys: K[]): (state: UiState) => Pick<UiState, K> {
  return (state) => {
    const out = {} as Pick<UiState, K>;
    for (const key of keys) {
      out[key] = state[key];
    }
    return out;
  };
}

// What the mouse is over (a store of its own: the mouse moves far more often than anything else changes).
export const useHover = (): HoverView | null => useSyncExternalStore(controller.subscribeHover, controller.getHover);

export const WORK_LABELS: Record<WorkTypeKey, string> = {
  doctor: 'Doctor',
  cooking: 'Cook',
  construction: 'Construct',
  growing: 'Grow',
  mining: 'Mine',
  plantCutting: 'Cut plants',
  hunting: 'Hunt',
  handling: 'Handle',
  warden: 'Warden',
  crafting: 'Craft',
  art: 'Art',
  research: 'Research',
  hauling: 'Haul',
  cleaning: 'Clean',
};

export const SLOT_LABELS: Record<ScheduleSlot, string> = { A: 'Anything', W: 'Work', J: 'Recreation', S: 'Sleep' };

export function Bar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <span className="bar" title={`${label}: ${Math.round(value * 100)}%`}>
      <span className="bar-fill" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
    </span>
  );
}

export const moodColor = (mood: number) => (mood < 25 ? 'var(--warn)' : mood < 45 ? 'var(--accent)' : 'var(--good)');

// Arrow keys along a row of tabs (or a group of choices): Left/Right (and Home/End) move to the neighbouring one
// and pick it, as a tab list does.
export function arrowKeys(e: React.KeyboardEvent<HTMLElement>, selector = '[role=tab]'): void {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>(selector)];
  const at = items.indexOf(document.activeElement as HTMLElement);
  if (at < 0 || items.length === 0) {
    return;
  }
  const next =
    e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : step ? (at + step + items.length) % items.length : -1;
  if (next < 0) {
    return;
  }
  e.preventDefault();
  items[next].focus();
  items[next].click();
}
