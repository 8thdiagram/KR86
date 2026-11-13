import type { FootballGame, LivePlay } from './types';
/** Team yards keep their established source; runner attribution is additive. */
export function creditRusher(g:FootballGame,l:LivePlay,gain:number,reason:string,detail?:string) {
  if(l.passCaught||['sack','incomplete','interception'].includes(reason)) return;
  const role=l.athletes[l.rusher??l.carrier]?.role;
  if(role!=='QB'&&role!=='RB') return;
  const side=l.offense??g.possession;
  g.rushing??={};g.rushing[side]??={};
  const stat=g.rushing[side]![role]??={carries:0,yards:0,touchdowns:0,fumbles:0};
  stat.carries++;stat.yards+=gain;
  if(reason==='touchdown') stat.touchdowns++;
  if(reason==='fumble'||detail?.startsWith('FUMBLE —')) stat.fumbles++;
}
