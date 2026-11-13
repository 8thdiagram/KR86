import hutUrl from '../assets/football-hut.mp3';
import { CADENCE, retroCadenceSamples } from '../lib/football/cadence';
import { TACKLE_AUDIO, tackleSamples } from '../lib/football/tackle-audio';
/** Minimal locally synthesized referee whistle. Original Kick Return effects are untouched. */
export function createFootballWhistle() {
  let whistleUntil = 0;
  let ctx: AudioContext | undefined;
  let bytes: Promise<ArrayBuffer> | undefined, voice: Promise<AudioBuffer> | undefined, source: AudioBufferSourceNode | undefined;
  let generation = 0;
  let tackleBuffer: AudioBuffer | undefined;
  const hits = new Set<AudioBufferSourceNode>();
  const preload = () => bytes ??= fetch(hutUrl).then(r => { if (!r.ok) throw new Error('Cadence audio unavailable'); return r.arrayBuffer(); });
  const unlock = () => {
    try {
      const C = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return;
      ctx ??= new C();
      if (ctx.state === 'suspended') void ctx.resume();
      voice ??= preload().then(data => ctx!.decodeAudioData(data.slice(0))).then(decoded => {
        const samples = retroCadenceSamples(decoded.getChannelData(0), decoded.sampleRate);
        const retro = ctx!.createBuffer(1, samples.length, CADENCE.sampleRate);
        retro.getChannelData(0).set(samples);
        return retro;
      });
      void voice.catch(() => undefined); // The UI's preload reports missing assets; no unhandled playback rejection.
    } catch { /* Audio is optional; football remains playable. */ }
  };
  return {
    unlock,
    preload,
    stopVoice() { generation++; try { source?.stop(); } catch { /* already ended */ } source = undefined; },
    hut() {
      const token = generation;
      if (!voice) return;
      void voice.then(buffer => {
        if (!ctx || ctx.state !== 'running' || token !== generation) return;
        source = ctx.createBufferSource(); const gain = ctx.createGain(), filter = ctx.createBiquadFilter();
        // Lower, drawn-out, faint and gritty HU from the same licensed original.
        // No echo/reverb and no new provider request. The final /t/ is clipped.
        source.buffer = buffer; source.playbackRate.value = CADENCE.rate;
        filter.type = 'lowpass'; filter.frequency.value = CADENCE.lowpass; filter.Q.value = .5;
        const now = ctx.currentTime, start = Math.min(.04, buffer.duration * .05);
        const length = Math.min(.24, Math.max(.01, buffer.duration - start));
        gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(CADENCE.gain, now + .018);
        gain.gain.setValueAtTime(CADENCE.gain, now + Math.max(.019, length / CADENCE.rate - .07));
        gain.gain.linearRampToValueAtTime(0, now + length / CADENCE.rate);
        source.connect(filter); filter.connect(gain); gain.connect(ctx.destination); source.start(now, start, length);
        source.onended = () => { gain.disconnect(); filter.disconnect(); };
      }).catch(() => undefined);
    },
    tackle() {
      try {
        if (!ctx || ctx.state !== 'running') return;
        if (!tackleBuffer) {
          const samples = tackleSamples();
          tackleBuffer = ctx.createBuffer(1, samples.length, TACKLE_AUDIO.sampleRate);
          tackleBuffer.getChannelData(0).set(samples);
        }
        const hit = ctx.createBufferSource(), gain = ctx.createGain();
        hit.buffer = tackleBuffer; gain.gain.value = .36;
        hit.connect(gain); gain.connect(ctx.destination); hits.add(hit);
        hit.onended = () => { hits.delete(hit); hit.disconnect(); gain.disconnect(); };
        hit.start(ctx.currentTime);
      } catch { /* Optional audio must not block football. */ }
    },
    kick() {
      try {
        if (!ctx || ctx.state !== 'running') return;
        const now = ctx.currentTime, tone = ctx.createOscillator(), gain = ctx.createGain();
        tone.type = 'sine'; tone.frequency.setValueAtTime(260, now);
        tone.frequency.exponentialRampToValueAtTime(60, now + .11);
        gain.gain.setValueAtTime(.26, now); gain.gain.exponentialRampToValueAtTime(.001, now + .13);
        tone.connect(gain); gain.connect(ctx.destination);
        tone.start(now); tone.stop(now + .14);
        tone.onended = () => { tone.disconnect(); gain.disconnect(); };
      } catch { /* sound is optional */ }
    },
    blow() {
      try {
        if (!ctx || ctx.state !== 'running') return;
        const now = ctx.currentTime, osc = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
        whistleUntil = now + .42;
        osc.type = 'square'; osc.frequency.value = 2650;
        lfo.frequency.value = 38; lg.gain.value = 120; lfo.connect(lg); lg.connect(osc.frequency);
        g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(.06, now + .02);
        g.gain.setValueAtTime(.06, now + .32); g.gain.linearRampToValueAtTime(0, now + .4);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(now); lfo.start(now); osc.stop(now + .42); lfo.stop(now + .42);
        osc.onended = () => { osc.disconnect(); lfo.disconnect(); lg.disconnect(); g.disconnect(); };
      } catch { /* sound is optional */ }
    },
    stopEffects() { for (const hit of hits) { try { hit.stop(); } catch { /* ended */ } } hits.clear(); },
    close() {
      generation++; try { source?.stop(); } catch { /* already ended */ }
      for (const hit of hits) { try { hit.stop(); } catch { /* ended */ } } hits.clear();
      // A saved halftime/final transition can unmount the game immediately.
      // Let its end-of-period whistle finish rather than cutting it off.
      const closing = ctx;
      if (closing) {
        const delay = Math.max(0, whistleUntil - closing.currentTime) * 1000;
        if (delay > 0) window.setTimeout(() => { void closing.close(); }, delay + 10);
        else void closing.close();
      }
      ctx = undefined; tackleBuffer = undefined;
    },
  };
}
