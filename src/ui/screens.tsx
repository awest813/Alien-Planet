import { useEffect, useRef, useState } from 'react';
import { UiState, controller } from '../game/controller';
import { ScheduleSlot, WORK_TYPES } from '../sim/types';
import { Bar, SLOT_LABELS, WORK_LABELS } from './common';

// Full-screen dialogs opened from the top bar.

export function Modal({
  title,
  onClose,
  children,
  wide,
  closable = true,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  // False for screens the player has to act on (the fallen colony).
  closable?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Move keyboard focus into the dialog when it opens (unless a button in it already took it).
  useEffect(() => {
    if (!panel.current?.contains(document.activeElement)) {
      panel.current?.focus();
    }
  }, []);
  return (
    <div className="modal-backdrop" onClick={closable ? onClose : undefined}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`panel modal ${wide ? 'wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{title}</h2>
        {children}
        {closable && (
          <div className="row end">
            <button onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function WorkScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
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
                      aria-label={`${c.name}, ${WORK_LABELS[work]}: ${value === 0 ? 'off' : `priority ${value}`}`}
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

export function ScheduleScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
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

export function ProductionScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  const set = (recipe: number, target: number) => controller.command({ type: 'bill', recipe, target });
  return (
    <Modal title="Production" onClose={onClose}>
      <p className="muted">
        Colonists keep making each product until the colony holds the target amount (bows and clothes already in use
        don't count).
      </p>
      <table className="saves">
        <tbody>
          {state.bills.map((bill) => (
            <tr key={bill.recipe}>
              <td>
                {bill.name}
                <div className="muted small">
                  {bill.recipeText} at a {bill.bench}
                  {!bill.hasBench && <span className="tag warn">no {bill.bench} yet</span>}
                  {bill.locked && <span className="tag warn">🔒 needs {bill.locked}</span>}
                  {bill.minSkill && <span className="tag">needs {bill.minSkill}</span>}
                </div>
              </td>
              <td className="muted">{bill.mend ? `${bill.stock} worn` : `${bill.stock} in stock`}</td>
              {bill.mend ? (
                <td>
                  <button
                    className={bill.target > 0 ? 'active' : ''}
                    onClick={() => set(bill.recipe, bill.target > 0 ? 0 : 1)}
                  >
                    {bill.target > 0 ? 'Mending' : 'Paused'}
                  </button>
                </td>
              ) : (
                <td>
                  <button onClick={() => set(bill.recipe, bill.target - bill.step)}>−{bill.step}</button>
                  <span className="target">Keep {bill.target}</span>
                  <button onClick={() => set(bill.recipe, bill.target + bill.step)}>+{bill.step}</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

export function HelpScreen({ onClose }: { onClose: () => void }) {
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
          Drag a small rectangle (about 5×4) of <b>Wood wall</b> (B), click a <b>Door</b> (O) into it, and add{' '}
          <b>Beds</b> (E) inside before night falls at 22:00.
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
      <h3>The screen</h3>
      <ul className="help-steps">
        <li>
          <b>Colonist bar</b> (top): click a colonist to inspect them on the left, with tabs for needs, health, social
          life and skills. Icons show who is bleeding, sick, drafted or asleep.
        </li>
        <li>
          <b>Architect</b> (bottom): orders, zones and buildings, grouped into tabs. Hover a button for what it does and
          costs. 🔒 means it needs research first.
        </li>
        <li>
          <b>Alerts, Goals and Log</b> (right): what needs attention, what to aim for next, and what just happened.
          Click any building or tile in Select mode to see its details; 🌡 shows temperatures on the map.
        </li>
      </ul>
      <p className="muted">
        Space pauses, 1–3 change speed, Esc opens the menu (saves, settings), Tab jumps from colonist to colonist, and
        the minimap (bottom right) moves the view. WASD or right-drag pans, the wheel zooms, and right-click drops the
        current tool.
      </p>
      <p className="muted">
        Later, raiders come. The game pauses: press <b>Q</b> to draft everyone (or a selected colonist), then select a
        drafted colonist and right-click to move them. Grow <b>healroot</b> (Y) for medicine and hunt (V) for meat and
        leather, or forage berry bushes (G) for quick food. Winter comes every 24 days: crops stop and food rots unless
        it's cold, so research <b>electricity</b> and <b>refrigeration</b> for generators, iceboxes and freezers, and{' '}
        <b>sun lamps</b> for indoor farming. Skills improve with practice, fastest where a colonist has a passion (★).
        Build <b>bridges</b> over water and <b>fishing spots</b> on the shore (hunters fish while food is short, and all
        winter); in hard frost the shallows freeze and can be walked across. Research <b>tailoring</b> for parkas before
        winter: cold beyond what colonists wear builds into hypothermia, and a skilled cook makes fine meals that rarely
        make anyone sick. <b>Tame</b> deer for milk and boars as guards (Handle work type); tame pairs breed.
      </p>
      <p className="muted">
        Watch the weather in the top bar: rain chills anyone outside, droughts stunt crops, and storms bring lightning
        that can start fires (haulers and builders put them out). When traders arrive, <b>Trade</b> lights up in the top
        bar: sell surplus from your stockpiles for silver and buy what you're short of. A stonecutter's table makes
        blocks for block walls, and a crafting bench mends worn clothes once you know tailoring.
      </p>
    </Modal>
  );
}

export function ResearchScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  return (
    <Modal title={`Research · year ${state.year}`} onClose={onClose}>
      <p className="muted">
        {state.researchBench
          ? 'Pick a project; colonists with the Research work type study it at the research bench.'
          : 'Build a research bench (Production) first, then pick a project.'}
      </p>
      <ul className="research">
        {state.research.map((p) => (
          <li key={p.key} className={p.done ? 'done' : p.current ? 'current' : p.available ? '' : 'locked'}>
            <div className="research-head">
              <b>{p.name}</b>
              <span className="muted">{p.done ? 'Done' : `${Math.round(p.progress * p.cost)}/${p.cost}`}</span>
              {!p.done && p.available && (
                <button
                  className={p.current ? 'active' : ''}
                  onClick={() => controller.setResearch(p.current ? null : p.key)}
                >
                  {p.current ? 'Researching' : 'Research'}
                </button>
              )}
            </div>
            <div className="muted small">
              {p.description}
              {!p.available && !p.done && p.requires.length > 0 && ` Requires ${p.requires.join(', ')}.`}
            </div>
            {!p.done && <Bar value={p.progress} color="#8fc3ff" label={`${p.name} progress`} />}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function StoryScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  return (
    <Modal title="The story so far" onClose={onClose}>
      <h3>Factions</h3>
      <table className="summary">
        <tbody>
          {state.factions.map((f) => (
            <tr key={f.name}>
              <td>
                <b>{f.name}</b>
                <div className="muted small">{f.description}</div>
              </td>
              <td className="num">
                {f.relation}
                {f.goodwill !== null && <span className="muted"> ({f.goodwill})</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Events</h3>
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

// Two-step button for actions that throw away progress.
export function ConfirmButton({
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
