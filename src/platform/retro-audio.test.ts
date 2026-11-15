import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  playIntroSound, playMenuSound, retroAudioState, setRetroSoundEnabled, stopIntroSound, unlockRetroAudio,
  startMenuMusic, stopMenuMusic,
} from './retro-audio';

test('optional audio is safe without browser audio or a user gesture', () => {
  assert.equal(retroAudioState(), 'unavailable');
  assert.doesNotThrow(() => {
    unlockRetroAudio(); playIntroSound('stinger');
    playMenuSound('confirm'); startMenuMusic(); stopMenuMusic(); stopIntroSound();
  });
});

test('startup stays effects-only; title fanfare plays once, ends naturally and respects cancellation and mute', async () => {
  type Record = { startAt?: number; stopAt?: number; stopped: boolean; disconnected: boolean; offset?: number; duration?: number; loop?: boolean };
  const tones: Record[] = [], tracks: Record[] = [], sources: { onended?: () => void }[] = [];
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
        buffer: undefined as { duration: number } | undefined, loop: false, onended: undefined as (() => void) | undefined, connect() {},
        start(time?: number, offset?: number, duration?: number) {
          record.startAt = time; record.offset = offset; record.duration = duration ?? source.buffer?.duration; record.loop = source.loop;
        },
        stop(time?: number) { if (time === undefined) record.stopped = true; else record.stopAt = time; },
        disconnect() { record.disconnected = true; },
      };
      sources.push(source); return source;
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
    playIntroSound('stinger');
    assert.equal(tones.length, 3);
    assert.equal(tracks.length, 0, 'intro effects contain no sampled voice or music');
    playMenuSound('move'); stopIntroSound();
    assert(tones.slice(0, 3).every(tone => tone.stopped));
    assert.equal(tones[3]!.stopped, false, 'intro cleanup leaves selection effects alone');
    startMenuMusic(); startMenuMusic(); stopMenuMusic(); await settle();
    resolveDecode({ duration: 4.5 }); await settle();
    assert.equal(tracks.length, 0, 'leaving menu during decoding cancels late music');
    startMenuMusic(); startMenuMusic(); await settle();
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0]!.loop, false);
    assert.equal(tracks[0]!.duration, 4.5);
    startMenuMusic(); await settle();
    assert.equal(tracks.length, 1, 'repeated ready events never stack tracks');
    stopIntroSound();
    assert.equal(tracks[0]!.stopped, false, 'intro cleanup does not stop title music');
    sources[0]!.onended?.();
    assert(tracks[0]!.disconnected);
    startMenuMusic(); await settle();
    assert.equal(tracks.length, 1, 'a completed fanfare never restarts on the same menu');
    playMenuSound('move');
    assert.equal(tracks.length, 1, 'selection effects still work without restarting music');
    stopMenuMusic();
    startMenuMusic(); await settle();
    assert.equal(tracks.length, 2, 'a new title appearance may play once');
    setRetroSoundEnabled(false);
    assert.equal(unlockRetroAudio(), 'muted');
    assert(tracks[1]!.stopped);
    assert.ok(tones.every(tone => tone.stopped));
    const count = tracks.length + tones.length;
    playMenuSound('confirm'); playIntroSound('stinger'); startMenuMusic(); await settle();
    assert.equal(tracks.length + tones.length, count, 'mute prevents all new intro/menu audio');
  } finally {
    stopIntroSound(); stopMenuMusic(); setRetroSoundEnabled(true);
    globalThis.fetch = originalFetch; Reflect.deleteProperty(globalThis, 'window');
  }
});
