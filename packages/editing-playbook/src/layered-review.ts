import { realpath, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readLayeredBundle, jsonHash } from './layered.ts';
import { comparePcm, decodeScan, frame, pcm } from './render-review.ts';
import { fingerprint } from './preview.ts';
import { runMedia } from './delivery.ts';

/** Separate verifier: cut-only audio-vs-picture assumptions are NOT valid for cutaways. */
export async function verifyLayered(directory: string, video: string, options: { signal?: AbortSignal; onProgress?: (message: string) => void } = {}) {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(3600000)]) : AbortSignal.timeout(3600000);
  const { root, bundle, base } = await readLayeredBundle(directory, signal);
  const path = await realpath(resolve(video));
  const before = await stat(path), beforeHash = await fingerprint(path, signal);
  const data = JSON.parse((await runMedia(['-v', 'error', '-show_streams', '-show_format', '-of', 'json', '-protocol_whitelist', 'file,pipe', path],
    { binary: process.env.FFPROBE_PATH || 'ffprobe', signal })).toString());
  const streams = data.streams as { codec_type: string; width?: number; height?: number; duration?: string; start_time?: string; r_frame_rate?: string }[];
  const visual = streams.find(s => s.codec_type === 'video'), sound = streams.find(s => s.codec_type === 'audio');
  if (!visual || !sound) throw new Error('Layered render requires both picture and sound');
  const errors: string[] = [], warnings: string[] = [];
  if (visual.width !== bundle.width || visual.height !== bundle.height || visual.r_frame_rate !== '30/1') errors.push('Wrong picture dimensions/frame rate');
  if (!Number.isFinite(Number(visual.duration)) || Math.abs(Number(visual.duration) - bundle.duration) > .002) errors.push('Wrong video duration');
  if (!Number.isFinite(Number(sound.duration)) || Math.abs(Number(sound.duration) - bundle.duration) > .1) errors.push('Wrong audio duration');
  if (!Number.isFinite(Number(visual.start_time)) || !Number.isFinite(Number(sound.start_time)) ||
    Math.abs(Number(visual.start_time)) > .002 || Math.abs(Number(sound.start_time)) > .04) errors.push('Unexpected audio/video origin');
  options.onProgress?.('Decoding complete layered render');
  const scan = await decodeScan(path, signal);
  if (scan.frames !== bundle.frames) errors.push('Decoded frame count differs from plan');
  if (scan.uniformFrames) warnings.push(`${scan.uniformFrames} uniform frames need inspection; darkness alone is not a failure`);
  const pictureSamples = [];
  for (const picture of bundle.pictures) {
    options.onProgress?.(`Checking visible picture: ${picture.id}`);
    for (const f of new Set([0, Math.min(1, picture.durationFrames - 1), Math.floor(picture.durationFrames / 2), picture.durationFrames - 1])) {
      // Stay just inside the requested frame: decoder seeking at a rounded boundary can advance one frame.
      const at = Math.max(0, (picture.startFrame + f) / 30 - 1e-7);
      const [a, b] = await Promise.all([frame(join(root, picture.path), Math.max(0, picture.sourceIn + f / 30 - 1e-7), signal), frame(path, at, signal)]);
      let total = 0; for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i]);
      const error = a.length && a.length === b.length ? total / a.length : Infinity;
      pictureSamples.push({ id: picture.id, at, error, pass: error < 12 });
      if (error >= 12) errors.push(`${picture.id} at ${at}s: wrong picture`);
    }
  }
  options.onProgress?.('Checking independent sound through cutaways and original clip joins');
  const audioSamples = [], continuitySamples = [];
  const audioTimes = new Set<number>([0]);
  for (let t = 0; t < bundle.duration - .5; t += 10) audioTimes.add(t);
  for (const p of bundle.pictures) for (const t of [p.startFrame / 30 - .25, p.startFrame / 30 + .25, (p.startFrame + p.durationFrames) / 30 - .5])
    audioTimes.add(Math.max(0, Math.min(bundle.duration - .5, t)));
  for (const clip of base.clips) {
    const length = clip.durationFrames / 30;
    for (const offset of new Set([Math.min(.25, length / 4), Math.max(0, length - .75)])) {
      const at = clip.startFrame / 30 + offset, duration = Math.min(.5, length - offset - .04);
      if (duration < .2) { warnings.push(`${clip.id}: too short for base-audio continuity sample`); continue; }
      const result = comparePcm(await pcm(join(root, 'base', clip.path), offset, duration, signal), await pcm(join(root, bundle.audio.path), at, duration, signal));
      continuitySamples.push({ id: clip.id, at, ...result });
      if (!result.pass) errors.push(`${clip.id}: continuity WAV differs from base sound`);
      if (result.status !== 'sampled_waveform') warnings.push(`${clip.id}: ${result.status}`);
      audioTimes.add(Math.min(at, bundle.duration - .5));
    }
  }
  for (const at of [...audioTimes].filter(t => t >= 0).sort((a, b) => a - b)) {
    if (bundle.duration < .5) { warnings.push('Too short for waveform review'); break; }
    const result = comparePcm(await pcm(join(root, bundle.audio.path), at, .5, signal), await pcm(path, at, .5, signal));
    audioSamples.push({ at, ...result });
    if (!result.pass) errors.push(`At ${at}s: rendered sound differs from the independent base sound`);
    if (result.status !== 'sampled_waveform') warnings.push(`At ${at}s: ${result.status}`);
  }
  const after = await stat(path), afterHash = await fingerprint(path, signal);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || beforeHash !== afterHash) throw new Error('Export changed during verification; reinspect unchanged bytes');
  if (jsonHash((await readLayeredBundle(root, signal)).bundle) !== jsonHash(bundle)) throw new Error('Layered bundle changed during verification');
  return { schemaVersion: 1, kind: 'editor-layered-render-review', path, sha256: afterHash,
    bundleIdentity: { planSha256: bundle.planSha256, compositionSha256: bundle.compositionSha256, manifestSha256: jsonHash(bundle) },
    technicalPass: errors.length === 0, errors, warnings, scan, pictureSamples, audioSamples, continuitySamples,
    reviewRequired: true, visualReviewRecorded: false, safeToAutoPublish: false, aiCalls: 0,
    limitations: ['Technical verification is full decode plus sampled comparisons, not continuous viewing or listening.',
      'Prepared picture is compared to selected B-roll; sound is compared separately to base speech/ambience, never to the B-roll sound.',
      'Evidence provenance and story/chronology decisions still require agent/user review. Silence and periodic sounds cannot prove source identity.'] };
}
