import { startField, routePoint } from './field';
import { runApproach, skillExecution } from './execution';
import { franchiseAthleteFactor } from './franchise-upgrades';
import { progression } from './passing';
import { eligibleReceivers, manAssignment } from './coverage';
import { PLAYBOOK } from './playbook';
import { attackDirection, type FieldDirection } from './direction';
import type { Athlete, Defense, FootballGame, LivePlay, PlayId } from './types';

export type DiagramPoint = { x: number; y: number };
export type DiagramZone = { x: number; y: number; rx: number; ry: number; deep?: boolean };
export type DiagramRoute = {
  id: number; label: string; primary: boolean; read?: number; points: DiagramPoint[];
  /** Points before this index are drawn dashed (feint / delayed movement); a marker sits at the change. */
  delay?: number;
  /** Small restrained block "T" at this point (offensive blocking assignment). */
  block?: DiagramPoint;
  /** Whole path is a non-arrowed fake / initial look (play action, draw passing look). */
  fake?: boolean;
  /** Defensive area responsibility. */
  zone?: DiagramZone;
  /** Defensive man assignment: id of the offensive athlete being matched. */
  assignment?: number;
  /** Rushing path into the backfield (blitz / crash). */
  rush?: boolean;
  kick?: 'punt' | 'fg';
  /** A real optional lateral, distinct from a run feint. */
  pitch?: boolean;
};
/** Solver-local coordinates, viewed from behind the quarterback. Advancement
 * always goes UP. The solver reflects world X but leaves stadium Y unchanged
 * when changing ends, so lateral coordinates must follow the attack direction.
 * This is a diagram projection only; never change the physical match frame. */
export const diagramPoint = (x: number, y: number, direction: FieldDirection = 1): DiagramPoint =>
  ({ x: 96 + (y - 96) * direction, y: 190 - (x - 500) * .72 });
const label = (role: string) => role === 'QB' ? 'Q' : role === 'RB' ? 'R' : role === 'TE' ? 'T' : role === 'OL' ? '' : 'W';

/** Walk the actual runApproach targets at the engine's handoff speed. Returns field points + handoff index. */
function simulateApproach(game: FootballGame, l: LivePlay, back: Athlete, develop: number) {
  const dt = .05;
  let x = back.x, y = back.y;
  const pts = [{ x, y }];
  let feintEnd = 0, prev: { x: number; y: number } | undefined;
  for (let t = dt; t <= develop + 1e-6; t += dt) {
    const speed = 52 * skillExecution({ ...l, time: t }, back) * franchiseAthleteFactor(game, back);
    const target = runApproach({ ...l, time: t });
    if (prev && (Math.abs(prev.x - target.x) > 1 || Math.abs(prev.y - target.y) > 1) && !feintEnd) feintEnd = pts.length;
    prev = target;
    const dx = target.x - x, dy = target.y - y, d = Math.hypot(dx, dy), f = d > 0 ? Math.min(1, speed * dt / d) : 0;
    x += dx * f; y += dy * f;
    if (Math.round(t / dt) % 3 === 0) pts.push({ x, y });
  }
  pts.push({ x, y });
  return { pts, feintEnd, handoff: pts.length - 1 };
}

/** Project actual formation, runApproach and routePoint definitions, not decorative paths. Never mutates the match RNG. */
export function diagramForPlay(game: FootballGame, id: PlayId): DiagramRoute[] {
  // Use midfield so an opponent goal-line clamp doesn't hide a play's general intention.
  const l = startField({ ...game, spot: 40 }, id, 'pass'), play = PLAYBOOK[id];
  const direction = attackDirection(game);
  const los = 100 + 40 * 10, point = (x: number, y: number) => diagramPoint(x, y, direction);
  const offense = l.athletes.filter(a => a.side === 'offense');
  const base = (a: Athlete): DiagramRoute => ({ id: a.id, label: label(a.role), primary: false, points: [point(a.x, a.y)] });

  if (play.kind === 'kick') {
    const kicker = l.athletes[5]!;
    return offense.map(a => {
      const r = base(a);
      if (a.role === 'OL') r.block = point(a.x + 10, a.y);
      if (a.id !== kicker.id) return r;
      const punt = id === 'punt';
      return { ...r, label: 'K', primary: true, kick: punt ? 'punt' : 'fg',
        points: punt ? [point(a.x, a.y), point(los + 120, 88), point(los + 330, 80)]
          : [point(a.x, a.y), point(los + 150, 96)] };
    });
  }

  if (play.kind !== 'pass') {
    const qb = l.athletes[5]!, back = l.athletes[6]!;
    // Blocking aims at the gap the runner actually attacks after any feint (Counter: the cutback lane).
    const gapY = runApproach({ ...l, time: play.develop }).y;
    const routes = offense.map(a => {
      const r = base(a);
      if (a.role === 'OL') r.block = point(a.x + 16, a.startY + (gapY - 96) * .25 + Math.sign(a.startY - 96) * 3);
      else if (a.role === 'WR' || a.role === 'TE') r.block = point(a.x + 18, a.y + (a.y < 96 ? 6 : -6));
      return r;
    });
    if (id === 'sneak') {
      const r = routes.find(r => r.id === qb.id)!;
      r.primary = true; r.points = [point(qb.x, qb.y), point(los + 2, 96), point(los + 16, 96)];
      return routes;
    }
    if(id==='speed-option') {
      const q=routes.find(r=>r.id===5)!,b=routes.find(r=>r.id===6)!;
      q.primary=true;
      q.points=[point(qb.x,qb.y),point(los-5,114),point(los+25,140),point(los+75,146)];
      b.points=[point(back.x,back.y),point(los-25,139),point(los+5,160),point(los+65,160)];
      routes.push({id:99,label:'',primary:false,pitch:true,points:[point(los-5,114),point(los-25,139)]});
      return routes;
    }
    const sim = simulateApproach(game, l, back, play.develop);
    const end = sim.pts[sim.pts.length - 1]!, prior = sim.pts[Math.max(0, sim.pts.length - 3)]!;
    const cont = id === 'sweep' ? [{ x: end.x + 22, y: Math.min(160, end.y + 6) }, { x: end.x + 78, y: Math.min(160, end.y + 6) }]
      : id === 'counter' ? [{ x: end.x + 26, y: end.y + Math.sign(end.y - prior.y || -1) * 14 }, { x: end.x + 70, y: end.y + Math.sign(end.y - prior.y || -1) * 18 }]
      : [{ x: Math.max(end.x, los) + 10, y: end.y }, { x: Math.max(end.x, los) + 62, y: end.y }];
    const r = routes.find(r => r.id === back.id)!;
    r.primary = true;
    r.points = [...sim.pts, ...cont].map(p => point(p.x, p.y));
    // Counter: dashed until the feint target switches. Draw/fake punt: dashed until the delayed handoff.
    if (id === 'counter' && sim.feintEnd) r.delay = sim.feintEnd;
    else if (id === 'draw' || id === 'fake-punt') r.delay = sim.handoff;
    const q = routes.find(r => r.id === qb.id)!;
    if (id === 'draw') { q.points = [point(qb.x, qb.y), point(los - 40, 100)]; q.fake = true; }
    return routes;
  }

  // Every read in the actual progression (verticals has four, including the released tackle).
  const first = Math.max(.35, play.develop - .25), expires = progression({ ...l, time: 0 }).expires;
  const reads: number[] = [];
  for (let t = first + .01; t < expires; t += .65) {
    const r = progression({ ...l, time: t }).receiver;
    if (!reads.includes(r)) reads.push(r);
  }
  const eligibleIds = new Set(eligibleReceivers(l).map(a => a.id));
  const horizon = Math.max(1.8, play.develop + .65, Math.min(expires, 2.8));
  return offense.map(a => {
    const r = base(a);
    const eligible = eligibleIds.has(a.id);
    if (eligible && a.role === 'OL') r.label = 'E';
    if (eligible) for (let t = .15; t <= horizon + 1e-6; t += .15) {
      const p = routePoint({ ...l, time: t }, a); r.points.push(point(p.x, p.y));
    }
    if (a.role === 'OL' && !eligible) r.block = id === 'screen' && a.id !== 1
      ? point(a.x + 18, a.y + Math.sign(routePoint({ ...l, time: 1 }, l.athletes[6]!).y - 96 || -1) * 26)
      : point(a.x - 8, a.y);
    // Play action: the run fake shows as the RB's dashed opening steps (routePoint already delays .6s).
    if (id === 'play-action' && a.role === 'RB') r.delay = 5;
    if (id === 'verticals' && a.id === 2) r.delay = 5;
    if (reads.includes(a.id)) r.read = reads.indexOf(a.id) + 1;
    r.primary = a.id === reads[0];
    return r;
  });
}

/** Shared engine man matching against a fixed neutral pass set (never the hidden call). */
function manPairs(game: FootballGame, defense: Defense) {
  const n = startField({ ...game, spot: 40 }, 'post', defense), out = new Map<number, number>();
  for (const d of n.athletes) if (d.side === 'defense') { const r = manAssignment(n, d); if (r) out.set(d.id, r.id); }
  return out;
}

/** General strategy only: derives positioning from the actual defense formation against a neutral
 * set, never the CPU's unannounced offensive choice or the match's live state/RNG. */
export function diagramForDefense(game: FootballGame, defense: Defense): DiagramRoute[] {
  const l = startField({ ...game, spot: 40 }, 'power', defense);
  const direction = attackDirection(game);
  const frontY = 190 - Math.max(24, (l.athletes.find(a => a.role === 'DL')!.x - 500) * .72 * 1.65);
  const point = (a: Athlete, x = a.x, y = a.y) => {
    const p = diagramPoint(x, y, direction);
    if (a.role === 'OL' || a.role === 'DL') p.x = 96 + (p.x - 96) * 1.8;
    if (x === a.x && y === a.y) {
      if (a.role === 'OL') p.y = 202;
      if (a.role === 'DL') p.y = frontY;
      if (a.role === 'LB') p.y = Math.min(p.y, frontY - 28);
      if (a.role === 'QB') p.y = 230;
      if (a.role === 'WR' || a.role === 'TE') p.y = 200;
      if (a.role === 'RB') p.y = 244;
    }
    return p;
  };
  const man = defense === 'man' || defense === 'blitz' ? manPairs(game, defense) : new Map<number, number>();
  return l.athletes.map(a => {
    const points = [point(a)];
    const r: DiagramRoute = { id: a.id, label: '', primary: false, points };
    if (a.side === 'offense') { r.label = a.role === 'OL' ? '' : label(a.role); return r; }
    r.label = a.role === 'DL' ? 'D' : a.role === 'LB' ? 'L' : defense === 'man' || defense === 'blitz' ? 'M' : defense === 'pass' || defense === 'prevent' ? 'Z' : 'S';
    if(defense==='contain') {
      if(a.role==='LB') {r.label='SPY';r.assignment=5;r.zone={x:points[0]!.x,y:points[0]!.y+7,rx:14,ry:12};}
      if(a.role==='DL') {
        const edge=a.startY<80 ? -1 : a.startY>120 ? 1 : 0;
        points.push(point(a,edge ? 507 : 480,edge ? 96+edge*60 : 96));
        r.label=edge ? 'E' : 'D';
      }
      if(a.role==='DB') r.zone={x:points[0]!.x,y:points[0]!.y,rx:25,ry:16};
      return r;
    }
    const front = a.role === 'DL' || a.role === 'LB';
    if (front && ['run', 'blitz', 'run-blitz', 'goal-line'].includes(defense)) {
      const depth = defense === 'blitz' || defense === 'run-blitz' ? 465 : defense === 'goal-line' ? 496 : 490;
      const y = a.role === 'LB' ? 96 : defense === 'run-blitz' ? 96 + (a.y - 96) * .5 : a.y;
      points.push(point(a, depth, y));
      r.rush = defense === 'blitz' || defense === 'run-blitz';
    } else if (a.role === 'LB' && (defense === 'pass' || defense === 'prevent')) {
      r.zone = { x: points[0]!.x, y: points[0]!.y - 4, rx: 30, ry: 12 };
    } else if (a.role === 'LB' && defense === 'man') {
      r.assignment = man.get(a.id);
    }
    if (a.role === 'DB') {
      const p = points[0]!;
      if (defense === 'pass') r.zone = { x: p.x, y: p.y, rx: 26, ry: 16 };
      else if (defense === 'prevent') r.zone = { x: p.x, y: p.y, rx: 32, ry: 22, deep: true };
      else if (defense === 'man' || defense === 'blitz') r.assignment = man.get(a.id);
      else if (defense === 'run' || defense === 'run-blitz') points.push(point(a, Math.max(a.x - 30, 510), a.y + (96 - a.y) * .35));
    }
    return r;
  });
}
