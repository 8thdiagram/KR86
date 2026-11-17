import type { FootballGame, Side } from './types';
import { other } from './types';
import { legendaryAthlete } from './legendary';
import { legendaryPlayer, type Legend, type LegendPosition } from './legendary-roster';
import { rewardSlot } from './legend-awards';

export const PERFORMANCE_STATS = ['attempts', 'completions', 'passingYards', 'passingTD',
  'interceptionsThrown', 'rushingYards', 'rushingTD', 'receivingYards', 'receptions',
  'receivingTD', 'tackles', 'sacks', 'interceptions', 'forcedFumbles', 'recoveries',
  'defensiveTD', 'returnYards', 'returnTD', 'fieldGoals', 'fumblesLost', 'passBreakups'] as const;
export type PerformanceStat = typeof PERFORMANCE_STATS[number];
export type PlayerPerformance = {
  identity: string; position: LegendPosition; number: number;
  stats: Partial<Record<PerformanceStat, number>>;
};
export type ChampionshipPerformance = {
  version: 1; gameId: string; coverage: 'full-game';
  players: Partial<Record<Side, Record<string, PlayerPerformance>>>;
};
export function recordLegendStat(g: FootballGame, side: Side, legend: Legend | undefined,
  metric: PerformanceStat, value = 1) {
  const p = g.franchise?.performance;
  if (!p || !legend || !Number.isFinite(value) || value === 0) return;
  const rows = p.players[side] ??= {}, key = `${legend.identity}/${legend.position}`;
  const row = rows[key] ??= { identity: legend.identity, position: legend.position, number: legend.number, stats: {} };
  row.stats[metric] = (row.stats[metric] ?? 0) + value;
}
/** Only measured, attributable events enter this ledger. No RNG or ratings. */
export function performanceScore(s: PlayerPerformance['stats']) {
  const n = (k: PerformanceStat) => s[k] ?? 0;
  return n('passingYards') * .04 + n('passingTD') * 4 + n('completions') * .1
    - n('interceptionsThrown') * 5 + n('rushingYards') * .1 + n('rushingTD') * 6
    + n('receivingYards') * .1 + n('receptions') * .5 + n('receivingTD') * 6
    + n('tackles') + n('sacks') * 3 + n('interceptions') * 7 + n('forcedFumbles') * 4
    + n('recoveries') * 4 + n('defensiveTD') * 9 + n('returnYards') * .07
    + n('returnTD') * 8 + n('fieldGoals') * 3 - n('fumblesLost') * 4 + n('passBreakups') * 1.5;
}
const METRIC_LABELS: Partial<Record<PerformanceStat, string>> = {
  passingYards: 'pass yd', passingTD: 'pass TD', interceptionsThrown: 'INT thrown',
  rushingYards: 'rush yd', rushingTD: 'rush TD', receivingYards: 'rec yd',
  receptions: 'catches', receivingTD: 'rec TD', tackles: 'tackles', sacks: 'sacks',
  interceptions: 'INT', forcedFumbles: 'forced fumbles', recoveries: 'recoveries',
  defensiveTD: 'defensive TD', returnYards: 'return yd', returnTD: 'return TD',
  fieldGoals: 'FG', fumblesLost: 'fumbles lost',
  passBreakups: 'pass breakups',
};
export function performanceSummary(s: PlayerPerformance['stats']) {
  const values = Object.entries(METRIC_LABELS).flatMap(([key, label]) => {
    const v = s[key as PerformanceStat];
    return v ? [`${Number(v.toFixed(1))} ${label}`] : [];
  });
  if (s.attempts) values.unshift(`${s.completions ?? 0}/${s.attempts} passing`);
  return values.join(' · ');
}
export function selectChampionshipMvp(g: FootballGame) {
  const p = g.franchise?.performance;
  if (!g.winner || !p || p.coverage !== 'full-game' || p.gameId !== g.franchise?.gameId)
    return { reason: 'Individual Super Cup statistics unavailable; no MVP was invented.' } as const;
  const team = g.winner === 'home' ? g.teams.player : g.teams.opponent;
  const candidates = new Map<string, { legend: Legend; stats: PlayerPerformance['stats']; roleScore: number }>();
  for (const row of Object.values(p.players[g.winner] ?? {})) {
    const legend = legendaryPlayer(team, row.position);
    if (!legend || legend.identity !== row.identity || legend.number !== row.number) continue;
    const score = performanceScore(row.stats), existing = candidates.get(row.identity);
    if (!existing) candidates.set(row.identity, { legend, stats: { ...row.stats }, roleScore: score });
    else {
      for (const k of PERFORMANCE_STATS) existing.stats[k] = (existing.stats[k] ?? 0) + (row.stats[k] ?? 0);
      if (score > existing.roleScore) { existing.legend = legend; existing.roleScore = score; }
    }
  }
  const ranked = [...candidates.values()].sort((a, b) => {
    const delta = performanceScore(b.stats) - performanceScore(a.stats);
    return Math.abs(delta) > 1e-9 ? delta : a.legend.identity < b.legend.identity ? -1 : a.legend.identity > b.legend.identity ? 1 : 0;
  });
  const best = ranked[0];
  if (!best || performanceScore(best.stats) <= 0)
    return { reason: 'No winning legend recorded an eligible positive contribution; no MVP awarded.' } as const;
  return { award: { team, slot: rewardSlot(best.legend.position), legendId: best.legend.identity,
    position: best.legend.position, number: best.legend.number, performance: performanceSummary(best.stats) } } as const;
}

/** Capture identities before the engine can change possession or clear a play. */
export function capturePerformance(g: FootballGame) {
  if (!g.franchise?.performance) return;
  const live = g.live, special = g.special, offense = live?.offense ?? g.possession;
  const players = special?.athletes ?? live?.athletes ?? [];
  return { phase: g.phase, mode: live?.mode, offense, attemptPhase: g.returnAttempt?.phase,
    carrier: live?.carrier, rusher: live?.rusher, caught: live?.passCaught, deflected: !!live?.flight?.deflected,
    loose: live?.loose ? { ...live.loose } : undefined,
    returnKind: live?.returnKind, turnoverSpot: live?.turnoverSpot, returnStartX: live?.interception?.catchX,
    live, special, attempt: g.returnAttempt, scene: g.tackleScene,
    stats: { home: { ...g.stats.home }, away: { ...g.stats.away } },
    legends: new Map(players.map(a => [a.id, legendaryAthlete(g, a)])),
  };
}
export function observePerformance(g: FootballGame, before: ReturnType<typeof capturePerformance>) {
  if (!before) return;
  const { offense, legends, live, special } = before;
  const team = (side: Side) => side === 'home' ? g.teams.player : g.teams.opponent;
  const add = (side: Side, id: number | undefined, metric: PerformanceStat, value = 1) =>
    recordLegendStat(g, side, id === undefined ? undefined : legends.get(id), metric, value);
  const role = (side: Side, position: LegendPosition, metric: PerformanceStat, value: number) =>
    recordLegendStat(g, side, legendaryPlayer(team(side), position), metric, value);
  for (const side of ['home', 'away'] as const) {
    const delta = (k: keyof FootballGame['stats']['home']) => g.stats[side][k] - before.stats[side][k];
    if (delta('attempts')) role(side, 'QB', 'attempts', delta('attempts'));
    if (delta('completions')) {
      role(side, 'QB', 'completions', delta('completions'));
      add(side, g.live?.carrier, 'receptions', delta('completions'));
    }
    if (delta('passYards')) {
      role(side, 'QB', 'passingYards', delta('passYards'));
      add(side, delta('completions') ? live?.carrier : before.rusher ?? before.carrier, 'receivingYards', delta('passYards'));
    }
    // A sack is a team rushing loss, not a rushing attempt by the QB.
    if (delta('rushYards') && live && before.mode !== 'return' && !special && !delta('sacks'))
      add(side, before.rusher ?? before.carrier, 'rushingYards', delta('rushYards'));
    if (delta('fieldGoals')) role(side, 'K', 'fieldGoals', delta('fieldGoals'));
    if (delta('sacks')) add(other(side), g.tackleScene?.defender.id, 'sacks', delta('sacks'));
    if (delta('touchdowns')) {
      if (special) add(side, special.returner, side === special.kicking ? 'defensiveTD' : 'returnTD', delta('touchdowns'));
      else if (before.phase === 'kickoff') role(side, 'KR', 'returnTD', delta('touchdowns'));
      else if (before.mode === 'return') add(side, before.carrier, 'defensiveTD', delta('touchdowns'));
      else if (live?.passCaught) {
        role(side, 'QB', 'passingTD', delta('touchdowns'));
        add(side, delta('completions') ? live.carrier : before.rusher ?? before.carrier, 'receivingTD', delta('touchdowns'));
      } else add(side, before.rusher ?? before.carrier, 'rushingTD', delta('touchdowns'));
    }
  }
  if (!before.scene && g.tackleScene)
    add(g.tackleScene.defender.team, g.tackleScene.defender.id, 'tackles');
  if (live && before.mode !== 'return' && live.mode === 'return') {
    if (live.returnKind === 'interception') {
      role(offense, 'QB', 'interceptionsThrown', 1);
      add(other(offense), live.carrier, 'interceptions');
    }
  }
  if (!before.deflected && live?.flight?.deflected)
    add(other(offense), live.flight.contested?.at(-1), 'passBreakups');
  if (before.mode === 'loose' && before.loose && live &&
      (live.mode === 'return' || before.phase === 'live' && g.phase !== 'live')) {
    const id = live.loose?.recoverer ?? before.loose.recoverer;
    const actor = live.athletes.find(a => a.id === id);
    if (actor) {
      const side = actor.side === 'offense' ? offense : other(offense);
      add(side, id, 'recoveries');
      if (before.loose.owner && side !== before.loose.owner)
        add(before.loose.owner, before.loose.lostBy, 'fumblesLost');
    }
  }
  if (before.mode === 'return' && live && before.returnStartX !== undefined &&
      (live.mode === 'loose' || before.phase === 'live' && g.phase !== 'live')) {
    const carrier = live.athletes.find(a => a.id === before.carrier);
    if (carrier) add(carrier.side === 'offense' ? offense : other(offense),
      carrier.id, 'returnYards', (before.returnStartX - carrier.x) / 10);
  }
  // Return yards are measured once at the dead ball, not accumulated for
  // zig-zagging or walking backward and forward.
  if (g.returnAttempt && before.attemptPhase === 'returning' && g.returnAttempt.phase !== 'returning') {
    const side = special?.returnSide ?? special?.receiver ?? g.kickReceiver;
    const yards = (g.returnAttempt.player.x - g.returnAttempt.landing.x) / 10;
    if (special) add(side, special.returner, 'returnYards', yards);
    else role(side, 'KR', 'returnYards', yards);
  }
}
