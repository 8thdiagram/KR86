/** Local sound effects and a quiet menu-only chip sports loop. */
export type MenuSound = 'move' | 'confirm' | 'locked' | 'transition';
type Voice = { oscillator: OscillatorNode; gain: GainNode; intro: boolean };
let context: AudioContext | undefined;
let enabled = true;
const voices = new Set<Voice>();
let introGeneration = 0;
let hutBuffer: Promise<AudioBuffer> | undefined;
let themeVoice: { source: AudioBufferSourceNode; gain: GainNode } | undefined;
let menuBuffer: Promise<AudioBuffer> | undefined;
let menuVoice: { source: AudioBufferSourceNode; gain: GainNode } | undefined;
let menuGeneration = 0;
let menuLoading = false;
export type RetroAudioState = 'ready' | 'blocked' | 'unavailable' | 'muted';

export function retroAudioState(): RetroAudioState {
  if (!enabled) return 'muted';
  if (typeof window === 'undefined' || !(window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)) return 'unavailable';
  return context?.state === 'running' ? 'ready' : 'blocked';
}

function announceAudioReady() {
  if (retroAudioState() === 'ready') window.dispatchEvent?.(new Event('kick-return-retro-audio-ready'));
}

function loadAudio(url: string) {
  if (!context) return undefined;
  const audioContext = context;
  return fetch(url)
    .then(response => {
      if (!response.ok) throw new Error('Local audio could not be loaded.');
      return response.arrayBuffer();
    }).then(bytes => audioContext.decodeAudioData(bytes));
}

export function setRetroSoundEnabled(value: boolean) {
  enabled = value;
  if (!value) { stopIntroSound(); stopMenuMusic(); stopVoices(false); }
}

export function unlockRetroAudio(): RetroAudioState {
  if (!enabled) return 'muted';
  if (typeof window === 'undefined') return 'unavailable';
  try {
    const Audio = window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return 'unavailable';
    if (!context) {
      context = new Audio();
      context.addEventListener?.('statechange', announceAudioReady);
    }
    if (context.state === 'suspended') void context.resume().then(announceAudioReady).catch(() => undefined);
    return retroAudioState();
  } catch { return 'unavailable'; /* Optional audio must never prevent playing or saving. */ }
}

function tone(note: number, offset: number, duration: number, intro = false,
  type: OscillatorType = 'square', volume = .055) {
  if (!enabled || !context || context.state !== 'running') return;
  const oscillator = context.createOscillator(), gain = context.createGain();
  const start = context.currentTime + offset;
  oscillator.type = type;
  oscillator.frequency.value = 440 * 2 ** ((note - 69) / 12);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + .004);
  gain.gain.setValueAtTime(volume, start + Math.max(.005, duration - .015));
  gain.gain.linearRampToValueAtTime(0, start + duration);
  oscillator.connect(gain); gain.connect(context.destination);
  const voice = { oscillator, gain, intro };
  voices.add(voice);
  oscillator.onended = () => {
    voices.delete(voice); oscillator.disconnect(); gain.disconnect();
  };
  oscillator.start(start); oscillator.stop(start + duration + .01);
}

export function playMenuSound(kind: MenuSound) {
  unlockRetroAudio();
  switch (kind) {
    case 'move': tone(79, 0, .045); break;
    case 'confirm':
      tone(72, 0, .055); tone(79, .055, .065); tone(84, .12, .1); break;
    case 'locked':
      tone(39, 0, .085, false, 'triangle', .11);
      tone(37, .095, .11, false, 'triangle', .11); break;
    case 'transition':
      [84, 79, 74, 67].forEach((note, i) => tone(note, i * .022, .04)); break;
  }
}

export function playIntroSound(kind: 'stinger' | 'hut') {
  stopIntroSound();
  if (kind === 'stinger') {
    [36, 43, 48].forEach((note, i) => tone(note, i * .075, .14, true));
    return;
  }
  if (!enabled || !context || context.state !== 'running') return;
  const generation = introGeneration, audioContext = context, requestedAt = context.currentTime;
  hutBuffer ??= loadAudio(new URL('../game/assets/football-hut.mp3', import.meta.url).href)
    ?.catch(error => { hutBuffer = undefined; throw error; });
  void hutBuffer?.then(buffer => {
    if (generation !== introGeneration || !enabled || audioContext.state !== 'running'
      || (typeof document !== 'undefined' && document.hidden)) return;
    // If decode was delayed, join at the video's current elapsed time, never late.
    const elapsed = Math.max(0, audioContext.currentTime - requestedAt);
    const offset = Math.max(0, elapsed - 4.7);
    const duration = Math.min(.9, buffer.duration) - offset;
    if (duration <= 0) return;
    const source = audioContext.createBufferSource(), gain = audioContext.createGain();
    source.buffer = buffer; source.loop = false; gain.gain.value = .5;
    source.connect(gain); gain.connect(audioContext.destination);
    const voice = { source, gain }; themeVoice = voice;
    source.onended = () => {
      source.disconnect(); gain.disconnect();
      if (themeVoice === voice) themeVoice = undefined;
    };
    const startAt = Math.max(audioContext.currentTime, requestedAt + 4.7);
    source.start(startAt, offset, duration);
    source.stop(startAt + duration);
  }).catch(() => {
    if (generation === introGeneration && typeof window !== 'undefined') {
      window.dispatchEvent?.(new Event('kick-return-intro-audio-error'));
    }
  });
}

export function startMenuMusic() {
  if (unlockRetroAudio() !== 'ready' || !context || menuVoice || menuLoading
    || (typeof document !== 'undefined' && document.hidden)) return;
  const generation = menuGeneration, audioContext = context;
  menuLoading = true;
  menuBuffer ??= loadAudio(new URL('./assets/menu-sports.wav', import.meta.url).href)
    ?.catch(error => { menuBuffer = undefined; throw error; });
  void menuBuffer?.then(buffer => {
    if (generation !== menuGeneration || !enabled || audioContext.state !== 'running'
      || (typeof document !== 'undefined' && document.hidden)) return;
    const source = audioContext.createBufferSource(), gain = audioContext.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = .18;
    source.connect(gain); gain.connect(audioContext.destination);
    const voice = { source, gain };
    menuVoice = voice;
    source.onended = () => {
      source.disconnect(); gain.disconnect();
      if (menuVoice === voice) menuVoice = undefined;
    };
    source.start();
  }).catch(() => {
    if (generation === menuGeneration && typeof window !== 'undefined')
      window.dispatchEvent?.(new Event('kick-return-menu-audio-error'));
  }).finally(() => { if (generation === menuGeneration) menuLoading = false; });
}

export function stopMenuMusic() {
  menuGeneration++;
  menuLoading = false;
  if (!menuVoice) return;
  try { menuVoice.source.stop(); } catch { /* Already ended. */ }
  menuVoice.source.disconnect(); menuVoice.gain.disconnect();
  menuVoice = undefined;
}

function stopVoices(introOnly: boolean) {
  for (const voice of [...voices]) {
    if (introOnly && !voice.intro) continue;
    try { voice.oscillator.stop(); } catch { /* Already stopped. */ }
    voice.oscillator.disconnect(); voice.gain.disconnect();
    voices.delete(voice);
  }
}

export function stopIntroSound() {
  introGeneration++;
  stopVoices(true);
  if (themeVoice) {
    try { themeVoice.source.stop(); } catch { /* Already ended. */ }
    themeVoice.source.disconnect(); themeVoice.gain.disconnect();
    themeVoice = undefined;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopIntroSound(); stopMenuMusic(); stopVoices(false); }
  });
}
