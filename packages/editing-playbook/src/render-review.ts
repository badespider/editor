import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fingerprint } from './preview.ts';
import { readDeliveryBundle, runMedia } from './delivery.ts';
import { portraitDocumentSchema, portraitSampleFrames } from './portrait-schema.ts';

/** Full decode, streaming low-resolution frames so long edits do not fill RAM. */
async function decodeScan(path: string, signal?: AbortSignal) {
  return new Promise<{ frames: number; uniformFrames: number; uniformExamples: number[] }>((resolveOutput, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-xerror', '-nostdin', '-threads', '2',
      '-protocol_whitelist', 'file,pipe', '-i', path, '-map', '0:v:0', '-vf', 'scale=32:18,format=gray', '-an', '-c:v', 'rawvideo', '-f', 'rawvideo', 'pipe:1',
      '-map', '0:a:0', '-vn', '-f', 'null', '-'], { windowsHide: true, signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let pending = Buffer.alloc(0), frames = 0, uniformFrames = 0, stderr = '';
    const uniformExamples: number[] = [];
    child.stdout.on('data', (chunk: Buffer) => {
      const data = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      const size = 32 * 18;
      let offset = 0;
      for (; offset + size <= data.length; offset += size) {
        let sum = 0, squares = 0;
        for (let p = offset; p < offset + size; p++) { sum += data[p]; squares += data[p] ** 2; }
        if (squares / size - (sum / size) ** 2 < .25) {
          uniformFrames++;
          if (uniformExamples.length < 20) uniformExamples.push(frames);
        }
        frames++;
      }
      pending = Buffer.from(data.subarray(offset));
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-12000); });
    child.on('error', reject);
    child.on('close', code => code !== 0 || stderr.trim() || pending.length ?
      reject(new Error(`Render decode failed (${code}): ${stderr}`)) : resolveOutput({ frames, uniformFrames, uniformExamples }));
  });
}

async function frame(path: string, seconds: number, signal?: AbortSignal) {
  return runMedia(['-v', 'error', '-nostdin', '-threads', '2', '-ss', seconds.toFixed(8), '-protocol_whitelist', 'file,pipe', '-i', path,
    '-map', '0:v:0', '-frames:v', '1', '-vf', 'scale=64:36,format=rgb24', '-f', 'rawvideo', '-'], { signal });
}
async function pcm(path: string, seconds: number, duration: number, signal?: AbortSignal) {
  const bytes = await runMedia(['-v', 'error', '-nostdin', '-ss', seconds.toFixed(8), '-protocol_whitelist', 'file,pipe', '-i', path,
    '-t', String(duration), '-vn', '-ar', '16000', '-ac', '1', '-f', 'f32le', '-'], { signal });
  return Float32Array.from({ length: bytes.length / 4 }, (_, i) => bytes.readFloatLE(i * 4));
}
export function comparePcm(a: Float32Array, b: Float32Array) {
  const n = Math.min(a.length, b.length);
  let xx = 0, yy = 0;
  for (let i = 0; i < n; i++) { xx += a[i] ** 2; yy += b[i] ** 2; }
  const expectedRms = Math.sqrt(xx / (n || 1)), actualRms = Math.sqrt(yy / (n || 1));
  if (n <= 1280 || a.length !== b.length) return { pass: false, status: 'insufficient_samples', expectedRms, actualRms, correlation: 0, lagMs: 0 };
  if (expectedRms < .0001) return { pass: actualRms < .001, status: 'silent_reference_not_identity_proof', expectedRms, actualRms, correlation: 0, lagMs: 0 };
  let best = -1, bestLag = 0;
  // Up to +/- 40ms, measured at 1ms increments. Periodic audio remains ambiguous.
  for (let lag = -640; lag <= 640; lag += 16) {
    let xy = 0, ax = 0, bx = 0;
    for (let i = 640; i < n - 640; i += 2) {
      xy += a[i] * b[i + lag]; ax += a[i] ** 2; bx += b[i + lag] ** 2;
    }
    const corr = xy / Math.sqrt(ax * bx || 1);
    if (corr > best) { best = corr; bestLag = lag; }
  }
  const gain = actualRms / expectedRms;
  return { pass: best > .9 && Math.abs(bestLag) <= 320 && gain > .7 && gain < 1.4,
    status: 'sampled_waveform', expectedRms, actualRms, correlation: best, lagMs: bestLag / 16 };
}

/** Technical checks only. Never declares that an agent watched the complete video. */
export async function verifyDelivery(directory: string, video: string, options: { signal?: AbortSignal; onProgress?: (message: string) => void } = {}) {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(3_600_000)]) : AbortSignal.timeout(3_600_000);
  const { root, bundle } = await readDeliveryBundle(directory, signal);
  const portraitFrames = bundle.portrait ? portraitSampleFrames(portraitDocumentSchema.parse(JSON.parse(await readFile(join(root,'portrait.json'),'utf8'))).recipe) : [];
  const path = await realpath(resolve(video));
  const data = JSON.parse((await runMedia(['-v', 'error', '-show_streams', '-show_format', '-of', 'json', '-protocol_whitelist', 'file,pipe', path],
    { binary: process.env.FFPROBE_PATH || 'ffprobe', signal })).toString());
  const streams = data.streams as {codec_type: string; width?: number; height?: number; duration?: string; start_time?: string; r_frame_rate?: string}[];
  const visual = streams.find(s => s.codec_type === 'video'), sound = streams.find(s => s.codec_type === 'audio');
  const errors: string[] = [], warnings: string[] = [];
  if (!visual || !sound) throw new Error('Expected both video and audio tracks');
  if (visual.width !== bundle.width || visual.height !== bundle.height) errors.push('Rendered dimensions differ from the prepared edit');
  if (visual.r_frame_rate !== `${bundle.fps}/1`) errors.push('Rendered frame rate differs from the prepared edit');
  if (!Number.isFinite(Number(visual.duration)) || Math.abs(Number(visual.duration) - bundle.duration) > .002) errors.push('Video duration differs from the prepared edit or is unavailable');
  if (!Number.isFinite(Number(sound.duration)) || Math.abs(Number(sound.duration) - bundle.duration) > .1) errors.push('Audio duration differs from the prepared edit or is unavailable');
  const videoStart = Number(visual.start_time), audioStart = Number(sound.start_time);
  if (!Number.isFinite(videoStart) || !Number.isFinite(audioStart) || Math.abs(videoStart - audioStart) > .04 || Math.abs(videoStart) > .002) errors.push('Audio/video start timestamps differ or do not use the expected zero origin');
  options.onProgress?.('Decoding the complete render and scanning for uniform frames');
  const scan = await decodeScan(path, signal);
  if (scan.frames !== bundle.frames) errors.push(`Expected ${bundle.frames} frames, decoded ${scan.frames}`);
  if (scan.uniformFrames) warnings.push(`${scan.uniformFrames} near-uniform frames require visual review; these can be intentional black, cards or naturally flat scenes, not necessarily missing footage`);
  const samples = [];
  for (const [i, clip] of bundle.clips.entries()) {
    options.onProgress?.(`Checking rendered picture/audio ${i + 1}/${bundle.clips.length}: ${clip.id}`);
    const seconds = clip.durationFrames / bundle.fps;
    const audioFrames = new Set((seconds > 1.5 ? [.25, seconds - .75] : [Math.min(.1, seconds / 4)]).map(t => Math.round(t * bundle.fps)));
    const sampleFrames = [...new Set([0, Math.min(1, clip.durationFrames - 1), ...audioFrames, ...portraitFrames, clip.durationFrames - 1])].sort((a,b) => a-b);
    for (const sampleFrame of sampleFrames) {
      const sourceOffset = sampleFrame / bundle.fps;
      const renderedAt = clip.startFrame / bundle.fps + sourceOffset;
      const reference = join(root, clip.path);
      const [a, b] = await Promise.all([frame(reference, sourceOffset, signal), frame(path, renderedAt, signal)]);
      let error = 0;
      for (let p = 0; p < a.length; p++) error += Math.abs(a[p] - b[p]);
      const pictureError = a.length && b.length === a.length ? error / a.length : Infinity;
      const audioDuration = Math.min(.5, seconds - sourceOffset - .04);
      const audio = !audioFrames.has(sampleFrame) ? null : audioDuration >= .2 ? comparePcm(await pcm(reference, sourceOffset, audioDuration, signal), await pcm(path, renderedAt, audioDuration, signal)) :
        { pass: true, status: 'too_short_for_waveform_review', correlation: 0, lagMs: 0 };
      const sample = { clipId: clip.id, sourceOffset, renderedAt, pictureError, picturePass: pictureError < 12, audio };
      samples.push(sample);
      if (!sample.picturePass) errors.push(`${clip.id} at ${renderedAt}s: picture differs from selected media`);
      if (audio && !audio.pass) errors.push(`${clip.id} at ${renderedAt}s: audio source, level or alignment mismatch`);
      if (audio && audio.status !== 'sampled_waveform') warnings.push(`${clip.id} at ${renderedAt}s: ${audio.status}`);
    }
  }
  return { schemaVersion: 1, kind: 'editor-render-review', path, sha256: await fingerprint(path, signal),
    bundleIdentity: { planSha256: bundle.planSha256, compositionSha256: bundle.compositionSha256,
      manifestSha256: createHash('sha256').update(JSON.stringify(bundle)).digest('hex') },
    technicalPass: errors.length === 0, errors, warnings, duration: Number(data.format.duration), scan, samples,
    reviewRequired: true, visualReviewRecorded: false, safeToAutoPublish: false, aiCalls: 0,
    limitations: ['Full decode and sampled source comparisons do not prove continuous audiovisual or narrative correctness.',
      'Waveform alignment can be ambiguous for tones or repeated sounds. Silence cannot prove source identity.',
      'Uniform-frame warnings need inspection; do not automatically brighten, remove or reject dark footage.',
      'Picture checks compare against prepared media, not independent verification of crop subject selection. Changing the composition or portrait recipe requires a new bundle.'] };
}
