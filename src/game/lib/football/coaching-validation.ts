import { DEFENSE_IDS, type FootballGame } from './types';

const plays=['power','sweep','counter','draw','sneak','slant','screen','out','cross','post','verticals','play-action','fake-punt','flood','speed-option'];
const number=(v: unknown,min: number,max: number): v is number => typeof v==='number' && Number.isFinite(v) && v>=min && v<=max;
const integer=(v: unknown,min: number,max: number) => number(v,min,max) && Number.isInteger(v);
const optional=(v: unknown,check: (v: unknown)=>boolean) => v===undefined || check(v);
const lane=(v: unknown) => v===-1 || v===0 || v===1;
const sample=(s: unknown) => {
  if (!s || typeof s!=='object') return false;
  const x=s as Record<string,unknown>;
  return optional(x.target,v=>integer(v,0,21)) && optional(x.targetLane,lane) &&
    optional(x.timing,v=>integer(v,0,20)) && optional(x.qbLane,lane) &&
    optional(x.lane,lane) && optional(x.entry,lane) && optional(x.cutback,v=>typeof v==='boolean') &&
    optional(x.scramble,v=>typeof v==='boolean') && optional(x.optionChoice,v=>v==='keep'||v==='pitch') &&
    optional(x.pitchTiming,v=>v==='early'||v==='late');
};
/** Optional additive fields keep historical saves valid; corrupt new memory is never silently accepted. */
export function validCoaching(g: FootballGame) {
  if (g.coaching!==undefined) {
    const c=g.coaching;
    if (!c || c.version!==1 || !Array.isArray(c.observations) || c.observations.length>64) return false;
    for(const o of c.observations) {
      if (!o || !sample(o) || !integer(o.at,0,g.plays) || !['home','away'].includes(o.offense) ||
        !plays.includes(o.play) || !DEFENSE_IDS.includes(o.defense) || !['run','pass'].includes(o.kind) ||
        !number(o.depth,0,100) || !number(o.gain,-120,120) ||
        ![o.success,o.stopped,o.sack,o.turnover,o.completed].every(v=>typeof v==='boolean')) return false;
    }
  }
  const l=g.live;
  if (l?.coachingSample!==undefined && !sample(l.coachingSample)) return false;
  const p=l?.coachingPlan;
  if (p!==undefined && (!p || !['inside','edge','deep','lane'].includes(p.focus) ||
    !number(p.strength,0,.85) || !lane(p.lane) || !optional(p.timing,v=>integer(v,0,20))||
    !optional(p.optionChoice,v=>v==='keep'||v==='pitch')||!optional(p.pitchTiming,v=>v==='early'||v==='late'))) return false;
  return true;
}
