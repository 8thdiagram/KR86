export const OPENING_DURATION_MS = 4500;
export const OPENING_MARK_START_MS = 350;
export const OPENING_SCENE_START_MS = 1100;

export type OpeningStage = 'black' | 'mark' | 'scene';

export function getOpeningStage(elapsedMs: number): OpeningStage {
  if (elapsedMs < OPENING_MARK_START_MS) return 'black';
  if (elapsedMs < OPENING_SCENE_START_MS) return 'mark';
  return 'scene';
}

export type OpeningFrame = {
  stage: OpeningStage;
  cameraScale: number;
  titleReveal: number;
};

/** Pure timeline model, shared by the canvas renderer and timing tests. */
export function getOpeningFrame(elapsedMs: number): OpeningFrame {
  const time = Math.max(0, Math.min(OPENING_DURATION_MS, elapsedMs));
  const stage = getOpeningStage(time);
  const sceneTime = Math.max(0, time - OPENING_SCENE_START_MS);
  const sceneProgress = Math.min(1, sceneTime / (OPENING_DURATION_MS - OPENING_SCENE_START_MS));
  return {
    stage,
    cameraScale: 1 + sceneProgress * 0.015,
    titleReveal: Math.max(0, Math.min(1, sceneTime / 900)),
  };
}

function drawChromeType(ctx: CanvasRenderingContext2D, width: number, y: number, reveal: number) {
  if (reveal <= 0) return;
  ctx.save();
  ctx.globalAlpha = reveal;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 100px monospace';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 9;
  ctx.strokeStyle = 'rgba(5, 14, 29, .9)';
  ctx.strokeText('KR ’86', width / 2, y);
  ctx.shadowColor = 'rgba(176, 219, 255, .55)';
  ctx.shadowBlur = 12;
  const chrome = ctx.createLinearGradient(0, y - 50, 0, y + 42);
  chrome.addColorStop(0, '#ffffff');
  chrome.addColorStop(.22, '#adc5d9');
  chrome.addColorStop(.43, '#f5fbff');
  chrome.addColorStop(.64, '#738da8');
  chrome.addColorStop(.82, '#d9e8f3');
  chrome.addColorStop(1, '#71869a');
  ctx.fillStyle = chrome;
  ctx.fillText('KR ’86', width / 2, y);
  ctx.shadowBlur = 0;
  ctx.font = 'bold 25px monospace';
  ctx.fillStyle = '#ecf4fa';
  ctx.fillText('S U P E R   C U P', width / 2, y + 58);
  const line = ctx.createLinearGradient(width * .34, 0, width * .66, 0);
  line.addColorStop(0, 'rgba(206, 227, 241, 0)');
  line.addColorStop(.5, 'rgba(224, 237, 247, .9)');
  line.addColorStop(1, 'rgba(206, 227, 241, 0)');
  ctx.fillStyle = line;
  ctx.fillRect(width * .34, y + 80, width * .32, 2);
  ctx.restore();
}

function drawMark(ctx: CanvasRenderingContext2D, width: number, height: number, elapsedMs: number) {
  ctx.fillStyle = '#050c18';
  ctx.fillRect(0, 0, width, height);
  const pulse = .97 + Math.sin(elapsedMs / 90) * .03;
  drawChromeType(ctx, width, height / 2 - 25, pulse);
}

/** Draw a complete opening frame into an already-sized canvas. */
export function renderOpeningScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsedMs: number,
  artwork?: CanvasImageSource,
) {
  const frame = getOpeningFrame(elapsedMs);
  ctx.imageSmoothingEnabled = true;
  if (frame.stage === 'black') {
    ctx.fillStyle = '#030812';
    ctx.fillRect(0, 0, width, height);
  } else if (frame.stage === 'mark') {
    drawMark(ctx, width, height, elapsedMs);
  } else {
    ctx.fillStyle = '#050c18';
    ctx.fillRect(0, 0, width, height);
    const scale = frame.cameraScale;
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    if (artwork) ctx.drawImage(artwork, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    drawChromeType(ctx, width, height * .145, frame.titleReveal);
  }
}
