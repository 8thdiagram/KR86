import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name: string) => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
test('intro has no music, skip or mute control; music belongs to the menu lifecycle', () => {
  const title = read('./TitleExperience.tsx'), host = read('./GameHost.tsx');
  assert.doesNotMatch(title, /className="kr-skip"|className="kr-sound"|onClick=\{skip\}/);
  assert.doesNotMatch(host, /playIntroSound\('theme'\)|onSoundToggle/);
  assert.doesNotMatch(host, /playIntroSound\('hut'\)|onTitleHut=/);
  assert.doesNotMatch(title, /onIntroTheme|prepareTitleHut|onTitleHut/);
  assert.doesNotMatch(title.slice(title.indexOf('const onVideoPlaying'), title.indexOf('const onVideoError')), /onTitleHut|playIntroSound/);
  assert.match(title, /if \(!announced && retroAudioState\(\) === 'ready'\)[\s\S]*announced = true;[\s\S]*startMenuMusic\(\)/);
  assert.match(title, /if \(stage !== 'menu'\) return;[\s\S]*startMenuMusic\(\)/);
  assert.match(title, /return \(\) => \{[\s\S]*stopMenuMusic\(\)/);
  assert.match(title, /autoPlay muted playsInline/);
  assert.doesNotMatch(title, /startup-sound-gate|button-start-with-sound|START WITH SOUND|awaitingSound|audioAttempt/);
  assert.match(read('./retro-theme.css'), /\[data-testid="button-football-sound"\],[\s\S]*\[data-testid="kick-return-sound"\],[\s\S]*\.kr-pause-sound\s*\{\s*display: none !important/);
});

test('startup attempts sound automatically and ordinary gestures unlock audio without blocking or restarting the intro', () => {
  const title = read('./TitleExperience.tsx'), host = read('./GameHost.tsx');
  assert.match(host, /setRetroSoundEnabled\(true\)/);
  assert.match(title, /const activateAudio = \(\) => \{ void unlockRetroAudio\(\); \}/);
  assert.match(title, /\['pointerdown', 'touchend', 'keydown'\]/);
  assert.match(title, /addEventListener\(gesture, activateAudio, \{ capture: true, passive: true \}\)/);
  assert.match(title, /activateAudio\(\);/);
  assert.match(title, /removeEventListener\(gesture, activateAudio, true\)/);
  assert.doesNotMatch(title, /unlockRetroAudio\(\) === 'blocked'/);
  assert.match(title, /if \(stingerPlayed \|\| !activeRun\.current/);
  assert.match(title, /removeEventListener\('kick-return-retro-audio-ready', playStingerWhenReady\)/);
  assert.match(title, /\[playIntro, replayToken, finishIntro\]/);
});

test('menu victory theme is a 4.5-second 16-bit-style fanfare, resolved and never loops', () => {
  const audio = read('./retro-audio.ts');
  const composer = read('../../scripts/compose-menu-music.mts');
  const wav = fs.readFileSync(new URL('./assets/menu-sports.wav', import.meta.url));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt16LE(34), 16, 'the original synthesized console cue is stored as 16-bit PCM');
  const duration = (wav.length - 44) / (16000 * 2);
  assert.equal(duration, 4.5);
  assert(duration >= 4 && duration <= 5, 'menu cue fits the requested four-to-five-second range');
  let peak = 0;
  for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i) / 32768));
  assert(peak > .05 && peak * .18 < .08, 'fanfare has quiet headroom below game effects');
  assert.match(audio, /gain\.gain\.value = \.18/);
  assert.match(composer, /bpm = 120/);
  assert.match(composer, /'pulse' \| 'triangle' \| 'brass'/);
  assert.match(composer, /'kick' \| 'snare' \| 'hat' \| 'tom'/);
  assert.match(composer, /\.28, 'triangle'/);
  assert.match(composer, /length \* beat, \.115, 'brass'/);
  assert.match(audio, /source\.loop = false/);
  assert.doesNotMatch(audio, /source\.loop = true|football-hut|prepareTitleHut/);
  assert.match(audio, /menuStarted = true/);
  const melody = composer.slice(composer.indexOf('const melody:'), composer.indexOf('for (const [midi, at, length] of melody)'));
  const notes = [...melody.matchAll(/\[(\d+), [\d.]+, [\d.]+\]/g)].map(m => Number(m[1]));
  assert.equal(notes.length, 12); assert(Math.max(...notes) <= 72);
  assert.equal(notes.at(-1), 60, 'the celebratory phrases resolve to C');
  let bassEnergy = 0, totalEnergy = 0, smooth = 0;
  for (let i = 44; i < wav.length; i += 2) {
    const sample = wav.readInt16LE(i) / 32768;
    smooth += .08 * (sample - smooth);
    bassEnergy += smooth * smooth; totalEnergy += sample * sample;
  }
  assert(bassEnergy / totalEnergy > .5, 'bass/mid-low energy defines the mix rather than shrill upper frequencies');
  assert(Math.abs(wav.readInt16LE(44)) < 40 && Math.abs(wav.readInt16LE(wav.length - 2)) < 40,
    'fanfare resolves to silence without a click');
});
