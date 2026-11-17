import { useEffect, useRef, type CSSProperties } from 'react';
import type { ScoutingLegend, ScoutingTeam } from '../lib/football/scouting';
import { KICK_TEAMS } from '../lib/kick-return-teams';
import { person } from './franchise-shows';
import './scouting-report.css';

type TeamKit = { body: string; trim: string };

function kitFor(teamName: string): TeamKit {
  const kit = KICK_TEAMS.find(team => team.name === teamName);
  return kit ?? { body: '#2867cc', trim: '#f4d23c' };
}

export function LegendPortrait({
  team,
  position,
  number,
}: {
  team: string;
  position?: string;
  number?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const kit = kitFor(team);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, 12, 18);
    person(context, 2, 2, { body: kit.body, trim: kit.trim });
  }, [kit.body, kit.trim]);

  const jersey = number === undefined ? '' : `, jersey ${number}`;
  const slot = position ? ` ${position}` : ' player';

  return (
    <canvas
      ref={canvasRef}
      className="scout-portrait-canvas"
      width={12}
      height={18}
      role="img"
      aria-label={`${team}${slot}${jersey}`}
    />
  );
}

function DetailList({
  title,
  items,
  kind,
  emptyText,
}: {
  title: string;
  items: readonly string[];
  kind?: 'mvp' | 'total';
  emptyText: string;
}) {
  return (
    <section className="scout-detail">
      <h4 className={`scout-detail-heading${kind ? ` ${kind}` : ''}`}>{title}</h4>
      {items.length > 0 ? (
        <ul className="scout-detail-list">
          {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
        </ul>
      ) : (
        <p className="scout-empty-detail">{emptyText}</p>
      )}
    </section>
  );
}

function LegendCard({
  player,
  team,
  index,
  teamKey,
}: {
  player: ScoutingLegend;
  team: string;
  index: number;
  teamKey: string;
}) {
  return (
    <li className="scout-legend" data-testid={`scouting-legend-${teamKey}-${index}`}>
      <div className="scout-player">
        <LegendPortrait team={team} position={player.position} number={player.number} />
        <p className="scout-player-label">
          {player.position} <b>#{player.number}</b>
        </p>
      </div>
      <DetailList
        title="LEGEND BONUS"
        items={player.legendBonuses}
        emptyText="NO LEGEND BONUS RECORDED"
      />
      <DetailList
        title={`SUPER CUP MVP ×${player.mvpCount}`}
        items={player.mvpBonuses}
        kind="mvp"
        emptyText="NO MVP BONUS EARNED"
      />
      <DetailList
        title="TOTAL"
        items={player.totals}
        kind="total"
        emptyText="NO EFFECTIVE ATTRIBUTES RECORDED"
      />
    </li>
  );
}

function TeamSection({ team, index }: { team: ScoutingTeam; index: number }) {
  const kit = kitFor(team.team);
  const teamKey = team.label === 'YOUR TEAM' ? 'your-team' : 'opponent';
  return (
    <section
      className="scout-team"
      data-testid={`scouting-team-${teamKey}`}
      style={{ '--scout-team-body': kit.body, '--scout-team-trim': kit.trim } as CSSProperties}
      aria-labelledby={`scouting-team-heading-${index}`}
    >
      <h2 className="scout-team-heading" id={`scouting-team-heading-${index}`}>
        <span className="scout-team-label">{team.label}</span>
        <span aria-hidden="true">—</span>
        <span className="scout-team-name">{team.team}</span>
      </h2>
      <h3 className="scout-franchise-label">FRANCHISE LEGENDS</h3>
      <ul className="scout-legends" aria-label={`${team.label} franchise legends`}>
        {team.players.map((player, playerIndex) => (
          <LegendCard
            key={`${teamKey}-${player.position}-${player.number}-${playerIndex}`}
            player={player}
            team={team.team}
            index={playerIndex}
            teamKey={teamKey}
          />
        ))}
      </ul>
    </section>
  );
}

export function ScoutingReport({
  teams,
  onContinue,
}: {
  teams: readonly ScoutingTeam[];
  onContinue?: () => void;
}) {
  return (
    <section className={`scout-report${onContinue ? '' : ' scout-report-inline'}`} aria-label="Scouting report" data-testid="scouting-report">
      <header className="scout-report-header">
        <h1 className="scout-report-title">SCOUTING REPORT</h1>
      </header>
      <div className="scout-team-list">
        {teams.map((team, index) => <TeamSection key={`${team.label}-${index}`} team={team} index={index} />)}
      </div>
      {onContinue && (
        <div className="scout-continue-row">
          <button
            className="scout-continue"
            type="button"
            onClick={onContinue}
            data-testid="scouting-continue"
          >
            CONTINUE
          </button>
        </div>
      )}
    </section>
  );
}

export default ScoutingReport;
