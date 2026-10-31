import { useEffect, useState, useSyncExternalStore } from 'react';
import { ColonistView, SAVE_SLOTS, TOOLS, ToolDef, UiState, controller, slotLabel } from '../game/controller';
import { SAVE_VERSION } from '../sim/serialize';
import { DIFFICULTIES, Difficulty } from '../sim/storyteller';
import { ScheduleSlot, WORK_TYPES, WorkTypeKey } from '../sim/types';

const useUiState = (): UiState => useSyncExternalStore(controller.subscribe, controller.getState);

const SPEED_LABELS = ['❚❚', '▶', '▶▶', '▶▶▶'];
const GROUP_LABELS: Record<ToolDef['group'], string> = {
  orders: 'Orders',
  zones: 'Zones',
  build: 'Build',
  furniture: 'Furniture',
};
const WORK_LABELS: Record<WorkTypeKey, string> = {
  doctor: 'Doctor',
  cooking: 'Cook',
  construction: 'Construct',
  growing: 'Grow',
  mining: 'Mine',
  plantCutting: 'Cut plants',
  crafting: 'Craft',
  hauling: 'Haul',
};
const SLOT_LABELS: Record<ScheduleSlot, string> = { A: 'Anything', W: 'Work', J: 'Recreation', S: 'Sleep' };

type Screen = 'menu' | 'work' | 'schedule' | 'production' | 'story' | 'help' | null;

const HELP_SEEN_KEY = 'colony-alpha:help-seen';

// Browser storage can be unavailable (private mode, blocked site data), so never let it throw.
function helpSeen(): boolean {
  try {
    return localStorage.getItem(HELP_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markHelpSeen(): void {
  try {
    localStorage.setItem(HELP_SEEN_KEY, '1');
  } catch {
    // Not remembered; the help panel will show again next time.
  }
}

export function App() {
  const state = useUiState();
  const [screen, setScreen] = useState<Screen>(() => (helpSeen() ? null : 'help'));
  const close = () => {
    if (screen === 'help') {
      markHelpSeen();
    }
    setScreen(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setScreen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="ui">
      <TopBar state={state} onOpen={setScreen} />
      <ColonistList state={state} />
      <SidePanel state={state} />
      <div className="bottom">
        <Inspector state={state} />
        <Toolbar state={state} />
      </div>
      <div className="notices">
        {state.toast && <div className="toast">{state.toast}</div>}
        {state.notifications.map((n) => (
          <button
            key={n.id}
            className={`notification ${n.tone}`}
            onClick={() => controller.dismissNotification(n.id)}
            title="Dismiss"
          >
            {n.text}
          </button>
        ))}
      </div>
      {screen === 'menu' && <Menu state={state} onClose={close} />}
      {screen === 'help' && <HelpScreen onClose={close} />}
      {screen === 'story' && <StoryScreen state={state} onClose={close} />}
      {screen === 'work' && <WorkScreen state={state} onClose={close} />}
      {screen === 'schedule' && <ScheduleScreen state={state} onClose={close} />}
      {screen === 'production' && <ProductionScreen state={state} onClose={close} />}
    </div>
  );
}

function TopBar({ state, onOpen }: { state: UiState; onOpen: (screen: Screen) => void }) {
  return (
    <div className="panel topbar">
      <span className="title">Colony Alpha</span>
      <span className="clock">
        {state.night ? '☾' : '☀'} Day {state.day} · {state.time} · {state.outdoorTemp}°C
        {state.speed === 0 && <span className="paused">Paused</span>}
      </span>
      <div className="speeds">
        {SPEED_LABELS.map((label, index) => (
          <button
            key={label}
            className={state.speed === index ? 'active' : ''}
            onClick={() => controller.setSpeed(index)}
            title={index === 0 ? 'Pause (Space)' : `Speed ${index} (${index})`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="resources">
        {state.resources
          .filter((r) => r.total > 0)
          .map((r) => (
            <span key={r.name} title={`${r.stored} in stockpiles, ${r.total} in total`}>
              {r.name} <b>{r.total}</b>
            </span>
          ))}
      </div>
      <div className="screens">
        {state.raid && (
          <button className="danger" onClick={() => controller.toggleDraftAll()} title="Draft or release everyone (Q)">
            {state.colonists.some((c) => !c.dead && c.status !== 'Downed' && !c.drafted) ? 'Draft all' : 'Release all'}
          </button>
        )}
        <button onClick={() => onOpen('work')}>Work</button>
        <button onClick={() => onOpen('schedule')}>Schedule</button>
        <button onClick={() => onOpen('production')}>Production</button>
        <button onClick={() => onOpen('story')}>Story</button>
        <button onClick={() => onOpen('help')} title="How to play">
          ?
        </button>
        <button onClick={() => onOpen('menu')}>Menu</button>
      </div>
    </div>
  );
}

function Bar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <span className="bar" title={`${label}: ${Math.round(value * 100)}%`}>
      <span className="bar-fill" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
    </span>
  );
}

const moodColor = (mood: number) => (mood < 25 ? 'var(--warn)' : mood < 45 ? 'var(--accent)' : 'var(--good)');

function ColonistList({ state }: { state: UiState }) {
  return (
    <div className="panel colonists">
      <h3>Colonists</h3>
      {state.colonists.map((c) => {
        const selected = state.selectedColonist === c.id;
        return (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            className={`colonist ${selected ? 'selected' : ''} ${c.dead ? 'dead' : ''}`}
            onClick={() => controller.selectColonist(selected ? null : c.id, !selected)}
          >
            <span className="swatch" style={{ background: c.color }} />
            <span className="colonist-text">
              <span className="name">
                {c.name}
                {!c.dead && (
                  <span className="mood" style={{ color: moodColor(c.mood) }}>
                    {c.mood}
                  </span>
                )}
                {c.inBreak && <span className="tag warn">break</span>}
                {c.status !== 'Healthy' && (
                  <span className={`tag ${c.status === 'Injured' || c.status === 'Sick' ? 'warn' : 'danger'}`}>
                    {c.status.toLowerCase()}
                  </span>
                )}
                {!c.dead && c.status !== 'Downed' && (
                  <button
                    className={`draft ${c.drafted ? 'active danger' : ''}`}
                    title="Draft for combat (Q). Right-click the map to move."
                    onClick={(e) => {
                      e.stopPropagation();
                      controller.toggleDraft(c.id);
                    }}
                  >
                    {c.drafted ? 'Drafted' : 'Draft'}
                  </button>
                )}
              </span>
              <span className="activity">{c.activity}</span>
              {c.carrying && <span className="muted">Carrying {c.carrying}</span>}
              <span className="needs">
                <Bar value={c.needs.food} color="#e0a050" label="Food" />
                <Bar value={c.needs.rest} color="#7fa8e0" label="Rest" />
                <Bar value={c.needs.joy} color="#c38fe0" label="Recreation" />
              </span>
              {selected && <ColonistDetails c={c} />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ColonistDetails({ c }: { c: ColonistView }) {
  return (
    <span className="details">
      <span className="muted">
        Food {Math.round(c.needs.food * 100)}% · Rest {Math.round(c.needs.rest * 100)}% · Recreation{' '}
        {Math.round(c.needs.joy * 100)}%
      </span>
      {c.thoughts.length === 0 && <span className="muted">No strong feelings.</span>}
      {c.thoughts.map((t) => (
        <span key={t.label} className="thought">
          <span>{t.label}</span>
          <span className={t.mood >= 0 ? 'good' : 'bad'}>{t.mood > 0 ? `+${t.mood}` : t.mood}</span>
        </span>
      ))}
      <span className="section">Traits</span>
      {c.traits.map((t) => (
        <span key={t.label} title={t.description}>
          <b>{t.label}</b> <span className="muted">{t.description}</span>
        </span>
      ))}
      <span className="section">Health</span>
      {c.injuries.length === 0 && !c.disease && c.bloodLoss < 0.05 && <span className="muted">Healthy.</span>}
      {c.injuries.map((injury, index) => (
        <span key={index} className="thought">
          <span>
            {injury.label}{' '}
            {injury.tended ? <span className="muted">(tended)</span> : <span className="bad">(untended)</span>}
          </span>
          <span className="muted">{Math.round(injury.severity * 100)}%</span>
        </span>
      ))}
      {c.bloodLoss >= 0.05 && (
        <span className="thought">
          <span>Blood loss</span>
          <span className="bad">{Math.round(c.bloodLoss * 100)}%</span>
        </span>
      )}
      {c.disease && (
        <span className="thought">
          <span>{c.disease.label}</span>
          <span className="muted">
            severity {Math.round(c.disease.severity * 100)}% · immunity {Math.round(c.disease.immunity * 100)}%
          </span>
        </span>
      )}
      <span className="section">Relationships</span>
      {c.relations.map((r) => (
        <span key={r.name} className="thought">
          <span>
            {r.name} {r.label && <span className="muted">({r.label.toLowerCase()})</span>}
          </span>
          <span className={r.opinion >= 0 ? 'good' : 'bad'}>{r.opinion > 0 ? `+${r.opinion}` : r.opinion}</span>
        </span>
      ))}
      <span className="section">Skills</span>
      <span className="skills">
        Mining {c.skills.mining} · Construction {c.skills.construction} · Plants {c.skills.plants} · Cooking{' '}
        {c.skills.cooking} · Crafting {c.skills.crafting} · Medicine {c.skills.medicine} · Combat {c.skills.combat}
      </span>
    </span>
  );
}

function SidePanel({ state }: { state: UiState }) {
  const phases = [1, 2, 3].map((phase) => state.objectives.filter((o) => o.phase === phase));
  const phaseNames = ['Phase 1 · Shelter', 'Phase 2 · Living', 'Phase 3 · Story'];
  return (
    <div className="panel side">
      <Alerts state={state} />
      {phases.map((objectives, index) => (
        <div key={index}>
          <h3>
            {phaseNames[index]}{' '}
            <span className="muted">
              {objectives.filter((o) => o.done).length}/{objectives.length}
            </span>
          </h3>
          <ul className="objectives">
            {objectives
              .filter((o) => !o.done)
              .map((o) => (
                <li key={o.id} className={o.done ? 'done' : o.failed ? 'failed' : ''}>
                  <span className="check">{o.done ? '✔' : o.failed ? '✖' : '○'}</span>
                  {o.label}
                  {!o.done && o.progress && <span className="muted"> {o.progress}</span>}
                </li>
              ))}
          </ul>
        </div>
      ))}
      <h3>Log</h3>
      <ul className="log">
        {state.log.map((entry, index) => (
          <li key={`${entry.tick}-${index}`} className={entry.tone}>
            {entry.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Inspector({ state }: { state: UiState }) {
  const tile = state.hover;
  if (!tile) {
    return null;
  }
  const colonist = state.colonists.find((c) => c.id === state.hoverColonist);
  return (
    <div className="panel inspector">
      {colonist && (
        <div className="inspector-colonist">
          <div>
            <span className="swatch" style={{ background: colonist.color }} /> <b>{colonist.name}</b>{' '}
            <span style={{ color: moodColor(colonist.mood) }}>mood {colonist.mood}</span>
          </div>
          <div>{colonist.activity}</div>
          {colonist.carrying && <div className="muted">Carrying {colonist.carrying}</div>}
        </div>
      )}
      <div className="muted">
        ({tile.x}, {tile.y}) · {tile.temperature}°C
      </div>
      {tile.room && <div className="muted">{tile.room}</div>}
      <div>
        <b>{tile.feature ?? tile.terrain}</b>
        {tile.feature && <span className="muted"> on {tile.terrain.toLowerCase()}</span>}
      </div>
      {tile.items && <div>{tile.items}</div>}
      {tile.orders.map((order) => (
        <div key={order} className="muted">
          {order}
        </div>
      ))}
    </div>
  );
}

function Toolbar({ state }: { state: UiState }) {
  const groups = (['orders', 'zones', 'build', 'furniture'] as const).map((group) => ({
    group,
    tools: TOOLS.filter((t) => t.group === group),
  }));
  const current = TOOLS.find((t) => t.id === state.toolId);
  return (
    <div className="panel toolbar">
      <div className="tool-groups">
        {groups.map(({ group, tools }) => (
          <div key={group} className="tool-group">
            <span className="group-label">{GROUP_LABELS[group]}</span>
            {tools.map((t) => (
              <button
                key={t.id}
                className={state.toolId === t.id ? 'active' : ''}
                onClick={() => controller.setTool(t.tool)}
                title={t.hint}
              >
                {t.label}
                <kbd>{t.hotkey === 'Escape' ? 'Esc' : t.hotkey.toUpperCase()}</kbd>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="hint">{current?.hint}. Right-drag or WASD to pan, wheel to zoom, right-click to drop a tool.</div>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`panel modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
        <div className="row end">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function WorkScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  const cycle = (value: number) => (value === 0 ? 1 : value === 4 ? 0 : value + 1);
  return (
    <Modal title="Work priorities" onClose={onClose} wide>
      <p className="muted">
        Click to cycle 1 (highest) → 4 (lowest) → off. At equal priority, colonists work left to right.
      </p>
      <table className="grid">
        <thead>
          <tr>
            <th />
            {WORK_TYPES.map((work) => (
              <th key={work}>{WORK_LABELS[work]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {state.colonists.map((c) => (
            <tr key={c.id}>
              <td className="row-label">
                <span className="swatch" style={{ background: c.color }} /> {c.name}
              </td>
              {WORK_TYPES.map((work) => {
                const value = c.priorities[work];
                return (
                  <td key={work}>
                    <button
                      className={`priority p${value}`}
                      onClick={() =>
                        controller.command({ type: 'priority', colonist: c.id, work, value: cycle(value) })
                      }
                    >
                      {value === 0 ? '' : value}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

function ScheduleScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  const [brush, setBrush] = useState<ScheduleSlot>('W');
  const [painting, setPainting] = useState(false);
  const paint = (colonist: number, hour: number) =>
    controller.command({ type: 'schedule', colonist, hour, slot: brush });
  return (
    <Modal title="Schedule" onClose={onClose} wide>
      <div className="row">
        {(Object.keys(SLOT_LABELS) as ScheduleSlot[]).map((slot) => (
          <button
            key={slot}
            className={`brush slot-${slot} ${brush === slot ? 'active' : ''}`}
            onClick={() => setBrush(slot)}
          >
            {SLOT_LABELS[slot]}
          </button>
        ))}
        <span className="muted">Pick a brush, then click or drag across hours.</span>
      </div>
      <table className="grid schedule" onMouseLeave={() => setPainting(false)} onMouseUp={() => setPainting(false)}>
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {state.colonists.map((c) => (
            <tr key={c.id}>
              <td className="row-label">
                <span className="swatch" style={{ background: c.color }} /> {c.name}
              </td>
              {c.schedule.map((slot, hour) => (
                <td
                  key={hour}
                  className={`hour slot-${slot}`}
                  title={`${hour}:00 ${SLOT_LABELS[slot]}`}
                  onMouseDown={() => {
                    setPainting(true);
                    paint(c.id, hour);
                  }}
                  onMouseEnter={() => painting && paint(c.id, hour)}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

function ProductionScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  const set = (recipe: number, target: number) => controller.command({ type: 'bill', recipe, target });
  return (
    <Modal title="Production" onClose={onClose}>
      <p className="muted">
        Colonists keep making each product until the colony holds the target amount. Meals need a stove, cloth needs a
        crafting bench.
      </p>
      <table className="saves">
        <tbody>
          {state.bills.map((bill) => (
            <tr key={bill.recipe}>
              <td>{bill.name}</td>
              <td className="muted">
                {bill.stock} {bill.product.toLowerCase()} in stock
              </td>
              <td>
                <button onClick={() => set(bill.recipe, bill.target - 5)}>−5</button>
                <span className="target">Keep {bill.target}</span>
                <button onClick={() => set(bill.recipe, bill.target + 5)}>+5</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

function HelpScreen({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Welcome to Colony Alpha" onClose={onClose}>
      <p>
        Five colonists have crash-landed. You can't control them directly: you give orders, and they decide who does
        what, between eating, sleeping and taking breaks.
      </p>
      <ol className="help-steps">
        <li>
          <b>Chop</b> (C) some trees and drag out a <b>Stockpile</b> (Z) so the wood has somewhere to go.
        </li>
        <li>
          Drag a rectangle of <b>Wood wall</b> (B), click a <b>Door</b> (O) into it, and add <b>Beds</b> (E) inside
          before night falls at 22:00.
        </li>
        <li>
          Plant <b>Grow potatoes</b> (P), <b>Mine</b> (M) granite for a <b>Stove</b> (K), and set meal targets in{' '}
          <b>Production</b>.
        </li>
        <li>
          Watch moods. Build a <b>Table</b>, a <b>Campfire</b> for warmth and a <b>Horseshoe pin</b> for fun. The alerts
          panel says what's missing.
        </li>
      </ol>
      <p className="muted">
        Space pauses, 1–3 change speed. WASD or right-drag pans, the wheel zooms, and right-click drops the current
        tool. The objectives on the right walk you through the rest.
      </p>
      <p className="muted">
        Later, raiders will come. The game pauses: press <b>Q</b> to draft everyone (or a selected colonist), select a
        drafted colonist and right-click to move them. Drafted colonists shoot raiders in range. Grow <b>healroot</b>{' '}
        (Y) for medicine; doctors tend the wounded and sick.
      </p>
    </Modal>
  );
}

function StoryScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  return (
    <Modal title="The story so far" onClose={onClose}>
      <ul className="story">
        {state.story.map((entry, index) => (
          <li key={index} className={entry.tone}>
            <span className="muted">
              Day {entry.day}, {String(entry.hour).padStart(2, '0')}:00
            </span>{' '}
            {entry.text}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

const MAX_ALERTS = 5;

// Most urgent first; the rest fold away so objectives stay visible.
function Alerts({ state }: { state: UiState }) {
  const [expanded, setExpanded] = useState(false);
  if (state.alerts.length === 0) {
    return null;
  }
  const sorted = [...state.alerts].sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'danger' ? -1 : 1));
  const shown = expanded ? sorted : sorted.slice(0, MAX_ALERTS);
  const hidden = sorted.length - shown.length;
  return (
    <ul className="alerts">
      {shown.map((alert) => (
        <li key={alert.text} className={alert.tone} title={alert.text}>
          {alert.text}
        </li>
      ))}
      {(hidden > 0 || expanded) && sorted.length > MAX_ALERTS && (
        <li className="more">
          <button onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer' : `${hidden} more…`}</button>
        </li>
      )}
    </ul>
  );
}

// Two-step button for actions that throw away progress.
function ConfirmButton({
  label,
  confirm,
  onConfirm,
  disabled,
}: {
  label: string;
  confirm: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) {
      return;
    }
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <button
      className={armed ? 'active danger' : ''}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirm : label}
    </button>
  );
}

function Menu({ state, onClose }: { state: UiState; onClose: () => void }) {
  const [seed, setSeed] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const savesBySlot = new Map(state.saves.map((s) => [s.slot, s]));
  const current = DIFFICULTIES.find((d) => d.key === state.difficulty);
  return (
    <Modal title="Colony menu" onClose={onClose}>
      <p className="muted">
        Day {state.day} · {state.colonists.filter((c) => !c.dead).length} colonists · {current?.label} · seed{' '}
        {state.seed}
      </p>
      <h3>Saves</h3>
      <table className="saves">
        <tbody>
          {SAVE_SLOTS.map((slot) => {
            const meta = savesBySlot.get(slot);
            const outdated = !!meta && meta.version !== SAVE_VERSION;
            const details = meta
              ? [
                  `Day ${meta.day}, ${String(meta.hour).padStart(2, '0')}:00`,
                  meta.colonists !== undefined ? `${meta.colonists} colonists` : null,
                  new Date(meta.savedAt).toLocaleString(),
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'Empty';
            return (
              <tr key={slot}>
                <td>{slotLabel(slot)}</td>
                <td className="muted">
                  {details}
                  {outdated && <span className="tag warn">older version</span>}
                </td>
                <td>
                  {slot !== 'autosave' &&
                    (meta ? (
                      <ConfirmButton label="Save" confirm="Overwrite?" onConfirm={() => controller.save(slot)} />
                    ) : (
                      <button onClick={() => controller.save(slot)}>Save</button>
                    ))}
                  <ConfirmButton
                    label="Load"
                    confirm="Lose current?"
                    disabled={!meta || outdated}
                    onConfirm={() => {
                      controller.load(slot);
                      onClose();
                    }}
                  />
                  {meta && (
                    <ConfirmButton label="Delete" confirm="Delete?" onConfirm={() => controller.deleteSave(slot)} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">The game autosaves every dawn. Unsaved progress is lost when you load or start over.</p>
      <h3>New colony</h3>
      <div className="difficulties">
        {DIFFICULTIES.map((d) => (
          <button key={d.key} className={difficulty === d.key ? 'active' : ''} onClick={() => setDifficulty(d.key)}>
            <b>{d.label}</b>
            <span>{d.description}</span>
          </button>
        ))}
      </div>
      <div className="row">
        <input placeholder="Seed (blank for random)" value={seed} onChange={(e) => setSeed(e.target.value)} />
        <ConfirmButton
          label="Start"
          confirm="Lose current?"
          onConfirm={() => {
            controller.newColony(seed, difficulty);
            onClose();
          }}
        />
      </div>
    </Modal>
  );
}
