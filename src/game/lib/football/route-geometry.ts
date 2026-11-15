import { PLAYBOOK } from './playbook';
import { EXECUTION, primaryPlayer } from './execution';
import { clamp, type Athlete, type LivePlay } from './types';
import { PLAYER_MOVEMENT_SCALE } from '../player-pace';

/** Shared read-only route geometry. Movement still uses these exact waypoints. */
export function routePoint(l: LivePlay, a: Athlete, speedFactor = 1) {
  // Advance route waypoints with the faster feet, retaining the same paths,
  // play-action/release delays and passing progression clock.
  l = { ...l, time: l.play === 'play-action'
    ? Math.min(l.time, .6) + Math.max(0, l.time - .6) * PLAYER_MOVEMENT_SCALE
    : l.play === 'verticals' && a.id === 2 && l.athletes.length === 14
      ? Math.min(l.time, .85) + Math.max(0, l.time - .85) * PLAYER_MOVEMENT_SCALE
      : l.time * PLAYER_MOVEMENT_SCALE };
  if(l.play==='flood') {
    const t=l.time,s=speedFactor,los=100+l.snapSpot*10;
    return a.role==='RB' ? {x:Math.min(1110,a.startX+Math.min(los+24-a.startX,t*64*s)),y:clamp(a.startY+t*46,27,158)} :
      a.id===3 ? {x:Math.min(1110,a.startX+Math.min(125,t*64*s)),y:clamp(a.startY+Math.max(0,t-.9)*40,27,162)} :
      {x:Math.min(1110,a.startX+Math.min(265,t*69*s)),y:clamp(a.startY+Math.max(0,t-1.7)*23,27,164)};
  }
  const p = PLAYBOOK[l.play], t = Math.max(0, l.time -
    (l.play === 'play-action' ? .6 : l.play === 'verticals' && a.id === 2 && l.athletes.length === 14 ? .85 : 0)), i = a.route;
  const sign = a.startY < 96 ? 1 : -1;
  // A faster receiver still needs a farther route waypoint to create separation:
  // raising the movement cap alone cannot accelerate a slower-moving target.
  const deepBlitz = l.defense === 'blitz' && p.kind === 'pass' && p.depth >= 24;
  const initialLead = a.id === primaryPlayer(l) ? Math.min(t, p.develop + .55) * (deepBlitz ? 9 : 1.6) : 0;
  let x = a.startX + Math.min(p.depth * 10 + 50, (t * 64 * EXECUTION.skillSpeed + initialLead) * speedFactor), y = a.startY;
  if (l.play === 'slant') y += sign * Math.max(0, t - .35) * 30 * EXECUTION.routeBreak;
  if (l.play === 'screen') { x = a.role === 'RB' ? a.startX + Math.min(35, t * 22) : a.startX + t * 25; y += sign * (a.role === 'RB' ? 43 : 8); }
  if (l.play === 'out') y -= sign * Math.max(0, t - .75) * 35 * EXECUTION.routeBreak;
  if (l.play === 'cross') y += sign * Math.max(0, t - .55) * (i % 2 ? 30 : 21) * EXECUTION.routeBreak;
  if (l.play === 'post' || l.play === 'play-action') y += sign * Math.max(0, t - 1.2) * 20 * EXECUTION.routeBreak;
  if (l.play === 'verticals' && i === 3) y -= 15;
  if (l.play === 'verticals' && l.athletes.length === 14 && a.role === 'RB' && a.route === 2) y = 118;
  if (l.play === 'verticals' && a.id === 2 && l.athletes.length === 14) y = t > 0 ? 67 : a.startY;
  return { x: Math.min(1110, x), y: clamp(y, 27, 165) };
}
