/** Original 4.5-second, 16-bit-console football menu fanfare. Rounded FM brass,
 * pulse harmony, triangle bass and short sampled-style drums. No reused music. */
import fs from 'node:fs';
const rate = 16000, bpm = 120, beat = 60 / bpm, duration = 9 * beat;
const samples = new Float32Array(Math.round(rate * duration));
function add(start: number, seconds: number, wave: (t: number) => number, level: number) {
  for (let i = 0; i < seconds * rate; i++) {
    const t = i / rate, index = Math.round(start * rate) + i;
    if (index < samples.length)
      samples[index]! += wave(t) * level * Math.max(0, Math.min(1, t / .003, (seconds - t) / .016));
  }
}
function note(midi: number, start: number, length: number, level: number, voice: 'pulse' | 'triangle' | 'brass', duty = .25) {
  const hz = 440 * 2 ** ((midi - 69) / 12);
  add(start, length, t => {
    const phase = (t * hz) % 1;
    // Sixteen staircase levels for the NES-like triangle; no lush modern pads.
    if (voice === 'triangle') return Math.round((1 - 4 * Math.abs(phase - .5)) * 7) / 7;
    // A restrained two-operator FM patch gives the early-16-bit brass attack
    // and mellow sustain without a modern orchestral sample or shrill buzzer.
    if (voice === 'brass') {
      const modulation = .32 + .85 * Math.exp(-18 * t);
      const brass = .76 * Math.sin(2 * Math.PI * phase + modulation * Math.sin(4 * Math.PI * phase))
        + .24 * Math.sin(2 * Math.PI * phase);
      return Math.round(brass * 31) / 31;
    }
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
// Two short, original call-and-answer bars, then a resolved one-beat tonic.
// The entire menu cue is 4.5 seconds, not a shortened loop of the old song.
const melody: [number, number, number][] = [
  [60, 0, .4], [64, .5, .4], [67, 1, .8], [72, 2, .75], [67, 3, .35], [69, 3.5, .35],
  [65, 4, .65], [64, 4.75, .45], [62, 5.5, .45], [67, 6.25, .5], [72, 7, .5], [60, 8, 1],
];
for (const [midi, at, length] of melody)
  note(midi, at * beat, length * beat, .115, 'brass', .5);
const roots = [36, 43];
for (let bar = 0; bar < roots.length; bar++) {
  const root = roots[bar]!, start = bar * 4;
  for (const [at, interval, length] of [[0, 0, .8], [1, 7, .8], [2, 12, .8], [3, 7, .4], [3.5, 7, .35]])
    note(root + interval!, (start + at!) * beat, length! * beat, .28, 'triangle');
  note(root + 24, start * beat, 1.6 * beat, .045, 'pulse', .25);
  note(root + 19, (start + 2) * beat, 1.6 * beat, .045, 'pulse', .25);
  for (const at of [0, 2]) drum('kick', (start + at) * beat, .8);
  for (const at of [1, 3]) drum('snare', (start + at) * beat, .65);
  for (const at of [.5, 2.5]) drum('hat', (start + at) * beat, .5);
}
// A small closing fill, then a sustained C-major resolution and natural release.
drum('tom', 7.5 * beat, .4, 100);
drum('tom', 7.75 * beat, .3, 75);
drum('kick', 8 * beat, .8);
note(36, 8 * beat, beat, .28, 'triangle');
note(52, 8 * beat, beat, .045, 'pulse', .25);
// Quiet playback and a natural release of the final chord; never a loop seam.
const peak = samples.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
const master = .38 / peak;
const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
samples.forEach((value, i) => {
  // Release the final chord naturally rather than truncating its waveform.
  const edge = Math.min(1, i / (rate * .003), (samples.length - 1 - i) / (rate * .35));
  wav.writeInt16LE(Math.round(value * master * edge * 32767), 44 + i * 2);
});
fs.writeFileSync('src/platform/assets/menu-sports.wav', wav);
console.log(`Created original ${bpm} BPM championship chip fanfare (${duration.toFixed(2)} seconds, plays once).`);
