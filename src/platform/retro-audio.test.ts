import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  playIntroSound, playMenuSound, setRetroSoundEnabled, stopIntroSound, unlockRetroAudio,
} from './retro-audio';

test('optional audio is safe without browser audio or a user gesture', () => {
  assert.doesNotThrow(() => {
    unlockRetroAudio(); playIntroSound('stinger'); playIntroSound('theme');
    playMenuSound('confirm'); stopIntroSound();
  });
});

test('new theme is finite, synchronized, cancellable during decoding, and independent of menu cues', async () => {
  type Record = { stopAt?: number; stopped: boolean; disconnected: boolean; offset?: number; duration?: number };
  const tones: Record[] = [], tracks: Record[] = [];
  let resolveDecode!: (buffer: { duration: number }) => void;
  const decoded = new Promise<{ duration: number }>(resolve => { resolveDecode = resolve; });
  const originalFetch = globalThis.fetch;
  let now = 10;
  class Audio {
    get currentTime() { return now; }
    state = 'running';
    destination = {};
    decodeAudioData() { return decoded; }
    createOscillator() {
      const record: Record = { stopped: false, disconnected: false }; tones.push(record);
      return {
        type: '', frequency: { value: 0 }, onended: undefined,
        connect() {}, start() {},
        stop(time?: number) { if (time === undefined) record.stopped = true; else record.stopAt = time; },
        disconnect() { record.disconnected = true; },
      };
    }
    createBufferSource() {
      const record: Record = { stopped: false, disconnected: false }; tracks.push(record);
      return {
        buffer: undefined, loop: false, onended: undefined, connect() {},
        start(_time: number, offset: number, duration: number) { record.offset = offset; record.duration = duration; },
        stop(time?: number) { if (time === undefined) record.stopped = true; else record.stopAt = time; },
        disconnect() { record.disconnected = true; },
      };
    }
    createGain() {
      return {
        gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} },
        connect() {}, disconnect() {},
      };
    }
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext: Audio } });
  globalThis.fetch = (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as typeof fetch;
  const settle = () => new Promise(resolve => setImmediate(resolve));
  try {
    unlockRetroAudio(); playIntroSound('theme'); stopIntroSound();
    resolveDecode({ duration: 5.8 }); await settle();
    assert.equal(tracks.length, 0, 'skipping during decoding must not start late music');
    playIntroSound('theme'); await settle();
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0]!.duration, 5.75);
    assert.equal(tracks[0]!.stopAt, 15.75);
    playMenuSound('move'); stopIntroSound();
    assert.ok(tracks[0]!.stopped && tracks[0]!.disconnected);
    assert.equal(tones[0]!.stopped, false, 'stopping intro leaves menu effects alone');
    playIntroSound('theme'); now = 10.5; await settle();
    assert.equal(tracks[1]!.offset, .5, 'delayed music joins the elapsed video position');
    assert.equal(tracks[1]!.duration, 5.25);
    playIntroSound('stinger');
    assert.ok(tones.slice(1).every(tone => tone.stopAt! < 11));
    setRetroSoundEnabled(false);
    assert.ok(tones.every(tone => tone.stopped));
    const count = tracks.length + tones.length;
    playMenuSound('confirm'); playIntroSound('theme'); await settle();
    assert.equal(tracks.length + tones.length, count, 'mute prevents all new intro/menu audio');
  } finally {
    stopIntroSound(); setRetroSoundEnabled(true);
    globalThis.fetch = originalFetch; Reflect.deleteProperty(globalThis, 'window');
  }
});
