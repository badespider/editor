import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { ReferenceAnalysisService } from '@diffusionstudio/video-understanding/reference';
import { referenceBreakdownSchema } from '@diffusionstudio/video-understanding/reference-schema';
import { AgentEvidenceService } from '@diffusionstudio/video-understanding/agent';
import type { AgentArtifact } from '@diffusionstudio/video-understanding/agent';
import { fingerprint, probe } from './preview.ts';
import { probePortraitSource } from './delivery.ts';
import { runMedia } from './media-process.ts';
import { adaptMotion, generateMotionRecipe, motionDigest, reviewMotion } from './motion.ts';
import { motionHash, motionRecipeSchema, motionCorrectionSchema, motionSettingsSchema } from './motion-schema.ts';
import type { MotionAdaptation, MotionRecipe } from './motion-schema.ts';
import { motionComposition } from './motion-composition.ts';

const jobSchema = z.object({ schemaVersion: z.literal(1), kind: z.literal('agent-motion-job'),
  referenceSession: motionHash, referenceSequence: motionHash, sequenceSha256: motionHash,
  referenceCache: z.string().min(1),
  maxCorrections: z.number().int().min(0).max(4), externalModelCalls: z.literal(0),
}).strict();
type Job = z.infer<typeof jobSchema>;
type Seal<T> = { value: T; sha256: string };
type Revision = { index: number; adaptation: MotionAdaptation; parentReviewSha256: string | null; reason: string;
  baseSha256: string; compositionSha256: string };
type Inspection = { adaptationSha256: string; renderSha256: string; sessionId: string; audible: boolean;
  technicalPass: boolean; artifacts: (AgentArtifact & { sha256: string })[]; contactSheets: string[] };
const bounded = (signal?: AbortSignal) => AbortSignal.any([AbortSignal.timeout(300000), ...(signal ? [signal] : [])]);

export async function exists(path: string) {
  try { await stat(path); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e; }
}
export async function readMotionJSON(path: string): Promise<unknown> {
  const info = await stat(path);
  if (!info.isFile() || info.size > 4 * 1024 ** 2) throw Error('Motion JSON must be a local file <=4 MiB');
  return JSON.parse(await readFile(path, 'utf8'));
}
export async function readSeal<T>(path: string): Promise<Seal<T>> {
  const data = await readMotionJSON(path) as Seal<T>;
  if (!data || motionHash.safeParse(data.sha256).success === false || motionDigest(data.value) !== data.sha256) throw Error('Motion record fingerprint changed');
  return data;
}
export async function save<T>(path: string, value: T): Promise<Seal<T>> {
  const result = { value, sha256: motionDigest(value) };
  await writeFile(path, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); return result;
}

/** The host agent is the interpreter/reviewer. This resumable local module never starts another model. */
export class MotionWorkflow {
  readonly root: string;
  readonly reference: ReferenceAnalysisService;
  readonly evidence: AgentEvidenceService;
  constructor(directory: string) {
    this.root = resolve(directory);
    this.reference = new ReferenceAnalysisService(join(this.root, 'evidence'));
    this.evidence = this.reference.agent;
  }
  async create(input: { reference: string; start: number; end: number; maxCorrections?: number; maxDecodedMiB?: number }, cancellation?: AbortSignal) {
    const signal = bounded(cancellation);
    const maxCorrections = z.number().int().min(0).max(4).parse(input.maxCorrections ?? 2);
    await mkdir(dirname(this.root), { recursive: true }); await mkdir(this.root);
    const source = await this.evidence.open({ path: input.reference, goal: 'Caption motion reference', overviewCount: 1, maxDuration: 7200 }, signal);
    const sequence = await this.reference.extract(source.id, { start: input.start, end: input.end, maxDecodedMiB: input.maxDecodedMiB }, signal);
    await save(join(this.root, 'job.json'), jobSchema.parse({ schemaVersion: 1, kind: 'agent-motion-job',
      referenceSession: source.id, referenceSequence: sequence.id, sequenceSha256: sequence.sequenceSha256,
      referenceCache: join(this.root, 'evidence'), maxCorrections, externalModelCalls: 0 }));
    return this.next(0, signal);
  }
  private async job(): Promise<Job> { return jobSchema.parse((await readSeal(join(this.root, 'job.json'))).value); }
  private async recipe(): Promise<MotionRecipe> { return motionRecipeSchema.parse((await readSeal(join(this.root, 'interpretation', 'recipe.json'))).value); }
  async reuse(sourceDirectory: string) {
    const source = new MotionWorkflow(sourceDirectory), job = await source.job(), recipe = await source.recipe();
    const reference = new ReferenceAnalysisService(job.referenceCache);
    const manifest = await reference.sequence(job.referenceSession, job.referenceSequence);
    if (manifest.sequenceSha256 !== recipe.reference.sequenceSha256 || manifest.sequenceSha256 !== job.sequenceSha256) throw Error('Reusable recipe reference changed');
    if (await fingerprint(manifest.source.path) !== manifest.source.sha256) throw Error('Reusable reference source changed');
    await mkdir(dirname(this.root), { recursive: true }); await mkdir(this.root);
    await mkdir(join(this.root, 'interpretation'));
    // Reuse the learned recipe/attribution, not another footage adaptation or its approval.
    await save(join(this.root, 'interpretation', 'recipe.json'), recipe);
    await save(join(this.root, 'interpretation', 'reused-from.json'), { job: source.root, recipeSha256: motionDigest(recipe) });
    await save(join(this.root, 'job.json'), job);
    return this.next();
  }
  private folder(index: number) { return join(this.root, `revision-${index}`); }
  private async latestReview(directory: string) {
    let record: (Seal<ReturnType<typeof reviewMotion>> & { number: number }) | null = null;
    for (let i = 0; i < 8; i++) {
      const path = join(directory, i ? `review-${i}.json` : 'review.json');
      if (!(await exists(path))) break;
      record = { ...await readSeal<ReturnType<typeof reviewMotion>>(path), number: i };
    }
    return record;
  }
  private async current() {
    const job = await this.job(); let index = -1;
    for (let i = 0; i <= job.maxCorrections; i++) {
      if (!(await exists(this.folder(i)))) break;
      if (!(await exists(join(this.folder(i), 'revision.json')))) throw Error(`Revision ${i} is incomplete; inspect retained diagnostics before retrying in a new job`);
      index = i;
    }
    if (index < 0) return null;
    const record = await readSeal<Revision>(join(this.folder(index), 'revision.json'));
    if (record.value.index !== index) throw Error('Revision index mismatch');
    // Recompute all derived layout/timing; editing a saved adaptation cannot silently change executable output.
    const recomputed = adaptMotion(record.value.adaptation.recipe, record.value.adaptation.input);
    if (motionDigest(recomputed) !== motionDigest(record.value.adaptation)) throw Error('Adaptation differs from recipe/input');
    if (record.value.adaptation.recipe.reference.sequenceSha256 !== job.sequenceSha256) throw Error('Recipe belongs to another reference');
    return { ...record, directory: this.folder(index) };
  }
  async next(from = 0, signal?: AbortSignal): Promise<unknown> {
    const job = await this.job();
    if (!(await exists(join(this.root, 'interpretation', 'recipe.json')))) {
      if (await exists(join(this.root, 'interpretation'))) throw Error('Incomplete interpretation retained; use a new job after inspection');
      return { stage: 'needs_interpretation', capability: 'vision',
        instruction: 'Open these images. Page through the full bounded sequence, inspect native detail, then submit the existing breakdown plus a caption recipe intent. Filenames are not observations.',
        evidence: await new ReferenceAnalysisService(job.referenceCache).page(job.referenceSession, job.referenceSequence, { from, count: 24 }, signal),
        submit: 'playbook motion interpret JOB breakdown.json intent.json', externalModelCalls: 0 };
    }
    const current = await this.current();
    if (!current) return { stage: 'needs_footage', recipe: await this.recipe(), submit: 'playbook motion adapt JOB input.json' };
    const directory = current.directory;
    if (!(await exists(join(directory, 'inspection.json')))) return {
      stage: await exists(join(directory, 'preview_DRAFT.mp4')) ? 'needs_inspection' : await exists(join(directory, 'render-attempt.json')) ? 'render_interrupted_inspect_diagnostics' : 'needs_render', revision: current.value.index,
      adaptationSha256: current.sha256, composition: join(directory, 'edit.tsx'), warnings: current.value.adaptation.warnings,
      submit: await exists(join(directory, 'preview_DRAFT.mp4')) ? 'playbook motion inspect JOB' : 'playbook motion render JOB',
    };
    const inspection = await readSeal<Inspection>(join(directory, 'inspection.json'));
    if (inspection.value.adaptationSha256 !== current.sha256) throw Error('Inspection belongs to a different adaptation');
    if (await fingerprint(join(directory, 'preview_DRAFT.mp4'), signal) !== inspection.value.renderSha256) throw Error('Rendered file changed; stored review is stale');
    const review = await this.latestReview(directory);
    if (!review) return { stage: 'needs_review', revision: current.value.index,
      ...inspection.value, adaptationSha256: current.sha256, inspectionSha256: inspection.sha256,
      instruction: 'Open every frame, inspect motion/timing/readability/placement, and listen with audio tools or mark audio unknown. Compare the effect, not differing backgrounds.',
      submit: 'playbook motion review JOB review.json' };
    if (review.value.adaptationSha256 !== current.sha256 || review.value.inspectionSha256 !== inspection.sha256) throw Error('Stored review is stale');
    return { stage: review.value.status, revision: current.value.index, remainingCorrections: job.maxCorrections - current.value.index,
      adaptationSha256: current.sha256, reviewSha256: review.sha256, review: review.value,
      submit: review.value.status === 'needs_correction' ? 'playbook motion correct JOB correction.json'
        : review.value.status === 'needs_human_review' ? 'playbook motion review JOB additional-review.json' : null,
      safeToAutoPublish: false, externalModelCalls: 0 };
  }
  async interpret(breakdown: unknown, intent: unknown, signal?: AbortSignal) {
    const job = await this.job(), reference = new ReferenceAnalysisService(job.referenceCache), manifest = await reference.sequence(job.referenceSession, job.referenceSequence);
    if (manifest.sequenceSha256 !== job.sequenceSha256) throw Error('Reference binding changed');
    const parsed = referenceBreakdownSchema.parse(breakdown), recipe = generateMotionRecipe(manifest, parsed, intent);
    // Reverify every claimed frame through the evidence pipeline, without equating verification with viewing.
    await reference.annotate(job.referenceSession, job.referenceSequence, parsed, signal);
    const folder = join(this.root, 'interpretation'); await mkdir(folder);
    await save(join(folder, 'breakdown.json'), parsed); await save(join(folder, 'intent.json'), intent);
    await save(join(folder, 'recipe.json'), recipe);
    return this.next();
  }
  private async source(adaptation: MotionAdaptation, signal: AbortSignal) {
    const path = await realpath(resolve(adaptation.input.source.path)), info = await stat(path);
    if (!info.isFile() || info.size > 16 * 1024 ** 3) throw Error('Source must be a local video <=16 GiB');
    if (await fingerprint(path, signal) !== adaptation.input.source.sha256) throw Error('Footage changed; reinspect and start a new adaptation');
    const media = await probe(path, signal); await probePortraitSource(path, signal);
    const color = JSON.parse((await runMedia(['-v','error','-select_streams','v:0','-show_entries','stream=color_transfer','-of','json',
      '-protocol_whitelist','file,pipe',path], { binary: process.env.FFPROBE_PATH || 'ffprobe', signal })).toString());
    if (['smpte2084','arib-std-b67'].includes(color.streams?.[0]?.color_transfer)) throw Error('HDR footage requires an explicit color-managed conversion before motion adaptation');
    if (media.duration > 7200 || adaptation.input.range.end > media.duration + .001) throw Error('Source duration/range exceeds limits');
    return { path, media };
  }
  private async prepare(adaptation: MotionAdaptation, index: number, parentReviewSha256: string | null, reason: string, cancellation?: AbortSignal) {
    const signal = bounded(cancellation), { path, media } = await this.source(adaptation, signal);
    const folder = this.folder(index); await mkdir(folder);
    const base = join(folder, 'base.mp4'), { start, end } = adaptation.input.range, { width, height } = adaptation.input;
    const filter = `[0:v:0]setpts=PTS-(${media.startTime})/TB,trim=start=${start}:end=${end},setpts=PTS-(${start})/TB,` +
      `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x18212b,setsar=1,fps=30,format=yuv420p[v]` +
      (media.hasAudio ? `;[0:a:0]asetpts=PTS-(${media.startTime})/TB,aresample=48000:async=1:first_pts=0,atrim=start=${start}:end=${end},asetpts=PTS-(${start})/TB,aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=duration=${adaptation.duration}[a]` : '');
    await runMedia(['-v', 'error', '-nostdin', '-n', '-copyts', '-ss', String(Math.max(0, media.startTime + start - media.containerStartTime - 1)),
      '-protocol_whitelist', 'file,pipe', '-i', path, '-filter_complex', filter, '-map', '[v]', ...(media.hasAudio ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '192k'] : ['-an']),
      '-map_metadata', '-1', '-t', String(adaptation.duration), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-movflags', '+faststart', base], { signal });
    const metadata = await probe(base, signal);
    if (Math.abs(metadata.duration - adaptation.duration) > 1 / 30 + .001) throw Error('Incomplete prepared footage');
    if (await fingerprint(path, signal) !== adaptation.input.source.sha256) throw Error('Source changed during preparation');
    const code = motionComposition(adaptation, base);
    await writeFile(join(folder, 'edit.tsx'), code, { flag: 'wx' });
    await save(join(folder, 'revision.json'), { index, adaptation, parentReviewSha256, reason,
      baseSha256: await fingerprint(base, signal), compositionSha256: motionDigest(code) } satisfies Revision);
    return this.next();
  }
  async adapt(input: unknown, signal?: AbortSignal) {
    if (await this.current()) throw Error('This job already has footage; use the reviewed correction path or start a new job');
    return this.prepare(adaptMotion(await this.recipe(), input), 0, null, 'Initial adaptation', signal);
  }
  async renderContext(signal?: AbortSignal) {
    const current = await this.current(); if (!current) throw Error('Adapt footage before rendering');
    const { adaptation } = current.value;
    await this.source(adaptation, bounded(signal));
    const base = join(current.directory, 'base.mp4');
    if (await fingerprint(base, signal) !== current.value.baseSha256) throw Error('Prepared media changed');
    const code = await readFile(join(current.directory, 'edit.tsx'), 'utf8');
    if (motionDigest(code) !== current.value.compositionSha256 || code !== motionComposition(adaptation, base)) throw Error('Composition changed; revise the recipe instead of attaching a stale review');
    return { directory: current.directory, adaptation, adaptationSha256: current.sha256,
      output: join(current.directory, 'preview_DRAFT.mp4'),
      bundle: { name: `Caption motion DRAFT ${current.value.index}`, height: adaptation.input.height, fps: 30 as const, chapters: [] } };
  }
  async claimRender(signal?: AbortSignal) {
    const context = await this.renderContext(signal);
    await save(join(context.directory, 'render-attempt.json'), { adaptationSha256: context.adaptationSha256,
      instruction: 'One render attempt per revision. A disconnection may leave an export running; inspect .render-* diagnostics before starting a new job.' });
    return context;
  }
  async verifyRender(path: string, cancellation?: AbortSignal) {
    const signal = bounded(cancellation), current = await this.renderContext(signal), actual = await probe(path, signal), base = await probe(join(current.directory, 'base.mp4'), signal);
    await runMedia(['-v', 'error', '-xerror', '-nostdin', '-protocol_whitelist', 'file,pipe', '-i', path, '-f', 'null', '-'], { signal });
    const frames = JSON.parse((await runMedia(['-v','error','-select_streams','v:0','-count_frames','-show_entries',
      'stream=nb_read_frames,avg_frame_rate','-of','json','-protocol_whitelist','file,pipe',path],
      { binary: process.env.FFPROBE_PATH || 'ffprobe', signal })).toString()).streams?.[0];
    const checks = { dimensions: actual.width === current.adaptation.input.width && actual.height === current.adaptation.input.height,
      duration: Math.abs(actual.duration - current.adaptation.duration) <= 1 / 30 + .001,
      frames: Number(frames?.nb_read_frames) === Math.round(current.adaptation.duration * 30) && frames?.avg_frame_rate === '30/1',
      audioTrack: !base.hasAudio || actual.hasAudio };
    return { technicalPass: Object.values(checks).every(Boolean), sha256: await fingerprint(path, signal), checks,
      limitation: 'Decode, dimensions, frame count/rate, duration and audio presence only; not audio identity, font correctness, motion or editorial approval.' };
  }
  async inspect(cancellation?: AbortSignal) {
    const signal = bounded(cancellation), context = await this.renderContext(signal), path = context.output;
    if (await exists(join(context.directory, 'inspection.json'))) throw Error('This render already has an inspection; use next to resume');
    const technical = await this.verifyRender(path, signal);
    if (!technical.technicalPass) throw Error('Render failed technical checks; inspect the retained output before proceeding');
    const session = await this.evidence.open({ path, goal: 'Review adapted caption motion', overviewCount: 1 }, signal);
    const artifacts: Inspection['artifacts'] = [], contactSheets: string[] = [];
    const times = context.adaptation.previewSamples;
    for (let i = 0; i < times.length; i += 24) {
      const chunk = await this.evidence.inspect(session.id, { times: times.slice(i, i + 24), native: true }, signal);
      if (chunk.contactSheet) contactSheets.push(chunk.contactSheet);
      for (const a of chunk.artifacts) artifacts.push({ ...a, sha256: await fingerprint(a.path, signal) });
    }
    if (session.audio.hasTrack && !session.audio.digitalSilence) {
      const audio = await this.evidence.inspect(session.id, { start: 0, end: context.adaptation.duration, count: 1, audio: true }, signal);
      for (const a of audio.artifacts.filter(a => a.kind === 'audio')) artifacts.push({ ...a, sha256: await fingerprint(a.path, signal) });
    }
    await save(join(context.directory, 'inspection.json'), { adaptationSha256: context.adaptationSha256,
      renderSha256: technical.sha256, sessionId: session.id, audible: session.audio.hasTrack && !session.audio.digitalSilence,
      technicalPass: true, artifacts, contactSheets } satisfies Inspection);
    return this.next();
  }
  async review(input: unknown, signal?: AbortSignal) {
    const current = await this.current(); if (!current) throw Error('No adapted preview');
    const inspection = await readSeal<Inspection>(join(current.directory, 'inspection.json')), job = await this.job();
    if (inspection.value.adaptationSha256 !== current.sha256) throw Error('Inspection belongs to a different adaptation');
    await this.renderContext(signal);
    if (await fingerprint(join(current.directory, 'preview_DRAFT.mp4'), signal) !== inspection.value.renderSha256) throw Error('Rendered file changed; review is stale');
    for (const artifact of inspection.value.artifacts) if (await fingerprint(artifact.path, signal) !== artifact.sha256) throw Error('Review evidence changed');
    const review = reviewMotion(input, { ...inspection.value, adaptationSha256: current.sha256, inspectionSha256: inspection.sha256,
      revision: current.value.index, maxCorrections: job.maxCorrections });
    const prior = await this.latestReview(current.directory), number = prior ? prior.number + 1 : 0;
    if (number >= 8) throw Error('Review history limit reached; inspect retained records before further work');
    await save(join(current.directory, number ? `review-${number}.json` : 'review.json'), { ...review, supersedes: prior?.sha256 ?? null }); return this.next();
  }
  async correct(input: unknown, signal?: AbortSignal) {
    const correction = motionCorrectionSchema.parse(input), current = await this.current(); if (!current) throw Error('No adapted preview');
    const job = await this.job(), review = await this.latestReview(current.directory);
    if (!review) throw Error('Review the actual preview before correcting it');
    if (correction.adaptationSha256 !== current.sha256 || correction.reviewSha256 !== review.sha256 || review.value.adaptationSha256 !== current.sha256) throw Error('Correction is bound to an old revision/review');
    if (review.value.status !== 'needs_correction' || current.value.index >= job.maxCorrections) throw Error('Correction requires a failed review and remaining retry budget');
    await this.renderContext(signal);
    if (await fingerprint(join(current.directory, 'preview_DRAFT.mp4'), signal) !== review.value.renderSha256) throw Error('Reviewed render changed');
    const recipe = structuredClone(current.value.adaptation.recipe), data = structuredClone(current.value.adaptation.input);
    recipe.settings = motionSettingsSchema.parse({ ...recipe.settings, ...correction.settings });
    for (const cue of data.captions.cues) { cue.start += correction.captionOffsetSeconds; cue.end += correction.captionOffsetSeconds; }
    if (correction.captionOffsetSeconds) data.captions.verification = 'unverified';
    if (motionDigest(recipe) === motionDigest(current.value.adaptation.recipe) && !correction.captionOffsetSeconds) throw Error('Correction contains no changes');
    return this.prepare(adaptMotion(recipe, data), current.value.index + 1, review.sha256, correction.reason, signal);
  }
}
