import { useEffect, useRef, useState } from 'react';
import { UiState, controller } from '../game/controller';
import { ScheduleSlot, SkillKey, WORK_TYPES, WorkTypeKey } from '../sim/types';
import { Bar, SLOT_LABELS, WORK_LABELS } from './common';
import { ADULT, TEEN, TEEN_WORK } from '../sim/lifespans';

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

// The skill each kind of work draws on (hauling needs none).
const WORK_SKILL: Partial<Record<WorkTypeKey, SkillKey>> = {
  doctor: 'medicine',
  cooking: 'cooking',
  construction: 'construction',
  growing: 'plants',
  plantCutting: 'plants',
  mining: 'mining',
  hunting: 'combat',
  handling: 'animals',
  crafting: 'crafting',
  art: 'artistic',
  research: 'research',
};

export function WorkScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  // Left click raises the number (1 → 4 → off → 1); right click goes the other way.
  const forward = (value: number) => (value === 0 ? 1 : value === 4 ? 0 : value + 1);
  const back = (value: number) => (value === 0 ? 4 : value === 1 ? 0 : value - 1);
  return (
    <Modal title="Work priorities" onClose={onClose} wide>
      <p className="muted">
        Click a cell to cycle 1 (do first) → 4 (do last) → off; right-click goes back. At equal priority, colonists work
        left to right. The small number is the colonist's skill (★ a passion: they learn faster and enjoy it); brighter
        cells are better at it.
      </p>
      <table className="grid work-grid">
        <thead>
          <tr>
            <th />
            {WORK_TYPES.map((work) => (
              <th key={work}>{WORK_LABELS[work]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {state.colonists
            .filter((c) => !c.dead)
            .map((c) => (
              <tr key={c.id}>
                <td className="row-label">
                  <span className="swatch" style={{ background: c.color }} /> {c.name}
                  {c.age < ADULT && (
                    <span className="muted small">
                      {' '}
                      ({c.stage}, {c.age})
                    </span>
                  )}
                </td>
                {WORK_TYPES.map((work) => {
                  const value = c.priorities[work];
                  const key = WORK_SKILL[work];
                  const skill = key ? c.skillList.find((sk) => sk.key === key) : undefined;
                  const set = (next: number) =>
                    controller.command({ type: 'priority', colonist: c.id, work, value: next });
                  const stars = skill?.passion ? '★'.repeat(skill.passion) : '';
                  // Children don't work, and teens only do light work.
                  if (c.age < ADULT && (c.age < TEEN || !TEEN_WORK.includes(work))) {
                    return (
                      <td key={work}>
                        <span
                          className="priority too-young"
                          role="img"
                          aria-label={`${c.name}, ${WORK_LABELS[work]}: too young`}
                          title={`${c.name} is too young for this work`}
                        >
                          ·
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td key={work}>
                      <button
                        className={`priority p${value}`}
                        style={
                          skill
                            ? { background: `rgba(143, 195, 255, ${(0.03 + (skill.level / 20) * 0.32).toFixed(2)})` }
                            : undefined
                        }
                        title={
                          skill
                            ? `${c.name}: ${skill.label} ${skill.level}${skill.passion === 2 ? ', burning passion' : skill.passion === 1 ? ', interested' : ''}`
                            : `${c.name}: ${WORK_LABELS[work]}`
                        }
                        aria-label={`${c.name}, ${WORK_LABELS[work]}: ${value === 0 ? 'off' : `priority ${value}`}`}
                        onClick={() => set(forward(value))}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          set(back(value));
                        }}
                      >
                        <span className="prio">{value === 0 ? '–' : value}</span>
                        {skill && (
                          <span className="skill">
                            {skill.level}
                            {stars && <span className="passion">{stars}</span>}
                          </span>
                        )}
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
  const living = state.colonists.filter((c) => !c.dead);
  // The "Everyone" row paints an hour for the whole colony.
  const paintAll = (hour: number) => living.forEach((c) => paint(c.id, hour));
  const now = parseInt(state.time, 10);
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
        <span className="muted">
          Pick a brush, then click or drag across hours. The Everyone row sets the whole colony.
        </span>
      </div>
      <table className="grid schedule" onMouseLeave={() => setPainting(false)} onMouseUp={() => setPainting(false)}>
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className={h === now ? 'now' : ''} title={h === now ? 'Now' : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="everyone">
            <td className="row-label muted">Everyone</td>
            {Array.from({ length: 24 }, (_, hour) => (
              <td
                key={hour}
                className={`hour slot-all ${hour === now ? 'now' : ''}`}
                title={`${hour}:00 · set for everyone`}
                onMouseDown={() => {
                  setPainting(true);
                  paintAll(hour);
                }}
                onMouseEnter={() => painting && paintAll(hour)}
              />
            ))}
          </tr>
          {living.map((c) => (
            <tr key={c.id}>
              <td className="row-label">
                <span className="swatch" style={{ background: c.color }} /> {c.name}
              </td>
              {c.schedule.map((slot, hour) => (
                <td
                  key={hour}
                  className={`hour slot-${slot} ${hour === now ? 'now' : ''}`}
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
        Colonists keep making each product until the colony holds the target amount (bows, clothes and tool kits already
        in use don't count, so the target is how many spares to keep).
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
                    aria-pressed={bill.target > 0}
                    title={bill.target > 0 ? 'Click to stop mending' : 'Click to start mending'}
                    onClick={() => set(bill.recipe, bill.target > 0 ? 0 : 1)}
                  >
                    {bill.target > 0 ? 'Mending: on' : 'Mending: off'}
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
        A handful of colonists have crash-landed. You don't steer them directly: you give orders, and they decide who
        does what between eating, sleeping and taking breaks.
      </p>
      <ol className="help-steps big">
        <li>
          <b>Follow the goals</b> on the right. Each one says how, and its button picks the right tool for you.
        </li>
        <li>
          <b>Drag on the map</b> to give orders: chop trees, mark a stockpile, outline walls. Right-click drops the
          tool.
        </li>
        <li>
          <b>Watch the alerts</b> above the goals. Click one to jump to whoever or whatever it's about.
        </li>
      </ol>
      <p className="muted">First night: walls, a door and a bed for everyone before 22:00.</p>
      <details>
        <summary>Controls</summary>
        <ul className="help-steps">
          <li>
            <kbd>Space</kbd> pauses, <kbd>1</kbd>–<kbd>3</kbd> set the speed, <kbd>Esc</kbd> backs out (and opens the
            menu for saves and settings).
          </li>
          <li>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> or right-drag pans, the wheel zooms, the minimap moves the view, <kbd>Tab</kbd> jumps from
            colonist to colonist.
          </li>
          <li>Tool hotkeys are shown on their buttons; hover a button to see what it does and costs.</li>
        </ul>
      </details>
      <details>
        <summary>The screen</summary>
        <ul className="help-steps">
          <li>
            <b>Colonist bar</b> (top): click a colonist to inspect their needs, health, social life and skills.
          </li>
          <li>
            <b>Architect</b> (bottom): orders, zones and buildings in tabs. 🔒 means research comes first.
          </li>
          <li>
            <b>Work, Schedule, Production, Research</b> (top bar): who does what, when they sleep, what gets made, and
            what to learn next.
          </li>
          <li>Click any tile in Select mode for its details; 🌡 shows temperatures on the map.</li>
        </ul>
      </details>
      <details>
        <summary>Raids and combat</summary>
        <ul className="help-steps">
          <li>
            Raiders pause the game. Press <kbd>Q</kbd> to draft everyone (or a selected colonist).
          </li>
          <li>
            Pick a stance in the inspector: take cover, hold or charge. Right-click the map to move a drafted colonist,
            or a raider to focus fire on them.
          </li>
          <li>Research better bows, armor, sandbags, embrasures and spike traps.</li>
          <li>Maddened animals sometimes come for the colony too: draft and fight them like raiders.</li>
          <li>
            Some raiders fall wounded rather than dying. Build a <b>prisoner bed</b> (Security), drag <b>Capture</b>{' '}
            over them, and colonists with <b>Warden</b> work bring them in, feed them and talk them round until they
            join. Left lying, they die within a day.
          </li>
        </ul>
      </details>
      <details>
        <summary>Food, seasons and the rest</summary>
        <ul className="help-steps">
          <li>
            Winter comes every 24 days: crops stop, so stock food. Cold storage (research refrigeration) keeps it from
            rotting; parkas (tailoring) and hearths keep colonists warm.
          </li>
          <li>
            Grow <b>healroot</b> for medicine, hunt and fish for meat and leather, forage berries for quick food.
          </li>
          <li>
            Unhappy colonists break in their own ways: a daze, a sulk, a binge, or a rage that smashes furniture.
            Sometimes a skilled artist is seized by a vision: deliver what they ask in time for a legendary sculpture.
          </li>
          <li>
            Married couples may have children. Babies stay with a parent; children play and learn by watching the adults
            work; teens help with light work; at 18 they're grown. The old slow down, and in time pass on.
          </li>
          <li>
            Food that keeps without power: grow <b>grain</b>, mill it and bake bread (research Milling), or hang meat,
            fish and berries on a <b>drying rack</b>. Clay from the riverbanks makes bricks in a kiln; the rusty veins
            in the rock give iron in a smelter.
          </li>
          <li>
            <b>Tame</b> animals for their produce: deer give milk, muskoxen wool (spin it into cloth), grouse eggs.
            Wolves hunt deer and hares but leave people alone unless hunted themselves.
          </li>
          <li>
            Weather matters: rain chills, droughts stunt crops, storms start fires. Traders visit now and then: open{' '}
            <b>Trade</b> in the top bar.
          </li>
          <li>Floors make rooms nicer, roofs keep the rain off open shelters, tool kits make workers faster.</li>
          <li>
            Campfires, hearths and torches burn wood, which haulers bring: keep a woodpile for winter. Click a stockpile
            to choose what it takes and its priority (haulers move things up to higher ones). Shelves fit three stacks
            on a tile; lock a door from its card to keep everyone out; <b>Forbid</b> items to keep everyone's hands off
            them.
          </li>
          <li>
            Blood, rubble and tracked-in dirt make rooms uglier, spoil cooking and tending, and sour moods: give someone{' '}
            <b>Clean</b> work to scrub it away. Sculptures show their quality: cracked when poor, silver-trimmed when
            excellent, gold for a masterwork.
          </li>
          <li>
            The storyteller sends good and bad turns: heat waves, eclipses, meteorites, refugees, auroras, inspired
            colonists and bumper crops among them.
          </li>
        </ul>
      </details>
    </Modal>
  );
}

const researchRank = (p: UiState['research'][number]) => (p.current ? 0 : p.done ? 3 : p.available ? 1 : 2);

export function ResearchScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  return (
    <Modal title={`Research · year ${state.year}`} onClose={onClose}>
      <p className="muted">
        {state.researchBench
          ? 'Pick a project; colonists with the Research work type study it at the research bench.'
          : 'Build a research bench (Architect › Production) first, then pick a project.'}
      </p>
      <ul className="research">
        {[...state.research]
          // What can be picked now first, then what's locked, with finished projects at the bottom.
          .sort((a, b) => researchRank(a) - researchRank(b))
          .map((p) => (
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

// Raiders lying wounded and the prisoners held, with how each is doing, and a way to let one go.
export function PrisonersScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  const held = state.captives.filter((p) => p.state === 'prisoner');
  const lying = state.captives.filter((p) => p.state === 'downed');
  return (
    <Modal title="Prisoners" onClose={onClose}>
      <p className="muted">
        Colonists with <b>Warden</b> work bring captives to a prisoner bed, feed them, and talk with them twice a day or
        so. Once their resistance is worn down, each talk may win them over to join the colony; a happy, kind warden
        does best.
      </p>
      {held.length === 0 && lying.length === 0 && <p className="muted">Nobody is held.</p>}
      {held.length > 0 && (
        <table className="summary">
          <tbody>
            {held.map((p) => (
              <tr key={p.id}>
                <td>
                  <b>{p.name}</b>
                  <div className="muted small">{p.faction}</div>
                </td>
                <td>
                  <Bar
                    value={p.food}
                    color={p.food < 0.25 ? '#ff6b6b' : '#8fd16b'}
                    label={`Fed ${Math.round(p.food * 100)}%`}
                  />
                </td>
                <td className="num">
                  {p.talksLeft > 0
                    ? `About ${p.talksLeft} talk${p.talksLeft > 1 ? 's' : ''} from ready`
                    : 'Ready to be won over'}
                </td>
                <td>
                  <ConfirmButton
                    label="Release"
                    confirm="Let them go?"
                    onConfirm={() => controller.command({ type: 'release', captive: p.id })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {lying.length > 0 && (
        <>
          <h3>Lying wounded</h3>
          <table className="summary">
            <tbody>
              {lying.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.name}</b>
                    <div className="muted small">{p.faction}</div>
                  </td>
                  <td className="num">
                    {p.capture ? 'To be brought in' : 'Not marked for capture'} · dies in {p.hoursLeft}h
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
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
      <h3>Festivals</h3>
      <label className="setting">
        <span>Keep the seasonal festivals (Planting Day, the harvest festival, the midwinter bonfire)</span>
        <input
          type="checkbox"
          checked={state.festivals}
          onChange={(e) => controller.command({ type: 'festivals', on: e.target.checked })}
        />
      </label>
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
