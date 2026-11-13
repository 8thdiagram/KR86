import { looseBall } from './rare-events';
import { franchiseAthleteFactor } from './franchise-upgrades';
import { clamp, random, type Athlete, type FootballGame, type FootballInput } from './types';

export const OPTION={ends:1.8,opens:.18,spacing:27} as const;
function move(a:Athlete,x:number,y:number,speed:number,lateral:number,dt:number) {
  // Match the normal carrier's independent axes, not receiving-route speed.
  // Otherwise the supporting back falls out of pitch range before the read ends.
  a.vx=clamp((x-a.x)/dt,-speed,speed);a.vy=clamp((y-a.y)/dt,-lateral,lateral);
  a.x+=a.vx*dt;a.y=clamp(a.y+a.vy*dt,25,167);
}
/** Football positions only: never reads the selected defensive call or next input. */
export function cpuOptionPitch(g:FootballGame) {
  const l=g.live!,qb=l.athletes[5]!,back=l.athletes[6]!;
  const defenders=l.athletes.filter(d=>d.side==='defense'&&d.engaged<=l.time);
  const threatening=defenders.some(d=>Math.hypot(d.x-qb.x,d.y-qb.y)<34&&
    (d.vx*(qb.x-d.x)+d.vy*(qb.y-d.y)>0||Math.hypot(d.x-qb.x,d.y-qb.y)<18));
  const protectsPitch=defenders.some(d=>Math.hypot(d.x-back.x,d.y-back.y)<22||
    d.x>=back.x-8&&d.x<=back.x+65&&Math.abs(d.y+d.vy*.2-back.y)<18);
  return threatening&&!protectsPitch;
}
export function stepSpeedOption(g:FootballGame,input:FootballInput,dt:number) {
  const l=g.live!,o=l.option;
  if(!o||!['read','pitch'].includes(o.phase)) return;
  const qb=l.athletes[5]!,back=l.athletes[6]!;
  const target=o.ball;
  const hard=l.movement.difficulty==='hard',factor=franchiseAthleteFactor(g,back);
  move(back,target?.toX??qb.x-20,target?.toY??clamp(qb.y+o.edge*OPTION.spacing,27,165),
    (hard?73:57)*(l.movement.kickoffBoost??1)*factor,(hard?86:78)*factor,dt);
  if(o.phase==='read') {
    l.coachingSample={...l.coachingSample,optionChoice:'keep'};
    const pitch=g.possession==='home' ? input.action||input.juke : cpuOptionPitch(g);
    if(l.time>=o.until) {o.phase='kept';g.message='QB KEEPS — RUN';return;}
    if(!pitch||l.time<OPTION.opens) return;
    if(back.x>qb.x-4||Math.hypot(back.x-qb.x,back.y-qb.y)>58) return;
    o.phase='pitch';o.pitchedAt=l.time;
    o.ball={fromX:qb.x,fromY:qb.y,x:qb.x,y:qb.y,z:3,toX:Math.min(qb.x-5,back.x+back.vx*.18),
      toY:clamp(back.y+back.vy*.18,27,165),age:0,duration:clamp(Math.hypot(back.x-qb.x,back.y-qb.y)/160,.2,.36)};
    l.coachingSample={...l.coachingSample,optionChoice:'pitch',pitchTiming:l.time<1 ? 'early':'late'};
    g.message='PITCH — LIVE LATERAL';
  }
  if(o.phase!=='pitch'||!o.ball) return;
  const b=o.ball;
  b.age+=dt;const t=clamp(b.age/b.duration,0,1);
  b.x=b.fromX+(b.toX-b.fromX)*t;b.y=b.fromY+(b.toY-b.fromY)*t;b.z=3+Math.sin(t*Math.PI)*5;
  const defender=l.athletes.find(d=>d.side==='defense'&&d.engaged<=l.time&&Math.hypot(d.x-b.x,d.y-b.y)<8);
  if(defender||t>=1&&Math.hypot(back.x-b.x,back.y-b.y)>12) {
    const owner=l.offense??g.possession;
    l.turnoverSpot??=(b.x-100)/10;
    l.loose=looseBall(l.athletes,'fumble',b.x,b.y,owner,5,random(g));
    l.mode='loose';o.phase='loose';g.message='PITCH DISRUPTED — LOOSE BALL!';
    g.rareEvents??={};g.rareEvents.fumbles=(g.rareEvents.fumbles??0)+1;
    o.ball=undefined;return;
  }
  if(t>=1) {
    o.phase='received';o.receiveX=b.x;l.carrier=6;l.rusher=6;
    back.x=b.x;back.y=b.y;l.movement.player={x:back.x,y:back.y};
    l.movement.moves={...l.movement.moves!,active:undefined,furthestX:back.x,readyAt:0,backward:false};
    o.ball=undefined;g.message='RB HAS THE PITCH — RUN';
  }
}
