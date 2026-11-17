// Run with Node 22.18+ and native ffmpeg/ffprobe on PATH.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const testRoot = await mkdtemp(join(tmpdir(), 'yt-render-suite-'));
process.env.YT_RENDER_TEMP_DIR = testRoot;
const { renderVideo, renderRoot, validateConfig } = await import('../src/lib/native-render.ts');
after(() => rm(testRoot, { recursive: true, force: true }));

const config = { width: 720, height: 1280, fps: 30, speed: 100,
  strips: [{ frames: 45, offset: 0, height: 1432 }, { frames: 45, offset: 0, height: 1432 }] };

async function fixtures() {
  const dir = await mkdtemp(join(tmpdir(), 'yt-render-test-'));
  const files = [];
  for (let i = 0; i < 2; i++) {
    const path = join(dir, `${i}.png`);
    // A marker moves up continuously through the seam between strips.
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=black:s=720x1432,drawbox=x=0:y=${500 - i * 150}:w=720:h=40:color=white:t=fill`, '-frames:v', '1', '-threads', '1', path]);
    files.push(new File([await readFile(path)], `${i}.png`));
  }
  const audioPath = join(dir, 'voice.wav');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', audioPath]);
  const audio = new File([await readFile(audioPath)], 'voice.wav');
  return { dir, files, audio };
}

test('native MP4 has exact duration, continuous strip seams, and looped voice', async t => {
  const { dir, files, audio } = await fixtures();
  let id;
  const events = [];
  try {
    await renderVideo(validateConfig(config), files, audio, new AbortController().signal, event => {
      events.push(event);
      if (event.id) id = event.id;
    });
    assert.ok(id);
    const selectedEncoder = events.find(event => event.encoder)?.encoder;
    assert.ok(selectedEncoder, 'export must report its active encoder');
    t.diagnostic(`Active encoder: ${selectedEncoder}; render devices: ${(await readdir('/dev/dri').catch(() => [])).join(', ') || 'none'}`);
    const video = join(renderRoot, id, 'video.mp4');
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', video]));
    const v = probe.streams.find(s => s.codec_type === 'video');
    const a = probe.streams.find(s => s.codec_type === 'audio');
    assert.equal(v.codec_name, 'h264');
    assert.equal(v.nb_frames, '90');
    assert.equal(v.avg_frame_rate, '30/1');
    assert.equal(a.codec_name, 'aac');
    assert.ok(Math.abs(Number(probe.format.duration) - 3) < 0.05);
    assert.ok(Number(a.duration) >= 2.99);
    // Fixture audio is 1s long; verify it loops through second 2 (not padded silence)
    const volLog = spawnSync('ffmpeg', ['-ss', '2.0', '-t', '0.5', '-i', video, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const match = volLog.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
    assert.ok(match && Number(match[1]) > -50, `Audio did not loop beyond 1s: ${volLog}`);
    const pixels = execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-vf', "select='eq(n,44)+eq(n,45)',scale=720:1280,format=gray", '-fps_mode', 'passthrough', '-f', 'rawvideo', 'pipe:1'], { maxBuffer: 4 * 1024 * 1024 });
    const tops = [0, 1].map(frame => {
      for (let y = 0; y < 1280; y++) if (pixels[frame * 720 * 1280 + y * 720 + 360] > 200) return y;
      return -1;
    });
    assert.ok(tops[0] >= 352 && tops[0] <= 355, `unexpected marker ${tops}`);
    assert.equal(tops[1], 350);
    assert.ok(events.every((e, i) => !i || e.progress >= events[i - 1].progress));
    assert.deepEqual(await readdir(join(renderRoot, id)), ['video.mp4']);
  } finally {
    await rm(dir, { recursive: true, force: true });
    if (id) await rm(join(renderRoot, id), { recursive: true, force: true });
  }
});

test('invalid config, corrupt images, cancellation, and missing binary fail cleanly', async () => {
  assert.throws(() => validateConfig({ ...config, speed: 0 }));
  assert.throws(() => validateConfig({ ...config, strips: [{ frames: 9999999, offset: 0, height: 1432 }] }));
  const before = await readdir(renderRoot).catch(() => []);
  await assert.rejects(renderVideo(config, [new File(['bad'], 'bad.png')], null, new AbortController().signal, () => {}), /dimensions/);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(renderVideo(config, [], null, abort.signal, () => {}));
  const { dir, files } = await fixtures();
  const oldPath = process.env.FFMPEG_PATH;
  try {
    process.env.FFMPEG_PATH = '/nonexistent/ffmpeg';
    await assert.rejects(renderVideo(config, files, null, new AbortController().signal, () => {}), /not installed/);
  } finally {
    if (oldPath === undefined) delete process.env.FFMPEG_PATH;
    else process.env.FFMPEG_PATH = oldPath;
    await rm(dir, { recursive: true, force: true });
  }
  assert.deepEqual(await readdir(renderRoot), before);
});


test('one-minute silent export and active cancellation', async t => {
  const { dir, files } = await fixtures();
  const minute = validateConfig({ ...config, speed: 2.5, strips: [{ frames: 1800, offset: 0, height: 1432 }] });
  let id;
  try {
    const started = performance.now();
    await renderVideo(minute, [files[0]], null, new AbortController().signal, event => { if (event.id) id = event.id; });
    t.diagnostic(`60-second 720p synthetic video rendered in ${((performance.now() - started) / 1000).toFixed(2)} seconds`);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', join(renderRoot, id, 'video.mp4')]));
    assert.equal(probe.streams.length, 1);
    assert.equal(probe.streams[0].nb_frames, '1800');
    const before = await readdir(renderRoot);
    const abort = new AbortController();
    await assert.rejects(renderVideo(minute, [files[0]], null, abort.signal, event => {
      if (event.stage === 'Rendering video') abort.abort();
    }), /cancelled|abort/i);
    assert.deepEqual(await readdir(renderRoot), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
    if (id) await rm(join(renderRoot, id), { recursive: true, force: true });
  }
});


test('GPU failure restarts the complete export on CPU', async () => {
  const { dir, files } = await fixtures();
  const wrapper = join(dir, 'ffmpeg-failure.cjs');
  const realFFmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  // Report a working hardware probe, then simulate device loss during a real encode.
  await writeFile(wrapper, `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const codec = args[args.indexOf('-c:v') + 1];
if (['h264_qsv', 'h264_vaapi', 'h264_nvenc', 'h264_videotoolbox'].includes(codec)) {
  if (args.includes('null')) process.exit(0);
  process.stderr.write('Simulated GPU device loss');
  process.exit(1);
}
const result = spawnSync(${JSON.stringify(realFFmpeg)}, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`, { mode: 0o755 });
  const oldPath = process.env.FFMPEG_PATH;
  let id;
  const events = [];
  try {
    process.env.FFMPEG_PATH = wrapper;
    await renderVideo(config, files, null, new AbortController().signal, event => {
      events.push(event);
      if (event.id) id = event.id;
    });
    assert.ok(events.some(event => event.restarted));
    assert.match(events.filter(event => event.encoder).at(-1).encoder, /^CPU/);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', join(renderRoot, id, 'video.mp4')]));
    assert.equal(probe.streams[0].nb_frames, '90');
    assert.deepEqual(await readdir(renderRoot), [id]);
  } finally {
    if (oldPath === undefined) delete process.env.FFMPEG_PATH;
    else process.env.FFMPEG_PATH = oldPath;
    await rm(dir, { recursive: true, force: true });
    if (id) await rm(join(renderRoot, id), { recursive: true, force: true });
  }
});
