import { TOUCH } from './touch';
import { useEffect, useRef, useState } from 'react';
import { ChronicleYear, UiState, controller } from '../game/controller';
import { ChronicleKind } from '../sim/chronicle';
import { ScheduleSlot, SkillKey, WORK_TYPES, WorkTypeKey, WorldAction } from '../sim/types';
import { Bar, SLOT_LABELS, WORK_LABELS, moodColor } from './common';
import { ADULT, TEEN, TEEN_WORK } from '../sim/lifespans';
import { Hours, Hunting, POLICY_TEXT, Rations } from '../sim/village';

// Full-screen dialogs opened from the top bar.

export function Modal({
  title,
  onClose,
  children,
  wide,
  medium,
  closable = true,
  footer,
  closeButton = true,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  medium?: boolean;
  // False for screens the player has to act on (the fallen colony).
  closable?: boolean;
  // Buttons that go beside Close at the bottom (Back, say).
  footer?: React.ReactNode;
  // False when the dialog has its own way out at the bottom (the pause menu's Resume); ✕ stays.
  closeButton?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Keyboard focus moves into the dialog when it opens (unless a button in it already took it), Tab keeps it
  // there, and on closing it goes back to wherever it was.
  useEffect(() => {
    // (Only keyboard focus: a button clicked with the mouse shouldn't take the focus back and with it Tab and
    // Space from the game.)
    const active = document.activeElement;
    const before = active instanceof HTMLElement && active.matches(':focus-visible') ? active : null;
    if (!panel.current?.contains(document.activeElement)) {
      panel.current?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      const box = panel.current;
      if (e.key !== 'Tab' || !box) {
        return;
      }
      const items = [
        ...box.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"], a[href]',
        ),
      ].filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      if (!box.contains(at) || (e.shiftKey ? at === first || at === box : at === last)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (before && before !== document.body && document.contains(before)) {
        before.focus({ preventScroll: true });
      }
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={closable ? onClose : undefined}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`panel modal ${wide ? 'wide' : medium ? 'medium' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          {closable && (
            <button className="modal-x" onClick={onClose} aria-label="Close (Esc)" title="Close (Esc)">
              ✕
            </button>
          )}
        </div>
        {children}
        {closable && (closeButton || footer) && (
          <div className="row end">
            {footer}
            {closeButton && <button onClick={onClose}>Close</button>}
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

// How long a finger rests on a Work cell to step back, and how far it can wander before it's a scroll instead.
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

// A held finger standing in for a right-click. iPhones send no contextmenu for one at all; Android sends one
// as well, so while a finger is down the contextmenu is left to the hold. After a hold fires, the click that
// lifting the finger makes is swallowed.
function useLongPress() {
  const hold = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);
  const stop = () => {
    if (hold.current) {
      clearTimeout(hold.current.timer);
    }
  };
  useEffect(() => stop, []);
  return (onTap: () => void, onBack: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      stop();
      hold.current = null;
      if (e.pointerType !== 'touch') {
        return;
      }
      const h = { timer: 0, x: e.clientX, y: e.clientY, fired: false };
      h.timer = window.setTimeout(() => {
        h.fired = true;
        navigator.vibrate?.(15);
        onBack();
      }, LONG_PRESS_MS);
      hold.current = h;
    },
    onPointerMove: (e: React.PointerEvent) => {
      const h = hold.current;
      if (h && !h.fired && Math.hypot(e.clientX - h.x, e.clientY - h.y) > LONG_PRESS_SLOP) {
        stop();
        hold.current = null;
      }
    },
    onPointerUp: stop,
    // The table scrolling under the finger.
    onPointerCancel: () => {
      stop();
      hold.current = null;
    },
    onClick: () => {
      const held = hold.current?.fired;
      stop();
      hold.current = null;
      if (!held) {
        onTap();
      }
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      if (!hold.current) {
        onBack();
      }
    },
  });
}

export function WorkScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  // Left click raises the number (1 → 4 → off → 1); right click (or a long press) goes the other way.
  const forward = (value: number) => (value === 0 ? 1 : value === 4 ? 0 : value + 1);
  const back = (value: number) => (value === 0 ? 4 : value === 1 ? 0 : value - 1);
  const press = useLongPress();
  return (
    <Modal title="Work priorities" onClose={onClose} wide>
      <p className="muted">
        {TOUCH ? 'Tap' : 'Click'} a cell to cycle 1 (do first) → 4 (do last) → off
        {TOUCH ? '; hold one to go back' : '; right-click goes back'}. At equal priority, colonists work left to right.
        The small number is the colonist's skill (★ a passion: they learn faster and enjoy it); brighter cells are
        better at it.
      </p>
      <div className="table-scroll">
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
                          {...press(
                            () => set(forward(value)),
                            () => set(back(value)),
                          )}
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
      </div>
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
  // Painting by mouse or finger: the cell under the pointer (a finger's drag doesn't enter cells), each
  // cell once per stroke.
  const lastCell = useRef('');
  const paintAt = (x: number, y: number) => {
    const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>('td[data-hour]');
    const key = cell ? `${cell.dataset.who}:${cell.dataset.hour}` : '';
    if (!cell || key === lastCell.current) {
      return;
    }
    lastCell.current = key;
    const hour = Number(cell.dataset.hour);
    if (cell.dataset.who === 'all') {
      paintAll(hour);
    } else {
      paint(Number(cell.dataset.who), hour);
    }
  };
  const stop = () => {
    setPainting(false);
    lastCell.current = '';
  };
  // From the keyboard: Enter or Space paints the focused hour with the brush.
  const onCellKey = (e: React.KeyboardEvent, apply: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      apply();
    }
  };
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
          Pick a brush, then {TOUCH ? 'tap' : 'click'} or drag across hours. The Everyone row sets the whole colony.
        </span>
      </div>
      <div className="table-scroll">
        <table
          className="grid schedule"
          onPointerDown={(e) => {
            if (e.button === 0 && (e.target as HTMLElement).closest('td[data-hour]')) {
              setPainting(true);
              paintAt(e.clientX, e.clientY);
            }
          }}
          onPointerMove={(e) => painting && paintAt(e.clientX, e.clientY)}
          onPointerUp={stop}
          onPointerCancel={stop}
          onPointerLeave={stop}
        >
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
                  data-who="all"
                  data-hour={hour}
                  tabIndex={0}
                  role="button"
                  aria-label={`Everyone, ${hour}:00: set to ${SLOT_LABELS[brush]}`}
                  onKeyDown={(e) => onCellKey(e, () => paintAll(hour))}
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
                    data-who={c.id}
                    data-hour={hour}
                    tabIndex={0}
                    role="button"
                    aria-label={`${c.name}, ${hour}:00: ${SLOT_LABELS[slot]}`}
                    onKeyDown={(e) => onCellKey(e, () => paint(c.id, hour))}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export function ProductionScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  const set = (recipe: number, target: number) => controller.command({ type: 'bill', recipe, target });
  return (
    <Modal title="Production" onClose={onClose} medium>
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
          <b>Follow the goals</b> {TOUCH ? '(the ◀ tab at the top right)' : 'on the right'}. Each one says how, and its
          button picks the right tool for you.
        </li>
        <li>
          <b>Drag on the map</b> to give orders: chop trees, mark a stockpile, outline walls.{' '}
          {TOUCH ? 'Tap Select to put the tool down.' : 'Right-click drops the tool.'}
        </li>
        <li>
          <b>Watch the alerts</b> above the goals. {TOUCH ? 'Tap' : 'Click'} one to jump to whoever or whatever it's
          about.
        </li>
      </ol>
      <p className="muted">
        First night: walls, a door and a bed for everyone before 22:00. The timber salvaged from your landing is a
        start; a small hut (5×5) is plenty. The clock waits until you start it (Space).
      </p>
      <details>
        <summary>Controls</summary>
        <ul className="help-steps">
          <li>
            <kbd>Space</kbd> pauses, <kbd>1</kbd>–<kbd>3</kbd> set the speed, <kbd>Q</kbd> drafts everyone (or the
            selected colonist) to fight, <kbd>Esc</kbd> backs out (and opens the menu for saves and settings).
          </li>
          <li>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> or right-drag pans, the wheel zooms, the minimap moves the view, <kbd>Tab</kbd> jumps from
            colonist to colonist, <kbd>H</kbd> brings the view back to the colony.
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
            <b>Build bar</b> (bottom): orders, zones and buildings in tabs. 🔒 means research comes first.
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
            Pick a stance in the inspector: take cover, hold or charge. {TOUCH ? 'Tap' : 'Right-click'} the map to move
            a drafted colonist, or a raider to focus fire on them.
          </li>
          <li>
            Research better bows, armor, sandbags, embrasures and spike traps. Raiders' arrows and blows land less often
            on colonists behind sandbags.
          </li>
          <li>
            Raiders go down when badly hurt, and the rest run once nearly half are out of the fight. If the Meadow Kin
            think well of the colony they may send fighters to help. A siege party camps nearby and attacks later: break
            the camp early, or fortify and wait.
          </li>
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
            Tend wounds promptly and somewhere clean: an untended cut can turn infected (herbal medicine treats it
            best), and a bad wound may leave a limp, a stiff hand or a lost eye. Hospital beds heal faster.
          </li>
          <li>
            With three adults, the colony votes for a <b>leader</b> each season. Set rations, working hours and days of
            rest on the <b>Village</b> screen: each pleases some colonists and annoys others.
          </li>
          <li>
            The <b>Factions</b> screen shows what the neighbours ask of you: send it, or hunt down the great boar, for
            silver and goodwill. Gifts win goodwill too, and silver paid to raiders buys twelve days of peace.
          </li>
          <li>
            After Deep mining, a <b>mine shaft</b> gives miners endless digging for stone, iron ore and silver, richer
            the deeper it goes. Dig past twenty metres and something may come up out of it: have fighters ready.
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
            Campfires, hearths and torches burn wood, which haulers bring: keep a woodpile for winter. A fire in the
            open warms the tiles around it, somewhere to huddle before there's a roof. Click a stockpile to choose what
            it takes and its priority (haulers move things up to higher ones). Shelves fit three stacks on a tile; lock
            a door from its card to keep everyone out; <b>Forbid</b> items to keep everyone's hands off them.
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
    <Modal title="Research" onClose={onClose}>
      <p className="muted">
        {state.researchBench
          ? 'Pick a project; colonists with the Research work type study it at the research bench, a few hundred points an hour each.'
          : 'Build a research bench (the Production tab of the build bar at the bottom) first, then pick a project.'}{' '}
        {state.research.filter((p) => p.done).length} of {state.research.length} projects learned.
      </p>
      <ul className="research">
        {[...state.research]
          // What can be picked now first, then what's locked, with finished projects at the bottom.
          .sort((a, b) => researchRank(a) - researchRank(b))
          .map((p) => (
            <li key={p.key} className={p.done ? 'done' : p.current ? 'current' : p.available ? '' : 'locked'}>
              <div className="research-head">
                <b>{p.name}</b>
                <span className="muted">
                  {p.done
                    ? 'Done'
                    : `${Math.round(p.progress * p.cost).toLocaleString()} / ${p.cost.toLocaleString()} points`}
                </span>
                {p.current && <span className="tag good">studying now</span>}
                {!p.done && p.available && (
                  <button
                    onClick={() => controller.setResearch(p.current ? null : p.key)}
                    title={p.current ? 'Stop studying this (progress is kept)' : 'Study this next (progress is kept)'}
                  >
                    {p.current ? 'Stop' : 'Research'}
                  </button>
                )}
              </div>
              <div className="muted small">
                {p.description}
                {!p.available && !p.done && p.requires.length > 0 && ` Requires ${p.requires.join(', ')}.`}
                {!p.done && p.needs && ` ${p.needs}`}
              </div>
              {p.held && <div className="small warn-text">{p.held}</div>}
              {!p.done && <Bar value={p.progress} color="#8fc3ff" label={`${p.name} progress`} />}
            </li>
          ))}
      </ul>
    </Modal>
  );
}

// The neighbours: a favour they've asked, gifts to win them over, and tribute to keep raiders away.
export function FactionsScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  const d = state.diplomacy;
  const r = d.request;
  const left = (hours: number) => (hours > 24 ? `${Math.ceil(hours / 24)} days left` : `${hours}h left`);
  return (
    <Modal title="Factions" onClose={onClose}>
      <h3>Request</h3>
      {r ? (
        <>
          <p>
            <b>{r.faction}</b> ask: {r.text}. <span className="muted">{left(r.hoursLeft)}.</span>
          </p>
          <div className="row">
            {r.kind !== 'hunt' ? (
              <button
                disabled={r.have < r.count}
                onClick={() => controller.command({ type: 'fulfilRequest' })}
                title="They collect it from your stockpiles"
              >
                Send {r.count} ({r.have} stored)
              </button>
            ) : (
              <span className="muted small">
                Find it and drag <b>Hunt</b> over it. Hunters need a bow, and it fights back hard: draft help if it
                turns on them.
              </span>
            )}
            {r.quarryTile !== null && (
              <button
                onClick={() => {
                  controller.focusAlert({ text: '', tone: 'calm', tile: r.quarryTile! });
                  onClose();
                }}
              >
                Show me
              </button>
            )}
            <ConfirmButton
              label="Turn down"
              confirm="They'll think a little less of you. Sure?"
              onConfirm={() => controller.command({ type: 'declineRequest' })}
            />
          </div>
        </>
      ) : (
        <p className="muted">
          Nothing asked of the colony just now. The neighbours take turns to ask a favour every week or so, if they're
          on good terms with you: doing it earns silver, goods (or a new colonist) and their goodwill; turning it down
          or letting it lapse costs some.
        </p>
      )}
      <WorldNews state={state} />
      <h3>Neighbours</h3>
      <p className="muted small">
        Your silver: {d.silver}. Goodwill brings better prices, more caravans and more gifts of supplies; below 0 they
        stop trading altogether. Raiders soften when their people are let go or ransomed, and harden when they are
        starved; the warier they are, the more often and harder they raid.
      </p>
      <table className="summary">
        <tbody>
          {state.factions.map((f) => (
            <tr key={f.id}>
              <td>
                <b>{f.name}</b>
                <div className="muted small">{f.description}</div>
              </td>
              <td className="num">
                {f.relation}
                <div className="muted small">goodwill {f.goodwill}</div>
                {f.peaceDays > 0 && <div className="muted small">{f.peaceDays} days of peace left</div>}
                {f.truceDays > 0 && <div className="muted small">{f.truceDays} days of truce left</div>}
              </td>
              <td>
                {f.hostile ? (
                  <div className="row">
                    <button
                      disabled={d.silver < d.tributeCost}
                      onClick={() => controller.command({ type: 'tribute', faction: f.id })}
                      title="Pay them to leave the colony alone for 12 days: their share of the raids stops (the others still come)"
                    >
                      Pay {d.tributeCost} silver for peace
                    </button>
                    <button
                      disabled={f.goodwill < d.truceGoodwill || f.truceDays > 0}
                      onClick={() => controller.command({ type: 'world', action: { kind: 'truce', faction: f.id } })}
                      title={
                        f.goodwill < d.truceGoodwill
                          ? `They won't agree below goodwill ${d.truceGoodwill}: let their people go, or ransom them`
                          : 'No raids from them for a while; it spends some of their goodwill'
                      }
                    >
                      Offer a truce
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="row">
                      {d.giftSizes.map((s, k) => (
                        <button
                          key={s}
                          disabled={d.silver < s || f.giftGains[k] <= 0}
                          onClick={() => controller.command({ type: 'gift', faction: f.id, silver: s })}
                          title={
                            f.giftGains[k] > 0
                              ? `Give ${s} silver: goodwill +${f.giftGains[k]}`
                              : 'They already think the world of the colony'
                          }
                        >
                          Gift {s} silver
                        </button>
                      ))}
                    </div>
                    {f.id === d.settler.faction && (
                      <div className="row">
                        <button
                          disabled={d.silver < d.hireCost || (f.goodwill ?? 0) < d.hireGoodwill}
                          onClick={() => controller.command({ type: 'hireFighters', faction: f.id })}
                          title={
                            (f.goodwill ?? 0) < d.hireGoodwill
                              ? `They won't fight for the colony below goodwill ${d.hireGoodwill}`
                              : `Their fighters come to every raid and siege for ${d.hireDays} days, within the hour`
                          }
                        >
                          Hire fighters: {d.hireCost} silver
                        </button>
                        {d.hiredDaysLeft > 0 && (
                          <span className="muted small">Fighters hired for {d.hiredDaysLeft} more days</span>
                        )}
                      </div>
                    )}
                    {f.id === d.settler.faction && (
                      <div className="row">
                        <button
                          disabled={
                            d.silver < d.settler.cost ||
                            f.goodwill < d.settler.goodwill ||
                            d.settler.waitDays > 0 ||
                            !d.settler.room
                          }
                          onClick={() =>
                            controller.command({ type: 'world', action: { kind: 'settler', faction: f.id } })
                          }
                          title={
                            !d.settler.room
                              ? 'The colony has no room for more'
                              : f.goodwill < d.settler.goodwill
                                ? `They won't send one of their own below goodwill ${d.settler.goodwill}`
                                : d.settler.waitDays > 0
                                  ? `Nobody else is ready to leave for ${d.settler.waitDays} days`
                                  : 'A willing settler comes to join the colony'
                          }
                        >
                          Ask for a settler: {d.settler.cost} silver
                        </button>
                      </div>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Expeditions state={state} />
    </Modal>
  );
}

// Quarrels between the neighbours, an envoy's offer, an ally's call for help.
function WorldNews({ state }: { state: UiState }) {
  const d = state.diplomacy;
  const world = (action: WorldAction) => controller.command({ type: 'world', action });
  const [lend, setLend] = useState<number | null>(null);
  const free = d.travellers.filter((t) => t.why === null);
  const lender = free.find((t) => t.id === lend) ?? free[0];
  if (!d.dispute && !d.envoy && !d.call && !d.alliance) {
    return null;
  }
  const left = (hours: number) => (hours > 24 ? `${Math.ceil(hours / 24)} days left` : `${hours}h left`);
  return (
    <>
      <h3>Neighbours' news</h3>
      {d.alliance && (
        <p>
          Allied with <b>{d.alliance.faction}</b> for {d.alliance.daysLeft} more days: their fighters come to your raids
          more readily, and they will ask for help when raided.
        </p>
      )}
      {d.call && (
        <>
          <p>
            <b>{d.call.faction}</b> are under attack and ask for help: lend a colonist for a few days, or send{' '}
            {d.call.goods}. <span className="muted">{left(d.call.hoursLeft)}. Refusing ends the alliance.</span>
          </p>
          <div className="row">
            <button disabled={d.call.have < d.call.count} onClick={() => world({ kind: 'call', answer: 'goods' })}>
              Send the goods ({d.call.have} stored)
            </button>
            {lender && (
              <>
                <select value={lender.id} onChange={(e) => setLend(Number(e.target.value))} aria-label="Who to lend">
                  {free.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button onClick={() => world({ kind: 'call', answer: lender.id })}>Lend {lender.name}</button>
              </>
            )}
            <ConfirmButton
              label="Refuse"
              confirm="They'll end the alliance. Sure?"
              onConfirm={() => world({ kind: 'call', answer: 'refuse' })}
            />
          </div>
        </>
      )}
      {d.dispute && (
        <>
          <p>
            <b>{d.dispute.a.name}</b> and <b>{d.dispute.b.name}</b> are quarrelling over {d.dispute.about}. Whoever you
            back will be pleased and the other offended. <span className="muted">{left(d.dispute.hoursLeft)}.</span>
          </p>
          <div className="row">
            {[d.dispute.a, d.dispute.b].map((side) => (
              <button key={side.id} onClick={() => world({ kind: 'dispute', side: side.id })}>
                Back {side.name}
              </button>
            ))}
            <button onClick={() => world({ kind: 'dispute', side: null })}>Stay out of it</button>
          </div>
        </>
      )}
      {d.envoy && (
        <>
          <p>
            An envoy from <b>{d.envoy.faction}</b> offers an alliance for {d.envoy.days} days. Their rivals will take it
            badly. <span className="muted">{left(d.envoy.hoursLeft)}.</span>
          </p>
          <div className="row">
            <button onClick={() => world({ kind: 'envoy', accept: true })}>Accept</button>
            <button onClick={() => world({ kind: 'envoy', accept: false })}>Send them home</button>
          </div>
        </>
      )}
    </>
  );
}

// Parties away, and sending a new one.
function Expeditions({ state }: { state: UiState }) {
  const d = state.diplomacy;
  const [dest, setDest] = useState(0);
  const [chosen, setChosen] = useState<number[]>([]);
  const target = d.destinations[Math.min(dest, d.destinations.length - 1)];
  const party = chosen.filter((id) => d.travellers.some((t) => t.id === id && t.why === null));
  const cost = party.length > 0 ? d.supplies[target.purpose][party.length - 1] : 0;
  const toggle = (id: number) =>
    setChosen((now) => (now.includes(id) ? now.filter((x) => x !== id) : now.length < 3 ? [...now, id] : now));
  return (
    <>
      <h3>Expeditions</h3>
      <p className="muted small">
        Send one to three colonists off the map for a few days: to a neighbour's settlement to trade and make friends,
        or to the ruins to salvage. Supplies cost silver, and a trading party carries silver to spend (it goes further
        than with a caravan); there's a chance of trouble on the road.
      </p>
      {d.expeditions.map((e, k) => (
        <p key={k}>
          <b>{e.who}</b>: {e.leaving ? 'setting off for' : 'away at'} {e.where}, back in about {e.daysLeft} day
          {e.daysLeft === 1 ? '' : 's'}.
        </p>
      ))}
      <div className="row">
        <select value={dest} onChange={(e) => setDest(Number(e.target.value))} aria-label="Where to">
          {d.destinations.map((t, k) => (
            <option key={k} value={k} disabled={!t.open}>
              {t.label} ({t.days} days)
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        {d.travellers.map((t) => (
          <label key={t.id} className="small" title={t.why ?? undefined}>
            <input
              type="checkbox"
              disabled={t.why !== null}
              checked={party.includes(t.id)}
              onChange={() => toggle(t.id)}
            />{' '}
            {t.name}
            {t.why && <span className="muted"> ({t.why})</span>}
          </label>
        ))}
      </div>
      <div className="row">
        <button
          disabled={party.length === 0 || !target.open || d.silver < cost}
          onClick={() => {
            controller.command({
              type: 'world',
              action: { kind: 'expedition', to: target.to, purpose: target.purpose, colonists: party },
            });
            setChosen([]);
          }}
        >
          Send {party.length || ''} ({cost} silver)
        </button>
      </div>
    </>
  );
}

// The colony's leader (chosen by vote each season) and the policies it lives by.
export function VillageScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  const v = state.village;
  const set = (policy: { rations?: Rations; hours?: Hours; restDays?: boolean; hunting?: Hunting }) =>
    controller.command({ type: 'policy', ...policy });
  const choice = <T extends string>(value: T, current: T, label: string, apply: () => void) => (
    <button key={value} className={value === current ? 'active' : ''} aria-pressed={value === current} onClick={apply}>
      {label}
    </button>
  );
  return (
    <Modal title="The village" onClose={onClose}>
      <h3>Leader</h3>
      {v.leader ? (
        <p>
          <b>{v.leader.name}</b>, chosen on day {v.electedOn}.{' '}
          <span className="muted">
            {v.leader.mood >= 45
              ? 'In good spirits: everyone feels in good hands.'
              : v.leader.mood < 25
                ? 'Struggling, and it shows: the colony feels it too.'
                : 'Holding up.'}
          </span>
        </p>
      ) : (
        <p className="muted">
          {v.standings.length > 0
            ? 'No leader yet: the colony will hold a vote within the hour.'
            : 'No leader yet: the colony holds a vote as soon as it has three adults to cast one.'}
        </p>
      )}
      <p className="muted small">
        A vote is held at the start of every season. Each adult backs whoever they think best of; a kind nature helps.
        {v.standings.length > 0 &&
          ` If it were held now: ${v.standings.map((s) => `${s.name} ${s.votes}`).join(', ')}.`}
      </p>
      <h3>Policies</h3>
      <div className="muted small">Rations</div>
      <div className="row">
        {choice('frugal', v.rations, 'Frugal', () => set({ rations: 'frugal' }))}
        {choice('normal', v.rations, 'Normal', () => set({ rations: 'normal' }))}
        {choice('generous', v.rations, 'Generous', () => set({ rations: 'generous' }))}
      </div>
      <p className="muted small">{POLICY_TEXT.rations[v.rations]}</p>
      <div className="muted small">Working hours</div>
      <div className="row">
        {choice('short', v.hours, 'Short', () => set({ hours: 'short' }))}
        {choice('normal', v.hours, 'Normal', () => set({ hours: 'normal' }))}
        {choice('long', v.hours, 'Long', () => set({ hours: 'long' }))}
      </div>
      <p className="muted small">{POLICY_TEXT.hours[v.hours]}</p>
      <label className="setting">
        <span>
          Days of rest: one day in six, nobody works but to keep everyone safe and fed, and all are the happier for it
        </span>
        <input type="checkbox" checked={v.restDays} onChange={(e) => set({ restDays: e.target.checked })} />
      </label>
      <div className="muted small">Hunting</div>
      <div className="row">
        {choice('all', v.hunting, 'Hunt all', () => set({ hunting: 'all' }))}
        {choice('surplus', v.hunting, 'Surplus only', () => set({ hunting: 'surplus' }))}
      </div>
      <p className="muted small">{POLICY_TEXT.hunting[v.hunting]}</p>
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
        does best. Their people notice: letting them go (or selling them back) softens them, starving them does not.
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
                  <div className="muted small">Fed {Math.round(p.food * 100)}%</div>
                  <Bar
                    value={p.food}
                    color={p.food < 0.25 ? '#ff6b6b' : '#8fd16b'}
                    label={`Fed ${Math.round(p.food * 100)}%`}
                  />
                </td>
                <td className="num">
                  {p.talksLeft > 0
                    ? `About ${p.talksLeft} talk${p.talksLeft > 1 ? 's' : ''} from ready`
                    : p.noRoom
                      ? 'Ready, but the colony is full'
                      : 'Ready to be won over'}
                </td>
                <td>
                  <div className="row">
                    <ConfirmButton
                      label="Set free"
                      confirm="Set them free?"
                      onConfirm={() => controller.command({ type: 'release', captive: p.id })}
                    />
                    <ConfirmButton
                      label={`Ransom: ${p.ransom} silver`}
                      confirm="Sell them back?"
                      onConfirm={() => controller.command({ type: 'world', action: { kind: 'ransom', captive: p.id } })}
                    />
                    <ConfirmButton
                      label="Execute"
                      confirm="Put them to death? Everyone will take it hard"
                      onConfirm={() => controller.command({ type: 'execute', captive: p.id })}
                    />
                  </div>
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

const CHRONICLE_ICONS: Record<ChronicleKind, string> = {
  founding: '⚑',
  birth: '✿',
  death: '✝',
  marriage: '♥',
  battle: '⚔',
  threat: '☠',
  newcomer: '➜',
  work: '★',
  discovery: '✎',
  leader: '♛',
  milestone: '◆',
};

// The colony's history by year, newest year open; discoveries can be hidden to read the story itself.
// Only open years render their entries (a long game has thousands).
function Chronicle({ years }: { years: ChronicleYear[] }) {
  const [discoveries, setDiscoveries] = useState(false);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const shown = years
    .map((y) => ({ year: y.year, entries: y.entries.filter((e) => discoveries || e.kind !== 'discovery') }))
    .filter((y) => y.entries.length > 0);
  if (years.length === 0) {
    return <p className="muted">Nothing worth remembering yet.</p>;
  }
  return (
    <div className="chronicle">
      <label className="setting">
        <span>Include discoveries (research)</span>
        <input type="checkbox" checked={discoveries} onChange={(e) => setDiscoveries(e.target.checked)} />
      </label>
      {shown.length === 0 && <p className="muted">Only discoveries so far.</p>}
      {shown.map((y, k) => {
        const isOpen = open[y.year] ?? k === 0;
        return (
          <details
            key={y.year}
            open={isOpen}
            onToggle={(e) => {
              const now = (e.currentTarget as HTMLDetailsElement).open;
              if (now !== isOpen) {
                setOpen((o) => ({ ...o, [y.year]: now }));
              }
            }}
          >
            <summary>
              Year {y.year}{' '}
              <span className="muted small">
                · {y.entries.length} {y.entries.length === 1 ? 'entry' : 'entries'}
              </span>
            </summary>
            {isOpen && (
              <ul className="chronicle-list">
                {y.entries.map((e, i) => (
                  <li key={i} className={`chronicle-${e.kind}`}>
                    <span className="chronicle-icon" aria-hidden="true">
                      {CHRONICLE_ICONS[e.kind]}
                    </span>
                    <span className="muted small chronicle-when">
                      {e.season}, day {e.day}
                    </span>{' '}
                    {e.text}
                  </li>
                ))}
              </ul>
            )}
          </details>
        );
      })}
    </div>
  );
}

// One measure over the days, as a line: a single series, so the title names it (no legend), a recessive
// baseline, the first and last day under it, and a crosshair with the day's value on hover.
const CHART_W = 240;
const CHART_H = 64;
function HistoryChart({
  title,
  points,
  format,
}: {
  title: string;
  points: [number, number][];
  format: (value: number) => string;
}) {
  // The day under the pointer (or chosen with the arrow keys): a day, not a position in the list, which is
  // thinned out as the history grows while the screen is open.
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const max = Math.max(1, ...points.map(([, v]) => v));
  const first = points[0][0];
  const last = points[points.length - 1][0];
  const nearest = (day: number) =>
    points.reduce((best, p, k) => (Math.abs(p[0] - day) < Math.abs(points[best][0] - day) ? k : best), 0);
  const hover = hoverDay === null ? null : nearest(hoverDay);
  const x = (day: number) => ((day - first) / Math.max(1, last - first)) * CHART_W;
  const y = (v: number) => CHART_H - (v / max) * (CHART_H - 6);
  const path = points.map(([d, v], k) => `${k === 0 ? 'M' : 'L'}${x(d).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const shown = hover !== null ? points[hover] : points[points.length - 1];
  return (
    <figure className="history-chart">
      <figcaption>
        <span>{title}</span>
        <span className="history-value">
          {hover !== null && <span className="muted small">day {shown[0]} · </span>}
          {format(shown[1])}
        </span>
      </figcaption>
      <div className="history-plot">
        {hover !== null && (
          <span
            className="history-dot"
            style={{ left: `${(x(shown[0]) / CHART_W) * 100}%`, top: `${((y(shown[1]) + 2) / (CHART_H + 4)) * 100}%` }}
          />
        )}
        <svg
          viewBox={`0 -2 ${CHART_W} ${CHART_H + 4}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${title}, day ${first} to ${last}: from ${format(points[0][1])} to ${format(points[points.length - 1][1])}`}
          tabIndex={0}
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            setHoverDay(first + ((e.clientX - box.left) / box.width) * (last - first));
          }}
          onPointerDown={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            setHoverDay(first + ((e.clientX - box.left) / box.width) * (last - first));
          }}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setHoverDay(null)}
          onBlur={() => setHoverDay(null)}
          onKeyDown={(e) => {
            // Arrow keys step through the days.
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              const at = hover ?? points.length - 1;
              const next = Math.max(0, Math.min(points.length - 1, at + (e.key === 'ArrowLeft' ? -1 : 1)));
              setHoverDay(points[next][0]);
            }
          }}
        >
          <line className="history-base" x1={0} x2={CHART_W} y1={CHART_H} y2={CHART_H} />
          <path className="history-line" d={path} vectorEffect="non-scaling-stroke" />
          {hover !== null && (
            <>
              <line
                className="history-cross"
                x1={x(shown[0])}
                x2={x(shown[0])}
                y1={0}
                y2={CHART_H}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>
      </div>
      <div className="history-axis muted small">
        <span>day {first}</span>
        <span>day {last}</span>
      </div>
    </figure>
  );
}

// The colony over time, from its daily record: four measures, each in its own chart.
function History({ history }: { history: UiState['history'] }) {
  if (history.length < 2) {
    return <p className="muted">The first days are still to be written: the graphs start after a couple of days.</p>;
  }
  // A long game has hundreds of days: no more than about 120 points a line.
  const step = Math.ceil(history.length / 120);
  const days = history.filter((_, k) => k % step === 0 || k === history.length - 1);
  const series = (k: number) => days.map((d) => [d[0], d[k]] as [number, number]);
  return (
    <div className="history-grid">
      <HistoryChart title="Colonists" points={series(1)} format={(v) => String(v)} />
      <HistoryChart title="Average mood" points={series(2)} format={(v) => String(v)} />
      <HistoryChart
        title="Wealth"
        points={series(3)}
        format={(v) => (v < 1000 ? `${v} silver` : `${(v / 1000).toFixed(1)}k silver`)}
      />
      <HistoryChart title="Food" points={series(4)} format={(v) => `${v.toFixed(1)} days`} />
    </div>
  );
}

export function StoryScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  return (
    <Modal title="The story so far" onClose={onClose}>
      <h3>History</h3>
      <History history={state.history} />
      <h3>Chronicle</h3>
      <Chronicle years={state.chronicle} />
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

// Everyone at a glance: mood, needs, health, what they're doing, and what they're best at. A row picks that
// colonist (and closes the screen, so the camera can go to them).
export function ColonistsScreen({ state, onClose }: { state: UiState; onClose: () => void }) {
  const living = state.colonists.filter((c) => !c.dead);
  const need = (value: number) => (
    <span className={value < 0.25 ? 'bad' : value < 0.5 ? 'warn' : ''}>{Math.round(value * 100)}%</span>
  );
  return (
    <Modal title={`Colonists (${living.length})`} onClose={onClose} wide>
      <div className="table-scroll">
        <table className="grid colonists-table">
          <thead>
            <tr>
              <th />
              <th>Mood</th>
              <th>Food</th>
              <th>Rest</th>
              <th>Fun</th>
              <th>Health</th>
              <th>Doing</th>
              <th>Best at</th>
            </tr>
          </thead>
          <tbody>
            {living.map((c) => {
              const best = [...c.skillList]
                .sort((a, b) => b.level - a.level || b.passion - a.passion)
                .slice(0, 2)
                .map((s) => `${s.label} ${s.level}${'★'.repeat(s.passion)}`)
                .join(', ');
              const pick = () => {
                controller.selectColonist(c.id, true);
                onClose();
              };
              return (
                <tr key={c.id} className={state.selectedColonist === c.id ? 'selected' : ''} onClick={pick}>
                  <td className="row-label">
                    <button
                      className="link"
                      onClick={(e) => {
                        e.stopPropagation();
                        pick();
                      }}
                    >
                      <span className="swatch" style={{ background: c.color }} /> {c.name}
                    </button>
                    <span className="muted small"> {c.age < ADULT ? `${c.stage}, ${c.age}` : c.age}</span>
                    {c.leader && <span className="tag good">leader</span>}
                  </td>
                  <td>
                    <span style={{ color: moodColor(c.mood) }}>{c.mood}</span>
                    {c.inBreak && <span className="tag danger">break</span>}
                  </td>
                  <td>{need(c.needs.food)}</td>
                  <td>{need(c.needs.rest)}</td>
                  <td>{need(c.needs.joy)}</td>
                  <td>
                    {c.status === 'Healthy' ? (
                      <span className="muted">fine</span>
                    ) : (
                      <span className={c.status === 'Downed' ? 'bad' : 'warn'}>{c.status.toLowerCase()}</span>
                    )}
                    {c.bleeding && <span className="bad"> bleeding</span>}
                    {c.disease && <span className="muted small"> {c.disease.label.toLowerCase()}</span>}
                  </td>
                  <td className="small">{c.drafted ? 'Drafted' : c.activity}</td>
                  <td className="small">{best}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
