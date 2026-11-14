/** Original short, resolved 1988 football fanfare. Two pulse voices,
 * a defining triangle bass and restrained noise/DPCM-style drums. No samples. */
import fs from 'node:fs';
const rate = 16000, bpm = 100, beat = 60 / bpm, duration = 5.6;
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
// C-major call and answer, ending on a held tonic rather than a loop turnaround.
const melody: [number, number, number][] = [
  [55, 0, .65], [60, .75, .65], [64, 1.5, 1.2], [62, 3, .7],
  [60, 4, .7], [59, 5, .65], [60, 6, 3.3],
];
for (const [midi, at, length] of melody)
  note(midi, at * beat, length * beat, .115, 'pulse', .5);
for (const [midi, at, length] of [[48, 0, 1.4], [53, 2, 1.4], [55, 4, 1.4], [52, 6, 3.3]])
  note(midi!, at! * beat, length! * beat, .045, 'pulse', .25);
for (const [midi, at, length] of [[36, 0, .85], [43, 1, .85], [41, 2, .85], [36, 3, .85],
  [43, 4, .85], [31, 5, .85], [36, 6, 3.3]])
  note(midi!, at! * beat, length! * beat, .28, 'triangle');
for (const at of [0, 2, 4, 6]) drum('kick', at * beat, .8);
for (const at of [1, 3, 5]) drum('snare', at * beat, .65);
drum('tom', 5.5 * beat, .45, 90);
// Quiet playback and a natural release of the final chord; never a loop seam.
const peak = samples.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
const master = .38 / peak;
const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
samples.forEach((value, i) => {
  // Release the final fill at the loop boundary rather than truncating its waveform.
  const edge = Math.min(1, i / (rate * .003), (samples.length - 1 - i) / (rate * .7));
  wav.writeInt16LE(Math.round(value * master * edge * 32767), 44 + i * 2);
});
fs.writeFileSync('src/platform/assets/menu-sports.wav', wav);
console.log(`Created original ${bpm} BPM championship chip fanfare (${duration.toFixed(2)} seconds, plays once).`);
