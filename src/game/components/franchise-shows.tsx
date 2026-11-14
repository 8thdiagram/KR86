import { useEffect, useRef, useState } from 'react';
import { KICK_TEAMS } from '../lib/kick-return-teams';
import { createFranchiseAudio, type FranchiseAudio } from './franchise-audio';

const W = 256, H = 144;
const kit = (name: string) => KICK_TEAMS.find(t => t.name === name) ?? KICK_TEAMS[0]!;
type Spark = { x: number; y: number; vx: number; vy: number; life: number; c: string };
const SPARK_COLORS = ['#f4d23d', '#d9363e', '#79c5ed', '#faf8ef', '#ef8831', '#25834b', '#7945ad'];

function useAudio() {
  const a = useRef<FranchiseAudio | null>(null);
  useEffect(() => () => { a.current?.close(); a.current = null; }, []);
  return () => (a.current ??= createFranchiseAudio());
}
function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
/** 8x14 football player/person sprite. Jersey = primary, pants white, helmet = secondary. */
export function person(ctx: CanvasRenderingContext2D, x: number, y: number, o: { body: string; trim: string; pants?: string; arms?: number; leg?: number; helmet?: boolean; skirt?: boolean }) {
  const leg = Math.round(o.leg ?? 0), arms = o.arms ?? 0;
  px(ctx, x + 2, y, 4, 4, o.helmet === false ? '#c98d5c' : o.trim);
  if (o.helmet === false) px(ctx, x + 2, y, 4, 1, '#3b2414');
  px(ctx, x + 1, y + 4, 6, 5, o.body);
  if (o.skirt) px(ctx, x, y + 8, 8, 2, o.trim);
  px(ctx, x + 2, y + 9, 4, 2, o.pants ?? '#faf8ef');
  px(ctx, x + 2, y + 11 - leg, 1, 3 + leg, '#faf8ef'); px(ctx, x + 5, y + 11 + leg, 1, 3 - leg, '#faf8ef');
  if (arms > 0) { px(ctx, x, y + 1 - arms, 1, 4, o.body); px(ctx, x + 7, y + 1 - arms, 1, 4, o.body); }
  else { px(ctx, x, y + 4, 1, 4, o.body); px(ctx, x + 7, y + 4, 1, 4, o.body); }
}
function stadium(ctx: CanvasRenderingContext2D, t: number, night = true) {
  px(ctx, 0, 0, W, H, night ? '#0b1430' : '#2a6fb0');
  for (let i = 0; i < 30; i++) px(ctx, (i * 53) % W, (i * 29) % 50, 1, 1, '#faf8ef');
  px(ctx, 0, 62, W, 26, '#2a2f45');
  for (let r = 0; r < 4; r++) for (let i = 0; i < 64; i++) {
    const bob = Math.sin(t * 9 + i * 1.7 + r) > .6 ? -1 : 0;
    px(ctx, i * 4 + (r % 2) * 2, 64 + r * 6 + bob, 2, 2, SPARK_COLORS[(i + r * 3) % SPARK_COLORS.length]!);
  }
  px(ctx, 0, 88, W, H - 88, '#25834b');
  for (let i = 0; i < 9; i++) px(ctx, 8 + i * 30, 88, 1, H - 88, '#5fb27a');
  px(ctx, 0, 88, W, 1, '#faf8ef');
}
function fireworks(sparks: Spark[], ctx: CanvasRenderingContext2D, dt: number, rate: number, audio?: FranchiseAudio) {
  if (Math.random() < rate * dt) {
    const x = 30 + Math.random() * 196, y = 14 + Math.random() * 36, c = SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)]!;
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, s = 24 + Math.random() * 18; sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.1, c }); }
    audio?.pop();
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]!; s.life -= dt; s.vy += 26 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.life <= 0) { sparks.splice(i, 1); continue; }
    px(ctx, s.x, s.y, s.life > .7 ? 2 : 1, s.life > .7 ? 2 : 1, s.c);
  }
}
function useCanvasLoop(draw: (ctx: CanvasRenderingContext2D, t: number, dt: number) => void, running = true, realTime = false) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw); drawRef.current = draw;
  const tRef = useRef(0);
  useEffect(() => {
    if (!running) return;
    let frame = 0, prev = performance.now();
    const go = (now: number) => {
      const elapsed = Math.max(0, (now - prev) / 1000);
      const dt = realTime ? elapsed : Math.min(.1, elapsed); prev = now; tRef.current += dt;
      const ctx = ref.current?.getContext('2d'); if (ctx) drawRef.current(ctx, tRef.current, dt);
      frame = requestAnimationFrame(go);
    };
    frame = requestAnimationFrame(go);
    return () => cancelAnimationFrame(frame);
  }, [running, realTime]);
  return ref;
}

/* ───────── SUPER CUP INTRO ───────── */
export function SuperCupIntro({ home, away, onDone }: { home: string; away: string; onDone: () => void }) {
  const audio = useAudio();
  const sparks = useRef<Spark[]>([]);
  const [t, setT] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const ref = useCanvasLoop((ctx, time, dt) => {
    stadium(ctx, time); fireworks(sparks.current, ctx, dt, 2.6, soundOn ? audio() : undefined);
    if (Math.floor(time * 4) % 7 === 0) { ctx.fillStyle = 'rgba(250,248,239,.12)'; ctx.fillRect(0, 0, W, H); }
    const a = kit(home), b = kit(away);
    for (let i = 0; i < 5; i++) {
      person(ctx, 30 + i * 12, 104, { body: a.body, trim: a.trim, arms: Math.sin(time * 6 + i) > 0 ? 2 : 0, leg: Math.sin(time * 8 + i) });
      person(ctx, 170 + i * 12, 104, { body: b.body, trim: b.trim, arms: Math.sin(time * 6 + i + 1) > 0 ? 2 : 0, leg: Math.sin(time * 8 + i + 2) });
    }
  });
  useEffect(() => { const id = setInterval(() => setT(x => x + .25), 250); return () => clearInterval(id); }, []);
  const start = () => {
    const a = audio(); a.unlock(); a.resume(); a.crowd(true); a.fanfare(); a.say('The Super Cup!', .9); setSoundOn(true);
  };
  return <section className="frx-show" data-testid="franchise-supercup-intro">
    <canvas ref={ref} width={W} height={H} className="frx-canvas" aria-label={`Fireworks over the stadium. ${home} versus ${away}.`} role="img" />
    <div className="frx-over">
      {t >= .5 && <h2 className="frx-big frx-pop">CONGRATULATIONS!</h2>}
      {t >= 1.5 && <p className="frx-mid frx-pop">YOU MADE THE SUPER CUP!</p>}
      {t >= 2.75 && <p className="frx-vs frx-pop" data-testid="text-supercup-teams">
        <span style={{ color: kit(home).body === '#151820' ? kit(home).trim : kit(home).body }}>{home.toUpperCase()}</span>
        <small>VS.</small>
        <span style={{ color: kit(away).body === '#151820' ? kit(away).trim : kit(away).body }}>{away.toUpperCase()}</span></p>}
      {t >= 4 && <p className="frx-big frx-gold frx-pop">THE SUPER CUP!</p>}
    </div>
    <div className="frx-bar">
      <button type="button" className="frx-btn ghost" onClick={start} disabled={soundOn} data-testid="button-intro-sound">{soundOn ? 'CROWD + FANFARE ON' : 'PLAY CROWD + FANFARE'}</button>
      <button type="button" className="frx-btn" disabled={t < 4.5} onClick={() => { audio().stopAll(); onDone(); }} data-testid="button-supercup-kickoff">KICKOFF</button>
    </div>
  </section>;
}

/* ───────── HALFTIME ───────── */
type Pt = [number, number];
const FORMATIONS: { name: string; at: (i: number, n: number) => Pt }[] = [
  { name: 'STRAIGHT LINE', at: i => [56 + i * 20, 104] },
  { name: 'DIAGONAL', at: i => [52 + i * 20, 92 + i * 5] },
  { name: 'FACE OFF', at: i => i < 4 ? [50 + i * 12, 104] : [150 + (i - 4) * 12, 104] },
  { name: 'PYRAMID', at: i => [[128, 92], [116, 103], [140, 103], [104, 114], [128, 114], [152, 114], [92, 125], [164, 125]][i] as Pt },
  { name: 'ARMS UP · TOGETHER', at: i => [68 + i * 17, 108 + (i % 2) * 8] },
];
export function HalftimeShow({ home, away, remaining, onTick, onDone, blocked = false }: { home: string; away: string; remaining: number; onTick: (r: number) => void; onDone: () => void; blocked?: boolean }) {
  const audio = useAudio();
  const [paused, setPaused] = useState(false);
  const [left, setLeft] = useState(remaining);
  const [voice, setVoice] = useState<'off' | 'on' | 'unavailable'>('off');
  const leftRef = useRef(remaining);
  const elapsedShow = () => 15 - leftRef.current;
  const lastChant = useRef(-1);
  const doneRef = useRef(false);
  const cbs = useRef({ onTick, onDone }); cbs.current = { onTick, onDone };
  const a = kit(home), b = kit(away);
  const CHANTS = ['GO TEAM!', 'WIN! WIN! WIN!', "LET'S GO!"];
  const ref = useCanvasLoop((ctx, _t, dt) => {
    if (!paused && !blocked && !doneRef.current) {
      leftRef.current = Math.max(0, leftRef.current - dt);
      if (leftRef.current <= 0) { doneRef.current = true; audio().stopAll(); cbs.current.onDone(); }
    }
    const e = elapsedShow();
    stadium(ctx, e, false);
    // Band marching across the field.
    const seg = Math.floor(e / 3) % FORMATIONS.length, k = Math.min(1, (e % 3) / .9);
    for (let i = 0; i < 10; i++) {
      const col = i % 5, row = Math.floor(i / 5);
      const bx = (seg % 2 ? 210 - e * 7 : 20 + e * 7) + col * 11, by = 94 + row * 22 + (seg === 3 ? (col % 2) * 6 : 0);
      const step = Math.sin(e * 10 + col) ;
      person(ctx, bx, by, { body: '#182d50', trim: '#d8af42', pants: '#faf8ef', leg: step });
      if (i % 3 === 0) { px(ctx, bx + 1, by + 8, 6, 5, '#d9363e'); px(ctx, bx + 1, by + 8, 6, 1, '#faf8ef'); if (Math.sin(e * 12) > 0) px(ctx, bx + 8, by + 4, 1, 4, '#faf8ef'); }
      else { px(ctx, bx + 7, by + 5, 5, 1, '#f4d23d'); px(ctx, bx + 11, by + 4, 2, 3, '#f4d23d'); }
    }
    // Cheerleaders: synchronized formation changes.
    const from = FORMATIONS[(seg + FORMATIONS.length - 1) % FORMATIONS.length]!, to = FORMATIONS[seg]!;
    const beat = Math.floor(e * 4) % 4;
    for (let i = 0; i < 8; i++) {
      const p0 = from.at(i, 8), p1 = to.at(i, 8);
      const x = p0[0] + (p1[0] - p0[0]) * k, y = p0[1] + (p1[1] - p0[1]) * k - 30 + (beat === 1 ? -2 : 0);
      const team = i % 2 ? b : a;
      const facing = to.name === 'FACE OFF' && i >= 4;
      person(ctx, x, y, { body: team.body, trim: '#c98d5c', helmet: false, skirt: true, arms: beat % 2 === 0 || to.name.startsWith('ARMS') ? 3 : 0, leg: k < 1 ? Math.sin(e * 14) : 0 });
      if (beat % 2 === 0 || to.name.startsWith('ARMS')) { px(ctx, x - 2, y - 4, 3, 3, team.trim); px(ctx, x + 7, y - 4, 3, 3, team.trim); }
      else { px(ctx, facing ? x - 2 : x + 7, y + 6, 3, 3, team.trim); }
    }
    const chant = Math.floor(e / 5);
    if (chant !== lastChant.current && !paused) {
      lastChant.current = chant;
      if (voice === 'on') audio().say(CHANTS[chant % 3]!.replace(/!/g, ''), 1.7);
    }
    ctx.fillStyle = '#faf8ef'; ctx.font = '7px monospace'; ctx.fillText(to.name, 6, 10);
  }, true, true);
  useEffect(() => {
    const id = setInterval(() => { setLeft(leftRef.current); if (!doneRef.current) cbs.current.onTick(leftRef.current); }, 500);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const freeze = () => { if (document.hidden) { setPaused(true); audio().stopAll(); cbs.current.onTick(leftRef.current); } };
    const blur = () => { setPaused(true); audio().stopAll(); cbs.current.onTick(leftRef.current); };
    document.addEventListener('visibilitychange', freeze); window.addEventListener('blur', blur); window.addEventListener('pagehide', blur);
    return () => { document.removeEventListener('visibilitychange', freeze); window.removeEventListener('blur', blur); window.removeEventListener('pagehide', blur); };
  }, []);
  const startAudio = () => {
    const au = audio(); au.unlock(); au.resume(); au.march(true); au.crowd(true);
    setVoice(au.speechAvailable ? 'on' : 'unavailable');
    if (au.speechAvailable) au.say('Go team!', 1.7);
  };
  const chantNow = ['GO TEAM!', 'WIN! WIN! WIN!', "LET'S GO!"][Math.floor((15 - left) / 5) % 3];
  return <section className="frx-show" data-testid="franchise-halftime" data-remaining={left.toFixed(1)}>
    <canvas ref={ref} width={W} height={H} className="frx-canvas" role="img" aria-label="Super Cup halftime show: cheerleaders and a marching band" />
    <div className="frx-over frx-top">
      <p className="frx-mid">SUPER CUP HALFTIME</p>
      <p className="frx-chant frx-pop" key={chantNow}>{chantNow}</p>
    </div>
    <div className="frx-bar">
      <span className="frx-timer" data-testid="text-halftime-remaining">{paused ? 'PAUSED' : 'SHOW'} · {Math.ceil(left)}s</span>
      <button type="button" className="frx-btn ghost" onClick={startAudio} disabled={voice !== 'off'} data-testid="button-halftime-sound">
        {voice === 'off' ? 'PLAY BAND + CHANTS' : voice === 'on' ? 'BAND + CHANTS ON' : 'BAND ON · VOICE UNAVAILABLE IN THIS BROWSER'}</button>
      <button type="button" className="frx-btn" onClick={() => { setPaused(p => !p); if (!paused) { audio().stopAll(); onTick(leftRef.current); } else if (voice !== 'off') { const au = audio(); au.resume(); au.march(true); au.crowd(true); } }}
        data-testid="button-halftime-pause">{paused ? 'RESUME SHOW' : 'PAUSE'}</button>
    </div>
  </section>;
}

/* ───────── TROPHY CEREMONY ───────── */
export type CeremonyMvp = { team: string; slot: string; long: string; bonus: string; total: number; summary?: string };
export function TrophyCeremony({ winner, loser, winScore, loseScore, humanWon, onDone, mvp }: { winner: string; loser: string; winScore: number; loseScore: number; humanWon: boolean; onDone: () => void; mvp?: CeremonyMvp }) {
  const audio = useAudio();
  const sparks = useRef<Spark[]>([]);
  const confetti = useRef(Array.from({ length: 70 }, (_, i) => ({ x: (i * 37) % W, y: -((i * 23) % H), c: SPARK_COLORS[i % SPARK_COLORS.length]! })));
  const [t, setT] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const w = kit(winner);
  const ref = useCanvasLoop((ctx, time, dt) => {
    stadium(ctx, time);
    fireworks(sparks.current, ctx, dt, time > 4 ? 3 : .8, soundOn && time > 4 ? audio() : undefined);
    px(ctx, 96, 112, 80, 6, '#d8af42'); px(ctx, 96, 118, 80, 4, '#842d43');
    // Teammates celebrating.
    for (let i = 0; i < 6; i++) person(ctx, 20 + i * 11, 112 + (i % 2) * 6 - (time > 4 && Math.sin(time * 9 + i) > 0 ? 3 : 0), { body: w.body, trim: w.trim, arms: time > 4 ? 2 : 0 });
    // Captain walks forward, receives and raises the trophy.
    const cx = Math.min(130, 86 + time * 16), walking = cx < 130;
    const raised = time > 4.6;
    person(ctx, cx, 98, { body: w.body, trim: w.trim, leg: walking ? Math.sin(time * 12) : 0, arms: raised ? 3 : 0 });
    px(ctx, cx + 2, 103, 4, 1, '#faf8ef'); px(ctx, cx + 3, 103, 2, 3, '#faf8ef'); // captain C
    // Presenter in a suit.
    person(ctx, 152, 98, { body: '#3b3f52', trim: '#c98d5c', pants: '#3b3f52', helmet: false, arms: time < 3.6 ? 1 : 0 });
    const trophyX = time < 3.6 ? 148 : time < 4.6 ? 148 - (time - 3.6) * 14 : cx + 1;
    const trophyY = time < 4.6 ? 99 : 84 - Math.abs(Math.sin(time * 4)) * 2;
    px(ctx, trophyX + 2, trophyY, 3, 7, '#f4d23d'); px(ctx, trophyX + 1, trophyY + 2, 5, 1, '#d8af42'); px(ctx, trophyX + 1, trophyY + 7, 5, 2, '#c3cbd4');
    px(ctx, trophyX + 3, trophyY - 2, 2, 2, '#faf8ef');
    if (time > 4) for (const c of confetti.current) { c.y += 30 * dt; c.x += Math.sin(time * 3 + c.y) * .3; if (c.y > H) c.y = -4; px(ctx, c.x, c.y, 2, 1, c.c); }
  });
  useEffect(() => { const id = setInterval(() => setT(x => x + .25), 250); return () => clearInterval(id); }, []);
  const start = () => {
    const a = audio(); a.unlock(); a.resume(); a.crowd(true); a.fanfare(); setSoundOn(true);
    setTimeout(() => a.fanfare(), 1700);
    if (mvp) setTimeout(() => a.say(`Super Cup M V P: ${mvp.team} ${mvp.long.toLowerCase()}. Plus twenty percent ${mvp.bonus.toLowerCase()}.`, 1), 2600);
  };
  return <section className="frx-show" data-testid="franchise-ceremony" data-human-won={humanWon}>
    <canvas ref={ref} width={W} height={H} className="frx-canvas" role="img" aria-label={`${winner} captain receives the championship trophy`} />
    <div className="frx-over">
      {humanWon ? <>
        {t >= 4.5 && <h2 className="frx-big frx-pop">CONGRATULATIONS!</h2>}
        {t >= 5 && <p className="frx-mid frx-gold frx-pop">YOU WON THE SUPER CUP!</p>}
      </> : <>
        {t >= 1 && <h2 className="frx-big frx-pop">SUPER CUP FINAL</h2>}
      </>}
      {t >= 2 && <p className="frx-score frx-pop" data-testid="text-ceremony-score">{winner.toUpperCase()} {winScore} · {loser.toUpperCase()} {loseScore}</p>}
      {t >= 5.5 && <p className="frx-sub frx-pop">{humanWon ? `${winner.toUpperCase()} ARE CHAMPIONS. NOW CHOOSE THE MVP.`
        : `${winner.toUpperCase()} WIN THE SUPER CUP. CONGRATULATIONS TO THEM — COME BACK NEXT SEASON AND TAKE IT!`}</p>}
      {mvp && t >= 6 && <p className="frx-mvp frx-pop" data-testid="text-ceremony-mvp">SUPER CUP MVP: {mvp.team.toUpperCase()} {mvp.slot} · {mvp.long} · {mvp.summary ?? `+${mvp.total}% ${mvp.bonus}`}</p>}
    </div>
    <div className="frx-bar">
      <button type="button" className="frx-btn ghost" onClick={start} disabled={soundOn} data-testid="button-ceremony-sound">{soundOn ? 'MUSIC ON' : 'PLAY CHAMPIONSHIP MUSIC'}</button>
      <button type="button" className="frx-btn" disabled={t < 6} onClick={() => { audio().stopAll(); onDone(); }} data-testid="button-ceremony-continue">{humanWon ? 'CHOOSE MVP' : 'CONTINUE'}</button>
    </div>
  </section>;
}
