import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootball, stepFootball } from './engine';
import { startField } from './field';
import { createFootballControls } from './controls';
import { canDefensiveAction, canTackle, startNearestDive, stepAthleteDive } from './defensive-action';
import { kickoffSequence, stepSpecialTeams } from './special-teams';
import { footballSoundEvents, soundSnapshot } from './sound-events';
import { isFootballGame } from './storage';

const setup = () => {
  const g = createFootball(86, { player: 'Big Blue', opponent: 'Redbirds' });
  g.phase = 'live'; g.possession = 'away'; g.live = startField(g, 'power', 'pass');
  g.live.mode = 'run'; g.live.carrier = 6; g.live.time = 2;
  return g;
};
test('a quick defensive ACTION tap chooses the closest defender and never controls the CPU runner', () => {
  const g = setup(), l = g.live!, controls = createFootballControls();
  const runner = l.athletes[6]!;
  runner.x = l.movement.player.x = 500; runner.y = l.movement.player.y = 96;
  const defenders = l.athletes.filter(a => a.side === 'defense');
  for (const d of defenders) { d.x = 700; d.y = 30; d.engaged = 0; }
  const nearest = defenders[3]!; nearest.x = 545; nearest.y = 110;
  assert(canDefensiveAction(g));
  controls.enter('defense', 'juke', 0, g);
  assert(!controls.sample(0, false).action, 'press waits briefly to distinguish a hold');
  controls.sample(0);
  controls.release('defense', 80);
  stepFootball(g, controls.sample(80));
  assert(!controls.sample(80).action, 'the quick tap fires only once');
  assert(nearest.dive); assert.equal(defenders.filter(d => d.dive).length, 1);
  assert.equal(nearest.dive.phase, 'windup');
  assert(!l.movement.moves?.active, 'defensive action does not juke the opposing runner');
  assert(!controls.sample(10).action, 'holding is not repeated dive input');
  controls.release('defense', 350);
  assert(!controls.sample(350).action, 'release is not another action');
  assert(isFootballGame(JSON.parse(JSON.stringify(g))));
});
test('a missed dive commits to its original direction, cannot tackle on the ground and recovers', () => {
  const g = setup(), d = g.live!.athletes.find(a => a.side === 'defense')!;
  d.x = 545; d.y = 96;
  startNearestDive([d], { x: 500, y: 96 });
  const angle = d.dive!.angle;
  for (let i = 0; i < 20; i++) stepAthleteDive(d, 1 / 60);
  assert(d.x < 545); assert.equal(d.dive!.angle, angle); assert.equal(d.dive!.phase, 'airborne');
  for (let i = 0; i < 20; i++) stepAthleteDive(d, 1 / 60);
  assert.equal(d.dive!.phase, 'grounded'); assert(!canTackle(d));
  const x = d.x;
  for (let i = 0; i < 120; i++) stepAthleteDive(d, 1 / 60);
  assert.equal(d.x, x); assert.equal(d.dive, undefined); assert(canTackle(d));
});
test('a defensive dive can make real contact or miss without guaranteeing a tackle', () => {
  const results: boolean[] = [];
  for (const gap of [25, 180]) {
    const g = setup(), l = g.live!, runner = l.athletes[6]!;
    runner.x = l.movement.player.x = 500; runner.y = l.movement.player.y = 96; runner.vx = 73;
    for (const d of l.athletes.filter(a => a.side === 'defense')) { d.x = 900; d.y = 30; d.engaged = 0; }
    const nearest = l.athletes[10]!; nearest.x = 500 + gap; nearest.y = 68;
    for (let i = 0; i < 40 && g.phase === 'live'; i++) stepFootball(g, { action: i === 0 });
    results.push(g.phase === 'play-dead' && g.tackleSounds === 1);
  }
  assert.deepEqual(results, [true, false]);
});
test('defensive ACTION also works against CPU kick returns and interception returns', () => {
  const g = setup(); g.phase = 'kickoff'; g.kickReceiver = 'away'; g.special = kickoffSequence(g, 'full');
  g.special.stage = 'recovery'; g.special.stageAge = .31;
  g.special.recovery = g.special.returner; g.special.recoveryFrom = { x: 200, y: 96 };
  g.special.ball = { x: 200, y: 96, z: 0 };
  stepSpecialTeams(g, {}, 1 / 60);
  assert.equal(g.special.stage, 'return'); assert(canDefensiveAction(g));
  const closest = [...g.returnAttempt!.defenders].sort((a, b) =>
    Math.hypot(a.x - 200, a.y - 96) - Math.hypot(b.x - 200, b.y - 96))[0]!;
  closest.x = g.returnAttempt!.player.x + 35; closest.y = g.returnAttempt!.player.y + 16;
  stepSpecialTeams(g, { action: true }, 1 / 60);
  assert(closest.dive); assert.equal(g.returnAttempt!.defenders.length, 7);
  const intercepted = setup(); intercepted.live!.offense = 'home'; intercepted.live!.mode = 'return';
  intercepted.live!.carrier = 11;
  intercepted.live!.interception = { catcher: 11, age: 1, catchX: 600, catchY: 96 };
  const interceptor = intercepted.live!.athletes[11]!;
  const pursuer = intercepted.live!.athletes[3]!;
  pursuer.x = interceptor.x - 30; pursuer.y = interceptor.y + 15;
  assert(canDefensiveAction(intercepted));
  stepFootball(intercepted, { action: true });
  assert(intercepted.live!.athletes.some(a => a.side === 'offense' && a.dive));
});
test('ordinary dead balls do not whistle; penalties, kicks and tackles stay distinct without resume replays', () => {
  const g = setup(), before = soundSnapshot(g);
  g.phase = 'play-dead'; g.lastResult = 'TURNOVER ON DOWNS';
  assert.deepEqual(footballSoundEvents(before, g), []);
  g.phase = 'penalty';
  assert.deepEqual(footballSoundEvents(before, g), ['whistle']);
  g.phase = 'live'; g.kickSounds = 1;
  assert.deepEqual(footballSoundEvents(before, g), ['kick']);
  const kicked = soundSnapshot(g); g.tackleSounds = 1; g.phase = 'play-dead';
  assert.deepEqual(footballSoundEvents(kicked, g), ['tackle']);
  assert.deepEqual(footballSoundEvents(soundSnapshot(g), JSON.parse(JSON.stringify(g))), []);
});
test('kick sound is emitted at foot contact exactly once, not on lineup or flight frames', () => {
  const g = setup(); g.special = kickoffSequence(g, 'full'); g.phase = 'kickoff';
  for (let i = 0; i < 42; i++) stepSpecialTeams(g, {}, 1 / 60);
  assert.equal(g.kickSounds, undefined);
  for (let i = 0; i < 12; i++) stepSpecialTeams(g, {}, 1 / 60);
  assert.equal(g.kickSounds, 1);
  for (let i = 0; i < 45; i++) stepSpecialTeams(g, {}, 1 / 60);
  assert.equal(g.kickSounds, 1);
});
