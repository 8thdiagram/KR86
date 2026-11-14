/** Original eight-bar, bass-forward 1988 football march. Two pulse voices,
 * a defining triangle bass and restrained noise/DPCM-style drums. No samples. */
import fs from 'node:fs';
const rate = 16000, bpm = 112, beat = 60 / bpm, bars = 8, duration = bars * 4 * beat;
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
    if (voice === 'triangle') return Math.round((1 - 4 * Math.abs(phase - .5)) * 7) / 7;
    // A pulse with restrained upper harmonics, not an aliased/shrill buzzer.
    let pulse = 0;
    for (let harmonic = 1; harmonic <= 7; harmonic++)
      pulse += 2 * Math.sin(Math.PI * harmonic * duty) / (Math.PI * harmonic)
        * Math.cos(2 * Math.PI * harmonic * (phase - duty / 2));
    return pulse * (1 - .18 * Math.min(1, t / length));
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
  }, accent * (kind === 'hat' ? .006 : kind === 'snare' ? .045 : .09));
}
// D-major call/response: longer, lower phrases with breathing room, not arpeggios.
const roots = [38, 38, 43, 45, 35, 43, 40, 45];
const melody: [number, number, number][][] = [
  [[62, 0, 1], [66, 1.25, .65], [69, 2, 1.2], [66, 3.5, .35]],
  [[64, 0, 1.25], [62, 1.5, 1], [57, 3, .7]],
  [[62, 0, .75], [67, 1, .75], [66, 2, 1.5]],
  [[64, 0, 1.5], [61, 2, .75], [57, 3, .65]],
  [[66, 0, 1], [69, 1.5, .65], [71, 2.5, .5], [69, 3.25, .5]],
  [[67, 0, 1.5], [66, 2, .75], [62, 3, .75]],
  [[64, 0, .85], [66, 1, .75], [64, 2, .75], [61, 3, .65]],
  [[64, 0, .75], [61, 1, .75], [57, 2, 1.15]],
];
for (let bar = 0; bar < bars; bar++) {
  const start = bar * 4 * beat, root = roots[bar]!;
  for (const [midi, at, length] of melody[bar]!)
    note(midi, start + at * beat, length * beat, .115, 'pulse', .5);
  // The second pulse supports two strong beats; it never competes with the tune.
  for (const at of [0, 2])
    note(root + (at ? 19 : 24), start + at * beat, beat * .65, .045, 'pulse', .25);
  const bass = bar % 2 ? [0, 7, 12, 7, 0] : [0, 0, 7, 12, 7];
  const bassBeats = [0, 1, 2, 2.75, 3.5];
  bass.forEach((interval, i) => note(root + interval, start + bassBeats[i]! * beat,
    beat * (i < 2 ? .85 : .43), .28, 'triangle'));
  for (const at of [0, 2]) drum('kick', start + at * beat);
  for (const at of [1, 3]) drum('snare', start + at * beat, .8);
  for (const at of [0, 1, 2, 3]) drum('hat', start + at * beat, .6);
  if (bar === 3 || bar === 7) {
    drum('snare', start + 3.5 * beat, .45);
    drum('tom', start + 3.75 * beat, .55, 100);
  }
}
// Quiet menu playback is unchanged; normalize without clipping or a sudden loop seam.
const peak = samples.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
const master = .38 / peak;
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
