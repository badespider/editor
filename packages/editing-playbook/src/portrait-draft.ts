import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { clipCollectionSchema } from './clip-schema.ts';
import { checkClips, jsonHash } from './clips.ts';
import type { ClipContext } from './clips.ts';
import { portraitRecipeSchema, portraitSampleFrames, portraitVideoFilter, validatePortraitGeometry } from './portrait-schema.ts';
import { mobileOutputSchema } from './mobile.ts';
import { loadMobileAssets, writeMobileAssets } from './mobile-node.ts';
import { probePortraitSource } from './delivery.ts';
import { fingerprint, probe } from './preview.ts';
import { runMedia } from './media-process.ts';

/** A separate preview contract. Never manufactures an accepted source/framing review. */
export function checkPortraitDraft(input: unknown, context: ClipContext, candidateId: string, recipeInput: unknown,
  geometry: {width:number;height:number}) {
  const collection = clipCollectionSchema.parse(input), recipe = portraitRecipeSchema.parse(recipeInput);
  const selection = checkClips(collection, context).results.find(c => c.id === candidateId);
  const candidate = collection.candidates.find(c => c.id === candidateId);
  if (!selection || !candidate) throw new Error('Unknown draft candidate');
  const errors = [...selection.errors, ...validatePortraitGeometry(recipe)];
  if (geometry.width !== recipe.sourceWidth || geometry.height !== recipe.sourceHeight) errors.push('Source geometry changed');
  if (recipe.frames !== Math.ceil((candidate.range.end - candidate.range.start) * 30 - 1e-7)) errors.push('Draft frame count differs from selected range');
  const artifacts = context.inspections.flatMap(i => i.artifacts);
  const needs = [...selection.needs, 'Draft speech, framing, captions and actual output still require review'];
  for (const [i, shot] of recipe.shots.entries()) {
    if (shot.evidenceIds.some(id => !artifacts.some(a => a.id === id))) errors.push(`Shot ${i}: unknown evidence artifact`);
    if (!shot.reason || !shot.evidenceIds.length) needs.push(`Shot ${i}: framing explanation/evidence is missing`);
    const cited = artifacts.filter(a => shot.evidenceIds.includes(a.id));
    for (const frame of portraitSampleFrames(recipe).filter(f => f >= shot.startFrame && f < shot.endFrame)) {
      const time = candidate.range.start + frame / 30;
      if (!cited.some(a => a.kind === 'clip' ? a.start <= time && a.end > time : a.kind === 'frame' && Math.abs(a.start-time) <= 1/30+.001)) {
        needs.push(`Shot ${i}: source sample at ${time.toFixed(6)}s remains to be inspected`);
      }
    }
  }
  if (errors.length) throw new Error(`Invalid draft: ${errors.join('; ')}`);
  return { collection, candidate, recipe, selection, needs, status: 'unreviewed_draft' as const,
    reviewRequired: true as const, safeToAutoPublish: false as const, externalModelCalls: 0 as const };
}

async function absent(path: string) {
  try { await lstat(path); throw new Error(`Output already exists: ${path}`); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

/** Local, explicitly unapproved portrait preview using the production crop/caption primitives. */
export async function exportPortraitDraft(input: unknown, context: ClipContext, candidateId: string, recipeInput: unknown,
  options: {output:string; acknowledgeUnreviewed:boolean; mobile:unknown; warnings?:string[]; signal?:AbortSignal}) {
  if (options.acknowledgeUnreviewed !== true) throw new Error('Explicit --acknowledge-unreviewed is required');
  const output = resolve(options.output);
  if (!/[._-]draft\.mp4$/i.test(basename(output))) throw new Error('Draft filename must end in _DRAFT.mp4 or .draft.mp4');
  const root = `${output}.draft-assets`, reportPath = `${output}.draft.json`;
  for (const path of [output, root, reportPath]) await absent(path);
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(1_800_000)]) : AbortSignal.timeout(1_800_000);
  const sourcePath = await realpath(context.source.path), before = await stat(sourcePath);
  if (!before.isFile() || before.size > 16 * 1024 ** 3) throw new Error('Draft source must be a regular local file at most 16 GiB');
  if (await fingerprint(sourcePath, signal) !== context.source.sha256) throw new Error('Source changed; reinspect it');
  const media = await probe(sourcePath, signal), geometry = await probePortraitSource(sourcePath, signal);
  const checked = checkPortraitDraft(input, context, candidateId, recipeInput, geometry);
  const {recipe, candidate} = checked, {start, end} = candidate.range;
  if (media.duration > 7200 || end > media.duration + .001) throw new Error('Source duration/bounds exceeded');
  if (media.hasAudio !== context.audio.hasTrack) throw new Error('Source audio-track state changed');
  const mobile = mobileOutputSchema.parse(options.mobile);
  const assets = await loadMobileAssets(mobile, recipe, true, signal);
  const duration = recipe.frames / 30;
  // A distinct, exclusively created work directory is retained even on failure for diagnosis.
  await mkdir(dirname(output), {recursive:true}); await mkdir(root);
  await writeMobileAssets(root, mobile, assets);
  const prefix = `[0:v:0]setpts=PTS-(${media.startTime})/TB,trim=start=${start}:end=${end},setpts=PTS-(${start})/TB,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${recipe.frames}[portrait-input];`;
  const picture = prefix + portraitVideoFilter(recipe, 'portrait-input', 'draft-picture') +
    `;[draft-picture]${assets?'subtitles=filename=mobile-assets/captions.ass:fontsdir=mobile-assets/fonts,':''}trim=end_frame=${recipe.frames},format=yuv420p[v]`;
  const sound = media.hasAudio ?
    `[0:a:0]asetpts=PTS-(${media.startTime})/TB,aresample=48000:async=1:first_pts=0,atrim=start=${start}:end=${end},asetpts=PTS-(${start})/TB,aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=duration=${duration}[a]` :
    `anullsrc=r=48000:cl=stereo,atrim=duration=${duration}[a]`;
  const filter = join(root, 'draft.filter.txt'), staged = join(root, 'render_DRAFT.mp4');
  await writeFile(filter, `${picture};${sound}`, {flag:'wx'});
  await writeFile(join(root, 'request.json'), JSON.stringify({kind:'portrait-draft-request',status:'unreviewed_draft',
    collection:checked.collection,candidateId,recipe,mobile,needs:checked.needs}, null, 2), {flag:'wx'});
  await runMedia(['-v','error','-nostdin','-n','-copyts','-ss',String(Math.max(0,media.startTime+start-media.containerStartTime-1)),
    '-protocol_whitelist','file,pipe','-i',sourcePath,'-filter_complex_threads','2','-filter_complex_script',filter,
    '-map','[v]','-map','[a]','-map_metadata','-1','-metadata','comment=UNREVIEWED DRAFT - not approved for publication',
    '-c:v','libx264','-threads','4','-preset','veryfast','-crf','20','-c:a','aac','-b:a','192k','-movflags','+faststart',staged],{signal,cwd:root});
  const rendered = await probe(staged, signal);
  if (rendered.width !== recipe.width || rendered.height !== recipe.height || !rendered.hasAudio || Math.abs(rendered.duration-duration)>1/30+.001) {
    throw new Error('Draft output geometry, duration or audio track differs from request');
  }
  await runMedia(['-v','error','-xerror','-nostdin','-i',staged,'-map','0:v:0','-map','0:a:0','-f','null','-'],{signal});
  const after = await stat(sourcePath);
  if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error('Source changed while rendering draft');
  const report = {schemaVersion:1,kind:'portrait-draft-export',status:'unreviewed_draft',path:output,
    sha256:await fingerprint(staged,signal),source:checked.collection.source,range:candidate.range,
    candidateId,candidateSha256:checked.selection.candidateSha256,collectionSha256:jsonHash(checked.collection),recipe,mobile,
    duration,width:recipe.width,height:recipe.height,fps:30,decodePassed:true,reviewRequired:true,safeToAutoPublish:false,
    externalModelCalls:0,needs:checked.needs,warnings:[...checked.selection.warnings,...(options.warnings??[])],
    limitation:'Local draft encoder, not an actual desktop export or accepted source/framing/render review. No approval is created or inherited.'};
  await copyFile(staged, output, constants.COPYFILE_EXCL);
  await writeFile(reportPath, JSON.stringify(report,null,2)+'\n', {flag:'wx'});
  return {...report,reportPath};
}
