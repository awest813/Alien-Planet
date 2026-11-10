import { TOUCH, forTouch } from './touch';
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  ColonistView,
  ObjectiveView,
  TOOLS,
  TOOL_GROUPS,
  TileView,
  ToolGroup,
  UiState,
  controller,
} from '../game/controller';
import { itemIconStyle } from '../render/icons';
import { PHASE_NAMES } from '../sim/simulation';
import type { Stance } from '../sim/types';
import { STORAGE_GROUPS, StockpilePriority } from '../sim/world';
import { DRAFT_AGE } from '../sim/lifespans';
import { Bar, arrowKeys, fields, moodColor, useHover, useUi } from './common';

// The always-on game HUD: top bar, colonist bar, inspector, side panel, and architect menu.

export type Screen =
  | 'menu'
  | 'settings'
  | 'trade'
  | 'work'
  | 'schedule'
  | 'production'
  | 'research'
  | 'story'
  | 'help'
  | 'ship'
  | 'prisoners'
  | 'village'
  | 'factions'
  | 'colonists'
  | null;

const SPEEDS = [
  { label: '❚❚', title: 'Pause (Space)' },
  { label: '▶', title: 'Normal speed (1)' },
  { label: '▶▶', title: 'Fast (2)' },
  { label: '▶▶▶', title: 'Fastest (3)' },
];

const formatPower = (watts: number) => (Math.abs(watts) >= 1000 ? `${(watts / 1000).toFixed(1)} kW` : `${watts} W`);

// How tight the top bar must be to keep to one row: it measures itself after each render and steps down (compact,
// tight, squeeze) while its last item has wrapped below the first; a window resize, a new interface size or a
// new day start it over. On a phone it's laid out in rows on purpose, and kept compact.
// (The last: squeezed and still on two rows, it goes back to merely compact and lets them be two, rather than
// lose the title, the weather and the resources for nothing.)
const FIT_LEVELS = ['', 'compact', 'compact tight', 'compact tight squeeze', 'compact'];
function useTopBarFit(
  state: Pick<
    UiState,
    'raid' | 'animalsAttacking' | 'trade' | 'captives' | 'diplomacy' | 'weather' | 'settings' | 'day'
  >,
): { ref: React.RefObject<HTMLElement | null>; className: string } {
  const ref = useRef<HTMLElement>(null);
  const phone = () => window.innerWidth <= 720;
  const [level, setLevel] = useState(() => (phone() ? 2 : 0));
  useEffect(() => {
    const reset = () => setLevel(phone() ? 2 : 0);
    window.addEventListener('resize', reset);
    return () => window.removeEventListener('resize', reset);
  }, []);
  // It tries roomier again when what's in it changes (a raid's or a trader's buttons come and go, the rain stops),
  // and once a day.
  const content = [
    !!state.raid || state.animalsAttacking,
    !!state.trade,
    state.captives.length > 0,
    !!(state.diplomacy.request || state.diplomacy.call || state.diplomacy.dispute || state.diplomacy.envoy),
    state.weather.icon,
  ].join();
  useEffect(() => setLevel(phone() ? 2 : 0), [state.settings.uiScale, state.day, content]);
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar || phone() || level >= FIT_LEVELS.length - 1) {
      return;
    }
    const items = [...bar.children] as HTMLElement[];
    const first = items[0];
    const last = items[items.length - 1];
    if (first && last && last.offsetTop > first.offsetTop + first.offsetHeight / 2) {
      setLevel(level + 1);
    }
  });
  return { ref, className: FIT_LEVELS[level] };
}

// (The clock, which changes most often, is a panel of its own.)
const pickTopBar = (s: UiState) => ({
  ...fields(
    'animalsAttacking',
    'captives',
    'day',
    'diplomacy',
    'foodDays',
    'outdoorTemp',
    'power',
    'raid',
    'resources',
    'speed',
    'trade',
    'weather',
    'settings',
  )(s),
  // Someone who could still be drafted.
  anyFree: s.colonists.some(
    (c) => !c.dead && c.status !== 'Downed' && c.status !== 'Away' && !c.drafted && !c.inBreak && c.age >= DRAFT_AGE,
  ),
});

const pickClock = fields('night', 'season', 'day', 'time', 'year');

function Clock() {
  const state = useUi(pickClock);
  return (
    <span className="clock" title={`Year ${state.year}`}>
      {state.night ? '☾' : '☀'} {state.season} · Day {state.day} · {state.time}
    </span>
  );
}

export function TopBar({ onOpen }: { onOpen: (screen: Screen) => void }) {
  const state = useUi(pickTopBar);
  const p = state.power;
  const net = p.supply - p.demand;
  const anyFree = state.anyFree;
  const fit = useTopBarFit(state);
  // Something from the neighbours waiting on an answer.
  const d = state.diplomacy;
  const waiting = !!(d.request || d.call || d.dispute || d.envoy);
  return (
    <header ref={fit.ref} className={`panel topbar ${fit.className}`}>
      <div className="tb-time">
        <span className="title">Colony Alpha</span>
        <Clock />
        <span className="temp" title="Outdoor temperature">
          {state.outdoorTemp}°C
        </span>
        <div className="speeds" role="group" aria-label="Game speed">
          {SPEEDS.map((s, index) => (
            <button
              key={s.label}
              className={state.speed === index ? 'active' : ''}
              onClick={() => controller.setSpeed(index)}
              title={s.title}
              aria-label={s.title}
              aria-pressed={state.speed === index}
            >
              {s.label}
            </button>
          ))}
        </div>
        {/* (After the speeds, so they don't move as the weather comes and goes.) */}
        {state.weather.icon && (
          <span
            className="weather"
            role="img"
            title={`Weather: ${state.weather.label}`}
            aria-label={`Weather: ${state.weather.label}`}
          >
            {state.weather.icon} <span className="weather-label">{state.weather.label}</span>
          </span>
        )}
      </div>
      <div className="tb-resources">
        <FoodDays days={state.foodDays} />
        {state.resources
          .filter((r) => r.total > 0 && KEY_RESOURCES.includes(r.name))
          .map((r) => (
            <span key={r.name} className="res res-item" title={`${r.name}: ${r.stored} stored, ${r.total} in total`}>
              <i className="icon" style={itemIconStyle(r.item)} aria-hidden />
              <span className="sr-only">{r.name}: </span>
              <b>{r.total}</b>
            </span>
          ))}
        <AllResources state={state} />
        {p.hasGrid && (
          <span
            className={`res power ${p.powered ? '' : 'bad'}`}
            title={`Power: ${formatPower(p.supply)} made, ${formatPower(p.demand)} used, ${p.stored}/${p.capacity} Wh stored`}
          >
            ⚡{' '}
            <b>
              {net >= 0 ? '+' : ''}
              {formatPower(net)}
            </b>
            {p.capacity > 0 && (
              <span className="wide-only">{` · ${(p.stored / 1000).toFixed(1)}/${(p.capacity / 1000).toFixed(0)} kWh`}</span>
            )}
            {!p.powered && ' · OFF'}
          </span>
        )}
      </div>
      <nav className="screens">
        {(state.raid || state.animalsAttacking) && (
          <button
            className="danger draft-all"
            onClick={() => controller.toggleDraftAll()}
            title="Draft or stand down everyone (Q, with no colonist selected)"
          >
            {anyFree ? 'Draft all' : 'Stand down all'}
          </button>
        )}
        <button onClick={() => onOpen('work')}>Work</button>
        <button onClick={() => onOpen('schedule')}>Schedule</button>
        <button onClick={() => onOpen('production')}>Production</button>
        <button onClick={() => onOpen('research')}>Research</button>
        <button onClick={() => onOpen('story')}>Story</button>
        <button onClick={() => onOpen('village')} title="The colony's leader and policies">
          Village
        </button>
        <button
          className={waiting ? 'attention' : ''}
          onClick={() => onOpen('factions')}
          title="Neighbours, their requests, gifts and tribute"
        >
          Factions{waiting ? ' (!)' : ''}
        </button>
        {state.captives.length > 0 && (
          <button onClick={() => onOpen('prisoners')} title="Captured and wounded raiders">
            Prisoners ({state.captives.length})
          </button>
        )}
        {state.trade && (
          <button
            className={state.trade.open ? 'primary' : ''}
            disabled={!state.trade.open}
            title={state.trade.open ? `Trade with ${state.trade.faction}` : 'Traders are on their way'}
            onClick={() => onOpen('trade')}
          >
            Trade
          </button>
        )}
        <button onClick={() => onOpen('help')} title="How to play" aria-label="How to play">
          ?
        </button>
        <button onClick={() => onOpen('menu')}>Menu</button>
      </nav>
    </header>
  );
}

// The materials worth watching at a glance; everything else is one click away.
const KEY_RESOURCES = ['Wood', 'Granite chunks', 'Granite blocks', 'Cloth', 'Leather', 'Herbal medicine', 'Silver'];

function FoodDays({ days }: { days: number }) {
  const shown = days >= 99 ? '99+' : days < 10 ? days.toFixed(1) : Math.round(days).toString();
  const tone = days < 1 ? 'bad' : days < 3 ? 'low' : '';
  return (
    <span className={`res food ${tone}`} title="How long the colony's food would last at the current headcount">
      <span aria-hidden>🍲</span> <span className="sr-only">Food: </span>
      <b>{shown}</b> days<span className="wide-only"> of food</span>
    </span>
  );
}

// Every item the colony has, in a dropdown from the top bar.
function AllResources({ state }: { state: Pick<UiState, 'resources'> }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  // Esc or a click anywhere else folds the list away.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  const items = state.resources.filter((r) => r.total > 0);
  if (items.length === 0) {
    return null;
  }
  return (
    <span className="res-more" ref={root}>
      <button className={open ? 'active' : ''} onClick={() => setOpen(!open)} aria-expanded={open}>
        All items ▾
      </button>
      {open && (
        <div className="panel res-list" role="list">
          {items.map((r) => (
            <div key={r.name} className="res-row" role="listitem">
              <i className="icon" style={itemIconStyle(r.item)} />
              <span>{r.name}</span>
              <b>{r.total}</b>
              <span className="muted">{r.stored < r.total ? `${r.stored} stored` : 'all stored'}</span>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

// What a colonist's chip shows.
type ChipView = Pick<
  ColonistView,
  'id' | 'name' | 'color' | 'activity' | 'mood' | 'dead' | 'status' | 'bleeding' | 'inBreak' | 'drafted' | 'sleeping'
>;

function statusIcons(c: ChipView): { icon: string; title: string }[] {
  if (c.dead) {
    return [{ icon: '☠', title: 'Dead' }];
  }
  if (c.status === 'Away') {
    return [{ icon: '🧭', title: c.activity }];
  }
  const icons: { icon: string; title: string }[] = [];
  if (c.status === 'Downed') {
    icons.push({ icon: '✚', title: 'Downed: needs a doctor' });
  }
  if (c.bleeding) {
    icons.push({ icon: '🩸', title: 'Bleeding' });
  }
  if (c.status === 'Sick') {
    icons.push({ icon: '🤒', title: 'Sick' });
  }
  if (c.inBreak) {
    icons.push({ icon: '❗', title: 'Mental break' });
  }
  if (c.drafted) {
    icons.push({ icon: '⚔', title: 'Drafted' });
  }
  if (c.sleeping) {
    icons.push({ icon: '💤', title: 'Sleeping' });
  }
  return icons;
}

const pickColonistBar = (s: UiState) => ({
  selectedColonist: s.selectedColonist,
  colonists: s.colonists.map(
    (c): ChipView => ({
      id: c.id,
      name: c.name,
      color: c.color,
      activity: c.activity,
      mood: c.mood,
      dead: c.dead,
      status: c.status,
      bleeding: c.bleeding,
      inBreak: c.inBreak,
      drafted: c.drafted,
      sleeping: c.sleeping,
    }),
  ),
});

// One colonist's chip, redrawn only when what it shows changes (one colonist's mood, not the whole bar).
const Chip = memo(function Chip({ c, selected }: { c: ChipView; selected: boolean }) {
  return (
    <button
      className={`chip ${selected ? 'selected' : ''} ${c.dead ? 'dead' : ''}`}
      aria-pressed={selected}
      onClick={() => controller.selectColonist(selected ? null : c.id, !selected)}
      title={`${c.name}: ${c.activity}`}
      // (The mood bar and the status icons only show; a screen reader gets them in words.)
      aria-label={[
        c.name,
        c.dead ? 'dead' : `mood ${c.mood}`,
        ...statusIcons(c).map((s) => s.title),
        c.dead ? '' : c.activity,
      ]
        .filter(Boolean)
        .join(', ')}
    >
      <span className="swatch" style={{ background: c.color }} />
      <span className="chip-name">{c.name}</span>
      {!c.dead && (
        <span className="chip-mood" title={`Mood ${c.mood}`}>
          <span style={{ width: `${c.mood}%`, background: moodColor(c.mood) }} />
        </span>
      )}
      {statusIcons(c).map((s) => (
        <span key={s.icon} className="chip-icon" title={s.title}>
          {s.icon}
        </span>
      ))}
    </button>
  );
});

export function ColonistBar({ onOpen }: { onOpen: (screen: Screen) => void }) {
  const state = useUi(pickColonistBar);
  return (
    <div className="colonist-bar" role="toolbar" aria-label="Colonists">
      {/* (Not the dead: they kept full chips among the living, and a big colony's bar ran to two rows. The
          Colonists screen remembers them.) */}
      {state.colonists
        .filter((c) => !c.dead)
        .map((c) => (
          <Chip key={c.id} c={c} selected={state.selectedColonist === c.id} />
        ))}
      <button
        className="chip"
        onClick={() => onOpen('colonists')}
        title="Everyone at a glance: mood, needs, health and skills"
        aria-label="All colonists"
      >
        ☰{/* (On a phone, where the row scrolls and only a few names show: how many there are.) */}
        <span className="chip-count">{state.colonists.filter((c) => !c.dead).length}</span>
      </button>
    </div>
  );
}

type InspectorTab = 'overview' | 'health' | 'social' | 'skills';

const pickInspector = (s: UiState) => ({
  colonist: s.colonists.find((c) => c.id === s.selectedColonist),
  selectedTile: s.selectedTile,
});

export function Inspector() {
  const state = useUi(pickInspector);
  const colonist = state.colonist;
  if (colonist) {
    return <ColonistCard c={colonist} />;
  }
  if (state.selectedTile) {
    return <TileCard t={state.selectedTile} onClose={() => controller.selectTile(null)} />;
  }
  return null;
}

function ColonistCard({ c }: { c: ColonistView }) {
  const [tab, setTab] = useState<InspectorTab>('overview');
  const tabs: { key: InspectorTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'health', label: 'Health' },
    { key: 'social', label: 'Social' },
    { key: 'skills', label: 'Skills' },
  ];
  return (
    <section className={`panel inspector ${c.drafted ? 'drafted' : ''}`} aria-label={`${c.name} details`}>
      <div className="card-head">
        <span className="swatch" style={{ background: c.color }} />
        <b className="card-title">{c.name}</b>
        {!c.dead && (
          <span className="mood" style={{ color: moodColor(c.mood) }} title="Mood (0–100)">
            <span className="muted small">mood</span> {c.mood}
          </span>
        )}
        {c.leader && <span className="tag good">leader</span>}
        {c.status !== 'Healthy' && (
          <span
            className={`tag ${c.status === 'Injured' || c.status === 'Sick' ? 'warn' : c.status === 'Away' ? '' : 'danger'}`}
          >
            {c.status.toLowerCase()}
          </span>
        )}
        <span className="spacer" />
        {!c.dead && c.status !== 'Downed' && c.status !== 'Away' && (
          <button
            className={c.drafted ? 'active danger' : ''}
            disabled={c.age < DRAFT_AGE || (c.inBreak && !c.drafted)}
            onClick={() => controller.toggleDraft(c.id)}
            title={
              c.age < DRAFT_AGE
                ? `${c.name} is too young to fight`
                : c.inBreak && !c.drafted
                  ? `${c.name} is in no state to fight until the break passes`
                  : c.drafted
                    ? `Stand down (Q). ${TOUCH ? 'Tap' : 'Right-click'} the map to move them.`
                    : `Draft for combat (Q). ${TOUCH ? 'Tap' : 'Right-click'} the map to move them.`
            }
          >
            {c.drafted ? 'Drafted' : 'Draft'}
          </button>
        )}
        <button
          onClick={() => controller.selectColonist(c.id, true)}
          title="Centre the view on them"
          aria-label="Centre the view on them"
        >
          ◎
        </button>
        <button onClick={() => controller.selectColonist(null)} title="Close" aria-label="Close">
          ✕
        </button>
      </div>
      <div className="activity">{c.activity}</div>
      {/* (No stances for someone lying downed.) */}
      {c.drafted && c.status !== 'Downed' && (
        <div className="stance" role="group" aria-label="Combat stance">
          {STANCES.map((s) => (
            <button
              key={s.key}
              className={c.stance === s.key ? 'active' : ''}
              aria-pressed={c.stance === s.key}
              title={s.hint}
              onClick={() => controller.setStance(c.id, s.key)}
            >
              {s.label}
            </button>
          ))}
          {c.focus && (
            <button
              className="focus"
              title="Stop concentrating on this raider"
              onClick={() => controller.clearFocus(c.id)}
            >
              Target: {c.focus} ✕
            </button>
          )}
        </div>
      )}
      <div className="tabs" role="tablist" onKeyDown={(e) => arrowKeys(e)}>
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? 'active' : ''}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="card-body">
        {tab === 'overview' && <OverviewTab c={c} />}
        {tab === 'health' && <HealthTab c={c} />}
        {tab === 'social' && <SocialTab c={c} />}
        {tab === 'skills' && <SkillsTab c={c} />}
      </div>
    </section>
  );
}

const STANCES: { key: Stance; label: string; hint: string }[] = [
  { key: 'cover', label: 'Take cover', hint: 'Move to nearby cover with a clear shot, then fight from there' },
  { key: 'hold', label: 'Hold', hint: 'Stay exactly where ordered and shoot whatever comes in range' },
  { key: 'charge', label: 'Charge', hint: 'Close in on the enemy (melee weapons are preferred when equipping)' },
];

function OverviewTab({ c }: { c: ColonistView }) {
  const needs = [
    { label: 'Food', value: c.needs.food, color: '#e0a050' },
    { label: 'Rest', value: c.needs.rest, color: '#7fa8e0' },
    { label: 'Recreation', value: c.needs.joy, color: '#c38fe0' },
  ];
  return (
    <>
      {c.carrying && <div className="muted">Carrying {c.carrying}</div>}
      <dl className="gear">
        <dt>Weapon</dt>
        <dd>{c.weapon}</dd>
        <dt>Armor</dt>
        <dd>{c.armor}</dd>
        <dt>Clothes</dt>
        <dd>{c.apparel}</dd>
        <dt>Tools</dt>
        <dd>{c.tool}</dd>
        <dt>Comfy at</dt>
        <dd>{c.comfort}</dd>
      </dl>
      <h4>Needs</h4>
      {needs.map((n) => (
        <div key={n.label} className="stat">
          <span>{n.label}</span>
          <Bar value={n.value} color={n.color} label={n.label} />
          <span className="num">{Math.round(n.value * 100)}%</span>
        </div>
      ))}
      <div className="muted" title="Kinds of recreation they've had in the last few days">
        Recent recreation: {c.recentRecreation || 'none'}
      </div>
      <h4>Mood {c.mood}</h4>
      {c.thoughts.length === 0 && <div className="muted">No strong feelings.</div>}
      {c.thoughts.map((t) => (
        <div key={t.label} className="row-line">
          <span>{t.label}</span>
          <span className={t.mood >= 0 ? 'good' : 'bad'}>{t.mood > 0 ? `+${t.mood}` : t.mood}</span>
        </div>
      ))}
    </>
  );
}

function HealthTab({ c }: { c: ColonistView }) {
  const healthy =
    c.injuries.length === 0 &&
    !c.disease &&
    c.bloodLoss < 0.05 &&
    c.conditions.length === 0 &&
    c.needs.food > 0 &&
    c.scars.length === 0;
  return (
    <>
      {healthy && <div className="muted">Healthy.</div>}
      {c.needs.food <= 0 && !c.dead && <div className="bad">Starving: works and walks slower until they eat.</div>}
      {c.injuries.map((injury, index) => (
        <div key={index} className="row-line">
          <span>
            {injury.label}{' '}
            {injury.infected ? (
              <span className="bad">(infected)</span>
            ) : injury.tended ? (
              <span className="muted">(tended)</span>
            ) : (
              <span className="bad">(untended)</span>
            )}
          </span>
          <span className="muted">{Math.round(injury.severity * 100)}%</span>
        </div>
      ))}
      {c.scars.map((s, index) => (
        <div key={`scar${index}`} className="muted">
          {s}
        </div>
      ))}
      {c.conditions.map((condition) => (
        <div key={condition.label} className="stat">
          <span>{condition.label}</span>
          <Bar value={condition.value} color="#7fc8ff" label={condition.label} />
          <span className="num">{Math.round(condition.value * 100)}%</span>
        </div>
      ))}
      {c.bloodLoss >= 0.05 && (
        <div className="stat">
          <span>Blood loss</span>
          <Bar value={c.bloodLoss} color="#ff5c5c" label="Blood loss" />
          <span className="num">{Math.round(c.bloodLoss * 100)}%</span>
        </div>
      )}
      {c.disease && (
        <>
          <h4>{c.disease.label}</h4>
          <div className="stat">
            <span>Severity</span>
            <Bar value={c.disease.severity} color="#ff8a5c" label="Severity" />
            <span className="num">{Math.round(c.disease.severity * 100)}%</span>
          </div>
          <div className="stat">
            <span>Immunity</span>
            <Bar value={c.disease.immunity} color="#8fe36b" label="Immunity" />
            <span className="num">{Math.round(c.disease.immunity * 100)}%</span>
          </div>
        </>
      )}
    </>
  );
}

function SocialTab({ c }: { c: ColonistView }) {
  return (
    <>
      <h4>
        {c.age} years old{c.stage !== 'adult' && <span className="muted"> · {c.stage}</span>}
      </h4>
      {c.canRetire && (
        <button
          onClick={() => controller.setRetired(c.id, !c.retired)}
          title={
            c.retired
              ? 'Call them back to a full share of the work'
              : 'Let them stop heavy work: they garden, cook, craft, make art and teach the children, and are glad of it'
          }
        >
          {c.retired ? 'Back to work' : 'Retire'}
        </button>
      )}
      <div>
        <b>{c.backstory.title}</b> <span className="muted">{c.backstory.description}</span>
      </div>
      {c.family.map((f) => (
        <div key={f} className="muted">
          {f}
        </div>
      ))}
      <h4>Traits</h4>
      {c.traits.map((t) => (
        <div key={t.label}>
          <b>{t.label}</b> <span className="muted">{t.description}</span>
        </div>
      ))}
      <h4>Relationships</h4>
      {c.relations.length === 0 && <div className="muted">Nobody else here.</div>}
      {c.relations.map((r) => (
        <div key={r.name} className="row-line">
          <span>
            {r.name} {r.label && <span className="muted">({r.label.toLowerCase()})</span>}
          </span>
          <span className={r.opinion >= 0 ? 'good' : 'bad'}>{r.opinion > 0 ? `+${r.opinion}` : r.opinion}</span>
        </div>
      ))}
    </>
  );
}

function SkillsTab({ c }: { c: ColonistView }) {
  return (
    <>
      {c.skillList.map((s) => (
        <div
          key={s.key}
          className="stat"
          title={s.passion === 2 ? 'Burning passion: learns fast' : s.passion === 1 ? 'Interested: learns faster' : ''}
        >
          <span>
            {s.label}
            {s.passion > 0 && <span className="passion">{s.passion === 2 ? ' ★★' : ' ★'}</span>}
          </span>
          <Bar value={s.progress} color="#8fc3ff" label={`${s.label} progress`} />
          <span className="num">{s.level}</span>
        </div>
      ))}
    </>
  );
}

function TileCard({ t, onClose }: { t: TileView; onClose?: () => void }) {
  return (
    <section className="panel inspector tile-card" aria-label="Tile details">
      <div className="card-head">
        <b className="card-title">{t.feature ?? t.terrain}</b>
        <span className="spacer" />
        {onClose && (
          <button onClick={onClose} title="Close" aria-label="Close">
            ✕
          </button>
        )}
      </div>
      <div className="muted">
        ({t.x}, {t.y}) · {t.temperature}°C{t.feature && ` · on ${t.terrain.toLowerCase()}`}
      </div>
      {t.room && <div className="muted">{t.room}</div>}
      {t.animal && <div>{t.animal}</div>}
      {t.items && <div>{t.items}</div>}
      {t.details.map((d) => (
        <div key={d}>{forTouch(d)}</div>
      ))}
      {t.orders.map((o) => (
        <div key={o} className="muted">
          {o}
        </div>
      ))}
      {onClose && t.stockpile && <StockpileSettings s={t.stockpile} />}
      {onClose && t.beaconSilent && (
        <div className="row">
          <button onClick={() => controller.command({ type: 'signal' })} title="Raiders will hear it too">
            Signal again
          </button>
        </div>
      )}
      {onClose && t.door && (
        <div className="row">
          <button
            className={t.door.locked ? 'active' : ''}
            aria-pressed={t.door.locked}
            title={
              t.door.locked
                ? 'Let everyone through again'
                : 'Keep everyone out (or in): colonists, animals and raiders, until raiders break it down'
            }
            onClick={() => controller.command({ type: 'lock', tile: t.door!.tile, locked: !t.door!.locked })}
          >
            {t.door.locked ? '🔒 Locked: unlock' : 'Lock the door'}
          </button>
        </div>
      )}
    </section>
  );
}

// What a stockpile takes and how keenly haulers fill it; changes apply to the whole stockpile.
function StockpileSettings({ s }: { s: NonNullable<TileView['stockpile']> }) {
  const set = (refused: number, priority: StockpilePriority) =>
    controller.command({ type: 'stockpile', tile: s.tile, refused, priority });
  return (
    <div className="stockpile-settings">
      <div className="muted small">Takes</div>
      <div className="row">
        {STORAGE_GROUPS.map((group, k) => {
          const on = (s.refused & (1 << k)) === 0;
          return (
            <button
              key={group}
              className={on ? 'active' : ''}
              aria-pressed={on}
              title={on ? `Stop storing ${group} here` : `Store ${group} here`}
              onClick={() => set(s.refused ^ (1 << k), s.priority)}
            >
              {group}
            </button>
          );
        })}
      </div>
      <div className="muted small">Priority</div>
      <div className="row">
        {(['low', 'normal', 'high', 'critical'] as const).map((p) => (
          <button
            key={p}
            className={s.priority === p ? 'active' : ''}
            aria-pressed={s.priority === p}
            title="Haulers fill higher priority stockpiles first, and move things up to them"
            onClick={() => set(s.refused, p)}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

// Follows the mouse over the map: whatever is under the cursor.
export function HoverCard() {
  const hover = useHover();
  if (!hover) {
    return null;
  }
  const { tile, colonist } = hover;
  return (
    <div className="panel hover-card">
      {colonist && (
        <div className="hover-colonist">
          <span className="swatch" style={{ background: colonist.color }} /> <b>{colonist.name}</b>{' '}
          <span style={{ color: moodColor(colonist.mood) }}>mood {colonist.mood}</span>
          <div>{colonist.activity}</div>
        </div>
      )}
      <div>
        <b>{tile.feature ?? tile.terrain}</b> <span className="muted">{tile.temperature}°C</span>
      </div>
      {tile.animal && <div>{tile.animal}</div>}
      {tile.items && <div>{tile.items}</div>}
      {tile.details.slice(0, 2).map((d) => (
        <div key={d} className="muted">
          {d}
        </div>
      ))}
    </div>
  );
}

type SideTab = 'goals' | 'log';
// Alerts shown before the rest fold behind "more".
const ALERTS_SHOWN = 3;

const pickSidePanel = (s: UiState) => ({
  ...fields('alerts', 'log', 'objectives', 'toolId')(s),
  afternoon: parseInt(s.time, 10) >= 12,
});

export function SidePanel({ onOpen }: { onOpen: (screen: Screen) => void }) {
  const state = useUi(pickSidePanel);
  const [tab, setTab] = useState<SideTab>('goals');
  // Starts folded away on small screens, where it would cover the map.
  const [open, setOpen] = useState(() => window.innerWidth > 720);
  const [allAlerts, setAllAlerts] = useState(false);
  // There, a tool picked (from a goal's button, say) folds the panel away so the map can be dragged on.
  const toolId = state.toolId;
  useEffect(() => {
    if (toolId !== 'select' && window.innerWidth <= 720) {
      setOpen(false);
    }
  }, [toolId]);
  // Starting a goal there folds the panel away too, even when its tool is already in hand.
  const foldOnPhone = () => {
    if (window.innerWidth <= 720) {
      setOpen(false);
    }
  };
  // Phases the player has unfolded; the current one is always open.
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  // A goal with no tool or screen, opened to show how it's done.
  const [explained, setExplained] = useState<string | null>(null);
  const danger = state.alerts.filter((a) => a.tone === 'danger').length;
  const phases = PHASE_NAMES.map((name, index) => ({
    name,
    objectives: state.objectives.filter((o) => o.phase === index + 1),
  }))
    // A phase stays on the list while it has goals still to reach (a failed one doesn't count).
    .filter((p) => p.objectives.some((o) => !o.done && !o.failed));
  // The goal to work on next: the first one still open in the current phase that the player can act on now
  // (not one whose order is already given, or that only needs waiting for), else the first one open.
  const openGoals = phases[0]?.objectives.filter((o) => !o.done && !o.failed) ?? [];
  // From midday, a shelter still to plan comes first, whatever order the player took the goals in (one who
  // skipped the stockpile was still being asked for it as night came with the walls unbuilt).
  const shelterFirst = openGoals.find((o) => o.id === 'shelter' && !o.underway && state.afternoon);
  const next = shelterFirst ?? openGoals.find((o) => (o.tool || o.screen) && !o.underway) ?? openGoals[0];
  if (!open) {
    return (
      <button
        className="panel side-toggle"
        onClick={() => setOpen(true)}
        title="Show alerts and goals"
        aria-label={`Show alerts and goals (${state.alerts.length} alerts)`}
      >
        ◀ {state.alerts.length > 0 && <span className={`badge ${danger ? 'danger' : ''}`}>{state.alerts.length}</span>}
      </button>
    );
  }
  // Dangers first, then warnings, then good news.
  const rank = { danger: 0, warn: 1, calm: 2 };
  const alerts = [...state.alerts].sort((a, b) => rank[a.tone] - rank[b.tone]);
  const shown = allAlerts ? alerts : alerts.slice(0, ALERTS_SHOWN);
  return (
    <aside className="panel side">
      {alerts.length > 0 && (
        <ul className="alerts" aria-label="Alerts">
          {shown.map((alert, index) => (
            <AlertLine key={`${index}-${alert.text}`} alert={alert} onJump={foldOnPhone} />
          ))}
          {alerts.length > ALERTS_SHOWN && (
            <li className="more">
              <button className="link" onClick={() => setAllAlerts(!allAlerts)}>
                {allAlerts ? 'Show fewer' : `${alerts.length - ALERTS_SHOWN} more alerts`}
              </button>
            </li>
          )}
        </ul>
      )}
      <div className="tabs" role="tablist" onKeyDown={(e) => arrowKeys(e)}>
        <button
          role="tab"
          aria-selected={tab === 'goals'}
          className={tab === 'goals' ? 'active' : ''}
          onClick={() => setTab('goals')}
        >
          Goals
        </button>
        <button
          role="tab"
          aria-selected={tab === 'log'}
          className={tab === 'log' ? 'active' : ''}
          onClick={() => setTab('log')}
        >
          Log
        </button>
        <span className="spacer" />
        <button onClick={() => setOpen(false)} title="Hide panel" aria-label="Hide panel">
          ▶
        </button>
      </div>
      <div className="side-body">
        {tab === 'goals' &&
          (phases.length === 0 ? (
            <div className="muted">Every objective is complete. The colony is yours.</div>
          ) : (
            <>
              {next && <NextGoal goal={next} onOpen={onOpen} onStarted={foldOnPhone} />}
              {phases.map((p, index) => {
                const shownPhase = index === 0 || unfolded.has(p.name);
                const toggle = () =>
                  setUnfolded((old) => {
                    const copy = new Set(old);
                    if (!copy.delete(p.name)) {
                      copy.add(p.name);
                    }
                    return copy;
                  });
                return (
                  <div key={p.name}>
                    <h4>
                      {index === 0 ? (
                        p.name
                      ) : (
                        <button
                          className="link"
                          aria-expanded={shownPhase}
                          onClick={(e) => {
                            toggle();
                            // Bring the unfolded goals into view in the scrolling panel.
                            const phase = e.currentTarget.closest('div');
                            requestAnimationFrame(() => phase?.scrollIntoView({ block: 'nearest' }));
                          }}
                        >
                          {shownPhase ? '▾' : '▸'} {p.name}
                        </button>
                      )}{' '}
                      <span className="muted">
                        {p.objectives.filter((o) => o.done).length}/{p.objectives.length}
                      </span>
                    </h4>
                    {shownPhase && (
                      <ul className="objectives">
                        {p.objectives
                          .filter((o) => !o.done)
                          .map((o) => (
                            <li key={o.id} className={`${o.failed ? 'failed' : ''} ${o === next ? 'next' : ''}`}>
                              <button
                                className="goal"
                                title={o.how || undefined}
                                aria-expanded={!o.tool && !o.screen ? explained === o.id : undefined}
                                onClick={() =>
                                  o.tool || o.screen
                                    ? startGoal(o, onOpen, foldOnPhone)
                                    : setExplained(explained === o.id ? null : o.id)
                                }
                              >
                                <span className="check">{o.failed ? '✖' : '○'}</span>
                                <span className="goal-text">
                                  {forTouch(o.label)}
                                  {o.progress && <span className="muted"> {o.progress}</span>}
                                  {o.underway && <span className="muted small"> · under way</span>}
                                </span>
                              </button>
                              {explained === o.id && o.how && o !== next && (
                                <div className="goal-how">{forTouch(o.how)}</div>
                              )}
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </>
          ))}
        {tab === 'log' && (
          <ul className="log">
            {state.log.map((entry, index) => (
              <li key={`${entry.tick}-${index}`} className={entry.tone}>
                {entry.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

// How urgent an alert or notice is, not by colour alone: a mark on the urgent ones, and words for a screen reader.
function ToneMark({ tone }: { tone: string }) {
  if (tone === 'danger') {
    return (
      <>
        <span className="tone-mark" aria-hidden>
          ⚠{' '}
        </span>
        <span className="sr-only">Urgent: </span>
      </>
    );
  }
  return tone === 'warn' ? <span className="sr-only">Warning: </span> : null;
}

// An alert; the ones about someone or somewhere take the camera there when clicked.
function AlertLine({ alert, onJump }: { alert: Alert; onJump?: () => void }) {
  const target = alert.colonist !== undefined || alert.tile !== undefined;
  return (
    <li className={alert.tone}>
      {target ? (
        <button
          className="alert-jump"
          onClick={() => {
            controller.focusAlert(alert);
            // (On a phone the panel folds away, or it covers what the alert just jumped to.)
            onJump?.();
          }}
          title="Show me"
        >
          <ToneMark tone={alert.tone} />
          {forTouch(alert.text)} <span className="go">›</span>
        </button>
      ) : (
        <>
          <ToneMark tone={alert.tone} />
          {forTouch(alert.text)}
        </>
      )}
    </li>
  );
}

// Picks the goal's tool, or opens the screen it's done from.
function startGoal(goal: ObjectiveView, onOpen: (screen: Screen) => void, onStarted?: () => void): void {
  if (goal.tool) {
    controller.selectToolById(goal.tool);
  } else if (goal.screen) {
    onOpen(goal.screen);
  }
  onStarted?.();
}

// The goal to work on next, with how to do it and a button that gets it started.
function NextGoal({
  goal,
  onOpen,
  onStarted,
}: {
  goal: ObjectiveView;
  onOpen: (screen: Screen) => void;
  onStarted?: () => void;
}) {
  const tool = goal.tool ? TOOLS.find((t) => t.id === goal.tool) : undefined;
  return (
    <div className="next-goal">
      <div className="next-label">Next goal</div>
      <b>{forTouch(goal.label)}</b>
      {goal.progress && <span className="muted"> {goal.progress}</span>}
      {goal.how && <p>{forTouch(goal.how)}</p>}
      {(tool || goal.screen) && (
        <button className="primary" onClick={() => startGoal(goal, onOpen, onStarted)}>
          {tool ? `Use ${tool.label}` : `Open ${goal.screen![0].toUpperCase()}${goal.screen!.slice(1)}`}
          {!TOUCH && tool?.hotkey && <kbd>{tool.hotkey.toUpperCase()}</kbd>}
        </button>
      )}
    </div>
  );
}

// Build and order tools, grouped into tabs.
// A phone or tablet: the map is moved with a finger rather than a mouse.

const pickArchitect = fields('lockedTools', 'overlay', 'toolId');

export function Architect() {
  const state = useUi(pickArchitect);
  const current = TOOLS.find((t) => t.id === state.toolId);
  const [group, setGroup] = useState<ToolGroup>('orders');
  // The tool under the mouse: its description shows in the hint line until the mouse leaves.
  const [hovered, setHovered] = useState<string | null>(null);
  const shown = TOOLS.find((t) => t.id === hovered) ?? current;
  const lockedShown = shown ? state.lockedTools[shown.id] : undefined;
  // Follow hotkeys: picking a tool shows its tab.
  useEffect(() => {
    if (current && current.id !== 'select') {
      setGroup(current.group);
    }
  }, [current]);
  // A tab switch moves the buttons out from under the mouse, which never sends a mouseleave.
  useEffect(() => setHovered(null), [group]);
  // Back to Select (Esc, right-click): the button last pressed keeps no focus ring, so it doesn't look
  // like it's still picked.
  const tools0 = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.toolId === 'select' && tools0.current?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
  }, [state.toolId]);
  // Switching tabs puts down a tool from another tab, so the hint line never describes a tool that
  // isn't on show.
  const switchTab = (key: ToolGroup) => {
    if (current && current.id !== 'select' && current.group !== key) {
      controller.selectToolById('select');
    }
    setGroup(key);
  };
  const tools = TOOLS.filter((t) => t.group === group);
  return (
    <section className="panel architect" aria-label="Build bar">
      <div className="arch-tabs">
        {/* (Only the groups are tabs: the two buttons after them aren't.) */}
        <div role="tablist" aria-label="Build menu" style={{ display: 'contents' }} onKeyDown={(e) => arrowKeys(e)}>
          {TOOL_GROUPS.map((g) => (
            <button
              key={g.key}
              role="tab"
              aria-selected={group === g.key}
              className={group === g.key ? 'active' : ''}
              onClick={() => switchTab(g.key)}
            >
              {g.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button onClick={() => controller.focusHome()} title="Back to the colony (H)">
          ⌂ Colony
        </button>
        <button
          className={state.overlay === 'temperature' ? 'active' : ''}
          aria-pressed={state.overlay === 'temperature'}
          onClick={() => controller.setOverlay(state.overlay === 'temperature' ? 'none' : 'temperature')}
          title="Show temperatures on the map"
        >
          🌡 Temperature
        </button>
      </div>
      <div className="arch-tools" ref={tools0}>
        {/* On a touch screen a tool in hand (picked here, or by a goal) can be put down from any tab: Select lives
            in Orders, out of sight, and a tap on a colonist went on placing blueprints under them. */}
        {TOUCH && state.toolId !== 'select' && group !== 'orders' && (
          <button className="put-down" onClick={() => controller.setTool({ kind: 'select' })}>
            ✕ Done
          </button>
        )}
        {tools.map((t) => {
          const locked = state.lockedTools[t.id];
          return (
            <button
              key={t.id}
              className={`${state.toolId === t.id ? 'active' : ''} ${locked ? 'locked' : ''}`}
              aria-pressed={state.toolId === t.id}
              aria-keyshortcuts={t.hotkey && t.hotkey !== 'Escape' ? t.hotkey.toUpperCase() : undefined}
              onClick={() => controller.setTool(t.tool)}
              onMouseEnter={() => setHovered(t.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(t.id)}
              onBlur={() => setHovered(null)}
            >
              {locked && '🔒 '}
              {t.label}
              {!TOUCH && t.hotkey && <kbd aria-hidden>{t.hotkey === 'Escape' ? 'Esc' : t.hotkey.toUpperCase()}</kbd>}
            </button>
          );
        })}
      </div>
      <div className="hint">
        {shown && (
          <>
            <b>{shown.label}:</b> {forTouch(shown.hint)}
            {lockedShown && <span className="locked-note"> · needs research: {lockedShown}</span>}
          </>
        )}
        {(!shown || shown.id === 'select') && (
          <span className="muted">
            {TOUCH
              ? ' · Drag to move the map, pinch to zoom, tap to inspect.'
              : ' · Right-drag or WASD pans, the wheel zooms, right-click drops the tool.'}
          </span>
        )}
      </div>
    </section>
  );
}

const pickNotices = fields('notStarted', 'notifications', 'toast');

export function Notices({ paused = false }: { paused?: boolean }) {
  const state = useUi(pickNotices);
  return (
    <div className="notices" aria-live="polite">
      {paused && (
        <button className="pause-banner" onClick={() => controller.togglePause()} title="Resume (Space)">
          {state.notStarted
            ? TOUCH
              ? '❚❚ Paused · give your first orders, then tap here to start the clock'
              : '❚❚ Paused · give your first orders, then click here or press Space to start the clock'
            : TOUCH
              ? '❚❚ Paused · tap to resume'
              : '❚❚ Paused · click or Space to resume'}
        </button>
      )}
      {state.toast && <div className="toast">{forTouch(state.toast)}</div>}
      {state.notifications.map((n) => (
        <button
          key={n.id}
          className={`notification ${n.tone}`}
          onClick={() => controller.dismissNotification(n.id)}
          title="Dismiss"
        >
          <ToneMark tone={n.tone} />
          {forTouch(n.text)}
        </button>
      ))}
    </div>
  );
}
