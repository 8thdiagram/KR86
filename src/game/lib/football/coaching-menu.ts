import { coachObservations } from './coaching';
import type { Defense, FootballGame, Play, PlayId } from './types';

type Matchup=(p:PlayId,d:Defense)=>number;
type DefensiveCall={id:Defense;name:string;description:string};
/** Rank the entire eligible book. No random draws, current hidden call or usage penalty. */
export function rankOffensiveMenu(g:FootballGame,plays:Play[],matchup:Matchup) {
  const rows=coachObservations(g,g.possession), profile=g.profiles[g.possession];
  const distance=g.target-g.spot, trailing=g.score[g.possession]<g.score[g.possession==='home'?'away':'home'];
  const hurry=g.quarter>=4&&g.clock<60&&trailing;
  const defenses=rows.reduce((n,r)=>n+r.w,0);
  const failures=rows.filter(r=>r.o.stopped), failureWeight=failures.reduce((n,r)=>n+r.w,0);
  const outside=rows.filter(r=>r.o.success&&(r.o.kind==='run'||r.o.scramble)&&
    (r.o.lane!==undefined&&r.o.lane!==0||r.o.play==='sweep'||r.o.play==='speed-option'));
  const outsideWeight=outside.reduce((n,r)=>n+r.w,0);
  const scores=plays.map((p,index)=>{
    let score=(p.kind==='run' ? profile.run : 1-profile.run)*.45;
    const defaults=profile.run>=.6 ? ['power','sweep','counter','draw','slant','post'] : ['power','draw','slant','screen','cross','post'];
    if(defaults.includes(p.id)) score+=.45;
    if(p.kind==='run') score+=(profile.back-.65)*.4+(profile.line-.7)*.3;
    if(p.kind==='pass') score+=(profile.qb-.7)*.4+(profile.receivers-.7)*.3;
    if(distance<=2.5) score+=['sneak','power','counter','speed-option'].includes(p.id) ? .8 : p.depth>=17 ? -.5 : 0;
    if(distance>=9&&g.down>=3) score+=p.kind==='pass'&&p.depth>=distance-3 ? .65 : p.kind==='run' ? -.45 : 0;
    if(hurry) score+=p.kind==='pass' ? .5 : -.5;
    if(g.spot>88&&p.depth>17) score-=.45;
    if(p.id==='flood') {
      score+=(profile.qb+profile.receivers-1.4)*.4;
      const zone=rows.filter(r=>r.o.defense==='pass'||r.o.defense==='prevent').reduce((n,r)=>n+r.w,0);
      score+=defenses>0 ? zone/defenses*.85 : 0;
    }
    if(p.id==='speed-option') score+=(profile.qb+profile.back-1.35)*.3+Math.min(.9,outsideWeight*.25);
    // Working calls stay high, regardless of how often they have been used.
    const own=rows.filter(r=>r.o.play===p.id);
    const wins=own.filter(r=>r.o.success).reduce((n,r)=>n+r.w,0);
    const stopped=own.filter(r=>r.o.stopped).reduce((n,r)=>n+r.w,0);
    score+=wins*.6-Math.max(0,stopped-1)*1.4;
    if(failures.length>=2&&failureWeight>=1.4)
      score+=failures.reduce((n,r)=>n+r.w*matchup(p.id,r.o.defense),0)/failureWeight*1.8;
    if(p.kind==='kick') score+=g.down===4 ? 2 : 1.5;
    if(p.id==='fake-punt') score-=.8;
    return {p,score:score-index*.0001};
  }).sort((a,b)=>b.score-a.score);
  const ranked=scores.map(s=>s.p);
  // Keep one genuine run and pass unless a kick-only situation ever exists.
  const selected=ranked.slice(0,6);
  for(const kind of ['run','pass'] as const) if(!selected.some(p=>p.kind===kind)) {
    const candidate=ranked.find(p=>p.kind===kind);
    if(candidate) selected[selected.length-1]=candidate;
  }
  return [...selected,...ranked.filter(p=>!selected.includes(p))];
}
export function rankDefensiveMenu(g:FootballGame,calls:DefensiveCall[],matchup:Matchup) {
  const rows=coachObservations(g,g.possession), distance=g.target-g.spot;
  const short=distance<=2.5||g.spot>95, long=distance>=9;
  const base:Defense[]=short ? ['goal-line','run-blitz','run','blitz','man','pass','contain','prevent']
    : long ? ['pass','prevent','man','blitz','contain','run','run-blitz','goal-line']
    : ['run','pass','man','blitz','contain','run-blitz','prevent','goal-line'];
  const failed=rows.filter(r=>r.o.success), total=failed.reduce((n,r)=>n+r.w,0);
  return calls.map(d=>{
    let score=(8-base.indexOf(d.id))*.09;
    const own=rows.filter(r=>r.o.defense===d.id);
    score+=own.reduce((n,r)=>n+r.w*(r.o.stopped ? .6 : r.o.success ? -1.4 : 0),0);
    if(failed.length>=2&&total>=1.4) score-=failed.reduce((n,r)=>n+r.w*matchup(r.o.play,d.id),0)/total*1.8;
    if(d.id==='contain') score+=failed.filter(r=>r.o.play==='sweep'||r.o.play==='speed-option'||r.o.scramble)
      .reduce((n,r)=>n+r.w,0)*.35;
    const profile=g.profiles[g.possession==='home'?'away':'home'];
    score+=(d.id==='blitz'||d.id==='run-blitz' ? profile.rush-.65 : d.id==='pass'||d.id==='man' ? profile.coverage-.65 : 0)*.3;
    if(g.quarter>=4&&g.clock<40&&g.score[g.possession==='home'?'away':'home']>g.score[g.possession]&&distance>5)
      score+=d.id==='prevent'||d.id==='pass' ? .7 : 0;
    return {d,score};
  }).sort((a,b)=>b.score-a.score).map(r=>r.d);
}
