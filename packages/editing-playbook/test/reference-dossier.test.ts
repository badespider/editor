import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentArtifact, AgentInspection, AgentSession } from '@diffusionstudio/video-understanding/agent';
import { fingerprint } from '../src/preview.ts';
import { RecreationDossierBuilder, recreationScoutJsonSchema, selectDossierOverviewFrames, validateRecreationScout } from '../src/reference-dossier.ts';
import type { RecreationScout } from '../src/reference-dossier.ts';
import type { RecreationFrame, RecreationSamplingResult } from '../src/reference-sampling.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
async function fixture({ duration = 20, step = 15, width = 320, height = 180 } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'reference-dossier-')), path = join(directory, 'reference with spaces.mp4');
  const header = Buffer.alloc(24); header.writeUInt32BE(24, 0); header.write('ftypisom', 4); await writeFile(path, header);
  const info = await stat(path), source = { path, sha256: await fingerprint(path), bytes: info.size, mtimeMs: info.mtimeMs,
    duration, width, height, hasAudio: false, startTime: 5, containerStartTime: 5 };
  const packets = Array.from({ length: Math.round(duration * 30) }, (_, index) => ({ pts: index + 150, absoluteTime: (index + 150) / 30, time: (index + 150) / 30 - 5 }));
  const session: AgentSession = { kind: 'agent-video-evidence', schemaVersion: 1, id: 'a'.repeat(64), revision: 1, createdAt: new Date().toISOString(),
    goal: 'Trusted synthetic pipeline seam', source, timeBasis: 'seconds from first video presentation timestamp',
    audio: { hasTrack: false, digitalSilence: true, peakDb: null, samples: 0 }, inspections: [], transcripts: [], observations: [], externalModelCalls: 0, safeToAutoEdit: false, limitations: [] };
  let counter = 0, inspectCalls = 0, focusCalls = 0;
  async function inspection(times: number[], native = false): Promise<AgentInspection> {
    inspectCalls++; const id = `inspection-${counter++}`, folder = join(directory, id); await mkdir(folder);
    const artifacts: AgentArtifact[] = [];
    for (const [index, requestedTime] of times.entries()) {
      const packet = packets.find(packet => packet.time + 1e-9 >= requestedTime); if (!packet) throw new Error('Fixture request exceeds source PTS');
      const framePath = join(folder, `frame-${index}.png`); await writeFile(framePath, png);
      artifacts.push({ id: `${id}-f${index}`, kind: 'frame', path: framePath, requestedTime, start: packet.time, end: packet.time, native });
    }
    const contactSheet = join(folder, 'contact-sheet.png'); await writeFile(contactSheet, png);
    const result: AgentInspection = { id, request: { times, count: 8, native, clip: false, audio: false }, artifacts, contactSheet, contactSheetOrder: artifacts.map(frame => frame.id) };
    session.inspections.push(result); return result;
  }
  const seed = packets.filter((_, index) => index % step === 0 || index === packets.length - 1);
  for (let offset = 0; offset < seed.length; offset += 24) await inspection(seed.slice(offset, offset + 24).map(packet => Math.max(0, packet.time - .000001)));
  const frame = (artifact: AgentArtifact): RecreationFrame => ({ id: artifact.id, path: artifact.path, requestedTime: artifact.requestedTime!, decodedTime: artifact.start, packetTime: artifact.start, native: artifact.native === true, reasons: ['baseline'] });
  const sheets = (inspections: AgentInspection[]): RecreationSamplingResult['contactSheets'] => inspections.map(item => ({ path: item.contactSheet!, orderedFrameIds: item.contactSheetOrder!, count: item.artifacts.length, earliestDecodedTime: item.artifacts[0].start, latestDecodedTime: item.artifacts.at(-1)!.start }));
  const outputDirectory = join(directory, 'evidence'); await mkdir(outputDirectory);
  await writeFile(join(outputDirectory, 'packets.json'), JSON.stringify({ streams: [{ time_base: '1/30' }], packets: packets.map(packet => ({ pts: packet.pts })) }));
  const evidence: RecreationSamplingResult = { kind: 'reference-recreation-evidence', schemaVersion: 1, outputDirectory, sessionId: session.id, source, requestedRange: { start: 0, end: duration }, range: { start: 0, end: duration },
    timeBasis: session.timeBasis, mode: 'dense-window', inventory: { timeBase: '1/30', availablePacketTimes: packets.length, omittedMissingPts: 0, firstTime: packets[0].time, lastTime: packets.at(-1)!.time, path: join(outputDirectory, 'packets.json') },
    candidates: [], candidatePass: null, scenes: [], frames: session.inspections.flatMap(item => item.artifacts).map(frame), inspections: [...session.inspections], contactSheets: sheets(session.inspections),
    coverage: { requestedFrames: seed.length, uniqueDecodedTimes: seed.length, largestDecodedGap: step / 30, baselineTargetSpacing: step / 30, allInventoriedPresentationTimestampsRequested: seed.length === packets.length, visionAttachmentLimit: 12, exceedsVisionAttachmentLimit: false },
    externalModelCalls: 0, continuousViewing: false, audioReviewed: false, semanticCutsVerified: false, limitations: [] };
  const builder = new RecreationDossierBuilder({ service: () => ({ read: async () => session, inspect: async (_id, request, signal) => {
    signal?.throwIfAborted(); return { ...await inspection(request.times!, request.native), cached: false };
  } }), inspectScene: async (_path, request) => {
    focusCalls++; request.signal?.throwIfAborted();
    const selected = packets.filter(packet => packet.time >= request.start! - .00001 && packet.time < request.end), results: AgentInspection[] = [];
    assert.equal(request.maxFrames, selected.length); await mkdir(request.outputDirectory!);
    for (let offset = 0; offset < selected.length; offset += 24) results.push(await inspection(selected.slice(offset, offset + 24).map(packet => Math.max(request.start!, packet.time - .000001))));
    const focused: RecreationSamplingResult = { ...evidence, outputDirectory: request.outputDirectory!, range: { start: request.start!, end: request.end }, requestedRange: { start: request.start!, end: request.end },
      frames: results.flatMap(item => item.artifacts).map(frame), inspections: results, contactSheets: sheets(results), coverage: { ...evidence.coverage, requestedFrames: selected.length, uniqueDecodedTimes: selected.length, allInventoriedPresentationTimestampsRequested: true } };
    await writeFile(join(request.outputDirectory!, 'manifest.json'), JSON.stringify(focused)); return focused;
  } });
  const scout = (windows: { start: number; end: number }[] = [{ start: 6, end: 7.6 }]): RecreationScout => ({ schemaVersion: 1, sourceSha256: source.sha256, sessionId: session.id, range: { ...evidence.range },
    windows: windows.map(window => ({ ...window, reason: 'A visible rapid change needs dense timing evidence', evidenceIds: [evidence.frames.find(frame => frame.decodedTime >= window.start && frame.decodedTime < window.end)!.id] })), unresolved: ['Exact typeface remains uncertain'], nativeDetailTime: evidence.frames[12]?.decodedTime ?? evidence.frames[0].decodedTime });
  return { directory, path, source, packets, session, evidence, builder, scout, calls: () => ({ inspectCalls, focusCalls }) };
}

test('scout requests are strictly source-bound, citation-bound, ordered/merged and budgeted before extraction', async () => {
  const f = await fixture(), valid = f.scout([{ start: 6, end: 7.6 }, { start: 7, end: 8 }]);
  const result = validateRecreationScout(valid, f.evidence, f.packets); assert.equal(result.windows.length, 1); assert.equal(result.windows[0].packetCount, 60);
  assert.throws(() => validateRecreationScout({ ...valid, sourceSha256: 'b'.repeat(64) }, f.evidence, f.packets), /binding/);
  assert.throws(() => validateRecreationScout({ ...valid, windows: [{ ...valid.windows[0], evidenceIds: ['invented-frame'] }] }, f.evidence, f.packets), /retained frame/);
  assert.throws(() => validateRecreationScout({ ...valid, windows: [{ ...valid.windows[0], start: 12, end: 13 }] }, f.evidence, f.packets), /retained frame/);
  assert.throws(() => validateRecreationScout({ ...valid, nativeDetailTime: 6.12345 }, f.evidence, f.packets), /Native detail/);
  assert.throws(() => validateRecreationScout({ ...valid, command: 'arbitrary code is forbidden' }, f.evidence, f.packets));
  assert.throws(() => validateRecreationScout(f.scout([{ start: 0, end: 4 }, { start: 8, end: 12 }]), f.evidence, f.packets), /192-frame/);
  assert.throws(() => validateRecreationScout(f.scout([{ start: 0, end: 1.7 }, { start: 6, end: 7.7 }, { start: 12, end: 13.7 }]), f.evidence, f.packets), /8-sheet/);
  assert.equal(recreationScoutJsonSchema.additionalProperties, false);
});

test('small author overviews cover source time, including variable-rate retained evidence', async () => {
  const f = await fixture({ duration: 120 }); const frames = selectDossierOverviewFrames(f.evidence.frames);
  assert.ok(frames.length <= 72 && frames.length > 60); assert.equal(frames[0].decodedTime, 0); assert.equal(frames.at(-1)!.decodedTime, f.evidence.frames.at(-1)!.decodedTime);
  assert.ok(frames.some(frame => frame.decodedTime >= 59 && frame.decodedTime <= 61));
});

test('long dossier performs one bounded scout, complete dense refinement and attached-only provenance', async () => {
  const f = await fixture({ duration: 120 }); let scoutCalls = 0;
  const result = await f.builder.build(f.evidence, { cacheDir: f.directory, scout: async request => {
    scoutCalls++; assert.ok(request.images.length <= 12); assert.equal(request.schema, recreationScoutJsonSchema); assert.match(request.prompt, /untrusted data/);
    return f.scout([{ start: 6, end: 7.6 }, { start: 76, end: 77.6 }]);
  } });
  assert.equal(scoutCalls, 1); assert.equal(f.calls().focusCalls, 2); assert.equal(result.focusPass, true);
  assert.equal(result.dossier.budget.focusFrames, 96); assert.equal(result.dossier.budget.coarseFrames, 72); assert.equal(result.dossier.budget.nativeDetailFrames, 1);
  assert.ok(result.authorImages.length <= 12); assert.equal(result.authorImages.length, result.dossier.attachments.length);
  assert.ok(result.attachedFrameIds.every(id => result.frames.some(frame => frame.id === id)));
  assert.ok(result.dossier.focusWindows.every(window => window.completePacketCoverage));
  assert.ok(result.dossier.omittedCoverage.sourcePacketTimesNotAttached > 3000); assert.ok(result.dossier.omittedCoverage.baseFrameIdsNotAttached.length > 0);
  assert.ok(result.dossier.omittedCoverage.sourceIntervalsOutsideFocus.some(range => range.start === 7.6 && range.end === 76));
  assert.deepEqual(JSON.parse(await readFile(join(result.dossier.outputDirectory, 'dossier.json'), 'utf8')), result);
});

test('short all-PTS evidence adds one native midpoint frame without invoking the scout', async () => {
  const f = await fixture({ duration: 3.1, step: 1 });
  const result = await f.builder.build(f.evidence, { scout: async () => { throw new Error('Short evidence must not spend a model call'); } });
  assert.equal(result.focusPass, false); assert.equal(result.dossier.scout, null); assert.equal(f.calls().focusCalls, 0);
  assert.equal(result.dossier.budget.nativeDetailFrames, 1); assert.equal(result.authorImages.length, 5); assert.equal(result.dossier.omittedCoverage.sourcePacketTimesNotAttached, 0);
  const native = result.frames.find(frame => result.dossier.attachments.at(-1)!.frameIds.includes(frame.id))!;
  assert.equal(native.native, true); assert.ok(Math.abs(native.decodedTime - 1.55) <= 1 / 30);
});

test('twelve existing short-scene sheets retain their evidence and explicitly omit native detail', async () => {
  const f = await fixture({ duration: 9.6, step: 1 });
  const result = await f.builder.build(f.evidence, { scout: async () => { throw new Error('No scout'); } });
  assert.equal(result.authorImages.length, 12); assert.equal(result.dossier.budget.nativeDetailFrames, 0);
  assert.match(result.dossier.omittedCoverage.limitations.join(' '), /all12 author image slots/);
});

test('invalid scout windows fail before extra extraction and source replacement/cancellation are rejected', async () => {
  const f = await fixture(), before = f.calls().inspectCalls;
  await assert.rejects(f.builder.build(f.evidence, { scout: async () => f.scout([{ start: 0, end: 4 }, { start: 8, end: 12 }]) }), /192-frame/);
  assert.equal(f.calls().inspectCalls, before);
  await assert.rejects(f.builder.build(f.evidence, { scout: async () => f.scout(), signal: AbortSignal.abort(new Error('Cancelled fixture')) }), /Cancelled fixture/);
  await writeFile(f.path, Buffer.alloc(25));
  await assert.rejects(f.builder.build(f.evidence, { scout: async () => f.scout() }), /container|fingerprint/);
});
