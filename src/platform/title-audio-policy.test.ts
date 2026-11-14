import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name: string) => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
test('intro has no music, skip or mute control; music belongs to the menu lifecycle', () => {
  const title = read('./TitleExperience.tsx'), host = read('./GameHost.tsx');
  assert.doesNotMatch(title, /className="kr-skip"|className="kr-sound"|onClick=\{skip\}/);
  assert.doesNotMatch(host, /playIntroSound\('theme'\)|onSoundToggle/);
  assert.match(host, /playIntroSound\('hut'\)/);
  assert.match(title, /if \(stage !== 'menu'\) return;[\s\S]*startMenuMusic\(\)/);
  assert.match(title, /return \(\) => \{[\s\S]*stopMenuMusic\(\)/);
  assert.match(title, /autoPlay muted playsInline/);
  assert.match(title, /startup-sound-gate/);
  assert.match(read('./retro-theme.css'), /\[data-testid="button-football-sound"\],[\s\S]*\[data-testid="kick-return-sound"\],[\s\S]*\.kr-pause-sound\s*\{\s*display: none !important/);
});

test('menu championship composition is local, varied, chip-voiced and quiet beneath game effects', () => {
  const audio = read('./retro-audio.ts');
  const composer = read('../../scripts/compose-menu-music.mts');
  const wav = fs.readFileSync(new URL('./assets/menu-sports.wav', import.meta.url));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 16000);
  assert(Math.abs((wav.length - 44) / (16000 * 2) - 16 * 4 * 60 / 144) < 1 / 16000);
  let peak = 0;
  for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i) / 32768));
  assert(peak > .05 && peak * .18 < .08, 'loop has quiet headroom below game effects');
  assert.match(audio, /gain\.gain\.value = \.18/);
  assert.match(composer, /bpm = 144/);
  assert.match(composer, /'pulse' \| 'triangle'/);
  assert.match(composer, /'kick' \| 'snare' \| 'hat' \| 'tom'/);
  assert.match(composer, /const fill = bar % 4 === 3, bridge = bar >= 8/);
  const barBytes = Math.round(16000 * 4 * 60 / 144) * 2;
  const sections = new Set(Array.from({ length: 16 }, (_, i) =>
    wav.subarray(44 + i * barBytes, 44 + (i + 1) * barBytes).toString('base64')));
  assert.equal(sections.size, 16, 'the arrangement varies across every bar instead of repeating a short riff');
  assert(Math.abs(wav.readInt16LE(44)) < 40 && Math.abs(wav.readInt16LE(wav.length - 2)) < 40,
    'loop edges return to zero without a click');
});
