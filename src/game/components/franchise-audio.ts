/** Original synthesized franchise audio: fanfares, crowd, a marching loop and spoken chants. No samples, no services. */
type Ctx = AudioContext;
const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12);

export function createFranchiseAudio() {
  let ctx: Ctx | null = null;
  let master: GainNode | null = null;
  let crowdSrc: AudioBufferSourceNode | null = null;
  let loop: number | null = null;
  let step = 0;
  const speech = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const ensure = () => {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = .32; master.connect(ctx.destination);
    }
    return ctx;
  };
  const tone = (freq: number, at: number, dur: number, type: OscillatorType = 'square', vol = .18) => {
    const c = ensure(); if (!c || !master) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(.001, at + dur);
    o.connect(g); g.connect(master); o.start(at); o.stop(at + dur + .02);
  };
  const noiseBuf = () => {
    const c = ensure()!; const b = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  };
  const hit = (at: number, dur: number, freq: number, vol: number) => {
    const c = ensure(); if (!c || !master) return;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf(); f.type = 'bandpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(.001, at + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(at); s.stop(at + dur + .02);
  };
  // Original fanfare: rising triad call, held tonic.
  const FANFARE = [[60, .15], [64, .15], [67, .15], [72, .45], [67, .15], [72, .7]] as const;
  // Original march: 16 steps, lead + bass.
  const LEAD = [72, 0, 76, 79, 77, 0, 74, 72, 74, 0, 77, 81, 79, 77, 76, 74];
  const BASS = [48, 55, 48, 55, 50, 57, 50, 57, 53, 60, 53, 60, 55, 62, 55, 43];

  return {
    speechAvailable: speech,
    unlock() { const c = ensure(); void c?.resume().catch(() => undefined); },
    fanfare() {
      const c = ensure(); if (!c) return; let t = c.currentTime + .05;
      for (const [n, d] of FANFARE) { tone(NOTE(n), t, d * 1.1); tone(NOTE(n - 12), t, d * 1.1, 'triangle', .14); t += d; }
    },
    pop() { const c = ensure(); if (!c) return; hit(c.currentTime, .35, 900 + Math.random() * 900, .4); tone(NOTE(84 + Math.floor(Math.random() * 6)), c.currentTime, .12, 'square', .05); },
    crowd(on: boolean) {
      const c = ensure(); if (!c || !master) return;
      if (!on) { try { crowdSrc?.stop(); } catch { /* already stopped */ } crowdSrc = null; return; }
      if (crowdSrc) return;
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = noiseBuf(); s.loop = true; f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = .6; g.gain.value = .22;
      s.connect(f); f.connect(g); g.connect(master); s.start(); crowdSrc = s;
    },
    march(on: boolean) {
      const c = ensure(); if (!c) return;
      if (loop !== null) { clearInterval(loop); loop = null; }
      if (!on) return;
      const beat = () => {
        const t = c.currentTime + .02, i = step++ % 16;
        if (LEAD[i]) tone(NOTE(LEAD[i]!), t, .17, 'square', .12);
        tone(NOTE(BASS[i]!), t, .16, 'triangle', .2);
        if (i % 4 === 0) hit(t, .14, 150, .7); else if (i % 2 === 0) hit(t, .08, 2400, .35);
      };
      beat(); loop = window.setInterval(beat, 190);
    },
    say(text: string, pitch = 1.4) {
      if (!speech) return false;
      try { const u = new SpeechSynthesisUtterance(text); u.rate = 1.15; u.pitch = pitch; u.volume = 1; window.speechSynthesis.speak(u); return true; }
      catch { return false; }
    },
    stopAll() {
      if (loop !== null) { clearInterval(loop); loop = null; }
      try { crowdSrc?.stop(); } catch { /* ignore */ } crowdSrc = null;
      if (speech) window.speechSynthesis.cancel();
      void ctx?.suspend().catch(() => undefined);
    },
    resume() { void ctx?.resume().catch(() => undefined); },
    close() { this.stopAll(); void ctx?.close().catch(() => undefined); ctx = null; },
  };
}
export type FranchiseAudio = ReturnType<typeof createFranchiseAudio>;
