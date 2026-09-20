import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { z } from 'zod';
import { planSchema } from './schema.ts';
import { validatePlan } from './validate.ts';
import { deliverySettingsSchema, planDeliveryTimeline } from './delivery-schema.ts';
import type { DeliveryBundle } from './delivery-schema.ts';
import { prepareDelivery, readDeliveryBundle, runMedia, probePortraitSource } from './delivery.ts';
import { fingerprint, probe } from './preview.ts';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const note = z.string().trim().min(1).max(4000);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const frameNumber = z.number().int().nonnegative().max(216000);
const range = z.object({ startFrame: frameNumber, endFrame: frameNumber, reason: note }).strict()
  .refine(r => r.endFrame > r.startFrame, 'endFrame must follow startFrame');

/** V1 deliberately changes PICTURE only. Source speech/ambience remains on its base clock. */
export const layeredPlanSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal('editor-layered-plan'),
  basePlan: planSchema, settings: deliverySettingsSchema,
  pictureProtectedRanges: z.array(range).max(1000),
  cutaways: z.array(z.object({
    id, sourceId: id, in: z.number().finite().nonnegative(), out: z.number().finite().positive(),
    atFrame: frameNumber, purpose: z.enum(['environment', 'illustration', 'memory']),
    reason: note, chronologyNote: note, evidenceIds: z.array(id).min(1).max(100),
    audio: z.literal('muted'),
  }).strict().refine(c => c.out > c.in, 'out must follow in')).min(1).max(100),
}).strict();
export type LayeredPlan = z.infer<typeof layeredPlanSchema>;
export const jsonHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const overlaps = (a: number, b: number, c: number, d: number) => a < d && b > c;
const lengthFrames = (c: { in: number; out: number }) => Math.ceil((c.out - c.in) * 30 - 1e-7);

export function checkLayered(input: unknown) {
  const parsed = layeredPlanSchema.safeParse(input);
  const errors: string[] = [], warnings: string[] = [];
  if (!parsed.success) return { technicalPass: false, errors: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`), warnings,
    reviewRequired: true, safeToAutoEdit: false };
  const plan = parsed.data;
  const baseReport = validatePlan(plan.basePlan);
  errors.push(...baseReport.errors.map(e => e.message));
  warnings.push(...baseReport.warnings.map(w => `Base plan (${w.code}): ${w.message}`));
  const timeline = planDeliveryTimeline(plan.basePlan.segments, 30);
  const frames = timeline.reduce((n, c) => n + c.durationFrames, 0);
  if (frames / 30 > Math.min(plan.settings.maxDuration, plan.basePlan.brief.maxDuration) + 1e-6) errors.push('Frame-aligned duration exceeds budget');
  const ids = new Set<string>();
  const cuts = [...plan.cutaways].sort((a, b) => a.atFrame - b.atFrame);
  for (const [i, cut] of cuts.entries()) {
    if (ids.has(cut.id)) errors.push(`Duplicate cutaway id: ${cut.id}`); ids.add(cut.id);
    const source = plan.basePlan.sources.find(s => s.id === cut.sourceId);
    if (!source?.sha256 || cut.out > source.duration + 1e-6) errors.push(`${cut.id}: unknown/unfingerprinted source or out-of-bounds range`);
    const end = cut.atFrame + lengthFrames(cut);
    if (lengthFrames(cut) < 1) errors.push(`${cut.id}: range is too small to occupy a timeline frame`);
    if (end > frames) errors.push(`${cut.id}: exceeds base timeline`);
    if (i && cut.atFrame < cuts[i - 1].atFrame + lengthFrames(cuts[i - 1])) errors.push(`${cut.id}: overlapping cutaways are not supported`);
    if (plan.pictureProtectedRanges.some(r => overlaps(cut.atFrame, end, r.startFrame, r.endFrame))) errors.push(`${cut.id}: covers protected picture`);
    // Existing protected moments conservatively protect both picture and sound.
    for (const [j, segment] of plan.basePlan.segments.entries()) {
      for (const r of plan.basePlan.protectedRanges.filter(r => r.sourceId === segment.sourceId)) {
        const a = Math.max(r.start, segment.in), b = Math.min(r.end, segment.out);
        if (b > a && overlaps(cut.atFrame, end, timeline[j].startFrame + (a - segment.in) * 30,
          timeline[j].startFrame + (b - segment.in) * 30)) errors.push(`${cut.id}: covers a protected source moment`);
      }
    }
    const evidence = cut.evidenceIds.map(e => plan.basePlan.evidence.find(v => v.id === e));
    if (evidence.some(e => !e || e.sourceId !== cut.sourceId || e.verification === 'uncertain')) errors.push(`${cut.id}: missing, mismatched or uncertain evidence`);
    // A relevant covering range is required, not an unrelated frame elsewhere in the recording.
    if (!evidence.some(e => e?.kind === 'visual' && e.verification === 'observed' && e.start <= cut.in + .001 && e.end >= cut.out - .001 && e.artifact))
      errors.push(`${cut.id}: requires inspected visual evidence covering the selected range and its artifact path`);
    if (lengthFrames(cut) > 450) warnings.push(`${cut.id}: long cutaway; review whether it still feels like this person's journal`);
  }
  if (plan.pictureProtectedRanges.some(r => r.endFrame > frames)) errors.push('Protected picture range exceeds timeline');
  warnings.push('Cutaway evidence and chronology are agent-authored observations, not independent factual certification.',
    'Cutaways are silent; all voice and natural sound follow the base plan. No music, automatic ducking, captions or synthetic footage.');
  return { technicalPass: errors.length === 0, errors, warnings, frames, duration: frames / 30, reviewRequired: true, safeToAutoEdit: false };
}

const preparedCutSchema = z.object({ id, path: z.string().regex(/^cutaways\/[a-zA-Z0-9_-]+\.mp4$/), sha256: sha }).strict();
const pictureSchema = z.object({ id: z.string(), path: z.string(), sourceIn: z.number().finite().nonnegative(),
  startFrame: frameNumber, durationFrames: z.number().int().positive(), sha256: sha }).strict();
export const layeredBundleSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal('editor-layered-bundle'), name: z.string(), fps: z.literal(30),
  width: z.number().int().positive(), height: z.number().int().positive(), frames: z.number().int().positive(), duration: z.number().finite().positive(),
  planSha256: sha, baseManifestSha256: sha, compositionSha256: sha,
  cutaways: z.array(preparedCutSchema).min(1).max(100), pictures: z.array(pictureSchema).min(1).max(300),
  audio: z.object({ path: z.literal('audio/source-continuity.wav'), sha256: sha }).strict(),
  chapters: z.array(z.object({ seconds: z.number().nonnegative(), title: z.string() }).strict()),
}).strict();
export type LayeredBundle = z.infer<typeof layeredBundleSchema>;

/** Flatten only the visible picture; the audio timeline is never split by these boundaries. */
export function visiblePictures(plan: LayeredPlan, base: Pick<DeliveryBundle, 'clips' | 'frames'>,
  prepared: z.infer<typeof preparedCutSchema>[]): LayeredBundle['pictures'] {
  const boundaries = [...new Set([0, base.frames, ...base.clips.flatMap(c => [c.startFrame, c.startFrame + c.durationFrames]),
    ...plan.cutaways.flatMap(c => [c.atFrame, c.atFrame + lengthFrames(c)])])].sort((a, b) => a - b);
  const pictures: LayeredBundle['pictures'] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i], end = boundaries[i + 1];
    const cut = plan.cutaways.find(c => c.atFrame <= start && c.atFrame + lengthFrames(c) >= end);
    const original = base.clips.find(c => c.startFrame <= start && c.startFrame + c.durationFrames >= end);
    const media = cut ? prepared.find(c => c.id === cut.id) : original;
    if (!media || (!cut && !original)) throw new Error('Incomplete prepared picture timeline');
    pictures.push({ id: `${cut ? 'cutaway' : 'base'}-${cut?.id ?? original!.id}-${start}`, path: cut ? media.path : `base/${media.path}`,
      sourceIn: (start - (cut?.atFrame ?? original!.startFrame)) / 30, startFrame: start, durationFrames: end - start, sha256: media.sha256 });
  }
  return pictures;
}

function composition(bundle: LayeredBundle, root: string) {
  const pictures = bundle.pictures.map(c => ({ ...c, path: join(root, c.path).replaceAll('\\', '/') }));
  return `// Picture-only cutaways; uninterrupted base audio. Recipe: layered-plan.json.\nconst pictures=${JSON.stringify(pictures)};\nexport default function Edit(){return <rect scene="layered-journal" name={${JSON.stringify(bundle.name)}} width={${bundle.width}} height={${bundle.height}} end={${bundle.duration}} fill="#121A1A"><sequence>{pictures.map(c=><video name={c.id} src={c.path} start={c.startFrame/30} sourceIn={c.sourceIn} sourceOut={c.sourceIn+c.durationFrames/30} width={${bundle.width}} height={${bundle.height}} muted={true} objectFit="contain"/>)}</sequence><audio name="Original voice and natural sound" src={${JSON.stringify(join(root, bundle.audio.path).replaceAll('\\', '/'))}} start={0} sourceIn={0} sourceOut={${bundle.duration}}/></rect>;}\n`;
}

export async function prepareLayered(input: unknown, options: { output: string; baseDirectory: string; signal?: AbortSignal; onProgress?: (message: string) => void }) {
  const report = checkLayered(input);
  if (!report.technicalPass) throw new Error(report.errors.join('; '));
  const plan = layeredPlanSchema.parse(input);
  // A new export must never inherit a previous preview approval.
  plan.basePlan.review = { previewInspected: false, reviewer: '', checks: [] };
  const root = resolve(options.output), signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(3600000)]) : AbortSignal.timeout(3600000);
  const sources = new Map<string, { path: string; info: Awaited<ReturnType<typeof stat>>; media: Awaited<ReturnType<typeof probe>> }>();
  for (const source of plan.basePlan.sources.filter(s => plan.cutaways.some(c => c.sourceId === s.id))) {
    const path = await realpath(resolve(options.baseDirectory, source.path)), info = await stat(path);
    if (!info.isFile() || info.size > 16 * 1024 ** 3) throw new Error('Cutaway source must be a local file <=16 GiB');
    if (await fingerprint(path, signal) !== source.sha256) throw new Error(`${source.id}: source changed; reinspect it`);
    const media = await probe(path, signal); await probePortraitSource(path, signal);
    if (media.duration > 7200 || plan.cutaways.some(c => c.sourceId === source.id && c.out > media.duration + .001)) throw new Error(`${source.id}: actual source bounds exceeded`);
    sources.set(source.id, { path, info, media });
  }
  await mkdir(dirname(root), { recursive: true });
  await mkdir(root); // Exclusive directory creation: retain diagnostics if preparation fails.
  await prepareDelivery(plan.basePlan, { ...options, output: join(root, 'base'), settings: plan.settings, signal });
  const { bundle: base } = await readDeliveryBundle(join(root, 'base'), signal);
  await mkdir(join(root, 'cutaways')); await mkdir(join(root, 'audio'));
  const prepared: LayeredBundle['cutaways'] = [];
  for (const cut of plan.cutaways) {
    options.onProgress?.(`Preparing silent cutaway: ${cut.id}`);
    const source = sources.get(cut.sourceId)!, path = `cutaways/${cut.id}.mp4`;
    const filter = `[0:v:0]setpts=PTS-(${source.media.startTime})/TB,trim=start=${cut.in}:end=${cut.out},setpts=PTS-(${cut.in})/TB,scale=${base.width}:${base.height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${base.width}:${base.height}:(ow-iw)/2:(oh-ih)/2:color=0x121A1A,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${lengthFrames(cut) + 4},format=yuv420p[v]`;
    const filterPath = join(root, 'cutaways', `${cut.id}.filter.txt`);
    await writeFile(filterPath, filter, { flag: 'wx' });
    await runMedia(['-v', 'error', '-nostdin', '-n', '-copyts', '-ss', String(Math.max(0, source.media.startTime + cut.in - source.media.containerStartTime - 1)),
      '-protocol_whitelist', 'file,pipe', '-i', source.path, '-filter_complex_script', filterPath, '-map', '[v]', '-an', '-map_metadata', '-1',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-movflags', '+faststart', join(root, path)], { signal });
    // A successful encode can contain no frames when a tiny trim falls between source PTS.
    const outputProbe = await probe(join(root, path), signal);
    const decoded = JSON.parse((await runMedia(['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries',
      'stream=nb_read_frames', '-of', 'json', '-protocol_whitelist', 'file,pipe', join(root, path)],
      { binary: process.env.FFPROBE_PATH || 'ffprobe', signal })).toString());
    if (outputProbe.width !== base.width || outputProbe.height !== base.height ||
      Number(decoded.streams?.[0]?.nb_read_frames) !== lengthFrames(cut) + 4) throw new Error(`${cut.id}: incomplete decoded cutaway; choose a source range containing actual frames`);
    prepared.push({ id: cut.id, path, sha256: await fingerprint(join(root, path), signal) });
  }
  options.onProgress?.('Keeping the original voice/natural sound on an independent uninterrupted track');
  // Decode each base clip once to a bounded stem; concat exactly its planned frames, excluding its video tail handles.
  const stems: string[] = [];
  for (const [i, clip] of base.clips.entries()) {
    const path = join(root, 'audio', `stem-${i}.wav`); stems.push(path);
    await runMedia(['-v', 'error', '-nostdin', '-n', '-protocol_whitelist', 'file,pipe', '-i', join(root, 'base', clip.path), '-vn',
      '-af', `aresample=48000:first_pts=0,apad,atrim=end_sample=${clip.durationFrames * 1600},asetpts=PTS-STARTPTS`,
      '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', path], { signal });
  }
  // Paths are generated by us; no user path strings are interpolated into concat syntax.
  const concatFile = join(root, 'audio', 'stems.ffconcat');
  await writeFile(concatFile, `ffconcat version 1.0\n${stems.map((_, i) => `file stem-${i}.wav`).join('\n')}\n`, { flag: 'wx' });
  const audioPath = 'audio/source-continuity.wav';
  await runMedia(['-v', 'error', '-nostdin', '-n', '-f', 'concat', '-safe', '1', '-protocol_whitelist', 'file,pipe', '-i', concatFile,
    '-c:a', 'copy', join(root, audioPath)], { signal });
  for (const [id, source] of sources) {
    const after = await stat(source.path);
    if (after.size !== source.info.size || after.mtimeMs !== source.info.mtimeMs) throw new Error(`${id}: source changed during preparation`);
  }
  const planPath = join(root, 'layered-plan.json');
  await writeFile(planPath, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
  const bundle: LayeredBundle = { schemaVersion: 1, kind: 'editor-layered-bundle', name: base.name, fps: 30, width: base.width, height: base.height,
    frames: base.frames, duration: base.duration, planSha256: await fingerprint(planPath, signal), baseManifestSha256: jsonHash(base),
    compositionSha256: '0'.repeat(64), cutaways: prepared, pictures: visiblePictures(plan, base, prepared),
    audio: { path: audioPath, sha256: await fingerprint(join(root, audioPath), signal) }, chapters: base.chapters };
  await writeFile(join(root, 'edit.tsx'), composition(bundle, root), { flag: 'wx' });
  bundle.compositionSha256 = await fingerprint(join(root, 'edit.tsx'), signal);
  await writeFile(join(root, 'layered-bundle.json'), JSON.stringify(layeredBundleSchema.parse(bundle), null, 2) + '\n', { flag: 'wx' });
  return { root, bundle, reviewRequired: true, safeToAutoPublish: false, aiCalls: 0, musicAdded: false,
    limitations: ['V1 is silent B-roll over continuous original voice/ambience. No music or ducking.',
      'Sound is a prepared continuous WAV; original stems and the source recipe remain in this bundle. Reprepare to change sound timing.'] };
}

export async function readLayeredBundle(directory: string, signal?: AbortSignal) {
  const root = await realpath(resolve(directory));
  const read = async (path: string) => { const info = await stat(path); if (!info.isFile() || info.size > 8000000) throw new Error('Expected bounded JSON file'); return JSON.parse(await readFile(path, 'utf8')); };
  const bundle = layeredBundleSchema.parse(await read(join(root, 'layered-bundle.json')));
  const plan = layeredPlanSchema.parse(await read(join(root, 'layered-plan.json')));
  const report = checkLayered(plan); if (!report.technicalPass) throw new Error(report.errors.join('; '));
  if (await fingerprint(join(root, 'layered-plan.json'), signal) !== bundle.planSha256 || await fingerprint(join(root, 'edit.tsx'), signal) !== bundle.compositionSha256)
    throw new Error('Layered plan/composition changed; prepare a new bundle');
  const baseRoot = await realpath(join(root, 'base'));
  if (!baseRoot.startsWith(root + sep)) throw new Error('Base bundle escaped the layered directory');
  const { bundle: base } = await readDeliveryBundle(baseRoot, signal);
  const basePlan = planSchema.parse(await read(join(baseRoot, 'plan.json')));
  if (jsonHash(base) !== bundle.baseManifestSha256 || jsonHash(basePlan) !== jsonHash(plan.basePlan) ||
    ['name', 'width', 'height', 'fps', 'frames', 'duration'].some(key => bundle[key as keyof LayeredBundle] !== base[key as keyof DeliveryBundle]) ||
    jsonHash(bundle.chapters) !== jsonHash(base.chapters)) throw new Error('Base bundle does not match layered plan');
  if (bundle.cutaways.length !== plan.cutaways.length || bundle.cutaways.some((c, i) => c.id !== plan.cutaways[i].id || c.path !== `cutaways/${c.id}.mp4`) ||
    jsonHash(bundle.pictures) !== jsonHash(visiblePictures(plan, base, bundle.cutaways))) throw new Error('Picture mapping differs from the layered recipe');
  const files = [...bundle.cutaways, bundle.audio];
  for (const file of files) {
    const path = await realpath(join(root, file.path));
    if (!path.startsWith(root + sep) || await fingerprint(path, signal) !== file.sha256) throw new Error('Layered prepared media changed or escaped bundle');
  }
  if (await readFile(join(root, 'edit.tsx'), 'utf8') !== composition(bundle, root)) throw new Error('Layered composition differs from generated recipe');
  return { root, bundle, plan, base };
}
