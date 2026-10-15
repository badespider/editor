import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
const slug = z.string().regex(/^[a-z][a-z0-9-]{0,62}$/);
const key = z.string().regex(/^[a-z][a-z0-9-]{0,62}@[1-9]\d{0,5}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const seconds = z.number().finite().nonnegative().max(7200);
const aspect = z.enum(['landscape', 'portrait', 'square']);
const placement = z.enum(['direction', 'full-frame', 'overlay']);
const implementationSchema = z.object({
  id: slug, renderer: z.enum(['editor', 'hyperframes', 'remotion', 'html']),
  aspects: z.array(aspect).min(1).max(3),
  placements: z.array(z.enum(['full-frame', 'overlay'])).min(1).max(2),
  limits: z.array(text(700)).min(1).max(12),
}).strict();
export const creativeTechniqueSchema = z.object({
  id: slug, version: z.number().int().min(1).max(999999), skillId: slug,
  title: text(120), category: z.enum(['structure', 'editorial', 'visual', 'typography', 'audio', 'transition']),
  useWhen: z.array(text(400)).min(1).max(12),
  preserve: z.array(text(400)).min(1).max(12),
  adapt: z.array(text(400)).min(1).max(12),
  avoidWhen: z.array(text(400)).min(1).max(12),
  placements: z.array(placement).min(1).max(3),
  implementations: z.array(implementationSchema).max(8),
}).strict();
export const creativeLibrarySchema = z.object({ schemaVersion: z.literal(1), techniques: z.array(creativeTechniqueSchema).min(1).max(256) }).strict();
const useSchema = z.object({
  technique: key, start: seconds, end: seconds,
  role: z.enum(['lead', 'support', 'direction']), placement,
  implementation: slug.nullable(), reason: text(1200),
  changes: z.object({ content: text(1200), layout: text(1200), timing: text(1200) }).strict(),
}).strict();
export const creativeRequestSchema = z.object({
  schemaVersion: z.literal(1), topic: text(300), audience: text(500), promise: text(800), payoff: text(800),
  spine: text(1200), duration: z.number().finite().positive().max(7200), aspect,
  brand: z.object({ palette: z.object({ background: z.string().regex(/^#[a-f0-9]{6}$/i), foreground: z.string().regex(/^#[a-f0-9]{6}$/i), accent: z.string().regex(/^#[a-f0-9]{6}$/i) }).strict(), fontFamily: text(80), motionTone: text(400) }).strict().nullable(),
  signatureMotif: text(600).nullable(),
  beats: z.array(z.object({
    id: slug, start: seconds, end: seconds, purpose: text(1200),
    picture: text(1200), sourceEvidence: z.array(text(400)).max(30), quiet: z.boolean(),
    uses: z.array(useSchema).max(12),
  }).strict()).min(1).max(120),
}).strict();
export const creativePlanSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal('creative-composition-plan'),
  status: z.literal('planning-only'), renderable: z.literal(false),
  request: creativeRequestSchema,
  pins: z.array(z.object({ key, fingerprint: digest }).strict()).max(256),
}).strict();
const historySchema = z.array(z.object({
  videoId: text(160), leadSequence: z.array(key).max(120), signatureMotif: text(600).nullable(),
}).strict()).max(10);

type Technique = z.infer<typeof creativeTechniqueSchema>;
export type CreativeRequest = z.infer<typeof creativeRequestSchema>;
export type CreativePlan = z.infer<typeof creativePlanSchema>;
export type CreativeLibrary = { techniques: Array<Technique & { key: string; fingerprint: string; instructions: string; path: string }> };
type Finding = { severity: 'error' | 'warning'; code: string; message: string; beatId?: string };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

async function readScoped(root: string, path: string, maximum: number) {
  const file = await realpath(resolve(root, path));
  const rel = relative(root, file);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('Creative library files must remain inside the selected checkout');
  const bytes = await readFile(file);
  if (bytes.length > maximum) throw new Error(`Creative library file exceeds ${maximum} bytes`);
  return bytes.toString('utf8').replaceAll('\r\n', '\n');
}

/** Intentional repo-authored data only: no auto-import, model call, plugin execution or file writes. */
export async function loadCreativeLibrary(repositoryRoot: string): Promise<CreativeLibrary> {
  const root = await realpath(resolve(repositoryRoot));
  const raw = creativeLibrarySchema.parse(JSON.parse(await readScoped(root, 'creative-library/techniques.json', 1024 * 1024)));
  const seen = new Set<string>();
  const techniques: CreativeLibrary['techniques'] = [];
  for (const descriptor of raw.techniques) {
    const identity = `${descriptor.id}@${descriptor.version}`;
    if (seen.has(identity)) throw new Error(`Duplicate technique ${identity}`);
    seen.add(identity);
    const implIds = descriptor.implementations.map(impl => impl.id);
    if (new Set(implIds).size !== implIds.length) throw new Error(`Duplicate implementation in ${identity}`);
    for (const impl of descriptor.implementations) {
      if (impl.placements.some(p => !descriptor.placements.includes(p))) throw new Error(`Implementation placement not declared by ${identity}`);
    }
    const path = `.agents/skills/${descriptor.skillId}/SKILL.md`;
    const instructions = await readScoped(root, path, 64 * 1024);
    if (!instructions.startsWith(`---\nname: ${descriptor.skillId}\n`)) throw new Error(`Skill metadata mismatch for ${identity}`);
    techniques.push({ ...descriptor, key: identity, path, instructions,
      fingerprint: hash(JSON.stringify(descriptor) + '\n' + instructions) });
  }
  return { techniques };
}

export function listCreativeTechniques(library: CreativeLibrary) {
  return library.techniques.map(({ instructions: _instructions, ...entry }) => structuredClone(entry));
}
export function showCreativeTechnique(identity: string, library: CreativeLibrary) {
  key.parse(identity);
  const found = library.techniques.find(entry => entry.key === identity);
  if (!found) throw new Error(`Unknown technique ${identity}; choose an exact version from creative list`);
  return structuredClone(found);
}
function leadSequence(request: CreativeRequest) {
  return request.beats.flatMap(beat => [...beat.uses].sort((a, b) => a.start - b.start).filter(use => use.role === 'lead').map(use => use.technique));
}

/** Authoring stays with the agent; the module pins choices and checks their mechanical constraints. */
export function draftCreativePlan(input: unknown, library: CreativeLibrary) {
  const request = creativeRequestSchema.parse(input);
  const identities = [...new Set(request.beats.flatMap(beat => beat.uses.map(use => use.technique)))];
  const pins = identities.map(identity => { const entry = showCreativeTechnique(identity, library); return { key: identity, fingerprint: entry.fingerprint }; });
  const plan = creativePlanSchema.parse({ schemaVersion: 1, kind: 'creative-composition-plan', status: 'planning-only', renderable: false, request, pins });
  const report = checkCreativePlan(plan, library);
  if (!report.structuralPass) throw new Error(report.findings.filter(f => f.severity === 'error').map(f => `${f.code}: ${f.message}`).join('\n'));
  return plan;
}

export function checkCreativePlan(input: unknown, library: CreativeLibrary, historyInput: unknown = []) {
  const plan = creativePlanSchema.parse(input), history = historySchema.parse(historyInput);
  const { request } = plan;
  const findings: Finding[] = [];
  const add = (severity: Finding['severity'], code: string, message: string, beatId?: string) => findings.push({ severity, code, message, ...(beatId ? { beatId } : {}) });
  const selected = new Set(request.beats.flatMap(beat => beat.uses.map(use => use.technique)));
  if (request.brand === null && request.beats.some(beat => beat.uses.some(use => use.placement !== 'direction'))) add('error', 'graphic-brand-missing', 'Planned graphics need shared art direction; use brand: null only for a direction-only, graphics-free plan');
  const pinned = new Map<string, string>();
  for (const pin of plan.pins) {
    if (pinned.has(pin.key)) add('error', 'duplicate-pin', `Duplicate pin ${pin.key}`);
    pinned.set(pin.key, pin.fingerprint);
    if (!selected.has(pin.key)) add('error', 'unused-pin', `Pin ${pin.key} has no use`);
  }
  for (const identity of selected) {
    const entry = library.techniques.find(t => t.key === identity);
    if (!entry) add('error', 'unknown-technique', `Technique ${identity} is absent from this checkout`);
    else if (pinned.get(identity) !== entry.fingerprint) add('error', 'stale-pin', `Instruction or descriptor bytes changed for ${identity}; reread and deliberately revise the plan`);
  }
  const ids = new Set<string>();
  let previousEnd = 0;
  let evidenceCount = 0;
  const buildRequired: Array<{ beatId: string; technique: string; reason: string }> = [];
  for (const beat of request.beats) {
    if (ids.has(beat.id)) add('error', 'duplicate-beat', `Repeated beat ID ${beat.id}`, beat.id);
    ids.add(beat.id);
    if (beat.end <= beat.start || beat.end > request.duration || beat.start < previousEnd) add('error', 'beat-timing', 'Beats must be ordered, nonoverlapping, positive and inside the episode', beat.id);
    previousEnd = beat.end;
    evidenceCount += beat.sourceEvidence.length;
    for (const use of beat.uses) {
      if (use.end <= use.start || use.start < beat.start || use.end > beat.end) add('error', 'use-timing', 'Technique windows must be positive and within their beat', beat.id);
      const entry = library.techniques.find(t => t.key === use.technique);
      if (!entry) continue;
      if (!entry.placements.includes(use.placement)) add('error', 'placement-unsupported', `${use.technique} does not support ${use.placement}`, beat.id);
      if ((use.role === 'direction') !== (use.placement === 'direction')) add('error', 'direction-is-not-pixels', 'Borrowed design rules use direction role/placement; actual graphics use lead/support', beat.id);
      if (use.placement === 'direction') {
        if (use.implementation !== null) add('error', 'direction-has-adapter', 'Design guidance does not instantiate a renderer implementation', beat.id);
      } else {
        if (beat.quiet) add('error', 'quiet-has-graphics', 'A declared quiet beat cannot contain planned graphic layers', beat.id);
        if (use.placement === 'full-frame' && use.role !== 'lead') add('error', 'full-frame-owner', 'A full-frame visual owns the picture; assign lead or borrow its rules as direction', beat.id);
        if (use.implementation === null) buildRequired.push({ beatId: beat.id, technique: use.technique, reason: 'New implementation/adaptation required; no existing renderer compatibility claimed' });
        else {
          const impl = entry.implementations.find(i => i.id === use.implementation);
          if (!impl || !impl.aspects.includes(request.aspect) || !impl.placements.includes(use.placement)) add('error', 'implementation-unsupported', `${use.technique}/${use.implementation} does not support this aspect/placement; choose another or declare a new build`, beat.id);
        }
      }
    }
    for (let a = 0; a < beat.uses.length; a++) for (let b = a + 1; b < beat.uses.length; b++) {
      const first = beat.uses[a], second = beat.uses[b];
      if (first.end <= second.start || second.end <= first.start) continue;
      if (first.role === 'lead' && second.role === 'lead') add('error', 'competing-leads', 'Two overlapping visual leads compete for the same moment; sequence them or author one coordinated hybrid', beat.id);
      if (first.placement === 'full-frame' && second.placement === 'full-frame') add('error', 'opaque-frame-collision', 'Two overlapping full-frame scenes are not a composited hybrid', beat.id);
    }
    // Count simultaneous painted techniques, not total uses or editorial guidance.
    const painted = beat.uses.filter(use => use.placement !== 'direction');
    if (painted.some(a => painted.filter(b => b.start <= a.start && b.end > a.start).length > 2)) add('warning', 'attention-density', 'More than two graphic techniques are active together; inspect reading time, protected picture and visual priority', beat.id);
  }
  if (!request.beats.some(beat => beat.quiet)) add('warning', 'no-quiet-beat', 'No quiet beat is declared; assess whether the story needs breathing room rather than imposing a quota');
  if (evidenceCount === 0) add('warning', 'unbound-content', 'No source evidence supplied: this is an illustrative planning proof, not a footage edit or speech-synchronized output');
  if (buildRequired.length) add('warning', 'new-build-required', `${buildRequired.length} visual use${buildRequired.length === 1 ? ' requires' : 's require'} newly authored implementations`);
  const sequence = leadSequence(request);
  for (const past of history) {
    if (sequence.length > 0 && JSON.stringify(sequence) === JSON.stringify(past.leadSequence)) add('warning', 'repeated-sequence', `Same declared lead-technique sequence as ${past.videoId}; keep it if it serves this story, or choose a meaningful variation`);
    if (request.signatureMotif !== null && past.signatureMotif !== null && request.signatureMotif.toLowerCase() === past.signatureMotif.toLowerCase()) add('warning', 'repeated-motif', `Same declared motif as ${past.videoId}; this is a wording comparison, not pixel-level originality analysis`);
  }
  return {
    kind: 'creative-planning-check' as const, structuralPass: !findings.some(f => f.severity === 'error'),
    renderable: false as const, userApproved: false as const, sourceVerified: false as const,
    speechSyncVerified: false as const, aestheticUniquenessVerified: false as const,
    binding: evidenceCount ? 'evidence-references-supplied-not-verified' : 'unbound',
    history: { suppliedCount: history.length, inspectedVideos: 0, leadSequence: sequence, note: 'Only explicitly supplied choices were compared. No automatic history scan, random rotation or engagement claim.' },
    buildRequired, findings,
    handoff: ['Read each selected skill and its relevant references; keep new footage and source clocks separate from reference timings.',
      'Adapt to the shared brand and the actual beat. For a coordinated hybrid, implement one scene; do not stack opaque proofs.',
      'Author separate supported source-bound plans/recipes, resolve new-build gaps, and inspect the actual picture and sound.',
      'Keep normal renderer, preview-approval and actual-export review gates. A planning check never approves or executes a video.'],
  };
}

export function creativeWorkflow() {
  return { schemaVersion: 1, kind: 'creative-composition-workflow', providerRequired: false, renders: false,
    library: 'creative-library/techniques.json', instructionsCommand: 'creative show <id@version>',
    commands: ['creative list', 'creative show <id@version>', 'creative draft <request.json> -o <new-plan.json>', 'creative check <plan.json> --history <optional-history.json>'],
    requestSchema: z.toJSONSchema(creativeRequestSchema), techniqueSchema: z.toJSONSchema(creativeTechniqueSchema), historySchema: z.toJSONSchema(historySchema),
    note: 'The calling agent chooses story, techniques and adaptations. Local data validates choices; it neither reasons about video nor renders automatically.' };
}
