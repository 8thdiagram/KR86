/** Original sparse 8-bar sports march. Deterministic pulse, bass, kick and snare. */
import fs from 'node:fs';
const rate = 16000, beat = .5, bars = 8, duration = bars * 4 * beat;
const samples = new Float32Array(rate * duration);
function add(start: number, seconds: number, wave: (t: number) => number, level: number) {
  for (let i = 0; i < seconds * rate; i++) {
    const t = i / rate, index = Math.round(start * rate) + i;
    if (index < samples.length)
      samples[index]! += wave(t) * level * Math.max(0, Math.min(1, t / .005, (seconds - t) / .025));
  }
}
function note(midi: number, start: number, length: number, level: number, bass = false) {
  const hz = 440 * 2 ** ((midi - 69) / 12);
  add(start, length, t => bass ? 1 - 4 * Math.abs((t * hz) % 1 - .5)
    : ((t * hz) % 1 < .25 ? .75 : -.25), level);
}
let random = 1986;
const noise = () => { random = (1664525 * random + 1013904223) >>> 0; return random / 2147483648 - 1; };
const roots = [36, 36, 41, 43, 36, 41, 43, 43];
const phrases = [
  [48, 55, 55, 52], [55, 57, 55, 48], [53, 57, 60, 57], [55, 50, 47, 43],
  [48, 55, 60, 55], [53, 57, 60, 57], [55, 59, 62, 59], [55, 50, 47, 43],
];
for (let bar = 0; bar < bars; bar++) {
  const start = bar * 4 * beat;
  phrases[bar]!.forEach((midi, step) => note(midi, start + step * beat, beat * .65, .17));
  note(roots[bar]!, start, .7, .12, true);
  note(roots[bar]! + 7, start + 2 * beat, .7, .1, true);
  // Two soft kicks and two short snares per bar; no busy hi-hat channel.
  for (const step of [0, 2]) add(start + step * beat, .11,
    t => Math.sin(2 * Math.PI * (55 * t + 2 * (1 - Math.exp(-35 * t)))) * Math.exp(-30 * t), .14);
  for (const step of [1, 3]) add(start + step * beat, .08,
    t => noise() * Math.exp(-45 * t), .09);
}
const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
samples.forEach((value, i) => wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2));
fs.writeFileSync('src/platform/assets/menu-sports.wav', wav);
console.log('Created 16-second sparse sports menu loop with soft kick/snare.');
