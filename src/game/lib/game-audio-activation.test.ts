import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { playActivatedGameAudio, resumeGameAudio } from './game-audio-activation';

const settle = () => new Promise(resolve => setImmediate(resolve));
function context(state = 'suspended') {
  let accept!: () => void, reject!: (error: Error) => void;
  const activation = new Promise<void>((yes, no) => { accept = yes; reject = no; });
  const audio = { state, calls: 0, resume() { this.calls++; return activation; } };
  return { audio: audio as unknown as AudioContext, raw: audio,
    ready() { audio.state = 'running'; accept(); }, reject };
}

test('iPhone interrupted audio resumes and the original same-gesture contact effect plays exactly once', async () => {
  const c = context('interrupted'); let hits = 0;
  const resumed = resumeGameAudio(c.audio);
  assert.equal(c.raw.calls, 1);
  assert(playActivatedGameAudio(c.audio, () => { hits++; }));
  assert.equal(hits, 0);
  c.ready(); await resumed; await settle();
  assert.equal(hits, 1);
  assert(playActivatedGameAudio(c.audio, () => { hits++; }));
  assert.equal(hits, 2, 'already-running effects are immediate, not rescheduled');
});

test('blocked and rejected playback never builds a queue of old football sounds', async () => {
  const c = context(); let hits = 0;
  assert.equal(playActivatedGameAudio(c.audio, () => { hits++; }), false);
  const resumed = resumeGameAudio(c.audio);
  assert(playActivatedGameAudio(c.audio, () => { hits++; }));
  c.reject(new Error('Activation required'));
  await assert.rejects(resumed); await settle();
  assert.equal(hits, 0);
});

test('repeated unlock calls share a pending resume and closed contexts fail explicitly', async () => {
  const c = context(), a = resumeGameAudio(c.audio), b = resumeGameAudio(c.audio);
  assert.strictEqual(a, b); assert.equal(c.raw.calls, 1);
  c.ready(); await a;
  const closed = context('closed');
  await assert.rejects(resumeGameAudio(closed.audio), /closed/);
  assert.equal(closed.raw.calls, 0);
});

test('a delayed resume does not replay stale kicks, sacks or cheers', async () => {
  let now = 0; const c = context(); let hits = 0;
  const time = mock.method(performance, 'now', () => now);
  try {
    const resumed = resumeGameAudio(c.audio);
    playActivatedGameAudio(c.audio, () => { hits++; });
    now = 151; c.ready(); await resumed; await settle();
    assert.equal(hits, 0);
  } finally { time.mock.restore(); }
});

test('background events are silent and cannot be queued for a later visibility change', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document'), c = context(); let hits = 0;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: true } });
  try {
    const resumed = resumeGameAudio(c.audio);
    assert.equal(playActivatedGameAudio(c.audio, () => { hits++; }), false);
    c.ready(); await resumed; await settle();
    assert.equal(hits, 0);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('a hung old resume cannot prevent recovery on the next user gesture', async () => {
  let now = 0; const c = context();
  const time = mock.method(performance, 'now', () => now);
  try {
    const first = resumeGameAudio(c.audio);
    now = 200;
    const retry = resumeGameAudio(c.audio);
    assert.notStrictEqual(first, retry); assert.equal(c.raw.calls, 2);
    c.ready(); await Promise.all([first, retry]);
  } finally { time.mock.restore(); }
});
