/** Authoritative role-specific roster. Percentages are totals, never stacked
 * across positions. QB entries encode passing/rushing separately. */
export type LegendPosition = 'QB' | 'RB' | 'WR' | 'TE' | 'LB' | 'CB' | 'S' | 'KR' | 'K';
export type Legend = Readonly<{ team: string; number: number; position: LegendPosition;
  boost: number; passing: number; rushing: number; identity: string }>;
const rows = [
  'Redbirds|11:WR:10,35:CB:10,36:KR:7,1:K:10',
  'Black Cats|1:QB:5/5,59:LB:10,89:WR:10,89:KR:16,4:K:10',
  'Crows|52:LB:20,20:S:10,84:KR:20,9:K:10',
  'Hawks|21:CB:20,11:WR:10,2:QB:10/0,21:KR:22,3:K:10',
  'Blacksmiths|58:LB:10,43:S:10,26:KR:21,1:K:10',
  'Bison|32:RB:10,17:QB:5/5,24:KR:15,2:K:10',
  'Tigers|85:WR:10,14:QB:10/0,34:KR:4,3:K:10',
  'Grizzlies|34:RB:20,50:LB:10,23:KR:32,9:K:10',
  'Stallions|7:QB:5/5,30:RB:10,58:LB:10,80:KR:25,1:K:10',
  'Pride|20:RB:20,81:WR:10,23:KR:27,4:K:10',
  'Wranglers|22:RB:10,12:QB:5/5,9:KR:14,5:K:10',
  'Ponies|18:QB:20/0,88:WR:10,80:KR:1,13:K:10',
  'Pirates|55:LB:10,20:CB:10,22:KR:6,7:K:10',
  'Albatross|80:WR:10,25:CB:10,16:KR:11,4:K:10',
  'Talons|20:S:10,10:KR:17,4:K:10',
  'Porpoises|13:QB:10/0,54:LB:10,19:KR:9,1:K:10',
  'Lightning|21:RB:10,55:LB:10,85:TE:10,43:KR:18,9:K:10',
  'Big Blue|56:LB:20,10:QB:10/0,13:WR:10,30:KR:19,9:K:10',
  'Cheeseheads|12:QB:5/5,21:CB:10,84:WR:10,81:KR:23,2:K:10',
  'Goldminers|80:WR:20,16:QB:20/0,42:S:10,19:KR:12,14:K:10',
  'Bulldogs|82:TE:10,16:KR:28,4:K:10',
  'Marauders|34:RB:20,81:WR:10,12:KR:8,11:K:10',
  'Arrowheads|15:QB:10/10,87:TE:10,58:LB:10,82:KR:29,3:K:10',
  'Angels|9:QB:10/0,57:LB:10,33:KR:13,7:K:10',
  'Comanches|28:CB:10,81:WR:10,44:RB:10,30:KR:30,3:K:10',
  'Militia|12:QB:20/0,87:TE:10,83:WR:10,27:KR:2,4:K:10',
  'Norsemen|84:WR:20,28:RB:10,84:KR:31,8:K:10',
  'Bighorns|29:RB:10,13:QB:10/0,19:KR:10,14:K:10',
  'Flyers|24:CB:10,28:RB:10,29:KR:24,5:K:10',
  'Roughnecks|34:RB:10,1:QB:10/0,84:KR:26,2:K:10',
  'Leopards|28:RB:10,82:WR:10,32:KR:5,10:K:10',
  'Bulls|80:WR:10,11:KR:3,15:K:10',
] as const;
export const LEGENDS: readonly Legend[] = Object.freeze(rows.flatMap(row => {
  const [team, entries] = row.split('|') as [string, string];
  return entries.split(',').map(entry => {
    const [jersey, role, allocation] = entry.split(':') as [string, LegendPosition, string];
    const [amount, rushing = 0] = allocation.split('/').map(Number);
    const passing = role === 'QB' ? amount! : 0;
    const identityRole = role === 'KR' && team === 'Black Cats' ? 'WR'
      : role === 'KR' && team === 'Hawks' ? 'CB' : role;
    return Object.freeze({ team, number: Number(jersey), position: role, passing,
      rushing, boost: amount! + rushing, identity: `${team}:${identityRole}:${jersey}` });
  });
}));
const byTeam = new Map<string, ReadonlyMap<LegendPosition, Legend>>();
for (const row of rows) {
  const team = row.split('|')[0]!;
  byTeam.set(team, new Map(LEGENDS.filter(p => p.team === team).map(p => [p.position, p])));
}
export const legendaryPlayer = (team: string, position: LegendPosition) =>
  byTeam.get(team === 'Generals' ? 'Comanches' : team)?.get(position);
export const legendaryRoleFactor = (team: string, position: LegendPosition) =>
  1 + (legendaryPlayer(team, position)?.boost ?? 0) / 100;
/** Classic's final coverage wave: linebacker, corner, deep safety. Stable
 * unit slots, not jersey-number matching or newly spawned athletes. */
export const classicLegendaryPlayer = (team: string, id: number) =>
  id === 8 ? legendaryPlayer(team, 'LB') : id === 9 ? legendaryPlayer(team, 'CB')
    : id === 10 ? legendaryPlayer(team, 'S') : undefined;
