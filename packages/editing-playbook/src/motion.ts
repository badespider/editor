import { createHash } from 'node:crypto';
import { validateBreakdown, referenceManifestSchema } from '@diffusionstudio/video-understanding/reference-schema';
import { motionIntentSchema, motionRecipeSchema, motionInputSchema, motionSettingsSchema, motionReviewSchema } from './motion-schema.ts';
import type { MotionSettings, MotionRecipe, MotionAdaptation, MotionCard } from './motion-schema.ts';
export * from './motion-schema.ts';

/** Canonical data identity; neither this digest nor a schema proves an agent looked at an image. */
export function motionDigest(value: unknown): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export function generateMotionRecipe(manifestInput: unknown, breakdownInput: unknown, intentInput: unknown): MotionRecipe {
  const manifest = referenceManifestSchema.parse(manifestInput);
  const breakdown = validateBreakdown(breakdownInput, manifest.sequenceSha256, manifest.frames);
  if (!breakdown.coverage.allFramesReported) throw Error('Inspect and report every frame in this bounded reference range before recipe generation');
  const intent = motionIntentSchema.parse(intentInput), element = breakdown.elements.find(e => e.id === intent.elementId);
  if (!element) throw Error('Recipe element is absent from the reference breakdown');
  const phase = (label: string) => {
    const matches = element.phases.filter(p => p.label === label);
    if (matches.length !== 1) throw Error('Select a unique entry/exit phase label from the breakdown');
    const p = matches[0], seconds = manifest.frames[p.endFrame].time - manifest.frames[p.startFrame].time;
    if (seconds < .03 || seconds > 3) throw Error('Caption phase must span 0.03–3 seconds; use a supported reference phase');
    return { ...p, seconds };
  };
  const entry = phase(intent.entryPhase), exit = phase(intent.exitPhase);
  if (exit.startFrame < entry.endFrame) throw Error('Exit must follow entry; overlapping reference phases are unsupported in this recipe');
  if ([entry, exit].some(p => element.keyframes.some(k => k.frame > p.startFrame && k.frame < p.endFrame))) {
    throw Error('V1 supports endpoint motion only; intermediate path/overshoot keyframes need a different recipe renderer');
  }
  const uncertainties = ['Easing, blur, font and layout are recreation choices, not recovered original project settings.',
    'Missing transform endpoints use explicit fade-only defaults; subject positions and speech still require new-footage evidence.'];
  if (element.uncertainty) uncertainties.push(element.uncertainty);
  const motion = (a: number, b: number, incoming: boolean) => {
    const first = element.keyframes.find(k => k.frame === a), last = element.keyframes.find(k => k.frame === b);
    const rest = incoming ? last : first, moving = incoming ? first : last;
    const diff = (key: 'x' | 'y' | 'rotationDegrees') => moving?.[key] !== undefined && rest?.[key] !== undefined ? moving[key]! - rest[key]! : 0;
    return { dx: diff('x'), dy: diff('y'), rotation: diff('rotationDegrees'),
      scale: moving?.scale !== undefined && rest?.scale !== undefined ? moving.scale / rest.scale : 1,
      opacity: moving?.opacity ?? 0 };
  };
  const settings: MotionSettings = motionSettingsSchema.parse({
    entrySeconds: entry.seconds, exitSeconds: exit.seconds, staggerSeconds: .08, minHoldSeconds: .25,
    entry: motion(entry.startFrame, entry.endFrame, true), exit: motion(exit.startFrame, exit.endFrame, false),
    easing: 'easeOut', blurPx: 0, fontFamily: 'Arial', fontWeight: 700, fontSize: .065,
    color: '#FFFFFF', maxLines: 3, maxCharsPerSecond: 22,
    layout: { x: .1, y: .7, width: .8, height: .2 }, ...intent.settings,
  });
  return motionRecipeSchema.parse({ schemaVersion: 1, kind: 'caption-motion-recipe',
    reference: { sequenceSha256: manifest.sequenceSha256, breakdownSha256: motionDigest(breakdownInput),
      author: breakdown.author, elementId: element.id, inspectedFrames: breakdown.inspectedFrames,
      entryFrames: [entry.startFrame, entry.endFrame], exitFrames: [exit.startFrame, exit.endFrame] },
    settings, rationale: intent.rationale, uncertainties, status: 'candidate' });
}

type Box = MotionSettings['layout'];
const intersects = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
function wrap(text: string, capacity: number) {
  const lines: string[] = [];
  for (const word of text.split(/\s+/u)) {
    if (word.length > capacity) return null;
    if (!lines.length || lines.at(-1)!.length + 1 + word.length > capacity) lines.push(word);
    else lines[lines.length - 1] += ' ' + word;
  }
  return lines;
}
/** Data-only adaptation. Cue clocks are source-relative; no word timestamps or missing text are invented. */
export function adaptMotion(recipeInput: unknown, input: unknown): MotionAdaptation {
  const recipe = motionRecipeSchema.parse(recipeInput), data = motionInputSchema.parse(input), s = recipe.settings;
  if (data.source.sha256 !== data.captions.sourceSha256) throw Error('Captions belong to a different source');
  const duration = Math.round((data.range.end - data.range.start) * 30) / 30;
  if (Math.abs(duration - (data.range.end - data.range.start)) > .001) throw Error('Use a preview duration aligned to 30 fps');
  const warnings = ['Text wrapping uses conservative width estimates; verify actual installed-font metrics in the render.',
    'No automatic subject tracking. Protected regions are caller-authored output-picture coordinates.'];
  if (data.captions.verification === 'unverified') warnings.push('Caption text/timing is unverified; listening or user review remains required.');
  if (data.subjectCoverage === 'unknown') warnings.push('Subject coverage is unknown; placement review remains required.');
  for (const p of data.protectedRegions) if (p.end <= p.start || p.start < data.range.start || p.end > data.range.end) throw Error('Protected-region times must be inside the source preview range');
  const cards: MotionCard[] = [], ids = new Set<string>(); let priorEnd = data.range.start;
  for (const cue of data.captions.cues) {
    if (ids.has(cue.id) || cue.start < priorEnd - 1e-7 || cue.end <= cue.start || cue.end > data.range.end + 1e-7) throw Error('Caption cues must be unique, ordered, nonoverlapping and fully inside the preview range');
    ids.add(cue.id); priorEnd = cue.end;
    // Inward frame alignment keeps captions inside the supplied speech interval.
    const startFrame = Math.ceil((cue.start - data.range.start) * 30 - 1e-7);
    const endFrame = Math.floor((cue.end - data.range.start) * 30 + 1e-7);
    const length = (endFrame - startFrame) / 30;
    let fontSize = Math.min(data.width, data.height) * s.fontSize;
    const minimum = Math.min(data.width, data.height) * .025;
    let lines: string[] | null = null;
    while (fontSize >= minimum) {
      // This is only an estimate, deliberately not a claim of font-metric validation.
      lines = wrap(cue.text, Math.floor(s.layout.width * data.width / (fontSize * .68)));
      if (lines && lines.length <= s.maxLines && lines.length * fontSize * 1.25 <= s.layout.height * data.height) break;
      fontSize *= .92; lines = null;
    }
    if (!lines) throw Error(`Caption ${cue.id} cannot fit at the minimum font size; rephrase only with approval or split using real speech timing`);
    const count = lines.length, moving = s.entrySeconds + s.exitSeconds + s.staggerSeconds * (count - 1);
    if (length < s.minHoldSeconds + 2 / 30) throw Error(`Caption ${cue.id} has insufficient reading/animation time`);
    const factor = Math.min(1, (length - s.minHoldSeconds) / moving);
    let entryTicks = Math.max(1, Math.floor(s.entrySeconds * factor * 30));
    let exitTicks = Math.max(1, Math.floor(s.exitSeconds * factor * 30));
    let staggerTicks = Math.floor(s.staggerSeconds * factor * 30);
    const motionTicks = endFrame - startFrame - Math.ceil(s.minHoldSeconds * 30);
    while (entryTicks + exitTicks + staggerTicks * (count - 1) > motionTicks) {
      if (exitTicks > 1 && exitTicks >= entryTicks) exitTicks--;
      else if (entryTicks > 1) entryTicks--;
      else if (staggerTicks > 0) staggerTicks--;
      else throw Error(`Caption ${cue.id} cannot retain hold time after frame alignment`);
    }
    const entrySeconds = entryTicks / 30, exitSeconds = exitTicks / 30, staggerSeconds = staggerTicks / 30;
    if (factor < 1) warnings.push(`${cue.id}: entry/exit/stagger compressed to preserve hold time; inspect motion timing.`);
    if (cue.text.length / length > s.maxCharsPerSecond) warnings.push(`${cue.id}: reading rate exceeds ${s.maxCharsPerSecond} characters/second.`);
    const protectedBoxes = data.protectedRegions.filter(p => p.start < cue.end && p.end > cue.start).map(p => p.box);
    const options: Box[] = [s.layout, { ...s.layout, y: .08 }, { ...s.layout, y: Math.max(.08, .5 - s.layout.height / 2) }];
    // Include swept translation/scale/rotation envelope, not only the static caption rectangle.
    const envelope = (b: Box): Box => {
      const rotation = Math.max(Math.abs(s.entry.rotation), Math.abs(s.exit.rotation)) * Math.PI / 180;
      const scale = Math.max(1, s.entry.scale, s.exit.scale);
      const pw = b.width * data.width, ph = b.height * data.height;
      const w = (pw + ph * Math.sin(rotation)) * scale / data.width;
      const h = (ph + pw * Math.sin(rotation)) * scale / data.height;
      const dx0 = Math.min(0, s.entry.dx, s.exit.dx), dx1 = Math.max(0, s.entry.dx, s.exit.dx);
      const dy0 = Math.min(0, s.entry.dy, s.exit.dy), dy1 = Math.max(0, s.entry.dy, s.exit.dy);
      const blur = s.blurPx * 3;
      return { x: b.x - (w - b.width) / 2 + dx0 - blur / data.width,
        y: b.y - (h - b.height) / 2 + dy0 - blur / data.height,
        width: w + dx1 - dx0 + 2 * blur / data.width, height: h + dy1 - dy0 + 2 * blur / data.height };
    };
    const box = options.find(b => { const e = envelope(b); return e.x >= 0 && e.y >= 0 && e.x + e.width <= 1 && e.y + e.height <= 1 && !protectedBoxes.some(p => intersects(e, p)); });
    if (!box) throw Error(`No safe caption placement for ${cue.id}; inspect subjects and adjust the recipe/protected regions`);
    if (box.y !== s.layout.y) warnings.push(`${cue.id}: caption moved to avoid a protected region.`);
    cards.push({ id: cue.id, start: startFrame / 30, end: endFrame / 30,
      lines, fontSize, box, entrySeconds, exitSeconds, staggerSeconds });
  }
  const previewSamples = [...new Set(cards.flatMap(c => [c.start, c.start + c.entrySeconds + c.staggerSeconds * (c.lines.length - 1),
    (c.start + c.end) / 2, c.end - c.exitSeconds / 2, c.end - 1 / 30]).map(t => Math.max(0, Math.min(duration - 1 / 30, Math.round(t * 30) / 30))))].sort((a,b) => a-b);
  return { schemaVersion: 1, kind: 'caption-motion-adaptation', recipe, input: data, duration, cards, warnings,
    renderer: s.blurPx || s.entry.scale !== 1 || s.exit.scale !== 1 ? 'canvas' : 'native', previewSamples, status: 'draft', safeToAutoPublish: false };
}

export function reviewMotion(input: unknown, expected: { adaptationSha256: string; renderSha256: string; inspectionSha256: string;
  artifacts: { id: string; kind: string }[]; audible: boolean; technicalPass: boolean; revision: number; maxCorrections: number }) {
  const review = motionReviewSchema.parse(input);
  for (const key of ['adaptationSha256', 'renderSha256', 'inspectionSha256'] as const) if (review[key] !== expected[key]) throw Error('Stale review: bind it to this exact adaptation, render and inspection');
  const inspected = new Set(review.inspectedArtifactIds), artifacts = new Map(expected.artifacts.map(a => [a.id, a]));
  if (inspected.size !== review.inspectedArtifactIds.length || [...inspected].some(id => !artifacts.has(id))) throw Error('Unknown or duplicate inspected artifact');
  if (expected.artifacts.some(a => a.kind === 'frame' && !inspected.has(a.id))) throw Error('Review every requested preview frame before submitting the review');
  if (new Set(review.checks.map(c => c.kind)).size !== 5) throw Error('Each review dimension must appear exactly once');
  for (const check of review.checks) {
    if (check.evidenceIds.some(id => !inspected.has(id))) throw Error('Review cites uninspected evidence');
    if (check.status === 'not_applicable' && (check.kind !== 'audio' || expected.audible)) throw Error('Only absent/digitally silent audio can be not applicable');
    if (check.status === 'pass' || check.status === 'fail') {
      if (!check.evidenceIds.some(id => artifacts.get(id)?.kind === (check.kind === 'audio' ? 'audio' : 'frame'))) throw Error('A substantive finding needs evidence of the matching modality');
    }
  }
  const failures = review.checks.filter(c => c.status === 'fail');
  const status = !expected.technicalPass ? 'technical_failure' : failures.length
    ? expected.revision < expected.maxCorrections ? 'needs_correction' : 'correction_limit'
    : review.checks.some(c => c.status === 'unknown') ? 'needs_human_review' : 'reviewed_draft';
  return { ...review, status, safeToAutoPublish: false, basis: 'agent_reported_not_independent_verification' };
}
