import { stepKickAttempt, kickWitnessDirection, KR } from '../kick-return-engine';
import { createKickMatchup, isKickMatchup } from '../kick-return-teams';
import { cpuDefense, cpuPlay, defensiveChoices, fieldGoalAllowed, fieldGoalDistance, offensiveChoices, eligibleOffensivePlays, PLAYBOOK, teamProfile } from './playbook';
import { startField, stepField, type FieldResult } from './field';
import { kickoffSequence, puntSequence, fieldGoalSequence, stepSpecialTeams, specialBallLive, type SpecialResult } from './special-teams';
import { clamp, other, random, type Defense, type FootballGame, type FootballInput, type FootballStats, type PlayId, type Side } from './types';
import { captureFieldTackle, captureReturnTackle, stepTackleScene } from './tackle-scene';
import { secondaryRoster } from './secondary';
import { beginPlayResult, fieldResultText, specialResultText } from './play-result';
import { FIELD_GOAL_FLIGHT_SCALE } from './celebration-timing';
import { inFootballFrame } from './direction';
import { defensivePanicTarget } from './defensive-panic';
import { cpuDefensivePanicTarget } from './cpu-defensive-panic';
import { startNearestDive } from './defensive-action';
import { FOOTBALL_SIDELINES } from './sidelines';
import { lockClutch } from './clutch';
import { effectiveKickControl as franchiseKickControl } from './franchise-upgrades';
import { recordCoaching } from './coaching';
import { creditRusher } from './rushing-credit';
import { capturePerformance, observePerformance } from './mvp-performance';
export * from './types';
export * from './playbook';

const freshStats = (): FootballStats => ({ plays: 0, rushYards: 0, passYards: 0, completions: 0, attempts: 0, sacks: 0, turnovers: 0, firstDowns: 0, touchdowns: 0, fieldGoals: 0, punts: 0, possession: 0 });
export const FULL_GAME_SPEED = .82;
export const PLAY_CLOCK_SECONDS = 15;
export const QUARTER_SECONDS = 120;
export const CPU_SNAP_SECONDS = 1.2;
export const isFootballReady = (g: FootballGame) => !g.sideSwitch && !g.tackleScene && !g.playResult && (g.phase === 'play-call' || g.phase === 'pre-snap' ||
  g.phase === 'play-dead' && g.nextPhase === 'play-call' && !g.quarterPending);
/** Selection suspension never overwrites an incomplete/OOB/timeout's underlying stop. */
export function footballClockStoppage(g: FootballGame) {
  if (g.sideSwitch) return 'quarter-transition';
  if (!g.clockRunning) return g.clockStoppage ?? 'quarter-transition';
  if (g.tackleScene || g.playResult) return 'result-display';
  if (isFootballReady(g) && g.possession === 'away' && !g.pendingSnap) return 'defensive-selection';
  return undefined;
}
export const canTakeTimeout = (g: FootballGame, side: Side = 'home') =>
  !g.overtime && isFootballReady(g) && !g.quarterPending && g.timeouts[side] > 0;
function stopGameClock(g: FootballGame, reason: NonNullable<FootballGame['clockStoppage']>) {
  g.clockRunning = false; g.clockStoppage = reason;
}
function readyClock(g: FootballGame) {
  if (!isFootballReady(g)) { g.playClockRunning = false; return; }
  if (!g.playClockRunning) { g.playClock = PLAY_CLOCK_SECONDS; g.playClockRunning = true; }
}
export function createFootball(seed: number, teams = createKickMatchup()): FootballGame {
  if (!Number.isSafeInteger(seed) || !isKickMatchup(teams)) throw new Error('Invalid football setup');
  return { version: 'football-1', homeOddDirection: 1, fieldFrame: 1, seed, rng: (seed >>> 0) || 1986, teams,
    profiles: { home: teamProfile(teams.player), away: teamProfile(teams.opponent) },
    secondary: { home: secondaryRoster(seed, teams.player), away: secondaryRoster(seed, teams.opponent) },
    phase: 'coin-toss', quarter: 1, clock: QUARTER_SECONDS, quarterSeconds: QUARTER_SECONDS, possession: 'home', spot: 20, down: 1, target: 30,
    score: { home: 0, away: 0 }, timeouts: { home: 2, away: 2 }, stats: { home: freshStats(), away: freshStats() },
    kickReceiver: 'home', kickKind: 'full', plays: 0, event: 0, message: 'ACTION to toss. The winner defers.', lastResult: '',
    clockRunning: false, clockStoppage: 'quarter-transition', quarterPending: false, nextPhase: 'play-call', playerRuns: 0, playerPasses: 0, defensiveCalls: { run: 0, pass: 0, man: 0, blitz: 0, 'run-blitz': 0, prevent: 0, 'goal-line': 0, contain:0 }, cpuLast: [], history: [], overtime: false, totalTime: 0 };
}
const announce = (g: FootballGame, text: string) => { g.message = text; g.lastResult = text; g.event++; };
const resetDowns = (g: FootballGame) => { g.down = 1; g.target = Math.min(100, g.spot + 10); };
function changePossession(g: FootballGame, at: number) {
  g.possession = other(g.possession); g.spot = clamp(100 - at, 1, 99); resetDowns(g); stopGameClock(g, 'possession');
}
function beginKickoff(g: FootballGame, receiver: Side) {
  g.kickReceiver = receiver; g.kickKind = 'full'; stopGameClock(g, 'possession'); g.returnAttempt = undefined; g.live = undefined;
  g.special = undefined; g.playClockRunning = false; g.pendingSnap = undefined;
  if (receiver === 'away') { g.phase = 'kickoff-choice'; g.message = 'Choose your kickoff.'; }
  else {
    const late = g.quarter >= 4 && g.clock < 70, trailing = g.score.away < g.score.home;
    launchKickoff(g, late && trailing && random(g) < .7 ? 'onside' : late && !trailing && random(g) < .4 ? 'squib' : 'full');
  }
}
function launchKickoff(g: FootballGame, kind: 'full' | 'squib' | 'onside') {
  lockClutch(g);
  g.kickKind = kind;
  g.special = kickoffSequence(g, kind); g.returnAttempt = undefined;
  g.phase = 'kickoff'; g.possession = g.kickReceiver; g.playClockRunning = false;
  g.message = `${kind.toUpperCase()} KICK — TEAMS LINE UP`;
}
function tossFootballLocal(g: FootballGame) {
  if (g.sideSwitch) return;
  if (g.phase === 'coin-toss') {
    const winner: Side = random(g) < .5 ? 'home' : 'away';
    g.openingWinner = winner; g.secondHalfReceiver = winner;
    announce(g, `${winner === 'home' ? g.teams.player : g.teams.opponent} wins the toss and defers.`);
    beginKickoff(g, other(winner));
  } else if (g.phase === 'overtime-toss') {
    const receiver: Side = random(g) < .5 ? 'home' : 'away';
    announce(g, `${receiver === 'home' ? g.teams.player : g.teams.opponent} receives in touchdown-only overtime.`);
    beginKickoff(g, receiver);
  }
}
function chooseKickLocal(g: FootballGame, kind: 'full' | 'squib' | 'onside') {
  if (g.sideSwitch) return;
  if (g.phase !== 'kickoff-choice') return;
  if (!['full', 'squib', 'onside'].includes(kind)) throw new Error('Invalid kick');
  launchKickoff(g, kind);
}
export function chooseOffense(g: FootballGame, id: PlayId) {
  queueOffense(g, id);
}
export function chooseDefense(g: FootballGame, defense: Defense) {
  queueDefense(g, defense);
}
function startSnap(g: FootballGame, id: PlayId, defense: Defense) {
  lockClutch(g);
  g.playClockRunning = false; g.pendingSnap = undefined; g.delayPenalty = undefined;
  g.live = g.phase === 'pre-snap' && g.live?.play === id ? g.live : startField(g, id, defense);
  g.live.snapAge = 0; g.returnAttempt = undefined; g.special = undefined; g.phase = 'live';
  if (id === 'punt') g.special = puntSequence(g);
  if (id === 'field-goal') g.special = fieldGoalSequence(g);
  g.plays++; g.stats[g.possession].plays++; g.clockRunning = true; delete g.clockStoppage;
  g.message = `${PLAYBOOK[id].name.toUpperCase()} · ${defense.toUpperCase()}`;
  if (g.possession === 'home') {
    if (PLAYBOOK[id].kind === 'run') g.playerRuns++;
    if (PLAYBOOK[id].kind === 'pass') g.playerPasses++;
  } else g.defensiveCalls[defense] = (g.defensiveCalls[defense] ?? 0) + 1;
  if (g.possession === 'away') { g.cpuLast.push(id); g.cpuLast = g.cpuLast.slice(-8); }
}
function consumeClock(g: FootballGame, seconds: number) {
  if (g.overtime) return;
  const consumed = Math.min(g.clock, seconds); g.clock = Math.max(0, g.clock - seconds);
  g.stats[g.possession].possession += consumed;
  if (g.clock <= 0) g.quarterPending = true;
}
function finishPeriod(g: FootballGame) {
  g.playClockRunning = false; g.pendingSnap = undefined;
  g.live = undefined; g.special = undefined;
  g.quarterPending = false; stopGameClock(g, 'quarter-transition');
  if (g.quarter === 2) { g.phase = 'halftime'; announce(g, 'HALFTIME — THE TOSS WINNER RECEIVES THE SECOND HALF'); return; }
  if (g.quarter === 4) {
    if (g.score.home === g.score.away) { g.overtime = true; g.quarter = 5; g.phase = 'overtime-toss'; announce(g, 'OVERTIME — FIRST TOUCHDOWN WINS. NO FIELD GOALS.'); }
    else { g.phase = 'final'; g.winner = g.score.home > g.score.away ? 'home' : 'away'; announce(g, 'FINAL WHISTLE'); }
    return;
  }
  g.quarter++; g.clock = QUARTER_SECONDS; g.phase = g.nextPhase;
  if (g.phase === 'kickoff') beginKickoff(g, g.kickReceiver);
  else if (g.phase === 'kickoff-choice') beginKickoff(g, g.kickReceiver);
  else { g.message = `QUARTER ${g.quarter} — TEAMS SWITCH SIDES`; }
  g.sideSwitch = { remaining: .85, quarter: g.quarter }; g.playClockRunning = false;
}
/** Explicit next action keeps completed-play results visible and retry-safe. */
function advanceFootballLocal(g: FootballGame) {
  if (g.sideSwitch || g.tackleScene || g.playResult) return;
  if (g.phase === 'coin-toss' || g.phase === 'overtime-toss') { tossFootball(g); return; }
  if (g.phase === 'halftime') {
    g.quarter = 3; g.clock = QUARTER_SECONDS;
    beginKickoff(g, g.secondHalfReceiver!);
    g.sideSwitch = { remaining: .85, quarter: 3 }; return;
  }
  if (g.phase !== 'play-dead') return;
  if (g.quarterPending) { finishPeriod(g); return; }
  g.live = undefined; g.returnAttempt = undefined; g.special = undefined; g.turnoverNotice = undefined;
  if (g.nextPhase !== 'play-call') beginKickoff(g, g.kickReceiver);
  else { g.phase = 'play-call'; g.message = g.possession === 'home' ? 'CALL YOUR PLAY' : 'CALL YOUR DEFENSE'; readyClock(g); }
}
function takeTimeoutLocal(g: FootballGame, side: Side = 'home'): boolean {
  if (!canTakeTimeout(g, side)) return false;
  g.timeouts[side]--; stopGameClock(g, 'timeout');
  if (side === 'away') g.cpuTimeoutPlay = g.plays;
  g.playClockRunning = false; g.pendingSnap = undefined;
  g.live = undefined; g.special = undefined; g.returnAttempt = undefined; g.turnoverNotice = undefined;
  g.phase = 'play-call'; g.nextPhase = 'play-call';
  readyClock(g); announce(g, `${side === 'home' ? g.teams.player : g.teams.opponent} TIMEOUT`); return true;
}
/** Selection lines up 14 athletes; only a separate human ACTION may snap. */
function queueOffenseLocal(g: FootballGame, id: PlayId) {
  if (!isFootballReady(g) || g.possession !== 'home' || g.pendingSnap || (g.turnoverNotice ?? 0) > 0) return;
  if (g.phase === 'play-dead') advanceFootball(g);
  if (!eligibleOffensivePlays(g).some(p => p.id === id)) throw new Error('That play is not available in this situation');
  readyClock(g);
  g.pendingSnap = { play: id, defense: cpuDefense(g), remaining: .16 };
  g.live = startField(g, id, g.pendingSnap.defense); g.special = undefined;
  g.phase = 'pre-snap'; g.message = 'PRESS ACTION TO SNAP';
}
function queueDefenseLocal(g: FootballGame, defense: Defense) {
  if (!isFootballReady(g) || g.possession !== 'away' || g.pendingSnap || (g.turnoverNotice ?? 0) > 0) return;
  if (!defensiveChoices(g).some(d => d.id === defense)) throw new Error('Invalid defense');
  if (g.phase === 'play-dead') advanceFootball(g);
  readyClock(g); g.pendingSnap = { play: cpuPlay(g), defense, remaining: CPU_SNAP_SECONDS };
  g.live = startField(g, g.pendingSnap.play, defense); g.special = undefined;
  g.phase = 'pre-snap'; g.message = 'DEFENSE SET — WATCH THE SNAP';
}
function snapFootballLocal(g: FootballGame) {
  if (g.phase !== 'pre-snap' || g.possession !== 'home' || !g.pendingSnap) return;
  if ((g.playClock ?? 0) <= 0) { delayOfGame(g); return; }
  const { play, defense } = g.pendingSnap; startSnap(g, play, defense);
}
function delayOfGame(g: FootballGame) {
  const yards = Math.min(5, g.spot / 2);
  g.spot = Math.max(.01, g.spot - yards); stopGameClock(g, 'penalty');
  g.playClock = 0; g.playClockRunning = false; g.pendingSnap = undefined;
  g.live = undefined; g.returnAttempt = undefined; g.special = undefined;
  g.delayPenalty = { remaining: 1.25, yards, offense: g.possession }; g.phase = 'penalty';
  announce(g, `DELAY OF GAME · ${yards < 5 ? 'HALF THE DISTANCE' : '5-YARD PENALTY'} · REPEAT ${g.down} DOWN`);
  beginPlayResult(g, `DELAY OF GAME — ${yards < 5 ? 'HALF THE DISTANCE' : '5 YARDS'}`);
}
/** Elapsed wall time, split at real snap/expiry/penalty boundaries; no frame-count assumptions. */
function advanceFootballReadyLocal(g: FootballGame, elapsed: number) {
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error('Invalid ready-for-play elapsed time');
  if (g.sideSwitch || g.tackleScene || g.playResult) { advanceFootballPresentation(g, elapsed); return; }
  if (g.turnoverNotice !== undefined) g.turnoverNotice = Math.max(0, g.turnoverNotice - elapsed);
  let left = elapsed;
  while (left > 1e-9 && (isFootballReady(g) || g.phase === 'penalty')) {
    if (g.playResult) { advanceFootballPresentation(g, left); return; }
    if (g.phase === 'penalty') {
      const penalty = g.delayPenalty!;
      const used = Math.min(left, penalty.remaining); penalty.remaining -= used; left -= used;
      if (penalty.remaining < 1e-8) { g.delayPenalty = undefined; g.phase = 'play-call'; readyClock(g); }
      continue;
    }
    readyClock(g);
    const cpuDelayRisk = g.possession === 'away' && g.playClock! <= 1 &&
      (g.pendingSnap?.remaining ?? Infinity) >= g.playClock!;
    // Public situation only: no inspection of the human's selected play/formation.
    // Once per completed play prevents burning both timeouts consecutively.
    if (g.cpuTimeoutPlay !== g.plays && (cpuDelayRisk || g.clockRunning && g.clock <= 35 &&
        (g.quarter === 2 || g.quarter === 4) && g.score.away <= g.score.home)) takeTimeout(g, 'away');
    if (g.possession === 'away' && !g.pendingSnap && g.playClock! <= 2.5) queueDefense(g, 'pass');
    const cpuBoundary = g.possession === 'away' && !g.pendingSnap ? Math.max(0, g.playClock! - 2.5) : Infinity;
    const clockRuns = !footballClockStoppage(g);
    if (clockRuns && !g.overtime && g.clock <= 0) g.quarterPending = true;
    const periodBoundary = clockRuns && !g.overtime ? g.clock : Infinity;
    const timeoutBoundary = clockRuns && !g.overtime && (g.quarter === 2 || g.quarter === 4) &&
      g.timeouts.away > 0 && g.cpuTimeoutPlay !== g.plays && g.score.away <= g.score.home && g.clock > 35 ? g.clock - 35 : Infinity;
    const used = Math.min(left, g.playClock!, g.possession === 'away' ? g.pendingSnap?.remaining ?? Infinity : Infinity, cpuBoundary, periodBoundary, timeoutBoundary);
    if (used > 0) {
      if (clockRuns) consumeClock(g, used);
      g.playClock = Math.max(0, g.playClock! - used);
      if (g.pendingSnap && g.possession === 'away') g.pendingSnap.remaining = Math.max(0, g.pendingSnap.remaining - used);
      g.totalTime += used; left -= used;
    }
    if (g.quarterPending) {
      g.nextPhase = 'play-call'; finishPeriod(g); readyClock(g);
      continue;
    }
    if (g.playClock! < 1e-8) { delayOfGame(g); continue; }
    if (g.possession === 'away' && !g.pendingSnap && g.playClock! <= 2.5) queueDefense(g, 'pass');
    const snap = g.pendingSnap;
    if (g.possession === 'away' && snap && snap.remaining < 1e-8) {
      startSnap(g, snap.play, snap.defense);
      return; // The next fixed simulation step begins at the actual snap.
    }
  }
}
/** Presentation cannot consume the next decision clock or accept a skip gesture. */
function advanceFootballPresentationLocal(g: FootballGame, elapsed: number) {
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error('Invalid presentation elapsed time');
  if (g.sideSwitch) {
    g.sideSwitch.remaining = Math.max(0, g.sideSwitch.remaining - elapsed);
    if (g.sideSwitch.remaining < 1e-9) { g.sideSwitch = undefined; readyClock(g); }
    return; // No overshoot charged to a menu/formation not yet painted.
  }
  if (g.tackleScene) {
    let left = elapsed;
    if ((g.turnoverNotice ?? 0) > 0) {
      if (g.tackleScene.phase !== 'ground') { stepTackleScene(g.tackleScene, left, false); return; }
      const used = Math.min(left, g.turnoverNotice!);
      g.turnoverNotice = Math.max(0, g.turnoverNotice! - used); left -= used;
    }
    const done = stepTackleScene(g.tackleScene, left);
    const touchdown = g.playResult?.text.includes('TOUCHDOWN');
    if (g.playResult && !touchdown && g.tackleScene.phase === 'ground') g.playResult.remaining = g.tackleScene.holdRemaining;
    if (!done) return;
    g.tackleScene = undefined;
    if (touchdown && g.playResult) return; // Start its own full visible hold after the ordinary downed-player pause.
  } else if (g.playResult) {
    let left = elapsed;
    if (g.delayPenalty && g.delayPenalty.remaining > 0) {
      const used = Math.min(left, g.delayPenalty.remaining);
      g.delayPenalty.remaining = Math.max(0, g.delayPenalty.remaining - used); left -= used;
    }
    if ((g.turnoverNotice ?? 0) > 0) {
      const used = Math.min(left, g.turnoverNotice!);
      g.turnoverNotice = Math.max(0, g.turnoverNotice! - used); left -= used;
    }
    g.playResult.remaining = Math.max(0, g.playResult.remaining - left);
    if (g.playResult.remaining > 1e-9) return;
  } else return;
  g.playResult = undefined;
  if (g.phase === 'penalty') {
    g.delayPenalty = undefined; g.phase = 'play-dead'; g.nextPhase = 'play-call';
  }
  // Do not charge unused frame time to a menu that has not been painted yet.
  advanceFootball(g);
}
function scoreTouchdown(g: FootballGame) {
  g.score[g.possession] += 7; g.stats[g.possession].touchdowns++;
  stopGameClock(g, 'score'); announce(g, `TOUCHDOWN — ${g.possession === 'home' ? g.teams.player : g.teams.opponent} +7`);
  if (g.overtime) { g.phase = 'final'; g.winner = g.possession; return; }
  g.kickReceiver = other(g.possession); g.nextPhase = g.kickReceiver === 'away' ? 'kickoff-choice' : 'kickoff'; g.phase = 'play-dead';
}
function remember(g: FootballGame, play: string, result: string, gain: number, offense = g.possession) {
  g.history.push({ quarter: g.quarter, clock: Math.round(g.clock), offense, play, result, gain: Math.round(gain * 10) / 10, ...(g.live ? { defense: g.live.defense } : {}) });
  // Bound saved game size, including long overtime games.
  g.history = g.history.slice(-180);
}
function finishField(g: FootballGame, result: FieldResult) {
  const l = g.live!, offense = l.offense ?? g.possession, stat = g.stats[offense];
  // Retain the actual dead-ball lane for Kick View only. This does not move
  // scrimmage formations or change the spot/down/clock. Incompletions retain it.
  if (result.reason !== 'incomplete') {
    const carrier = l.athletes.find(a => a.id === l.carrier);
    if (carrier) g.fieldGoalSpotY = clamp(carrier.y, FOOTBALL_SIDELINES.minY, FOOTBALL_SIDELINES.maxY);
  }
  const originalGainSpot = l.turnoverSpot ?? result.spot;
  const gain = result.reason === 'incomplete' || result.reason === 'interception' ? 0 : originalGainSpot - l.snapSpot;
  const isPass = PLAYBOOK[l.play].kind === 'pass';
  if (PLAYBOOK[l.play].kind !== 'kick') recordCoaching(g,result,isPass ? 'pass' : 'run',PLAYBOOK[l.play].depth);
  const recoveredLoose = result.detail?.startsWith('FUMBLE —');
  if ((result.reason === 'sack' || result.reason === 'tackle') && !recoveredLoose) captureFieldTackle(g);
  if (isPass && l.passCaught) stat.passYards += gain;
  else if (result.reason !== 'interception' && result.reason !== 'incomplete') stat.rushYards += gain;
  creditRusher(g,l,gain,result.reason,result.detail);
  if (result.reason === 'sack') stat.sacks++;
  if ((result.reason === 'sack' || result.reason === 'tackle') && !recoveredLoose) g.tackleSounds = (g.tackleSounds ?? 0) + 1;
  remember(g, PLAYBOOK[l.play].name, result.detail ?? result.reason.toUpperCase(), gain, offense);
  g.phase = 'play-dead'; g.nextPhase = 'play-call';
  g.spot = clamp(result.spot, 0, 100);
  if (result.recovered) {
    stopGameClock(g, 'possession');
    stat.turnovers++; g.stats[other(offense)].turnovers++;
    g.possession = result.recovered; resetDowns(g); announce(g, result.detail ?? 'FUMBLE RECOVERED'); return;
  }
  if (result.reason === 'touchdown') { scoreTouchdown(g); return; }
  if (result.reason === 'safety') {
    // Simplified but coherent safety: two points, conceding side kicks a free kick.
    g.score[other(offense)] += 2; stopGameClock(g, 'score'); g.kickReceiver = other(offense);
    g.nextPhase = g.kickReceiver === 'home' ? 'kickoff' : 'kickoff-choice'; announce(g, 'SAFETY — DEFENSE +2; FREE KICK'); return;
  }
  if (result.reason === 'interception' || result.reason === 'fumble') {
    stat.turnovers++; g.possession = offense; changePossession(g, result.spot);
    if (result.detail === 'INTERCEPTION RETURN TOUCHDOWN' || result.detail === 'FUMBLE RETURN TOUCHDOWN') { g.spot = 100; scoreTouchdown(g); return; }
    if (result.outOfBounds) stopGameClock(g, 'out-of-bounds');
    announce(g, result.detail ?? 'TURNOVER'); return;
  }
  if (result.reason === 'incomplete') g.spot = l.snapSpot;
  if (g.spot + .0001 >= g.target) { stat.firstDowns++; resetDowns(g); announce(g, g.target === 100 ? 'FIRST AND GOAL' : 'FIRST DOWN'); }
  else {
    g.down++;
    if (g.down > 4) {
      changePossession(g, g.spot);
      if (result.reason === 'incomplete' || result.reason === 'out-of-bounds') stopGameClock(g, result.reason);
      g.turnoverNotice = .85; announce(g, 'TURNOVER ON DOWNS'); return;
    }
    announce(g, `${result.detail ?? result.reason.toUpperCase()} · ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} YARDS`);
  }
  if (result.reason === 'incomplete' || result.reason === 'out-of-bounds') stopGameClock(g, result.reason);
  else { g.clockRunning = true; delete g.clockStoppage; }
}
function stepKickPlay(g: FootballGame, input: FootballInput, dt: number) {
  const l = g.live!, distance = fieldGoalDistance(g);
  // Historical in-flight punts enter the same visible sequence, never a simulated return.
  if (l.play === 'punt') { g.special = puntSequence(g); return; }
  l.time += dt;
  const control = franchiseKickControl(g, g.possession);
  const speed = (.85 + Math.max(0, distance - 25) * .06) * control;
  l.kickMeter = .5 + Math.sin(l.time * speed * Math.PI * 2) * .5;
  if (l.kickAccuracy === undefined && (g.possession === 'home' ? input.action : l.time > .8)) {
    const cpuError = (random(g) - .5) * (.24 + Math.max(0, distance - 35) * .009) * control;
    l.kickAccuracy = g.possession === 'home' ? l.kickMeter : clamp(.5 + cpuError, 0, 1);
    l.kickAge = 0;
  }
  if (l.kickAccuracy === undefined) return;
  if (!fieldGoalAllowed(g)) { changePossession(g, g.spot - 7); g.phase = 'play-dead'; g.nextPhase = 'play-call'; announce(g, 'FIELD GOAL NOT LEGAL — POSSESSION CHANGES'); return; }
  g.special = fieldGoalSequence(g);
}
function finishSpecial(g: FootballGame, result: SpecialResult) {
  const s = g.special!, kicking = s.kicking;
  if (result.kind !== 'good' && result.kind !== 'miss')
    g.fieldGoalSpotY = clamp(g.returnAttempt?.player.y ?? s.ball.y, FOOTBALL_SIDELINES.minY, FOOTBALL_SIDELINES.maxY);
  g.phase = 'play-dead'; g.nextPhase = 'play-call'; g.playClockRunning = false; stopGameClock(g, 'possession');
  if (s.kind === 'punt') g.stats[kicking].punts++;
  if (result.kind === 'safety') {
    g.score[other(result.side)] += 2; g.kickReceiver = other(result.side);
    g.nextPhase = g.kickReceiver === 'home' ? 'kickoff' : 'kickoff-choice'; announce(g, 'SAFETY — BLOCKED KICK RECOVERED IN OWN END ZONE'); return;
  }
  if (result.kind === 'scrimmage') {
    g.stats[kicking].rushYards += result.spot - g.spot;
    g.possession = kicking; g.spot = clamp(result.spot, 0, 100);
    if (g.spot >= g.target) { g.stats[kicking].firstDowns++; resetDowns(g); }
    else if (++g.down > 4) { changePossession(g, g.spot); g.turnoverNotice = .85; }
    announce(g, 'BLOCKED KICK — KICKING TEAM RECOVERY RUN ENDS'); return;
  }
  if (result.kind === 'good' || result.kind === 'miss') {
    const distance = fieldGoalDistance(g);
    remember(g, 'Field goal', result.kind === 'good' ? 'GOOD' : 'MISSED', 0, kicking);
    if (result.kind === 'good') {
      g.score[kicking] += 3; g.stats[kicking].fieldGoals++; g.kickReceiver = other(kicking);
      g.nextPhase = g.kickReceiver === 'home' ? 'kickoff' : 'kickoff-choice';
      announce(g, `FIELD GOAL GOOD — ${distance} YARDS · +3`);
    } else { changePossession(g, Math.min(80, g.spot - 7)); announce(g, `FIELD GOAL MISSED — ${distance} YARDS`); }
    return;
  }
  g.possession = result.side; g.spot = clamp(result.spot, 1, 99); resetDowns(g);
  if (result.kind === 'touchdown') { g.spot = 100; remember(g, s.kind === 'punt' ? 'Punt return' : 'Kick return', 'TOUCHDOWN', 100); scoreTouchdown(g); return; }
  announce(g, result.detail ?? (result.kind === 'recovery' ? `ONSIDE KICK — ${result.side === kicking ? 'KICKING' : 'RECEIVING'} TEAM DIVING RECOVERY`
    : result.kind === 'touchback' ? `${s.kind === 'punt' ? 'PUNT' : 'KICKOFF'} — TOUCHBACK AT THE 20`
    : `${s.kind === 'punt' ? 'PUNT' : 'KICK'} RETURN ENDS — FIRST DOWN AT YOUR ${Math.round(g.spot)}`));
  remember(g, s.kind === 'punt' ? 'Punt' : 'Kick return', g.message, result.spot, kicking);
}
/** Fixed-step match clock + spatial play simulation. Rendering never decides football outcomes. */
function stepFootballLocal(g: FootballGame, input: FootballInput = {}, dt = KR.dt, worldSpeed = 1): FootballGame {
  if (!Number.isFinite(dt) || dt <= 0 || dt > KR.dt + .000001) throw new Error('Football uses bounded 60Hz steps');
  if (g.sideSwitch || g.tackleScene || g.playResult) { advanceFootballPresentation(g, dt); return g; }
  if (g.phase === 'final' || g.phase === 'halftime' || g.phase === 'coin-toss' || g.phase === 'overtime-toss') return g;
  if (isFootballReady(g) || g.phase === 'penalty') {
    advanceFootballReady(g, dt);
    return g;
  }
  g.totalTime += dt;
  if (g.phase === 'play-dead') { if (g.clockRunning) consumeClock(g, dt); return g; }
  if (g.special && (g.phase === 'kickoff' || g.phase === 'live')) {
    if (specialBallLive(g.special)) {
      // Slower field-goal presentation must not cost extra game-clock time.
      const visualScale = g.special.kind === 'field-goal' && g.special.stage === 'flight' ? FIELD_GOAL_FLIGHT_SCALE : 1;
      consumeClock(g, dt / visualScale); g.clockRunning = true; delete g.clockStoppage;
    }
    const result = stepSpecialTeams(g, input, dt * worldSpeed);
    if (result) { captureReturnTackle(g); finishSpecial(g, result); beginPlayResult(g, specialResultText(g, result)); }
    return g;
  }
  if (g.phase === 'kickoff') {
    const a = g.returnAttempt!;
    if (a.phase === 'returning') { consumeClock(g, dt); g.clockRunning = true; delete g.clockStoppage; }
    if (input.action && g.kickReceiver === 'away' && a.phase === 'returning')
      startNearestDive(a.defenders, { ...a.player, vx: KR.forwardSpeed });
    const panic = g.kickReceiver==='home' ? cpuDefensivePanicTarget(g,g,{
      kind:'kickoff',defending:'away',mode:a.phase==='returning'?'runner':'none',
      goalX:1100,los:a.landing.x,now:a.time,defenders:a.defenders,carrier:a.player,
    }) : defensivePanicTarget(g, !!input.defenseHold && g.kickReceiver === 'away' &&
      a.phase === 'returning', a.defenders, a.player, 1100, a.time, undefined, {direction:input.direction});
    if(panic) startNearestDive(a.defenders,{...a.player,vx:a.moves?.vx??KR.forwardSpeed},a.time,panic.id);
    const direction = g.kickReceiver === 'home' ? input.direction ?? 0 : kickWitnessDirection(a);
    g.returnAttempt = stepKickAttempt(a, direction, dt * worldSpeed, g.kickReceiver === 'home'
      ? { juke: !!input.juke || !!input.action, hesitate: input.hesitate } : {}, FOOTBALL_SIDELINES, panic);
    const next = g.returnAttempt;
    if (next.phase === 'touchdown') { g.possession = g.kickReceiver; remember(g, 'Kick return', 'TOUCHDOWN', 100); scoreTouchdown(g); }
    else if (next.phase === 'tackled') {
      captureReturnTackle(g);
      if (g.tackleScene) g.tackleSounds = (g.tackleSounds ?? 0) + 1;
      g.possession = g.kickReceiver;
      g.spot = next.player.x <= 100 ? 20 : clamp((next.player.x - 100) / 10, 1, 99);
      resetDowns(g); g.phase = 'play-dead'; g.nextPhase = 'play-call'; stopGameClock(g, 'possession');
      announce(g, next.player.x <= 100 ? 'TOUCHBACK — FIRST AND TEN AT THE 20' : `RETURN ENDS — FIRST DOWN AT YOUR ${Math.round(g.spot)}`);
      remember(g, 'Kick return', g.message, g.spot);
    }
    if (['play-dead', 'final'].includes(g.phase)) beginPlayResult(g, g.lastResult);
    else readyClock(g);
    return g;
  }
  if (g.phase === 'live') {
    consumeClock(g, dt);
    if (g.live!.mode === 'kick') stepKickPlay(g, input, dt * worldSpeed);
    else {
      const result = stepField(g, input, dt * worldSpeed);
      if (result) {
        const offense = g.live!.offense ?? g.possession;
        finishField(g, result); beginPlayResult(g, fieldResultText(g, result, offense));
      }
    }
    if (!g.playResult && ['play-dead', 'final'].includes(g.phase)) beginPlayResult(g, g.lastResult);
    readyClock(g);
  }
  return g;
}

// Every external mutation enters/exits the same physical field frame. Nested
// engine calls share the frame; no caller/render-only directional shortcuts.
export function tossFootball(g: FootballGame) { return inFootballFrame(g, () => tossFootballLocal(g)); }
export function chooseKick(g: FootballGame, kind: 'full' | 'squib' | 'onside') { return inFootballFrame(g, () => chooseKickLocal(g, kind)); }
export function advanceFootball(g: FootballGame) { return inFootballFrame(g, () => advanceFootballLocal(g)); }
export function takeTimeout(g: FootballGame, side: Side = 'home') { return inFootballFrame(g, () => takeTimeoutLocal(g, side)); }
export function queueOffense(g: FootballGame, id: PlayId) { return inFootballFrame(g, () => queueOffenseLocal(g, id)); }
export function queueDefense(g: FootballGame, defense: Defense) { return inFootballFrame(g, () => queueDefenseLocal(g, defense)); }
export function snapFootball(g: FootballGame) { return inFootballFrame(g, () => snapFootballLocal(g)); }
export function advanceFootballReady(g: FootballGame, elapsed: number) { return inFootballFrame(g, () => advanceFootballReadyLocal(g, elapsed)); }
export function advanceFootballPresentation(g: FootballGame, elapsed: number) { return inFootballFrame(g, () => advanceFootballPresentationLocal(g, elapsed)); }
export function stepFootball(g: FootballGame, input: FootballInput = {}, dt = KR.dt, worldSpeed = 1) {
  return inFootballFrame(g, () => {
    const before = capturePerformance(g);
    const result = stepFootballLocal(g, input, dt, worldSpeed);
    observePerformance(g, before);
    return result;
  });
}
