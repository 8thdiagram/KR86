/** Low, faint, drawn-out field cadence with a tough 16-bit-era sampled texture. */
export const CADENCE = { rate: .99, gain: .065, lowpass: 1900, sampleRate: 12000, drive: 1.6 } as const;

/** Low-rate, 8-bit PCM-style texture; processed once, never on the gameplay audio thread. */
export function retroCadenceSamples(input: Float32Array, sourceRate: number): Float32Array {
  const output = new Float32Array(Math.ceil(input.length * CADENCE.sampleRate / sourceRate));
  for (let i = 0; i < output.length; i++) {
    const position = Math.min(input.length - 1, i * sourceRate / CADENCE.sampleRate);
    const left = Math.floor(position), mix = position - left;
    const sample = input[left]! * (1 - mix) + input[Math.min(left + 1, input.length - 1)]! * mix;
    // Gentle saturation adds a gravelly edge without sharp digital clipping.
    const grit = Math.tanh(Math.max(-1, Math.min(1, sample)) * CADENCE.drive) / Math.tanh(CADENCE.drive);
    output[i] = Math.round(grit * 127) / 127;
  }
  return output;
}
