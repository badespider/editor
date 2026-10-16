// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { AgentEvidenceService } from '@diffusionstudio/video-understanding/agent';
import type { AgentArtifact, AgentInspection, AgentSession } from '@diffusionstudio/video-understanding/agent';
import { constants } from 'node:fs';
import { copyFile, mkdir, open, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { runMedia } from './delivery.ts';
import { fingerprint } from './preview.ts';
import { createReferenceStudy } from './reference-study.ts';

const seconds = z.number().finite().nonnegative();
const timesSchema = z.array(seconds).min(1).max(24).superRefine((times, context) => {
  if (times.some((time, index) => index > 0 && time <= times[index - 1])) {
    context.addIssue({ code: 'custom', message: 'Times must be unique and strictly increasing.' });
  }
});
const comparisonSchema = z.object({
  reference: z.string().min(1).max(32768), render: z.string().min(1).max(32768), times: timesSchema,
  referenceStart: seconds.default(0), renderStart: seconds.default(0),
  cacheDir: z.string().min(1).optional(), outputDirectory: z.string().min(1), signal: z.instanceof(AbortSignal).optional(),
}).strict();

export type ReferenceComparisonOptions = z.input<typeof comparisonSchema>;
export type ReferenceStudyOptions = {
  cacheDir?: string; goal?: string; title?: string; format?: 'landscape' | 'portrait';
  times?: number[]; maxDuration?: number; signal?: AbortSignal;
};

/** Timeline requests are local comparison seconds; start offsets apply exactly once. */
export function mapReferenceTimes(times: number[], reference: { duration: number; start?: number }, render: { duration: number; start?: number }) {
  const parsed = timesSchema.parse(times);
  const media = z.object({ duration: z.number().finite().positive(), start: seconds.default(0) }).strict();
  const a = media.parse(reference), b = media.parse(render);
  return parsed.map(time => {
    const referenceTime = a.start + time, renderTime = b.start + time;
    if (!Number.isFinite(referenceTime) || referenceTime >= a.duration || !Number.isFinite(renderTime) || renderTime >= b.duration) {
      throw new Error(`Comparison time ${time}s exceeds a source duration after its start offset; no clamping is performed.`);
    }
    return { time, referenceTime, renderTime };
  });
}

/** Contain each source independently. Padding preserves context instead of cropping. */
export function referencePanelGeometry(width: number, height: number) {
  z.number().int().min(1).max(32768).parse(width); z.number().int().min(1).max(32768).parse(height);
  const factor = Math.min(640 / width, 360 / height);
  const fittedWidth = Math.max(1, Math.floor(width * factor)), fittedHeight = Math.max(1, Math.floor(height * factor));
  return { sourceWidth: width, sourceHeight: height, width: 640, height: 360,
    fittedWidth, fittedHeight, left: Math.floor((640 - fittedWidth) / 2), top: Math.floor((360 - fittedHeight) / 2),
    fit: 'contain' as const, dimensionRounding: 'floor to whole display pixels' as const };
}

export function escapeReferenceHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

async function localVideo(path: string) {
  if (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path) || /^[\\/]{2}/.test(path)) {
    throw new Error('A regular local video file is required; URLs and network shares are unsupported.');
  }
  const absolute = await realpath(resolve(path)), info = await stat(absolute);
  if (!info.isFile() || info.size > 16 * 1024 ** 3 || info.size < 12) throw new Error('Source must be a regular local video of at most 16 GiB.');
  // Exclude playlist text before the evidence pipeline probes a local file. In
  // particular, renaming a remote HLS playlist to .mp4 must not fetch its URLs.
  const handle = await open(absolute, 'r');
  const header = Buffer.alloc(512);
  try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
  const box = header.toString('ascii', 4, 8);
  const knownContainer = ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].includes(box) ||
    header.readUInt32BE(0) === 0x1a45dfa3 || // Matroska / WebM
    header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'AVI ' ||
    header.toString('ascii', 0, 4) === 'OggS' || header.toString('ascii', 0, 3) === 'FLV' ||
    header.readUInt32BE(0) === 0x000001ba || // MPEG program stream
    header[0] === 0x47 && header[188] === 0x47 || header[4] === 0x47 && header[196] === 0x47;
  if (!knownContainer) throw new Error('Unsupported local video container; playlists, images and arbitrary documents are not accepted.');
  return absolute;
}

/** Shared local-only container gate for source-bound reference pipeline tools. */
export { localVideo as resolveLocalReferenceVideo };

async function unchanged(session: AgentSession, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const before = await stat(session.source.path);
  if (!before.isFile() || before.size !== session.source.bytes || before.mtimeMs !== session.source.mtimeMs ||
      await fingerprint(session.source.path, signal) !== session.source.sha256) throw new Error('Source changed; prepare a new reference study/comparison.');
  const after = await stat(session.source.path);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Source changed while verifying its fingerprint.');
}

const summary = (session: AgentSession) => ({ path: session.source.path, name: basename(session.source.path),
  sha256: session.source.sha256, bytes: session.source.bytes, duration: session.source.duration,
  width: session.source.width, height: session.source.height, startTime: session.source.startTime,
  containerStartTime: session.source.containerStartTime, sessionId: session.id });

export async function prepareReferenceStudy(videoPath: string, options: ReferenceStudyOptions = {}) {
  const settings = z.object({ cacheDir: z.string().min(1).optional(), goal: z.string().trim().min(1).max(1200).optional(),
    title: z.string().trim().min(1).max(160).optional(), format: z.enum(['landscape', 'portrait']).optional(),
    times: timesSchema.optional(), maxDuration: z.number().positive().max(7200).default(1200), signal: z.instanceof(AbortSignal).optional() }).strict().parse(options);
  settings.signal?.throwIfAborted();
  const path = await localVideo(videoPath), service = new AgentEvidenceService(settings.cacheDir);
  const session = await service.open({ path, goal: settings.goal ?? 'Inspect this reference to author original native motion.',
    maxDuration: settings.maxDuration, overviewCount: 12 }, settings.signal);
  const overview = session.inspections[0];
  let inspection: AgentInspection | undefined;
  if (settings.times) {
    mapReferenceTimes(settings.times, { duration: session.source.duration }, { duration: session.source.duration });
    inspection = await service.inspect(session.id, { times: settings.times, native: true }, settings.signal);
  }
  await unchanged(session, settings.signal);
  const source = summary(session);
  const study = createReferenceStudy({ name: source.name, sha256: source.sha256, bytes: source.bytes, duration: source.duration, width: source.width, height: source.height },
    { title: settings.title ?? `Study ${source.name}`.slice(0, 160), goal: settings.goal ?? 'Author original native motion inspired by this reference.', format: settings.format });
  return { study, evidence: { sessionId: session.id, sourceSha256: source.sha256, source, overview, inspection: inspection ?? null,
    timeBasis: session.timeBasis, externalModelCalls: 0 as const, safeToAutoEdit: false as const,
    limitations: [...session.limitations, 'No reference beats or visual conclusions are invented; inspect the evidence and author the draft.'] } };
}

type ComparisonSide = { requestedTime: number; decodedTime: number; absolutePts: number; delta: number;
  evidenceId: string; frame: string; sha256: string };
export type ReferenceComparison = {
  kind: 'native-reference-comparison'; schemaVersion: 1; createdAt: string;
  reference: ReturnType<typeof summary>; render: ReturnType<typeof summary>;
  referenceStart: number; renderStart: number; timeBasis: 'seconds from each first video presentation timestamp';
  sampling: 'first decoded frame at or after the requested source time';
  geometry: { policy: 'contain'; dimensionBasis: 'pipeline native PNG display pixels'; labelHeight: 64; pairWidth: 1280; pairHeight: 424;
    reference: ReturnType<typeof referencePanelGeometry>; render: ReturnType<typeof referencePanelGeometry> };
  pairs: { time: number; image: string; sha256: string; reference: ComparisonSide; render: ComparisonSide }[];
  contactSheet: { image: string; sha256: string; order: string[] };
  viewer: string; manifest: string; externalModelCalls: 0; visualReviewRecorded: false; safeToAutoEdit: false; limitations: string[];
};

export function referenceComparisonHtml(comparison: ReferenceComparison) {
  const escape = escapeReferenceHtml;
  const rows = comparison.pairs.map((pair, index) => `<section><h2>Sample ${index + 1}: comparison ${pair.time.toFixed(6)} s</h2>
<p>Reference request ${pair.reference.requestedTime.toFixed(6)} s → decoded ${pair.reference.decodedTime.toFixed(6)} s.
Render request ${pair.render.requestedTime.toFixed(6)} s → decoded ${pair.render.decodedTime.toFixed(6)} s.</p>
<p>Full-resolution frames: <a href="${escape(pair.reference.frame)}">Reference</a> · <a href="${escape(pair.render.frame)}">Render</a>.</p>
<img src="${escape(pair.image)}" alt="Reference left and render right at comparison ${pair.time.toFixed(6)} seconds" loading="lazy"></section>`).join('\n');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'">
<title>Local reference comparison</title><style>body{background:#10141c;color:#eef2f6;font:16px/1.5 system-ui,sans-serif;margin:0 auto;padding:24px;max-width:1280px}h1,h2{line-height:1.2}p,li{max-width:90ch}img{display:block;width:100%;height:auto}section{margin:32px 0}code{overflow-wrap:anywhere}a{color:#8ed4ff}</style>
<h1>Reference and native render</h1><p>Left: ${escape(comparison.reference.name)}. Right: ${escape(comparison.render.name)}.</p>
<p>Both panels contain the complete sampled image with letterboxing. Different aspect ratios are preserved; no automatic crop, synchronization, similarity score or visual judgment is supplied.</p>
<p>Each request selects the first decoded frame at or after its source time. Different frame rates may yield different decoded instants. Sparse frames do not establish continuous viewing, speech accuracy or a 1:1 recreation.</p>
<p>Reference SHA-256: <code>${escape(comparison.reference.sha256)}</code><br>Render SHA-256: <code>${escape(comparison.render.sha256)}</code></p>
<p><a href="${escape(comparison.manifest)}">Comparison manifest</a> · <a href="${escape(comparison.contactSheet.image)}">Contact sheet</a></p>${rows}</html>\n`;
}

async function fontOption() {
  const choices = [process.env.WINDIR ? join(process.env.WINDIR, 'Fonts', 'arial.ttf') : '',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf'].filter(Boolean);
  for (const path of choices) {
    try { await stat(path); return `fontfile='${path.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "'\\''")}'`; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return 'font=sans-serif';
}

async function pngDimensions(path: string) {
  const handle = await open(path, 'r'), header = Buffer.alloc(24);
  try { const { bytesRead } = await handle.read(header, 0, 24, 0); if (bytesRead !== 24) throw new Error('Incomplete pipeline PNG.'); }
  finally { await handle.close(); }
  if (!header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || header.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Expected a pipeline PNG frame.');
  }
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

async function copyFrame(artifact: AgentArtifact, target: string, session: AgentSession, requested: number,
  expected: ReturnType<typeof referencePanelGeometry>): Promise<ComparisonSide> {
  if (artifact.kind !== 'frame' || !artifact.native || artifact.requestedTime !== requested || !Number.isFinite(artifact.start) ||
      artifact.start + 1e-5 < requested || artifact.start >= session.source.duration + .05) throw new Error('Pipeline returned an invalid source frame mapping.');
  const info = await stat(artifact.path);
  if (!info.isFile() || info.size > 64 * 1024 ** 2) throw new Error('Pipeline frame exceeds the comparison budget.');
  const dimensions = await pngDimensions(artifact.path);
  if (dimensions.width !== expected.sourceWidth || dimensions.height !== expected.sourceHeight) throw new Error('Source frame dimensions changed within this comparison; inspect separate fixed-format sections.');
  const before = await fingerprint(artifact.path);
  await copyFile(artifact.path, target, constants.COPYFILE_EXCL);
  const hash = await fingerprint(target);
  if (hash !== before || hash !== await fingerprint(artifact.path)) throw new Error('Pipeline frame changed while copying.');
  return { requestedTime: requested, decodedTime: artifact.start, absolutePts: session.source.startTime + artifact.start,
    delta: artifact.start - requested, evidenceId: artifact.id, frame: '', sha256: hash };
}

/** Local inspection and a portable evidence folder. Does not call a model or mutate the editor. */
export async function compareReferenceVideos(input: ReferenceComparisonOptions): Promise<{ directory: string; comparison: ReferenceComparison }> {
  const options = comparisonSchema.parse(input), output = resolve(options.outputDirectory);
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30 * 60_000)]) : AbortSignal.timeout(30 * 60_000);
  signal.throwIfAborted();
  try { await stat(output); throw new Error('Comparison output already exists; choose a new directory.'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const referencePath = await localVideo(options.reference), renderPath = await localVideo(options.render);
  const service = new AgentEvidenceService(options.cacheDir);
  const a = await service.open({ path: referencePath, goal: 'Local reference/render frame comparison.', overviewCount: 1 }, signal);
  const b = await service.open({ path: renderPath, goal: 'Local reference/render frame comparison.', overviewCount: 1 }, signal);
  const mapping = mapReferenceTimes(options.times, { duration: a.source.duration, start: options.referenceStart },
    { duration: b.source.duration, start: options.renderStart });
  const aInspection = await service.inspect(a.id, { times: mapping.map(item => item.referenceTime), native: true }, signal);
  const bInspection = await service.inspect(b.id, { times: mapping.map(item => item.renderTime), native: true }, signal);
  const aFrames = aInspection.artifacts.filter(frame => frame.kind === 'frame'), bFrames = bInspection.artifacts.filter(frame => frame.kind === 'frame');
  if (aFrames.length !== mapping.length || bFrames.length !== mapping.length) throw new Error('Pipeline returned incomplete comparison evidence.');
  // FFmpeg applies display rotation when it extracts a frame. Container/probe
  // dimensions can describe the encoded orientation, so use the actual native
  // PNG dimensions for display geometry, rather than stretching rotated phones.
  const aDimensions = await pngDimensions(aFrames[0].path), bDimensions = await pngDimensions(bFrames[0].path);
  await unchanged(a, signal); await unchanged(b, signal);
  await mkdir(dirname(output), { recursive: true }); await mkdir(output);
  try {
    await mkdir(join(output, 'frames')); await mkdir(join(output, 'pairs'));
    const comparison: ReferenceComparison = { kind: 'native-reference-comparison', schemaVersion: 1, createdAt: new Date().toISOString(),
      reference: summary(a), render: summary(b), referenceStart: options.referenceStart, renderStart: options.renderStart,
      timeBasis: 'seconds from each first video presentation timestamp', sampling: 'first decoded frame at or after the requested source time',
      geometry: { policy: 'contain', dimensionBasis: 'pipeline native PNG display pixels', labelHeight: 64, pairWidth: 1280, pairHeight: 424,
        reference: referencePanelGeometry(aDimensions.width, aDimensions.height), render: referencePanelGeometry(bDimensions.width, bDimensions.height) },
      pairs: [], contactSheet: { image: 'contact-sheet.png', sha256: '', order: [] }, viewer: 'index.html', manifest: 'comparison.json',
      externalModelCalls: 0, visualReviewRecorded: false, safeToAutoEdit: false,
      limitations: ['This packet is visual evidence, not an automatic reconstruction, similarity grade or approved edit.',
        'Sparse first-at-or-after frames are not continuous viewing; differences can reflect distinct frame rates or authored start offsets.',
        'No audio review, speech verification, automatic alignment, subject detection or style inference is performed.',
        'Labels and panels are composited from pipeline-extracted PNGs; original source images are also retained.',
        'Complete frames are contained independently; whole-pixel size rounding can differ by less than one display pixel.',
        'Source paths and extracted private media are recorded locally. Nothing is uploaded.'] };
    const font = await fontOption();
    for (const [index, request] of mapping.entries()) {
      const suffix = String(index).padStart(3, '0'), referenceFrame = `frames/reference-${suffix}.png`, renderFrame = `frames/render-${suffix}.png`;
      const reference = await copyFrame(aFrames[index], join(output, referenceFrame), a, request.referenceTime, comparison.geometry.reference);
      const render = await copyFrame(bFrames[index], join(output, renderFrame), b, request.renderTime, comparison.geometry.render);
      reference.frame = referenceFrame; render.frame = renderFrame;
      const image = `pairs/pair-${suffix}.png`;
      const panel = (index: number, geometry: ReturnType<typeof referencePanelGeometry>, side: ComparisonSide, title: string) =>
        `[${index}:v]scale=${geometry.fittedWidth}:${geometry.fittedHeight},setsar=1,pad=640:424:${geometry.left}:${geometry.top + 64}:color=0x10141c,` +
        `drawtext=${font}:text='${title}':x=12:y=6:fontsize=18:fontcolor=white,` +
        `drawtext=${font}:text='request ${side.requestedTime.toFixed(6)} s  decoded ${side.decodedTime.toFixed(6)} s':x=12:y=33:fontsize=14:fontcolor=white[p${index}]`;
      await runMedia(['-v', 'error', '-nostdin', '-n', '-threads', '1', '-protocol_whitelist', 'file,pipe', '-i', join(output, referenceFrame),
        '-protocol_whitelist', 'file,pipe', '-i', join(output, renderFrame), '-filter_complex_threads', '1', '-filter_complex',
        `${panel(0, comparison.geometry.reference, reference, 'REFERENCE')} ;${panel(1, comparison.geometry.render, render, 'RENDER')};[p0][p1]hstack=inputs=2[out]`,
        '-map', '[out]', '-frames:v', '1', '-update', '1', join(output, image)], { signal });
      comparison.pairs.push({ time: request.time, image, sha256: await fingerprint(join(output, image)), reference, render });
    }
    await runMedia(['-v', 'error', '-nostdin', '-n', '-threads', '1', '-protocol_whitelist', 'file,pipe', '-framerate', '1', '-i', join(output, 'pairs', 'pair-%03d.png'),
      '-vf', `scale=640:212,tile=${Math.min(2, mapping.length)}x${Math.ceil(mapping.length / 2)}:padding=4:margin=4`,
      '-frames:v', '1', '-update', '1', join(output, comparison.contactSheet.image)], { signal });
    comparison.contactSheet.sha256 = await fingerprint(join(output, comparison.contactSheet.image));
    comparison.contactSheet.order = comparison.pairs.map(pair => pair.image);
    await unchanged(a, signal); await unchanged(b, signal);
    await writeFile(join(output, comparison.viewer), referenceComparisonHtml(comparison), { flag: 'wx', mode: 0o600 });
    await writeFile(join(output, comparison.manifest), JSON.stringify(comparison, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { directory: output, comparison };
  } catch (error) {
    // Keep failed/baseline artifacts. Do not recursively delete a computed path.
    await writeFile(join(output, 'failure.json'), JSON.stringify({ kind: 'failed-reference-comparison', error: String(error),
      externalModelCalls: 0, safeToAutoEdit: false, nextStep: 'Keep these artifacts and retry with a new output directory.' }, null, 2), { flag: 'wx', mode: 0o600 }).catch(() => undefined);
    throw error;
  }
}
