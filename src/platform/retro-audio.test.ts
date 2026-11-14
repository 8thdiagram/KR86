import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  playIntroSound, playMenuSound, retroAudioState, setRetroSoundEnabled, stopIntroSound, unlockRetroAudio,
  startMenuMusic, stopMenuMusic,
} from './retro-audio';

test('optional audio is safe without browser audio or a user gesture', () => {
  assert.equal(retroAudioState(), 'unavailable');
  assert.doesNotThrow(() => {
    unlockRetroAudio(); playIntroSound('stinger'); playIntroSound('hut');
    playMenuSound('confirm'); startMenuMusic(); stopMenuMusic(); stopIntroSound();
  });
});

test('startup uses effects only; quiet menu music loops without duplication and stops on exit', async () => {
  type Record = { startAt?: number; stopAt?: number; stopped: boolean; disconnected: boolean; offset?: number; duration?: number; loop?: boolean };
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
      const source = {
        buffer: undefined, loop: false, onended: undefined, connect() {},
        start(time?: number, offset?: number, duration?: number) {
          record.startAt = time; record.offset = offset; record.duration = duration; record.loop = source.loop;
        },
        stop(time?: number) { if (time === undefined) record.stopped = true; else record.stopAt = time; },
        disconnect() { record.disconnected = true; },
      };
      return source;
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
    unlockRetroAudio(); playIntroSound('hut'); stopIntroSound();
    resolveDecode({ duration: 3.2 }); await settle();
    assert.equal(tracks.length, 0, 'ending intro during decoding must not start late effects');
    playIntroSound('hut'); await settle();
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0]!.startAt, 14.7);
    assert.equal(tracks[0]!.duration, .9);
    assert.equal(tracks[0]!.stopAt, 15.6);
    assert.equal(tracks[0]!.loop, false, 'hut is a one-shot effect, not intro music');
    playMenuSound('move'); stopIntroSound();
    assert.ok(tracks[0]!.stopped && tracks[0]!.disconnected);
    assert.equal(tones[0]!.stopped, false, 'stopping intro leaves menu effects alone');
    playIntroSound('hut'); now = 15.2; await settle();
    assert.ok(Math.abs(tracks[1]!.offset! - .5) < 1e-9, 'delayed music joins the elapsed video position');
    assert.ok(Math.abs(tracks[1]!.duration! - .4) < 1e-9);
    assert.ok(Math.abs(tracks[1]!.stopAt! - 15.6) < 1e-9);
    playIntroSound('stinger');
    assert.ok(tones.slice(1).every(tone => tone.stopAt! < 16));
    startMenuMusic(); startMenuMusic(); stopMenuMusic(); await settle();
    assert.equal(tracks.length, 2, 'leaving menu during load cancels late background music');
    startMenuMusic(); startMenuMusic(); await settle();
    assert.equal(tracks.length, 3);
    assert.equal(tracks[2]!.loop, true);
    startMenuMusic(); await settle();
    assert.equal(tracks.length, 3, 'repeated ready/visibility events never stack loops');
    stopIntroSound();
    assert.equal(tracks[2]!.stopped, false, 'intro cleanup does not stop menu music');
    stopMenuMusic();
    assert.ok(tracks[2]!.stopped && tracks[2]!.disconnected);
    setRetroSoundEnabled(false);
    assert.equal(unlockRetroAudio(), 'muted');
    assert.ok(tones.every(tone => tone.stopped));
    const count = tracks.length + tones.length;
    playMenuSound('confirm'); playIntroSound('hut'); startMenuMusic(); await settle();
    assert.equal(tracks.length + tones.length, count, 'mute prevents all new intro/menu audio');
  } finally {
    stopIntroSound(); stopMenuMusic(); setRetroSoundEnabled(true);
    globalThis.fetch = originalFetch; Reflect.deleteProperty(globalThis, 'window');
  }
});
