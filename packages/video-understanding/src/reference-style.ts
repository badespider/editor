import {z} from 'zod';
import {createHash} from 'node:crypto';
import {designCategories, referenceDesignSchema, type ReferenceDesign} from './reference-design.ts';

const id = z.string().regex(/^[a-z][a-z0-9-]{0,59}$/);
const note = z.string().trim().min(1).max(1600);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const dimensions = ['framing', 'typography', 'motion', 'rhythm'] as const;
export const styleDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const styleSourcesSchema = z.array(z.object({id, role: note, sessionId: hash, sequenceId: hash, designSha256: hash}).strict()).min(3).max(8);

/** Portable agent-authored rules. Scene evidence establishes provenance, not output approval. */
export const motionStyleGuideSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal('motion-style-guide'), id,
  version: z.number().int().positive().max(9999), name: note, description: note,
  tags: z.array(id).min(1).max(16), origin: note,
  coverage: z.literal('selected-scenes'),
  scenes: z.array(z.object({id, role: note, sequenceSha256: hash, analysisSha256: hash}).strict()).min(3).max(8),
  rules: z.array(z.object({id, category: z.enum(designCategories), dimension: z.enum(dimensions),
    principle: note, useWhen: note, avoidWhen: note, essential: z.boolean(),
    confidence: z.enum(['single-example', 'repeated']),
    evidence: z.array(z.object({sceneId: id, featureId: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/)}).strict()).min(1).max(16),
    verification: z.enum(['native-frame', 'consecutive-frames', 'audio-listening']),
    review: note, tolerance: note, editableControls: z.array(note).min(1).max(12),
  }).strict()).min(4).max(16),
  adaptation: z.object({preserve: z.array(note).min(1).max(16), replace: z.array(note).min(1).max(16),
    retime: note, limitations: z.array(note).min(1).max(16)}).strict(),
  status: z.literal('agent_authored_style_candidate'),
}).strict().superRefine((guide, ctx) => {
  const issue = (message: string) => ctx.addIssue({code: 'custom', message});
  for (const [values, label] of [[guide.scenes.map(s => s.id), 'scene'], [guide.scenes.map(s => s.sequenceSha256), 'sequence'],
    [guide.rules.map(r => r.id), 'rule']] as [string[], string][])
    if (new Set(values).size !== values.length) issue(`Duplicate style ${label}`);
  if (new Set(guide.scenes.map(s => s.role.toLowerCase())).size < 3) issue('Study at least three distinct scene roles');
  const cited = new Set<string>();
  for (const rule of guide.rules) {
    const refs = rule.evidence.map(e => `${e.sceneId}/${e.featureId}`);
    if (new Set(refs).size !== refs.length) issue('Duplicate style rule evidence');
    for (const e of rule.evidence) {
      if (!guide.scenes.some(s => s.id === e.sceneId)) issue('Unknown style evidence scene');
      cited.add(e.sceneId);
    }
    if (rule.confidence === 'repeated' && new Set(rule.evidence.map(e => e.sceneId)).size < 2)
      issue('Repeated rule needs evidence from multiple scenes');
  }
  if (guide.scenes.some(s => !cited.has(s.id))) issue('Every studied scene must support a style rule');
  for (const dimension of dimensions)
    if (!guide.rules.some(r => r.dimension === dimension)) issue(`Style needs a ${dimension} rule`);
});
export type MotionStyleGuide = z.infer<typeof motionStyleGuideSchema>;
export const referenceStyleRequestSchema = z.object({sources: styleSourcesSchema, guide: motionStyleGuideSchema}).strict();

export type StyleScene = {id: string; role: string; analysis: ReferenceDesign};
export function validateStyleGuide(raw: unknown, scenes: StyleScene[]) {
  const guide = motionStyleGuideSchema.parse(raw);
  if (scenes.length !== guide.scenes.length || new Set(scenes.map(s => s.id)).size !== scenes.length)
    throw Error('Style scenes must match the inspected analyses exactly');
  for (const scene of scenes) {
    const analysis = referenceDesignSchema.parse(scene.analysis), stored = guide.scenes.find(s => s.id === scene.id);
    if (!stored || stored.role !== scene.role || stored.sequenceSha256 !== analysis.sequenceSha256 || stored.analysisSha256 !== styleDigest(analysis))
      throw Error('Style provenance does not match inspected design');
  }
  for (const rule of guide.rules) for (const e of rule.evidence) {
    const feature = scenes.find(s => s.id === e.sceneId)!.analysis.features.find(f => f.id === e.featureId);
    if (!feature || feature.category !== rule.category || feature.dimension !== rule.dimension)
      throw Error(`Style rule ${rule.id} cites an incompatible feature`);
    if (rule.verification !== 'native-frame' && feature.verification !== rule.verification)
      throw Error(`Style rule ${rule.id} lacks ${rule.verification} evidence`);
    if (feature.verification === 'audio-listening' && rule.verification !== 'audio-listening')
      throw Error('Audio evidence cannot establish a visual style rule');
  }
  return guide;
}

/** A caller fills general principles; literal reference feature targets are deliberately not copied. */
export function draftStyleGuide(scenes: StyleScene[]) {
  return {schemaVersion: 1, kind: 'motion-style-guide', id: '', version: 1, name: '', description: '', tags: [], origin: '',
    coverage: 'selected-scenes', scenes: scenes.map(s => ({id: s.id, role: s.role, sequenceSha256: s.analysis.sequenceSha256, analysisSha256: styleDigest(s.analysis)})),
    rules: [], adaptation: {preserve: [], replace: [], retime: '', limitations: []}, status: 'agent_authored_style_candidate',
    featureIndex: scenes.map(s => ({sceneId: s.id, features: s.analysis.features.map(f => ({id: f.id, category: f.category,
      dimension: f.dimension, observedTarget: f.target, verification: f.verification}))})),
    instruction: 'Author reusable rules from these observations. Remove featureIndex/instruction before sealing. State use/avoid conditions, replaceable content, uncertainty and fresh-output review targets.'};
}

export const styleApplicationsSchema = z.array(z.object({ruleId: id, shotIds: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)).max(16),
  rationale: note, adaptation: note}).strict()).min(4).max(16);
export type StyleApplications = z.infer<typeof styleApplicationsSchema>;
export const sceneStyleGuideSchema = z.object({profile: z.string().regex(/^[a-z][a-z0-9-]{0,59}@[1-9][0-9]{0,3}$/),
  profileSha256: hash, guideSha256: hash, guide: motionStyleGuideSchema, applications: styleApplicationsSchema}).strict();

export function styleGuideCriteria(guideInput: unknown, applicationsInput: unknown) {
  const guide = motionStyleGuideSchema.parse(guideInput), applications = styleApplicationsSchema.parse(applicationsInput);
  if (applications.length !== guide.rules.length || new Set(applications.map(a => a.ruleId)).size !== applications.length ||
    applications.some(a => !guide.rules.some(r => r.id === a.ruleId))) throw Error('Account for every style rule exactly once');
  return guide.rules.map(rule => {
    const application = applications.find(a => a.ruleId === rule.id)!;
    if (new Set(application.shotIds).size !== application.shotIds.length) throw Error('Duplicate style application shot');
    const scope = application.shotIds.length ? `Apply in shots: ${application.shotIds.join(', ')}`
      : 'Proposed omission: inspect the new story and verify that this rule is not applicable';
    return {id: `style-${rule.id}`, dimension: rule.dimension, essential: rule.essential,
      requirement: `${rule.principle}\nUse when: ${rule.useWhen}\nAvoid when: ${rule.avoidWhen}\n${scope}\nReason: ${application.rationale}\nAdaptation: ${application.adaptation}\nReview: ${rule.review}\nTolerance: ${rule.tolerance}\nVerify with: ${rule.verification}`,
      evidence: []};
  });
}
