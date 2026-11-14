import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name: string) => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
test('intro has no music, skip or mute control; music belongs to the menu lifecycle', () => {
  const title = read('./TitleExperience.tsx'), host = read('./GameHost.tsx');
  assert.doesNotMatch(title, /className="kr-skip"|className="kr-sound"|onClick=\{skip\}/);
  assert.doesNotMatch(host, /playIntroSound\('theme'\)|onSoundToggle/);
  assert.match(host, /playIntroSound\('hut'\)/);
  assert.match(host, /onTitleHut=/);
  assert.doesNotMatch(title, /onIntroTheme/);
  assert.doesNotMatch(title.slice(title.indexOf('const onVideoPlaying'), title.indexOf('const onVideoError')), /onTitleHut|playIntroSound/);
  assert.match(title, /if \(!announced && retroAudioState\(\) === 'ready'\)[\s\S]*announced = true;[\s\S]*onTitleHut\(\)/);
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
  assert(Math.abs((wav.length - 44) / (16000 * 2) - 8 * 4 * 60 / 112) < 1 / 16000);
  let peak = 0;
  for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i) / 32768));
  assert(peak > .05 && peak * .18 < .08, 'loop has quiet headroom below game effects');
  assert.match(audio, /gain\.gain\.value = \.18/);
  assert.match(composer, /bpm = 112/);
  assert.match(composer, /'pulse' \| 'triangle'/);
  assert.match(composer, /'kick' \| 'snare' \| 'hat' \| 'tom'/);
  assert.match(composer, /beat \* \(i < 2 \? \.85 : \.43\), \.28, 'triangle'/);
  assert.match(composer, /length \* beat, \.115, 'pulse'/);
  const barBytes = Math.round(16000 * 4 * 60 / 112) * 2;
  const sections = new Set(Array.from({ length: 8 }, (_, i) =>
    wav.subarray(44 + i * barBytes, 44 + (i + 1) * barBytes).toString('base64')));
  assert.equal(sections.size, 8, 'eight varied bars instead of a shrill, repeating short riff');
  let bassEnergy = 0, totalEnergy = 0, smooth = 0;
  for (let i = 44; i < wav.length; i += 2) {
    const sample = wav.readInt16LE(i) / 32768;
    smooth += .08 * (sample - smooth);
    bassEnergy += smooth * smooth; totalEnergy += sample * sample;
  }
  assert(bassEnergy / totalEnergy > .5, 'bass/mid-low energy defines the mix rather than shrill upper frequencies');
  assert(Math.abs(wav.readInt16LE(44)) < 40 && Math.abs(wav.readInt16LE(wav.length - 2)) < 40,
    'loop edges return to zero without a click');
});
