import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { planSchema } from './schema.ts';
import { validatePlan } from './validate.ts';
import { fingerprint, probe } from './preview.ts';
import { deliveryBundleSchema, deliverySettingsSchema, formatChapters, mapDeliveryChapters, planDeliveryTimeline } from './delivery-schema.ts';
import type { DeliveryBundle } from './delivery-schema.ts';
import { assertPortraitForPlan, portraitHash } from './portrait.ts';
import { portraitVideoFilter } from './portrait-schema.ts';

import { runMedia } from './media-process.ts';
import { loadMobileAssets, writeMobileAssets, verifyMobileAssets } from './mobile-node.ts';
export { runMedia } from './media-process.ts';

export async function probePortraitSource(path: string, signal?: AbortSignal) {
  const data = JSON.parse((await runMedia(['-v','error','-show_streams','-of','json','-protocol_whitelist','file,pipe',path],
    {binary:process.env.FFPROBE_PATH || 'ffprobe',signal})).toString());
  const v = data.streams?.find((s:{codec_type:string})=>s.codec_type==='video');
  if (!v?.width || !v?.height) throw new Error('Portrait needs a video stream');
  // The evidence/crop coordinate system must agree. Do not silently guess rotated/anamorphic geometry.
  if (v.sample_aspect_ratio && !['1:1','0:1','N/A'].includes(v.sample_aspect_ratio) ||
      Number(v.tags?.rotate || 0)%360 || v.side_data_list?.some((s:{rotation?:number})=>Number(s.rotation || 0)%360)) {
    throw new Error('Portrait currently requires square pixels and no display rotation; normalize and reinspect this source first');
  }
  return {width:Number(v.width),height:Number(v.height)};
}

function composition(bundle: Pick<DeliveryBundle, 'name' | 'width' | 'height' | 'fps' | 'duration' | 'clips'>, root: string) {
  const clips = bundle.clips.map(c => ({ path: join(root, c.path).replaceAll('\\', '/'), name: c.id,
    start: c.startFrame / bundle.fps, duration: c.durationFrames / bundle.fps }));
  // All user text is serialized as data, never interpolated into executable JSX.
  return `// Generated cut-only editor composition. Source provenance: bundle.json and plan.json.\nconst clips=${JSON.stringify(clips)};\nexport default function Edit(){return <rect scene="delivery-edit" name={${JSON.stringify(bundle.name)}} width={${bundle.width}} height={${bundle.height}} end={${bundle.duration}} fill="#121A1A"><sequence>{clips.map(c=><video name={c.name} src={c.path} start={c.start} sourceIn={0} sourceOut={c.duration} width={${bundle.width}} height={${bundle.height}} objectFit="contain"/>)}</sequence></rect>;}\n`;
}

/** Prepare once, then render/review via the real editor. No model calls or uploads. */
export async function prepareDelivery(input: unknown, options: { output: string; baseDirectory: string; settings?: unknown; portrait?: unknown; signal?: AbortSignal; onProgress?: (message: string) => void }) {
  const validation = validatePlan(input);
  if (!validation.technicalPass) throw new Error(`Plan rejected: ${validation.errors.map(e => e.message).join('; ')}`);
  const plan = planSchema.parse(input), settings = deliverySettingsSchema.parse(options.settings ?? {});
  const portrait = options.portrait === undefined ? undefined : assertPortraitForPlan(options.portrait, plan);
  if (portrait && (settings.width !== undefined && settings.width !== portrait.recipe.width ||
      settings.height !== undefined && settings.height !== portrait.recipe.height)) throw new Error('Settings conflict with reviewed portrait dimensions');
  const timing = planDeliveryTimeline(plan.segments, settings.fps);
  const frames = timing.reduce((n, c) => n + c.durationFrames, 0), duration = frames / settings.fps;
  if (duration > settings.maxDuration) throw new Error('Prepared edit exceeds maxDuration; explicitly raise the local budget');
  if (duration > plan.brief.maxDuration + 1e-6) throw new Error('Frame-aligned duration exceeds the brief; leave room for up to one frame per cut');
  const chapters = mapDeliveryChapters(settings, timing, settings.fps);
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(3_600_000)]) : AbortSignal.timeout(3_600_000);
  const root = resolve(options.output);
  const mobileAssets = portrait?.schemaVersion === 2 ? await loadMobileAssets(portrait.mobile, portrait.recipe, true, signal) : null;
  const sources: DeliveryBundle['sources'] = [];
  const metadata = new Map<string, Awaited<ReturnType<typeof probe>>>();
  // Validate every referenced source before creating outputs or asking the editor to change projects.
  for (const source of plan.sources.filter(s => plan.segments.some(c => c.sourceId === s.id))) {
    if (!source.sha256) throw new Error(`${source.id}: a source SHA-256 is required; inspect through the evidence pipeline first`);
    const path = await realpath(resolve(options.baseDirectory, source.path));
    const info = await stat(path);
    if (!info.isFile() || info.size > 16 * 1024 ** 3) throw new Error('Source must be a local regular file of at most 16 GiB');
    const actualHash = await fingerprint(path, signal);
    if (actualHash !== source.sha256) throw new Error(`${source.id}: source changed; reinspect it`);
    const media = await probe(path, signal);
    if (portrait) {
      const geometry = await probePortraitSource(path,signal);
      if (geometry.width !== portrait.recipe.sourceWidth || geometry.height !== portrait.recipe.sourceHeight) throw new Error('Portrait source geometry differs from the inspected recipe');
    }
    if (media.duration > 7200 || plan.segments.some(c => c.sourceId === source.id && c.out > media.duration + .001)) throw new Error(`${source.id}: source duration/bounds exceeded`);
    if (source.audio === 'speech' && !media.hasAudio || source.audio === 'no_track' && media.hasAudio) throw new Error(`${source.id}: declared audio state conflicts with source`);
    sources.push({ id: source.id, path, sha256: actualHash, bytes: info.size, mtimeMs: info.mtimeMs });
    metadata.set(source.id, media);
  }
  const first = metadata.get(plan.segments[0].sourceId)!;
  const height = portrait?.recipe.height ?? settings.height ?? 1080;
  const width = portrait?.recipe.width ?? settings.width ?? Math.round(height * first.width / first.height / 2) * 2;
  if (width > 3840 || width < 160) throw new Error('Automatic dimensions exceed the budget; set an explicit even width/height');
  await mkdir(dirname(root), { recursive: true });
  await mkdir(root); // Deliberately fails for an existing directory.
  await mkdir(join(root, 'media'));
  await writeFile(join(root, 'settings.json'), JSON.stringify(settings, null, 2), { flag: 'wx' });
  // A previous review does not certify this newly rendered version.
  plan.review = { previewInspected: false, reviewer: '', checks: [] };
  await writeFile(join(root, 'plan.json'), JSON.stringify(plan, null, 2), { flag: 'wx' });
  if (portrait) await writeFile(join(root,'portrait.json'),JSON.stringify(portrait,null,2),{flag:'wx'});
  if (portrait?.schemaVersion === 2) await writeMobileAssets(root, portrait.mobile, mobileAssets);
  const clips: DeliveryBundle['clips'] = [];
  for (const [index, segment] of plan.segments.entries()) {
    signal.throwIfAborted();
    options.onProgress?.(`Preparing ${index + 1}/${plan.segments.length}: ${segment.id}`);
    const source = sources.find(s => s.id === segment.sourceId)!, media = metadata.get(source.id)!;
    const clip = timing[index], extraFrames = 4;
    const preparedDuration = (clip.durationFrames + extraFrames) / settings.fps;
    const path = `media/${segment.id}.mp4`, output = join(root, path);
    const prefix = `[0:v:0]setpts=PTS-(${media.startTime})/TB,trim=start=${segment.in}:end=${segment.out},setpts=PTS-(${segment.in})/TB,`;
    const v = portrait ? `${prefix}setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${clip.durationFrames}[portrait-input];${portraitVideoFilter(portrait.recipe,'portrait-input',mobileAssets?'caption-input':'v')}${mobileAssets?';[caption-input]subtitles=filename=mobile-assets/captions.ass:fontsdir=mobile-assets/fonts,format=yuv420p[v]':''}` :
      `${prefix}scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x121A1A,setsar=1,fps=${settings.fps},tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${clip.durationFrames + extraFrames},format=yuv420p[v]`;
    const a = media.hasAudio ? `[0:a:0]asetpts=PTS-(${media.startTime})/TB,aresample=48000:async=1:first_pts=0,atrim=start=${segment.in}:end=${segment.out},asetpts=PTS-(${segment.in})/TB,aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=duration=${preparedDuration}[a]` :
      `anullsrc=r=48000:cl=stereo,atrim=duration=${preparedDuration}[a]`;
    // Input -ss is relative to the container start, while trims remain relative to the
    // original video PTS. Keep one second of preroll and use the same origin for sound.
    // A local script also avoids Windows command-line length limits for pan keyframes.
    const filterPath = join(root,`${segment.id}.filter.txt`);
    await writeFile(filterPath,`${v};${a}`,{flag:'wx'});
    await runMedia(['-v', 'error', '-nostdin', '-n', '-copyts', '-ss', String(Math.max(0, media.startTime + segment.in - media.containerStartTime - 1)),
      '-protocol_whitelist', 'file,pipe', '-i', source.path, '-filter_complex_script', filterPath, '-map', '[v]', '-map', '[a]', '-map_metadata', '-1',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output], { signal, cwd: root });
    const prepared = await probe(output, signal);
    if (Math.abs(prepared.duration - preparedDuration) > 1 / settings.fps + .001) throw new Error(`Incomplete prepared media for ${segment.id}`);
    clips.push({ ...clip, sourceId: source.id, sourceIn: segment.in, sourceOut: segment.out, path,
      sha256: await fingerprint(output, signal), hasSourceAudio: media.hasAudio });
  }
  for (const source of sources) {
    const after = await stat(source.path);
    if (after.size !== source.bytes || after.mtimeMs !== source.mtimeMs) throw new Error(`${source.id}: source changed during preparation`);
  }
  const partial = { name: settings.name, width, height, fps: settings.fps, duration, clips };
  await writeFile(join(root, 'edit.tsx'), composition(partial, root), { flag: 'wx' });
  await writeFile(join(root, 'encode.json'), JSON.stringify({ format: 'mp4', video: { codec: 'avc', resolution: height, fps: settings.fps, bitrate: 12000000 },
    audio: { enabled: true, codec: 'aac', bitrate: 192000, sampleRate: 48000, numberOfChannels: 2 } }, null, 2), { flag: 'wx' });
  await writeFile(join(root, 'chapters.txt'), formatChapters(chapters), { flag: 'wx' });
  const bundle = deliveryBundleSchema.parse({ schemaVersion: 1, kind: 'editor-delivery-bundle', ...partial, frames, sources, chapters,
    ...(portrait ? {portrait:{documentSha256:await fingerprint(join(root,'portrait.json'),signal),recipeSha256:portraitHash(portrait)}} : {}),
    compositionSha256: await fingerprint(join(root, 'edit.tsx'), signal), planSha256: await fingerprint(join(root, 'plan.json'), signal),
    limitations: [portrait ? `Agent-reviewed 9:16 framing is baked into prepared media: linear crop pans within shots, hard framing changes between shots, contain fallback. ${mobileAssets?'Imported captions and fingerprinted font are baked into the same reference; wording, glyph coverage and phone readability still require review.':'No captions added.'} No automatic subject tracking, transcription or added music.` : 'First version: ordered cuts with original sound, contain framing and no added titles, music, transitions or B-roll.',
      'Selection remains the calling agent’s judgment, grounded in inspected evidence. No automatic storytelling or virality score.',
      'Sub-frame durations round up with held picture/padded audio; four additional unused tail frames prevent boundary decoder starvation.',
      'Actual-render verification is required; prepared media and source attribution do not prove narrative quality.'] });
  await writeFile(join(root, 'bundle.json'), JSON.stringify(bundle, null, 2), { flag: 'wx' });
  return { path: root, bundle, aiCalls: 0, projectModified: false, reviewRequired: true };
}

export async function readDeliveryBundle(directory: string, signal?: AbortSignal) {
  const root = await realpath(resolve(directory));
  const bundle = deliveryBundleSchema.parse(JSON.parse(await readFile(join(root, 'bundle.json'), 'utf8')));
  if (await fingerprint(join(root, 'edit.tsx'), signal) !== bundle.compositionSha256 ||
      await fingerprint(join(root, 'plan.json'), signal) !== bundle.planSha256) throw new Error('Prepared composition or plan changed; prepare a new bundle');
  if (await readFile(join(root, 'edit.tsx'), 'utf8') !== composition(bundle, root)) throw new Error('Bundle metadata disagrees with its generated composition, or bundle was moved; prepare again');
  const plan = planSchema.parse(JSON.parse(await readFile(join(root, 'plan.json'), 'utf8')));
  if (bundle.portrait) {
    if (await fingerprint(join(root,'portrait.json'),signal) !== bundle.portrait.documentSha256) throw new Error('Portrait document changed; prepare a new bundle');
    const doc = assertPortraitForPlan(JSON.parse(await readFile(join(root,'portrait.json'),'utf8')),plan);
    if (portraitHash(doc) !== bundle.portrait.recipeSha256 || doc.recipe.width !== bundle.width || doc.recipe.height !== bundle.height || doc.recipe.frames !== bundle.frames) throw new Error('Bundle disagrees with its reviewed portrait recipe');
    if (doc.schemaVersion === 2) await verifyMobileAssets(root, doc.mobile, doc.recipe);
  }
  if (!validatePlan(plan).technicalPass || plan.segments.length !== bundle.clips.length) throw new Error('Bundle plan is invalid or has different cuts');
  const timing = planDeliveryTimeline(plan.segments, bundle.fps);
  for (const [i, clip] of bundle.clips.entries()) {
    const selected = plan.segments[i], expected = timing[i];
    if (clip.id !== selected.id || clip.sourceId !== selected.sourceId || clip.sourceIn !== selected.in || clip.sourceOut !== selected.out ||
      clip.startFrame !== expected.startFrame || clip.durationFrames !== expected.durationFrames) throw new Error('Bundle source mapping disagrees with the hashed plan');
  }
  const referenced = plan.sources.filter(s => plan.segments.some(c => c.sourceId === s.id));
  if (bundle.sources.length !== referenced.length || new Set(bundle.sources.map(s => s.id)).size !== referenced.length ||
    bundle.sources.some(s => !referenced.some(p => p.id === s.id && p.sha256 === s.sha256))) throw new Error('Bundle original fingerprints disagree with the hashed plan');
  let end = 0;
  for (const clip of bundle.clips) {
    if (clip.startFrame !== end) throw new Error('Bundle timeline has a gap, overlap or reordered clip');
    end += clip.durationFrames;
  }
  if (end !== bundle.frames || Math.abs(end / bundle.fps - bundle.duration) > 1e-7) throw new Error('Bundle duration disagrees with its clips');
  for (const clip of bundle.clips) {
    const path = await realpath(join(root, clip.path));
    if (!path.startsWith(root + sep)) throw new Error('Prepared media escapes the bundle directory');
    if (await fingerprint(path, signal) !== clip.sha256) throw new Error(`${clip.id}: prepared media changed`);
  }
  return { root, bundle };
}
