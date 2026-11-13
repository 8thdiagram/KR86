import { clamp, type Athlete, type LivePlay } from './types';

/** The fourth vertical is a declared tackle-eligible release. Three linemen
 * still line up; that one releases after the snap instead of protecting. */
export function eligibleReceivers(l: LivePlay) {
  return l.athletes.filter(a => a.side === 'offense' &&
    (a.role === 'WR' || a.role === 'TE' || a.role === 'RB' ||
      l.athletes.length === 14 && a.id === 2 && a.route === 1));
}

/** Stable, unique assignments from the formation, not nearest-player switching.
 * Man's LB takes the releasing back; blitz leaves three DBs to match receivers. */
export function manAssignment(l: LivePlay, defender: Athlete) {
  const available = [...eligibleReceivers(l)];
  const defenders = l.athletes.filter(d => d.side === 'defense' &&
    (d.role === 'DB' || d.role === 'LB' && l.defense === 'man'))
    .sort((a, b) => (a.role === 'LB' ? -1 : b.role === 'LB' ? 1 : a.startY - b.startY));
  for (const d of defenders) {
    const ranked = [...available].sort((a, b) => {
      if (d.role === 'LB' && (a.role === 'RB') !== (b.role === 'RB')) return a.role === 'RB' ? -1 : 1;
      return Math.abs(a.startY - d.startY) - Math.abs(b.startY - d.startY) || a.id - b.id;
    });
    const receiver = ranked[0];
    if (d.id === defender.id) return receiver;
    if (receiver) available.splice(available.indexOf(receiver), 1);
  }
  return undefined;
}

/** Areas first: exchange threats crossing lanes rather than chasing one player.
 * Only current positions/velocity and an already-thrown ball are observed. */
export function zoneTarget(l: LivePlay, d: Athlete) {
  const los = 100 + l.snapSpot * 10, prevent = l.defense === 'prevent';
  const deep = d.role === 'DB' && (prevent || d.startY > 60);
  const center = d.role === 'LB' ? 96 : d.startY;
  const receivers = eligibleReceivers(l).filter(a =>
    Math.abs(a.y - center) < (prevent ? 65 : 43) && (!deep || a.x > los + 35));
  const threat = receivers.sort((a, b) =>
    (Math.abs(a.y - center) - a.x * .10) - (Math.abs(b.y - center) - b.x * .10) || a.id - b.id)[0];
  const floor = deep ? prevent ? 175 : 105 : d.role === 'LB' ? 32 : 50;
  let x = Math.max(los + floor, (threat?.x ?? los) + (prevent ? 35 : 4));
  let y = threat ? clamp(threat.y + threat.vy * .14, center - 38, center + 38) : center;
  // React to an observed deep throw, not the unannounced offensive play.
  if (prevent && d.role === 'DB' && l.flight && l.flight.toX > los + 100) {
    const backs = l.athletes.filter(a => a.side === 'defense' && a.role === 'DB')
      .sort((a, b) => Math.hypot(a.x - l.flight!.toX, a.y - l.flight!.toY) -
        Math.hypot(b.x - l.flight!.toX, b.y - l.flight!.toY) || a.id - b.id);
    const rank = backs.findIndex(a => a.id === d.id);
    if (rank < 2) {
      x = Math.max(los + 135, Math.min(1110, l.flight.toX + (rank ? 22 : 2)));
      y = clamp(l.flight.toY + (rank ? (center < l.flight.toY ? -16 : 16) : 0), 25, 167);
    }
  }
  return { x: Math.min(1110, x), y: clamp(y, 25, 167), threat, deep };
}
