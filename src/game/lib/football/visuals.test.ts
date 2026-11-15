import test from 'node:test';
import assert from 'node:assert/strict';
import { footballPixels, drawFootballBall, uniformKit, UNIFORM, BALL_ART } from '../../components/football-art';
import { slim, turnSprite, heldBall, airBall } from '../../components/football-sprites';
import { kickFootballArt } from '../../components/kick-return-renderer';
import { KICK_TEAMS } from '../kick-return-teams';
import { createKickAttempt } from '../kick-return-engine';
import { createFootball } from './engine';
import { startField } from './field';
import { drawFootball } from '../../components/football-renderer';
import { drawTackle } from '../../components/football-tackle';
import { fieldGoalSequence } from './special-teams';
import { beginTackle } from './tackle-scene';

test('defense has no selection target while offensive receiver highlighting remains intact', () => {
  for (const defense of ['pass', 'man', 'prevent'] as const) {
    const g = createFootball(86);
    g.phase = 'live'; g.possession = 'away'; g.spot = 40;
    g.live = startField(g, 'post', defense); g.live.time = 1;
    const d = g.live.athletes.find(a => a.role === 'LB')!;
    d.x = 700; d.y = 96;
    const before = JSON.stringify(g);
    for (const side of ['away', 'home'] as const) {
      g.possession = side;
      const marks: { color: string; rect: number[] }[] = [];
      const target = {
        fillStyle: '',
        fillRect(x: number, y: number, w: number, h: number) {
          if (w === 1 && h === 5 && ['#f1e6d0', '#f4d23c'].includes(this.fillStyle))
            marks.push({ color: this.fillStyle, rect: [x, y, w, h] });
        },
      };
      const ctx = new Proxy(target, { get: (t, key) => Reflect.has(t, key) ? Reflect.get(t, key) : () => {} }) as unknown as CanvasRenderingContext2D;
      const state = JSON.stringify(g);
      drawFootball(ctx, g, { width: 393, height: 500 }, .5);
      assert.equal(marks.length, side === 'home' ? 4 : 0, defense);
      assert.equal(JSON.stringify(g), state, 'drawing never changes saved gameplay state');
    }
    g.possession = 'away'; assert.equal(JSON.stringify(g), before);
  }
});

test('field-goal timing meter clears the scoreboard and keeps its label on screen', () => {
  for (const [width, height] of [[664, 192], [760, 300], [390, 320]]) {
    const g = createFootball(86, { player: 'Goldminers', opponent: 'Pride' });
    g.spot = 80; g.phase = 'live';
    g.live = startField(g, 'field-goal', 'run');
    g.special = fieldGoalSequence(g); g.special.stage = 'hold';
    const bars: { y: number; h: number }[] = [];
    const labels: { text: string; y: number }[] = [];
    const target = {
      fillStyle: '',
      fillRect(_x: number, y: number, _w: number, h: number) {
        if (this.fillStyle === '#a63e36') bars.push({ y, h });
      },
      fillText(text: string, _x: number, y: number) { labels.push({ text, y }); },
    };
    const ctx = new Proxy(target, { get: (t, key) => Reflect.has(t, key) ? Reflect.get(t, key) : () => {} }) as unknown as CanvasRenderingContext2D;
    drawFootball(ctx, g, { width, height, landscape: width > height }, 0);
    assert.equal(bars.length, 1);
    assert(bars[0]!.y - 3 * height / 192 > 40, 'meter pointer must clear the HUD');
    const label = labels.find(l => l.text.endsWith('YD ATTEMPT'));
    assert(label && label.y > bars[0]!.y + bars[0]!.h && label.y < height - 28, 'attempt label clears the meter and players');
    g.live.kickAccuracy = .5;
    bars.length = 0;
    drawFootball(ctx, g, { width, height }, 0);
    assert.equal(bars.length, 0, 'meter disappears after the kick is committed');
  }
});

test('GOOD and NO GOOD appear once at screen center, independent of field direction and camera', () => {
  for (const good of [true, false]) for (const frame of [1, -1] as const)
    for (const [width, height] of [[390, 320], [844, 192]]) {
      const g = createFootball(86, { player: 'Goldminers', opponent: 'Pride' });
      g.spot = 80; g.phase = 'live'; g.fieldFrame = frame;
      g.live = startField(g, 'field-goal', 'run');
      g.live.kickAccuracy = good ? .5 : .01;
      g.special = fieldGoalSequence(g); g.special.stage = 'resolved'; g.special.stageAge = .3; g.special.good = good;
      const labels: { text: string; x: number; y: number }[] = [];
      const ctx = new Proxy({
        fillText(text: string, x: number, y: number) {
          if (text === 'GOOD' || text === 'NO GOOD') labels.push({ text, x, y });
        },
      }, { get: (t, key) => Reflect.has(t, key) ? Reflect.get(t, key) : () => {} }) as unknown as CanvasRenderingContext2D;
      const before = JSON.stringify(g);
      drawFootball(ctx, g, { width, height, landscape: width > height }, .5);
      assert.deepEqual(labels, [{ text: good ? 'GOOD' : 'NO GOOD', x: width! / 2, y: height! / 2 }]);
      assert.equal(JSON.stringify(g), before);
      labels.length = 0;
      g.playResult = { text: good ? 'FIELD GOAL GOOD! +3' : 'FIELD GOAL NO GOOD', remaining: 1 };
      drawFootball(ctx, g, { width, height, landscape: width > height }, .5);
      assert.equal(labels.length, 0, 'the centered timed result replaces the canvas label, without duplicates');
    }
});

function canvas() {
  const pixels = new Map<string, string>();
  const paints: { c: string; x: number; y: number; w: number; h: number }[] = [];
  const drawing = { fillStyle: '', fillRect(x: number, y: number, w: number, h: number) {
    paints.push({ c: this.fillStyle, x, y, w, h });
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) pixels.set(`${Math.round(x + i)},${Math.round(y + j)}`, this.fillStyle);
  } };
  const ctx = new Proxy(drawing, { get: (t, key) => Reflect.has(t, key) ? Reflect.get(t, key) : () => {} }) as unknown as CanvasRenderingContext2D;
  return { ctx, paints, pixels };
}
test('larger football has pointed leather shape and two separate white end bands in both rotation frames', () => {
  for (const held of [false, true]) for (const tall of [false, true]) {
    const { ctx, pixels } = canvas();
    footballPixels((c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }, 0, 0, held, tall);
    const w = held ? 9 : 11, h = held ? 5 : 7;
    const at = (x: number, y: number) => pixels.get(tall ? `${h - y - 1},${x}` : `${x},${y}`);
    assert.equal(at(2, 2), BALL_ART.stripe); assert.equal(at(w - 3, 2), BALL_ART.stripe);
    assert.equal(at(3, 2), BALL_ART.leather); assert.equal(at(0, 2), BALL_ART.outline);
    assert.equal(at(0, 0), undefined, 'pointed outline, not a rectangle');
    assert(pixels.size > (held ? 20 : 32), 'noticeably more visible than the former ball');
  }
});
test('Classic, Full Game, carried, airborne and ground footballs all use shared brown/white artwork', () => {
  for (const draw of [
    (ctx: CanvasRenderingContext2D) => kickFootballArt.football(ctx, 100, 100, true),
    (ctx: CanvasRenderingContext2D) => heldBall(ctx, 100, 100),
    (ctx: CanvasRenderingContext2D) => airBall(ctx, 100, 100, 30, .2),
    (ctx: CanvasRenderingContext2D) => drawFootballBall(ctx, 100, 100),
  ]) {
    const { ctx, paints } = canvas(); draw(ctx);
    assert(paints.some(p => p.c === BALL_ART.leather));
    assert.equal(paints.filter(p => p.c === BALL_ART.stripe && (p.h >= 3 || p.w >= 3)).length, 2);
  }
});
test('Full Game airborne balls keep carried size; passes stay horizontal while kicks can tumble', () => {
  const bounds = (spin: number, z: number) => {
    const { ctx, paints } = canvas(); airBall(ctx, 100, 100, z, spin);
    const ball = paints.filter(p => p.c !== 'rgba(8,40,16,.35)');
    return {
      width: Math.max(...ball.map(p => p.x + p.w)) - Math.min(...ball.map(p => p.x)),
      height: Math.max(...ball.map(p => p.y + p.h)) - Math.min(...ball.map(p => p.y)),
    };
  };
  assert.deepEqual(bounds(0, 0), { width: 9, height: 5 });
  assert.deepEqual(bounds(0, 40), { width: 9, height: 5 });
  assert.deepEqual(bounds(.15, 40), { width: 5, height: 9 });
});
test('every team uses solid primary jerseys and secondary helmets with long white pants in both modes', () => {
  for (const team of KICK_TEAMS) for (const dir of [-1, 1] as const) {
    const kit = uniformKit(team, dir);
    for (const mode of ['classic', 'full'] as const) {
      const { ctx, paints, pixels } = canvas();
      if (mode === 'classic') kickFootballArt.sprite(ctx, 100, 100, kit, 0);
      else slim(ctx, 100, 100, kit);
      assert(Math.min(...paints.map(p => p.y)) >= 80 && Math.min(...paints.map(p => p.y)) <= 90);
      assert.equal(Math.max(...paints.map(p => p.y + p.h)), 107, `${team.name} ${mode} keeps the foot/shadow anchor`);
      assert(paints.filter(p => p.c === team.trim && p.y < 95).reduce((n,p)=>n+p.w*p.h,0)>=8,
        `${team.name} separate secondary-color helmet shell`);
      assert(!paints.some(p => p.c === team.trim && p.y >= 95), `${team.name} has no secondary-color jersey panels`);
      assert(paints.filter(p => p.c === team.body).reduce((n,p)=>n+p.w*p.h,0)>=12, `${team.name} primary jersey mass`);
      assert(paints.some(p => p.y >= 100 && [UNIFORM.pants, UNIFORM.pantsShade].includes(p.c as typeof UNIFORM.pants)),
        `${team.name} bright white calves remain visible under the fixed hips, ${mode}`);
      assert([...pixels.values()].includes(UNIFORM.pants), `${team.name} retains white near-leg pixels, ${mode}`);
    }
  }
});
test('nine athletic turn views keep distinct secondary shells, fine contours and a fixed ground anchor', () => {
  for (const dir of [1, -1] as const) for (let view = 0; view <= 8; view++) {
    const kit = uniformKit(KICK_TEAMS[0]!, dir);
    const { ctx, paints } = canvas();
    const before = JSON.stringify(kit);
    const bodyView = view as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    turnSprite(ctx, 100, 100, kit, bodyView, { step: .25, ball: true });
    assert.equal(JSON.stringify(kit), before, `view ${view}/${dir} leaves the uniform untouched`);
    assert(Math.min(...paints.map(p => p.y)) >= 80 && Math.min(...paints.map(p => p.y)) <= 90);
    assert.equal(Math.max(...paints.map(p => p.y + p.h)), 107, `view ${view}/${dir} keeps the ground anchor`);
    const shell = paints.filter(p => p.c === kit.trim && p.y < 95);
    assert(shell.length > 0);
    assert(shell.reduce((n,p)=>n+p.w*p.h,0)>=8, 'directional helmets retain readable shell volume');
    for (const p of paints) for (const n of [p.x, p.y, p.w, p.h])
      assert(Number.isInteger(n * 2), `view ${view} draws integral pixels at doubled backing resolution`);
    const repeat = canvas();
    turnSprite(repeat.ctx, 100, 100, kit, bodyView, { step: .25, ball: true });
    assert.deepEqual(repeat.paints, paints, `view ${view}/${dir} is deterministic`);
    const enlarged = canvas();
    slim(enlarged.ctx, 100, 100, kit, { step: .25, ball: true, view: bodyView });
    assert(Math.min(...enlarged.paints.map(p => p.y)) >= 80 && Math.min(...enlarged.paints.map(p => p.y)) <= 90);
    assert.equal(Math.max(...enlarged.paints.map(p => p.y + p.h)), 107, `view ${view}/${dir} keeps scaled foot anchor`);
  }
});
test('running gait keyframes add distinct intermediate pixel poses without shifting feet', () => {
  const kit = uniformKit(KICK_TEAMS[0]!, 1);
  for (const mode of ['classic', 'full'] as const) {
    const frames = new Set<string>();
    for (const step of [.01, .7, 1.4, 2.1, 2.8, 3.5]) {
      const { ctx, paints } = canvas();
      if (mode === 'classic') kickFootballArt.sprite(ctx, 100, 100, kit, step, true);
      else slim(ctx, 100, 100, kit, { step, ball: true });
      frames.add(JSON.stringify(paints));
      assert(Math.min(...paints.map(p => p.y)) >= 80 && Math.min(...paints.map(p => p.y)) <= 90);
      assert.equal(Math.max(...paints.map(p => p.y + p.h)), 107, `${mode} step ${step} keeps the foot anchor`);
      for (const p of paints) for (const n of [p.x, p.y, p.w, p.h]) assert(Number.isInteger(n * 2));
    }
    assert.equal(frames.size, 6, `${mode} exposes six authored running silhouettes`);
  }
});
test('all turn views keep primary jersey masses above substantial articulated white legs', () => {
  const team = { body: '#b42635', trim: '#d9e2f0' };
  for (const dir of [-1, 1] as const) for (const view of [undefined, 0, 1, 2, 3, 4, 5, 6, 7, 8] as const) {
    for (const classic of [false, true]) {
      const kit = uniformKit(team, dir), { ctx, pixels } = canvas();
      if (classic) kickFootballArt.sprite(ctx, 100, 100, kit, 0, false, 0, 0, view);
      else slim(ctx, 100, 100, kit, { view });
      assert([...pixels.values()].filter(color=>color===team.body).length>=10,
        `primary jersey remains dominant: ${view}/${classic}/${dir}`);
      const trousers = [...pixels].filter(([, color]) => color === UNIFORM.pants || color === UNIFORM.pantsShade)
        .map(([key]) => Number(key.split(',')[1]));
      assert(Math.max(...trousers) - Math.min(...trousers) >= 5,
        `long articulated white trousers remain visible in view ${view}/${classic}/${dir}`);
    }
  }
});
test('cocked, contact and follow-through legs remain distinct without changing a kit or ground anchor', () => {
  for (const dir of [-1, 1] as const) {
    const kit = uniformKit(KICK_TEAMS[0]!, dir), before = JSON.stringify(kit), frames = new Set<string>();
    for (const kick of [0, .5, 1]) {
      const { ctx, paints } = canvas();
      slim(ctx, 100, 100, kit, { kick });
      frames.add(JSON.stringify(paints));
      assert.equal(Math.max(...paints.map(p => p.y + p.h)), 107);
      assert.equal(JSON.stringify(kit), before);
    }
    assert.equal(frames.size, 3, 'the sprite redraw never collapses a kick into a running or static pose');
  }
});
test('running strides alternate lifted recovery feet and a planted stance without spreading the hips', () => {
  for (const classic of [false, true]) for (const dir of [-1, 1] as const) {
    const kit = uniformKit({ body: '#aa2538', trim: '#e5ba39' }, dir);
    const feet = new Set<string>();
    for (const step of [.5, 1.5, 2.5, 3.5, 4.5, 5.5]) {
      const { ctx, paints } = canvas();
      if (classic) kickFootballArt.sprite(ctx, 100, 100, kit, step);
      else slim(ctx, 100, 100, kit, { step });
      const soles = paints.filter(p => p.c === UNIFORM.ink && p.y >= 101);
      assert(soles.length>=2, 'cleats remain visible below the thicker articulated legs');
      feet.add(JSON.stringify(soles));
    }
    assert(feet.size>=4, 'the recovery and contact silhouettes change throughout the running cycle');
    const braced = [0, 1, 2].map(step => {
      const { ctx, paints } = canvas(); slim(ctx, 100, 100, kit, { step, engaged: true });
      return JSON.stringify(paints);
    });
    assert.equal(new Set(braced).size, 1, 'blocked players do not run in place');
  }
});
test('spin, cut and dive pose samples are deterministic drawings and never mutate attempts', () => {
  const kit = uniformKit(KICK_TEAMS[0]!, 1);
  const attempt = createKickAttempt(86, 1);
  attempt.phase = 'returning';
  attempt.player = { x: 100, y: 100 };
  for (const kind of ['spin', 'stutter', 'dive'] as const) {
    const frames = new Set<string>();
    for (const elapsed of [.015, .055, .11, .19, .27]) {
      attempt.moves = { ...attempt.moves!, active: { kind, side: 1, elapsed } };
      const before = JSON.stringify(attempt);
      const { ctx, paints } = canvas();
      assert(kickFootballArt.moveSprite(ctx, 100, 100, kit, elapsed * 20, attempt));
      assert.equal(JSON.stringify(attempt), before, `${kind} drawing is read-only`);
      frames.add(JSON.stringify(paints));
      for (const p of paints) for (const n of [p.x, p.y, p.w, p.h])
        assert(Number.isInteger(n * 2), `${kind} keeps crisp doubled-resolution pixel edges`);
    }
    assert(frames.size >= (kind === 'stutter' ? 2 : 3), `${kind} keyframes contain useful visual transitions`);
  }
});
test('tackle buckle-to-ground art adds a quarter-turn bridge without changing scene state', () => {
  const game = createFootball(86);
  const homeKit = uniformKit(KICK_TEAMS[0]!, 1), awayKit = uniformKit(KICK_TEAMS[1]!, -1);
  const home = { body: homeKit.body, trim: homeKit.trim, ...(homeKit.edge ? { edge: homeKit.edge } : {}) };
  const away = { body: awayKit.body, trim: awayKit.trim, ...(awayKit.edge ? { edge: awayKit.edge } : {}) };
  beginTackle(game, { id: 11, x: 100, y: 100, vx: 24 }, { id: 3, x: 106, y: 98, vx: -18 }, 'home', 'scrimmage');
  const scene = game.tackleScene!;
  const poses = [
    { phase: 'impact', elapsed: 0 },
    { phase: 'fall', elapsed: .04 },
    { phase: 'fall', elapsed: .12 },
    { phase: 'fall', elapsed: .23 },
    { phase: 'ground', elapsed: 0 },
  ] as const;
  const signatures = new Set<string>();
  for (const pose of poses) {
    scene.phase = pose.phase;
    scene.elapsed = pose.elapsed;
    const before = JSON.stringify(game), { ctx, paints } = canvas();
    drawTackle(ctx, game, home, away);
    assert.equal(JSON.stringify(game), before, `${pose.phase}/${pose.elapsed} drawing is read-only`);
    assert(paints.length > 0);
    for (const p of paints) for (const n of [p.x, p.y, p.w, p.h]) assert(Number.isInteger(n * 2));
    signatures.add(JSON.stringify(paints));
  }
  assert.equal(signatures.size, poses.length, 'impact, crouch, buckle, landing and settle are distinct art poses');
});
test('spinning, retreating, hesitating, diving, prone and kicking retain uniform color anatomy', () => {
  for (const team of KICK_TEAMS) {
    const kit = uniformKit(team, 1);
    const attempt = createKickAttempt(86, 1); attempt.phase = 'returning'; attempt.player = { x: 100, y: 100 };
    for (const pose of ['spin', 'stutter', 'dive', 'backward', 'hesitating', 'prone', 'kick'] as const) {
      const { ctx, paints } = canvas();
      if (pose === 'prone') kickFootballArt.prone(ctx, 100, 100, kit, -.35, 2);
      else if (pose === 'kick') slim(ctx, 100, 100, kit, { kick: .6 });
      else {
        attempt.moves = { ...attempt.moves!, backward: pose === 'backward', hesitating: pose === 'hesitating',
          active: pose === 'spin' || pose === 'stutter' || pose === 'dive' ? { kind: pose, side: 1, elapsed: .15 } : undefined };
        assert(kickFootballArt.moveSprite(ctx, 100, 100, kit, 1, attempt));
      }
      for (const color of [team.body, team.trim, UNIFORM.pants])
        assert(paints.some(p => p.c === color), `${team.name}, ${pose}: ${color}`);
    }
  }
});
test('similar primary colors get distinguishing outlines without swapping uniform colors', () => {
  const a = KICK_TEAMS.find(t => t.name === 'Big Blue')!, b = KICK_TEAMS.find(t => t.name === 'Pride')!;
  const home = uniformKit(a, 1, b), away = uniformKit(b, -1, a);
  assert.equal(home.body, a.body); assert.equal(home.trim, a.trim);
  assert.equal(away.body, b.body); assert.equal(away.trim, b.trim);
  assert(home.edge && away.edge && home.edge !== away.edge);
  assert.equal(uniformKit({ body: a.body }, 1).trim, a.body, 'missing secondary uses existing primary palette');
});
test('Full Game rendering is read-only across passes, returns, formations and loose-ball recovery', () => {
  for (const mode of ['dropback', 'flight', 'return', 'loose'] as const) {
    const g = createFootball(86, { player: 'Goldminers', opponent: 'Pride' });
    g.phase = 'live'; g.live = startField(g, 'slant', 'pass'); g.live.mode = mode; g.live.time = 1;
    if (mode === 'flight') g.live.flight = { x: 400, y: 90, z: 18, fromX: 300, fromY: 96, toX: 500, toY: 80, age: .2, duration: .5, receiver: 3, accuracy: .7 };
    if (mode === 'loose') g.live.loose = { x: 400, y: 100, time: .2, recoverer: 11 };
    if (mode === 'return') { g.live.carrier = 11; g.live.interception = { catcher: 11, age: .5, catchX: 400, catchY: 90 }; }
    const before = JSON.stringify(g), { ctx, paints } = canvas();
    drawFootball(ctx, g, { width: 400, height: 192, landscape: true }, .5);
    assert.equal(JSON.stringify(g), before);
    assert(paints.some(p => p.c === UNIFORM.pants));
    assert(paints.some(p => p.c === BALL_ART.leather), `${mode} has visible football`);
  }
});
