/** Original 16-bar championship march: two pulse voices, triangle bass,
 * LFSR noise percussion and short DPCM-style drums. No licensed melodies/samples. */
import fs from 'node:fs';
const rate = 16000, bpm = 144, beat = 60 / bpm, bars = 16, duration = bars * 4 * beat;
const samples = new Float32Array(Math.round(rate * duration));
function add(start: number, seconds: number, wave: (t: number) => number, level: number) {
  for (let i = 0; i < seconds * rate; i++) {
    const t = i / rate, index = Math.round(start * rate) + i;
    if (index < samples.length)
      samples[index]! += wave(t) * level * Math.max(0, Math.min(1, t / .003, (seconds - t) / .016));
  }
}
function note(midi: number, start: number, length: number, level: number, voice: 'pulse' | 'triangle', duty = .25) {
  const hz = 440 * 2 ** ((midi - 69) / 12);
  add(start, length, t => {
    const phase = (t * hz) % 1;
    // Sixteen staircase levels for the NES-like triangle; no lush modern pads.
    return voice === 'triangle' ? Math.round((1 - 4 * Math.abs(phase - .5)) * 7) / 7
      : (phase < duty ? 1 - duty : -duty) * (1 - .24 * Math.min(1, t / length));
  }, level);
}
let lfsr = 1986;
const noise = () => {
  lfsr = (lfsr >> 1) | (((lfsr ^ (lfsr >> 1)) & 1) << 14);
  return (lfsr & 1) ? 1 : -1;
};
function drum(kind: 'kick' | 'snare' | 'hat' | 'tom', start: number, accent = 1, pitch = 90) {
  const length = kind === 'hat' ? .035 : kind === 'snare' ? .105 : .14;
  add(start, length, t => {
    if (kind === 'hat') return noise() * Math.exp(-95 * t);
    if (kind === 'snare') return (noise() * .83 + Math.sin(2 * Math.PI * 175 * t) * .17) * Math.exp(-33 * t);
    // Stepped short samples suggest the period's sampled kick/toms, not an acoustic drum kit.
    const phase = 2 * Math.PI * (pitch * .55 * t + pitch * .45 * (1 - Math.exp(-38 * t)) / 38);
    return Math.round(Math.sin(phase) * 15) / 15 * Math.exp(-(kind === 'kick' ? 29 : 22) * t);
  }, accent * (kind === 'hat' ? .035 : kind === 'snare' ? .14 : .23));
}
// A: bold, low/mid-register fanfare. B: rising response and a dominant turnaround.
const roots = [40, 40, 43, 38, 36, 43, 45, 47, 40, 43, 36, 38, 45, 36, 47, 47];
const melody = [
  [64, 0, 67, 69, 71, 0, 67, 66], [64, 0, 71, 0, 69, 67, 66, 0],
  [67, 0, 71, 74, 71, 0, 69, 67], [66, 0, 69, 0, 74, 71, 69, 66],
  [64, 0, 67, 0, 72, 0, 71, 69], [67, 71, 74, 0, 71, 0, 67, 66],
  [69, 0, 72, 0, 71, 69, 67, 66], [66, 0, 63, 0, 59, 0, 63, 66],
  [71, 0, 76, 0, 74, 71, 69, 67], [71, 0, 74, 0, 79, 0, 76, 74],
  [72, 0, 76, 74, 72, 0, 71, 69], [69, 0, 74, 0, 78, 76, 74, 71],
  [72, 0, 76, 0, 74, 72, 71, 69], [67, 69, 72, 0, 76, 0, 72, 71],
  [71, 0, 75, 0, 78, 0, 75, 71], [66, 0, 63, 0, 59, 63, 66, 0],
];
for (let bar = 0; bar < bars; bar++) {
  const start = bar * 4 * beat, root = roots[bar]!, phrase = melody[bar]!;
  const fill = bar % 4 === 3, bridge = bar >= 8;
  phrase.forEach((midi, step) => {
    if (!midi) return;
    const length = phrase[step + 1] === 0 ? .86 : .39;
    note(midi, start + step * beat / 2, length * beat, .19, 'pulse', bridge ? .5 : .25);
  });
  // Pulse 2 answers the lead and changes its rhythmic figure in the second section.
  const third = root === 43 || root === 38 || root === 36 || root === 47 ? 4 : 3;
  const chord = [root + 12, root + 12 + third, root + 19];
  for (const step of bridge ? [1, 2, 3, 5, 6, 7] : [1, 3, 5, 7])
    note(chord[(step + bar) % 3]!, start + step * beat / 2, beat * .25, .095, 'pulse', .125);
  const bass = bridge ? [0, 12, 7, 12, 0, 12, 7, 12] : [0, 0, 7, 0, 12, 0, 7, 0];
  bass.forEach((interval, step) => note(root + interval, start + step * beat / 2, beat * .37, .14, 'triangle'));
  // Tight backbeat, syncopated kicks, lighter hats and four distinct turnaround fills.
  for (const step of bar % 2 ? [0, 1.5, 2.5] : [0, 2, 2.75]) drum('kick', start + step * beat);
  for (const step of [1, 3]) drum('snare', start + step * beat, bridge ? 1 : .85);
  for (let step = 0; step < (fill ? 6 : 8); step++) drum('hat', start + step * beat / 2, step % 2 ? .6 : 1);
  if (fill) {
    const patterns = [[3.5, 3.75], [3.25, 3.5, 3.75], [3, 3.5, 3.75], [3, 3.25, 3.5, 3.75]];
    patterns[Math.floor(bar / 4)]!.forEach((step, i) =>
      drum(i % 2 ? 'tom' : 'snare', start + step * beat, .7 + i * .08, 145 - i * 22));
  }
}
// Quiet menu playback is unchanged; normalize without clipping or a sudden loop seam.
const peak = samples.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
const master = .42 / peak;
const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
samples.forEach((value, i) => {
  // Release the final fill at the loop boundary rather than truncating its waveform.
  const edge = Math.min(1, i / (rate * .003), (samples.length - 1 - i) / (rate * .008));
  wav.writeInt16LE(Math.round(value * master * edge * 32767), 44 + i * 2);
});
fs.writeFileSync('src/platform/assets/menu-sports.wav', wav);
console.log(`Created original ${bars}-bar, ${bpm} BPM championship chip theme (${duration.toFixed(2)} seconds).`);
