/** Original NES-inspired triangle + 15-bit LFSR noise hit. Local, deterministic
 * samples only; deliberately no claim that this is sampled from an NES game. */
export const TACKLE_AUDIO = { sampleRate: 22050, duration: .155 } as const;
export function tackleSamples() {
  const { sampleRate, duration } = TACKLE_AUDIO;
  const samples = new Float32Array(Math.ceil(sampleRate * duration));
  let lfsr = 1, phase = 0, noisePhase = 0, noise = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate, fade = Math.max(0, 1 - t / duration);
    // Stepped pitch and noise periods, rather than a modern smooth bass sweep.
    const tick = Math.floor(t * 240), frequency = [180, 132, 98, 74, 55][Math.min(4, Math.floor(tick / 5))]!;
    phase = (phase + frequency / sampleRate) % 1;
    noisePhase += (t < .028 ? 7800 : t < .07 ? 3900 : 1950) / sampleRate;
    if (noisePhase >= 1) {
      noisePhase -= 1;
      const feedback = (lfsr ^ (lfsr >> 1)) & 1;
      lfsr = (lfsr >> 1) | (feedback << 14);
      noise = (lfsr & 1) ? 1 : -1;
    }
    const triangle = Math.round((1 - 4 * Math.abs(phase - .5)) * 7) / 7;
    const envelope = Math.min(1, t / .002) * fade * fade;
    samples[i] = (triangle * .40 + noise * (t < .035 ? .42 : .20)) * envelope;
  }
  return samples;
}
