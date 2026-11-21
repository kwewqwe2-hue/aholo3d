// Run after skilled. The portable MP4 keeps the complete real-time game
// recording, including the original tab sound and the final receipt.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { withQaBrowser } from './browser.mjs';
import { ffmpeg } from './doorstep-recorder.mjs';
import { releaseEvidence, sha256 } from './doorstep-source.mjs';

const dir = process.argv[2] ? path.resolve(process.argv[2]) : releaseEvidence;
const raw = path.join(dir, '第一天-常驻手机-连续原片.webm'), mp4 = path.join(dir, '第一天-常驻手机-原声实机.mp4');
const skill = JSON.parse(await readFile(path.join(dir, 'skilled.json'), 'utf8'));
assert.equal(skill.passed, true);
const codec = ffmpeg();
function convert(duration) {
  // A variable-rate tab recording may finish with audio after the last video
  // packet. Hold that final picture to the original browser presentation end.
  execFileSync(codec, ['-nostdin', '-v', 'error', '-i', raw, '-map', '0:v:0', '-map', '0:a:0',
    '-vf', 'fps=30:start_time=0,tpad=stop_mode=clone:stop_duration=0.5', '-af', 'apad',
    '-t', duration.toFixed(6), '-c:v', 'libx264', '-threads', '4', '-preset', 'fast', '-crf', '22',
    '-g', '60', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-y', mp4],
    { windowsHide: true });
}

async function verify(page, file) {
  const decoded = spawnSync(codec, ['-nostdin', '-hide_banner', '-stats_period', '60', '-i', file,
    '-map', '0:v:0', '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8', windowsHide: true });
  assert.equal(decoded.status, 0, decoded.stderr);
  const frames = Number(decoded.stderr.match(/frame=\s*(\d+)[^\r\n]*Lsize/g)?.at(-1)?.match(/frame=\s*(\d+)/)?.[1]);
  assert.ok(frames > 700, '录像不足 700 个可解码帧');
  const volume = Number(decoded.stderr.match(/max_volume:\s*([-\d.]+) dB/)?.[1]);
  assert.ok(volume < .1 && volume > -45, '未解码到有效游戏音轨');
  const local = pathToFileURL(file).href;
  await page.route(url => url.href === local, route => route.continue());
  await page.goto(local);
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  const play = await page.evaluate(async () => {
    const v = document.querySelector('video');
    v.pause();
    const seeks = [];
    for (const fraction of [.03, .50, .95]) {
      const done = new Promise((resolve, reject) => {
        v.addEventListener('seeked', resolve, { once: true });
        v.addEventListener('error', () => reject(Error(v.error?.message || 'video error')), { once: true });
      });
      v.currentTime = v.duration * fraction;
      await done;
      seeks.push(v.currentTime);
    }
    const start = v.currentTime;
    v.muted = true;
    await v.play();
    await new Promise(resolve => setTimeout(resolve, 260));
    v.pause();
    return { duration: v.duration, width: v.videoWidth, height: v.videoHeight, seeks, played: v.currentTime - start };
  });
  assert.ok(Number.isFinite(play.duration) && play.played > .1 && play.width === 1280 && play.height === 720);
  return { file: path.basename(file), sha256: sha256(await readFile(file)), bytes: (await stat(file)).size,
    decodedFrames: frames, peakVolumeDb: volume, ...play };
}
const proof = await withQaBrowser(async ({ page, browser }) => {
  const original = await verify(page, raw);
  convert(original.duration);
  return { source:skill.sourceAtStart, browser:browser.version(), trimmedSeconds:0,
    original, mp4:await verify(page, mp4) };
});
assert.ok(Math.abs(proof.original.duration - proof.mp4.duration) < .15, '播放器版本的完整时长不符');
await writeFile(path.join(dir, 'media.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof));
