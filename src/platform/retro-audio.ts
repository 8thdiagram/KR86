/** Short, original Web Audio cues. Nothing streams, loops, or needs a server. */
export type MenuSound = 'move' | 'confirm' | 'locked' | 'transition';
type Voice = { oscillator: OscillatorNode; gain: GainNode; intro: boolean };
let context: AudioContext | undefined;
let enabled = true;
const voices = new Set<Voice>();

export function setRetroSoundEnabled(value: boolean) {
  enabled = value;
  if (!value) stopVoices(false);
}

export function unlockRetroAudio() {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const Audio = window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return;
    context ??= new Audio();
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
  } catch { /* Optional browser audio must never prevent playing or saving. */ }
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

export function playIntroSound(kind: 'stinger' | 'theme') {
  stopIntroSound();
  if (kind === 'stinger') {
    [48, 60, 67, 72].forEach((note, i) => tone(note, i * .07, .18, true));
    return;
  }
  // A finite 3.36-second, two-voice sports fanfare. No intervals or repeats.
  const lead = [72, 0, 76, 79, 79, 76, 74, 72, 74, 77, 81, 79, 76, 74, 72, 72];
  const bass = [48, 55, 48, 55, 53, 60, 53, 60, 50, 57, 50, 57, 55, 55, 48, 48];
  lead.forEach((note, i) => {
    if (note) tone(note, i * .2, i === 15 ? .36 : .14, true);
    tone(bass[i]!, i * .2, .15, true, 'triangle', .075);
  });
}

function stopVoices(introOnly: boolean) {
  for (const voice of [...voices]) {
    if (introOnly && !voice.intro) continue;
    try { voice.oscillator.stop(); } catch { /* Already stopped. */ }
    voice.oscillator.disconnect(); voice.gain.disconnect();
    voices.delete(voice);
  }
}

export function stopIntroSound() { stopVoices(true); }

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopVoices(false);
  });
}
