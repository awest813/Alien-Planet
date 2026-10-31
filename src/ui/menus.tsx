import { useState } from 'react';
import { SAVE_SLOTS, UiState, controller, slotLabel } from '../game/controller';
import { SaveMeta } from '../game/save-store';
import { DEFAULT_SETTINGS, NOTICE_TIMES, PAN_SPEEDS, Settings, UI_SCALES, forgetHelp } from '../game/settings';
import { SAVE_VERSION } from '../sim/serialize';
import { MAP_SIZE, MAP_SIZES } from '../sim/simulation';
import { DIFFICULTIES, Difficulty } from '../sim/storyteller';
import { ConfirmButton, Modal } from './screens';

// What a menu can ask the app to do.
export interface MenuActions {
  // A colony is now being played (started, continued or loaded).
  onPlay: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onTitle: () => void | Promise<void>;
}

const saveDetails = (meta: SaveMeta) =>
  [
    `Day ${meta.day}, ${String(meta.hour).padStart(2, '0')}:00`,
    meta.colonists !== undefined ? `${meta.colonists} colonists` : null,
    DIFFICULTIES.find((d) => d.key === meta.difficulty)?.label ?? null,
    meta.mapSize !== undefined
      ? `${MAP_SIZES.find((m) => m.size === meta.mapSize)?.label ?? `${meta.mapSize}×${meta.mapSize}`} map`
      : null,
    new Date(meta.savedAt).toLocaleString(),
  ]
    .filter(Boolean)
    .join(' · ');

// Difficulty, map size and seed for a new colony.
function NewColonyForm({ confirm, onStarted }: { confirm: boolean; onStarted: () => void }) {
  const [seed, setSeed] = useState('');
  // Start from whatever the player chose last time.
  const last = controller.settings;
  const [difficulty, setDifficulty] = useState<Difficulty>(
    DIFFICULTIES.find((d) => d.key === last.newDifficulty)?.key ?? 'standard',
  );
  const [mapSize, setMapSize] = useState(MAP_SIZES.find((m) => m.size === last.newMapSize)?.size ?? MAP_SIZE);
  const start = () => {
    controller.newColony(seed, difficulty, mapSize);
    onStarted();
  };
  return (
    <>
      <div className="difficulties">
        {DIFFICULTIES.map((d) => (
          <button key={d.key} className={difficulty === d.key ? 'active' : ''} onClick={() => setDifficulty(d.key)}>
            <b>{d.label}</b>
            <span>{d.description}</span>
          </button>
        ))}
      </div>
      <div className="difficulties">
        {MAP_SIZES.map((m) => (
          <button key={m.size} className={mapSize === m.size ? 'active' : ''} onClick={() => setMapSize(m.size)}>
            <b>{m.label} map</b>
            <span>{m.description}</span>
          </button>
        ))}
      </div>
      <div className="row">
        <input placeholder="Seed (blank for random)" value={seed} onChange={(e) => setSeed(e.target.value)} />
        {confirm ? (
          <ConfirmButton label="Start" confirm="Lose current?" onConfirm={start} />
        ) : (
          <button className="primary" onClick={start}>
            Start
          </button>
        )}
      </div>
    </>
  );
}

// The save slots: load only (from the title screen), or save, load and delete (in a game).
function SaveSlots({ state, manage, onLoaded }: { state: UiState; manage: boolean; onLoaded: () => void }) {
  const savesBySlot = new Map(state.saves.map((s) => [s.slot, s]));
  const load = async (slot: string) => {
    if (await controller.load(slot)) {
      onLoaded();
    }
  };
  return (
    <table className="saves">
      <tbody>
        {SAVE_SLOTS.map((slot) => {
          const meta = savesBySlot.get(slot);
          const outdated = !!meta && meta.version !== SAVE_VERSION;
          return (
            <tr key={slot}>
              <td>{slotLabel(slot)}</td>
              <td className="muted">
                {meta ? saveDetails(meta) : 'Empty'}
                {outdated && <span className="tag warn">older version</span>}
              </td>
              <td>
                {manage &&
                  slot !== 'autosave' &&
                  (meta ? (
                    <ConfirmButton label="Save" confirm="Overwrite?" onConfirm={() => controller.save(slot)} />
                  ) : (
                    <button onClick={() => controller.save(slot)}>Save</button>
                  ))}
                {manage ? (
                  <ConfirmButton
                    label="Load"
                    confirm="Lose current?"
                    disabled={!meta || outdated}
                    onConfirm={() => load(slot)}
                  />
                ) : (
                  <button disabled={!meta || outdated} onClick={() => load(slot)}>
                    Load
                  </button>
                )}
                {meta && manage && (
                  <ConfirmButton label="Delete" confirm="Delete?" onConfirm={() => controller.deleteSave(slot)} />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// The first thing a player sees: carry on, start fresh, or load.
export function TitleScreen({ state, actions }: { state: UiState; actions: MenuActions }) {
  const [view, setView] = useState<'main' | 'new' | 'load'>('main');
  const latest = state.latestSave;
  return (
    <div className="title-screen">
      <div className="panel title-panel" role="dialog" aria-modal="true" aria-label="Colony Alpha">
        <h1>Colony Alpha</h1>
        <p className="muted tagline">Five colonists, a strange valley, and a winter coming.</p>
        {view === 'main' && (
          <div className="title-buttons">
            {latest && (
              <button
                className="primary"
                autoFocus
                onClick={async () => (await controller.continueLatest()) && actions.onPlay()}
              >
                Continue
                <span className="muted">
                  {slotLabel(latest.slot)} · {saveDetails(latest)}
                </span>
              </button>
            )}
            <button className={latest ? '' : 'primary'} autoFocus={!latest} onClick={() => setView('new')}>
              New colony
            </button>
            <button onClick={() => setView('load')}>Load game</button>
            <button onClick={actions.onSettings}>Settings</button>
            <button onClick={actions.onHelp}>How to play</button>
          </div>
        )}
        {view === 'new' && (
          <>
            <h3>New colony</h3>
            <NewColonyForm confirm={false} onStarted={actions.onPlay} />
            <div className="row end">
              <button onClick={() => setView('main')}>Back</button>
            </div>
          </>
        )}
        {view === 'load' && (
          <>
            <h3>Load game</h3>
            <SaveSlots state={state} manage={false} onLoaded={actions.onPlay} />
            <div className="row end">
              <button onClick={() => setView('main')}>Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Esc or the Menu button: the game is paused behind it.
export function PauseMenu({ state, onClose, actions }: { state: UiState; onClose: () => void; actions: MenuActions }) {
  const [view, setView] = useState<'main' | 'saves' | 'new'>('main');
  const current = DIFFICULTIES.find((d) => d.key === state.difficulty);
  return (
    <Modal title="Paused" onClose={onClose}>
      <p className="muted">
        Day {state.day} · {state.colonists.filter((c) => !c.dead).length} colonists · {current?.label} · {state.mapSize}
        ×{state.mapSize} map · seed {state.seed}
      </p>
      {view === 'main' && (
        <div className="title-buttons">
          <button className="primary" autoFocus onClick={onClose}>
            Resume
          </button>
          <button onClick={() => setView('saves')}>Save or load</button>
          <button onClick={() => setView('new')}>New colony</button>
          <button onClick={actions.onSettings}>Settings</button>
          <button onClick={actions.onHelp}>How to play</button>
          {state.settings.autosave ? (
            <button onClick={actions.onTitle}>Quit to title (autosaves)</button>
          ) : (
            <ConfirmButton label="Quit to title" confirm="Unsaved progress is lost" onConfirm={actions.onTitle} />
          )}
        </div>
      )}
      {view === 'saves' && (
        <>
          <SaveSlots state={state} manage onLoaded={onClose} />
          <p className="muted">
            {state.settings.autosave
              ? 'The game autosaves every dawn and when you leave the page.'
              : 'Autosave is off (Settings): save by hand.'}
          </p>
          <div className="row end">
            <button onClick={() => setView('main')}>Back</button>
          </div>
        </>
      )}
      {view === 'new' && (
        <>
          <NewColonyForm confirm onStarted={actions.onPlay} />
          <div className="row end">
            <button onClick={() => setView('main')}>Back</button>
          </div>
        </>
      )}
    </Modal>
  );
}

// Everyone has died: how it went, and where to go next.
export function FallenScreen({ state, actions }: { state: UiState; actions: MenuActions }) {
  const [view, setView] = useState<'main' | 'new' | 'load'>('main');
  const goals = state.objectives.filter((o) => o.done).length;
  const stats = [
    ['Days survived', state.day],
    ['Colonists', state.colonists.length],
    ['Winters survived', state.stats.wintersSurvived],
    ['Raids repelled', state.stats.raidsRepelled],
    ['Raiders brought down', state.stats.kills],
    ['Animals hunted', state.stats.hunted],
    ['Buildings built', state.stats.built],
    ['Animals tamed', state.stats.tamed],
    ['Goals reached', `${goals} of ${state.objectives.length}`],
  ];
  return (
    <Modal title="The colony has fallen" onClose={() => undefined} closable={false}>
      <p>Everyone has died. Here is how the colony fared.</p>
      <table className="summary">
        <tbody>
          {stats.map(([label, value]) => (
            <tr key={label}>
              <td>{label}</td>
              <td className="num">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {view === 'main' && (
        <div className="title-buttons">
          <button className="primary" autoFocus onClick={() => setView('new')}>
            New colony
          </button>
          <button onClick={() => setView('load')}>Load a save</button>
          <button onClick={actions.onTitle}>Title screen</button>
        </div>
      )}
      {view === 'new' && <NewColonyForm confirm={false} onStarted={actions.onPlay} />}
      {view === 'load' && <SaveSlots state={state} manage={false} onLoaded={actions.onPlay} />}
      {view !== 'main' && (
        <div className="row end">
          <button onClick={() => setView('main')}>Back</button>
        </div>
      )}
    </Modal>
  );
}

function Choice<T extends number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="setting">
      <span>{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? 'active' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="setting">
      <span>{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

const CONTROLS: [string, string][] = [
  ['Space', 'Pause or resume'],
  ['1 · 2 · 3', 'Game speed'],
  ['W A S D / arrows', 'Move the view (or drag with the right mouse button)'],
  ['Mouse wheel', 'Zoom'],
  ['Tab', 'Jump to the next colonist'],
  ['Q', 'Draft the selected colonist, or everyone'],
  ['Right-click', 'Move a drafted colonist, or drop the current tool'],
  ['Esc', 'Close a screen, drop the tool, clear the selection, then open the menu'],
  ['Letter keys', 'Tools: hover a button in the bottom bar to see its key'],
];

export function SettingsScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  const [helpReset, setHelpReset] = useState(false);
  const s = state.settings;
  const set = (patch: Partial<Settings>) => controller.setSettings(patch);
  return (
    <Modal title="Settings" onClose={onClose}>
      <h3>Game</h3>
      <Toggle label="Autosave at dawn and when leaving" value={s.autosave} onChange={(v) => set({ autosave: v })} />
      <Toggle label="Pause when raiders arrive" value={s.pauseOnRaid} onChange={(v) => set({ pauseOnRaid: v })} />
      <Toggle
        label="Pause when a colonist dies or collapses"
        value={s.pauseOnEmergency}
        onChange={(v) => set({ pauseOnEmergency: v })}
      />
      <h3>Display</h3>
      <Choice label="Interface size" value={s.uiScale} options={UI_SCALES} onChange={(v) => set({ uiScale: v })} />
      <Choice
        label="Notifications stay"
        value={s.noticeSeconds}
        options={NOTICE_TIMES}
        onChange={(v) => set({ noticeSeconds: v })}
      />
      <Choice label="Camera speed" value={s.panSpeed} options={PAN_SPEEDS} onChange={(v) => set({ panSpeed: v })} />
      <Toggle label="Names over colonists and raiders" value={s.showNames} onChange={(v) => set({ showNames: v })} />
      <Toggle label="Minimap" value={s.showMinimap} onChange={(v) => set({ showMinimap: v })} />
      <h3>Controls</h3>
      <table className="summary">
        <tbody>
          {CONTROLS.map(([key, what]) => (
            <tr key={key}>
              <td>
                <kbd>{key}</kbd>
              </td>
              <td>{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button onClick={() => set({ ...DEFAULT_SETTINGS })}>Reset to defaults</button>
        <button
          disabled={helpReset}
          onClick={() => {
            forgetHelp();
            setHelpReset(true);
          }}
        >
          {helpReset ? 'Welcome will show on your next colony' : 'Show the welcome screen again'}
        </button>
      </div>
    </Modal>
  );
}
