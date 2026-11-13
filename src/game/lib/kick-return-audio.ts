/** Original, locally synthesized arcade crowd cheer. No downloaded audio or external calls. */
export function createKickCrowdAudio() {
  let context: AudioContext | undefined;
  const sources = new Set<AudioScheduledSourceNode>();
  const stop = () => {
    for (const source of sources) { try { source.stop(); } catch { /* Already finished. */ } }
    sources.clear();
  };
  const unlock = async () => {
    const Constructor = window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) throw new Error('This browser does not support game audio.');
    context ??= new Constructor();
    if (context.state === 'suspended') await context.resume();
  };
  const cheer = () => {
    if (!context || context.state !== 'running') return false;
    stop();
    const ctx = context, now = ctx.currentTime, duration = 2.2;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(.45, now + .12);
    master.gain.setValueAtTime(.35, now + 1.4);
    master.gain.linearRampToValueAtTime(0, now + duration);
    master.connect(ctx.destination);
    const track = (node: AudioScheduledSourceNode) => {
      sources.add(node);
      node.addEventListener('ended', () => {
        sources.delete(node);
        node.disconnect();
        if (!sources.size) master.disconnect();
      }, { once: true });
      node.start(now);
      node.stop(now + duration);
    };
    // A filtered roar beneath overlapping, rising "yay" arcade voices.
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    let random = 1986, smooth = 0;
    for (let i = 0; i < samples.length; i++) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      smooth = smooth * .65 + (random / 2147483648 - 1) * .35;
      samples[i] = smooth * (.55 + .25 * Math.sin(i / ctx.sampleRate * 14));
    }
    const roar = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
    roar.buffer = buffer;
    filter.type = 'bandpass'; filter.frequency.value = 1300; filter.Q.value = .55;
    roar.connect(filter); filter.connect(master); track(roar);
    for (let voice = 0; voice < 8; voice++) {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain(), vowel = ctx.createBiquadFilter();
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(155 + voice * 29, now);
      oscillator.frequency.linearRampToValueAtTime(245 + voice * 38, now + .35);
      oscillator.frequency.linearRampToValueAtTime(190 + voice * 26, now + 1.6);
      vowel.type = 'bandpass'; vowel.frequency.value = 750 + voice * 135; vowel.Q.value = 1.2;
      gain.gain.value = .045;
      oscillator.connect(vowel); vowel.connect(gain); gain.connect(master); track(oscillator);
    }
    return true;
  };
  const tackle = () => {
    if (!context || context.state !== 'running') return false;
    const ctx = context, now = ctx.currentTime, duration = .16;
    const gain = ctx.createGain(), tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(145, now);
    tone.frequency.exponentialRampToValueAtTime(45, now + duration);
    gain.gain.setValueAtTime(.2, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    tone.connect(gain); gain.connect(ctx.destination);
    sources.add(tone);
    tone.addEventListener('ended', () => { sources.delete(tone); tone.disconnect(); gain.disconnect(); }, { once: true });
    tone.start(now); tone.stop(now + duration);
    return true;
  };
  return { unlock, cheer, tackle, stop, close: () => { stop(); void context?.close(); context = undefined; } };
}
