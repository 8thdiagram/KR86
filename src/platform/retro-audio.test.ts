import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  playIntroSound, playMenuSound, setRetroSoundEnabled, stopIntroSound, unlockRetroAudio,
} from './retro-audio';

test('optional audio is safe without browser audio or a user gesture', () => {
  assert.doesNotThrow(() => {
    unlockRetroAudio();
    playIntroSound('stinger');
    playIntroSound('theme');
    playMenuSound('confirm');
    stopIntroSound();
  });
});

test('intro is finite, cancellable, and never cancels menu effects', () => {
  const scheduled: { stopAt?: number; stopped: boolean; disconnected: boolean }[] = [];
  class Audio {
    currentTime = 10;
    state = 'running';
    destination = {};
    createOscillator() {
      const record = { stopped: false, disconnected: false } as typeof scheduled[number];
      scheduled.push(record);
      return {
        type: '', frequency: { value: 0 }, onended: undefined,
        connect() {}, start() {},
        stop(time?: number) { if (time === undefined) record.stopped = true; else record.stopAt = time; },
        disconnect() { record.disconnected = true; },
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, linearRampToValueAtTime() {} },
        connect() {}, disconnect() {},
      };
    }
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext: Audio } });
  try {
    unlockRetroAudio();
    playIntroSound('theme');
    assert.equal(scheduled.length, 31);
    assert.ok(scheduled.every(voice => voice.stopAt! <= 13.37));
    playMenuSound('move');
    stopIntroSound();
    assert.ok(scheduled.slice(0, 31).every(voice => voice.stopped && voice.disconnected));
    assert.equal(scheduled[31]!.stopped, false);
    setRetroSoundEnabled(false);
    assert.equal(scheduled[31]!.stopped, true);
    const before = scheduled.length;
    playMenuSound('confirm'); playIntroSound('theme');
    assert.equal(scheduled.length, before);
  } finally {
    setRetroSoundEnabled(true);
    Reflect.deleteProperty(globalThis, 'window');
  }
});
