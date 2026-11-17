import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KICK_TEAMS } from '../lib/kick-return-teams';
import { teamProfile } from '../lib/football/playbook';
import { advanceFootball } from '../lib/football/engine';
import { mvpSummary } from '../lib/football/mvp';
import {
  ROUND_NAMES, resolveLegacyMvp, completeFranchiseGame, createFranchise, franchiseRecord, nextFranchiseSeason,
  startFranchiseGame, updateFranchiseGame, type Franchise, type MvpSlot,
} from '../lib/football/franchise';
import type { FootballGame as Game } from '../lib/football/types';
import { useFranchiseSave } from '../lib/football/use-franchise-save';
import { acknowledgeFranchiseAnnouncement, franchiseYear, withPlayoffPresentation } from '../lib/football/franchise-announcements';
import { visibleFranchiseSaveError } from '../lib/football/franchise-save-status';
import { FootballGame } from './football-game';
import { HalftimeShow, SuperCupIntro, TrophyCeremony } from './franchise-shows';
import { LeagueView } from './franchise-league';
import { ScoutingReport } from './scouting-report';
import { scoutingLegend, scoutingOpponent, scoutingTeams } from '../lib/football/scouting';
import { legendaryPlayer } from '../lib/football/legendary-roster';
import './football-franchise.css';

export type FranchiseStore = ReturnType<typeof useFranchiseSave>;
type Props = { onBack: () => void; entry?: 'franchise' | 'playoffs'; store?: FranchiseStore };

const kit = (name: string) => KICK_TEAMS.find(t => t.name === name) ?? KICK_TEAMS[0]!;
const POS: Record<MvpSlot, { pos: string; long: string; bonus: string }> = {
  QB1: { pos: 'QB', long: 'QUARTERBACK', bonus: 'PASSING ACCURACY' },
  KR1: { pos: 'KR', long: 'KICK RETURNER', bonus: 'SPEED' },
  DB1: { pos: 'DB', long: 'DEFENSIVE BACK', bonus: 'SPEED' },
  RB1: { pos: 'RB', long: 'RUNNING BACK', bonus: 'SPEED' },
  WR1: { pos: 'WR', long: 'WIDE RECEIVER', bonus: 'SPEED' },
  LB1: { pos: 'LB', long: 'LINEBACKER', bonus: 'RUSH EXECUTION' },
  K1: { pos: 'K', long: 'KICKER', bonus: 'CLUTCH METER CONTROL' },
};
const bump = (f: Franchise, edit: (n: Franchise) => void) => { const n = structuredClone(f); n.revision++; edit(n); return n; };

/** Pixel uniform: helmet = secondary, jersey = primary, pants = white. */
export function Uniform({ team, size = 'md' }: { team: string; size?: 'sm' | 'md' | 'lg' }) {
  const k = kit(team);
  return <span className={`frn-uni frn-uni-${size}`} aria-hidden="true" style={{ ['--body' as string]: k.body, ['--trim' as string]: k.trim }}>
    <i className="h" /><i className="j" /><i className="p" /></span>;
}

export function FootballFranchise(props: Props) {
  return props.store ? <FranchiseView {...props} store={props.store} /> : <FranchiseWithHook {...props} />;
}
function FranchiseWithHook(props: Props) { const store = useFranchiseSave(); return <FranchiseView {...props} store={store} />; }

function FranchiseView({ onBack, entry = 'franchise', store }: Props & { store: FranchiseStore }) {
  const { state: f, loading, error, syncing, syncFailure, commit, retry } = store;
  const blockingError = !!error && !syncFailure;
  const visibleError = visibleFranchiseSaveError(error, syncFailure, f?.active?.game);
  const fRef = useRef(f); fRef.current = f;
  const [tab, setTab] = useState<'hq' | 'bracket' | 'schedule' | 'league'>(entry === 'playoffs' ? 'bracket' : 'hq');
  const [playing, setPlaying] = useState(false);
  const [actionError, setActionError] = useState('');
  const [resetStage, setResetStage] = useState<'idle' | 'confirm' | 'pick'>('idle');
  const [finished, setFinished] = useState<{ won: boolean; home: number; away: number; opponent: string } | null>(null);

  const safeCommit = (next: Franchise) => {
    const ok = commit(next);
    setActionError(ok ? '' : 'Could not save franchise progress on this device. Nothing advanced — try again.');
    return ok;
  };
  const busy = !!error || syncing;
  /** force: presentation progress (intro, halftime, ceremony) that must not stall behind a pending sync. */
  const run = (fn: (x: Franchise) => Franchise, force = false) => {
    const cur = fRef.current; if (!cur || blockingError || (syncing && !force)) return false;
    try { const n = fn(cur); return n === cur ? true : safeCommit(n); }
    catch (e) { setActionError(e instanceof Error ? e.message : 'That action is not available right now.'); return false; }
  };

  // Recover a match that was already final when the session ended: record it once.
  const recovering = useRef('');
  useEffect(() => {
    const a = f?.active;
    if (!a || blockingError || playing) return;
    if (a.game.phase === 'final' && !a.game.playResult && a.game.winner && recovering.current !== a.id) {
      recovering.current = a.id; recordGame(a.game);
    }
  });
  useEffect(() => {
    if (f?.phase === 'mvp' && !blockingError && !syncing) run(resolveLegacyMvp, true);
  }, [f?.phase, blockingError, syncing]);

  const recordGame = (g: Game) => {
    const cur = fRef.current; if (!cur?.active) return false;
    const opp = cur.active.opponent;
    const ok = run(x => completeFranchiseGame(x, g), true);
    if (ok) { setPlaying(false); setFinished({ won: g.winner === 'home', home: g.score.home, away: g.score.away, opponent: opp }); }
    return ok;
  };

  if (loading) return <Shell onBack={onBack}><div className="frn-skel" data-testid="franchise-loading"><span /><span /><span /><span /></div></Shell>;
  if (error && !f) return <Shell onBack={onBack}><ErrorBox error={error} retry={retry} /></Shell>;
  if (!f) return <Shell onBack={onBack}><TeamPicker busy={busy} onPick={team => safeCommit(createFranchise(team, Math.floor(Math.random() * 2 ** 31)))} error={actionError} /></Shell>;

  const a = f.active;
  const show = (node: ReactNode) => <>{(visibleError || actionError) && <div className="frn-save-notice"
    style={{ position: 'fixed', zIndex: 1000, inset: '10px 10px auto', maxWidth: 750, margin: 'auto' }}>
    <ErrorBox error={visibleError || actionError} retry={() => { setActionError(''); retry(); }} /></div>}{node}</>;
  const notice = f.announcements?.[0];
  if (notice) {
    const remaining = franchiseRecord(f).remaining;
    const title = notice.kind === 'clinched' ? 'Congratulations, you made the playoffs!'
      : notice.kind === 'eliminated' ? 'Eliminated — you did not qualify for the playoffs this year.'
      : notice.kind === 'playoffs' ? `${franchiseYear(notice.season)} — Welcome to the playoffs!`
      : notice.round === 3 ? 'Super Cup champions!' : 'You advance to the next playoff round!';
    return show(<Shell onBack={onBack} team={f.team} syncing={syncing}>
      <section className="frn-panel frn-hero" role="status" aria-live="polite" data-testid={`franchise-announcement-${notice.kind}`}>
        <p className="frn-kicker">{franchiseYear(notice.season)} · SEASON {notice.season} · {f.team.toUpperCase()}</p>
        <h2 className="frn-h gold">{title}</h2>
        {(notice.kind === 'clinched' || notice.kind === 'eliminated') && <p className="frn-copy">
          {remaining ? `You will still play the remaining ${remaining} regular-season ${remaining === 1 ? 'game' : 'games'}.`
            : notice.kind === 'clinched' ? 'The regular season is complete. Your playoff run is next.' : 'Your regular season is complete.'}
        </p>}
        {notice.kind === 'playoffs' && <p className="frn-copy">The regular season is over. Welcome to the 16-team playoffs — win and advance!</p>}
        {notice.kind === 'advanced' && <p className="frn-copy">Your result is saved. Here is the updated playoff bracket.</p>}
      </section>
      {(notice.kind === 'advanced' || notice.kind === 'playoffs') && <Bracket f={f} />}
      <section className="frn-panel"><button type="button" className="frn-btn big" disabled={busy}
        data-testid="button-franchise-announcement-continue"
        onClick={() => { if (run(x => acknowledgeFranchiseAnnouncement(x, notice.id), true)) setTab('hq'); }}>
        {notice.kind === 'playoffs' ? 'ENTER THE PLAYOFFS' : 'CONTINUE'}
      </button></section>
    </Shell>);
  }
  // Super Cup presentations take over the screen.
  if (a?.scoutingDone === false && (playing || a.round === 3)) return show(
    <ScoutingReport teams={scoutingTeams(f, a.opponent)} onContinue={() => {
      if (run(x => bump(x, n => { n.active!.scoutingDone = true; }), true)) setPlaying(true);
    }} />);
  if (a && a.round === 3 && !a.introDone) return show(<SuperCupIntro home={f.team} away={a.opponent}
    onDone={() => { if (run(x => bump(x, n => { n.active!.introDone = true; }), true)) setPlaying(true); }} />);
  if (a && a.round === 3 && !a.halftimeDone && a.game.phase === 'halftime') return show(<HalftimeShow home={f.team} away={a.opponent}
    key={blockingError ? 'save-blocked' : 'ready'} blocked={blockingError}
    remaining={a.halftimeRemaining}
    onTick={r => { const cur = fRef.current; if (cur?.active && r !== cur.active.halftimeRemaining) run(x => bump(x, n => { n.active!.halftimeRemaining = Math.max(0, r); }), true); }}
    onDone={() => { if (run(x => { const g = structuredClone(x.active!.game); advanceFootball(g); const n = updateFranchiseGame(x, g);
      n.active!.halftimeDone = true; n.active!.halftimeRemaining = 0; return n; }, true)) setPlaying(true); }} />);
  if (f.ceremony) {
    const c = f.ceremony, winScore = Math.max(c.home, c.away), loseScore = Math.min(c.home, c.away);
    const loser = c.loser ?? (c.won ? c.opponent : f.team);
    const mvp = c.mvp ?? null;
    const acc = mvp ? (f.league?.awards ?? []).filter(x => x.team === mvp.team && x.slot === mvp.slot && x.season <= mvp.season).length || 1 : 0;
    const legend = mvp?.position ? legendaryPlayer(mvp.team, mvp.position) : undefined;
    const earned = legend ? scoutingLegend(f, mvp!.team, legend) : undefined;
    return show(<TrophyCeremony winner={c.winner} loser={loser} mvpUnavailable={c.mvpUnavailable}
      mvp={mvp ? { team: mvp.team, slot: mvp.slot, long: mvp.position ?? POS[mvp.slot].long,
        bonus: POS[mvp.slot].bonus, total: 0, number: mvp.number, performance: mvp.performance,
        summary: earned?.mvpBonuses.join(' · ') || mvpSummary(mvp.slot, acc) } : undefined} winScore={winScore} loseScore={loseScore} humanWon={c.won}
      onDone={() => { setFinished(null); run(x => bump(x, n => { n.ceremony = null; }), true); }} />);
  }
  if (resetStage === 'pick') return <Shell onBack={() => setResetStage('idle')}>
    <TeamPicker busy={busy} error={actionError} replacing={f.team} onCancel={() => setResetStage('idle')}
      onPick={team => { if (safeCommit(createFranchise(team, Math.floor(Math.random() * 2 ** 31)))) { setResetStage('idle'); setTab('hq'); setFinished(null); } }} /></Shell>;
  if (a && playing) {
    const label = a.kind === 'regular' ? `SEASON ${f.season} · GAME ${a.index + 1} OF 16` : `PLAYOFFS · ${franchiseYear(f.season)} · ${ROUND_NAMES[a.round]}`;
    return <div className="frn-game">
      {(actionError || visibleError) && <ErrorBox error={actionError || visibleError} retry={retry} />}
      <FootballGame key={`${a.id}:${a.halftimeDone}`} franchise={{
        game: withPlayoffPresentation(f, a.game), label,
        onSave: g => { const cur = fRef.current; if (!cur?.active || cur.active.id !== g.franchise?.gameId) return false;
          // Terminal save: the one-second result has finished, so record the result once and move on.
          if (g.phase === 'final' && !g.playResult && g.winner) return recordGame(structuredClone(g));
          try { return commit(updateFranchiseGame(cur, g)); } catch { return false; } },
        onComplete: g => recordGame(g),
        onBack: () => setPlaying(false),
      }} />
    </div>;
  }

  const rec = franchiseRecord(f);
  const play = () => {
    if (fRef.current?.active) {
      if (!blockingError) { setPlaying(true); setFinished(null); }
      return;
    }
    if (busy) return;
    if (run(startFranchiseGame)) { setPlaying(true); setFinished(null); }
  };

  return <Shell onBack={onBack} team={f.team} syncing={syncing}>
    {(visibleError || actionError) && <ErrorBox error={visibleError || actionError} retry={visibleError ? retry : undefined} />}
    <header className="frn-head" style={{ ['--body' as string]: kit(f.team).body, ['--trim' as string]: kit(f.team).trim }}>
      <Uniform team={f.team} size="lg" />
      <div><p className="frn-kicker">FRANCHISE · SEASON {f.season}</p><h2 className="frn-team" data-testid="text-franchise-team">{f.team.toUpperCase()}</h2>
        <p className="frn-ident">{teamProfile(f.team).identity}</p></div>
      <div className="frn-rings" data-testid="text-championships">SUPER CUP CHAMPIONSHIPS: <b>{f.championships.length}</b></div>
    </header>
    <nav className="frn-tabs" role="tablist">
      {(['hq', 'schedule', 'bracket', 'league'] as const).map(t => <button key={t} type="button" role="tab" aria-selected={tab === t} className="frn-tab"
        onClick={() => setTab(t)} data-testid={`tab-franchise-${t}`}>{t === 'hq' ? 'HQ' : t === 'schedule' ? 'SCHEDULE' : t === 'league' ? 'LEAGUE' : 'PLAYOFFS'}</button>)}
    </nav>
    <div className="frn-scroll">
      {tab === 'hq' && <>
        <PhaseCard f={f} finished={finished} canAct={!busy || !!f.active && !blockingError} onPlay={play}
          onNext={() => { if (run(nextFranchiseSeason)) setFinished(null); }} onBracket={() => setTab('bracket')} />
        <div className="frn-stats">
          <Stat label="WINS" value={rec.wins} id="wins" /><Stat label="LOSSES" value={rec.losses} id="losses" />
          <Stat label="REMAINING" value={rec.remaining} id="remaining" />
          <Stat label="PLAYOFFS" value={status(f)} id="playoff-status" small />
        </div>
        <ScoutingReport teams={scoutingTeams(f, scoutingOpponent(f))} />
        <section className="frn-panel" data-testid="panel-legends">
          <p className="frn-kicker">FRANCHISE RECORD</p>
          <p className="frn-copy dim">Super Cup MVPs are awarded automatically to the winning legend with the strongest recorded performance. Speed awards diminish; skill awards stack. CPU-only simulations lack individual statistics.</p>
          {f.championships.length > 0 && <p className="frn-copy">Titles: {f.championships.map(c => `Season ${c.season} (${c.home}–${c.away} vs ${c.opponent})`).join(' · ')}</p>}
          {f.awards.length > 0 && <details className="frn-copy" data-testid="franchise-mvp-history"><summary>MVP HISTORY</summary>
            <ol>{f.awards.map(a => <li key={a.season}>Season {a.season} — {a.position ? `${a.position} #${a.number}` : `${a.slot} · ${POS[a.slot].long}`} · {a.performance || 'Historical award; individual statistics unavailable.'}</li>)}</ol>
          </details>}
        </section>
        <Highlights f={f} />
        <section className="frn-panel" data-testid="panel-new-franchise">
          <p className="frn-kicker">FRONT OFFICE</p>
          {resetStage === 'idle' ? <button type="button" className="frn-btn ghost" disabled={busy || !!f.active} onClick={() => setResetStage('confirm')} data-testid="button-new-franchise">
            NEW FRANCHISE</button>
          : <div className="frn-danger" role="alertdialog" aria-labelledby="frn-reset-h" data-testid="dialog-new-franchise">
            <h3 id="frn-reset-h" className="frn-h">REPLACE THIS LEAGUE?</h3>
          <p className="frn-copy">Starting a new franchise replaces ALL current league seasons, every Super Cup title, every MVP record and all rival team growth saved on this device for the {f.team}. Export a backup first to keep your current franchise.</p>
            <p className="frn-copy dim">Nothing changes until you also pick a new team. Cancel any time before then.</p>
            <div className="frn-row"><button type="button" className="frn-btn danger" disabled={busy} onClick={() => setResetStage('pick')} data-testid="button-confirm-new-franchise">I UNDERSTAND · PICK NEW TEAM</button>
              <button type="button" className="frn-btn ghost" onClick={() => setResetStage('idle')} data-testid="button-cancel-new-franchise">CANCEL</button></div></div>}
          {f.active && resetStage === 'idle' && <p className="frn-copy dim">Finish the game in progress first.</p>}
        </section>
      </>}
      {tab === 'schedule' && <Schedule f={f} />}
      {tab === 'bracket' && <Bracket f={f} />}
      {tab === 'league' && <LeagueView f={f} />}
    </div>
  </Shell>;
}

const status = (f: Franchise) => f.phase === 'regular' ? (franchiseRecord(f).remaining ? 'IN SEASON' : '—')
  : f.phase === 'playoffs' ? (f.bracket ? ROUND_NAMES[Math.min(3, f.bracket.round)]! : 'QUALIFIED')
  : f.phase === 'eliminated' ? 'ELIMINATED' : f.phase === 'mvp' ? 'CHAMPIONS' : f.bracket && inBracket(f) ? (f.championships.some(c => c.season === f.season) ? 'CHAMPIONS' : 'RUNNER-UP') : 'MISSED';
const inBracket = (f: Franchise) => !!f.bracket && f.bracket.teams.some(t => t.team === f.team);

function Shell({ children, onBack, team, syncing }: { children: React.ReactNode; onBack: () => void; team?: string; syncing?: boolean }) {
  const k = team ? kit(team) : null;
  return <section className="frn" data-testid="football-franchise" style={k ? { ['--body' as string]: k.body, ['--trim' as string]: k.trim } : undefined}>
    <div className="frn-top"><button type="button" className="frn-back" onClick={onBack} data-testid="button-franchise-back">◀ MODES</button>
      <span className="frn-brand">KICK RETURN '86 · FRANCHISE</span>{syncing && <span className="frn-sync" aria-live="polite">SAVING…</span>}</div>
    {children}
  </section>;
}
function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return <div className="frn-alert" role="alert" data-testid="franchise-error"><span>{error}</span>{retry && <button type="button" className="frn-btn sm" onClick={retry} data-testid="button-franchise-retry">RETRY</button>}</div>;
}
function Stat({ label, value, id, small }: { label: string; value: string | number; id: string; small?: boolean }) {
  return <div className="frn-stat"><small>{label}</small><b className={small ? 'sm' : ''} data-testid={`stat-${id}`}>{value}</b></div>;
}

function TeamPicker({ onPick, error, busy, replacing, onCancel }: { onPick: (t: string) => void; error: string; busy: boolean; replacing?: string; onCancel?: () => void }) {
  const [sel, setSel] = useState<string | null>(null);
  return <div className="frn-scroll" data-testid="franchise-team-picker">
    <div className="frn-panel frn-center"><p className="frn-kicker">NEW FRANCHISE</p><h2 className="frn-h">PICK YOUR TEAM</h2>
      <p className="frn-copy">This is permanent. Every season, every title, every MVP belongs to this team.</p>
      {replacing && <p className="frn-copy" data-testid="text-replacing">Confirming replaces the {replacing} franchise and its entire league history.</p>}</div>
    {error && <p className="frn-alert" role="alert">{error}</p>}
    <div className="frn-teams">{KICK_TEAMS.map(t => <button key={t.name} type="button" className="frn-tcard" aria-pressed={sel === t.name}
      style={{ ['--body' as string]: t.body, ['--trim' as string]: t.trim }} onClick={() => setSel(t.name)} data-testid={`button-team-${t.name}`}>
      <Uniform team={t.name} /><strong>{t.name.toUpperCase()}</strong>
      <span>{t.primary} jersey · {t.secondary} helmet</span><em>{teamProfile(t.name).identity}</em></button>)}</div>
    <div className="frn-sticky"><button type="button" className="frn-btn" disabled={!sel || busy} onClick={() => sel && onPick(sel)} data-testid="button-confirm-team">
      {sel ? `START THE ${sel.toUpperCase()} FRANCHISE` : 'CHOOSE A TEAM'}</button>
      {onCancel && <button type="button" className="frn-btn ghost" onClick={onCancel} data-testid="button-cancel-team-pick">CANCEL · KEEP CURRENT FRANCHISE</button>}</div>
  </div>;
}

function PhaseCard({ f, finished, canAct, onPlay, onNext, onBracket }: { f: Franchise; finished: { won: boolean; home: number; away: number; opponent: string } | null;
  canAct: boolean; onPlay: () => void; onNext: () => void; onBracket: () => void }) {
  const rec = franchiseRecord(f);
  const last = finished && <p className={`frn-last ${finished.won ? 'w' : 'l'}`} data-testid="text-last-result">
    {finished.won ? 'WIN' : 'LOSS'} {finished.home}–{finished.away} vs {finished.opponent.toUpperCase()} · RESULT SAVED</p>;
  const nextBtn = <button type="button" className="frn-btn" disabled={!canAct} onClick={onNext} data-testid="button-next-season">START NEXT SEASON</button>;

  if (f.phase === 'mvp') return <section className="frn-panel frn-hero" data-testid="panel-mvp">
    <h2 className="frn-h gold">SUPER CUP CHAMPIONS</h2>
    <p className="frn-copy">Preserving this historical championship and its saved awards.</p>
  </section>;

  if (f.phase === 'regular') {
    const next = f.active?.opponent ?? f.schedule.find(g => !g.result)?.opponent;
    return <section className="frn-panel frn-hero" data-testid="panel-next-game">{last}
      <p className="frn-kicker">GAME {16 - rec.remaining + 1} OF 16 · NEXT OPPONENT</p>
      {next && <div className="frn-matchup"><Uniform team={f.team} /><b>{f.team.toUpperCase()}</b><i>VS.</i><b data-testid="text-next-opponent">{next.toUpperCase()}</b><Uniform team={next} /></div>}
      <button type="button" className="frn-btn big" disabled={!canAct} onClick={onPlay} data-testid="button-play-next">{f.active ? 'CONTINUE GAME' : 'PLAY NEXT GAME'}</button>
      <p className="frn-copy dim">A winning record (9–7 or better) earns a seat in the 16-team playoffs.</p>
    </section>;
  }
  if (f.phase === 'playoffs' && f.bracket) {
    const r = Math.min(3, f.bracket.round), m = f.bracket.rounds[r]!.find(x => x.human && !x.winner);
    const opp = f.active?.opponent ?? (m ? (m.a === f.team ? m.b : m.a) : null);
    return <section className="frn-panel frn-hero" data-testid="panel-playoffs">{last}
      <p className="frn-kicker">PLAYOFF MODE UNLOCKED · {rec.wins}–{rec.losses}</p>
      <h2 className="frn-h">{ROUND_NAMES[r]}</h2>
      {opp && <div className="frn-matchup"><Uniform team={f.team} /><b>{f.team.toUpperCase()}</b><i>VS.</i><b data-testid="text-next-opponent">{opp.toUpperCase()}</b><Uniform team={opp} /></div>}
      <div className="frn-row"><button type="button" className="frn-btn big" disabled={!canAct} onClick={onPlay} data-testid="button-play-next">{f.active ? 'CONTINUE GAME' : 'PLAY NEXT GAME'}</button>
        <button type="button" className="frn-btn ghost" onClick={onBracket}>VIEW BRACKET</button></div>
    </section>;
  }
  if (f.phase === 'eliminated') return <section className="frn-panel frn-hero" data-testid="panel-eliminated">{last}
    <h2 className="frn-h">PLAYOFF RUN COMPLETE</h2><p className="frn-copy big">BETTER LUCK NEXT YEAR!</p>
    <div className="frn-row">{nextBtn}<button type="button" className="frn-btn ghost" onClick={onBracket}>FINAL BRACKET</button></div></section>;
  // Offseason: missed playoffs, lost Super Cup, or champions after MVP.
  const champ = f.championships.find(c => c.season === f.season);
  if (champ) return <section className="frn-panel frn-hero" data-testid="panel-champions">
    <h2 className="frn-h gold">SEASON {f.season} CHAMPIONS</h2>
    <p className="frn-copy">Beat the {champ.opponent} {champ.home}–{champ.away}. MVP awarded: {f.awards.filter(x => x.season === f.season).map(x => POS[x.slot].long).join(', ')}.</p>{nextBtn}</section>;
  if (f.bracket && inBracket(f) && f.bracket.rounds[3]![0]!.winner) {
    const sb = f.bracket.rounds[3]![0]!;
    return <section className="frn-panel frn-hero" data-testid="panel-supercup-loss">
      <h2 className="frn-h">SUPER CUP FINAL</h2>
      <p className="frn-copy big">{sb.winner?.toUpperCase()} {sb.score ? Math.max(...sb.score) : ''} · {f.team.toUpperCase()} {sb.score ? Math.min(...sb.score) : ''}</p>
      <p className="frn-copy">Congratulations to the {sb.winner}. You got all the way there — come back next season and finish the job.</p>
      <div className="frn-row">{nextBtn}<button type="button" className="frn-btn ghost" onClick={onBracket}>FINAL BRACKET</button></div></section>;
  }
  const even = rec.wins === rec.losses;
  const lgChamp = f.bracket?.rounds[3]![0]!.winner;
  return <section className="frn-panel frn-hero" data-testid="panel-season-over">{last}
    {even ? <><h2 className="frn-h">SEASON COMPLETE — {rec.wins}–{rec.losses}</h2>
      <p className="frn-copy big">A WINNING RECORD IS NEEDED FOR THE PLAYOFFS. COME BACK STRONGER NEXT YEAR!</p></>
      : <><h2 className="frn-h">GOOD SEASON!</h2><p className="frn-copy big">WORK HARD AT TRAINING CAMP AND COME BACK NEXT YEAR!</p>
        <p className="frn-copy dim">Final record {rec.wins}–{rec.losses}.</p></>}
    {lgChamp && <p className="frn-copy" data-testid="text-league-champion">League champion: {lgChamp.toUpperCase()}.</p>}
    <div className="frn-row">{nextBtn}{f.bracket && <button type="button" className="frn-btn ghost" onClick={onBracket}>LEAGUE PLAYOFFS</button>}</div></section>;
}

function Schedule({ f }: { f: Franchise }) {
  const nextIdx = f.phase === 'regular' ? f.schedule.findIndex(g => !g.result) : -1;
  return <section className="frn-panel" data-testid="panel-schedule"><p className="frn-kicker">SEASON {f.season} · 16 GAMES</p>
    <ol className="frn-sched">{f.schedule.map((g, i) => <li key={i} className={i === nextIdx ? 'next' : g.result ? (g.result.won ? 'w' : 'l') : ''} data-testid={`row-game-${i + 1}`}>
      <span className="n">{String(i + 1).padStart(2, '0')}</span><Uniform team={g.opponent} size="sm" /><span className="o">{g.opponent}</span>
      <span className="r">{g.result ? `${g.result.won ? 'W' : 'L'} ${g.result.home}–${g.result.away}` : i === nextIdx ? 'NEXT' : '—'}</span></li>)}</ol></section>;
}

function Bracket({ f }: { f: Franchise }) {
  if (!f.bracket) return <section className="frn-panel frn-center" data-testid="panel-bracket-locked">
    <p className="frn-kicker">PLAYOFF MODE</p><h2 className="frn-h">LOCKED</h2>
    <p className="frn-copy">Finish the 16-game season with a winning record to unlock the 16-team bracket.</p></section>;
  const b = f.bracket, seed = (t: string | null) => t ? b.teams.find(s => s.team === t)?.seed : undefined;
  const champ = b.rounds[3]![0]!.winner;
  const mine = inBracket(f);
  return <>{!mine && <p className="frn-copy dim" data-testid="text-bracket-cpu">LEAGUE PLAYOFFS · Your team missed this bracket. CPU games are simulated.</p>}
  <section className="frn-bracket" data-testid="panel-bracket">
    {b.rounds.map((round, r) => <div key={r} className="frn-round" data-round={r}>
      <p className="frn-rname">{ROUND_NAMES[r]} <small>{round.length * 2 > 2 ? `${round.length * 2} TEAMS` : 'FINAL 2'}</small></p>
      <div className="frn-rcol">{round.map(m => <div key={m.id} className={`frn-match ${m.human ? 'me' : ''}`} data-testid={`match-${m.id}`}>
        {([m.a, m.b] as const).map((t, i) => <div key={i} className={`frn-slot ${t && m.winner === t ? 'win' : m.winner && t ? 'out' : ''} ${t === f.team ? 'you' : ''}`}>
          {t ? <><Uniform team={t} size="sm" /><span className="s">{seed(t)}</span><span className="t">{t}</span><b>{m.score ? m.score[i] : ''}</b></> : <span className="t tbd">TBD</span>}
        </div>)}
      </div>)}</div>
    </div>)}
    <div className="frn-round champ"><p className="frn-rname">CHAMPION</p><div className="frn-rcol">
      <div className={`frn-trophy ${champ === f.team ? 'you' : ''}`}>{champ ? <><Uniform team={champ} /><b>{champ.toUpperCase()}</b></> : <b>?</b>}</div></div></div>
  </section></>;
}

function Highlights({ f }: { f: Franchise }) {
  const results = f.schedule.flatMap((g, i) => g.result ? [{ ...g.result, opp: g.opponent, i }] : []);
  if (!results.length && !f.championships.length) return null;
  const best = [...results].sort((a, b) => (b.home - b.away) - (a.home - a.away))[0];
  const pts = results.reduce((s, r) => s + r.home, 0), allowed = results.reduce((s, r) => s + r.away, 0);
  let streak = 0; for (let i = results.length - 1; i >= 0 && results[i]!.won === results[results.length - 1]!.won; i--) streak++;
  return <section className="frn-panel" data-testid="panel-highlights"><p className="frn-kicker">SEASON HIGHLIGHTS</p>
    <ul className="frn-hl">
      {results.length > 0 && <li><small>POINTS FOR / AGAINST</small><b>{pts} / {allowed}</b></li>}
      {results.length > 0 && <li><small>CURRENT STREAK</small><b>{results[results.length - 1]!.won ? 'W' : 'L'}{streak}</b></li>}
      {best && best.won && <li><small>BIGGEST WIN</small><b>{best.home}–{best.away} vs {best.opp}</b></li>}
      <li><small>SEASONS PLAYED</small><b>{f.season}</b></li>
    </ul></section>;
}
