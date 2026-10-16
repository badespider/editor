/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';
import { buildReconstructionComponentFactory, buildReconstructionModule, reconstructionJsonSchema, reconstructionPlanSchema } from './reference-reconstruction.ts';
import type { ReconstructionPlan } from './reference-reconstruction.ts';

const finite = z.number().finite();
const identifier = z.string().max(80).regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const prose = (max: number, min = 1) => z.string().min(min).max(max).regex(/^[^\u0000-\u0008\u000b-\u001f\u007f]*$/);
const font = z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/);
const color = z.string().regex(/^#[a-fA-F0-9]{6}$/);
const bindingSchema = z.object({ layerId: identifier, field: z.enum(['text', 'fill', 'fontSize', 'fontFamily', 'letterSpacing']) }).strict();
const parameterSchema = z.object({ id: identifier, label: prose(120), type: z.enum(['text', 'color', 'number', 'font']),
  default: z.union([prose(2000), finite]), minimum: finite.nullable(), maximum: finite.nullable(), bindings: z.array(bindingSchema).min(1).max(64),
}).strict();
const nativeLayer = reconstructionPlanSchema.shape.layers.element.extend({ type: z.enum(['text', 'rect', 'ellipse', 'line']), assetId: z.null(), sourceIn: z.literal(0) });
const nativePlan = reconstructionPlanSchema.safeExtend({ duration: finite.min(1).max(20), assetRequests: z.array(z.never()).max(0), layers: z.array(nativeLayer).min(1).max(64) });
const structure = z.object({ schemaVersion: z.literal(1), id: identifier, name: prose(160), description: prose(2000), tags: z.array(prose(60)).max(16),
  plan: nativePlan, parameters: z.array(parameterSchema).min(1).max(24),
}).strict();

type Parameter = z.infer<typeof parameterSchema>;
type Binding = z.infer<typeof bindingSchema>;
const frame = (time: number) => Math.round(time * 30);
const seconds = (time: number) => frame(time) / 30;
const allowed: Record<Parameter['type'], readonly Binding['field'][]> = { text: ['text'], color: ['fill'], font: ['fontFamily'], number: ['fontSize', 'letterSpacing'] };

function checkValue(parameter: Parameter, value: string | number): void {
  if (parameter.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${parameter.id} requires a finite number`);
    if (parameter.minimum !== null && value < parameter.minimum || parameter.maximum !== null && value > parameter.maximum) throw new Error(`${parameter.id} is outside its declared bounds`);
    for (const binding of parameter.bindings) {
      const [minimum, maximum] = binding.field === 'fontSize' ? [4, 4096] : [-100, 200];
      if (value < minimum || value > maximum) throw new Error(`${parameter.id} exceeds the native ${binding.field} bounds`);
    }
  } else {
    if (typeof value !== 'string') throw new Error(`${parameter.id} requires literal text`);
    if (parameter.type === 'text' && (!prose(2000).safeParse(value).success || !value.trim())) throw new Error(`${parameter.id} requires nonempty literal text of at most 2000 characters`);
    if (parameter.type === 'color' && !color.safeParse(value).success) throw new Error(`${parameter.id} requires a six-digit hex color`);
    if (parameter.type === 'font' && !font.safeParse(value).success) throw new Error(`${parameter.id} requires a native font family name`);
  }
}

/** A learned component is bounded native data, never JavaScript, source media or agent instructions. */
export const learnedMotionSchema = structure.superRefine((component, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  const layers = new Map(component.plan.layers.map(layer => [layer.id, layer]));
  const ids = new Set<string>(), targets = new Set<string>();
  for (const [index, parameter] of component.parameters.entries()) {
    if (ids.has(parameter.id)) issue(['parameters', index, 'id'], 'Parameter IDs must be unique');
    ids.add(parameter.id);
    if (parameter.type !== 'number' && (parameter.minimum !== null || parameter.maximum !== null)) issue(['parameters', index], 'Only numeric parameters declare numeric bounds');
    if (parameter.minimum !== null && parameter.maximum !== null && parameter.minimum > parameter.maximum) issue(['parameters', index], 'Parameter bounds are reversed');
    for (const [bindingIndex, binding] of parameter.bindings.entries()) {
      const path = ['parameters', index, 'bindings', bindingIndex], target = `${binding.layerId}:${binding.field}`, layer = layers.get(binding.layerId);
      if (!layer) issue(path, 'Binding must address an existing native layer');
      if (!allowed[parameter.type].includes(binding.field)) issue(path, 'Parameter type does not match its explicitly allowed binding field');
      if (binding.field !== 'fill' && layer && layer.type !== 'text') issue(path, 'Typography bindings require a text layer');
      if (layer && layer[binding.field] !== parameter.default) issue(path, 'Parameter default must match every bound blueprint field');
      if (targets.has(target)) issue(path, 'A native field can be bound only once');
      targets.add(target);
    }
    try { checkValue(parameter, parameter.default); } catch (error) { issue(['parameters', index, 'default'], (error as Error).message); }
  }
});
export type LearnedMotion = z.infer<typeof learnedMotionSchema>;

// Structured output has no defaults or optional properties, including legacy
// optional static reconstruction controls. Runtime remains compatible with v2.
const provider = z.toJSONSchema(structure, { target: 'draft-7' }) as Record<string, unknown>;
const providerPlan = structuredClone(reconstructionJsonSchema) as Record<string, unknown>;
delete providerPlan.$schema;
const providerPlanProperties = providerPlan.properties as Record<string, Record<string, unknown>>;
providerPlanProperties.duration = { type: 'number', minimum: 1, maximum: 20 };
providerPlanProperties.assetRequests.maxItems = 0;
providerPlanProperties.layers.maxItems = 64;
const providerLayer = (providerPlanProperties.layers.items as { properties: Record<string, Record<string, unknown>> }).properties;
providerLayer.type = { type: 'string', enum: ['text', 'rect', 'ellipse', 'line'] };
providerLayer.assetId = { type: 'null' };
providerLayer.sourceIn = { type: 'number', const: 0 };
(provider.properties as Record<string, unknown>).plan = providerPlan;
export const learnedMotionJsonSchema = provider;

const instantiateOptions = z.object({ values: z.record(identifier, z.union([z.string(), finite])).optional(), duration: finite.min(1 / 30).max(120).optional(),
  format: z.enum(['source', 'landscape', 'portrait']).optional(),
}).strict();
export type LearnedMotionOptions = z.input<typeof instantiateOptions>;

/** Contain and center the artwork; changing aspect ratio does not invent responsive reflow. */
export function instantiateLearnedMotion(input: unknown, options: LearnedMotionOptions = {}): ReconstructionPlan {
  const component = learnedMotionSchema.parse(input), settings = instantiateOptions.parse(options);
  const plan: ReconstructionPlan = structuredClone(component.plan);
  const known = new Set(component.parameters.map(parameter => parameter.id));
  for (const id of Object.keys(settings.values ?? {})) if (!known.has(id)) throw new Error(`Unknown learned parameter: ${id}`);
  for (const parameter of component.parameters) {
    const value = settings.values && Object.hasOwn(settings.values, parameter.id) ? settings.values[parameter.id] : parameter.default;
    checkValue(parameter, value);
    for (const binding of parameter.bindings) {
      const layer = plan.layers.find(layer => layer.id === binding.layerId)!;
      if (binding.field === 'fontSize' || binding.field === 'letterSpacing') layer[binding.field] = value as number;
      else layer[binding.field] = value as string;
    }
  }
  const duration = seconds(settings.duration ?? plan.duration), rate = duration / plan.duration;
  const canvas = settings.format === 'landscape' ? { width: 1920, height: 1080 } : settings.format === 'portrait' ? { width: 1080, height: 1920 } : { width: plan.width, height: plan.height };
  const scale = Math.min(canvas.width / plan.width, canvas.height / plan.height), dx = (canvas.width - plan.width * scale) / 2, dy = (canvas.height - plan.height * scale) / 2;
  plan.layers = plan.layers.map(layer => ({ ...layer, start: seconds(layer.start * rate), end: seconds(layer.end * rate),
    x: layer.x * scale + dx, y: layer.y * scale + dy, width: layer.width * scale, height: layer.height * scale,
    radius: layer.radius * scale, fontSize: layer.type === 'text' ? layer.fontSize * scale : layer.fontSize,
    letterSpacing: layer.type === 'text' ? layer.letterSpacing * scale : layer.letterSpacing,
    keyframes: layer.keyframes.map(point => ({ ...point, time: seconds(point.time * rate), x: point.x * scale + dx, y: point.y * scale + dy, width: point.width * scale, height: point.height * scale })),
  }));
  Object.assign(plan, canvas, { duration });
  // Reject collisions from aggressive retiming rather than discarding keys or
  // layers, and reject impossible scaled typography instead of silently clipping.
  return reconstructionPlanSchema.parse(plan);
}

/** Remove only unused timeline outside all layer lifetimes. This does not infer
 * whether a present layer is visible, or remove holds within the component. */
export function trimLearnedMotionTimeline(input: unknown): { component: LearnedMotion; offset: number } {
  const component = learnedMotionSchema.parse(input), plan = component.plan;
  const first = Math.min(...plan.layers.map(layer => frame(layer.start)));
  const last = Math.max(...plan.layers.map(layer => frame(layer.end)));
  if (last - first < 30 || first === 0 && last === frame(plan.duration)) return { component, offset: 0 };
  const trimmed = structuredClone(component);
  trimmed.plan.duration = (last - first) / 30;
  trimmed.plan.layers = trimmed.plan.layers.map(layer => ({ ...layer, start: (frame(layer.start) - first) / 30, end: (frame(layer.end) - first) / 30,
    keyframes: layer.keyframes.map(point => ({ ...point, time: (frame(point.time) - first) / 30 })),
  }));
  return { component: learnedMotionSchema.parse(trimmed), offset: first / 30 };
}

export function buildLearnedMotionModule(input: unknown, options: LearnedMotionOptions & { sceneKey?: string } = {}): string {
  const { sceneKey, ...settings } = options;
  return buildReconstructionModule(instantiateLearnedMotion(input, settings), { sceneKey: sceneKey ?? 'learned-motion', bindings: [], audio: null });
}

/** Content-independent structural identity. Hash this canonical string in the Node store. */
export function learnedMotionFingerprint(input: unknown): string {
  const { plan, parameters } = learnedMotionSchema.parse(input), digits = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
  const layerIndices = new Map(plan.layers.map((layer, index) => [layer.id, index]));
  const geometry = (point: { x: number; y: number; width: number; height: number; rotation: number; opacity: number }) => ({ x: digits(point.x / plan.width), y: digits(point.y / plan.height), width: digits(point.width / plan.width), height: digits(point.height / plan.height), rotation: digits(point.rotation), opacity: digits(point.opacity) });
  return JSON.stringify({ version: 1, layers: plan.layers.map(layer => ({ type: layer.type, start: digits(layer.start / plan.duration), end: digits(layer.end / plan.duration), ...geometry(layer),
    radius: digits(layer.radius / Math.min(plan.width, plan.height)), scaleX: layer.scaleX ?? 1, scaleY: layer.scaleY ?? 1, clipToBox: layer.clipToBox ?? false,
    ...(layer.type === 'text' ? { fontSize: digits(layer.fontSize / plan.height), fontWeight: layer.fontWeight, fontStyle: layer.fontStyle, textAlign: layer.textAlign, letterSpacing: digits(layer.letterSpacing / plan.width), leading: layer.leading } : {}),
    keyframes: layer.keyframes.map(point => ({ time: digits(point.time / plan.duration), ...geometry(point), scale: point.scale, easing: point.easing })),
  })), parameters: parameters.map(parameter => ({ type: parameter.type, bindings: parameter.bindings.map(binding => ({ layer: layerIndices.get(binding.layerId), field: binding.field })).sort((a, b) => a.layer! - b.layer! || a.field.localeCompare(b.field)) })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) });
}

const mixInstanceSchema = z.object({ key: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/), component: learnedMotionSchema,
  values: z.record(identifier, z.union([z.string(), finite])).optional(), start: finite.min(0).max(120), end: finite.positive().max(120),
  box: z.object({ x: finite.nonnegative(), y: finite.nonnegative(), width: finite.min(32).max(4096), height: finite.min(32).max(4096) }).strict(),
}).strict();
const mixSchema = z.object({ instances: z.array(mixInstanceSchema).min(1).max(24), width: finite.int().min(2).max(4096), height: finite.int().min(2).max(4096), duration: finite.positive().max(120),
  sceneKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/).optional(),
}).strict();
export type LearnedMotionMix = z.input<typeof mixSchema>;

/** Ordered, clipped native instances each retain their own local animation clock. */
export function buildLearnedMotionMixModule(input: LearnedMotionMix): string {
  const settings = mixSchema.parse(input), ids = new Set<string>(), nodeKeys = new Set(['learned-mix-background']), duration = seconds(settings.duration);
  if (settings.width * settings.height > 8_294_400) throw new Error('Mix exceeds the native canvas pixel budget');
  const instances = settings.instances.map(item => {
    if (ids.has(item.key)) throw new Error(`Duplicate learned instance key: ${item.key}`);
    ids.add(item.key);
    const start = seconds(item.start), end = seconds(item.end);
    if (end <= start || end > duration) throw new Error(`${item.key} lifetime must fit inside the mix`);
    if (item.box.x + item.box.width > settings.width || item.box.y + item.box.height > settings.height) throw new Error(`${item.key} box must fit inside the mix`);
    const plan = instantiateLearnedMotion(item.component, { values: item.values, duration: end - start });
    for (const key of [item.key, `${item.key}-fit`, `${item.key}-artwork`, `${item.key}-artwork-background`, ...plan.layers.map(layer => `${item.key}-artwork-${layer.id}`)]) {
      if (nodeKeys.has(key)) throw new Error(`Learned mix native key collision: ${key}`);
      nodeKeys.add(key);
    }
    const scale = Math.min(item.box.width / plan.width, item.box.height / plan.height);
    return { key: item.key, start, end, box: item.box, scale, width: plan.width, height: plan.height, x: (item.box.width - plan.width) / 2, y: (item.box.height - plan.height) / 2,
      factory: buildReconstructionComponentFactory(plan, `${item.key}-artwork`) };
  });
  if (settings.instances.reduce((sum, item) => sum + item.component.plan.layers.length, 0) > 240) throw new Error('Mix exceeds 240 native artwork layers');
  const data = { width: settings.width, height: settings.height, duration, sceneKey: settings.sceneKey ?? 'learned-motion-mix', instances: instances.map(({ factory: _factory, ...item }) => item) };
  return `import { Rect, Text } from "dapi-host:@diffusionstudio/jsx";
const data=${JSON.stringify(data)};
const factories=[${instances.map(item => item.factory).join(',\n')}];
export const learnedMotionMixManifest=data;
export default function Project(){
 const background=Rect({key:"learned-mix-background",start:"0f",end:Math.round(data.duration*30)+"f",width:data.width,height:data.height,fill:"#101010"});
 const children=data.instances.map((item,index)=>Rect({key:item.key,name:"Learned mix / "+item.key,start:Math.round(item.start*30)+"f",end:Math.round(item.end*30)+"f",x:item.box.x,y:item.box.y,width:item.box.width,height:item.box.height,clipToBox:true,children:Rect({key:item.key+"-fit",x:item.x,y:item.y,width:item.width,height:item.height,scale:item.scale,children:factories[index]()})}));
 return Rect({scene:data.sceneKey,name:"Learned native motion mix",width:data.width,height:data.height,fill:"#101010",children:[background,...children]});
}
`;
}
