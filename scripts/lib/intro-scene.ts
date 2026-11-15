/**
 * Deterministic authored intro timeline.
 * Coordinates are native 192x192 pixels; frame 108 (4.5s) is the menu poster pose.
 */
export const INTRO = { width: 192, height: 192, fps: 24, frames: 138 } as const;

export type IntroPhase = "tracking" | "catch" | "gather" | "return" | "cut" | "title";
export type IntroPose = {
  frame: number;
  time: number;
  phase: IntroPhase;
  runnerX: number;
  runnerY: number;
  ballX: number;
  ballY: number;
  held: boolean;
  gait: number;
  defenderX: number;
  defenderY: number;
  arms: "reach" | "secure" | "run" | "cut" | "still";
  title: number;
  cut: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);
const smooth = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeIn = (t: number) => clamp(t, 0, 1) ** 2;

/** Pure frame sampler: stable frame-to-frame, with no mutable animation state. */
export function introPose(frame: number): IntroPose {
  const f = clamp(Math.floor(frame), 0, INTRO.frames - 1);
  const time = f / INTRO.fps;
  const catchAt = 36; // football lands in the outstretched hands on this exact frame
  const startX = 76, startY = 142;
  let runnerX = f < 36 ? mix(71, startX, smooth(f / 36)) : startX;
  if (f >= 44 && f < 72) runnerX = mix(startX, 103, easeIn((f - 44) / 28));
  else if (f >= 72 && f < 91) runnerX = mix(103, 138, easeIn((f - 72) / 19));
  else if (f >= 91) runnerX = mix(138, 153, smooth((f - 91) / 17));

  let runnerY = startY;
  if (f >= 72 && f < 91) runnerY = mix(startY, 124, smooth((f - 72) / 19));
  else if (f >= 91) runnerY = mix(124, 128, smooth((f - 91) / 17));

  // Outstretched right hand receives at runner + 26, y - 8; tuck takes 8 real frames.
  const landingX = startX + 26, landingY = startY - 8;
  const ballArc = clamp(f / catchAt, 0, 1);
  let ballX = mix(132, landingX, smooth(ballArc));
  let ballY = 39 + (landingY - 39) * ballArc - 10 * Math.sin(Math.PI * ballArc);
  const held = f >= catchAt;
  if (held && f < 44) {
    const tuck = smooth((f - catchAt) / 8);
    ballX = mix(landingX, runnerX + 13, tuck);
    ballY = mix(landingY, runnerY - 1, tuck);
  } else if (held) { ballX = runnerX + 13; ballY = runnerY - 1; }

  // Coverage closes on the carrier. The defender commits to the original lane,
  // then lunges past as the returner plants and cuts toward the far sideline.
  const defenderX = f < 44 ? mix(178, 165, smooth(f / 44))
    : f < 72 ? mix(165, 138, easeIn((f - 44) / 28))
      : f < 91 ? mix(138, 116, smooth((f - 72) / 19)) : 116;
  const defenderY = f < 72 ? 143 : f < 91 ? mix(143, 151, smooth((f - 72) / 19)) : 151;
  let phase: IntroPhase = "tracking";
  if (f >= 36 && f < 39) phase = "catch";
  else if (f >= 39 && f < 44) phase = "gather";
  else if (f >= 72 && f < 91) phase = "cut";
  else if (f >= 91) phase = "title";
  else if (f >= 44) phase = "return";
  let distance = 0;
  if (f >= 44 && f < 72) distance = runnerX - startX;
  else if (f >= 72 && f < 91) distance = 27 + (runnerX - 103);
  else if (f >= 91) distance = 62 + (runnerX - 138);
  const gait = f < 44 ? (f > 19 ? Math.floor((runnerX - 71) / 2) % 2 : 0)
    : Math.floor(distance / 8) % 4;
  return {
    frame: f, time, phase,
    runnerX: Math.round(runnerX), runnerY: Math.round(runnerY),
    ballX: Math.round(ballX), ballY: Math.round(ballY), held,
    gait, defenderX: Math.round(defenderX), defenderY: Math.round(defenderY),
    arms: f <= catchAt ? "reach" : f < 44 ? "secure" : f < 72 ? "run" : f < 91 ? "cut" : f < 108 ? "run" : "still",
    title: smooth((f - 88) / 20),
    cut: smooth((f - 72) / 19),
  };
}
