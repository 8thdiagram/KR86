import { clamp, type Athlete, type FootballGame } from './types';

/** Disciplined geometry, not faster defenders or guaranteed contact. */
export function containmentTarget(g:FootballGame,d:Athlete) {
  const l=g.live!;
  if(l.defense!=='contain') return;
  const los=100+l.snapSpot*10,qb=l.athletes[5]!,back=l.athletes[6]!,carrier=l.athletes[l.carrier]!;
  const unresolved=l.option&&(l.option.phase==='read'||l.option.phase==='pitch');
  if(d.role==='LB'&&(l.mode==='dropback'||l.mode==='scramble'||unresolved)) {
    // The spy keeps the QB, even with a back outside. Release only on the
    // observable pass/pitch reception; a held target or hidden choice is irrelevant.
    const learnedKeep=l.coachingPlan?.optionChoice==='keep';
    return {x:Math.max(los+(learnedKeep ? 5 : 10),qb.x+(learnedKeep ? 9 : 14)),y:qb.y,role:'contain' as const,observed:qb};
  }
  const ends=l.athletes.filter(a=>a.side==='defense'&&a.role==='DL');
  if(d.id!==ends[0]?.id&&d.id!==ends.at(-1)?.id) return;
  const edge=d.startY<96 ? -1 : 1;
  if(unresolved&&edge===l.option!.edge) {
    const early=l.coachingPlan?.optionChoice==='pitch'&&l.coachingPlan.pitchTiming==='early';
    return {x:Math.max(los+3,back.x+(early ? 10 : 14)),y:clamp(back.y+edge*(early ? 5 : 9),25,167),role:'contain' as const,observed:back};
  }
  const carrying=l.mode==='run'||l.mode==='scramble';
  if(carrying) {
    const outward=carrier.y<96 ? -1 : 1;
    if(edge!==outward||carrier.x>los+70||Math.hypot(d.x-carrier.x,d.y-carrier.y)<28) return;
    return {x:carrier.x+18,y:clamp(carrier.y+edge*12,25,167),role:'contain' as const,observed:carrier};
  }
  if(l.mode==='flight') return;
  return {x:Math.max(los+4,qb.x+20),y:96+edge*46,role:'contain' as const,observed:qb};
}
