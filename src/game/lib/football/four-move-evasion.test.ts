import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseCarrierEvasion, cpuCarrierAction, EVADE } from '../carrier-evasion';
import { createKickAttempt, isKickReturnProgress, stepKickAttempt, type KickAttempt } from '../kick-return-engine';
import { isKickMoves, stepKickMoves } from '../kick-return-moves';
import { playerSpeed } from '../player-pace';
import { createFootball, stepFootball, FULL_GAME_SPEED } from './engine';
import { startField, stepField } from './field';
import { stepDefense } from './pursuit';
import { isFootballGame } from './storage';

const bounds = { minY: 12, maxY: 168 };
function attempt(dx?: number, dy = 0, vx = -30, vy = 0) {
  const a = createKickAttempt(1986, 1);
  a.phase = 'returning'; a.time = a.returnTime = 1; a.player = { x: 650, y: 96 };
  a.moves = { version: 2, sequence: 0, readyAt: 0, backward: false, vx: 60, furthestX: 650 };
  a.defenders = dx === undefined ? [] : [{
    id: 0, x: 650 + dx, y: 96 + dy, homeX: 650 + dx,
    minY: 12, maxY: 168, speed: Math.abs(vx), lateralSpeed: 60, active: true, vx, vy,
  }];
  return a;
}
function field(dx = 36, dy = 0, seed = 1986) {
  const g = createFootball(seed, { player: 'Big Blue', opponent: 'Redbirds' });
  g.possession = 'home'; g.phase = 'live'; g.spot = 40;
  const l = g.live = startField(g, 'power', 'pass');
  l.mode = 'run'; l.time = 3; l.carrier = 6; l.carrierCrossedLos = true; l.cpuActionAt = 100;
  for (const a of l.athletes) Object.assign(a, {
    x: a.side === 'defense' ? 1000 : 300, y: 30, engaged: 100, vx: 0, vy: 0,
  });
  Object.assign(l.athletes[6]!, { x: 650, y: 96, engaged: 0 });
  const d = l.athletes.find(a => a.role === 'DB')!;
  Object.assign(d, { x: 650 + dx, y: 96 + dy, startX: 650 + dx, startY: 96 + dy, engaged: 0 });
  l.movement.player = { x: 650, y: 96 }; l.movement.returnTime = 1;
  l.movement.moves = { version: 2, sequence: 0, readyAt: 0, backward: false, vx: 60, furthestX: 650 };
  return { g, l, d, runner: l.athletes[6]! };
}
function tick(a: KickAttempt, dt: number, press = false, direction: -1 | 0 | 1 = 0) {
  const m = stepKickMoves(a, direction, dt, { evasion: true, juke: press }, bounds);
  a.player = m.player; a.moves = m.moves; a.returnTime += dt;
  assert(isKickMoves(a.moves, a), 'every outward, return and completed frame remains saveable');
  return m;
}

test('A: a direct head-on ACTION physically jukes outward then back in .34 seconds', () => {
  const a = attempt(40);
  assert.equal(chooseCarrierEvasion(a, bounds).kind, 'juke');
  let peak = 0, lastX = a.player.x;
  for (let i = 0; i < 34; i++) {
    tick(a, .01, i === 0);
    peak = Math.max(peak, Math.abs(a.player.y - 96));
    assert(a.player.x > lastX, 'cutback never undoes forward movement'); lastX = a.player.x;
    if (i === 15) assert(Math.abs(Math.abs(a.player.y - 96) - EVADE.spinDistance) < 1e-7);
    if (i < 33) assert.equal(a.moves?.active?.kind, 'juke');
  }
  assert(Math.abs(peak - EVADE.bodyWidth * 1.74) < 1e-7);
  assert(Math.abs(a.player.y - 96) < 1e-7);
  assert.equal(a.moves?.active, undefined);
});

test('B: live defenders respond identically throughout the matching spin/juke outward leg', () => {
  const { g: juke } = field(40);
  juke.live!.movement.moves!.active = {
    kind: 'juke', side: -1, elapsed: 0, evasive: true, duration: .34,
    travelDuration: .16, spinDirection: 0, lateralDistance: EVADE.spinDistance,
  };
  const spin = structuredClone(juke);
  spin.live!.movement.moves!.active!.kind = 'spin';
  for (let i = 0; i < 16; i++) {
    assert.equal(stepField(juke, {}, .01), undefined);
    assert.equal(stepField(spin, {}, .01), undefined);
    assert.deepEqual(juke.live!.athletes, spin.live!.athletes,
      'same real position/velocity produces byte-for-byte identical defensive motion, pursuit reads and timers');
    assert.deepEqual(juke.live!.movement.player, spin.live!.movement.player);
  }
  const before = structuredClone(juke.live!.athletes.filter(a => a.side === 'defense'));
  stepField(juke, {}, .01); stepField(spin, {}, .01);
  assert.notEqual(juke.live!.athletes[6]!.y, spin.live!.athletes[6]!.y, 'only the physical cutback separates the trajectories');
  assert.notDeepEqual(before, juke.live!.athletes.filter(a => a.side === 'defense'), 'defenders were never frozen');
});

test('B: changing hidden maneuver, destination metadata or timer cannot influence defensive pursuit', () => {
  const { g } = field(38, 8);
  const a = g.live!.athletes[6]!;
  Object.assign(a, { vx: 65, vy: -80, x: 656, y: 88 });
  const first = structuredClone(g), second = structuredClone(g);
  first.live!.movement.moves!.active = {
    kind: 'spin', side: -1, elapsed: .08, evasive: true, duration: .34,
    travelDuration: .16, spinDirection: 0, lateralDistance: EVADE.spinDistance,
  };
  second.live!.movement.moves!.active = {
    ...first.live!.movement.moves!.active!, kind: 'juke', side: 1, elapsed: .23,
  };
  stepDefense(first, 1 / 60); stepDefense(second, 1 / 60);
  assert.deepEqual(first.live!.athletes, second.live!.athletes);
  assert.equal(first.seed, second.seed, 'no move-specific reaction roll is consumed');
});

test('B/L: Classic return defenders see identical movement, and diagonal observed velocities survive saves', () => {
  for (const direction of [-1, 0, 1] as const) {
    let spin = createKickAttempt(1986, 1);
    spin.phase = 'returning'; spin.time = spin.returnTime = 1; spin.player = { x: 180, y: 96 };
    spin.moves = { version: 2, sequence: 1, readyAt: 1.79, backward: false, vx: 60, furthestX: 180,
      active: { kind: 'spin', side: 1, elapsed: 0, evasive: true, duration: .34,
        travelDuration: .16, spinDirection: direction, lateralDistance: EVADE.spinDistance } };
    let juke = structuredClone(spin); juke.moves!.active!.kind = 'juke';
    for (let i = 0; i < 34; i++) {
      spin = stepKickAttempt(spin, direction, .01, { evasion: true });
      juke = stepKickAttempt(juke, direction, .01, { evasion: true });
      if (i < 16) {
        assert.deepEqual(juke.defenders, spin.defenders);
        assert.deepEqual(juke.player, spin.player);
      }
      for (const current of [spin, juke]) {
        const progress = { version: 1, attempts: 1, bestYards: 0, current };
        assert(isKickReturnProgress(progress), `valid ${current.moves?.active?.kind} save at ${i}, direction ${direction}, observed vy ${current.diveRead?.vy}`);
      }
    }
  }
});

test('C/D: ordinary live defensive pursuit can both miss a juke and tackle it', t => {
  let fooled = 0, tackled = 0, directTackles = 0, outwardCommitments = 0;
  for (const seed of [86, 1986, 333]) for (const dx of [18, 26, 38])
  for (const dy of [-5, 0, 5]) {
    const { g, l, d } = field(dx, dy, seed);
    d.vx = -60;
    const straight = structuredClone(g);
    let hit = false, straightHit = false, selected = false, committed = false;
    // Include the complete .34-second fake/cutback, not merely its escape.
    // A miss here is not a guarantee that a defender can never recover later.
    for (let i = 0; i < 24; i++) {
      if (!hit) {
        hit = stepField(g, i === 0 ? { action: true } : {}, 1 / 60)?.reason === 'tackle';
        selected ||= l.movement.moves?.active?.kind === 'juke';
        const side = l.movement.moves?.active?.side;
        if (side && i < 10 && d.vy * side > 1) committed = true;
      }
      if (!straightHit) straightHit = stepField(straight, {}, 1 / 60)?.reason === 'tackle';
    }
    if (selected && hit) tackled++;
    if (selected && !hit && straightHit && committed) fooled++;
    if (committed) outwardCommitments++;
    if (straightHit) directTackles++;
  }
  t.diagnostic(JSON.stringify({ fooled, tackled, directTackles, outwardCommitments }));
  assert(fooled > 0, 'at least one defender commits outward and misses through the cutback, using unmodified live AI');
  assert(tackled > 0, 'good positioning still makes a genuine contact tackle');
});

for (const direction of [-1, 0, 1] as const) {
  test(`E/F: diagonal heading ${direction} selects opposite spins and preserves the new lane`, () => {
    const base = attempt();
    const vx = playerSpeed((base.difficulty === 'hard' ? 73 : 57) * (base.kickoffBoost ?? 1));
    const vy = direction * playerSpeed(base.difficulty === 'hard' ? 86 : 78);
    const speed = Math.hypot(vx, vy), nx = -vy / speed, ny = vx / speed;
    for (const side of [-1, 1] as const) {
      const a = attempt(vx / speed * 8 + nx * side * 30, vy / speed * 8 + ny * side * 30, 0);
      const start = { ...a.player };
      assert.deepEqual(chooseCarrierEvasion(a, bounds, [], direction), { kind: 'spin', side: -side });
      for (let i = 0; i < 34; i++) {
        tick(a, .01, i === 0, direction);
        // Isolate the committed displacement after checking selection. Live
        // contact and pursuit are tested separately; bodies can stop a move.
        if (i === 0) a.defenders = [];
      }
      const dx = a.player.x - start.x - vx * .34, dy = a.player.y - start.y - vy * .34;
      assert(Math.abs(dx * nx + dy * ny + side * EVADE.spinDistance) < 1e-7);
      assert(Math.abs(dx * vx / speed + dy * vy / speed) < 1e-7);
      const y = a.player.y; tick(a, .01);
      assert.equal(a.player.y, y, 'the spin does not cut back to its original lane');
    }
  });
}
test('G/H: close closing rear pressure bursts, distant/non-closing rear coverage and open field spin', () => {
  for (const dx of [-18, -25]) {
    const a = attempt(dx, 0, 160);
    assert.equal(chooseCarrierEvasion(a, bounds).kind, 'boost');
    tick(a, .01, true);
    assert.equal(a.moves?.active?.kind, 'boost');
  }
  for (const a of [attempt(), attempt(-25, 0, 0), attempt(-100, 0, 160), attempt(100)]) {
    tick(a, .01, true);
    assert.equal(a.moves?.active?.kind, 'spin');
    assert(!cpuCarrierAction(attempt(), 0, bounds).juke);
  }
  const multiple = attempt(22);
  multiple.defenders.push({ ...attempt(-18, 0, 160).defenders[0]!, id: 1 });
  assert.equal(chooseCarrierEvasion(multiple, bounds).kind, 'boost', 'imminent rear pursuit has the specified first priority');
});

test('I/J/K: CPU can choose each move using the same trajectories and recovery as human ACTION', t => {
  const kinds = new Set<string>();
  for (const [dx, dy, vx] of [[26, 0, -70], [25, -19, -30], [25, 19, -30], [-18, 0, 160]]) {
    const cpu = attempt(dx, dy, vx), human = structuredClone(cpu);
    const input = cpuCarrierAction(cpu, 0, bounds);
    assert(input.juke, `CPU should recognize this useful encounter ${dx},${dy},${vx}`);
    const c = stepKickMoves(cpu, 0, .01, input, bounds);
    const h = stepKickMoves(human, 0, .01, { evasion: true, juke: true }, bounds);
    assert.deepEqual(c, h);
    kinds.add(`${c.moves!.active!.kind}:${c.moves!.active!.side}`);
    t.diagnostic(`${dx},${dy}: ${c.moves!.active!.kind} ${c.moves!.active!.side}`);
  }
  assert(kinds.has('juke:-1') || kinds.has('juke:1'));
  assert(kinds.has('spin:-1') && kinds.has('spin:1') && kinds.has('boost:0'));
});

test('L: jukes respect bodies, boundaries, cooldown, hold-to-halt and mid-cutback saves', () => {
  const a = attempt(40); a.player.y = 13; a.defenders[0]!.y = 13;
  tick(a, .01, true);
  assert.equal(a.moves?.active?.side, 1, 'fake goes away from the near sideline');
  for (let i = 0; i < 40; i++) tick(a, .01, true);
  assert.equal(a.moves!.sequence, 1, 'held/repeated presses cannot restart the move during recovery');
  assert(a.player.y >= bounds.minY && a.player.y <= bounds.maxY);
  const contact = attempt(0, 0, 0);
  const blocked = stepKickAttempt(contact, 0, 1 / 60, { evasion: true, juke: true }, bounds);
  assert.equal(blocked.phase, 'tackled');
  const { g, l, d } = field(40);
  d.engaged = 100;
  for (let i = 0; i < 22; i++) stepField(g, i === 0 ? { action: true } : {}, .01);
  assert.equal(l.movement.moves!.active!.kind, 'juke');
  const restored = JSON.parse(JSON.stringify(g));
  assert(isFootballGame(restored), 'a returning juke is valid in real Full Game saves');
  for (let i = 0; i < 50; i++) {
    const first = stepField(g, { hesitate: true }, .01);
    const second = stepField(restored, { hesitate: true }, .01);
    assert.deepEqual(first, second); assert.deepEqual(g, restored);
  }
  assert(l.movement.moves!.hesitating, 'a held ACTION halts only after the complete cutback');
  const y = l.movement.player.y;
  assert(Math.abs(y - 96) < 1e-7);
});

test('existing .34-second spins retain their saved .26-second escape curve', () => {
  const a = attempt();
  a.moves!.active = { kind: 'spin', side: 1, elapsed: .1, evasive: true,
    duration: .34, spinDirection: 0, lateralDistance: EVADE.spinDistance };
  assert(isKickMoves(a.moves, a));
  const y = a.player.y;
  for (let i = 0; i < 24; i++) tick(a, .01);
  assert(Math.abs(a.player.y - y - EVADE.spinDistance * .16 / .26) < 1e-7);
  assert.equal(a.moves?.active, undefined);
});

test('diagonal jukes return to the original travel lane, not backward to their starting field position', () => {
  for (const direction of [-1, 1] as const) {
    const a = attempt();
    const vx = playerSpeed((a.difficulty === 'hard' ? 73 : 57) * (a.kickoffBoost ?? 1));
    const vy = direction * playerSpeed(a.difficulty === 'hard' ? 86 : 78), speed = Math.hypot(vx, vy);
    a.defenders = attempt(40 * vx / speed, 40 * vy / speed, -vx, -vy).defenders;
    assert.equal(chooseCarrierEvasion(a, bounds, [], direction).kind, 'juke');
    const start = { ...a.player };
    for (let i = 0; i < 34; i++) {
      tick(a, .01, i === 0, direction);
      if (!i) a.defenders = [];
    }
    assert(Math.abs(a.player.x - start.x - vx * .34) < 1e-7);
    assert(Math.abs(a.player.y - start.y - vy * .34) < 1e-7);
  }
});

test('all four CPU outcomes occur in complete public-engine plays with real field reflection and frame timing', t => {
  const counts = { 'spin:-1': 0, 'spin:1': 0, juke: 0, boost: 0 };
  let completed = 0;
  for (let seed = 1; seed <= 12; seed++) for (const play of ['power', 'counter', 'sweep', 'draw', 'slant', 'screen'] as const) {
    const g = createFootball(seed * 1986, { player: 'Big Blue', opponent: 'Redbirds' });
    g.possession = 'away'; g.spot = 35; g.phase = 'live';
    g.live = startField(g, play, 'pass');
    let sequence = 0;
    for (let i = 0; i < 1800; i++) {
      stepFootball(g, {}, 1 / 60, FULL_GAME_SPEED);
      const moves = g.live?.movement.moves;
      if (moves?.active && moves.sequence > sequence) {
        const key = moves.active.kind === 'spin' ? `spin:${moves.active.side}` : moves.active.kind;
        assert(key in counts, `unexpected CPU maneuver ${key}`);
        counts[key as keyof typeof counts]++;
      }
      sequence = moves?.sequence ?? sequence;
      if (g.phase !== 'live' || g.playResult || g.tackleScene || ['return', 'fumble', 'loose'].includes(g.live?.mode ?? '')) {
        completed++; break;
      }
    }
  }
  assert.equal(completed, 72);
  t.diagnostic(JSON.stringify({ completed, counts }));
  for (const [kind, count] of Object.entries(counts)) assert(count > 0, `${kind} must occur in real complete plays`);
});
