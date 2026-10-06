import { z } from 'zod';
import {channelSceneSchema,channelMediaBoxes} from './channel-contract.ts';
import {referenceDesignSchema,designCriteria} from '@diffusionstudio/video-understanding/reference-design';
import {sceneStyleGuideSchema,styleGuideCriteria,styleDigest} from '@diffusionstudio/video-understanding/reference-style';
import { motionDigest, motionHash } from './motion.ts';
import { sceneCurveSchema, propertyTimingSchema, scenePathSchema, precisionEase, precisionPose, type SceneCurve } from './scene-dynamics.ts';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const note = z.string().trim().min(1).max(4000);
const unit = z.number().finite().min(0).max(1);
const seconds = z.number().finite().min(0).max(7200);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const box = z.object({ x: unit, y: unit, width: unit.positive(), height: unit.positive() }).strict()
  .refine(b => b.x + b.width <= 1.00001 && b.y + b.height <= 1.00001, 'Box must fit picture');
export const styleDimensions = ['framing', 'typography', 'motion', 'rhythm'] as const;
export const styleSpecSchema = z.object({
  name: note,
  guide: sceneStyleGuideSchema.optional(),
  design: z.array(z.object({referenceId:id,analysis:referenceDesignSchema}).strict()).min(1).max(8).optional(),
  basis: z.enum(['catalog', 'brief']).optional(),
  brief: z.object({ id, version: z.number().int().positive(), sha256: motionHash, description: note }).strict().optional(),
  catalogEntries: z.array(z.object({ id, version: z.number().int().positive(), sha256: motionHash }).strict()).min(1).max(16).optional(),
  references: z.array(z.object({ id, cache: note, sessionId: motionHash, sequenceId: motionHash,
    sequenceSha256: motionHash, inspectedFrames: z.array(z.number().int().nonnegative()).min(2).max(1800),
  }).strict()).max(8),
  criteria: z.array(z.object({ id, dimension: z.enum(styleDimensions), essential: z.boolean(), requirement: note,
    evidence: z.array(z.object({ referenceId: id, frames: z.array(z.number().int().nonnegative()).min(1) }).strict()),
  }).strict()).min(4).max(24),
  avoid: z.array(note).max(20), uncertainties: z.array(note).min(1).max(20),
}).strict().superRefine((style, ctx) => {
  const catalog = style.basis === 'catalog';
  const brief = style.basis === 'brief';
  if (brief ? (!style.brief || style.references.length || style.catalogEntries !== undefined || style.guide || style.design || style.criteria.some(c => c.evidence.length)) : style.brief !== undefined)
    ctx.addIssue({ code: 'custom', message: 'A user brief requires its own fingerprint and render-only criteria, never reference or catalog approval' });
  if(style.guide){
    if(!catalog)ctx.addIssue({code:'custom',message:'Reusable style guide requires catalog mode'});
    const binding=style.guide;
    if(binding.guideSha256!==styleDigest(binding.guide)||binding.profile!==`${binding.guide.id}@${binding.guide.version}`)
      ctx.addIssue({code:'custom',message:'Style guide fingerprint/identity changed'});
    try{for(const expected of styleGuideCriteria(binding.guide,binding.applications)){
      const actual=style.criteria.find(c=>c.id===expected.id);
      if(!actual||JSON.stringify(actual)!==JSON.stringify(expected))ctx.addIssue({code:'custom',message:`Missing or changed style rule: ${expected.id}`});
    }}catch(e){ctx.addIssue({code:'custom',message:(e as Error).message});}
  }
  if(style.design){
    if(catalog)ctx.addIssue({code:'custom',message:'Catalog reuse cannot inherit reference analysis approval'});
    if(new Set(style.design.map(d=>d.referenceId)).size!==style.design.length)ctx.addIssue({code:'custom',message:'Duplicate detailed reference'});
    for(const [index,d] of style.design.entries()){
      const ref=style.references.find(r=>r.id===d.referenceId);
      if(!ref||ref.sequenceSha256!==d.analysis.sequenceSha256||JSON.stringify([...ref.inspectedFrames].sort((a,b)=>a-b))!==JSON.stringify([...d.analysis.inspectedFrames].sort((a,b)=>a-b)))
        ctx.addIssue({code:'custom',message:'Detailed design must bind the exact inspected reference'});
      for(const expected of designCriteria(d.referenceId,d.analysis,index)){
        const actual=style.criteria.find(c=>c.id===expected.id);
        if(!actual||JSON.stringify(actual)!==JSON.stringify(expected))ctx.addIssue({code:'custom',message:`Missing or changed detailed requirement: ${expected.id}`});
      }
    }
  }
  if (!brief && (catalog ? (!style.catalogEntries?.length || style.references.length || style.criteria.some(c => c.evidence.length))
    : (!style.references.length || style.catalogEntries !== undefined || style.criteria.some(c => !c.evidence.length)))
  )
    ctx.addIssue({ code: 'custom', message: 'Use either evidence-backed reference criteria or pinned catalog requirements; never mix or silently drop reference evidence' });
});

// Layer coordinates are normalized output coordinates. Key times are normalized shot time.
const poseShape = { x: z.number().finite().min(-4).max(4), y: z.number().finite().min(-4).max(4),
  width: z.number().finite().positive().max(8), height: z.number().finite().positive().max(8),
  rotation: z.number().finite().min(-360).max(360), opacity: unit,
  blur: z.number().finite().min(0).max(40), skewX: z.number().finite().min(-1).max(1), reveal: unit };
export const scenePoseSchema = z.object(poseShape).strict();
const easeSchema = sceneCurveSchema;
const cueTime = z.object({ cue: id, edge: z.enum(['start', 'end']).default('start'), offsetSeconds: z.number().finite().min(-5).max(5).default(0) }).strict();
const track = z.object({ at: z.union([unit, cueTime]), pose: scenePoseSchema.partial(), easing: easeSchema.default('linear'),
  propertyTiming: propertyTimingSchema.optional(), path: scenePathSchema.optional() }).strict()
  .refine(k => !(k.path && (k.propertyTiming?.x || k.propertyTiming?.y)), 'A spatial path owns x/y timing');
const font = z.object({ family: z.string().regex(/^[\p{L}\p{N} _-]{1,80}$/u), weight: z.number().int().min(100).max(900),
  horizontalScale:z.number().finite().min(.5).max(1.5).optional(),
  size: z.number().finite().min(.012).max(.3), color, italic: z.boolean().default(false), tracking: z.number().finite().min(-.05).max(.15).optional() }).strict();
export const sceneRecipeSchema = z.object({ schemaVersion: z.literal(1), kind: z.literal('scene-motion-recipe'),
  compositor: z.literal('layered-v2').optional(),
  style: styleSpecSchema,
  templates: z.array(z.object({ id, background: color,
    channel: channelSceneSchema.optional(),
    surface: z.object({ kind: z.literal('paper'), strength: unit, seed: z.number().int().min(0).max(2147483647) }).strict().optional(),
    finish:z.object({grain:unit,vignette:unit,seed:z.number().int().min(0).max(2147483647)}).strict().optional(),
    groups: z.array(z.object({ id, pose: scenePoseSchema, keys: z.array(track).max(32) }).strict()).max(8).optional(),
    layers: z.array(z.object({ id, kind: z.enum(['video', 'image', 'rect', 'gradient', 'ellipse', 'hexagon', 'text']),
      group: id.optional(),
      mask: z.union([z.object({ kind: z.literal('ellipse') }).strict(), z.object({ kind: z.literal('polygon'), points: z.array(z.tuple([unit, unit])).min(3).max(64) }).strict()]).optional(),
      motionBlur: z.object({ samples: z.number().int().min(2).max(8), shutter: z.number().finite().positive().max(1) }).strict().optional(),
      slot: id.optional(), text: note.optional(), pose: scenePoseSchema, keys: z.array(track).max(32).default([]),
      fill: color.default('#FFFFFF'), stroke: color.default('#FFFFFF'), strokeWidth: z.number().finite().min(0).max(20).default(0),
      font: font.optional(), shadow: z.number().finite().min(0).max(40).default(0),
      cornerRadius: z.number().finite().min(0).max(.5).optional(),
      textLayout: z.object({ maxLines: z.number().int().min(1).max(4), minFontSize: z.number().finite().min(.015).max(.15),
        lineGap: z.number().finite().min(1).max(1.8) }).strict().optional(),
    }).strict()).max(48),
  }).strict()).min(1).max(16),
  caption: z.object({ font, box, minFontSize: z.number().finite().min(.02).max(.1),
    visible:z.boolean().optional(),
    lineGap: z.number().finite().min(1).max(2), entrySeconds: z.number().finite().min(0).max(.5),
    lift: z.number().finite().min(-.1).max(.1), blur: z.number().finite().min(0).max(24),
    uppercase: z.boolean(), shadow: z.number().finite().min(0).max(30),
    strokeWidth: z.number().finite().min(0).max(12).optional(), stroke: color.optional(),
  }).strict(),
}).strict();
export type SceneRecipe = z.infer<typeof sceneRecipeSchema>;
export type ScenePose = z.infer<typeof scenePoseSchema>;
export type SceneLayer = SceneRecipe['templates'][number]['layers'][number];

export const sceneInputSchema = z.object({
  width: z.number().int().min(240).max(1920).refine(n => n % 2 === 0),
  height: z.number().int().min(240).max(1920).refine(n => n % 2 === 0), fps: z.literal(30),
  assets: z.array(z.object({ id, path: note, sha256: motionHash, kind: z.enum(['video', 'image']),
    provenance: note, permission: z.enum(['user_supplied', 'original', 'licensed']),
  }).strict()).min(1).max(16),
  audio: z.object({ assetId: id, start: seconds, end: seconds }).strict(),
  transcript: z.object({ sourceSha256: motionHash, provenance: note, verification: z.enum(['unverified', 'user_verified']),
    words: z.array(z.object({ id, text: z.string().trim().min(1).max(80), start: seconds, end: seconds }).strict()).min(1).max(300),
  }).strict(),
  shots: z.array(z.object({ id, templateId: id, start: seconds, end: seconds, purpose: note,
    criteria: z.array(id).min(1), framing: z.object({ rationale: note, evidence: z.array(note).min(1),
      protectedRegions: z.array(box).max(10).default([]) }).strict(),
    cues: z.record(id, id).optional(),
    bindings: z.array(z.object({ slot: id, assetId: id, sourceIn: seconds.default(0), crop: box.optional() }).strict()).max(16),
  }).strict()).min(1).max(16),
  captions: z.array(z.object({ id, start: seconds, end: seconds, box: box.optional(),
    words: z.array(z.object({ wordId: id, row: z.number().int().min(0).max(3),
      scale: z.number().finite().min(.4).max(2.5).default(1), color: color.optional(), weight: z.number().int().min(100).max(900).optional(),
      italic: z.boolean().optional() }).strict()).min(1).max(20),
  }).strict()).min(1).max(64),
}).strict();
export type SceneInput = z.infer<typeof sceneInputSchema>;
export type SceneAdaptation = { recipe: SceneRecipe; input: SceneInput; duration: number; previewSamples: number[]; warnings: string[];
  status: 'draft'; safeToAutoPublish: false };
const unique = (values: string[], label: string) => { if (new Set(values).size !== values.length) throw Error(`Duplicate ${label}`); };
const overlap = (a: z.infer<typeof box>, b: z.infer<typeof box>) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** Adapt data, never execute reference content or invent speech alignment. */
export function adaptScene(recipeInput: unknown, input: unknown): SceneAdaptation {
  const recipe = sceneRecipeSchema.parse(recipeInput), data = sceneInputSchema.parse(input);
  if (!recipe.compositor && recipe.templates.some(t => t.channel || t.surface || t.layers.some(l => l.cornerRadius !== undefined)))
    throw Error('Paper surfaces and rounded panels require layered-v2');
  if (recipe.templates.some(t => t.layers.some(l => l.cornerRadius !== undefined && l.kind !== 'rect' && l.kind !== 'gradient')))
    throw Error('Corner radius is supported on drawn rectangular panels only');
  if(recipe.caption.font.horizontalScale!==undefined)throw Error('Horizontal font scale is supported on unwrapped layered titles only');
  if(!recipe.compositor&&recipe.caption.visible===false)throw Error('Hidden captions require layered-v2');
  const duration = data.audio.end - data.audio.start;
  const limit = recipe.compositor === 'layered-v2' ? 60 : 30;
  if (duration <= 0 || duration > limit || Math.abs(duration * 30 - Math.round(duration * 30)) > .001) throw Error(`Use a 0–${limit} second, frame-aligned preview`);
  for (const [values, label] of [[recipe.style.references.map(r => r.id), 'reference'], [recipe.style.criteria.map(c => c.id), 'criterion'],
    [recipe.templates.map(t => t.id), 'template'], [data.assets.map(a => a.id), 'asset'], [data.shots.map(s => s.id), 'shot'],
    [data.transcript.words.map(w => w.id), 'word'], [data.captions.map(c => c.id), 'caption']] as [string[], string][]) unique(values, label);
  for (const d of styleDimensions) if (!recipe.style.criteria.some(c => c.dimension === d && c.essential)) throw Error(`An essential ${d} criterion is required`);
  for (const ref of recipe.style.references) unique(ref.inspectedFrames.map(String), 'inspected frame');
  for (const c of recipe.style.criteria) for (const e of c.evidence) {
    const ref = recipe.style.references.find(r => r.id === e.referenceId);
    if (!ref || e.frames.some(f => !ref.inspectedFrames.includes(f))) throw Error('Criterion cites an uninspected reference frame');
  }
  for (const t of recipe.templates) {
    unique(t.layers.map(l => l.id), 'layer'); let graphics = false;
    unique((t.groups ?? []).map(g => g.id), 'group');
    if (!recipe.compositor && (t.groups || t.layers.length > 32)) throw Error('Groups and extended layers require layered-v2');
    for (const g of t.groups ?? []) {
      if (g.keys.some(k => JSON.stringify(k.propertyTiming?.width) !== JSON.stringify(k.propertyTiming?.height))) throw Error('Group scale needs identical width/height timing');
      let p = { ...g.pose };
      for (const key of [{ pose: g.pose }, ...g.keys]) {
        p = { ...p, ...key.pose };
        if (Math.abs(p.width - p.height) > .00001 || p.blur || p.skewX || p.reveal !== 1) throw Error('Groups use uniform scale, position, rotation and opacity only');
      }
    }
    for (const l of t.layers) {
      const media = l.kind === 'video' || l.kind === 'image';
      if (media && l.keys.some(k => JSON.stringify(k.propertyTiming?.width) !== JSON.stringify(k.propertyTiming?.height))) throw Error('Media aspect ratio needs identical width/height timing');
      if (l.textLayout && l.kind !== 'text') throw Error('Text layout applies only to text layers');
      if(l.font?.horizontalScale!==undefined&&(!recipe.compositor||l.kind!=='text'||l.textLayout))throw Error('Horizontal font scale is supported on unwrapped layered titles only');
      if (media && (!l.slot || (!recipe.compositor && graphics))) throw Error('Media layers need slots and must precede drawn layers in legacy recipes');
      if (!media) graphics = true;
      if (!recipe.compositor && (l.group || l.mask || l.motionBlur || l.textLayout || l.keys.some(k => typeof k.at !== 'number' || typeof k.easing !== 'string' || k.easing === 'bounce' || k.path || k.propertyTiming))) throw Error('Extended layers require layered-v2');
      if (l.group && !t.groups?.some(g => g.id === l.group)) throw Error('Unknown layer group');
      if (l.kind === 'video' && (l.mask || l.motionBlur || l.shadow || [l.pose, ...l.keys.map(k => k.pose)].some(p => p.blur || p.skewX || (p.reveal !== undefined && p.reveal !== 1)))) throw Error('Video masks, shadows, skew and motion blur are unsupported; use image layers or prepared footage');
      if (l.kind === 'text' && (!l.text?.trim() || !l.font)) throw Error('Text layers require nonblank text and font');
      if (l.textLayout && l.font && l.textLayout.minFontSize > l.font.size) throw Error('Text layout minimum exceeds requested font size');
      let prior = -1;
      for (const k of l.keys) { if (!Object.keys(k.pose).length) throw Error('Keyframes need nonempty poses');
        if (typeof k.at === 'number') { if (k.at <= prior) throw Error('Keyframes need strictly increasing times'); prior = k.at; } }
    }
  }
  const audio = data.assets.find(a => a.id === data.audio.assetId);
  if (!audio || audio.kind !== 'video' || audio.sha256 !== data.transcript.sourceSha256) throw Error('Speech must be bound to the audio source');
  let cursor = 0;
  for (const shot of data.shots) {
    if (Math.abs(shot.start - cursor) > .0001 || shot.end <= shot.start || shot.end > duration + .0001 ||
      [shot.start, shot.end].some(t => Math.abs(t * 30 - Math.round(t * 30)) > .001)) throw Error('Shots must tile the output on frame boundaries without gaps/overlaps');
    cursor = shot.end;
    const template = recipe.templates.find(t => t.id === shot.templateId);
    if (!template || shot.criteria.some(c => !recipe.style.criteria.some(r => r.id === c))) throw Error('Unknown template or criterion');
    if(template.channel){
      const c=template.channel,portrait=c.layout==='portrait';
      if(c.mode!=='footage'||data.width!==(portrait?1080:1920)||data.height!==(portrait?1920:1080)||Math.abs(c.section.duration-(shot.end-shot.start))>.0001)
        throw Error('Native channel scenes require matching footage mode, dimensions and duration');
      const slots=Object.keys(channelMediaBoxes(c.layout,c.section.kind));
      if(template.surface||template.finish||template.groups||template.layers.length!==slots.length||new Set(template.layers.map(l=>l.slot)).size!==slots.length||template.layers.some(l=>l.kind!=='video'||!slots.includes(l.slot??'')||l.id!==l.slot||l.keys.length||l.group||l.mask||l.motionBlur))
        throw Error('Native channel scenes own their graphics and accept only their fixed camera/screen slots');
      for(const l of template.layers){
        const b=channelMediaBoxes(c.layout,c.section.kind)[l.slot as 'camera'|'screen']!,aspect=l.slot==='camera'?c.cameraAspectRatio:c.screenAspectRatio;
        const w=Math.min(b.width,b.height*aspect),h=w/aspect;
        const expected={x:(b.x+b.width/2)/data.width,y:(b.y+b.height/2)/data.height,width:w/data.width,height:h/data.height,
          rotation:0,opacity:1,blur:0,skewX:0,reveal:1};
        if(Object.entries(expected).some(([key,value])=>Math.abs(l.pose[key as keyof ScenePose]-value)>.000001)||l.shadow||l.strokeWidth)
          throw Error('Native channel media geometry is fixed by its layout; use an evidence-backed source crop');
      }
    }
    resolveSceneTemplate(template, shot, data);
    unique(shot.bindings.map(b => b.slot), 'binding');
    const media = template.layers.filter(l => l.kind === 'video' || l.kind === 'image');
    if (shot.bindings.some(b => !media.some(l => l.slot === b.slot))) throw Error('Unused media binding');
    for (const layer of media) {
      const binding = shot.bindings.find(b => b.slot === layer.slot), asset = data.assets.find(a => a.id === binding?.assetId);
      if (!binding || !asset || asset.kind !== layer.kind) throw Error('Missing or incompatible media binding');
      if (asset.kind === 'image' && (binding.sourceIn || (binding.crop && !recipe.compositor))) throw Error('Image crop requires layered-v2; still images have no sourceIn');
    }
  }
  if (Math.abs(cursor - duration) > .0001) throw Error('Shots must cover the complete preview');
  for (const c of recipe.style.criteria.filter(c => c.essential)) if (!data.shots.some(s => s.criteria.includes(c.id))) throw Error(`Unimplemented essential criterion: ${c.id}`);
  for(const application of recipe.style.guide?.applications??[]){
    if(application.shotIds.some(id=>!data.shots.some(s=>s.id===id)))throw Error('Style rule names an unknown shot');
    for(const shot of data.shots){
      const expected=!application.shotIds.length||application.shotIds.includes(shot.id);
      if(shot.criteria.includes(`style-${application.ruleId}`)!==expected)throw Error('Style rule shot mapping changed');
    }
  }
  let priorWord = data.audio.start;
  for (const word of data.transcript.words) {
    if (word.start < priorWord - .0001 || word.end <= word.start || word.end > data.audio.end + .0001) throw Error('Words need ordered, positive source-clock intervals inside the audio range');
    priorWord = word.end;
  }
  const used: string[] = [], warnings = [recipe.style.basis === 'catalog'
    ? 'Catalog adaptation: template conformance is not original-reference fidelity or inherited approval.'
    : recipe.style.basis === 'brief' ? 'User brief: render conformance is not reference matching or inherited approval.'
    : 'Reference interpretation and style judgments are agent-reported, not independently verified.',
    'Prepared crops preserve caller-selected regions, not automatically tracked subjects.'];
  if (data.transcript.verification === 'unverified') warnings.push('Word alignment/text is unverified; listening review remains required.');
  let priorCaption = 0;
  for (const caption of data.captions) {
    if (caption.start < priorCaption - .0001 || caption.end <= caption.start || caption.end > duration + .0001) throw Error('Caption groups must be ordered and nonoverlapping inside the preview');
    priorCaption = caption.end;
    const rows = new Set(caption.words.map(w => w.row));
    if (Math.max(...rows) + 1 !== rows.size) throw Error('Caption rows must be contiguous starting at zero');
    let lastStart = -1, lastRow = -1;
    for (const cw of caption.words) {
      const w = data.transcript.words.find(w => w.id === cw.wordId);
      if (!w || w.start < lastStart || cw.row < lastRow || w.start - data.audio.start < caption.start - .0001 || w.end - data.audio.start > caption.end + .0001) throw Error('Caption words must retain source order, row order and real speech timing');
      lastStart = w.start; lastRow = cw.row; used.push(cw.wordId);
    }
    const b = caption.box ?? recipe.caption.box;
    for (const s of data.shots.filter(s => s.start < caption.end && s.end > caption.start))
      if (s.framing.protectedRegions.some(p => overlap(p, b))) throw Error(`Caption ${caption.id} covers a protected region`);
    const chars = caption.words.reduce((n, cw) => n + data.transcript.words.find(w => w.id === cw.wordId)!.text.length, 0);
    if (chars / (caption.end - caption.start) > 25) warnings.push(`${caption.id}: fast reading rate; inspect timing.`);
  }
  unique(used, 'caption word');
  if (used.length !== data.transcript.words.length) throw Error('Every supplied word must appear exactly once; do not silently drop speech');
  const times = [...data.shots.flatMap(s => [s.start, s.start + 1 / 30, (s.start + s.end) / 2, s.end - 1 / 30]),
    ...data.captions.flatMap(c => [c.start, c.end - 1 / 30]),
    ...data.transcript.words.map(w => w.start - data.audio.start + recipe.caption.entrySeconds)];
  return { recipe, input: data, duration, previewSamples: [...new Set(times.map(t => Math.max(0, Math.min(duration - 1 / 30, Math.round(t * 30) / 30))))].sort((a, b) => a - b),
    warnings, status: 'draft', safeToAutoPublish: false };
}

export function sceneEase(t: number, easing: SceneCurve) {
  if (typeof easing !== 'string' || easing === 'bounce') return precisionEase(t, easing);
  t = Math.max(0, Math.min(1, t));
  if (easing === 'hold') return t < 1 ? 0 : 1;
  if (easing === 'easeOut') return 1 - (1 - t) ** 3;
  if (easing === 'easeIn') return t ** 3;
  if (easing === 'easeInOut') return t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  return t;
}
/** Complete poses are accumulated at every authored key; arbitrary seeking is deterministic. */
export function scenePoseAt(layer: Pick<SceneLayer, 'pose' | 'keys'>, time: number): ScenePose {
  if (layer.keys.some(k => typeof k.easing !== 'string' || k.easing === 'bounce' || k.path || k.propertyTiming)) {
    if (layer.keys.some(k => typeof k.at !== 'number')) throw Error('Resolve speech cues before sampling a pose');
    return precisionPose(layer as Parameters<typeof precisionPose>[0], time);
  }
  let prior = { at: 0, pose: { ...layer.pose }, easing: 'linear' }, pose = { ...layer.pose };
  for (const key of layer.keys) {
    if (typeof key.at !== 'number') throw Error('Resolve speech cues before sampling a pose');
    const next = { ...pose, ...key.pose };
    if (time < key.at) {
      const f = sceneEase((time - prior.at) / (key.at - prior.at), prior.easing as SceneCurve);
      return Object.fromEntries(Object.keys(pose).map(k => [k, pose[k as keyof ScenePose] + (next[k as keyof ScenePose] - pose[k as keyof ScenePose]) * f])) as ScenePose;
    }
    pose = next; prior = { at: key.at, pose, easing: key.easing as string };
  }
  return pose;
}

/** Resolve reusable named motion cues against this shot's real source-clock words. */
export function resolveSceneTemplate(template: SceneRecipe['templates'][number], shot: SceneInput['shots'][number], input: SceneInput) {
  const resolveKeys = (keys: SceneLayer['keys']) => {
    let prior = -1;
    return keys.map(key => {
      let at: number;
      if (typeof key.at === 'number') at = key.at;
      else {
        const cue = key.at;
        const word = input.transcript.words.find(w => w.id === shot.cues?.[cue.cue]);
        if (!word) throw Error('Missing source-word binding for motion cue');
        at = (word[key.at.edge] - input.audio.start - shot.start + key.at.offsetSeconds) / (shot.end - shot.start);
      }
      if (at < 0 || at > 1 || at <= prior || !Object.keys(key.pose).length) throw Error('Resolved keys must be ordered and inside the shot; adjust cue offsets, never clamp speech');
      prior = at; return { ...key, at };
    });
  };
  for (const wordId of Object.values(shot.cues ?? {})) if (!input.transcript.words.some(w => w.id === wordId)) throw Error('Unknown speech cue word');
  return { ...template, layers: template.layers.map(l => ({ ...l, keys: resolveKeys(l.keys) })),
    ...(template.groups ? { groups: template.groups.map(g => ({ ...g, keys: resolveKeys(g.keys) })) } : {}) };
}

const finding = z.object({ status: z.enum(['pass', 'fail', 'unknown']), note,
  renderEvidenceIds: z.array(note), referenceEvidenceIds: z.array(note) }).strict();
export const sceneReviewSchema = z.object({ revisionSha256: motionHash, renderSha256: motionHash, inspectionSha256: motionHash,
  reviewer: note, inspectedEvidenceIds: z.array(note).min(1),
  criteria: z.array(finding.extend({ criterionId: id }).strict()).min(4).max(24),
  checks: z.array(finding.extend({ kind: z.enum(['readability', 'continuity', 'speech_sync', 'audio']) }).strict()).length(4),
}).strict();
export function reviewScene(input: unknown, expected: { revisionSha256: string; renderSha256: string; inspectionSha256: string;
  adaptation: SceneAdaptation; evidence: { id: string; role: 'reference' | 'render'; kind: 'frame' | 'audio' }[]; revision: number; maxCorrections: number }) {
  const review = sceneReviewSchema.parse(input);
  for (const key of ['revisionSha256', 'renderSha256', 'inspectionSha256'] as const) if (review[key] !== expected[key]) throw Error('Stale scene review');
  unique(review.inspectedEvidenceIds, 'inspected artifact'); unique(review.criteria.map(c => c.criterionId), 'review criterion'); unique(review.checks.map(c => c.kind), 'review check');
  const evidence = new Map(expected.evidence.map(e => [e.id, e]));
  if (review.inspectedEvidenceIds.some(id => !evidence.has(id))) throw Error('Unknown evidence');
  if (expected.evidence.some(e => e.kind === 'frame' && !review.inspectedEvidenceIds.includes(e.id))) throw Error('Inspect every supplied reference/render frame');
  if (review.criteria.length !== expected.adaptation.recipe.style.criteria.length || review.criteria.some(c => !expected.adaptation.recipe.style.criteria.some(s => s.id === c.criterionId))) throw Error('Review every style criterion exactly once');
  for (const c of [...review.criteria, ...review.checks]) {
    for (const [ids, role] of [[c.renderEvidenceIds, 'render'], [c.referenceEvidenceIds, 'reference']] as [string[], string][])
      if (ids.some(id => !review.inspectedEvidenceIds.includes(id) || evidence.get(id)?.role !== role)) throw Error('Uninspected or wrong-role comparison evidence');
    if (c.status !== 'unknown') {
      const modality = 'kind' in c && (c.kind === 'audio' || c.kind === 'speech_sync') ? 'audio' : 'frame';
      if (!c.renderEvidenceIds.some(id => evidence.get(id)?.kind === modality)) throw Error('A judgment needs matching rendered evidence');
      if ('criterionId' in c && !expected.adaptation.recipe.style.basis) {
        const criterion = expected.adaptation.recipe.style.criteria.find(s => s.id === c.criterionId)!;
        const valid = criterion.evidence.flatMap(e => e.frames.map(f => `ref-${e.referenceId}-${f}`));
        if (!c.referenceEvidenceIds.some(id => valid.includes(id))) throw Error('Style verdict needs its specific reference evidence');
      }
    }
  }
  const essential = review.criteria.filter(c => expected.adaptation.recipe.style.criteria.find(s => s.id === c.criterionId)!.essential);
  const failed = [...essential, ...review.checks].some(c => c.status === 'fail');
  return { ...review, styleMatch: essential.some(c => c.status === 'fail') ? 'mismatch' : essential.some(c => c.status === 'unknown') ? 'unassessed'
    : review.criteria.some(c => c.status !== 'pass') ? 'partial_match'
    : expected.adaptation.recipe.style.basis === 'catalog' ? 'agent_reported_template_conformance'
    : expected.adaptation.recipe.style.basis === 'brief' ? 'agent_reported_brief_conformance' : 'agent_reported_match',
    status: failed ? expected.revision < expected.maxCorrections ? 'needs_correction' : 'correction_limit'
      : review.checks.some(c => c.status === 'unknown') || essential.some(c => c.status === 'unknown') ? 'needs_human_review' : 'reviewed_draft',
    safeToAutoPublish: false, basis: 'agent_reported_not_independent_verification' };
}

export const sceneCorrectionSchema = z.object({ revisionSha256: motionHash, reviewSha256: motionHash, reason: note,
  recipe: sceneRecipeSchema, input: sceneInputSchema }).strict();
export { motionDigest };
