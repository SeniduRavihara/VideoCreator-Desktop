import { spawn, execSync } from 'node:child_process';
import { mkdir, writeFile, rm, readdir, readFile, chmod } from 'node:fs/promises';
import { existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, availableParallelism } from 'node:os';
import { randomUUID } from 'node:crypto';
import ffmpegStatic from 'ffmpeg-static';

export function getFFmpegBinary(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {}
  try {
    if (ffmpegStatic) {
      const p = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
      if (existsSync(p)) {
        try { chmodSync(p, 0o755); } catch {}
        return p;
      }
    }
  } catch {}
  return 'ffmpeg';
}

export const renderRoot = join(process.env.YT_RENDER_TEMP_DIR || tmpdir(), 'yt-video-renders');
export type RenderConfig = {
  width: number; height: number; fps: number; speed: number;
  strips: { frames: number; offset: number; height: number }[];
};
export type RenderEvent = { progress: number; stage: string; id?: string; error?: string; encoder?: string; restarted?: boolean };

export function validateConfig(value: unknown): RenderConfig {
  const config = value as RenderConfig;
  if (!config || ![720, 1080].includes(config.width) || config.height !== config.width * 16 / 9 ||
      config.fps !== 30 || !Number.isFinite(config.speed) || config.speed <= 0 || config.speed > 1000 ||
      !Array.isArray(config.strips) || !config.strips.length || config.strips.length > 512) {
    throw new Error('Invalid video settings.');
  }
  let frames = 0;
  for (const strip of config.strips) {
    if (!strip || !Number.isInteger(strip.frames) || strip.frames < 1 ||
        !Number.isFinite(strip.offset) || strip.offset < 0 || strip.offset >= 1 ||
        !Number.isInteger(strip.height) || strip.height < config.height || strip.height > config.height + 4100 ||
        strip.height < config.height + Math.ceil(strip.offset + (strip.frames - 1) * config.speed / config.fps)) {
      throw new Error('Invalid story image section.');
    }
    frames += strip.frames;
  }
  if (frames > 30 * 60 * 180) throw new Error('Exports are limited to three hours.');
  return config;
}

function runFFmpeg(args: string[], signal: AbortSignal, onFrame: (frame: number) => void, timeoutMs = 0) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const child = spawn(getFFmpegBinary(), ['-hide_banner', '-nostdin', '-y', '-progress', 'pipe:1', '-nostats', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let timedOut = false;
    const timeout = timeoutMs ? setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs) : undefined;
    let tail = '';
    let pending = '';
    const abort = () => { child.kill('SIGKILL'); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    child.stdout.on('data', chunk => {
      pending += chunk.toString();
      const lines = pending.split('\n');
      pending = lines.pop() || '';
      for (const line of lines) if (line.startsWith('frame=')) onFrame(Number(line.slice(6)) || 0);
    });
    child.stderr.on('data', chunk => { tail = (tail + chunk.toString()).slice(-3000); });
    child.on('error', error => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      reject(new Error((error as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'Native FFmpeg is not installed on the app server. Install FFmpeg or set FFMPEG_PATH.' : error.message));
    });
    child.on('close', code => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(new Error('Export cancelled.'));
      else if (timedOut) reject(new Error('FFmpeg encoder probe timed out.'));
      else if (code !== 0) reject(new Error(`FFmpeg could not render this video: ${tail.slice(-1000)}`));
      else resolve();
    });
  });
}

type Encoder = {
  name: string;
  hardware: boolean;
  inputArgs: string[];
  filter: string;
  outputArgs: string[];
};

async function encoderCandidates(softwareOnly: boolean): Promise<Encoder[]> {
  const candidates: Encoder[] = [];
  const add = (name: string, outputArgs: string[], inputArgs: string[] = [], filter = 'format=yuv420p', hardware = true) => {
    candidates.push({ name, outputArgs, inputArgs, filter, hardware });
  };
  if (!softwareOnly) {
    if (process.platform === 'darwin') add('Apple VideoToolbox', ['-c:v', 'h264_videotoolbox', '-b:v', '8M', '-bf', '0']);
    if (process.platform === 'win32') add('Intel Quick Sync', ['-c:v', 'h264_qsv', '-preset', 'veryfast', '-global_quality', '20', '-bf', '0'], [], 'format=nv12');
    if (process.platform === 'linux') {
      const devices = (await readdir('/dev/dri').catch(() => []))
        .filter(name => /^renderD\d+$/.test(name)).sort();
      for (const device of devices) {
        const path = `/dev/dri/${device}`;
        const vendor = await readFile(`/sys/class/drm/${device}/device/vendor`, 'utf8').catch(() => '');
        // Derive the QSV device from the same VAAPI device used by the filter graph.
        if (vendor.trim() === '0x8086') {
          add('Intel Quick Sync', ['-c:v', 'h264_qsv', '-preset', 'veryfast', '-global_quality', '20', '-bf', '0'],
            ['-init_hw_device', `vaapi=va:${path}`, '-init_hw_device', 'qsv=qs@va', '-filter_hw_device', 'qs'],
            'format=nv12,hwupload=extra_hw_frames=64');
        }
        add(vendor.trim() === '0x8086' ? 'Intel VAAPI' : 'VAAPI GPU', ['-c:v', 'h264_vaapi', '-qp', '20', '-bf', '0'],
          ['-init_hw_device', `vaapi=va:${path}`, '-filter_hw_device', 'va'], 'format=nv12,hwupload');
      }
    }
    add('NVIDIA NVENC', ['-c:v', 'h264_nvenc', '-preset', 'p1', '-cq', '20', '-bf', '0']);
  }
  add('CPU (x264)', ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20'], [], 'format=yuv420p', false);
  add('CPU (OpenH264)', ['-c:v', 'libopenh264', '-b:v', '8M'], [], 'format=yuv420p', false);
  return candidates;
}

async function selectEncoder(config: RenderConfig, signal: AbortSignal, softwareOnly: boolean): Promise<Encoder> {
  for (const candidate of await encoderCandidates(softwareOnly)) {
    try {
      // Test real output dimensions and the RGB-to-GPU upload path, not just encoder presence.
      await runFFmpeg([...candidate.inputArgs, '-f', 'lavfi', '-i', `color=black:s=${config.width}x${config.height}:r=${config.fps},format=rgb24`,
        '-vf', candidate.filter, '-frames:v', '3', ...candidate.outputArgs, '-threads', '2', '-f', 'null', '-'], signal, () => {}, 10_000);
      return candidate;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof Error && error.message.includes('not installed')) throw error;
    }
  }
  throw new Error('FFmpeg needs a working H.264 encoder (Intel Quick Sync/VAAPI, NVENC, VideoToolbox, x264, or OpenH264).');
}

export async function renderVideo(config: RenderConfig, images: File[], audio: File | null, signal: AbortSignal, emit: (event: RenderEvent) => void, softwareOnly = false) {
  const id = randomUUID();
  const directory = join(renderRoot, id);
  await mkdir(directory, { recursive: true });
  let succeeded = false;
  let encoder: Encoder | undefined;
  try {
    signal.throwIfAborted();
    encoder = await selectEncoder(config, signal, softwareOnly);
    emit({ progress: 0, stage: 'Starting FFmpeg', encoder: encoder.name });
    let completed = 0;
    const totalFrames = config.strips.reduce((sum, strip) => sum + strip.frames, 0);
    for (let index = 0; index < images.length; index++) {
      signal.throwIfAborted();
      const strip = config.strips[index];
      const png = Buffer.from(await images[index].arrayBuffer());
      if (png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
          png.readUInt32BE(16) !== config.width || png.readUInt32BE(20) !== strip.height) {
        throw new Error('Story image dimensions do not match the export settings.');
      }
      const input = join(directory, `strip-${index}.png`);
      await writeFile(input, png);
      await runFFmpeg([
        ...encoder.inputArgs, '-framerate', String(config.fps), '-i', input,
        '-vf', `loop=loop=-1:size=1:start=0,crop=${config.width}:${config.height}:0:'${strip.offset}+n*${config.speed}/${config.fps}':exact=1,${encoder.filter}`,
        '-frames:v', String(strip.frames), '-an', ...encoder.outputArgs,
        '-threads', String(Math.min(8, availableParallelism())), join(directory, `part-${index}.mp4`),
      ], signal, frame => emit({ progress: Math.min(94, Math.round((completed + frame) / totalFrames * 94)), stage: 'Rendering video' }));
      completed += strip.frames;
      await rm(input);
    }
    emit({ progress: 95, stage: 'Adding audio and finishing MP4' });
    const list = join(directory, 'parts.txt');
    await writeFile(list, config.strips.map((_, index) => `file 'part-${index}.mp4'`).join('\n'));
    const args = ['-f', 'concat', '-safe', '1', '-i', list];
    if (audio) {
      const audioPath = join(directory, 'voice');
      await writeFile(audioPath, Buffer.from(await audio.arrayBuffer()));
      args.push('-stream_loop', '-1', '-i', audioPath, '-map', '0:v:0', '-map', '1:a:0', '-af', 'apad', '-c:a', 'aac', '-b:a', '192k');
    }
    args.push('-c:v', 'copy', '-t', String(totalFrames / config.fps), '-movflags', '+faststart', join(directory, 'video.mp4'));
    await runFFmpeg(args, signal, () => {});
    signal.throwIfAborted();
    await Promise.all(config.strips.map((_, index) => rm(join(directory, `part-${index}.mp4`))));
    await rm(list);
    if (audio) await rm(join(directory, 'voice'));
    // Give the browser time to download, then discard temporary output.
    setTimeout(() => { void rm(directory, { recursive: true, force: true }); }, 30 * 60 * 1000).unref();
    emit({ progress: 100, stage: 'Ready', id });
    succeeded = true;
  } catch (error) {
    if (!signal.aborted && encoder?.hardware && error instanceof Error && error.message.startsWith('FFmpeg could not render')) {
      // Restart every section with one CPU encoder; mixed encoders can break concat playback.
      await rm(directory, { recursive: true, force: true });
      emit({ progress: 0, stage: 'GPU unavailable; restarting on CPU', restarted: true });
      return await renderVideo(config, images, audio, signal, emit, true);
    }
    throw error;
  } finally {
    if (!succeeded) await rm(directory, { recursive: true, force: true });
  }
}
