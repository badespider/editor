/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

const finite = z.number().finite(), hex = z.string().regex(/^#[a-fA-F0-9]{6}$/);
const prose = (max: number, min = 0) => z.string().min(min).max(max).regex(/^[^\u0000-\u0008\u000b-\u001f\u007f]*$/);
const id = z.string().max(80).regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const assetId = z.string().max(64).regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const coord = finite.min(-8192).max(8192), dimension = finite.positive().max(8192);
const axisScale = finite.min(0).max(4);
const easing = z.string().max(100).refine(value => {
  if (/^(linear|easeIn|easeOut|easeInOut|gentle|snappy|bouncy|strong)$/.test(value)) return true;
  const match = /^cubicBezier\(\s*(\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/.exec(value);
  if (!match) return false;
  const [x1, y1, x2, y2] = match.slice(1).map(Number);
  return [x1, y1, x2, y2].every(Number.isFinite) && x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1 && Math.abs(y1) <= 4 && Math.abs(y2) <= 4;
}, 'Use a native named easing or cubicBezier with x controls in 0..1 and y controls in -4..4');
const key = z.object({ time: finite.min(0).max(120), x: coord, y: coord, width: finite.nonnegative().max(8192), height: finite.nonnegative().max(8192),
  scale: finite.min(0).max(4), rotation: finite.min(-3600).max(3600), opacity: finite.min(0).max(1), easing }).strict();
const layer = z.object({ id, name: prose(120, 1), type: z.enum(['text', 'rect', 'ellipse', 'line', 'image', 'video']),
  start: finite.min(0).max(120), end: finite.positive().max(120), x: coord, y: coord, width: dimension, height: dimension,
  rotation: finite.min(-3600).max(3600), opacity: finite.min(0).max(1), fill: hex, radius: finite.nonnegative().max(4096),
  scaleX: axisScale.optional(), scaleY: axisScale.optional(), clipToBox: z.boolean().optional(),
  text: prose(2000), fontFamily: z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/),
  fontSize: finite.min(4).max(4096), fontWeight: finite.int().min(100).max(900), fontStyle: z.enum(['normal', 'italic']),
  textAlign: z.enum(['left', 'center', 'right']), letterSpacing: finite.min(-100).max(200), leading: finite.min(.5).max(4),
  assetId: assetId.nullable(), objectFit: z.enum(['cover', 'contain', 'fill']), sourceIn: finite.min(0).max(7200),
  keyframes: z.array(key).max(80), evidenceIds: z.array(z.string().min(1).max(200)).min(1).max(48),
}).strict();
const request = z.object({ id: assetId, kind: z.enum(['frame-crop', 'texture-tile']), time: finite.min(0).max(7200),
  rect: z.object({ x: finite.min(0).max(1), y: finite.min(0).max(1), width: finite.positive().max(1), height: finite.positive().max(1) }).strict(), purpose: prose(600, 1) }).strict();
const structure = z.object({ schemaVersion: z.literal(2), title: prose(160, 1), summary: prose(4000, 1),
  width: finite.int().min(2).max(4096), height: finite.int().min(2).max(4096), fps: z.literal(30), duration: finite.min(1 / 30).max(120), background: hex,
  assetRequests: z.array(request).max(16), layers: z.array(layer).min(1).max(240),
  unresolved: z.array(prose(800, 1)).max(64), observations: z.array(prose(800, 1)).max(64),
}).strict();
// Saved v2 plans may omit the new static controls; account structured output
// still has one strict, complete shape, without provider-side defaults.
const providerStructure = structure.extend({ layers: z.array(layer.extend({ scaleX: axisScale, scaleY: axisScale, clipToBox: z.boolean() })).min(1).max(240) });
const frame = (time: number) => Math.round(time * 30);
export const reconstructionPlanSchema = structure.superRefine((plan, ctx) => {
  const problem = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  if (plan.width * plan.height > 8_294_400) problem(['width'], 'Canvas exceeds the native pixel budget');
  const assets = new Set(['reference-source']);
  for (const [i, asset] of plan.assetRequests.entries()) {
    if (assets.has(asset.id)) problem(['assetRequests', i, 'id'], 'Asset IDs must be unique and cannot replace reference-source');
    assets.add(asset.id);
    if (asset.rect.x + asset.rect.width > 1 + 1e-9 || asset.rect.y + asset.rect.height > 1 + 1e-9) problem(['assetRequests', i, 'rect'], 'Crop must stay inside the source frame');
    if (asset.rect.width * asset.rect.height > (asset.kind === 'texture-tile' ? .2 : .5) + 1e-9) problem(['assetRequests', i, 'rect'], 'Whole graphic frames cannot be disguised as editable artwork');
  }
  const ids = new Set<string>(); let characters = 0;
  for (const [i, item] of plan.layers.entries()) {
    const path = ['layers', i];
    if (ids.has(item.id)) problem([...path, 'id'], 'Layer IDs must be unique'); ids.add(item.id);
    if (frame(item.end) <= frame(item.start) || item.end > plan.duration) problem([...path, 'end'], 'Layer must fit the composition and span a native frame');
    if (item.width > plan.width * 2 || item.height > plan.height * 2) problem([...path, 'width'], 'Layer dimensions exceed twice the canvas');
    if (item.x < -plan.width || item.x > plan.width * 2 || item.y < -plan.height || item.y > plan.height * 2) problem([...path, 'x'], 'Layer exceeds the bounded offscreen area');
    if (item.radius > Math.min(item.width, item.height) / 2) problem([...path, 'radius'], 'Radius exceeds the shortest side');
    if (item.type === 'ellipse' && item.width !== item.height) problem([...path, 'height'], 'Native ellipse primitive currently represents circles');
    if (item.type === 'text') { if (!item.text.trim()) problem([...path, 'text'], 'Text must contain literal characters'); characters += Array.from(item.text).length; }
    else if (item.text !== '') problem([...path, 'text'], 'Non-text layers use an empty text field');
    if (item.type === 'image' || item.type === 'video') {
      if (!item.assetId || !assets.has(item.assetId)) problem([...path, 'assetId'], 'Media references only approved opaque source asset IDs');
      if (item.type === 'video' && item.assetId !== 'reference-source') problem([...path, 'assetId'], 'Video layers must use the source-bound video');
      if (item.type === 'image' && item.assetId === 'reference-source') problem([...path, 'assetId'], 'Source video is not an image');
    } else if (item.assetId !== null) problem([...path, 'assetId'], 'Native text and shapes cannot carry prepared media');
    let last = -1;
    for (const [k, point] of item.keyframes.entries()) {
      if (point.time < item.start || point.time > item.end || frame(point.time) <= last) problem([...path, 'keyframes', k, 'time'], 'Keys must increase on distinct native frames inside their layer');
      if (point.width > plan.width * 2 || point.height > plan.height * 2) problem([...path, 'keyframes', k, 'width'], 'Animated size exceeds the canvas budget');
      if (point.x < -plan.width || point.x > plan.width * 2 || point.y < -plan.height || point.y > plan.height * 2) problem([...path, 'keyframes', k, 'x'], 'Animated position exceeds the canvas budget');
      if (item.type === 'ellipse' && point.width !== point.height) problem([...path, 'keyframes', k, 'height'], 'Circle animation must retain equal axes');
      last = frame(point.time);
    }
  }
  if (characters > 24000) problem(['layers'], 'Total native text exceeds the glyph budget');
});
export type ReconstructionPlan = z.infer<typeof reconstructionPlanSchema>;
export const reconstructionJsonSchema = z.toJSONSchema(providerStructure, { target: 'draft-7' });
export type ReconstructionBinding = { id: string; path: string; sha256: string; kind: 'source-video' | 'frame-crop' | 'texture-tile'; width: number; height: number; duration?: number };
export type ReconstructionCompilerOptions = { sceneKey: string; bindings: ReconstructionBinding[]; audio: { sourceIn: number; sourceOut: number } | null };

/** Only the application supplies paths; model-authored strings never become imports, code or URLs. */
function compileReconstructionData(input: unknown, options: ReconstructionCompilerOptions) {
  const plan = reconstructionPlanSchema.parse(input);
  const settings = z.object({ sceneKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/), bindings: z.array(z.object({ id: assetId, path: z.string().min(1).max(32768).regex(/^[^\u0000-\u001f\u007f]*$/), sha256: z.string().regex(/^[a-f0-9]{64}$/), kind: z.enum(['source-video', 'frame-crop', 'texture-tile']), width: finite.int().positive().max(32768), height: finite.int().positive().max(32768), duration: finite.positive().max(7200).optional() }).strict()).max(17), audio: z.object({ sourceIn: finite.nonnegative().max(7200), sourceOut: finite.positive().max(7200) }).strict().nullable() }).strict().parse(options);
  const bindings = new Map(settings.bindings.map(binding => [binding.id, binding]));
  if (bindings.size !== settings.bindings.length) throw new Error('Duplicate approved media binding');
  const requests = new Map(plan.assetRequests.map(request => [request.id, request]));
  for (const binding of settings.bindings) {
    if (binding.id === 'reference-source') {
      if (binding.kind !== 'source-video') throw new Error('reference-source must bind the source video');
    } else if (!requests.has(binding.id) || requests.get(binding.id)!.kind !== binding.kind) throw new Error('Prepared media binding must match an explicit asset request and kind');
  }
  for (const binding of settings.bindings) if ((!/^[A-Za-z]:[\\/]/.test(binding.path) && !binding.path.startsWith('/')) || /^[\\/]{2}/.test(binding.path) || /^[a-z][a-z\d+.-]*:/i.test(binding.path) && !/^[A-Za-z]:[\\/]/.test(binding.path)) throw new Error('Media bindings require local absolute paths');
  const source = bindings.get('reference-source');
  if (source?.duration && plan.assetRequests.some(request => request.time >= source.duration!)) throw new Error('Asset request time must be inside the bound source duration');
  if (settings.audio && (!source?.duration || settings.audio.sourceOut <= settings.audio.sourceIn || frame(settings.audio.sourceOut) - frame(settings.audio.sourceIn) !== frame(plan.duration) || settings.audio.sourceOut > source.duration || frame(settings.audio.sourceOut) / 30 > source.duration + 1e-7)) throw new Error('Audio must map the exact selected source interval once within a duration-bound source video');
  const layers = plan.layers.map(item => {
    const start = frame(item.start), sourceStart = item.type === 'video' ? frame(item.sourceIn) : 0;
    const base = { ...item, time: item.start, scale: 1, easing: 'linear' };
    const keys = item.keyframes.length && frame(item.keyframes[0].time) === start ? item.keyframes : [base, ...item.keyframes];
    // A native trimmed video's local playback clock starts at its sourceIn,
    // while a sourceless shape starts at zero. Offset that source clock once.
    const track = (property: 'x' | 'y' | 'width' | 'height' | 'scale' | 'rotation' | 'opacity') => keys.every(point => point[property] === keys[0][property]) ? keys[0][property] : keys.map(point => ({ time: `${frame(point.time) - start + sourceStart}f`, value: point[property], easing: point.easing }));
    const props: Record<string, unknown> = { key: item.id, name: item.name, start: `${start}f`, end: `${frame(item.end)}f`, x: track('x'), y: track('y'), width: track('width'), height: track('height'), scale: track('scale'), scaleX: item.scaleX ?? 1, scaleY: item.scaleY ?? 1, clipToBox: item.clipToBox ?? false, rotation: track('rotation'), opacity: track('opacity') };
    if (item.type === 'text') Object.assign(props, { fill: item.fill, children: item.text, fontFamily: item.fontFamily, fontSize: item.fontSize, fontWeight: item.fontWeight, fontStyle: item.fontStyle, letterSpacing: item.letterSpacing, leading: item.leading, textAlign: item.textAlign, textBaseline: 'top' });
    else if (item.type === 'image' || item.type === 'video') {
      const binding = bindings.get(item.assetId!); if (!binding) throw new Error(`Unprepared source asset: ${item.assetId}`);
      if (item.type === 'video' && binding.kind !== 'source-video' || item.type === 'image' && binding.kind === 'source-video') throw new Error('Native media kind does not match its approved binding');
      Object.assign(props, { src: binding.path, objectFit: item.objectFit });
      if (item.type === 'video') {
        const sourceEnd = sourceStart + frame(item.end) - start;
        if (!binding.duration || sourceEnd > frame(binding.duration) || sourceEnd / 30 > binding.duration + 1e-7) throw new Error('Video layer exceeds its duration-bound source video');
        delete props.end; Object.assign(props, { sourceIn: `${sourceStart}f`, sourceOut: `${sourceEnd}f`, muted: true });
      }
    } else {
      const width = track('width');
      Object.assign(props, { fill: item.fill, cornerRadius: item.type === 'ellipse' ? (typeof width === 'number' ? width / 2 : width.map(point => ({ ...point, value: point.value / 2 }))) : item.radius });
    }
    return { type: item.type, props };
  });
  const data = { ...settings, title: plan.title, width: plan.width, height: plan.height, duration: frame(plan.duration) / 30, background: plan.background, sourcePath: bindings.get('reference-source')?.path ?? null, layers };
  return data;
}

const reconstructionLiteral = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** Compile native primitive data as a clipped, sourceless component factory.
 * The caller supplies the trusted Rect/Text imports and a parent clock.
 * No model-authored expression or executable source is accepted. */
export function buildReconstructionComponentFactory(input: unknown, key: string): string {
  const plan = reconstructionPlanSchema.parse(input);
  if (plan.assetRequests.length || plan.layers.some(layer => layer.type === 'image' || layer.type === 'video')) throw new Error('Reusable native components cannot contain media');
  const data = compileReconstructionData(plan, { sceneKey: key, bindings: [], audio: null });
  return `function(){
 const data=${reconstructionLiteral(data)};
 const background=Rect({key:data.sceneKey+"-background",name:"Component background",start:"0f",end:String(Math.round(data.duration*30))+"f",x:0,y:0,width:data.width,height:data.height,fill:data.background});
 const layers=data.layers.map(layer=>{const props={...layer.props,key:data.sceneKey+"-"+layer.props.key};return layer.type==="text"?Text(props):Rect(props);});
 return Rect({key:data.sceneKey,name:data.title,start:"0f",end:String(Math.round(data.duration*30))+"f",x:0,y:0,width:data.width,height:data.height,clipToBox:true,children:[background,...layers]});
}`;
}

/** Only the application supplies paths; model-authored strings never become imports, code or URLs. */
export function buildReconstructionModule(input: unknown, options: ReconstructionCompilerOptions): string {
  const data = compileReconstructionData(input, options);
  const literal = reconstructionLiteral(data);
  return `import { Rect, Text, Image, Video, Audio } from "dapi-host:@diffusionstudio/jsx";
const data = ${literal};
export const reconstructionManifest = data;
export default function Project(){
 const background=Rect({key:"_reconstruction-background",name:"Reference background",start:"0f",end:String(Math.round(data.duration*30))+"f",x:0,y:0,width:data.width,height:data.height,fill:data.background});
 const layers=data.layers.map(layer=>layer.type==="text"?Text(layer.props):layer.type==="image"?Image(layer.props):layer.type==="video"?Video(layer.props):Rect(layer.props));
 const audio=data.audio?Audio({key:"_reconstruction-audio",name:"Original reference audio",src:data.sourcePath,start:"0f",sourceIn:data.audio.sourceIn,sourceOut:data.audio.sourceOut}):null;
 return Rect({scene:data.sceneKey,name:data.title,width:data.width,height:data.height,fill:data.background,children:[background,...layers,audio]});
}
`;
}

/** Model critique stays a proposal; a machine judgment never certifies a recovered project. */
const revisionStructure = z.object({ verdict: z.enum(['revise', 'best-effort', 'unsupported']),
  differences: z.array(z.object({ layerId: id.nullable(), axis: z.enum(['geometry', 'typography', 'color', 'content', 'asset', 'motion', 'timing']), observed: prose(800, 1), target: prose(800, 1) }).strict()).max(64),
  plan: reconstructionPlanSchema,
}).strict();
export const reconstructionRevisionSchema = revisionStructure;
export const reconstructionRevisionJsonSchema = z.toJSONSchema(revisionStructure.extend({ plan: providerStructure }), { target: 'draft-7' });
