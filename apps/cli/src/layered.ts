import { resolve, dirname } from 'node:path';
import { z } from 'zod';
import type { Command } from 'commander';
import { AgentEvidenceService } from '@diffusionstudio/video-understanding/agent';
import { checkLayered, jsonHash, layeredPlanSchema, prepareLayered, readLayeredBundle } from '@diffusionstudio/editing-playbook/layered';
import { verifyLayered } from '@diffusionstudio/editing-playbook/layered-review';
import { fingerprint } from '@diffusionstudio/editing-playbook/node';
import { readJson, writeJson, loadSource } from './clips';
import { renderPreparedComposition } from './playbook-delivery';

const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
const progress = (message: string) => console.error(message);
function safe<A extends unknown[]>(action: (...args: A) => Promise<void>) {
  return async (...args: A) => { try { await action(...args); } catch (error) { console.error((error as Error).message); process.exitCode = 1; } };
}
const reviewSchema = z.object({
  schemaVersion: z.literal(1), sessionId: z.string().regex(/^[a-f0-9]{64}$/), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  manifestSha256: z.string().regex(/^[a-f0-9]{64}$/), author: z.string().trim().min(1).max(200),
  packetSha256: z.string().regex(/^[a-f0-9]{64}$/),
  pictureMethod: z.enum(['sampled_frames', 'sampled_video']), audioMethod: z.enum(['direct_listening', 'asr_only', 'not_reviewed']),
  evidenceIds: z.array(z.string()).min(1).max(200),
  checks: z.object({ chronology: z.string().trim().min(1), cutaways: z.string().trim().min(1), speechContinuity: z.string().trim().min(1),
    naturalness: z.string().trim().min(1), limitations: z.string().trim().min(1) }).strict(),
  verdict: z.enum(['needs_changes', 'sampled_review_acceptable']),
}).strict();
const packetSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal('layered-render-evidence'), sessionId: z.string(), videoPath: z.string(),
  sourceSha256: z.string(), manifestSha256: z.string(),
  artifacts: z.array(z.object({ id: z.string(), path: z.string(), kind: z.enum(['frame', 'clip', 'audio']),
    start: z.number().finite().nonnegative(), end: z.number().finite().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).max(1024),
  contactSheets: z.array(z.object({ path: z.string(), sha256: z.string(), frameIds: z.array(z.string()) }).strict()).max(1024),
  reviewFrames: z.array(z.number().int().nonnegative()), binding: z.literal('inspection_candidate_not_yet_verified'),
}).strict();

export function registerLayeredCommands(playbook: Command) {
  const layered = playbook.command('layered').description('Silent B-roll over continuous original voice/ambience; separate source-bound preparation and actual-editor review.');
  layered.command('workflow').action(() => print({ version: 1, instructions: 'reference/layered.md',
    schemas: { plan: z.toJSONSchema(layeredPlanSchema), review: z.toJSONSchema(reviewSchema) },
    commands: ['media understand <source>', 'media inspect <session> ...', 'playbook layered check plan.json',
      'playbook layered prepare plan.json -o bundle', 'playbook layered deliver bundle -o video.mp4',
      'playbook layered verify bundle video.mp4', 'playbook layered inspect bundle video.mp4',
      'media inspect <render-session> --start <seconds> --end <seconds> --audio --clip',
      'playbook layered review bundle video.mp4 review.json --inspection inspection.json -o review-record.json'],
    constraints: ['Base plan retains voice/natural sound. Cutaway audio is always muted; picture changes never cut the voice.',
      'Protected source moments/picture ranges cannot be covered. Chronology and inspected visual evidence are required.',
      'No song, music generation, ducking, downloads, paid AI, publishing or fabricated footage. Standalone environment beats retain their sound in the base plan.',
      'Cut-only verification is not valid for this bundle. Review the actual layered export; ASR is not listening.'], externalModelCalls: 0 }));
  layered.command('check').argument('<plan.json>').action(safe(async (path: string) => {
    const result = checkLayered(await readJson(resolve(path))); print(result); if (!result.technicalPass) process.exitCode = 1;
  }));
  layered.command('prepare').argument('<plan.json>').requiredOption('-o, --output <directory>')
    .action(safe(async (path: string, options: { output: string }) => {
      const controller = new AbortController(), abort = () => controller.abort(); process.once('SIGINT', abort);
      try { print(await prepareLayered(await readJson(resolve(path)), { output: options.output, baseDirectory: dirname(resolve(path)), signal: controller.signal, onProgress: progress })); }
      finally { process.removeListener('SIGINT', abort); }
    }));
  layered.command('deliver').argument('<bundle>').requiredOption('-o, --output <video.mp4>')
    .action(safe(async (directory: string, options: { output: string }) => {
      const { root, bundle } = await readLayeredBundle(directory);
      const result = await renderPreparedComposition(root, bundle, options.output, verifyLayered, progress);
      print(result); if (result.status === 'technical_review_failed') process.exitCode = 1;
    }));
  layered.command('verify').argument('<bundle>').argument('<video.mp4>').option('-o, --output <report.json>')
    .action(safe(async (directory: string, video: string, options: { output?: string }) => {
      const result = await verifyLayered(directory, video, { onProgress: progress });
      if (options.output) await writeJson(options.output, result); print(result); if (!result.technicalPass) process.exitCode = 1;
    }));
  layered.command('inspect').argument('<bundle>').argument('<video.mp4>').option('--cache-dir <directory>').option('-o, --output <packet.json>')
    .action(safe(async (directory: string, video: string, options: { cacheDir?: string; output?: string }) => {
      const { bundle } = await readLayeredBundle(directory);
      const service = new AgentEvidenceService(options.cacheDir);
      const context = await service.open({ path: resolve(video), goal: 'Review actual visual-journal export: cutaway entry/exit, uninterrupted voice, chronology and naturalness.', maxDuration: 7200 });
      const reviewFrames = [...new Set(bundle.pictures.flatMap(c => [Math.max(0, c.startFrame - 1), c.startFrame, c.startFrame + c.durationFrames - 1]))];
      for (let i = 0; i < reviewFrames.length; i += 48) await service.inspect(context.id, { times: reviewFrames.slice(i, i + 48).map(f => Math.max(0, f / 30 - 1e-7)) });
      for (let start = 0; start < context.source.duration; start += 600) await service.inspect(context.id, { start, end: Math.min(start + 600, context.source.duration), count: 1, audio: true });
      const current = await service.read(context.id);
      const artifacts = await Promise.all(current.inspections.flatMap(i => i.artifacts).map(async a => ({ id: a.id, path: a.path, kind: a.kind, start: a.start, end: a.end, sha256: await fingerprint(a.path) })));
      const contactSheets = await Promise.all(current.inspections.filter(i => i.contactSheet).map(async i => ({ path: i.contactSheet!, frameIds: i.contactSheetOrder ?? [], sha256: await fingerprint(i.contactSheet!) })));
      if (await fingerprint(context.source.path) !== context.source.sha256) throw new Error('Export changed while preparing inspection evidence');
      const packet = packetSchema.parse({ schemaVersion: 1, kind: 'layered-render-evidence', sessionId: context.id, videoPath: context.source.path,
        sourceSha256: context.source.sha256, manifestSha256: jsonHash(bundle), binding: 'inspection_candidate_not_yet_verified', artifacts, contactSheets, reviewFrames });
      if (options.output) await writeJson(options.output, packet); print({ packet, packetSha256: jsonHash(packet),
        note: 'Open the actual evidence before reviewing. Additional media inspect refinement needs a fresh layered inspect packet. Inspection alone does not certify the export.' });
    }));
  layered.command('review').argument('<bundle>').argument('<video.mp4>').argument('<review.json>')
    .requiredOption('-o, --output <record.json>').requiredOption('--inspection <packet.json>').option('--cache-dir <directory>')
    .action(safe(async (directory: string, video: string, reviewPath: string, options: { output: string; cacheDir?: string; inspection: string }) => {
      const { bundle } = await readLayeredBundle(directory), review = reviewSchema.parse(await readJson(resolve(reviewPath)));
      const packet = packetSchema.parse(await readJson(resolve(options.inspection)));
      const context = await loadSource(review.sessionId, options.cacheDir), hash = await fingerprint(resolve(video));
      if (hash !== review.sourceSha256 || context.source.sha256 !== hash || review.manifestSha256 !== jsonHash(bundle) || review.packetSha256 !== jsonHash(packet) ||
        packet.sourceSha256 !== hash || packet.manifestSha256 !== review.manifestSha256 || packet.sessionId !== context.id || packet.videoPath !== context.source.path) throw new Error('Review is stale or bound to different media/bundle/packet');
      const known = context.inspections.flatMap(i => i.artifacts);
      const verifyEvidence = async () => {
        for (const a of packet.artifacts) if (!known.some(b => a.id === b.id && a.path === b.path && a.kind === b.kind && a.start === b.start && a.end === b.end) ||
          await fingerprint(a.path) !== a.sha256) throw new Error('Inspection artifact changed or is unavailable');
        for (const sheet of packet.contactSheets) if (!context.inspections.some(i => i.contactSheet === sheet.path && jsonHash(i.contactSheetOrder ?? []) === jsonHash(sheet.frameIds)) ||
          sheet.frameIds.some(id => !packet.artifacts.some(a => a.id === id && a.kind === 'frame')) || await fingerprint(sheet.path) !== sheet.sha256) throw new Error('Contact sheet changed or is unavailable');
      };
      await verifyEvidence();
      const artifacts = packet.artifacts.filter(a => review.evidenceIds.includes(a.id));
      if (new Set(artifacts.map(a => a.id)).size !== new Set(review.evidenceIds).size) throw new Error('Review cites unknown inspection artifacts');
      if (!artifacts.some(a => a.kind === (review.pictureMethod === 'sampled_frames' ? 'frame' : 'clip'))) throw new Error('Missing picture inspection artifacts');
      if (review.audioMethod === 'direct_listening' && !artifacts.some(a => a.kind === 'audio' || a.kind === 'clip')) throw new Error('Listening declaration requires audio/video artifacts');
      const technical = await verifyLayered(directory, video, { onProgress: progress });
      if (!technical.technicalPass) throw new Error('Actual export failed technical review');
      if (technical.sha256 !== hash || technical.bundleIdentity.manifestSha256 !== review.manifestSha256) throw new Error('Export/bundle changed since the review declaration');
      await verifyEvidence();
      const result = { kind: 'editor-layered-agent-review', review, technical, status: 'agent_reported_sampled_review',
        directListeningReported: review.audioMethod === 'direct_listening', reviewRequired: true, safeToAutoPublish: false,
        limitations: ['This records the author’s observations for exact bytes, not independent certification of viewing, listening or story quality.'] };
      await writeJson(options.output, result); print({ path: resolve(options.output), status: result.status, reviewRequired: true, safeToAutoPublish: false });
    }));
}
