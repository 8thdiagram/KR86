import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  playIntroSound, playMenuSound, retroAudioState, setRetroSoundEnabled, stopIntroSound, unlockRetroAudio,
} from './retro-audio';

test('optional audio is safe without browser audio or a user gesture', () => {
  assert.equal(retroAudioState(), 'unavailable');
  assert.doesNotThrow(() => {
    unlockRetroAudio(); playIntroSound('stinger'); playIntroSound('theme');
    playMenuSound('confirm'); stopIntroSound();
  });
});

test('startup waits for audio permission, then plays the finite cancellable theme and respects mute', async () => {
  type Record = { startAt?: number; stopAt?: number; stopped: boolean; disconnected: boolean; offset?: number; duration?: number };
  const tones: Record[] = [], tracks: Record[] = [];
  let resolveDecode!: (buffer: { duration: number }) => void;
  const decoded = new Promise<{ duration: number }>(resolve => { resolveDecode = resolve; });
  const originalFetch = globalThis.fetch;
  let now = 10;
  let allowResume = false;
  const events = new EventTarget();
  let readyEvents = 0;
  events.addEventListener('kick-return-retro-audio-ready', () => readyEvents++);
  class Audio {
    get currentTime() { return now; }
    state = 'suspended';
    destination = {};
    async resume() {
      if (!allowResume) throw new Error('User activation required');
      await Promise.resolve();
      this.state = 'running';
    }
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
        start(time: number, offset: number, duration: number) { record.startAt = time; record.offset = offset; record.duration = duration; },
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
  Object.defineProperty(globalThis, 'window', { configurable: true,
    value: { AudioContext: Audio, dispatchEvent: events.dispatchEvent.bind(events) } });
  globalThis.fetch = (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as typeof fetch;
  const settle = () => new Promise(resolve => setImmediate(resolve));
  try {
    assert.equal(unlockRetroAudio(), 'blocked');
    playIntroSound('stinger');
    await settle();
    assert.equal(tones.length, 0, 'blocked startup must not pretend a sound was played');
    allowResume = true;
    assert.equal(unlockRetroAudio(), 'blocked', 'resume may finish asynchronously after the gesture');
    await settle();
    assert.equal(retroAudioState(), 'ready');
    assert(readyEvents > 0, 'the startup screen is notified when audio really becomes usable');
    unlockRetroAudio(); playIntroSound('theme'); stopIntroSound();
    resolveDecode({ duration: 3.2 }); await settle();
    assert.equal(tracks.length, 0, 'skipping during decoding must not start late music');
    playIntroSound('theme'); await settle();
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0]!.startAt, 12.6);
    assert.equal(tracks[0]!.duration, 3.15);
    assert.equal(tracks[0]!.stopAt, 15.75);
    playMenuSound('move'); stopIntroSound();
    assert.ok(tracks[0]!.stopped && tracks[0]!.disconnected);
    assert.equal(tones[0]!.stopped, false, 'stopping intro leaves menu effects alone');
    playIntroSound('theme'); now = 13.1; await settle();
    assert.ok(Math.abs(tracks[1]!.offset! - .5) < 1e-9, 'delayed music joins the elapsed video position');
    assert.ok(Math.abs(tracks[1]!.duration! - 2.65) < 1e-9);
    assert.equal(tracks[1]!.stopAt, 15.75);
    playIntroSound('stinger');
    assert.ok(tones.slice(1).every(tone => tone.stopAt! < 14));
    setRetroSoundEnabled(false);
    assert.equal(unlockRetroAudio(), 'muted');
    assert.ok(tones.every(tone => tone.stopped));
    const count = tracks.length + tones.length;
    playMenuSound('confirm'); playIntroSound('theme'); await settle();
    assert.equal(tracks.length + tones.length, count, 'mute prevents all new intro/menu audio');
  } finally {
    stopIntroSound(); setRetroSoundEnabled(true);
    globalThis.fetch = originalFetch; Reflect.deleteProperty(globalThis, 'window');
  }
});
