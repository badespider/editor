import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { adaptScene, motionDigest, sceneInputSchema, sceneRecipeSchema, styleDimensions, type ScenePose, type SceneRecipe } from './scene-motion.ts';
import { preflightScene } from './scene-quality.ts';
import { reflowSceneLayout, sceneLayoutOptionsSchema } from './scene-layout.ts';

const id = z.string().regex(/^[a-z][a-z0-9-]{0,59}$/);
const label = z.string().trim().min(1).max(1000);
const color = z.string().regex(/^#[a-fA-F0-9]{6}$/);
const dimension = z.number().int().min(1).max(16384);
const fontFamily = z.string().regex(/^[\p{L}\p{N} _-]{1,80}$/u);
const metadata = z.object({ id, version: z.number().int().min(1).max(9999), name: label, description: label,
  tags: z.array(id).min(1).max(16), origin: label, limitations: z.array(label).min(1).max(16),
  requirements: z.object({ framing: label, typography: label, motion: label, rhythm: label }).strict(),
  design: z.object({ width: dimension, height: dimension }).strict(),
  duration: z.object({ min: z.number().positive().max(60), max: z.number().positive().max(60) }).strict()
    .refine(d => d.min <= d.max, 'Duration bounds are reversed'),
}).strict();

/** Portable data only. No executable snippets, source paths, words, cached frames or review approval. */
export const motionCatalogEntrySchema = metadata.extend({ schemaVersion: z.literal(1), kind: z.literal('motion-catalog-entry'),
  sourceRecipeSha256: z.string().regex(/^[a-f0-9]{64}$/),
  block: sceneRecipeSchema.shape.templates.element,
  caption: sceneRecipeSchema.shape.caption,
}).strict();
export type MotionCatalogEntry = z.infer<typeof motionCatalogEntrySchema>;

const selection = z.object({ shotId: z.string().min(1).max(80), template: z.string().regex(/^[a-z][a-z0-9-]{0,59}@[1-9][0-9]{0,3}$/),
  text: z.record(z.string(), z.string().trim().min(1).max(120)),
  colors: z.record(color, color).default({}), fontFamily: fontFamily.optional(),
}).strict();
export const motionCatalogRequestSchema = z.object({ input: sceneInputSchema,
  instances: z.array(selection).min(1).max(16),
  captionFromShot: z.string().min(1).max(80).optional(),
  mediaDimensions: z.record(z.string(), z.object({ width: dimension, height: dimension }).strict()),
  layout: sceneLayoutOptionsSchema.optional(),
}).strict();

function selector(value: string) {
  const result = /^([a-z][a-z0-9-]{0,59})@([1-9][0-9]{0,3})$/.exec(value);
  if (!result) throw Error('Pin a catalog version as name@1 (no implicit latest)');
  return { id: result[1], version: Number(result[2]) };
}
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw Error(`Duplicate ${label}`);
}
export function describeMotionEntry(raw: unknown) {
  const entry = motionCatalogEntrySchema.parse(raw);
  const media = entry.block.layers.filter(l => l.kind === 'image' || l.kind === 'video');
  const cues = [...entry.block.layers, ...(entry.block.groups ?? [])].flatMap(l => l.keys)
    .flatMap(k => typeof k.at === 'number' ? [] : [k.at.cue]);
  const colors = [entry.block.background, entry.caption.font.color, entry.caption.stroke,
    ...entry.block.layers.flatMap(l => [l.fill, l.stroke, l.font?.color])].filter((c): c is string => !!c);
  return { selector: `${entry.id}@${entry.version}`, sha256: motionDigest(entry), name: entry.name, description: entry.description,
    tags: entry.tags, origin: entry.origin, limitations: entry.limitations, design: entry.design, duration: entry.duration,
    textSlots: entry.block.layers.filter(l => l.kind === 'text').map(l => l.id),
    mediaSlots: [...new Map(media.map(l => [l.slot!, { slot: l.slot!, kind: l.kind }])).values()],
    cues: [...new Set(cues)], colors: [...new Set(colors)],
    controls: ['text by layer ID', 'media by slot', 'named speech cues', 'shot duration', 'color replacement', 'font family', 'contain layout to output dimensions'],
    status: 'draft_template_requires_fresh_output_review', safeToAutoPublish: false };
}

function validateEntry(raw: unknown): MotionCatalogEntry {
  const entry = motionCatalogEntrySchema.parse(raw), block = entry.block;
  unique(block.layers.map(l => l.id), 'layer ID'); unique((block.groups ?? []).map(g => g.id), 'group ID');
  const slots = new Map<string, string>();
  for (const layer of block.layers) {
    if (layer.kind === 'image' || layer.kind === 'video') {
      if (!layer.slot) throw Error('Media needs a named slot');
      if (slots.has(layer.slot) && slots.get(layer.slot) !== layer.kind) throw Error('Media slot mixes image and video');
      slots.set(layer.slot, layer.kind);
    }
    if (layer.group && !block.groups?.some(g => g.id === layer.group)) throw Error('Unknown catalog group');
    if (layer.kind === 'text' && (!layer.text || !layer.font)) throw Error('Text needs a label and font');
    if (layer.kind === 'video' && (layer.mask || layer.motionBlur || layer.shadow || [layer.pose, ...layer.keys.map(k => k.pose)]
      .some(p => p.blur || p.skewX || (p.reveal !== undefined && p.reveal !== 1)))) throw Error('Unsupported native video effect');
  }
  for (const element of [...block.layers, ...(block.groups ?? [])]) {
    let previous = -1;
    for (const key of element.keys) {
      if (!Object.keys(key.pose).length) throw Error('Empty catalog keyframe');
      if (typeof key.at === 'number') { if (key.at <= previous) throw Error('Unordered catalog keyframes'); previous = key.at; }
    }
  }
  for (const group of block.groups ?? []) {
    let pose = group.pose;
    for (const patch of [group.pose, ...group.keys.map(k => k.pose)]) {
      pose = { ...pose, ...patch };
      if (Math.abs(pose.width - pose.height) > .00001 || pose.blur || pose.skewX || pose.reveal !== 1) throw Error('Groups require uniform scale');
    }
  }
  return entry;
}

/** Capture an editable candidate, not an automatic promotion of reference content. */
export function captureMotionEntry(recipeInput: unknown, templateId: string, metadataInput: unknown) {
  const recipe = sceneRecipeSchema.parse(recipeInput), meta = metadata.parse(metadataInput);
  const block = structuredClone(recipe.templates.find(t => t.id === templateId));
  if (!block) throw Error('Unknown source template');
  // All source-specific text becomes an explicit substitution slot. Media paths
  // and source/transcript data live in input and are never read by capture.
  for (const layer of block.layers) if (layer.kind === 'text') layer.text = layer.id;
  return validateEntry({ ...meta, schemaVersion: 1, kind: 'motion-catalog-entry', sourceRecipeSha256: motionDigest(recipe),
    block, caption: recipe.caption });
}

/** Immutable version files; an edited/corrupt/symlinked version is never silently reused. */
export class MotionCatalog {
  readonly root: string;
  constructor(root: string) { this.root = resolve(root); }
  private async directory(name: string, create = false) {
    id.parse(name);
    if (create) await mkdir(this.root, { recursive: true });
    const root = await realpath(this.root), path = join(root, name);
    if (create) await mkdir(path, { recursive: true });
    if (!(await lstat(path)).isDirectory() || await realpath(path) !== path) throw Error('Catalog entry directories must not be symlinks');
    return path;
  }
  async get(value: string) {
    const pin = selector(value), path = join(await this.directory(pin.id), `${pin.version}.json`), info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 512 * 1024) throw Error('Invalid or oversized catalog file');
    const stored = JSON.parse(await readFile(path, 'utf8'));
    const entry = validateEntry(stored.entry);
    if (entry.id !== pin.id || entry.version !== pin.version || motionDigest(entry) !== stored.sha256) throw Error('Catalog version fingerprint/identity changed');
    return entry;
  }
  async add(raw: unknown) {
    const entry = validateEntry(raw), bytes = JSON.stringify({ sha256: motionDigest(entry), entry }, null, 2) + '\n';
    if (Buffer.byteLength(bytes) > 512 * 1024) throw Error('Catalog entry exceeds the 512 KiB budget');
    const path = join(await this.directory(entry.id, true), `${entry.version}.json`);
    await writeFile(path, bytes, { flag: 'wx' });
    return { path, ...describeMotionEntry(entry) };
  }
  async list(query = '') {
    const results: ReturnType<typeof describeMotionEntry>[] = [];
    for (const folder of (await readdir(this.root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!id.safeParse(folder.name).success || !folder.isDirectory()) continue;
      for (const name of (await readdir(await this.directory(folder.name))).sort()) {
        if (!/^[1-9][0-9]{0,3}\.json$/.test(name)) continue;
        if (results.length >= 500) throw Error('Catalog exceeds 500-version scan budget; split libraries');
        results.push(describeMotionEntry(await this.get(`${folder.name}@${name.slice(0, -5)}`)));
      }
    }
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return results.filter(r => terms.every(t => `${r.selector} ${r.name} ${r.description} ${r.tags.join(' ')}`.toLowerCase().includes(t)));
  }
  async apply(raw: unknown) {
    const request = motionCatalogRequestSchema.parse(raw), pins = [...new Set(request.instances.map(i => i.template))];
    return composeMotionCatalog(await Promise.all(pins.map(p => this.get(p))), request);
  }
}

export async function findMotionCatalogRoot(from = process.cwd()) {
  for (const start of [from, dirname(process.argv[1] ?? from)]) {
    let path = resolve(start);
    for (;;) {
      try { if ((await lstat(join(path, 'motion-catalog'))).isDirectory()) return join(path, 'motion-catalog'); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      if (dirname(path) === path) break; path = dirname(path);
    }
  }
  throw Error('Run inside the editor checkout or specify --catalog <directory>');
}

/** Adapt a design as a contained canvas; group scale remains uniform in pixel space. */
function layout(entry: MotionCatalogEntry, width: number, height: number) {
  const scale = Math.min(width / entry.design.width, height / entry.design.height);
  const fx = entry.design.width * scale / width, fy = entry.design.height * scale / height;
  const fontScale = Math.min(entry.design.width, entry.design.height) * scale / Math.min(width, height);
  const pose = (p: ScenePose, group = false): ScenePose => ({ ...p, x: .5 + (p.x - .5) * fx, y: .5 + (p.y - .5) * fy,
    width: p.width * (group ? 1 : fx), height: p.height * (group ? 1 : fy) });
  return { pose, fontScale, box: (b: SceneRecipe['caption']['box']) => ({ x: .5 + (b.x - .5) * fx, y: .5 + (b.y - .5) * fy, width: b.width * fx, height: b.height * fy }) };
}

function mapPath(path:NonNullable<SceneRecipe['templates'][number]['layers'][number]['keys'][number]['path']>,transform:ReturnType<typeof layout>){
  const point=(x:number,y:number)=>transform.pose({x,y,width:1,height:1,rotation:0,opacity:1,blur:0,skewX:0,reveal:1});
  const a=point(path.x1,path.y1),b=point(path.x2,path.y2);return {x1:a.x,y1:a.y,x2:b.x,y2:b.y};
}

/** Same validated scene/render/review pipeline; approval and original-reference claims are never imported. */
export function composeMotionCatalog(rawEntries: unknown[], rawRequest: unknown) {
  const entries = rawEntries.map(validateEntry), request = motionCatalogRequestSchema.parse(rawRequest);
  unique(entries.map(e => `${e.id}@${e.version}`), 'catalog version'); unique(request.instances.map(i => i.shotId), 'shot selection');
  const input = structuredClone(request.input), warnings: string[] = [];
  if (request.instances.length !== input.shots.length || request.instances.some(i => !input.shots.some(s => s.id === i.shotId))) throw Error('Select exactly one template for every shot');
  const used = request.instances.map(i => {
    const entry = entries.find(e => `${e.id}@${e.version}` === i.template);
    if (!entry) throw Error(`Missing pinned entry: ${i.template}`); return entry;
  });
  const templates = request.instances.map((instance, index) => {
    const entry = used[index], info = describeMotionEntry(entry), shot = input.shots.find(s => s.id === instance.shotId)!;
    if (shot.end - shot.start < entry.duration.min || shot.end - shot.start > entry.duration.max) throw Error(`Shot ${shot.id} exceeds ${info.selector} duration limits`);
    if (info.textSlots.some(s => !Object.hasOwn(instance.text, s)) || Object.keys(instance.text).some(s => !info.textSlots.includes(s))) throw Error(`Supply exactly these text slots: ${info.textSlots.join(', ')}`);
    if (Object.keys(instance.colors).some(c => !info.colors.includes(c))) throw Error('Unknown source palette color');
    if (Object.keys(shot.cues ?? {}).some(c => !info.cues.includes(c)) || info.cues.some(c => !shot.cues?.[c])) throw Error(`Supply exactly these speech cues: ${info.cues.join(', ')}`);
    const block = structuredClone(entry.block), transform = layout(entry, input.width, input.height);
    const paint = (c: string) => instance.colors[c] ?? c;
    block.id = `catalog-${index}`; block.background = paint(block.background);
    shot.templateId = block.id; shot.criteria = [...styleDimensions];
    for (const group of block.groups ?? []) {
      let p = group.pose; group.pose = transform.pose(p, true);
      group.keys = group.keys.map(k => { p = { ...p, ...k.pose }; return { ...k, pose: transform.pose(p, true), ...(k.path?{path:mapPath(k.path,transform)}:{}) }; });
    }
    for (const layer of block.layers) {
      let fit = (p: ScenePose) => transform.pose(p);
      if (layer.kind === 'image' || layer.kind === 'video') {
        const binding = shot.bindings.find(b => b.slot === layer.slot), asset = input.assets.find(a => a.id === binding?.assetId);
        const dims = asset && request.mediaDimensions[asset.id];
        if (!binding || !asset || asset.kind !== layer.kind || !dims) throw Error(`Missing media/dimensions for ${layer.slot}`);
        const aspect = dims.width * (binding.crop?.width ?? 1) / (dims.height * (binding.crop?.height ?? 1));
        fit = p => { const result = transform.pose(p), boxAspect = result.width * input.width / (result.height * input.height);
          if (aspect > boxAspect) result.height = result.width * input.width / aspect / input.height;
          else result.width = result.height * input.height * aspect / input.width;
          return result; };
      }
      let p = layer.pose; layer.pose = fit(p);
      layer.keys = layer.keys.map(k => { p = { ...p, ...k.pose }; return { ...k, pose: fit(p), ...(k.path?{path:mapPath(k.path,transform)}:{}) }; });
      layer.fill = paint(layer.fill); layer.stroke = paint(layer.stroke);
      if (layer.font) layer.font = { ...layer.font, family: instance.fontFamily ?? layer.font.family,
        color: paint(layer.font.color), size: Math.max(layer.textLayout?.minFontSize??.012, layer.font.size * transform.fontScale) };
      if (layer.kind === 'text') {
        layer.text = instance.text[layer.id];
        if (layer.text.length > 40) warnings.push(`${shot.id}/${layer.id}: long text auto-fits; inspect native-size readability.`);
      }
    }
    if (entry.design.width / entry.design.height !== input.width / input.height) warnings.push(`${shot.id}: contained layout changes occupied area; inspect framing and text at the new aspect ratio.`);
    return block;
  });
  const captionIndex = request.captionFromShot ? request.instances.findIndex(i => i.shotId === request.captionFromShot) : 0;
  if (captionIndex < 0) throw Error('Unknown captionFromShot');
  const caption = structuredClone(used[captionIndex].caption), instance = request.instances[captionIndex];
  const transform = layout(used[captionIndex], input.width, input.height);
  caption.box = transform.box(caption.box); caption.font.size = Math.max(.012, caption.font.size * transform.fontScale);
  caption.minFontSize = Math.max(.02, caption.minFontSize * transform.fontScale);
  caption.font.family = instance.fontFamily ?? caption.font.family;
  caption.font.color = instance.colors[caption.font.color] ?? caption.font.color;
  if (caption.stroke) caption.stroke = instance.colors[caption.stroke] ?? caption.stroke;
  const distinct = [...new Map(used.map(e => [`${e.id}@${e.version}`, e])).values()];
  const recipe: SceneRecipe = { schemaVersion: 1, kind: 'scene-motion-recipe', compositor: 'layered-v2', templates, caption,
    style: { name: 'Catalog adaptation', basis: 'catalog', catalogEntries: distinct.map(e => ({ id: e.id, version: e.version, sha256: motionDigest(e) })),
      references: [], criteria: styleDimensions.map(d => ({ id: d, dimension: d, essential: true,
        requirement: distinct.map(e => `${e.id}@${e.version}: ${e.requirements[d]}`).join('\n'), evidence: [] })),
      avoid: ['Do not inherit prior footage approval or claim original-reference fidelity.'],
      uncertainties: ['New footage, crops, timing and dimensions require fresh render inspection and listening.'] } };
  const reflow=request.layout?reflowSceneLayout(recipe,input,request.layout):null;
  const adaptation = adaptScene(reflow?.recipe??recipe, reflow?.input??input);
  return { recipe: adaptation.recipe, input: adaptation.input, preflight: preflightScene(adaptation),
    receipt: { schemaVersion: 1, kind: 'motion-catalog-use', entries: recipe.style.catalogEntries, requestSha256: motionDigest(request), ...(reflow?{layout:reflow.report}:{}),
      recipeSha256: motionDigest(adaptation.recipe), inputSha256: motionDigest(adaptation.input), origins: distinct.map(e => ({ id: e.id, origin: e.origin, sourceRecipeSha256: e.sourceRecipeSha256 })),
      warnings: [...warnings, ...adaptation.warnings], status: 'draft', safeToAutoPublish: false } };
}
