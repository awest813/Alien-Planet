import { useSyncExternalStore } from 'react';
import { UiState, controller } from '../game/controller';
import { ScheduleSlot, WorkTypeKey } from '../sim/types';

export const useUiState = (): UiState => useSyncExternalStore(controller.subscribe, controller.getState);

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
