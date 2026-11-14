import { useId, useRef, useState } from 'react';
import { diagramForDefense, diagramForPlay, type DiagramRoute } from '../lib/football/diagrams';
import { isFootballReady } from '../lib/football/engine';
import { defensiveMenuChoices, offensiveMenuChoices, PLAYBOOK, DEFENSES } from '../lib/football/playbook';
import type { Defense, FootballGame, PlayId } from '../lib/football/types';
import { coachingAdvice } from '../lib/football/coaching-advice';
import './football-preplay.css';

const ORD = ['', '1ST', '2ND', '3RD', '4TH'];
const qText = (g: FootballGame) => g.overtime ? 'OT' : `Q${g.quarter}`;
const clockText = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const yardLine = (spot: number) => spot === 50 ? 'MID 50' : spot < 50 ? `OWN ${Math.round(spot)}` : `OPP ${Math.round(100 - spot)}`;
const downText = (g: FootballGame) => {
  const togo = Math.max(1, Math.round(g.target - g.spot));
  return `${ORD[g.down] ?? `${g.down}TH`} & ${g.target >= 100 ? 'GOAL' : togo}`;
};
const LOS = 190;

/** Vertical chalk diagram: offense always advances UP; left/right follows the quarterback's perspective.
 * Conventions: solid = committed path, dashed = feint/delay, T = block, ellipse = zone, thin link = man, orange arrow = rush. */
function Diagram({ routes, label }: { routes: DiagramRoute[]; label: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const pts = routes.flatMap(r => [...r.points, ...(r.block ? [r.block] : [])]);
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x0 = Math.min(16, ...xs) - 14, x1 = Math.max(176, ...xs) + 14;
  const y0 = Math.min(LOS - 40, ...ys) - 16, y1 = Math.max(LOS + 20, ...ys) + 18;
  const mp = `fbp-${uid}-p`, ms = `fbp-${uid}-s`, mr = `fbp-${uid}-r`;
  const byId = new Map(routes.map(r => [r.id, r]));
  const line = (p: { x: number; y: number }[]) => p.map(q => `${q.x},${q.y}`).join(' ');
  return <svg className="fbp-dia" viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
    <defs>
      <marker id={mp} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#f4d23c" /></marker>
      <marker id={ms} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#9ccfff" /></marker>
      <marker id={mr} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#ee7848" /></marker>
    </defs>
    <line x1={x0} x2={x1} y1={LOS} y2={LOS} className="fbp-los" />
    {routes.map(r => r.zone && <ellipse key={`z${r.id}`} cx={r.zone.x} cy={r.zone.y} rx={r.zone.rx} ry={r.zone.ry} className={r.zone.deep ? 'fbp-zone fbp-zone-deep' : 'fbp-zone'} />)}
    {routes.map(r => {
      const t = r.assignment !== undefined ? byId.get(r.assignment) : undefined;
      const s = r.points[0], e = t?.points[0];
      return s && e ? <line key={`m${r.id}`} x1={s.x} y1={s.y} x2={e.x} y2={e.y} className="fbp-man" /> : null;
    })}
    {routes.map(r => {
      const s = r.points[0], e = r.points[r.points.length - 1];
      if (!s || !e) return null;
      const moving = r.points.length > 1;
      const defender = s.y < LOS - 2;
      const marker = `url(#${r.rush || defender ? mr : r.primary ? mp : ms})`;
      const split = r.delay && r.delay < r.points.length ? r.delay : 0;
      const kink = split ? r.points[split]! : undefined;
      return <g key={r.id} className={`fbp-r${r.primary ? ' fbp-primary' : ''}${defender ? ' fbp-def-r' : ''}${r.fake ? ' fbp-fake' : ''}`}>
        {r.block && <path className="fbp-block" d={`M${s.x} ${s.y}L${r.block.x} ${r.block.y}M${r.block.x - 5} ${r.block.y}L${r.block.x + 5} ${r.block.y}`}
          transform={`rotate(0)`} />}
        {moving && r.kick === 'punt' && <path className="fbp-kick" d={`M${s.x} ${s.y}Q${s.x + 34} ${(s.y + e.y) / 2} ${e.x} ${e.y}`} markerEnd={`url(#${mp})`} />}
        {moving && r.kick === 'fg' && <>
          <polyline points={line(r.points)} className="fbp-kick" markerEnd={`url(#${mp})`} />
          <path className="fbp-post" d={`M${e.x - 12} ${e.y - 6}L${e.x - 12} ${e.y + 4}L${e.x + 12} ${e.y + 4}L${e.x + 12} ${e.y - 6}M${e.x} ${e.y + 4}L${e.x} ${e.y + 12}`} />
        </>}
        {moving && !r.kick && r.pitch && <polyline points={line(r.points)} className="fbp-pitch" markerEnd={marker} />}
        {moving && !r.kick && !r.pitch && r.fake && <polyline points={line(r.points)} className="fbp-dash" />}
        {moving && !r.kick && !r.pitch && !r.fake && split > 0 && <>
          <polyline points={line(r.points.slice(0, split + 1))} className="fbp-dash" />
          <polyline points={line(r.points.slice(split))} markerEnd={marker} />
          <rect x={kink!.x - 3} y={kink!.y - 3} width="6" height="6" className="fbp-kink" />
        </>}
        {moving && !r.kick && !r.pitch && !r.fake && !split && <polyline points={line(r.points)} markerEnd={marker} className={defender ? 'fbp-rush' : undefined} />}
        {defender ? <path transform={`translate(${s.x} ${s.y})`} d="M-5 -5L5 5M5 -5L-5 5" className="fbp-x" />
          : !r.pitch && <circle cx={s.x} cy={s.y} r="5.5" className="fbp-o" />}
        {r.controlled && <circle cx={s.x} cy={s.y} r="9" className="fbp-controlled" />}
        {r.label && <text x={s.x} y={defender ? s.y - 9 : s.y + 17} className="fbp-lbl">{r.label}</text>}
        {r.read && moving && <g transform={`translate(${e.x + (e.x > 96 ? 11 : -11)} ${e.y + 2})`}><circle r={r.read === 1 ? 9 : 7.5} className="fbp-read" /><text y="3.5" className="fbp-num">{r.read}</text></g>}
      </g>;
    })}
  </svg>;
}

function Context({ game, title }: { game: FootballGame; title: string }) {
  return <header className="fbp-top">
    <div className="fbp-ctx">
      <strong>{title}</strong>
      <span>{qText(game)} {clockText(game.clock)}</span>
      <span>{downText(game)}</span>
      <span>{yardLine(game.spot)}</span>
      <span className="fbp-score">{game.score.home}-{game.score.away}</span>
    </div>
  </header>;
}

const SHORT: Partial<Record<Defense, string>> = { run: 'STACK THE BOX', pass: 'GUARD THE ZONES', man: 'MATCH UP ONE-ON-ONE', blitz: 'RUSH + MAN BEHIND', 'run-blitz': 'CRASH THE LINE', prevent: 'PLAY DEEP', 'goal-line': 'PACK THE LINE', contain: 'SET THE EDGE' };

const SHORT_NAME: Record<Defense, string> = { run: 'RUN', pass: 'ZONE', man: 'MAN', blitz: 'M-BLITZ', 'run-blitz': 'R-BLITZ', prevent: 'PREVENT', 'goal-line': 'GOAL', contain: 'CONTAIN' };

/** Play-call cards overlaid on the live field. Gone the instant a call is made; ACTION still snaps. */
export function FootballPreplay({ game, onOffense, onDefense }: { game: FootballGame; onOffense: (id: PlayId) => void; onDefense: (id: Defense) => void }) {
  const pending = game.pendingSnap;
  const offense = game.possession === 'home';
  const recommended=coachingAdvice(game);
  if (pending) {
    const name = offense ? PLAYBOOK[pending.play]?.name : DEFENSES.find(d => d.id === pending.defense)?.name;
    return <div className="fbp-called" data-testid="football-preplay" data-pending="true" role="status">CALL IN · {name ?? 'SET'}</div>;
  }
  return <section className="fbp-overlay" aria-label={offense ? 'Choose an offensive play' : 'Choose a defense'} data-testid="football-preplay" data-pending="false" data-side={offense ? 'offense' : 'defense'}>
    <p className="fbp-head"><b>{offense ? 'YOUR BALL' : 'DEFENSE'}</b><span>{downText(game)} · {yardLine(game.spot)}</span></p>
    {offense
      ? <OffenseCards game={game} onOffense={onOffense} />
      : <DefenseCards game={game} onDefense={onDefense} />}
  </section>;
}

/** Ordered menu frozen per decision so clock ticks never reorder cards under a pointer; page resets on a new decision. */
function useFrozenMenu<T>(game: FootballGame, build: () => T[]) {
  const key = `${game.event}|${game.possession}|${game.down}|${game.spot}|${game.phase}`;
  const ref = useRef<{ key: string; items: T[] } | null>(null);
  const [page, setPage] = useState({ key, at: 0 });
  if (!ref.current || ref.current.key !== key) ref.current = { key, items: build() };
  const at = page.key === key ? page.at : 0;
  return { items: ref.current.items, at, setAt: (n: number) => setPage({ key, at: n }) };
}
/** Cyclic window: page 0 = coach picks; later pages always fill all slots, wrapping to the start. */
function windowOf<T>(all: T[], size: number, at: number) {
  return Array.from({ length: Math.min(size, all.length) }, (_, k) => all[(at * size + k) % all.length]!);
}

function OffenseCards({ game, onOffense }: { game: FootballGame; onOffense: (id: PlayId) => void }) {
  const SIZE = 6;
  const { items: all, at: raw, setAt } = useFrozenMenu(game, () => offensiveMenuChoices(game));
  const recommended = all[0]?.id;
  const pages = Math.max(1, Math.ceil(all.length / SIZE)), at = Math.min(raw, pages - 1);
  const shown = windowOf(all, SIZE, at);
  return <div className="fbp-defwrap fbp-offwrap">
    <div className="fbp-grid fbp-off">{shown.map(p =>
      <button type="button" key={p.id} className={`fbp-card fbp-${p.kind}`} data-selected="false" data-recommended={p.id===recommended}
        onClick={() => onOffense(p.id)} data-testid={`button-play-${p.id}`} aria-label={`${p.name}. ${p.id===recommended ? 'Coach recommends. ' : ''}${p.description}`}>
        <span className="fbp-name"><b>{p.name}</b><small>{p.id===recommended ? 'COACH · ' : ''}{p.kind.toUpperCase()}</small></span>
        <Diagram routes={diagramForPlay(game, p.id)} label={`${p.name} diagram, quarterback's perspective, offense advancing up`} />
      </button>)}</div>
    {pages > 1 && <button type="button" className="fbp-more" data-testid="button-offense-more"
      onClick={() => setAt((at + 1) % pages)} aria-label={at + 1 < pages ? `Other plays, page ${at + 2} of ${pages}` : 'Back to coach picks'}>
      <b>{at + 1 < pages ? 'OTHER PLAYS' : 'COACH PICKS'}</b><span>{at + 1}/{pages}</span>
    </button>}
  </div>;
}

function DefenseCards({ game, onDefense }: { game: FootballGame; onDefense: (id: Defense) => void }) {
  const SIZE = 4;
  const { items: all, at: raw, setAt } = useFrozenMenu(game, () => defensiveMenuChoices(game));
  const recommended = all[0]?.id;
  const pages = Math.max(1, Math.ceil(all.length / SIZE)), at = Math.min(raw, pages - 1);
  const shown = windowOf(all, SIZE, at);
  const next = (at + 1) % pages;
  return <div className="fbp-defwrap">
      <div className="fbp-grid fbp-def">{shown.map(d =>
          <button type="button" key={d.id} className="fbp-card fbp-dcard" data-selected="false" data-recommended={d.id===recommended}
            onClick={() => onDefense(d.id)} data-testid={`button-defense-${d.id}`} aria-label={`${d.name}. ${d.id===recommended ? 'Coach recommends. ' : ''}${d.description}`}>
            <span className="fbp-name"><b>{d.name}</b><small>{d.id===recommended ? 'COACH · ' : ''}{SHORT[d.id] ?? 'DEFENSE'}</small></span>
            <Diagram routes={diagramForDefense(game, d.id)} label={`${d.name} diagram, opposing quarterback's perspective, offense advancing up`} />
          </button>)}</div>
      {pages > 1 && <button type="button" className="fbp-more" data-testid="button-defense-more"
        onClick={() => setAt(next)} aria-label={next ? `Other defenses, page ${next + 1} of ${pages}` : 'Back to coach picks'}>
        <b>{next ? 'OTHER PLAYS' : 'COACH PICKS'}</b><small>{windowOf(all, SIZE, next).filter(d => !shown.includes(d)).map(d => SHORT_NAME[d.id]).join(' / ')}</small><span>{at + 1}/{pages}</span>
      </button>}
    </div>;
}

export function FootballPlayClock({ game }: { game: FootballGame }) {
  const g = game;
  if ((!isFootballReady(g) && g.phase !== 'penalty') || typeof g.playClock !== 'number') return null;
  const v = Math.max(0, Math.ceil(g.playClock));
  const level = v <= 2 ? 'strong' : v <= 5 ? 'warn' : 'calm';
  return <div className="fbp-clock" data-level={level} data-running={!!g.playClockRunning} role="timer" aria-live={v <= 5 ? 'assertive' : 'off'}
    aria-label={`Play clock ${v} seconds`} data-testid="football-play-clock">
    <small>PLAY</small><strong key={level === 'calm' ? 'c' : v}>{String(v).padStart(2, '0')}</strong>
  </div>;
}

export function FootballPenalty({ game, compact = false }: { game: FootballGame; compact?: boolean }) {
  const p = game.delayPenalty;
  if (game.phase !== 'penalty' || !p) return null;
  const half = p.yards < 5;
  return <section className={`fbp-root fbp-pen${compact ? ' fbp-pen-inline' : ''}`} aria-label="Delay of game penalty" data-testid="football-penalty">
    {!compact && <Context game={game} title="FLAG" />}
    <div className="fbp-pen-body">
      <svg className="fbp-ref" viewBox="0 0 120 160" aria-hidden="true">
        <rect x="0" y="146" width="120" height="14" fill="#277a37" />
        <rect x="44" y="104" width="12" height="44" fill="#1b1b2a" /><rect x="64" y="104" width="12" height="44" fill="#1b1b2a" />
        <rect x="40" y="48" width="40" height="60" rx="4" fill="#f1e6d0" />
        {[0, 1, 2, 3].map(i => <rect key={i} x={46 + i * 9} y="48" width="4" height="60" fill="#0b1d36" />)}
        <rect x="48" y="14" width="24" height="28" rx="6" fill="#e0a77a" /><rect x="46" y="10" width="28" height="9" rx="3" fill="#f1e6d0" />
        <rect x="54" y="26" width="4" height="4" fill="#0b1d36" /><rect x="64" y="26" width="4" height="4" fill="#0b1d36" />
        <g className="fbp-arm fbp-arm-l"><rect x="22" y="52" width="10" height="34" rx="4" fill="#f1e6d0" /><rect x="22" y="84" width="40" height="9" rx="4" fill="#e0a77a" /></g>
        <g className="fbp-arm fbp-arm-r"><rect x="88" y="52" width="10" height="34" rx="4" fill="#f1e6d0" /><rect x="58" y="78" width="40" height="9" rx="4" fill="#e0a77a" /></g>
        <rect x="80" y="96" width="10" height="12" fill="#f4d23c" className="fbp-flag" />
      </svg>
      <div className="fbp-pen-text">
        <small>{game.message || 'DELAY OF GAME'}</small>
        <strong>DELAY OF GAME</strong>
        <b>{half ? `HALF THE DISTANCE · ${Math.round(p.yards * 10) / 10} YD` : `${Math.round(p.yards)}-YARD PENALTY`}</b>
        <span>{p.offense === 'home' ? 'Offense' : 'Their offense'} moves back. Repeat {ORD[game.down] ?? `${game.down}TH`} down.</span>
      </div>
    </div>
  </section>;
}
