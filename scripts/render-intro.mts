import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { INTRO } from "./lib/intro-scene.ts";
import { renderIntroFrame } from "./lib/intro-art.ts";

const outDir = path.resolve("generated-artifacts");
fs.mkdirSync(outDir, { recursive: true });
const rgbPath = path.join(outDir, "intro-remake.rgb");
const mp4Path = path.join(outDir, "intro-remake.mp4");
const sheetPath = path.join(outDir, "intro-remake-contact-sheet.png");
const raw = Buffer.allocUnsafe(INTRO.width * INTRO.height * 3 * INTRO.frames);
for (let frame = 0; frame < INTRO.frames; frame++) {
  const pixels = renderIntroFrame(frame);
  Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength).copy(raw, frame * pixels.byteLength);
}
fs.writeFileSync(rgbPath, raw);
const ffmpeg = spawnSync("ffmpeg", [
  "-v", "error", "-y",
  "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", `${INTRO.width}x${INTRO.height}`,
  "-framerate", String(INTRO.fps), "-i", rgbPath, "-frames:v", String(INTRO.frames),
  "-an", "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4Path,
], { stdio: "inherit" });
if (ffmpeg.status !== 0) throw new Error(`ffmpeg exited with ${ffmpeg.status}`);
const sheet = spawnSync("ffmpeg", [
  "-v", "error", "-y", "-f", "rawvideo", "-pixel_format", "rgb24",
  "-video_size", `${INTRO.width}x${INTRO.height}`, "-framerate", String(INTRO.fps), "-i", rgbPath,
  "-vf", "select='not(mod(n,12))',scale=384:384:flags=neighbor,tile=3x4:padding=4:margin=4",
  "-frames:v", "1", sheetPath,
], { stdio: "inherit" });
if (sheet.status !== 0) throw new Error(`contact sheet ffmpeg exited with ${sheet.status}`);
console.log(`Rendered ${INTRO.frames} authored pixel frames, video, raw RGB, and 12-frame contact sheet.`);
