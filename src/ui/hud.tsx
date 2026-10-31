import { useEffect, useState } from 'react';
import { ColonistView, TOOLS, TOOL_GROUPS, TileView, ToolGroup, UiState, controller } from '../game/controller';
import { Bar, moodColor } from './common';

// The always-on game HUD: top bar, colonist bar, inspector, side panel, and architect menu.

export type Screen = 'menu' | 'work' | 'schedule' | 'production' | 'research' | 'story' | 'help' | null;

const SPEEDS = [
  { label: '❚❚', title: 'Pause (Space)' },
  { label: '▶', title: 'Normal speed (1)' },
  { label: '▶▶', title: 'Fast (2)' },
  { label: '▶▶▶', title: 'Fastest (3)' },
];

const formatPower = (watts: number) => (Math.abs(watts) >= 1000 ? `${(watts / 1000).toFixed(1)} kW` : `${watts} W`);

export function TopBar({ state, onOpen }: { state: UiState; onOpen: (screen: Screen) => void }) {
  const p = state.power;
  const net = p.supply - p.demand;
  const anyFree = state.colonists.some((c) => !c.dead && c.status !== 'Downed' && !c.drafted);
  return (
    <header className="panel topbar">
      <div className="tb-time">
        <span className="title">Colony Alpha</span>
        <span className="clock" title={`Year ${state.year}`}>
          {state.night ? '☾' : '☀'} {state.season} · Day {state.day} · {state.time}
        </span>
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
            >
              {s.label}
            </button>
          ))}
        </div>
        {state.speed === 0 && <span className="paused">Paused</span>}
      </div>
      <div className="tb-resources">
        {state.resources
          .filter((r) => r.total > 0)
          .map((r) => (
            <span key={r.name} className="res" title={`${r.name}: ${r.stored} stored, ${r.total} in total`}>
              <b>{r.total}</b> {r.name.toLowerCase()}
            </span>
          ))}
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
            {p.capacity > 0 && ` · ${(p.stored / 1000).toFixed(1)}/${(p.capacity / 1000).toFixed(0)} kWh`}
            {!p.powered && ' · OFF'}
          </span>
        )}
      </div>
      <nav className="screens">
        {state.raid && (
          <button className="danger" onClick={() => controller.toggleDraftAll()} title="Draft or release everyone (Q)">
            {anyFree ? 'Draft all' : 'Release all'}
          </button>
        )}
        <button onClick={() => onOpen('work')}>Work</button>
        <button onClick={() => onOpen('schedule')}>Schedule</button>
        <button onClick={() => onOpen('production')}>Production</button>
        <button onClick={() => onOpen('research')}>Research</button>
        <button onClick={() => onOpen('story')}>Story</button>
        <button onClick={() => onOpen('help')} title="How to play">
          ?
        </button>
        <button onClick={() => onOpen('menu')}>Menu</button>
      </nav>
    </header>
  );
}

function statusIcons(c: ColonistView): { icon: string; title: string }[] {
  if (c.dead) {
    return [{ icon: '☠', title: 'Dead' }];
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

export function ColonistBar({ state }: { state: UiState }) {
  return (
    <div className="colonist-bar" role="toolbar" aria-label="Colonists">
      {state.colonists.map((c) => {
        const selected = state.selectedColonist === c.id;
        return (
          <button
            key={c.id}
            className={`chip ${selected ? 'selected' : ''} ${c.dead ? 'dead' : ''}`}
            onClick={() => controller.selectColonist(selected ? null : c.id, !selected)}
            title={`${c.name}: ${c.activity}`}
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
      })}
    </div>
  );
}

type InspectorTab = 'overview' | 'health' | 'social' | 'skills';

export function Inspector({ state }: { state: UiState }) {
  const colonist = state.colonists.find((c) => c.id === state.selectedColonist);
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
    <section className="panel inspector" aria-label={`${c.name} details`}>
      <div className="card-head">
        <span className="swatch" style={{ background: c.color }} />
        <b className="card-title">{c.name}</b>
        {!c.dead && (
          <span className="mood" style={{ color: moodColor(c.mood) }} title="Mood">
            {c.mood}
          </span>
        )}
        {c.status !== 'Healthy' && (
          <span className={`tag ${c.status === 'Injured' || c.status === 'Sick' ? 'warn' : 'danger'}`}>
            {c.status.toLowerCase()}
          </span>
        )}
        <span className="spacer" />
        {!c.dead && c.status !== 'Downed' && (
          <button
            className={c.drafted ? 'active danger' : ''}
            onClick={() => controller.toggleDraft(c.id)}
            title="Draft for combat (Q). Right-click the map to move."
          >
            {c.drafted ? 'Drafted' : 'Draft'}
          </button>
        )}
        <button onClick={() => controller.selectColonist(c.id, true)} title="Centre the view on them">
          ◎
        </button>
        <button onClick={() => controller.selectColonist(null)} title="Close" aria-label="Close">
          ✕
        </button>
      </div>
      <div className="activity">{c.activity}</div>
      <div className="tabs" role="tablist">
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

function OverviewTab({ c }: { c: ColonistView }) {
  const needs = [
    { label: 'Food', value: c.needs.food, color: '#e0a050' },
    { label: 'Rest', value: c.needs.rest, color: '#7fa8e0' },
    { label: 'Recreation', value: c.needs.joy, color: '#c38fe0' },
  ];
  return (
    <>
      {c.carrying && <div className="muted">Carrying {c.carrying}</div>}
      <div className="muted">Weapon: {c.weapon}</div>
      <div className="muted">
        Wearing: {c.apparel} · comfortable {c.comfort}
      </div>
      <h4>Needs</h4>
      {needs.map((n) => (
        <div key={n.label} className="stat">
          <span>{n.label}</span>
          <Bar value={n.value} color={n.color} label={n.label} />
          <span className="num">{Math.round(n.value * 100)}%</span>
        </div>
      ))}
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
  const healthy = c.injuries.length === 0 && !c.disease && c.bloodLoss < 0.05 && c.conditions.length === 0;
  return (
    <>
      {healthy && <div className="muted">Healthy.</div>}
      {c.injuries.map((injury, index) => (
        <div key={index} className="row-line">
          <span>
            {injury.label}{' '}
            {injury.tended ? <span className="muted">(tended)</span> : <span className="bad">(untended)</span>}
          </span>
          <span className="muted">{Math.round(injury.severity * 100)}%</span>
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
        <div key={d}>{d}</div>
      ))}
      {t.orders.map((o) => (
        <div key={o} className="muted">
          {o}
        </div>
      ))}
    </section>
  );
}

// Follows the mouse over the map: whatever is under the cursor.
export function HoverCard({ state }: { state: UiState }) {
  const tile = state.hover;
  if (!tile) {
    return null;
  }
  const colonist = state.colonists.find((c) => c.id === state.hoverColonist);
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

type SideTab = 'alerts' | 'goals' | 'log';

export function SidePanel({ state }: { state: UiState }) {
  const [tab, setTab] = useState<SideTab>('goals');
  const [open, setOpen] = useState(true);
  const danger = state.alerts.filter((a) => a.tone === 'danger').length;
  const phaseNames = ['Shelter', 'Living', 'Story', 'Seasons'];
  const phases = phaseNames
    .map((name, index) => ({
      name,
      objectives: state.objectives.filter((o) => o.phase === index + 1),
    }))
    .filter((p) => p.objectives.some((o) => !o.done));
  if (!open) {
    return (
      <button className="panel side-toggle" onClick={() => setOpen(true)} title="Show alerts and goals">
        ◀ {state.alerts.length > 0 && <span className={`badge ${danger ? 'danger' : ''}`}>{state.alerts.length}</span>}
      </button>
    );
  }
  return (
    <aside className="panel side">
      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'alerts'}
          className={tab === 'alerts' ? 'active' : ''}
          onClick={() => setTab('alerts')}
        >
          Alerts{' '}
          {state.alerts.length > 0 && <span className={`badge ${danger ? 'danger' : ''}`}>{state.alerts.length}</span>}
        </button>
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
        {tab === 'alerts' && (
          <ul className="alerts">
            {state.alerts.length === 0 && <li className="calm">All quiet.</li>}
            {[...state.alerts]
              .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'danger' ? -1 : 1))
              .map((alert) => (
                <li key={alert.text} className={alert.tone}>
                  {alert.text}
                </li>
              ))}
          </ul>
        )}
        {tab === 'goals' &&
          (phases.length === 0 ? (
            <div className="muted">Every objective is complete. The colony is yours.</div>
          ) : (
            phases.map((p) => (
              <div key={p.name}>
                <h4>
                  {p.name}{' '}
                  <span className="muted">
                    {p.objectives.filter((o) => o.done).length}/{p.objectives.length}
                  </span>
                </h4>
                <ul className="objectives">
                  {p.objectives
                    .filter((o) => !o.done)
                    .map((o) => (
                      <li key={o.id} className={o.failed ? 'failed' : ''}>
                        <span className="check">{o.failed ? '✖' : '○'}</span>
                        {o.label}
                        {o.progress && <span className="muted"> {o.progress}</span>}
                      </li>
                    ))}
                </ul>
              </div>
            ))
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

// Build and order tools, grouped into tabs.
export function Architect({ state }: { state: UiState }) {
  const current = TOOLS.find((t) => t.id === state.toolId);
  const [group, setGroup] = useState<ToolGroup>('orders');
  // Follow hotkeys: picking a tool shows its tab.
  useEffect(() => {
    if (current && current.id !== 'select') {
      setGroup(current.group);
    }
  }, [current]);
  const tools = TOOLS.filter((t) => t.group === group);
  return (
    <section className="panel architect" aria-label="Architect">
      <div className="arch-tabs" role="tablist">
        {TOOL_GROUPS.map((g) => (
          <button
            key={g.key}
            role="tab"
            aria-selected={group === g.key}
            className={group === g.key ? 'active' : ''}
            onClick={() => setGroup(g.key)}
          >
            {g.label}
          </button>
        ))}
        <span className="spacer" />
        <button
          className={state.overlay === 'temperature' ? 'active' : ''}
          onClick={() => controller.setOverlay(state.overlay === 'temperature' ? 'none' : 'temperature')}
          title="Show temperatures on the map"
        >
          🌡 Temperature
        </button>
      </div>
      <div className="arch-tools">
        {tools.map((t) => {
          const locked = state.lockedTools[t.id];
          return (
            <button
              key={t.id}
              className={`${state.toolId === t.id ? 'active' : ''} ${locked ? 'locked' : ''}`}
              onClick={() => controller.setTool(t.tool)}
              title={locked ? `Requires research: ${locked}` : t.hint}
            >
              {locked && '🔒 '}
              {t.label}
              {t.hotkey && <kbd>{t.hotkey === 'Escape' ? 'Esc' : t.hotkey.toUpperCase()}</kbd>}
            </button>
          );
        })}
      </div>
      <div className="hint">{current?.hint}. Right-drag or WASD pans, the wheel zooms, right-click drops the tool.</div>
    </section>
  );
}

export function Notices({ state }: { state: UiState }) {
  return (
    <div className="notices" aria-live="polite">
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
  );
}
