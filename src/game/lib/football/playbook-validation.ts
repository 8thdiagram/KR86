import type { FootballGame } from './types';
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
export function validExpandedPlaybook(g:FootballGame) {
  if(g.rushing!==undefined) {
    if(!g.rushing||typeof g.rushing!=='object'||Array.isArray(g.rushing)||Object.keys(g.rushing).some(k=>!['home','away'].includes(k))) return false;
    for(const side of Object.values(g.rushing)) {
      if(!side||typeof side!=='object'||Array.isArray(side)||Object.keys(side).some(k=>!['QB','RB'].includes(k))) return false;
      for(const r of Object.values(side)) if(!r||!finite(r.yards)||
        ![r.carries,r.touchdowns,r.fumbles].every(n=>Number.isSafeInteger(n)&&n>=0)) return false;
    }
  }
  const l=g.live;
  if(l?.rusher!==undefined&&(!Array.isArray(l.athletes)||!Number.isInteger(l.rusher)||l.athletes[l.rusher]?.side!=='offense')) return false;
  if(l?.option!==undefined) {
    const o=l.option,b=o?.ball;
    if(!o||l.play!=='speed-option'||!['read','pitch','kept','received','loose'].includes(o.phase)||
      ![-1,1].includes(o.edge)||!finite(o.until)||o.until<0||o.until>5||
      o.pitchedAt!==undefined&&(!finite(o.pitchedAt)||o.pitchedAt<0||o.pitchedAt>l.time)||
      o.receiveX!==undefined&&!finite(o.receiveX)||o.phase==='pitch'&&!b) return false;
    if(b&&(![b.x,b.y,b.z,b.fromX,b.fromY,b.toX,b.toY,b.age,b.duration].every(finite)||
      b.duration<.15||b.duration>.5||b.age<0||b.age>b.duration+.02||b.z<0||b.z>9||
      (b.toX-b.fromX)*(l.fieldFrame===-1 ? -1 : 1)>0)) return false;
  }
  return true;
}
