/** The established arcade boot-to-ball effect, shared without changing its sound. */
export function playFootballKick(ctx: AudioContext) {
  const now = ctx.currentTime, tone = ctx.createOscillator(), gain = ctx.createGain();
  tone.type = 'sine'; tone.frequency.setValueAtTime(260, now);
  tone.frequency.exponentialRampToValueAtTime(60, now + .11);
  gain.gain.setValueAtTime(.26, now); gain.gain.exponentialRampToValueAtTime(.001, now + .13);
  tone.connect(gain); gain.connect(ctx.destination);
  tone.start(now); tone.stop(now + .14);
  tone.onended = () => { tone.disconnect(); gain.disconnect(); };
  return tone;
}
