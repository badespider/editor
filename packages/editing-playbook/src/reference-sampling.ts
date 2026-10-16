/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AgentEvidenceService, inspectSchema } from '@diffusionstudio/video-understanding/agent';
import type { AgentInspection, AgentSession } from '@diffusionstudio/video-understanding/agent';
import { randomUUID } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { runMedia } from './delivery.ts';
import { fingerprint } from './preview.ts';
import { resolveLocalReferenceVideo } from './reference-evidence.ts';

const seconds = z.number().finite().nonnegative();
const optionsSchema = z.object({ cacheDir: z.string().min(1).optional(), sessionId: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  start: seconds.default(0), end: z.number().finite().positive(), maxFrames: z.number().int().min(1).max(384).default(320),
  maxDuration: z.number().finite().positive().max(7200).default(1200), signal: z.instanceof(AbortSignal).optional(),
  endPolicy: z.enum(['strict', 'source-end']).default('strict'),
  outputDirectory: z.string().min(1).optional() }).strict();
export type RecreationSourceOptions = z.input<typeof optionsSchema>;
export type RecreationPacket = { pts: number; absoluteTime: number; time: number };
export type RecreationCandidate = { pts: number; time: number; score: number; verification: 'unreviewed-change-hint';
  sampled: boolean; evidenceIds: string[] };
export type RecreationFrame = { id: string; path: string; requestedTime: number; decodedTime: number; packetTime: number;
  native: boolean; reasons: ('baseline' | 'change-neighbor' | 'selected-scene')[] };
export type RecreationSamplingResult = { kind: 'reference-recreation-evidence'; schemaVersion: 1; outputDirectory: string;
  sessionId: string; source: AgentSession['source']; requestedRange: { start: number; end: number }; range: { start: number; end: number };
  timeBasis: AgentSession['timeBasis']; mode: 'dense-window' | 'selected-scene';
  inventory: { timeBase: string; availablePacketTimes: number; omittedMissingPts: number; firstTime: number; lastTime: number; path: string };
  candidates: RecreationCandidate[]; candidatePass: { threshold: number; scaleWidth: 320; rawCount: number; truncated: boolean; path: string } | null;
  scenes: { id: string; start: number; end: number; kind: 'visual-change-interval'; semanticType: 'unknown'; evidenceIds: string[] }[];
  frames: RecreationFrame[]; inspections: AgentInspection[];
  contactSheets: { path: string; orderedFrameIds: string[]; count: number; earliestDecodedTime: number; latestDecodedTime: number }[];
  coverage: { requestedFrames: number; uniqueDecodedTimes: number; largestDecodedGap: number; baselineTargetSpacing: number;
    allInventoriedPresentationTimestampsRequested: boolean; visionAttachmentLimit: 12; exceedsVisionAttachmentLimit: boolean };
  externalModelCalls: 0; continuousViewing: false; audioReviewed: false; semanticCutsVerified: false; limitations: string[] };

/** Demux metadata only; all image decoding remains in AgentEvidenceService. */
export function parseRecreationPacketInventory(input: unknown, sourceOrigin: number, range: { start: number; end: number }) {
  const data = z.object({ streams: z.array(z.object({ time_base: z.string().regex(/^\d+\/\d+$/) }).passthrough()).min(1),
    packets: z.array(z.object({ pts: z.union([z.number(), z.string()]).optional() }).passthrough()).max(300000) }).passthrough().parse(input);
  const timeBase = data.streams[0].time_base, [numerator, denominator] = timeBase.split('/').map(Number);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || numerator <= 0 || denominator <= 0 || !Number.isFinite(sourceOrigin)) throw new Error('Invalid source packet time base.');
  const seen = new Set<number>(), packets: RecreationPacket[] = [];
  let omittedMissingPts = 0;
  for (const packet of data.packets) {
    if (packet.pts === undefined) { omittedMissingPts++; continue; }
    const pts = Number(packet.pts);
    if (!Number.isSafeInteger(pts)) throw new Error('Source packet PTS exceeds the exact integer budget.');
    const absoluteTime = pts * numerator / denominator, time = absoluteTime - sourceOrigin;
    if (time < range.start - .00001 || time >= range.end || seen.has(pts)) continue;
    seen.add(pts); packets.push({ pts, absoluteTime, time });
  }
  packets.sort((a, b) => a.time - b.time);
  if (!packets.length) throw new Error('No presentation timestamps exist inside the requested source interval.');
  return { timeBase, numerator, denominator, omittedMissingPts, packets };
}

export function parseRecreationChangeHints(text: string, inventory: ReturnType<typeof parseRecreationPacketInventory>, sourceOrigin: number,
  range: { start: number; end: number }, limit = 64) {
  z.number().int().min(1).max(64).parse(limit);
  const rows = text.split(/(?=frame:\s*\d+\s+pts:)/), byPts = new Map(inventory.packets.map(packet => [packet.pts, packet]));
  const candidates: RecreationCandidate[] = [];
  for (const row of rows) {
    const ptsMatch = /\bpts:\s*(-?\d+)/.exec(row), scoreMatch = /lavfi\.scd\.score=([\d.e+-]+)/.exec(row);
    if (!ptsMatch || !scoreMatch) continue;
    const pts = Number(ptsMatch[1]), score = Number(scoreMatch[1]);
    const time = pts * inventory.numerator / inventory.denominator - sourceOrigin;
    if (!Number.isSafeInteger(pts) || !Number.isFinite(score) || score < 0 || time < range.start || time >= range.end || !byPts.has(pts)) continue;
    candidates.push({ pts, time: byPts.get(pts)!.time, score, verification: 'unreviewed-change-hint', sampled: false, evidenceIds: [] });
  }
  const unique = [...new Map(candidates.map(candidate => [candidate.pts, candidate])).values()];
  return { rawCount: unique.length, truncated: unique.length > limit,
    candidates: unique.sort((a, b) => b.score - a.score || a.time - b.time).slice(0, limit).sort((a, b) => a.time - b.time) };
}

/** Pick actual available PTS first, then request just before them to avoid rounding forward. */
export function planRecreationSamples(packets: RecreationPacket[], range: { start: number; end: number }, maxFrames: number,
  candidates: RecreationCandidate[] = [], mode: 'dense-window' | 'selected-scene' = 'dense-window') {
  z.number().int().min(1).max(384).parse(maxFrames);
  if (!packets.length || packets.length > 300000 || !Number.isFinite(range.start) || range.start < 0 || !Number.isFinite(range.end) || range.end <= range.start ||
      packets.some((packet, index) => !Number.isSafeInteger(packet.pts) || !Number.isFinite(packet.time) || packet.time < range.start - .00001 || packet.time >= range.end ||
        index > 0 && packet.time <= packets[index - 1].time)) throw new Error('A nonempty, ordered packet interval is required.');
  const selected = new Map<number, { packet: RecreationPacket; reasons: RecreationFrame['reasons'] }>();
  const add = (packet: RecreationPacket, reason: RecreationFrame['reasons'][number]) => {
    const existing = selected.get(packet.pts);
    if (existing) { if (!existing.reasons.includes(reason)) existing.reasons.push(reason); }
    else if (selected.size < maxFrames) selected.set(packet.pts, { packet, reasons: [reason] });
  };
  const baselineBudget = mode === 'selected-scene' ? maxFrames : Math.max(1, Math.floor(maxFrames * .75));
  const count = Math.min(packets.length, baselineBudget, Math.ceil((range.end - range.start) / .5) + 1);
  const desiredCount = mode === 'selected-scene' ? Math.min(packets.length, maxFrames) : count;
  for (let index = 0; index < desiredCount; index++) {
    const target = desiredCount === 1 ? packets[0].time : packets[0].time + index * (packets.at(-1)!.time - packets[0].time) / (desiredCount - 1);
    const packet = desiredCount === packets.length ? packets[index] : packets.find(packet => packet.time >= target) ?? packets.at(-1)!;
    add(packet, mode === 'selected-scene' ? 'selected-scene' : 'baseline');
  }
  if (mode === 'dense-window') for (const candidate of [...candidates].sort((a, b) => b.score - a.score || a.time - b.time)) {
    const index = packets.findIndex(packet => packet.pts === candidate.pts);
    if (index < 0) continue;
    const neighbors = packets.slice(Math.max(0, index - 1), Math.min(packets.length, index + 2));
    const needed = neighbors.filter(packet => !selected.has(packet.pts)).length;
    if (selected.size + needed <= maxFrames) for (const packet of neighbors) add(packet, 'change-neighbor');
  }
  const values = [...selected.values()].sort((a, b) => a.packet.time - b.packet.time);
  return { samples: values.map(({ packet, reasons }) => ({ packet, reasons,
    requestedTime: Math.max(range.start, packet.time - .000001) })),
    baselineTargetSpacing: desiredCount > 1 ? (packets.at(-1)!.time - packets[0].time) / (desiredCount - 1) : 0 };
}

async function stable(session: AgentSession, signal: AbortSignal) {
  const info = await stat(session.source.path);
  if (!info.isFile() || info.size !== session.source.bytes || info.mtimeMs !== session.source.mtimeMs || await fingerprint(session.source.path, signal) !== session.source.sha256) throw new Error('Reference source changed; prepare a new evidence session.');
}

async function inspect(sourcePath: string, input: RecreationSourceOptions, mode: 'dense-window' | 'selected-scene', native: boolean) {
  const options = optionsSchema.parse(input);
  if (options.end <= options.start || options.end - options.start > 120) throw new Error('Choose one positive source window no longer than 120 seconds.');
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(600000)]) : AbortSignal.timeout(600000);
  signal.throwIfAborted();
  const path = await resolveLocalReferenceVideo(sourcePath), service = new AgentEvidenceService(options.cacheDir);
  const session = options.sessionId ? await service.read(options.sessionId) : await service.open({ path,
    goal: 'Inspect this reference with source-bound dense visual evidence.', maxDuration: options.maxDuration, overviewCount: 1 }, signal);
  if (session.source.path !== path || session.source.duration > options.maxDuration || options.start >= session.source.duration ||
      options.endPolicy === 'strict' && options.end > session.source.duration) throw new Error('Reference session identity, source duration or requested window does not match.');
  await stable(session, signal);
  const requestedRange = { start: options.start, end: options.end };
  const range = { start: options.start, end: options.endPolicy === 'source-end' ? Math.min(options.end, session.source.duration) : options.end }, origin = session.source.startTime;
  const absoluteStart = origin + range.start, absoluteEnd = origin + range.end;
  const inventoryBytes = await runMedia(['-v', 'error', '-select_streams', 'v:0', '-read_intervals', `${Math.max(session.source.containerStartTime, absoluteStart - 1)}%${absoluteEnd}`,
    '-show_packets', '-show_streams', '-show_entries', 'stream=time_base,start_pts:packet=pts', '-of', 'json', '-protocol_whitelist', 'file,pipe', path],
    { binary: process.env.FFPROBE_PATH || 'ffprobe', signal, limit: 32 * 1024 ** 2 });
  const inventory = parseRecreationPacketInventory(JSON.parse(inventoryBytes.toString()), origin, range);
  if (native && session.source.width * session.source.height * Math.min(options.maxFrames, inventory.packets.length) > 500_000_000) throw new Error('Native frame pixel budget exceeded; request fewer frames or use overview resolution.');
  const outputDirectory = resolve(options.outputDirectory ?? join(service.directory, session.id, 'recreation', randomUUID()));
  await mkdir(join(outputDirectory, '..'), { recursive: true, mode: 0o700 }); await mkdir(outputDirectory, { mode: 0o700 });
  await writeFile(join(outputDirectory, 'packets.json'), inventoryBytes, { flag: 'wx', mode: 0o600 });
  let hints = { rawCount: 0, truncated: false, candidates: [] as RecreationCandidate[] };
  const threshold = 8;
  if (mode === 'dense-window') {
    // This pass emits only bounded metadata hints. It never extracts image
    // files or replaces the editor's evidence/decoded-frame pipeline.
    const seek = Math.max(0, absoluteStart - session.source.containerStartTime - 1);
    const metadata = await runMedia(['-v', 'error', '-nostdin', '-copyts', '-threads', '2', '-ss', String(seek), '-t', String(range.end - range.start + 2),
      '-protocol_whitelist', 'file,pipe', '-i', path, '-map', '0:v:0', '-an', '-vf',
      `trim=start=${absoluteStart}:end=${absoluteEnd},scale=320:-2,settb=expr=${inventory.timeBase},scdet=threshold=${threshold}:sc_pass=1,metadata=mode=print:file=-`,
      '-f', 'null', '-'], { signal, limit: 32 * 1024 ** 2 });
    await writeFile(join(outputDirectory, 'change-hints.txt'), metadata, { flag: 'wx', mode: 0o600 });
    hints = parseRecreationChangeHints(metadata.toString(), inventory, origin, range);
  }
  await stable(session, signal);
  const planned = planRecreationSamples(inventory.packets, range, options.maxFrames, hints.candidates, mode);
  const chunkSize = Math.min(32, Math.max(24, Math.ceil(planned.samples.length / 12 / 4) * 4));
  const requests = Array.from({ length: Math.ceil(planned.samples.length / chunkSize) }, (_, index) =>
    inspectSchema.parse({ times: planned.samples.slice(index * chunkSize, (index + 1) * chunkSize).map(sample => sample.requestedTime), native }));
  const addedBudget = requests.reduce((total, request) => session.inspections.some(item => JSON.stringify(item.request) === JSON.stringify(request)) ? total : total + request.times!.length + 2, 0);
  if (session.inspections.reduce((total, inspection) => total + inspection.artifacts.length, 0) + addedBudget > 1024) throw new Error('This reference session would exceed its 1024-artifact evidence budget; retain existing evidence and choose a smaller refinement window.');
  const inspections: AgentInspection[] = [], frames: RecreationFrame[] = [];
  for (const request of requests) {
    signal.throwIfAborted();
    const inspection = await service.inspect(session.id, request, signal); inspections.push(inspection);
    const artifacts = inspection.artifacts.filter(artifact => artifact.kind === 'frame');
    if (artifacts.length !== request.times!.length) throw new Error('Incomplete dense reference evidence.');
    for (const artifact of artifacts) {
      const sample = planned.samples.find(sample => sample.requestedTime === artifact.requestedTime);
      if (!sample || artifact.start < range.start - .00001 || artifact.start >= range.end || Math.abs(artifact.start - sample.packet.time) > .00002) throw new Error('Decoded reference frame does not match its inventoried presentation timestamp.');
      frames.push({ id: artifact.id, path: artifact.path, requestedTime: artifact.requestedTime!, decodedTime: artifact.start,
        packetTime: sample.packet.time, native, reasons: sample.reasons });
    }
  }
  frames.sort((a, b) => a.decodedTime - b.decodedTime);
  for (const candidate of hints.candidates) {
    candidate.evidenceIds = frames.filter(frame => Math.abs(frame.decodedTime - candidate.time) < .00002 || frame.reasons.includes('change-neighbor') && Math.abs(frame.decodedTime - candidate.time) < .15).map(frame => frame.id);
    candidate.sampled = frames.some(frame => Math.abs(frame.decodedTime - candidate.time) < .00002);
  }
  const boundaries = [range.start, ...hints.candidates.map(candidate => candidate.time).filter(time => time > range.start && time < range.end), range.end];
  const scenes = boundaries.slice(0, -1).map((start, index) => ({ id: `change-interval-${String(index).padStart(3, '0')}`, start, end: boundaries[index + 1],
    kind: 'visual-change-interval' as const, semanticType: 'unknown' as const,
    evidenceIds: frames.filter(frame => frame.decodedTime >= start && frame.decodedTime < boundaries[index + 1]).map(frame => frame.id) }));
  const contactSheets = inspections.filter(inspection => inspection.contactSheet).map(inspection => {
    const ordered = inspection.contactSheetOrder ?? inspection.artifacts.filter(artifact => artifact.kind === 'frame').map(artifact => artifact.id);
    const included = ordered.map(id => frames.find(frame => frame.id === id)!);
    return { path: inspection.contactSheet!, orderedFrameIds: ordered, count: included.length,
      earliestDecodedTime: included[0].decodedTime, latestDecodedTime: included.at(-1)!.decodedTime };
  });
  await stable(session, signal);
  const result: RecreationSamplingResult = { kind: 'reference-recreation-evidence', schemaVersion: 1, outputDirectory,
    sessionId: session.id, source: session.source, requestedRange, range, timeBasis: session.timeBasis, mode,
    inventory: { timeBase: inventory.timeBase, availablePacketTimes: inventory.packets.length, omittedMissingPts: inventory.omittedMissingPts,
      firstTime: inventory.packets[0].time, lastTime: inventory.packets.at(-1)!.time, path: join(outputDirectory, 'packets.json') },
    candidates: hints.candidates, candidatePass: mode === 'dense-window' ? { threshold, scaleWidth: 320, rawCount: hints.rawCount, truncated: hints.truncated, path: join(outputDirectory, 'change-hints.txt') } : null,
    scenes, frames, inspections, contactSheets, coverage: { requestedFrames: frames.length, uniqueDecodedTimes: new Set(frames.map(frame => frame.decodedTime)).size,
      largestDecodedGap: frames.reduce((largest, frame, index) => index ? Math.max(largest, frame.decodedTime - frames[index - 1].decodedTime) : largest, 0),
      baselineTargetSpacing: planned.baselineTargetSpacing, allInventoriedPresentationTimestampsRequested: frames.length === inventory.packets.length,
      visionAttachmentLimit: 12, exceedsVisionAttachmentLimit: contactSheets.length > 12 },
    externalModelCalls: 0, continuousViewing: false, audioReviewed: false, semanticCutsVerified: false,
    limitations: ['Change scores are local low-resolution hints, not verified cuts, graphic classifications or semantic scenes. Flashes, motion, camera changes and fades can trigger them; subtle changes may not.',
      'Dense sheets give temporal coverage at small cell sizes. Inspect native/full frames within a selected scene before judging typography, precise geometry or motion.',
      'Packet PTS inventory is not proof that every coded packet is an independently displayed frame; missing packet PTS are counted and omitted. Requested/decoded times remain explicit.',
      'The pipeline selects the first decoded frame at or after each request. Requests sit just before inventoried PTS; no average-FPS timestamp invention or source-end clamping is used.',
      'This tool calls no model and supplies no audio understanding or continuous-playback judgment. Original media, texture and font availability remain separate asset requirements.',
      ...(range.end !== requestedRange.end ? [`The requested interval ended at ${requestedRange.end}s; explicit source-end policy shortened the analyzed range to the source duration ${range.end}s. Individual frame requests were not clamped.`] : []),
      ...(hints.truncated ? ['More than 64 change hints were found; only the strongest 64 are retained and sorted in source order.'] : [])] };
  await writeFile(join(outputDirectory, 'manifest.json'), JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
  return result;
}

export function inspectRecreationSource(sourcePath: string, options: RecreationSourceOptions) {
  return inspect(sourcePath, options, 'dense-window', false);
}

/** Refine one measured graphic/shot interval; optional native pixels are bounded. */
export function inspectRecreationScene(sourcePath: string, input: RecreationSourceOptions & { native?: boolean }) {
  const { native = false, ...options } = input;
  z.boolean().parse(native);
  return inspect(sourcePath, { ...options, maxFrames: options.maxFrames ?? 48 }, 'selected-scene', native);
}
