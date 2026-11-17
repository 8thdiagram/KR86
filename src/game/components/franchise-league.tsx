import { useMemo, useState } from 'react';
import type { Franchise } from '../lib/football/franchise';
import type { LeagueStats, LeagueTeamSeason } from '../lib/football/league-types';
import { currentTeamRating, teamAwardCounts } from '../lib/football/league';
import { KICK_TEAMS } from '../lib/kick-return-teams';
import { MVP_IDS, mvpSummary } from '../lib/football/mvp';

const SLOTS = MVP_IDS;
type SortKey = 'team' | 'overall' | 'offense' | 'defense' | 'special' | 'record' | 'pf' | 'pa' | 'diff' | 'yards' | 'td' | 'to';
const COLS: { k: SortKey; l: string; title: string }[] = [
  { k: 'team', l: 'TEAM', title: 'Team name' }, { k: 'overall', l: 'STR', title: 'Overall strength index (can exceed 100; not a win chance)' },
  { k: 'offense', l: 'OFF', title: 'Offense index' }, { k: 'defense', l: 'DEF', title: 'Defense index' }, { k: 'special', l: 'ST', title: 'Special teams index' },
  { k: 'record', l: 'W-L', title: 'Record' }, { k: 'pf', l: 'PF', title: 'Points for' }, { k: 'pa', l: 'PA', title: 'Points against' },
  { k: 'diff', l: '+/-', title: 'Point differential' }, { k: 'yards', l: 'YDS', title: 'Pass + rush yards' }, { k: 'td', l: 'TD', title: 'Touchdowns' }, { k: 'to', l: 'TO', title: 'Turnovers' },
];

const hasBox = (s: LeagueStats) => s.played + s.simulated > 0;
const swatch = (team: string) => { const k = KICK_TEAMS.find(t => t.name === team); return k ? { ['--body' as string]: k.body, ['--trim' as string]: k.trim } : undefined; };

export function LeagueView({ f }: { f: Franchise }) {
  const seasons = f.league?.seasons ?? [];
  const [sel, setSel] = useState<number>(() => seasons.length ? seasons[seasons.length - 1]!.season : f.season);
  const [split, setSplit] = useState<'regular' | 'playoffs'>('regular');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'overall', dir: -1 });
  const [detail, setDetail] = useState<string | null>(null);
  const season = seasons.find(s => s.season === sel) ?? seasons[seasons.length - 1];
  const isCurrent = !!season && season.season === f.season;
  const inProgress = !!season && !season.complete;

  const rows = useMemo(() => {
    if (!season) return [];
    const val = (t: LeagueTeamSeason, k: SortKey): number | string => {
      const s = t[split], rec = split === 'regular' && t.legacyRecord ? t.legacyRecord : s;
      const r = isCurrent ? safeRating(f, t) : t.rating;
      switch (k) {
        case 'team': return t.team; case 'overall': return r.overall; case 'offense': return r.offense; case 'defense': return r.defense; case 'special': return r.special;
        case 'record': return rec.wins - rec.losses + rec.wins / 100; case 'pf': return s.pointsFor; case 'pa': return s.pointsAgainst;
        case 'diff': return s.pointsFor - s.pointsAgainst; case 'yards': return s.passYards + s.rushYards; case 'td': return s.touchdowns; case 'to': return s.turnovers;
      }
    };
    return [...season.teams].sort((a, b) => { const x = val(a, sort.k), y = val(b, sort.k);
      return (typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)) * sort.dir; });
  }, [season, split, sort, isCurrent, f]);

  if (!season) return <section className="frn-panel frn-center" data-testid="panel-league-empty">
    <p className="frn-kicker">LEAGUE OFFICE</p><h2 className="frn-h">NO LEAGUE RECORDS YET</h2>
    <p className="frn-copy">League tables appear once this franchise's league file is initialized. Play a game and the rest of the league starts keeping score.</p></section>;

  const toggle = (k: SortKey) => setSort(s => s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === 'team' || k === 'pa' || k === 'to' ? 1 : -1 });
  const det = detail ? season.teams.find(t => t.team === detail) : null;

  return <section className="frn-panel frl" data-testid="panel-league">
    <div className="frl-bar">
      <label className="frl-field"><small>SEASON</small>
        <select value={season.season} onChange={e => { setSel(Number(e.target.value)); setDetail(null); }} data-testid="select-league-season">
          {[...seasons].reverse().map(s => <option key={s.season} value={s.season}>SEASON {s.season}{s.season === f.season && !s.complete ? ' · CURRENT' : ''}{s.legacy ? ' · LEGACY' : ''}</option>)}
        </select></label>
      <div className="frl-seg" role="group" aria-label="Stat split">
        {(['regular', 'playoffs'] as const).map(s => <button key={s} type="button" aria-pressed={split === s} onClick={() => setSplit(s)} data-testid={`button-split-${s}`}>
          {s === 'regular' ? 'REGULAR' : 'PLAYOFFS'}</button>)}
      </div>
    </div>
    <p className="frl-note" data-testid="text-league-status">
      {isCurrent && inProgress ? `IN PROGRESS · STATS THROUGH WEEK ${season.week} · STRENGTH SHOWS CURRENT POST-AWARD INDEX` : season.complete ? (isCurrent ? 'FINAL · STRENGTH SHOWS CURRENT POST-AWARD INDEX' : 'FINAL')  : `THROUGH WEEK ${season.week}`}
      {season.champion && <> · CHAMPION <b>{season.champion.toUpperCase()}</b></>}
      {season.mvp && <> · MVP {season.mvp.team.toUpperCase()} {season.mvp.position ? `${season.mvp.position} #${season.mvp.number}` : season.mvp.slot}</>}
      {season.mvpUnavailable && <> · {season.mvpUnavailable}</>}
    </p>
    {season.legacy && <p className="frl-legacy" data-testid="text-league-legacy">LEGACY SEASON: saved before the league office existed. Records are authoritative; box-score stats are unavailable or partial.</p>}
    <p className="frl-legend"><span className="frl-src eng">ENG</span> engine box scores from games you played · <span className="frl-src sim">SIM</span> statistical simulation of CPU-only games · STR is a strength index (may exceed 100), not a win chance.</p>
    <div className="frl-wrap" tabIndex={0} role="region" aria-label="League table">
      <table className="frl-table">
        <thead><tr><th scope="col">#</th>{COLS.map(c => <th key={c.k} scope="col" title={c.title}
          aria-sort={sort.k === c.k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
          <button type="button" onClick={() => toggle(c.k)} data-testid={`sort-league-${c.k}`}>{c.l}{sort.k === c.k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button></th>)}<th scope="col">SRC</th></tr></thead>
        <tbody>{rows.map((t, i) => {
          const s = t[split], legacyRec = split === 'regular' ? t.legacyRecord : undefined, box = hasBox(s);
          const r = isCurrent ? safeRating(f, t) : t.rating, na = !box;
          const n = (v: number) => na ? <span className="frl-na" title="Unavailable">n/a</span> : Math.round(v * 10) / 10;
          const rec = legacyRec ?? s;
          return <tr key={t.team} className={`${t.team === f.team ? 'you' : ''} ${t.team === season.champion ? 'champ' : ''}`} data-testid={`row-league-${t.team}`}>
            <td>{i + 1}</td>
            <th scope="row"><button type="button" className="frl-team" style={swatch(t.team)} onClick={() => setDetail(t.team)} data-testid={`button-league-team-${t.team}`}>
              <i aria-hidden="true" />{t.team}{t.team === f.team && <em>YOU</em>}</button></th>
            <td className="str">{r.overall}</td><td>{r.offense}</td><td>{r.defense}</td><td>{r.special}</td>
            <td>{legacyRec || box || (split === 'regular' && s.games) ? `${rec.wins}-${rec.losses}` : <span className="frl-na">—</span>}</td>
            <td>{n(s.pointsFor)}</td><td>{n(s.pointsAgainst)}</td><td>{na ? n(0) : (s.pointsFor - s.pointsAgainst > 0 ? '+' : '') + (s.pointsFor - s.pointsAgainst)}</td>
            <td>{n(s.passYards + s.rushYards)}</td><td>{n(s.touchdowns)}</td><td>{n(s.turnovers)}</td>
            <td className="src">{s.played > 0 && <span className="frl-src eng" title={`${s.played} engine games`}>ENG {s.played}</span>}
              {s.simulated > 0 && <span className="frl-src sim" title={`${s.simulated} simulated games`}>SIM {s.simulated}</span>}
              {!box && <span className="frl-na">{legacyRec ? 'PARTIAL' : 'NONE'}</span>}</td>
          </tr>; })}</tbody>
      </table>
    </div>
    {det && <TeamDetail f={f} t={det} season={season.season} isCurrent={isCurrent} onClose={() => setDetail(null)} />}
  </section>;
}

function safeRating(f: Franchise, t: LeagueTeamSeason) { return currentTeamRating(f, t.team); }

function TeamDetail({ f, t, season, isCurrent, onClose }: { f: Franchise; t: LeagueTeamSeason; season: number; isCurrent: boolean; onClose: () => void }) {
  const counts = isCurrent ? teamAwardCounts(f, t.team) : teamAwardCounts(f, t.team, season);
  const r = isCurrent ? safeRating(f, t) : t.rating;
  const history = (f.league?.awards ?? []).filter(a => a.team === t.team && a.season <= season);
  const titles = (f.league?.seasons ?? []).filter(s => s.champion === t.team && s.season <= season).map(s => s.season);
  const line = (label: string, s: LeagueStats, legacy?: { wins: number; losses: number }) => <div className="frl-line">
    <b>{label}</b>
    {hasBox(s) ? <span>{s.wins}-{s.losses} · {s.pointsFor}-{s.pointsAgainst} pts · {s.completions}/{s.attempts} comp · {Math.round(s.passYards * 10) / 10} pass · {Math.round(s.rushYards * 10) / 10} rush · {s.touchdowns} TD · {s.fieldGoals} FG · {s.turnovers} TO
      <small> ({s.played} engine, {s.simulated} simulated)</small></span>
      : legacy ? <span>{legacy.wins}-{legacy.losses} (saved record) · box scores unavailable</span> : <span className="frl-na">No games yet</span>}
  </div>;
  return <article className="frl-detail" style={swatch(t.team)} data-testid={`panel-league-team-${t.team}`} aria-label={`${t.team} detail`}>
    <header><i aria-hidden="true" /><h3>{t.team.toUpperCase()}{t.team === f.team && ' · YOUR FRANCHISE'}</h3>
      <button type="button" className="frn-btn sm ghost" onClick={onClose} data-testid="button-league-detail-close">CLOSE</button></header>
    <div className="frl-ratings">{(['overall', 'offense', 'defense', 'special'] as const).map(k => <div key={k}><small>{k.toUpperCase()}</small><b>{r[k]}</b></div>)}</div>
    <p className="frl-note">{isCurrent ? 'Current strength index including all MVP awards to date.' : `Opening-season strength snapshot. MVP counts shown through season ${season}.`}</p>
    {line('REGULAR', t.regular, t.legacyRecord)}{line('PLAYOFFS', t.playoffs)}
    <p className="frn-kicker">MVP AWARDS BY REWARD TYPE</p>
    <ul className="frl-slots">{SLOTS.map(s => <li key={s} className={counts[s] ? 'on' : ''} data-testid={`text-league-slot-${t.team}-${s}`}>
      <b>{s}</b><span>{counts[s]}x</span></li>)}</ul>
    <p className="frl-note">Reward-type counts can include different players. Scouting shows each legend’s actual earned bonuses and effective totals.</p>
    <p className="frn-kicker">AWARD HISTORY</p>
    {history.length ? <ol className="frl-hist">{history.map(a => <li key={`${a.season}-${a.slot}`}>Season {a.season} · {a.position ? `${a.position} #${a.number}` : a.slot} · {a.performance ?? mvpSummary(a.slot, history.filter(b => b.slot === a.slot && b.season <= a.season).length)}</li>)}</ol>
      : <p className="frn-copy dim">No Super Cup MVPs yet.</p>}
    {titles.length > 0 && <p className="frn-copy">Titles: Season {titles.join(', ')}</p>}
  </article>;
}
