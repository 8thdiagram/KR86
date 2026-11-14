/** Reproducible, drum-free chip cue using menu-confirm notes and the game's real hut. */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CADENCE, retroCadenceSamples } from '../src/game/lib/football/cadence';

const rate = 24000, length = 3.15;
const samples = new Float32Array(Math.round(rate * length));
const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);
// The existing C-G-C confirm chirp, three octaves lower, followed by a simple descent.
const melody = [
  [48, 0, .25], [55, .25, .25], [60, .5, .35], [55, .875, .25],
  [52, 1.125, .25], [50, 1.375, .25], [48, 1.625, .5],
] as const;

function note(midi: number, start: number, duration: number, volume: number, pulse = true) {
  const hz = frequency(midi);
  for (let i = 0; i < Math.floor(duration * rate); i++) {
    const time = i / rate, phase = (time * hz) % 1;
    // A 25% pulse melody and one quiet triangle bass: no drum/noise channels.
    const wave = pulse ? (phase < .25 ? .75 : -.25) : 1 - 4 * Math.abs(phase - .5);
    const envelope = Math.min(1, time / .006, (duration - time) / .035);
    const slot = Math.floor(start * rate) + i;
    samples[slot]! += wave * volume * Math.max(0, envelope);
  }
}
for (const [midi, start, duration] of melody) note(midi, start, duration, .28);
note(36, 0, .8, .07, false);
note(43, .875, .7, .06, false);
note(36, 1.625, .5, .07, false);

const source = execFileSync('ffmpeg', ['-v', 'error', '-i', 'src/game/assets/football-hut.mp3',
  '-f', 'f32le', '-ar', '44100', '-ac', '1', 'pipe:1']);
const voice = retroCadenceSamples(
  new Float32Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength)), 44100);
// Keep the complete recorded word rather than generating or synthesizing a voice.
// Reuse the game's low-rate/8-bit texture and near-original playback pitch.
const hutStart = 2.25, voiceRate = CADENCE.sampleRate * CADENCE.rate;
for (let i = 0; i < Math.ceil(voice.length / voiceRate * rate); i++) {
  const p = Math.min(voice.length - 1, i / rate * voiceRate), left = Math.floor(p), mix = p - left;
  const value = voice[left]! * (1 - mix) + voice[Math.min(left + 1, voice.length - 1)]! * mix;
  const envelope = Math.min(1, i / (rate * .008), (voice.length / voiceRate * rate - i) / (rate * .035));
  const slot = Math.floor(hutStart * rate) + i;
  if (slot < samples.length) samples[slot]! += value * .6 * Math.max(0, envelope);
}

const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
for (let i = 0; i < samples.length; i++) wav.writeInt16LE(Math.round(Math.max(-.95, Math.min(.95, samples[i]!)) * 32767), 44 + i * 2);
fs.mkdirSync('generated-artifacts', { recursive: true });
fs.writeFileSync('generated-artifacts/kick-return-low-chip-hut.wav', wav);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', 'generated-artifacts/kick-return-low-chip-hut.wav',
  '-c:a', 'libmp3lame', '-b:a', '96k', '-ar', '44100', '-map_metadata', '-1',
  'src/platform/assets/intro-theme.mp3']);
console.log('Composed 3.15-second low chip cue, no drums, ending with the actual game hut.');
