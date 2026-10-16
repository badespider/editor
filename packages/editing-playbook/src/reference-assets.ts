// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { AgentEvidenceService } from '@diffusionstudio/video-understanding/agent';
import type { AgentArtifact, AgentSession } from '@diffusionstudio/video-understanding/agent';
import { mkdir, open, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { runMedia } from './delivery.ts';
import { fingerprint } from './preview.ts';
import { resolveLocalReferenceVideo } from './reference-evidence.ts';

const MAX_PIXELS = 8_294_400;
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const rectangleSchema = z.object({
  x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1),
  width: z.number().finite().positive().max(1), height: z.number().finite().positive().max(1),
}).strict().superRefine((rect, context) => {
  if (rect.x + rect.width > 1 + Number.EPSILON || rect.y + rect.height > 1 + Number.EPSILON) {
    context.addIssue({ code: 'custom', message: 'Normalized crop rectangle must stay inside the source frame.' });
  }
});

export const referenceAssetRequestSchema = z.object({
  id: z.string().max(64).regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).refine(id => id !== 'reference-source', 'reference-source is reserved for the trusted video binding.'),
  kind: z.enum(['frame-crop', 'texture-tile']), time: z.number().finite().nonnegative(),
  rect: rectangleSchema, purpose: z.string().trim().min(1).max(600),
}).strict().superRefine((request, context) => {
  const maximum = request.kind === 'texture-tile' ? .2 : .5;
  if (request.rect.width * request.rect.height > maximum + Number.EPSILON) {
    context.addIssue({ code: 'custom', message: `${request.kind} crop may cover at most ${maximum * 100}% of the source frame.` });
  }
});

export const referenceAssetRequestsSchema = z.array(referenceAssetRequestSchema).min(1).max(16).superRefine((requests, context) => {
  if (new Set(requests.map(request => request.id)).size !== requests.length) context.addIssue({ code: 'custom', message: 'Prepared asset IDs must be unique.' });
});

const sourceSchema = z.object({
  path: z.string().min(1).max(32768), sha256, sessionId: sha256,
  width: z.number().int().positive().max(8192), height: z.number().int().positive().max(8192),
  duration: z.number().finite().positive().max(7200),
}).strict().superRefine((source, context) => {
  if (source.width * source.height > MAX_PIXELS) context.addIssue({ code: 'custom', message: `Prepared source canvas is limited to ${MAX_PIXELS} pixels.` });
});
const optionsSchema = z.object({ source: sourceSchema, requests: referenceAssetRequestsSchema,
  directory: z.string().min(1).max(32768), cacheDir: z.string().min(1).max(32768).optional(),
  signal: z.instanceof(AbortSignal).optional(),
}).strict();

export type ReferenceAssetRequest = z.infer<typeof referenceAssetRequestSchema>;
export type ReferenceAssetSource = z.infer<typeof sourceSchema>;
export type PrepareReferenceAssetsOptions = z.input<typeof optionsSchema>;
export type ReferencePreparedAsset = {
  id: string; kind: ReferenceAssetRequest['kind']; path: string; sha256: string; width: number; height: number;
  preparedMedia: true; reviewRequired: true;
  provenance: {
    sourceSha256: string; sessionId: string; inspectionId: string; evidenceId: string; frameSha256: string;
    time: number; requestedTime: number; decodedTime: number; absolutePts: number;
    normalizedRect: ReferenceAssetRequest['rect']; cropPixels: { x: number; y: number; width: number; height: number };
    repeatPolicy: { mode: 'none' | 'repeat-pixels'; columns: number; rows: number; anchor: 'top-left' };
    purpose: string; limitation: string;
  };
};

/** Enclose the authored ROI in whole pixels; reject rather than exceeding an area cap through rounding. */
export function referenceAssetCropPixels(input: ReferenceAssetRequest, dimensions: { width: number; height: number }) {
  const request = referenceAssetRequestSchema.parse(input);
  const size = z.object({ width: z.number().int().positive().max(8192), height: z.number().int().positive().max(8192) }).strict().parse(dimensions);
  if (size.width * size.height > MAX_PIXELS) throw new Error('Source canvas exceeds the prepared pixel budget.');
  const x = Math.floor(request.rect.x * size.width), y = Math.floor(request.rect.y * size.height);
  const right = Math.min(size.width, Math.ceil((request.rect.x + request.rect.width) * size.width));
  const bottom = Math.min(size.height, Math.ceil((request.rect.y + request.rect.height) * size.height));
  const crop = { x, y, width: right - x, height: bottom - y };
  if (crop.width < 1 || crop.height < 1 || crop.width * crop.height > size.width * size.height * (request.kind === 'texture-tile' ? .2 : .5)) {
    throw new Error('Rounded crop pixels exceed the asset area limit; choose a smaller ROI.');
  }
  return crop;
}

function localPath(path: string) {
  if (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path) || /^[\\/]{2}/.test(path)) {
    throw new Error('Prepared assets require local filesystem paths, not URLs or network shares.');
  }
  return resolve(path);
}
function inside(directory: string, path: string) {
  const child = relative(directory, path);
  if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) throw new Error('Prepared asset path escaped its canonical directory.');
}

async function pngSize(path: string) {
  const info = await stat(path);
  if (!info.isFile() || info.size > 64 * 1024 ** 2 || info.size < 24) throw new Error('Expected a bounded regular PNG file.');
  const handle = await open(path, 'r'), header = Buffer.alloc(24);
  try { if ((await handle.read(header, 0, 24, 0)).bytesRead !== 24) throw new Error('Incomplete PNG header.'); }
  finally { await handle.close(); }
  if (!header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || header.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Expected a pipeline PNG frame.');
  }
  const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
  if (!width || !height || width * height > MAX_PIXELS) throw new Error('PNG exceeds the prepared pixel budget.');
  return { width, height };
}

async function sourceUnchanged(source: ReferenceAssetSource, session: AgentSession, path: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const before = await stat(path);
  if (!before.isFile() || before.size !== session.source.bytes || before.mtimeMs !== session.source.mtimeMs ||
      await fingerprint(path, signal) !== source.sha256) throw new Error('Reference source changed; prepare assets from a fresh evidence session.');
  const after = await stat(path);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Reference source changed while verifying its fingerprint.');
}

async function checkedFrame(artifact: AgentArtifact, requested: number, source: ReferenceAssetSource, evidenceDirectory: string, signal?: AbortSignal) {
  if (artifact.kind !== 'frame' || !artifact.native || artifact.requestedTime !== requested || !Number.isFinite(artifact.start) ||
      artifact.start + 1e-5 < requested || artifact.start >= source.duration + .05) throw new Error('Evidence returned an invalid native source timestamp.');
  const path = await realpath(localPath(artifact.path));
  inside(evidenceDirectory, path);
  const dimensions = await pngSize(path);
  if (dimensions.width !== source.width || dimensions.height !== source.height) {
    throw new Error('Native display-frame dimensions differ from the bound source canvas; normalize and reinspect this source before cropping.');
  }
  return { path, sha256: await fingerprint(path, signal) };
}

async function repeatTexture(cropPath: string, output: string, rawPath: string, crop: { width: number; height: number }, canvas: { width: number; height: number }, signal?: AbortSignal) {
  const tile = await runMedia(['-v', 'error', '-nostdin', '-threads', '1', '-protocol_whitelist', 'file,pipe', '-i', cropPath,
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { signal, limit: crop.width * crop.height * 4 });
  if (tile.length !== crop.width * crop.height * 4) throw new Error('Decoded texture dimensions changed.');
  const pixels = Buffer.alloc(canvas.width * canvas.height * 4), rowBytes = canvas.width * 4, tileRowBytes = crop.width * 4;
  for (let y = 0; y < canvas.height; y++) {
    signal?.throwIfAborted();
    const row = tile.subarray((y % crop.height) * tileRowBytes, (y % crop.height + 1) * tileRowBytes);
    for (let x = 0; x < canvas.width; x += crop.width) row.copy(pixels, y * rowBytes + x * 4, 0, Math.min(crop.width, canvas.width - x) * 4);
  }
  await writeFile(rawPath, pixels, { flag: 'wx', mode: 0o600 });
  try {
    await runMedia(['-v', 'error', '-nostdin', '-n', '-threads', '1', '-protocol_whitelist', 'file,pipe', '-f', 'rawvideo',
      '-pixel_format', 'rgba', '-video_size', `${canvas.width}x${canvas.height}`, '-i', rawPath,
      '-frames:v', '1', '-update', '1', output], { signal });
  } finally { await unlink(rawPath); }
}

/** Local prepared raster assets, bound to one source/session. No model, remote fetch, editor mutation or original-layer recovery. */
export async function prepareReferenceAssets(input: PrepareReferenceAssetsOptions): Promise<ReferencePreparedAsset[]> {
  const options = optionsSchema.parse(input), { source, signal } = options;
  signal?.throwIfAborted();
  const target = localPath(options.directory);
  if (options.cacheDir) localPath(options.cacheDir);
  const crops = options.requests.map(request => {
    if (request.time >= source.duration) throw new Error('Asset request time must be before source end.');
    return referenceAssetCropPixels(request, { width: source.width, height: source.height });
  });
  const sourcePath = await resolveLocalReferenceVideo(source.path), service = new AgentEvidenceService(options.cacheDir);
  const session = await service.read(source.sessionId);
  if (await realpath(localPath(session.source.path)) !== sourcePath || session.source.sha256 !== source.sha256 ||
      session.source.width !== source.width || session.source.height !== source.height || session.source.duration !== source.duration) {
    throw new Error('Prepared asset source does not match its evidence session.');
  }
  await sourceUnchanged(source, session, sourcePath, signal);
  const parent = await realpath(dirname(target)), directory = join(parent, relative(dirname(target), target));
  if (dirname(directory) !== parent) throw new Error('Prepared assets require a fresh child output directory.');
  await mkdir(directory, { mode: 0o700 }); // EEXIST intentionally preserves an earlier attempt.
  const outputDirectory = await realpath(directory), evidenceDirectory = await realpath(join(service.directory, source.sessionId));
  const manifest: ReferencePreparedAsset[] = [];
  try {
    const times = [...new Set(options.requests.map(request => request.time))].sort((a, b) => a - b);
    const inspection = await service.inspect(source.sessionId, { times, native: true }, signal);
    const frames = inspection.artifacts.filter(artifact => artifact.kind === 'frame');
    if (frames.length !== times.length) throw new Error('Native evidence returned incomplete asset frames.');
    for (const [index, request] of options.requests.entries()) {
      signal?.throwIfAborted();
      const artifact = frames[times.indexOf(request.time)], crop = crops[index];
      const frame = await checkedFrame(artifact, request.time, source, evidenceDirectory, signal);
      const path = join(outputDirectory, `${request.id}.png`), cropPath = request.kind === 'texture-tile' ? join(outputDirectory, `${request.id}.crop.png`) : path;
      inside(outputDirectory, path); inside(outputDirectory, cropPath);
      await runMedia(['-v', 'error', '-nostdin', '-n', '-threads', '1', '-protocol_whitelist', 'file,pipe', '-i', frame.path,
        '-vf', `format=rgba,crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}:exact=1,setsar=1`, '-frames:v', '1', '-update', '1', cropPath], { signal });
      const cropped = await pngSize(cropPath);
      if (cropped.width !== crop.width || cropped.height !== crop.height) throw new Error('Prepared crop dimensions differ from the recorded pixel ROI.');
      if (request.kind === 'texture-tile') await repeatTexture(cropPath, path, join(outputDirectory, `${request.id}.rgba`), crop, source, signal);
      const dimensions = await pngSize(path);
      if (request.kind === 'texture-tile' && (dimensions.width !== source.width || dimensions.height !== source.height)) throw new Error('Repeated texture canvas dimensions changed.');
      if (frame.sha256 !== await fingerprint(frame.path, signal)) throw new Error('Native evidence frame changed while preparing an asset.');
      manifest.push({ id: request.id, kind: request.kind, path, sha256: await fingerprint(path, signal), ...dimensions,
        preparedMedia: true, reviewRequired: true, provenance: { sourceSha256: source.sha256, sessionId: source.sessionId,
          inspectionId: inspection.id, evidenceId: artifact.id, frameSha256: frame.sha256, time: request.time,
          requestedTime: request.time, decodedTime: artifact.start, absolutePts: session.source.startTime + artifact.start,
          normalizedRect: request.rect, cropPixels: crop, purpose: request.purpose,
          repeatPolicy: { mode: request.kind === 'texture-tile' ? 'repeat-pixels' : 'none', anchor: 'top-left',
            columns: request.kind === 'texture-tile' ? Math.ceil(source.width / crop.width) : 1,
            rows: request.kind === 'texture-tile' ? Math.ceil(source.height / crop.height) : 1 },
          limitation: request.kind === 'texture-tile' ? 'Prepared repeated raster from the observed crop, not a recovered background. Review the ROI for baked foreground and visible seams.' :
            'Prepared raster fragment; its pixels are not recovered editable source layers. Review that it is a photo/document detail rather than a baked graphic composition.' } });
    }
    await sourceUnchanged(source, session, sourcePath, signal);
    await writeFile(join(outputDirectory, 'manifest.json'), JSON.stringify({ schemaVersion: 1, kind: 'reference-prepared-assets',
      sourceSha256: source.sha256, assets: manifest, externalModelCalls: 0, preparedMedia: true, reviewRequired: true }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return manifest;
  } catch (error) {
    await writeFile(join(outputDirectory, 'failure.json'), JSON.stringify({ kind: 'failed-reference-assets', error: String(error),
      sourceSha256: source.sha256, nextStep: 'Inspect retained artifacts and explicitly retry into a fresh directory.' }, null, 2) + '\n', { flag: 'wx', mode: 0o600 }).catch(() => undefined);
    throw error;
  }
}
