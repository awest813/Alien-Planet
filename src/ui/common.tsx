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
