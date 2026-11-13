export const KICK_TEAM_COLORS = {
  red: '#d9363e', white: '#faf8ef', black: '#151820', blue: '#2867cc',
  purple: '#7945ad', yellow: '#f4d23d', orange: '#ef8831', navy: '#182d50',
  silver: '#c3cbd4', maroon: '#842d43', gray: '#858d97', green: '#25834b',
  teal: '#168b91', 'light blue': '#79c5ed', gold: '#d8af42', brown: '#75482e',
} as const;
type TeamColor = keyof typeof KICK_TEAM_COLORS;
const team = <Name extends string>(name: Name, primary: TeamColor, secondary: TeamColor) =>
  ({ name, primary, secondary, body: KICK_TEAM_COLORS[primary], trim: KICK_TEAM_COLORS[secondary] });

export const KICK_TEAMS = [
  team('Redbirds', 'red', 'white'),
  team('Black Cats', 'black', 'blue'),
  team('Crows', 'purple', 'black'),
  team('Hawks', 'black', 'red'),
  team('Blacksmiths', 'black', 'yellow'),
  team('Bison', 'blue', 'red'),
  team('Tigers', 'black', 'orange'),
  team('Grizzlies', 'navy', 'orange'),
  team('Stallions', 'orange', 'navy'),
  team('Pride', 'blue', 'silver'),
  team('Wranglers', 'silver', 'navy'),
  team('Ponies', 'white', 'blue'),
  team('Pirates', 'maroon', 'gray'),
  team('Albatross', 'blue', 'green'),
  team('Talons', 'green', 'silver'),
  team('Porpoises', 'teal', 'orange'),
  team('Lightning', 'light blue', 'yellow'),
  team('Big Blue', 'blue', 'white'),
  team('Cheeseheads', 'green', 'yellow'),
  team('Goldminers', 'red', 'gold'),
  team('Bulldogs', 'brown', 'orange'),
  team('Marauders', 'black', 'silver'),
  team('Arrowheads', 'red', 'yellow'),
  team('Angels', 'gold', 'black'),
  team('Comanches', 'maroon', 'yellow'),
  team('Militia', 'navy', 'silver'),
  team('Norsemen', 'purple', 'yellow'),
  team('Bighorns', 'blue', 'yellow'),
  team('Flyers', 'white', 'green'),
  team('Roughnecks', 'light blue', 'red'),
  team('Leopards', 'teal', 'gold'),
  team('Bulls', 'red', 'navy'),
] as const;
export type KickTeamName = typeof KICK_TEAMS[number]['name'];
// Retain old saved matchups while displaying the team's current name.
type SavedKickTeamName = KickTeamName | 'Generals';
const currentTeamName = (name: SavedKickTeamName) => name === 'Generals' ? 'Comanches' : name;
export type KickMatchup = { player: SavedKickTeamName; opponent: SavedKickTeamName };
export const isKickMatchup = (value: unknown): value is KickMatchup => {
  if (!value || typeof value !== 'object') return false;
  const v = value as KickMatchup;
  return currentTeamName(v.player) !== currentTeamName(v.opponent) &&
    KICK_TEAMS.some(t => t.name === currentTeamName(v.player)) && KICK_TEAMS.some(t => t.name === currentTeamName(v.opponent));
};
/** Cosmetic randomness is separate from the deterministic football physics. */
export function createKickMatchup(random = Math.random): KickMatchup {
  const pick = (length: number) => {
    const n = random();
    if (!Number.isFinite(n) || n < 0 || n >= 1) throw new Error('Invalid team draw');
    return Math.floor(n * length);
  };
  const player = pick(KICK_TEAMS.length);
  const other = pick(KICK_TEAMS.length - 1);
  return { player: KICK_TEAMS[player]!.name, opponent: KICK_TEAMS[other >= player ? other + 1 : other]!.name };
}
/** Legacy attempts without team metadata remain readable. */
export function kickMatchupTeams(matchup?: KickMatchup) {
  const selected = matchup ?? { player: 'Big Blue', opponent: 'Redbirds' };
  if (!isKickMatchup(selected)) throw new Error('Invalid football matchup');
  return { player: KICK_TEAMS.find(t => t.name === currentTeamName(selected.player))!,
    opponent: KICK_TEAMS.find(t => t.name === currentTeamName(selected.opponent))! };
}
