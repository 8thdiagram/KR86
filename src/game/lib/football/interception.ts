import { isKickContact, KR } from '../kick-return-engine';
import { stepKickMoves } from '../kick-return-moves';
import { clamp, other, type Athlete, type FootballGame, type FootballInput, type LivePlay } from './types';
import { canDefensiveAction, canTackle, startNearestDive, stepAthleteDive } from './defensive-action';
import { beginTackle } from './tackle-scene';
import { EXECUTION } from './execution';
import { ELITE, eliteSlots } from './secondary';
import { contactFumble } from './field';
import { openFieldGain } from './athleticism';
import { FOOTBALL_SIDELINES, outsideFootballSideline } from './sidelines';
import { pursuitPoint } from '../open-field-pursuit';
import { franchiseAthleteFactor } from './franchise-upgrades';
import { carrierMoment } from './execution-moments';
import { playerSpeed } from '../player-pace';

/** Old saved returns without returnKind were interceptions; recovery returns
 * explicitly identify themselves. Never show a return banner over a loose ball. */
export function turnoverReturnLabel(l: LivePlay) {
  if (l.mode !== 'return' || (l.interception?.age ?? 10) >= 1.3) return null;
  return l.returnKind === 'fumble' ? 'FUMBLE · DEFENSE RECOVERS · RETURN!' : 'INTERCEPTION · RETURN!';
}

/** The catch is a ball-to-defender animation, followed by a real leftward return. */
export function intercept(l: LivePlay, defender: Athlete) {
  const f = l.flight!;
  defender.dive = undefined; defender.defensiveAttempt = undefined;
  l.interception = { catcher: defender.id, age: 0, catchX: defender.x, catchY: defender.y };
  l.carrier = defender.id; l.mode = 'return'; l.holdingPass = false; l.lockedReceiver = undefined;
  l.returnKind = 'interception';
  l.flight = { ...f, fromX: f.x, fromY: f.y, toX: defender.x, toY: defender.y, age: 0, duration: .18, receiver: defender.id };
  l.movement.moves = { ...l.movement.moves!, active: undefined, furthestX: 1200 - defender.x, readyAt: 0, backward: false };
  l.movement.player = { x: 1200 - defender.x, y: defender.y }; l.movement.returnTime = 0;
}
const move = (a: Athlete, x: number, y: number, speed: number, dt: number) => {
  const dx = x - a.x, dy = y - a.y, n = Math.hypot(dx, dy), k = n ? Math.min(1, playerSpeed(speed) * dt / n) : 0;
  a.vx = dx * k / dt; a.vy = dy * k / dt; a.x += dx * k; a.y = clamp(a.y + dy * k, FOOTBALL_SIDELINES.minY, FOOTBALL_SIDELINES.maxY);
};
export function stepInterception(g: FootballGame, input: FootballInput, dt: number): { spot: number; touchdown: boolean; outOfBounds?: boolean } | undefined {
  const l = g.live!, c = l.interception!, runner = l.athletes[c.catcher]!;
  c.age += dt;
  if (l.flight) {
    const f = l.flight; f.age += dt; const t = clamp(f.age / f.duration, 0, 1);
    f.x = f.fromX + (f.toX - f.fromX) * t; f.y = f.fromY + (f.toY - f.fromY) * t; f.z *= 1 - t;
    if (t >= 1) { l.flight = undefined; g.possession = other(l.offense ?? g.possession); g.message = 'INTERCEPTION — RETURN!'; }
    return;
  }
  if (c.age < .38) return;
  const pursuing = l.athletes.filter(a => a.side === 'offense'), blockers = l.athletes.filter(a => a.side === 'defense' && a.id !== runner.id);
  if (input.action && canDefensiveAction(g)) startNearestDive(pursuing, runner);
  for (const b of blockers) {
    const d = [...pursuing].sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y))[0]!;
    move(b, d.x + 5, d.y, 56, dt);
    if (Math.hypot(b.x - d.x, b.y - d.y) < 12) d.engaged = l.time + .12;
  }
  for (const d of pursuing) {
    if (stepAthleteDive(d, dt)) continue;
    if (d.engaged > l.time) { d.vx = 0; d.vy = 0; continue; }
    // The old offense is now covering the return: keep its real athleticism.
    const skill = d.role === 'WR' || d.role === 'RB' || d.role === 'TE';
    const upgrade = franchiseAthleteFactor(g, d);
    const speed = playerSpeed((skill ? KR.forwardSpeed * EXECUTION.skillSpeed * openFieldGain(d, [runner], dt) : 57 + g.profiles[l.offense ?? other(g.possession)].back * 8) * upgrade);
    const lateral = skill ? playerSpeed(KR.lateralSpeed * EXECUTION.skillSpeed * upgrade) : speed;
    // All return defenders finish a reachable interception, not a fixed offset
    // outside tackle range. Read only the runner's already-observed movement.
    if (!d.pursuit || d.pursuit.until <= l.time) {
      const point = pursuitPoint(d, runner, clamp(runner.vx, -100, 100), clamp(runner.vy, -100, 100),
        speed, lateral, FOOTBALL_SIDELINES.minY, FOOTBALL_SIDELINES.maxY);
      d.pursuit = { ...point, until: l.time + .08, role: 'tackle',
        seenX: runner.x, seenY: runner.y, seenVx: runner.vx, seenVy: runner.vy };
    }
    const dx = d.pursuit.x - d.x, dy = d.pursuit.y - d.y;
    const arrival = Math.max(dt, Math.abs(dx) / speed, Math.abs(dy) / lateral);
    const cx = dx / arrival - d.vx, cy = dy / arrival - d.vy;
    const f = Math.min(1, 650 * dt / Math.max(.001, Math.hypot(cx, cy)));
    d.vx += cx * f; d.vy += cy * f;
    d.x += d.vx * dt; d.y = clamp(d.y + d.vy * dt, FOOTBALL_SIDELINES.minY, FOOTBALL_SIDELINES.maxY);
  }
  const human = other(l.offense ?? other(g.possession)) === 'home';
  const nearest = [...pursuing].sort((a, b) => Math.hypot(a.x - runner.x, a.y - runner.y) - Math.hypot(b.x - runner.x, b.y - runner.y))[0]!;
  const direction = human ? input.direction ?? 0 : Math.abs(nearest.y - runner.y) < 25 ? runner.y < 96 ? 1 : -1 : 0;
  l.movement.returnTime += dt;
  l.movement.player = { x: 1200 - runner.x, y: runner.y };
  const before = l.movement.player;
  const movement = stepKickMoves(l.movement, direction, dt, human ? { juke: !!input.juke || !!input.action, hesitate: input.hesitate } : {}, FOOTBALL_SIDELINES);
  const secondary = l.athletes.filter(a => a.side === 'defense' && a.role === 'DB');
  const elite = eliteSlots(g, other(l.offense ?? other(g.possession))).includes(secondary.indexOf(runner));
  if (elite && !movement.moves?.active && !input.hesitate) {
    const gain = ELITE.forward / KR.forwardSpeed;
    movement.player = { x: before.x + (movement.player.x - before.x) * gain,
      y: clamp(before.y + (movement.player.y - before.y) * gain, FOOTBALL_SIDELINES.minY, FOOTBALL_SIDELINES.maxY) };
  }
  const openGain = openFieldGain(runner, pursuing, dt, runner.role === 'DB' && !movement.moves?.active && !input.hesitate);
  if (!movement.moves?.active && !input.hesitate && openGain > 1) {
    movement.player = { x: before.x + (movement.player.x - before.x) * openGain,
      y: clamp(before.y + (movement.player.y - before.y) * openGain, FOOTBALL_SIDELINES.minY, FOOTBALL_SIDELINES.maxY) };
  }
  const upgrade = franchiseAthleteFactor(g, runner) * carrierMoment(g, runner);
  movement.player = { x: before.x + (movement.player.x - before.x) * upgrade,
    y: clamp(before.y + (movement.player.y - before.y) * upgrade, FOOTBALL_SIDELINES.minY, FOOTBALL_SIDELINES.maxY) };
  l.movement.player = movement.player; l.movement.moves = movement.moves;
  runner.vx = -(movement.player.x - before.x) / dt; runner.vy = (movement.player.y - before.y) / dt;
  runner.x = 1200 - movement.player.x; runner.y = movement.player.y;
  if (runner.x <= 100) return { spot: 0, touchdown: true };
  const tackler = pursuing.find(d => canTackle(d) && d.engaged <= l.time && isKickContact(runner, d));
  const tackled = !!tackler;
  if (tackler && contactFumble(g, runner, tackler)) return;
  if (tackler) {
    beginTackle(g, runner, tackler, other(l.offense ?? other(g.possession)), 'scrimmage');
    g.tackleSounds = (g.tackleSounds ?? 0) + 1;
  }
  if (outsideFootballSideline(runner.y) || tackled)
    return { spot: clamp((runner.x - 100) / 10, 0, 100), touchdown: false,
      outOfBounds: outsideFootballSideline(runner.y) };
  return undefined;
}
