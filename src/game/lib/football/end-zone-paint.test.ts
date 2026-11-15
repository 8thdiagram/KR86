import test from 'node:test';
import assert from 'node:assert/strict';
import { drawEndZoneLettering } from '../../components/football-deluxe-art';
import { KICK_TEAMS } from '../kick-return-teams';

function canvas() {
  const paints: { x: number; y: number; w: number; h: number; color: string; alpha: number }[] = [];
  const transforms: number[][] = [];
  const stack: { fillStyle: string; globalAlpha: number }[] = [];
  const ctx = {
    fillStyle: '#000000', globalAlpha: .9,
    save() { stack.push({ fillStyle: this.fillStyle, globalAlpha: this.globalAlpha }); },
    restore() { Object.assign(this, stack.pop()); },
    translate(x: number, y: number) { transforms.push([x, y]); },
    rotate(angle: number) { transforms.push([angle]); },
    fillRect(x: number, y: number, w: number, h: number) {
      paints.push({ x, y, w, h, color: this.fillStyle, alpha: this.globalAlpha });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, paints, transforms, stack };
}

test('all end-zone team names use faded, world-fixed pixel paint without a decal outline', () => {
  for (const team of KICK_TEAMS) {
    const a = canvas(), b = canvas();
    drawEndZoneLettering(a.ctx, team.name, team.trim, 50, -Math.PI / 2, '#10213a');
    drawEndZoneLettering(b.ctx, team.name, team.trim, 1150, Math.PI / 2, '#10213a');
    assert(a.paints.length > 25, `${team.name} stays legible`);
    assert.deepEqual(a.paints, b.paints, 'same wear on either end, independent of camera and time');
    assert.deepEqual(a.transforms, [[50, 96], [-Math.PI / 2]]);
    assert.deepEqual(b.transforms, [[1150, 96], [Math.PI / 2]]);
    assert.equal(a.stack.length, 0);
    assert.equal(a.ctx.globalAlpha, .9, 'restore caller opacity');
    assert.equal(a.ctx.fillStyle, '#000000', 'restore caller palette');
    assert.equal(new Set(a.paints.map(p => p.alpha)).size, 2, 'subtle varied paint density');
    for (const p of a.paints) {
      assert.equal(p.color, team.trim, 'keep team paint color; no dark decal border');
      assert(p.alpha > 0 && p.alpha < .9);
      assert.equal(p.w, 1); assert.equal(p.h, 1);
      assert(Number.isInteger(p.x) && Number.isInteger(p.y));
      assert(p.x >= -70 && p.x < 70, 'letters stay inside the sidelines after rotation');
      assert(Math.abs(p.y) < 45, 'letters stay inside the end-zone depth');
    }
  }
});

test('paint wear is sparse and deterministic while preserving small one-pixel lettering', () => {
  // An E has 15 glyph cells, each enlarged 3x3: remove only a small amount of paint.
  const large = canvas();
  drawEndZoneLettering(large.ctx, 'E', '#faf8ef', 50, -Math.PI / 2, '#10213a');
  assert(large.paints.length > 15 * 9 * .88 && large.paints.length < 15 * 9);
  const small = canvas(), repeat = canvas();
  const label = 'EEEEEEEEEEEEEEEEEEEEEEEEEEEE';
  drawEndZoneLettering(small.ctx, label, '#faf8ef', 50, 0, '#10213a');
  drawEndZoneLettering(repeat.ctx, label, '#faf8ef', 50, 0, '#10213a');
  assert.equal(small.paints.length, label.length * 15, 'tiny strokes fade but never lose pixels');
  assert.deepEqual(repeat.paints, small.paints);
});
