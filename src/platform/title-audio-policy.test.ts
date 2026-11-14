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

test('menu composition is local, quiet, sparse and includes soft drums', () => {
  const audio = read('./retro-audio.ts');
  const composer = read('../../scripts/compose-menu-music.mts');
  const wav = fs.readFileSync(new URL('./assets/menu-sports.wav', import.meta.url));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal((wav.length - 44) / (16000 * 2), 16);
  let peak = 0;
  for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i) / 32768));
  assert(peak > .05 && peak * .18 < .08, 'loop has quiet headroom below game effects');
  assert.match(audio, /gain\.gain\.value = \.18/);
  assert.match(composer, /soft kicks[\s\S]*short snares/);
});
