import { useState } from 'react';
import { SAVE_SLOTS, UiState, controller, slotLabel } from '../game/controller';
import { SaveMeta } from '../game/save-store';
import { DEFAULT_SETTINGS, NOTICE_TIMES, PAN_SPEEDS, Settings, UI_SCALES, forgetHelp } from '../game/settings';
import { SAVE_VERSION } from '../sim/serialize';
import { MAP_SIZE, MAP_SIZES } from '../sim/simulation';
import { DIFFICULTIES, Difficulty } from '../sim/storyteller';
import { dealBalance } from '../sim/trade';
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
      <h3>Difficulty</h3>
      <div className="difficulties">
        {DIFFICULTIES.map((d) => (
          <button key={d.key} className={difficulty === d.key ? 'active' : ''} onClick={() => setDifficulty(d.key)}>
            <b>{d.label}</b>
            <span>{d.description}</span>
          </button>
        ))}
      </div>
      <h3>Map size</h3>
      <div className="difficulties">
        {MAP_SIZES.map((m) => (
          <button key={m.size} className={mapSize === m.size ? 'active' : ''} onClick={() => setMapSize(m.size)}>
            <b>{m.label} map</b>
            <span>{m.description}</span>
          </button>
        ))}
      </div>
      <div className="row start-row">
        <input
          placeholder="Seed (optional)"
          aria-label="Seed"
          title="The same seed gives the same map; leave blank for a random one"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
        />
        {confirm ? (
          <ConfirmButton label="Start colony" confirm="Lose current?" onConfirm={start} />
        ) : (
          <button className="primary big" onClick={start}>
            Start colony
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
        <p className="muted tagline">A handful of colonists, a strange valley, and a winter coming.</p>
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
        Day {state.day} · {state.colonists.filter((c) => !c.dead).length} colonists · {current?.label} ·{' '}
        {MAP_SIZES.find((m) => m.size === state.mapSize)?.label ?? `${state.mapSize}×${state.mapSize}`} map · seed{' '}
        {state.seed}
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

// The ship has landed: the colony decides whether its story ends here.
export function ShipScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  const [sure, setSure] = useState(false);
  if (state.ship !== 'landed') {
    return (
      <Modal title="The ship" onClose={onClose}>
        <p>
          {state.ship === 'answered'
            ? 'A ship has answered the signal and is on its way.'
            : 'No ship has answered yet. Build a signal beacon and keep it transmitting for five days.'}
        </p>
        <div className="row end">
          <button onClick={onClose}>Close</button>
        </div>
      </Modal>
    );
  }
  const aboard = state.colonists.filter((c) => !c.dead).map((c) => c.name);
  return (
    <Modal title="The ship has landed" onClose={onClose}>
      <p>
        It waits beside the beacon for a day. There's room for everyone: {aboard.join(', ')}. Board it and the colony's
        story ends here, on your terms. Stay, and the ship leaves without you; you can always signal again.
      </p>
      <div className="title-buttons">
        {!sure ? (
          <button className="primary" autoFocus onClick={() => setSure(true)}>
            Board the ship…
          </button>
        ) : (
          <button className="primary" autoFocus onClick={() => controller.command({ type: 'shipChoice', board: true })}>
            Yes, leave the valley for good
          </button>
        )}
        <button
          onClick={() => {
            controller.command({ type: 'shipChoice', board: false });
            onClose();
          }}
        >
          Stay in the valley
        </button>
        <button onClick={onClose}>Decide later</button>
      </div>
    </Modal>
  );
}

// The end of a colony's story, by its own choice.
export function DepartedScreen({ state, actions }: { state: UiState; actions: MenuActions }) {
  const [view, setView] = useState<'main' | 'new'>('main');
  return (
    <Modal title="The colony's story ends" onClose={() => undefined} closable={false}>
      <p>The colonists boarded the ship and left the valley behind. Here is what they made of their time there.</p>
      <table className="summary">
        <tbody>
          {state.legacy.map(({ label, value }) => (
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
          <button onClick={actions.onTitle}>Title screen</button>
        </div>
      )}
      {view === 'new' && <NewColonyForm confirm={false} onStarted={actions.onPlay} />}
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

// A 0–100% volume slider.
function Slider({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="setting">
      <span>{label}</span>
      <span className="slider">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(value * 100)}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
        />
        <span className="num">{Math.round(value * 100)}%</span>
      </span>
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
      <h3>Sound</h3>
      <Toggle label="Sound (instruments, weather and alerts)" value={s.sound} onChange={(v) => set({ sound: v })} />
      <Slider label="Volume" value={s.masterVolume} disabled={!s.sound} onChange={(v) => set({ masterVolume: v })} />
      <Slider label="Music" value={s.musicVolume} disabled={!s.sound} onChange={(v) => set({ musicVolume: v })} />
      <Slider
        label="Ambience and alerts"
        value={s.effectsVolume}
        disabled={!s.sound}
        onChange={(v) => set({ effectsVolume: v })}
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
      <Toggle label="Lightning flashes" value={s.lightningFlashes} onChange={(v) => set({ lightningFlashes: v })} />
      <Toggle
        label="Day and night lighting"
        value={s.dayNightLighting}
        onChange={(v) => set({ dayNightLighting: v })}
      />
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

// Buying from and selling to a visiting caravan. Quantities are picked on both sides and the
// deal settles the difference in silver.
export function TradeScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  const [buy, setBuy] = useState<Record<number, number>>({});
  const [sell, setSell] = useState<Record<number, number>>({});
  const trade = state.trade;
  if (!trade) {
    return (
      <Modal title="Trade" onClose={onClose}>
        <p>The traders have gone.</p>
      </Modal>
    );
  }
  const cost = trade.theirs.reduce((sum, line) => sum + (buy[line.item] ?? 0) * line.price, 0);
  const income = trade.ours.reduce((sum, line) => sum + (sell[line.item] ?? 0) * line.price, 0);
  const balance = dealBalance(cost, income);
  const problem = !trade.open
    ? 'The traders are not open for business.'
    : balance > trade.silver
      ? 'Not enough silver.'
      : -balance > trade.traderSilver
        ? 'The traders cannot afford that.'
        : null;
  const lines = (side: 'buy' | 'sell') => {
    const list = side === 'buy' ? trade.theirs : trade.ours;
    const picked = side === 'buy' ? buy : sell;
    const set = side === 'buy' ? setBuy : setSell;
    const change = (item: number, max: number, by: number) =>
      set({ ...picked, [item]: Math.max(0, Math.min(max, (picked[item] ?? 0) + by)) });
    if (list.length === 0) {
      return (
        <p className="muted">
          {side === 'buy'
            ? 'They have nothing left to sell.'
            : 'Nothing in your stockpiles yet: only goods (and silver) in a stockpile zone can be traded.'}
        </p>
      );
    }
    return (
      <table className="saves trade">
        <tbody>
          {list.map((line) => (
            <tr key={line.item}>
              <td>
                {line.name}
                <div className="muted small">
                  {line.count} · {line.price.toFixed(1)} silver each
                </div>
              </td>
              <td className="qty">
                <button aria-label={`Ten fewer ${line.name}`} onClick={() => change(line.item, line.count, -10)}>
                  −10
                </button>
                <button aria-label={`One fewer ${line.name}`} onClick={() => change(line.item, line.count, -1)}>
                  −
                </button>
                <span className="num">{picked[line.item] ?? 0}</span>
                <button aria-label={`One more ${line.name}`} onClick={() => change(line.item, line.count, 1)}>
                  +
                </button>
                <button aria-label={`Ten more ${line.name}`} onClick={() => change(line.item, line.count, 10)}>
                  +10
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };
  const toList = (picked: Record<number, number>) =>
    Object.entries(picked)
      .map(([item, n]) => [Number(item), n] as [number, number])
      .filter(([, n]) => n > 0);
  return (
    <Modal title={`Trade with ${trade.faction}`} onClose={onClose} wide>
      <p className="muted">
        {trade.relation} (goodwill {trade.goodwill}) · leaving in {trade.leavesIn}h · your silver {trade.silver} · their
        silver {trade.traderSilver}. Better goodwill means better prices; trading builds it.
      </p>
      <div className="trade-columns">
        <div>
          <h3>Buy from them</h3>
          {lines('buy')}
        </div>
        <div>
          <h3>Sell from your stockpiles</h3>
          {lines('sell')}
        </div>
      </div>
      <div className="row">
        <span>
          {balance > 0 ? `You pay ${balance} silver` : balance < 0 ? `You receive ${-balance} silver` : 'Even trade'}
        </span>
        {problem && <span className="tag warn">{problem}</span>}
        <button
          className="primary"
          disabled={!!problem || (cost === 0 && income === 0)}
          onClick={() => {
            if (controller.trade(toList(buy), toList(sell))) {
              setBuy({});
              setSell({});
            }
          }}
        >
          Make the deal
        </button>
      </div>
      {trade.art.length > 0 && <ArtForSale trade={trade} />}
    </Modal>
  );
}

// The colony's sculptures, which the traders buy where they stand and carry off. Each sale is
// confirmed: a piece sold is gone.
function ArtForSale({ trade }: { trade: NonNullable<UiState['trade']> }) {
  const [selling, setSelling] = useState<number | null>(null);
  return (
    <>
      <h3>Sell art</h3>
      <p className="muted small">
        The traders pay well for fine work and carry it off themselves. Memorials aren't for sale.
      </p>
      <table className="summary">
        <tbody>
          {trade.art.map((a) => (
            <tr key={a.tile}>
              <td>
                <b>“{a.title}”</b> <span className="muted">{a.name.toLowerCase()}</span>
                <div className="muted small">{a.byline}</div>
              </td>
              <td className="num">{a.price} silver</td>
              <td className="num">
                {selling === a.tile ? (
                  <button
                    className="primary"
                    onClick={() => {
                      controller.command({ type: 'sellArt', tile: a.tile });
                      setSelling(null);
                    }}
                  >
                    Sell it
                  </button>
                ) : (
                  <button
                    disabled={!a.affordable}
                    title={a.affordable ? undefined : "The traders can't afford it"}
                    onClick={() => setSelling(a.tile)}
                  >
                    Sell…
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
