import { copyFile, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { z } from 'zod';
import { AgentEvidenceService } from '@diffusionstudio/video-understanding/agent';
import { ReferenceAnalysisService } from '@diffusionstudio/video-understanding/reference';
import {validateReferenceDesign} from '@diffusionstudio/video-understanding/reference-design';
import { fingerprint, probe } from './preview.ts';
import { probePortraitSource } from './delivery.ts';
import { runMedia } from './media-process.ts';
import { exists, readSeal, save } from './motion-workflow.ts';
import { adaptScene, motionDigest, reviewScene, sceneCorrectionSchema, type SceneAdaptation } from './scene-motion.ts';
import { sceneComposition } from './scene-composition.ts';
import { preflightScene, scanSceneFrames } from './scene-quality.ts';
import { sceneSegments, renderSceneSegments, type SegmentRenderer } from './scene-cache.ts';
import { sceneMeasurementSchema, compareTrackedMotion, captureSceneGolden, compareSceneGoldens } from './scene-precision.ts';
export { sceneMeasurementSchema, goldenRequestSchema } from './scene-precision.ts';
export { reflowSceneLayout, sceneLayoutOptionsSchema } from './scene-layout.ts';
export { verifySceneSegment } from './scene-cache.ts';
export { preflightScene } from './scene-quality.ts';

type Evidence = { id: string; path: string; sha256: string; kind: 'frame' | 'audio'; role: 'reference' | 'render'; time?: number };
type Job = { maxCorrections: number; styleSha256: string; sourceSha256: string; externalModelCalls: 0 };
type Revision = { index: number; adaptation: SceneAdaptation; parentReviewSha256: string | null; reason: string;
  prepared: { audio: string; media: Record<string, string> }; preparedHashes: Record<string, string>; codeSha256: string; references: Evidence[] };
type Inspection = { renderSha256: string; revisionSha256: string; sessionId: string; evidence: Evidence[]; contactSheets: string[];
  quality?: { preflight: ReturnType<typeof preflightScene>; motion: ReturnType<typeof scanSceneFrames> } };
const bounded = (signal?: AbortSignal) => AbortSignal.any([AbortSignal.timeout(300000), ...(signal ? [signal] : [])]);

/** Source-bound scene previews. The host agent supplies interpretation and explicit comparison findings. */
export class SceneWorkflow {
  readonly root: string;
  readonly evidence: AgentEvidenceService;
  constructor(directory: string) { this.root = resolve(directory); this.evidence = new AgentEvidenceService(join(this.root, 'evidence')); }
  private folder(index: number) { return join(this.root, `revision-${index}`); }
  private async job() { return (await readSeal<Job>(join(this.root, 'job.json'))).value; }
  private async current() {
    const job = await this.job(); let index = -1;
    for (let i = 0; i <= job.maxCorrections; i++) {
      if (!(await exists(this.folder(i)))) break;
      if (!(await exists(join(this.folder(i), 'revision.json')))) throw Error(`Incomplete scene revision ${i}; inspect retained diagnostics`);
      index = i;
    }
    if (index < 0) throw Error('No prepared scene revision');
    const record = await readSeal<Revision>(join(this.folder(index), 'revision.json'));
    if (record.value.index !== index || motionDigest(adaptScene(record.value.adaptation.recipe, record.value.adaptation.input)) !== motionDigest(record.value.adaptation)) throw Error('Scene adaptation changed');
    if (motionDigest(record.value.adaptation.recipe.style) !== job.styleSha256) throw Error('Reference requirements changed during corrections');
    return { ...record, directory: this.folder(index) };
  }
  private async referenceEvidence(adaptation: SceneAdaptation, signal?: AbortSignal) {
    const artifacts: Evidence[] = [];
    for (const ref of adaptation.recipe.style.references) {
      const service = new ReferenceAnalysisService(ref.cache), seq = await service.sequence(ref.sessionId, ref.sequenceId);
      if (seq.sequenceSha256 !== ref.sequenceSha256 || await fingerprint(seq.source.path, signal) !== seq.source.sha256) throw Error('Reference source/sequence changed');
      if (ref.inspectedFrames.length !== seq.frames.length || seq.frames.some(f => !ref.inspectedFrames.includes(f.index))) throw Error('Inspect every frame in each bounded reference sequence');
      const detailed=adaptation.recipe.style.design?.find(d=>d.referenceId===ref.id);
      if(detailed)validateReferenceDesign(detailed.analysis,seq);
      const cited = new Set(adaptation.recipe.style.criteria.flatMap(c => c.evidence.filter(e => e.referenceId === ref.id).flatMap(e => e.frames)));
      for (let from = 0; from < seq.frames.length; from += 24) {
        const page = await service.page(ref.sessionId, ref.sequenceId, { from, count: Math.min(24, seq.frames.length - from) }, signal);
        for (const f of page.artifacts) if (cited.has(f.index)) artifacts.push({ id: `ref-${ref.id}-${f.index}`, path: f.path, sha256: f.sha256, kind: 'frame', role: 'reference', time: f.time });
      }
    }
    return artifacts;
  }
  private async sources(adaptation: SceneAdaptation, signal: AbortSignal) {
    const result = new Map<string, { path: string; media: Awaited<ReturnType<typeof probe>> | null; width: number; height: number }>();
    for (const a of adaptation.input.assets) {
      const path = await realpath(resolve(a.path)), info = await stat(path);
      if (!info.isFile() || info.size > (a.kind === 'video' ? 16 * 1024 ** 3 : 32 * 1024 ** 2)) throw Error('Media size exceeds bounded local limits');
      if (await fingerprint(path, signal) !== a.sha256) throw Error(`Source changed: ${a.id}`);
      if (a.kind === 'image') {
        if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extname(path).toLowerCase())) throw Error('Use a local raster image');
        const image = JSON.parse((await runMedia(['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json','-protocol_whitelist','file,pipe',path],
          { binary: process.env.FFPROBE_PATH || 'ffprobe', signal })).toString()).streams?.[0];
        if (!image?.width || !image?.height || image.width * image.height > 16_777_216) throw Error('Image dimensions exceed the 16-megapixel budget');
        result.set(a.id, { path, media: null, width: image.width, height: image.height }); continue;
      }
      const media = await probe(path, signal); await probePortraitSource(path, signal);
      if (media.duration > 7200) throw Error('Source exceeds two hours');
      const color = JSON.parse((await runMedia(['-v','error','-select_streams','v:0','-show_entries','stream=color_transfer','-of','json','-protocol_whitelist','file,pipe',path],
        { binary: process.env.FFPROBE_PATH || 'ffprobe', signal })).toString());
      if (['smpte2084','arib-std-b67'].includes(color.streams?.[0]?.color_transfer)) throw Error('Convert HDR explicitly before scene adaptation');
      result.set(a.id, { path, media, width: media.width, height: media.height });
    }
    const audio = result.get(adaptation.input.audio.assetId)!;
    if (!audio.media?.hasAudio || adaptation.input.audio.end > audio.media.duration + .001) throw Error('Narration requires an existing in-range audio track');
    for (const s of adaptation.input.shots) for (const b of s.bindings) {
      const source = result.get(b.assetId)!;
      if (source.media && b.sourceIn + s.end - s.start > source.media.duration + .001) throw Error('Shot binding exceeds source duration');
      const crop = b.crop ?? { width: 1, height: 1 };
      const ratio = source.width * crop.width / (source.height * crop.height);
      for (const layer of adaptation.recipe.templates.find(t => t.id === s.templateId)!.layers.filter(l => l.slot === b.slot)) {
        let width = layer.pose.width, height = layer.pose.height;
        for (const p of [layer.pose, ...layer.keys.map(k => k.pose)]) {
          width = p.width ?? width; height = p.height ?? height;
          if (Math.abs((width * adaptation.input.width / (height * adaptation.input.height)) / ratio - 1) > .02)
            throw Error('Media aspect ratio would be distorted; author a matching crop or an aspect-preserving layer box');
        }
      }
    }
    return result;
  }
  async create(recipe: unknown, input: unknown, maxCorrections = 2, cancellation?: AbortSignal) {
    const adaptation = adaptScene(recipe, input), signal = bounded(cancellation);
    z.number().int().min(0).max(4).parse(maxCorrections);
    const references = await this.referenceEvidence(adaptation, signal); await this.sources(adaptation, signal);
    await mkdir(dirname(this.root), { recursive: true }); await mkdir(this.root);
    await save(join(this.root, 'job.json'), { maxCorrections, styleSha256: motionDigest(adaptation.recipe.style),
      sourceSha256: motionDigest({ assets: adaptation.input.assets, audio: adaptation.input.audio, transcript: adaptation.input.transcript }), externalModelCalls: 0 } satisfies Job);
    return this.prepare(adaptation, references, 0, null, adaptation.recipe.style.basis === 'catalog' ? 'Initial catalog adaptation; fresh review required'
      : adaptation.recipe.style.basis === 'brief' ? 'Initial user-brief adaptation; fresh review required' : 'Initial reference-led scene adaptation', signal);
  }
  private async prepare(adaptation: SceneAdaptation, references: Evidence[], index: number, parentReviewSha256: string | null, reason: string, cancellation?: AbortSignal) {
    const signal = bounded(cancellation), sources = await this.sources(adaptation, signal), folder = this.folder(index);
    await mkdir(folder);
    const prepared = { audio: join(folder, 'narration.wav'), media: {} as Record<string, string> };
    const audio = sources.get(adaptation.input.audio.assetId)!, start = adaptation.input.audio.start;
    await runMedia(['-v','error','-nostdin','-n','-copyts','-ss',String(Math.max(0, audio.media!.startTime + start - audio.media!.containerStartTime - 1)),
      '-protocol_whitelist','file,pipe','-i',audio.path,'-vn','-af',`asetpts=PTS-(${audio.media!.startTime})/TB,aresample=48000:async=1:first_pts=0,atrim=start=${start}:end=${adaptation.input.audio.end},asetpts=PTS-(${start})/TB,aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=duration=${adaptation.duration}`,
      '-c:a','pcm_s16le',prepared.audio], { signal });
    for (const shot of adaptation.input.shots) for (const binding of shot.bindings) {
      const src = sources.get(binding.assetId)!, key = `${shot.id}/${binding.slot}`;
      const path = join(folder, `${shot.id}-${binding.slot}${src.media ? '.mp4' : extname(src.path)}`); prepared.media[key] = path;
      if (!src.media) {
        if (binding.crop) {
          const b = binding.crop, w = Math.max(1, Math.floor(src.width*b.width)), h = Math.max(1, Math.floor(src.height*b.height));
          await runMedia(['-v','error','-nostdin','-n','-protocol_whitelist','file,pipe','-i',src.path,'-vf',
            `crop=${w}:${h}:${Math.floor(src.width*b.x)}:${Math.floor(src.height*b.y)}`,'-frames:v','1',path], { signal });
        } else await copyFile(src.path, path);
        continue;
      }
      const crop = binding.crop ?? { x: 0, y: 0, width: 1, height: 1 }, m = src.media, t = binding.sourceIn;
      const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
      const cw = even(m.width * crop.width), ch = even(m.height * crop.height), cx = Math.floor(m.width * crop.x / 2) * 2, cy = Math.floor(m.height * crop.y / 2) * 2;
      // Non-frame-aligned source trims can retain a positive first PTS and lose
      // the last output frame. Fill only the bounded edge gap, then seal exact
      // zero-based CFR timestamps/count so editor picture spans the whole shot.
      const frames = Math.round((shot.end - shot.start) * 30);
      const filter = `setpts=PTS-(${m.startTime})/TB,trim=start=${t}:end=${t + shot.end - shot.start},setpts=PTS-(${t})/TB,crop=${cw}:${ch}:${cx}:${cy},scale=w='min(iw,1920)':h=-2,setsar=1,fps=30:start_time=0,tpad=stop_mode=clone:stop_duration=0.066666667,trim=end_frame=${frames},setpts=N/(30*TB),format=yuv420p`;
      await runMedia(['-v','error','-nostdin','-n','-copyts','-ss',String(Math.max(0,m.startTime + t - m.containerStartTime - 1)),
        '-protocol_whitelist','file,pipe','-i',src.path,'-vf',filter,'-an','-map_metadata','-1','-t',String(shot.end-shot.start),'-c:v','libx264','-preset','veryfast','-crf','17','-movflags','+faststart',path], { signal });
      const actual = await probe(path, signal);
      const picture = JSON.parse((await runMedia(['-v','error','-select_streams','v:0','-show_entries','stream=start_time,nb_frames','-of','json',path],
        { binary: process.env.FFPROBE_PATH || 'ffprobe', signal })).toString()).streams?.[0];
      if (Math.abs(actual.duration - (shot.end - shot.start)) > .001 || Number(picture?.nb_frames) !== frames || Number(picture?.start_time) !== 0)
        throw Error('Incomplete prepared shot');
    }
    await this.sources(adaptation, signal);
    const code = sceneComposition(adaptation, prepared); await writeFile(join(folder, 'edit.tsx'), code, { flag: 'wx' });
    const preparedHashes: Record<string, string> = {};
    for (const path of [prepared.audio, ...Object.values(prepared.media)]) preparedHashes[path] = await fingerprint(path, signal);
    await save(join(folder, 'revision.json'), { index, adaptation, parentReviewSha256, reason, prepared, preparedHashes,
      codeSha256: motionDigest(code), references } satisfies Revision);
    await save(join(folder, 'preflight.json'), preflightScene(adaptation));
    return this.next();
  }
  private async latestReview(directory: string) {
    let record: (Awaited<ReturnType<typeof readSeal<ReturnType<typeof reviewScene>>>> & { number: number }) | null = null;
    for (let i = 0; i < 8; i++) { const path = join(directory, i ? `review-${i}.json` : 'review.json');
      if (!(await exists(path))) break; record = { ...await readSeal<ReturnType<typeof reviewScene>>(path), number: i }; }
    return record;
  }
  async next(): Promise<unknown> {
    const current = await this.current(), job = await this.job();
    const inspectionPath = join(current.directory, 'inspection.json');
    if (!(await exists(inspectionPath))) return { stage: await exists(join(current.directory, 'preview_DRAFT.mp4')) ? 'needs_inspection'
      : await exists(join(current.directory, 'render-attempt.json')) ? 'render_interrupted_inspect_diagnostics' : 'needs_render',
      directory: current.directory, revisionSha256: current.sha256, warnings: current.value.adaptation.warnings,
      preflight: preflightScene(current.value.adaptation), externalModelCalls: 0 };
    const inspection = await readSeal<Inspection>(inspectionPath);
    if (inspection.value.revisionSha256 !== current.sha256 || await fingerprint(join(current.directory, 'preview_DRAFT.mp4')) !== inspection.value.renderSha256) throw Error('Render or inspection changed');
    const review = await this.latestReview(current.directory);
    if (review && (review.value.revisionSha256 !== current.sha256 || review.value.inspectionSha256 !== inspection.sha256)) throw Error('Stale stored review');
    return { stage: review?.value.status ?? (current.value.adaptation.recipe.style.basis === 'catalog' ? 'needs_template_review'
      : current.value.adaptation.recipe.style.basis === 'brief' ? 'needs_brief_review' : 'needs_reference_comparison'),
      inspectionSha256: inspection.sha256, ...inspection.value, review: review?.value, reviewSha256: review?.sha256,
      criteria: current.value.adaptation.recipe.style.criteria, remainingCorrections: job.maxCorrections-current.value.index,
      instruction: current.value.adaptation.recipe.style.basis === 'brief'
        ? 'Inspect every supplied render frame against the user brief. Cite render evidence; referenceEvidenceIds stay empty. Listen or mark speech/audio unknown. Brief conformance is not reference matching or publication approval.'
        : current.value.adaptation.recipe.style.basis === 'catalog'
        ? 'Inspect every supplied render frame against every pinned template requirement. Cite render evidence; referenceEvidenceIds stay empty. Listen or mark speech/audio unknown. Template reuse is not original-reference matching or inherited approval.'
        : 'Inspect every provided frame; compare each essential reference criterion. Listen or mark speech/audio unknown. Good encoding/readability alone does not establish style fidelity.', safeToAutoPublish: false };
  }
  async renderContext(signal?: AbortSignal) {
    const current = await this.current(); await this.sources(current.value.adaptation, bounded(signal));
    for (const [path, hash] of Object.entries(current.value.preparedHashes)) if (await fingerprint(path, signal) !== hash) throw Error('Prepared scene media changed');
    const code = await readFile(join(current.directory, 'edit.tsx'), 'utf8');
    if (motionDigest(code) !== current.value.codeSha256 || code !== sceneComposition(current.value.adaptation, current.value.prepared)) throw Error('Generated composition changed; correct recipe instead');
    return { ...current, output: join(current.directory, 'preview_DRAFT.mp4'), bundle: { name: `Scene motion DRAFT ${current.value.index}`,
      height: current.value.adaptation.input.height, fps: 30 as const, chapters: [] } };
  }
  async claimRender(signal?: AbortSignal) { const context = await this.renderContext(signal);
    await save(join(context.directory, 'render-attempt.json'), { revisionSha256: context.sha256, instruction: 'One attempt. Inspect interrupted exports before any retry.' }); return context; }
  async renderIncremental(rendererId: string, render: SegmentRenderer, signal?: AbortSignal, onProgress?: (message:string)=>void) {
    const c = await this.claimRender(signal);
    const result = await renderSceneSegments({root:this.root,directory:c.directory,
      segments:sceneSegments(c.value.adaptation,c.value.prepared,c.value.preparedHashes,rendererId),audio:c.value.prepared.audio,
      duration:c.value.adaptation.duration,render,signal,onProgress,verify:path=>this.verifyRender(path,signal)});
    await this.renderContext(signal); // Retain full source/prepared/composition integrity gates.
    return result;
  }
  async verifyRender(path: string, cancellation?: AbortSignal) {
    const signal = bounded(cancellation), c = await this.current(), a = c.value.adaptation, actual = await probe(path, signal);
    await runMedia(['-v','error','-xerror','-nostdin','-protocol_whitelist','file,pipe','-i',path,'-f','null','-'], { signal });
    const stream = JSON.parse((await runMedia(['-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=nb_read_frames,avg_frame_rate','-of','json','-protocol_whitelist','file,pipe',path],
      { binary: process.env.FFPROBE_PATH || 'ffprobe', signal })).toString()).streams?.[0];
    const checks = { dimensions: actual.width===a.input.width && actual.height===a.input.height, duration: Math.abs(actual.duration-a.duration)<=1/30+.001,
      frames: Number(stream?.nb_read_frames)===Math.round(a.duration*30) && stream?.avg_frame_rate==='30/1', audio: actual.hasAudio };
    return { technicalPass: Object.values(checks).every(Boolean), checks, sha256: await fingerprint(path, signal), limitation: 'Technical only, not style fidelity or listening.' };
  }
  async inspect(cancellation?: AbortSignal) {
    const signal = bounded(cancellation), c = await this.renderContext(signal);
    if (await exists(join(c.directory, 'inspection.json'))) throw Error('Inspection exists; resume with next');
    const technical = await this.verifyRender(c.output, signal); if (!technical.technicalPass) throw Error('Technical render failure');
    const session = await this.evidence.open({ path: c.output, goal: 'Reference scene fidelity review', overviewCount: 1 }, signal);
    const preflight=preflightScene(c.value.adaptation);
    const pixels=await runMedia(['-v','error','-xerror','-nostdin','-i',c.output,'-an','-vf','scale=96:96,format=gray','-fps_mode','passthrough','-f','rawvideo','-'],
      {signal,limit:preflight.frames*96*96+96*96});
    const motion=scanSceneFrames(pixels,96*96,preflight);
    const diagnosticFrames=[...preflight.boundaryFrames,...preflight.findings.flatMap(f=>[f.firstFrame,f.lastFrame]),
      ...motion.suspectedStalls.flatMap(f=>[f.firstFrame-1,f.firstFrame,f.lastFrame])];
    const evidence: Evidence[] = [...c.value.references], contactSheets: string[] = [], times = [...new Set([
      ...c.value.adaptation.previewSamples,...diagnosticFrames.map(f=>f/30)])].sort((a,b)=>a-b);
    for (let i=0;i<times.length;i+=24) { const page = await this.evidence.inspect(session.id, { times: times.slice(i,i+24), native: true }, signal);
      if (page.contactSheet) contactSheets.push(page.contactSheet);
      for (const f of page.artifacts) if (f.kind==='frame') evidence.push({ id:f.id, path:f.path, sha256:await fingerprint(f.path,signal), role:'render', kind:'frame', time:f.start }); }
    const audio = await this.evidence.inspect(session.id, { start:0,end:c.value.adaptation.duration,count:1,audio:true },signal);
    for (const a of audio.artifacts.filter(a=>a.kind==='audio')) evidence.push({ id:a.id,path:a.path,sha256:await fingerprint(a.path,signal),role:'render',kind:'audio' });
    await save(join(c.directory,'inspection.json'),{ renderSha256:technical.sha256,revisionSha256:c.sha256,sessionId:session.id,evidence,contactSheets,quality:{preflight,motion} } satisfies Inspection);
    return this.next();
  }
  async measure(raw:unknown,cancellation?:AbortSignal){
    const request=sceneMeasurementSchema.parse(raw),signal=bounded(cancellation),c=await this.renderContext(signal);
    const technical=await this.verifyRender(c.output,signal);if(!technical.technicalPass)throw Error('Measure only technically verified renders');
    const inspection=await readSeal<Inspection>(join(c.directory,'inspection.json'));
    if(inspection.value.renderSha256!==technical.sha256)throw Error('Stale measurement render');
    if(new Set(request.targets.map(t=>t.id)).size!==request.targets.length)throw Error('Duplicate measurement ID');
    const service=new ReferenceAnalysisService(join(this.root,'evidence')),results=[];
    for(const target of request.targets){
      const shot=c.value.adaptation.input.shots.find(s=>s.id===target.shotId);
      if(!shot||target.start<shot.start||target.end>shot.end)throw Error('Measurement must stay inside its selected shot');
      if(!c.value.adaptation.recipe.templates.find(t=>t.id===shot.templateId)?.layers.some(l=>l.id===target.layerId))throw Error('Unknown measurement layer');
      const seq=await service.extract(inspection.value.sessionId,{start:target.start,end:target.end,maxFrames:120,maxDecodedMiB:1024},signal);
      const manifest=await service.sequence(seq.sessionId,seq.id),seed=manifest.frames.reduce((a,b)=>Math.abs(a.time-target.seedTime)<=Math.abs(b.time-target.seedTime)?a:b);
      const track=await service.track(seq.sessionId,seq.id,{from:0,count:manifest.frames.length,seedFrame:seed.index,box:target.box},signal);
      results.push({track,comparison:compareTrackedMotion(c.value.adaptation,target,track.measurements)});
    }
    if(await fingerprint(c.output,signal)!==technical.sha256)throw Error('Render changed during precision measurement');
    const value={revisionSha256:c.sha256,renderSha256:technical.sha256,request,results,safeToAutoPublish:false};
    const path=join(c.directory,`precision-${motionDigest(request)}.json`);
    if(await exists(path)){const stored=await readSeal<typeof value>(path);if(motionDigest(stored.value)!==motionDigest(value))throw Error('Stored precision measurement differs');return stored;}
    return save(path,value);
  }
  async golden(request:unknown,signal?:AbortSignal){const c=await this.renderContext(signal),technical=await this.verifyRender(c.output,signal);
    if(!technical.technicalPass)throw Error('Golden needs a verified render');return captureSceneGolden(c.output,c.value.adaptation,request,signal);}
  async compareGolden(reference:unknown,request:unknown,tolerance=1,signal?:AbortSignal){return compareSceneGoldens(reference,await this.golden(request,signal),tolerance);}
  async review(input: unknown, signal?: AbortSignal) {
    const c = await this.renderContext(signal), job=await this.job(), inspection=await readSeal<Inspection>(join(c.directory,'inspection.json'));
    if (inspection.value.revisionSha256!==c.sha256 || await fingerprint(c.output,signal)!==inspection.value.renderSha256) throw Error('Stale render/inspection');
    for (const e of inspection.value.evidence) if (await fingerprint(e.path,signal)!==e.sha256) throw Error('Review evidence changed');
    const review=reviewScene(input,{...inspection.value,revisionSha256:c.sha256,inspectionSha256:inspection.sha256,adaptation:c.value.adaptation,revision:c.value.index,maxCorrections:job.maxCorrections});
    const prior=await this.latestReview(c.directory),n=prior?prior.number+1:0;if(n>=8)throw Error('Review history limit');
    await save(join(c.directory,n?`review-${n}.json`:'review.json'),{...review,supersedes:prior?.sha256??null});return this.next();
  }
  async correct(input: unknown, cancellation?: AbortSignal) {
    const correction=sceneCorrectionSchema.parse(input), c=await this.renderContext(cancellation),job=await this.job(),review=await this.latestReview(c.directory);
    if (!review || review.sha256!==correction.reviewSha256 || c.sha256!==correction.revisionSha256) throw Error('Correction requires the latest reviewed revision');
    if (review.value.status!=='needs_correction'||c.value.index>=job.maxCorrections)throw Error('A failed review and remaining correction budget are required');
    if(await fingerprint(c.output,cancellation)!==review.value.renderSha256)throw Error('Reviewed render changed');
    const adaptation=adaptScene(correction.recipe,correction.input);
    if(motionDigest(adaptation.recipe.style)!==job.styleSha256)throw Error('Cannot weaken reference requirements during correction');
    if(motionDigest({assets:adaptation.input.assets,audio:adaptation.input.audio,transcript:adaptation.input.transcript})!==job.sourceSha256)throw Error('Corrections preserve source, audio range and transcript');
    if(motionDigest(adaptation)===motionDigest(c.value.adaptation))throw Error('No-op correction');
    const references=await this.referenceEvidence(adaptation,cancellation);
    return this.prepare(adaptation,references,c.value.index+1,review.sha256,correction.reason,cancellation);
  }
}
