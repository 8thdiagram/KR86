import { DEFENSE_IDS, isBlitz, type FootballGame } from './types';
import { isKickMatchup } from '../kick-return-teams';
import { beginPlayResult } from './play-result';
import { inFootballFrame } from './direction';
import { franchiseFactor } from './franchise-upgrades';
import { MVP_IDS, type MvpCounts } from './mvp';
import { SPECIAL_EXECUTION_SPEED } from './clutch';
import { validCoaching } from './coaching-validation';
import { validExpandedPlaybook } from './playbook-validation';
import { readSlot, writeSlot } from '../../../platform/local-save';

/** New full games never overwrite Classic returns, assessment evidence or public rankings. */
export function saveFootball(_scope: string, game: FootballGame): boolean {
  return writeSlot('fullGame', game);
}
export function clearFootball(_scope: string) { if (!writeSlot('fullGame', null)) throw new Error('Device save could not be cleared.'); }
export function isFootballGame(value: unknown): value is FootballGame {
  if (!value || typeof value !== 'object') return false;
  const g = value as FootballGame;
  if (!validCoaching(g)||!validExpandedPlaybook(g)) return false;
  if (g.clutchActive !== undefined && typeof g.clutchActive !== 'boolean') return false;
  const validAwards = (a: MvpCounts) => MVP_IDS.every(slot =>
    (slot === 'LB1' || slot === 'K1') && a[slot] === undefined ||
    Number.isSafeInteger(a[slot]) && a[slot]! >= 0);
  if (g.franchise && (typeof g.franchise.gameId !== 'string' || g.franchise.gameId.length > 240 ||
      !g.franchise.awards || !validAwards(g.franchise.awards))) return false;
  if (g.franchise?.opponentAwards && !validAwards(g.franchise.opponentAwards)) return false;
  const playoff = g.franchise?.playoff;
  if (playoff !== undefined && (!playoff || !Number.isSafeInteger(playoff.season) || playoff.season < 1 ||
      playoff.year !== 1985 + playoff.season || !Number.isInteger(playoff.round) || playoff.round < 0 || playoff.round > 3)) return false;
  if (g.homeOddDirection !== undefined && ![-1, 1].includes(g.homeOddDirection)) return false;
  if (g.fieldFrame !== undefined && ![-1, 1].includes(g.fieldFrame)) return false;
  if (g.live?.fieldFrame !== undefined && g.live.fieldFrame !== -1) return false;
  if (g.sideSwitch && (!Number.isFinite(g.sideSwitch.remaining) || g.sideSwitch.remaining < 0 ||
      g.sideSwitch.remaining > .85 || g.sideSwitch.quarter !== g.quarter || g.playClockRunning)) return false;
  const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  const validRamp = (a: { openFieldAge?: unknown }) => a.openFieldAge === undefined ||
    finite(a.openFieldAge) && (a.openFieldAge as number) >= 0 && (a.openFieldAge as number) <= .800001;
  const validLoose = (b: NonNullable<FootballGame['live']>['loose'], actors: { id: number }[]) => !b ||
    [b.x, b.y, b.time].every(finite) && b.time >= 0 && b.time <= 60 &&
    [b.z, b.vx, b.vy, b.originX, b.originY, b.secure, b.fromX, b.fromY].every(n => n === undefined || finite(n)) &&
    (b.recoverer === undefined || Number.isInteger(b.recoverer) && actors.some(a => a.id === b.recoverer)) &&
    (b.kind === undefined || ['fumble', 'muff', 'block'].includes(b.kind)) &&
    (b.owner === undefined || ['home', 'away'].includes(b.owner)) &&
    (b.lostBy === undefined || Number.isInteger(b.lostBy) && actors.some(a => a.id === b.lostBy)) &&
    (b.variant === undefined || finite(b.variant) && b.variant >= 0 && b.variant < 1);
  if (g.rareEvents !== undefined && (!g.rareEvents || typeof g.rareEvents !== 'object' ||
      !Object.entries(g.rareEvents).every(([key, n]) =>
        ['fumbles', 'kickoffMuffs', 'puntMuffs', 'blockedPunts', 'blockedFieldGoals'].includes(key) &&
        Number.isSafeInteger(n) && n >= 0))) return false;
  if (g.secondary !== undefined && (!g.secondary ||
      !(['home', 'away'] as const).every(side => Array.isArray(g.secondary![side]) &&
        g.secondary![side].length >= 1 && g.secondary![side].length <= 2 &&
        new Set(g.secondary![side]).size === g.secondary![side].length &&
        g.secondary![side].every(slot => Number.isInteger(slot) && slot >= 0 && slot <= 2)))) return false;
  if (g.returnAttempt?.fullCoverage !== undefined) {
    const a = g.returnAttempt;
    if (!a.fullCoverage || typeof a.fullCoverage !== 'object' || !validRamp(a.fullCoverage)) return false;
    if (a.pursuitVersion !== undefined && a.pursuitVersion !== 1) return false;
    const slots = a.fullCoverage.elite;
    const returnSide = g.special?.returnSide ?? g.special?.receiver ?? g.kickReceiver;
    const validFactor = (value: number, slot: 'KR1' | 'DB1', side: 'home' | 'away') =>
      value === franchiseFactor(g, slot, side) || g.clutchActive === undefined &&
      value === 1 + .2 * ((side === 'home' ? g.franchise?.awards : g.franchise?.opponentAwards)?.[slot] ?? 0);
    if (a.fullCoverage.executionSpeed !== undefined && ![1, SPECIAL_EXECUTION_SPEED].includes(a.fullCoverage.executionSpeed)) return false;
    if (a.fullCoverage.returnSpeed !== undefined && a.fullCoverage.returnSpeed !== 1 &&
        (!g.franchise || !validFactor(a.fullCoverage.returnSpeed, 'KR1', returnSide))) return false;
    if (a.fullCoverage.defenderSpeed && (!g.franchise ||
        !validFactor(a.fullCoverage.defenderSpeed.factor, 'DB1', returnSide === 'home' ? 'away' : 'home') ||
        !a.defenders.some(d => d.id === a.fullCoverage!.defenderSpeed!.id))) return false;
    if (a.fullCoverage.speedMatch !== undefined &&
        (!Number.isSafeInteger(a.fullCoverage.speedMatch) ||
         !a.defenders.some(d => d.id === a.fullCoverage!.speedMatch) ||
         g.special && !['full', 'squib', 'onside'].includes(g.special.kind))) return false;
    if (!slots || !Array.isArray(slots) || slots.length < 1 || slots.length > 2 ||
        new Set(slots).size !== slots.length || !slots.every(id => Number.isInteger(id) &&
          id >= 0 && a.defenders.some(d => d.id === id))) return false;
    if (a.fullCoverage.extraSpeedMatch !== undefined &&
        (a.pursuitVersion !== 1 || !Number.isSafeInteger(a.fullCoverage.extraSpeedMatch) ||
         a.fullCoverage.speedMatch === undefined || a.fullCoverage.extraSpeedMatch === a.fullCoverage.speedMatch ||
         slots.includes(a.fullCoverage.extraSpeedMatch) ||
         !a.defenders.some(d => d.id === a.fullCoverage!.extraSpeedMatch) ||
         g.special && !['full', 'squib', 'onside'].includes(g.special.kind))) return false;
    // A legitimate exceptional-execution burst also affects elite coverage.
    // Retain bounded speeds and award attribution, but do not reject a burst
    // above the historical unboosted ceiling (including its final saved frame).
    const executionLimit = g.clutchActive === undefined ? 1 : SPECIAL_EXECUTION_SPEED;
    if (!a.defenders.every(d => finite(d.x) && finite(d.y) && finite(d.speed) && finite(d.lateralSpeed) &&
        d.speed > 0 && d.speed <= 82 * executionLimit * (a.fullCoverage?.defenderSpeed?.id === d.id ? a.fullCoverage.defenderSpeed.factor : 1) &&
        d.lateralSpeed > 0 && d.lateralSpeed <= 97 * executionLimit * (a.fullCoverage?.defenderSpeed?.id === d.id ? a.fullCoverage.defenderSpeed.factor : 1) &&
        (!d.motion || [d.motion.vx, d.motion.vy, d.motion.targetX, d.motion.targetY,
          d.motion.reactionLeft, d.motion.stride].every(finite)))) return false;
  }
  const validDive = (d: NonNullable<FootballGame['live']>['athletes'][number]['dive']) => !d ||
    ['windup', 'airborne', 'grounded', 'recovering'].includes(d.phase) &&
    [d.elapsed, d.vx, d.vy, d.angle].every(finite) && d.elapsed >= 0 &&
    d.elapsed <= 1.1 && Math.hypot(d.vx, d.vy) <= 170.001;
  if ([g.kickSounds, g.tackleSounds].some(n => n !== undefined && (!Number.isSafeInteger(n) || n < 0))) return false;
  if (g.quarterSeconds !== undefined && (g.quarterSeconds !== 120 || g.clock > 120)) return false;
  if (g.tackleScene) {
    const s = g.tackleScene;
    if (g.phase !== 'play-dead' || !['scrimmage', 'special', 'legacy-return'].includes(s.space) ||
        !['impact', 'fall', 'ground'].includes(s.phase) || !finite(s.elapsed) || s.elapsed < 0 ||
        s.elapsed > (s.phase === 'impact' ? .09 : s.phase === 'fall' ? .27 : 0) ||
        !finite(s.holdRemaining) || s.holdRemaining < 0 || s.holdRemaining > 1 ||
        (s.phase !== 'ground' && s.holdRemaining !== 0) || ![-1, 1].includes(s.direction) ||
        ![s.carrier, s.defender].every(a => a && Number.isInteger(a.id) &&
          ['home', 'away'].includes(a.team) && [a.x, a.y, a.vx, a.vy].every(finite)) ||
        s.carrier.team === s.defender.team || s.carrier.id === s.defender.id) return false;
  }
  if (g.version !== 'football-1' || !isKickMatchup(g.teams) || !Number.isInteger(g.seed) || !Number.isInteger(g.rng) ||
      !['coin-toss', 'kickoff-choice', 'kickoff', 'play-call', 'pre-snap', 'live', 'play-dead', 'penalty', 'halftime', 'overtime-toss', 'final'].includes(g.phase) ||
      !['home', 'away'].includes(g.possession) || !Number.isInteger(g.quarter) || g.quarter < 1 || g.quarter > 5 ||
      !finite(g.clock) || g.clock < 0 || g.clock > 180 || !finite(g.spot) || g.spot < 0 || g.spot > 100 ||
      !Number.isInteger(g.down) || g.down < 1 || g.down > 4 || !finite(g.target) || g.target < 0 || g.target > 100 ||
      !Array.isArray(g.history) || g.history.length > 180 || !Array.isArray(g.cpuLast) || !g.defensiveCalls || !Object.values(g.defensiveCalls).every(finite) || !finite(g.totalTime) ||
      !g.score || !g.timeouts || !g.stats || !g.profiles) return false;
  for (const side of ['home', 'away'] as const) {
    if (!Number.isInteger(g.score[side]) || g.score[side] < 0 || !Number.isInteger(g.timeouts[side]) || g.timeouts[side] < 0 || g.timeouts[side] > 2 ||
        !g.stats[side] || !g.profiles[side] || !Object.values(g.stats[side]).every(finite) || !Object.values(g.profiles[side]).every(v => typeof v === 'string' || finite(v))) return false;
  }
  if (g.phase === 'kickoff' && !g.special && (!g.returnAttempt || !finite(g.returnAttempt.player?.x) || !finite(g.returnAttempt.player?.y) || !Array.isArray(g.returnAttempt.defenders))) return false;
  if (g.phase === 'live' || g.phase === 'pre-snap') {
    const l = g.live;
    if (l?.carrierCrossedLos !== undefined && typeof l.carrierCrossedLos !== 'boolean') return false;
    if (!l || !Array.isArray(l.athletes) || ![14, 22].includes(l.athletes.length) || !finite(l.time) ||
        !l.athletes.every(a => finite(a.x) && finite(a.y) && validDive(a.dive)) || !l.movement || !finite(l.movement.player?.x) ||
        !Number.isInteger(l.carrier) || l.carrier < 0 || l.carrier >= l.athletes.length ||
        l.athletes[l.carrier]?.side !== (l.mode === 'return' || l.mode === 'loose' && l.loose?.owner !== undefined &&
          l.loose.owner !== (l.offense ?? g.possession) ? 'defense' : 'offense')) return false;
    if (!validLoose(l.loose, l.athletes) || l.mode === 'loose' && !l.loose ||
        l.turnoverSpot !== undefined && (!finite(l.turnoverSpot) || l.turnoverSpot < -15 || l.turnoverSpot > 100) ||
        l.returnKind !== undefined && !['fumble', 'interception'].includes(l.returnKind) ||
        l.executionRead !== undefined && (!Number.isInteger(l.executionRead) || l.athletes[l.executionRead]?.role !== 'DB') ||
        l.executionSeed !== undefined && (!Number.isInteger(l.executionSeed) || l.executionSeed < 0 || l.executionSeed > 0xffffffff) ||
        !l.athletes.every(a => a.coverageHesitated === undefined || typeof a.coverageHesitated === 'boolean') ||
        !l.athletes.every(a => a.runSeal === undefined || a.runSeal && typeof a.runSeal === 'object' &&
          l.athletes[a.runSeal.defender]?.side === 'defense' && [-1, 1].includes(a.runSeal.side) &&
          finite(a.runSeal.starts) && finite(a.runSeal.until) && a.runSeal.starts >= 0 &&
          a.runSeal.until >= a.runSeal.starts && a.runSeal.until - a.runSeal.starts <= .43) ||
        !l.athletes.every(a => validRamp(a as typeof a & { openFieldAge?: number }))) return false;
    if ([l.defensiveActionAt, l.cpuActionAt].some(t => t !== undefined && (!finite(t) || t < 0))) return false;
    if (!(DEFENSE_IDS as readonly string[]).includes(l.defense)) return false;
    if (l.lineRush !== undefined) {
      const r = l.lineRush;
      if (!r || r.checked !== true || l.time < 3 || !Array.isArray(r.winners) || r.winners.length > 3 ||
          new Set(r.winners.map(w => w?.defender)).size !== r.winners.length ||
          !r.winners.every(w => w && Number.isInteger(w.defender) &&
            l.athletes[w.defender]?.side === 'defense' && l.athletes[w.defender]?.role === 'DL' &&
            finite(w.escapeY) && w.escapeY >= 25 && w.escapeY <= 167 &&
            (w.cleared === undefined || typeof w.cleared === 'boolean'))) return false;
    }
    if (l.penetration !== undefined) {
      const p = l.penetration, e = p?.event;
      if (!p || ![p.roll, p.selection, p.recognition].every(n => finite(n) && n >= 0 && n < 1)) return false;
      if (p.event !== undefined && (!p.event || typeof p.event !== 'object')) return false;
      if (e && (!['line', 'blitz'].includes(e.kind) || ![-1, 1].includes(e.side) ||
          !Number.isInteger(e.defender) || !Number.isInteger(e.blocker) ||
          !['DL', 'LB'].includes(l.athletes[e.defender]?.role ?? '') ||
          l.athletes[e.defender]?.side !== 'defense' || l.athletes[e.blocker]?.role !== 'OL' ||
          l.athletes[e.blocker]?.side !== 'offense' || e.kind === 'blitz' && !isBlitz(l.defense) ||
          ![e.at, e.fooledUntil, e.escapeX, e.escapeY].every(n => finite(n) && n >= 0) ||
          [e.stageX, e.entryDue].some(n => n !== undefined && (!finite(n) || n < 0)) ||
          e.at > l.time ||
          [e.cleared, e.entered].some(t => t !== undefined && (!finite(t) || t < e.at || t > l.time)))) return false;
    }
    if (!l.athletes.every(a => !a.defensiveAttempt ||
        ['tackle', 'intercept', 'recover'].includes(a.defensiveAttempt.kind) &&
        finite(a.defensiveAttempt.at) && a.defensiveAttempt.at >= 0 &&
        (a.defensiveAttempt.ideal === undefined || typeof a.defensiveAttempt.ideal === 'boolean') &&
        (a.defensiveAttempt.resolved === undefined || typeof a.defensiveAttempt.resolved === 'boolean'))) return false;
    if (l.flight?.attempted !== undefined && (!Array.isArray(l.flight.attempted) ||
        l.flight.attempted.some(id => !Number.isInteger(id) || l.athletes[id]?.side !== 'defense') ||
        new Set(l.flight.attempted).size !== l.flight.attempted.length)) return false;
    if (l.flight?.deflected) {
      const b = l.flight.deflected;
      if (![b.age, b.x, b.y, b.z, b.toX, b.toY].every(finite) || b.age < 0 || b.age > .24 ||
          !['BULLET DEFLECTED IN THE LANE', 'DIVING PASS BREAKUP'].includes(b.detail)) return false;
    }
    if (l.mode === 'return' && (!l.interception || !finite(l.interception.age) || l.interception.age < 0 ||
        !Number.isInteger(l.interception.catcher) || l.athletes[l.interception.catcher]?.side !== 'defense' ||
        !finite(l.interception.catchX) || !finite(l.interception.catchY))) return false;
    if (l.snapAge !== undefined && (!finite(l.snapAge) || l.snapAge < 0 || l.snapAge > .18)) return false;
  }
  if (g.phase === 'pre-snap' && !g.pendingSnap) return false;
  if (g.special) {
    const s = g.special;
    if (!['full', 'squib', 'onside', 'punt', 'field-goal'].includes(s.kind) ||
        !['lineup', 'snap', 'hold', 'approach', 'flight', 'bounce', 'recovery', 'return', 'loose', 'resolved'].includes(s.stage) ||
        ![s.age, s.stageAge, s.fromX, s.fromY, s.toX, s.toY, s.duration, s.ball?.x, s.ball?.y, s.ball?.z].every(finite) ||
        s.age < 0 || s.stageAge < 0 || s.duration <= 0 ||
        !['home', 'away'].includes(s.receiver) || !['home', 'away'].includes(s.kicking) || s.receiver === s.kicking ||
        !Array.isArray(s.athletes) || ![14, 22].includes(s.athletes.length) ||
        !s.athletes.every((a, i) => a.id === i && finite(a.x) && finite(a.y)) ||
        !Number.isInteger(s.kicker) || s.kicker < 0 || s.kicker >= s.athletes.length ||
        !Number.isInteger(s.returner) || s.returner < 0 || s.returner >= s.athletes.length) return false;
    if (!validLoose(s.loose, s.athletes) || s.stage === 'loose' && (!s.loose || s.loose.recoverer === undefined) ||
        s.returnSide !== undefined && !['home', 'away'].includes(s.returnSide) ||
        s.returnGroup !== undefined && !['offense', 'defense'].includes(s.returnGroup) ||
        [s.mirrored, s.receptionChecked, s.blockChecked, s.scrimmageReturn].some(v => v !== undefined && typeof v !== 'boolean') ||
        s.rareOrigin !== undefined && !['muff', 'fumble', 'block'].includes(s.rareOrigin)) return false;
    if (s.blockAttempt && (!Number.isInteger(s.blockAttempt.defender) ||
        s.athletes[s.blockAttempt.defender]?.side !== 'defense' ||
        ![-1, 1].includes(s.blockAttempt.side) ||
        [s.blockAttempt.cleared, s.blockAttempt.contacted, s.blockAttempt.tested].some(v => v !== undefined && typeof v !== 'boolean'))) return false;
    if (s.recovery !== undefined && (!Number.isInteger(s.recovery) || s.recovery < 0 || s.recovery >= s.athletes.length ||
        !s.recoveryFrom || !finite(s.recoveryFrom.x) || !finite(s.recoveryFrom.y))) return false;
    if (s.stage === 'recovery' && s.recovery === undefined) return false;
    if (s.stage === 'return' && (!g.returnAttempt || !finite(g.returnAttempt.player?.x) || !finite(g.returnAttempt.player?.y))) return false;
  }
  if (g.returnAttempt?.kickoffBoost !== undefined && g.returnAttempt.kickoffBoost !== 1.04) return false;
  if (g.playClock !== undefined && (!finite(g.playClock) || g.playClock < 0 || g.playClock > 15)) return false;
  if (g.playResult && (!['play-dead', 'penalty', 'final'].includes(g.phase) ||
      !finite(g.playResult.remaining) || g.playResult.remaining < 0 || g.playResult.remaining > 1 ||
      typeof g.playResult.text !== 'string' || !g.playResult.text.trim() || g.playResult.text.length > 300 ||
      g.playClockRunning)) return false;
  if (g.playClockRunning !== undefined && typeof g.playClockRunning !== 'boolean') return false;
  if (g.turnoverNotice !== undefined && (!finite(g.turnoverNotice) || g.turnoverNotice < 0 || g.turnoverNotice > .85)) return false;
  if (g.pendingSnap && (!finite(g.pendingSnap.remaining) || g.pendingSnap.remaining < 0 ||
      g.pendingSnap.remaining > 1.2 || !(DEFENSE_IDS as readonly string[]).includes(g.pendingSnap.defense) ||
      !['power','sweep','counter','draw','sneak','slant','screen','out','cross','post','verticals','play-action','flood','speed-option','punt','fake-punt','field-goal'].includes(g.pendingSnap.play))) return false;
  if (g.phase === 'penalty' && (!g.delayPenalty || !finite(g.delayPenalty.remaining) ||
      g.delayPenalty.remaining < 0 || g.delayPenalty.remaining > 1.25 || !finite(g.delayPenalty.yards) ||
      g.delayPenalty.yards < 0 || g.delayPenalty.yards > 5 || !['home', 'away'].includes(g.delayPenalty.offense))) return false;
  if (g.clockStoppage !== undefined && !['incomplete', 'out-of-bounds', 'timeout', 'possession', 'score', 'penalty', 'quarter-transition'].includes(g.clockStoppage)) return false;
  if (g.cpuTimeoutPlay !== undefined && (!Number.isSafeInteger(g.cpuTimeoutPlay) || g.cpuTimeoutPlay < 0 || g.cpuTimeoutPlay > g.plays)) return false;
  return true;
}
export function loadFootball(_scope: string): FootballGame | null {
  const g: unknown = readSlot('fullGame');
  if (!g) return null;
  if (!isFootballGame(g)) throw new Error('This saved match cannot be read by this version. It has not been replaced.');
  // Historical three-minute matches preserve the fraction of the current quarter
  // remaining, all play positions and history. Mark once; never rescale on each load.
  if (g.quarterSeconds === undefined) {
    if (!g.overtime) g.clock *= 2 / 3;
    g.quarterSeconds = 120;
  }
  // Old saves gain the amended result display once; new partial countdowns
  // retain their exact saved remainder rather than restarting on every load.
  if (!g.playResult && (g.tackleScene || g.phase === 'play-dead' || g.phase === 'penalty')) {
    beginPlayResult(g, g.lastResult || g.message || 'PLAY OVER');
    if (g.tackleScene?.phase === 'ground') g.tackleScene.holdRemaining = 1;
  }
  // Historical snapshots contain offense-local coordinates; adopt the actual
  // stadium frame once without changing their outcome, yardage or RNG.
  if (g.homeOddDirection === undefined) {
    g.homeOddDirection = 1;
    inFootballFrame(g, () => {});
  }
  return g;
}
