import { createFootball, stepFootball } from '../game/lib/football/engine';
import { startField, stepField } from '../game/lib/football/field';
import { createFootballControls } from '../game/lib/football/controls';
import { highlightedReceiver, progression, releasePass } from '../game/lib/football/passing';
import type { FootballGame, PassType } from '../game/lib/football/types';

/** Offline, seeded actual-flight audit. No account data, network, or saved records. */
export const AUDIT_CASES = [
  'open-lob', 'open-bullet', 'moving-lob', 'moving-bullet',
  'nearby-unable-to-reach', 'moderate-coverage', 'heavy-coverage',
  'inaccurate', 'unreachable', 'progression-expires', 'post-scramble',
  'weak-receiver', 'strong-receiver',
] as const;
export type AuditCase = typeof AUDIT_CASES[number];
export function receivingFixture(seed: number) {
  const g = createFootball(seed * 617, { player: 'Big Blue', opponent: 'Redbirds' });
  g.phase = 'live'; g.spot = 40; g.clutchActive = false;
  g.live = startField(g, 'slant', 'pass'); g.live.penetration!.roll = .999;
  for (const d of g.live.athletes.filter(a => a.side === 'defense'))
    Object.assign(d, { x: 1050, y: 28, engaged: 100, vx: 0, vy: 0 });
  return g;
}
export function launchAuditPass(seed: number, scenario: AuditCase) {
  const g = receivingFixture(seed), l = g.live!;
  if (scenario === 'weak-receiver') g.profiles.home.receivers = .45;
  if (scenario === 'strong-receiver') g.profiles.home.receivers = .9;
  // Run the real routes and dropback before throwing, not a static target proxy.
  const releaseAt = scenario === 'progression-expires' ? .99 : .8;
  while (l.time < releaseAt) stepField(g, {}, 1 / 120);
  const receiverAtRelease = highlightedReceiver(l)!;
  const type: PassType = scenario.includes('bullet') ? 'bullet' : 'normal';
  if (scenario === 'post-scramble') {
    const c = createFootballControls();
    c.enter('hold', 'juke', 0, g); stepFootball(g, c.sample(0));
    stepFootball(g, c.sample(1000));
    c.release('hold', 1010); stepFootball(g, c.sample(1010));
    if (l.flight) throw Error('Scramble release threw unexpectedly');
    c.enter('throw', 'juke', 1020, g); stepFootball(g, c.sample(1020));
  } else releasePass(g, type);
  const f = l.flight!;
  if (!f) throw Error('Audit fixture did not throw');
  if (scenario !== 'post-scramble' && f.receiver !== receiverAtRelease)
    throw Error('Normal target changed from its highlight');
  if (scenario === 'inaccurate') f.toY += 60;
  if (scenario === 'unreachable') l.athletes[f.receiver]!.x -= 350;
  if (scenario === 'nearby-unable-to-reach' || scenario === 'moderate-coverage' || scenario === 'heavy-coverage') {
    const d = l.athletes.find(a => a.side === 'defense' && a.role === 'DB')!;
    const gap = scenario === 'heavy-coverage' ? 3 : 20;
    Object.assign(d, { x: f.toX, y: f.toY + gap, vx: 0, vy: 0,
      engaged: scenario === 'nearby-unable-to-reach' ? 100 : 0 });
    if (scenario === 'heavy-coverage') {
      const other = l.athletes.filter(a => a.side === 'defense' && a.role === 'DB')[1]!;
      Object.assign(other, { x: f.toX + 6, y: f.toY - 3, vx: 0, vy: 0, engaged: 0 });
    }
  }
  if (scenario === 'open-lob' || scenario === 'open-bullet') {
    // Isolate securing an accurate delivered ball from having to chase its lead.
    Object.assign(l.athletes[f.receiver]!, { x: f.toX, y: f.toY, vx: 0, vy: 0 });
  }
  return { g, f, receiverAtRelease, expires: progression(l).expires };
}
export function finishAuditPass(g: FootballGame, dt = 1 / 120) {
  const l = g.live!, f = l.flight!;
  let result: ReturnType<typeof stepField>, gap = Infinity, defenseGap = Infinity;
  let contested = false;
  for (let i = 0; i < Math.ceil(3 / dt); i++) {
    result = stepField(g, {}, dt);
    contested ||= !!f.contested?.length;
    const a = l.athletes[f.receiver]!;
    gap = Math.hypot(a.x - f.x, a.y - f.y);
    defenseGap = Math.min(...l.athletes.filter(d => d.side === 'defense')
      .map(d => Math.hypot(d.x - f.x, d.y - f.y)));
    if (l.passCaught || result || f.deflected || l.mode === 'return') break;
  }
  const outcome = l.passCaught ? 'catch' : l.mode === 'return' ? 'interception'
    : f.deflected || result?.detail?.includes('DEFLECT') || result?.detail?.includes('BREAKUP') ? 'breakup'
    : result?.detail === 'DROPPED PASS' ? 'drop'
    : result?.detail === 'ACCURACY MISS' ? 'accuracy-miss'
    : result?.detail === 'UNCATCHABLE THROW' ? 'uncatchable'
    : result?.reason === 'incomplete' ? 'other-incomplete' : result?.reason ?? 'unresolved';
  return { outcome, gap, defenseGap, contested, accuracy: f.accuracy,
    receiver: f.receiver, endTime: l.time, detail: result?.detail };
}

if (process.argv[1]?.endsWith('football-receiving-audit.ts')) {
  const samples = Number(process.argv[2] ?? 1000);
  const report = Object.fromEntries(AUDIT_CASES.map(scenario => {
    const counts: Record<string, number> = {};
    let arrivedCatchable = 0, closeFailures = 0, contests = 0;
    for (let seed = 1; seed <= samples; seed++) {
      const { g } = launchAuditPass(seed, scenario), r = finishAuditPass(g);
      counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
      if (r.gap <= 13) arrivedCatchable++;
      if (r.gap <= 13 && r.outcome !== 'catch') closeFailures++;
      if (r.contested) contests++;
    }
    return [scenario, { samples, catchPercent: (counts.catch ?? 0) / samples * 100,
      counts, arrivedCatchable, closeFailures, contests }];
  }));
  console.log(JSON.stringify(report, null, 2));
}
