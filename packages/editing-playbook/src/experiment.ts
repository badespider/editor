import { z } from "zod";
import { youtubeUrlSchema } from "./schema.ts";

const text = z.string().trim().min(1).max(4000);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const seconds = z.number().finite().nonnegative();
const date = z.iso.datetime({ offset: true });
const packagingSchema = z.object({ title: text, thumbnailPath: text.nullable(), thumbnailSha256: hash.nullable() }).strict();
const variantIdentitySchema = z.object({ sha256: hash, packaging: packagingSchema.nullable() }).strict();
export const experimentFormats = ["long", "short"] as const;
export const experimentDimensions = ["opening", "clip_boundaries", "pacing", "framing", "audio", "captions", "packaging", "other"] as const;
export const editorialDimensions = ["opening_promise", "standalone_context", "payoff", "speech_boundaries", "portrait_context"] as const;
export const metricUnits = {
  views: "count", engaged_views: "count", impressions: "count", likes: "count", comments: "count", shares: "count", subscribers_gained: "count",
  intro_retention: "percent", stayed_to_watch: "percent", ctr: "percent", average_percentage_viewed: "percent", average_view_duration: "seconds",
} as const;

export const experimentSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal("editor-engagement-experiment"), status: z.literal("candidate"), id,
  scope: z.object({ channel: text, format: z.enum(experimentFormats), language: text, audience: text }).strict(),
  hypothesis: text,
  change: z.object({ dimension: z.enum(experimentDimensions), description: text, heldConstant: z.array(text).min(1).max(30) }).strict(),
  design: z.object({ kind: z.enum(["same_footage_review", "randomized_panel", "observational_uploads", "platform_packaging_ab"]),
    assignment: text, confounders: z.array(text).max(30) }).strict(),
  sources: z.array(z.object({ id, path: text, sha256: hash, duration: seconds.positive() }).strict()).min(1).max(32),
  variants: z.array(z.object({
    id, role: z.enum(["baseline", "candidate"]), label: text, artifactPath: text, sha256: hash, duration: seconds.positive(),
    mapping: z.array(z.object({ sourceId: id, sourceStart: seconds, sourceEnd: seconds, outputStart: seconds, outputEnd: seconds }).strict()).min(1).max(200),
    packaging: packagingSchema.nullable(),
    publication: z.object({ url: youtubeUrlSchema, publishedAt: date }).strict().nullable(),
    review: z.object({ variantIdentity: variantIdentitySchema, reviewer: text, reviewedAt: date, coverage: z.array(z.enum(["frames", "audio", "transcript", "video"])).min(1).max(4),
      checks: z.array(z.object({ dimension: z.enum(editorialDimensions), outcome: z.enum(["pass", "fail", "unknown", "not_applicable"]), note: text,
        ranges: z.array(z.object({ start: seconds, end: seconds }).strict()).max(30) }).strict()).min(1).max(editorialDimensions.length),
    }).strict().nullable(),
  }).strict()).min(2).max(3),
  observations: z.array(z.object({
    id, variantId: id, variantIdentity: variantIdentitySchema, kind: z.enum(["editorial_feedback", "audience_analytics"]), observedAt: date, evidencePath: text, note: text,
    metric: z.object({
      name: z.enum(Object.keys(metricUnits) as [keyof typeof metricUnits, ...(keyof typeof metricUnits)[]]),
      value: z.number().finite().nonnegative(), unit: z.enum(["count", "percent", "seconds"]),
      denominator: text, sampleSize: z.number().int().nonnegative().nullable(), definition: text,
      window: z.object({ start: date, end: date }).strict(), trafficSource: text, audienceSegment: text,
    }).strict().nullable(),
  }).strict()).max(200),
  conclusion: z.object({ result: z.enum(["better", "worse", "mixed", "inconclusive"]), confidence: z.enum(["low", "medium", "high"]),
    note: text, observationIds: z.array(id).min(1).max(200), limitations: z.array(text).min(1).max(30) }).strict().nullable(),
  userApproval: z.object({ approvedBy: text, approvedAt: date, scope: text, evidence: text }).strict().nullable(),
}).strict();
export type EngagementExperiment = z.infer<typeof experimentSchema>;

/** Snapshot this when recording a review/measurement, not after changing a variant. */
export function experimentVariantIdentity(variant: Pick<EngagementExperiment["variants"][number], "sha256" | "packaging">) {
  return variantIdentitySchema.parse({ sha256: variant.sha256, packaging: variant.packaging });
}

export function requiredEditorialChecks(format: typeof experimentFormats[number]) {
  return format === "short" ? ["opening_promise", "standalone_context", "payoff"] as const : ["opening_promise", "payoff"] as const;
}

/** Intentionally incomplete: never fabricate asset identity, inspections or metrics. */
export function createExperimentDraft(input: { format: typeof experimentFormats[number]; hypothesis: string; change: string }) {
  const { format, hypothesis, change } = z.object({ format: z.enum(experimentFormats), hypothesis: text, change: text }).parse(input);
  return { schemaVersion: 1, kind: "editor-engagement-experiment", status: "candidate", id: "experiment",
    scope: { channel: "", format, language: "", audience: "" }, hypothesis,
    change: { dimension: format === "short" ? "clip_boundaries" : "opening", description: change, heldConstant: [] },
    design: { kind: "same_footage_review", assignment: "", confounders: [] }, sources: [],
    variants: ["baseline", "candidate"].map(role => ({ id: role, role, label: "", artifactPath: "", sha256: "", duration: 0,
      mapping: [], packaging: null, publication: null, review: null })),
    observations: [], conclusion: null, userApproval: null };
}

/** Structural/provenance consistency only. No file reads, audience inference or promotion. */
export function checkExperiment(input: unknown) {
  const errors: Array<{ code: string; message: string }> = [];
  const warnings: Array<{ code: string; message: string }> = [];
  const add = (code: string, message: string) => errors.push({ code, message });
  const warn = (code: string, message: string) => warnings.push({ code, message });
  const parsed = experimentSchema.safeParse(input);
  let stage = "planned";
  let evidenceLevel = "not_measured";
  const finish = () => ({ schemaVersion: 1, valid: errors.length === 0, status: "candidate",
    stage: errors.length ? "invalid" : stage, evidenceLevel: errors.length ? "invalid" : evidenceLevel,
    errors, warnings, safeToAutoPromote: false, safeToAutoPublish: false, externalModelCalls: 0,
    limitations: ["Checks validate declared records, not file bytes, media quality, analytics authenticity or statistical significance.",
      "A recorded conclusion or user preference does not establish an engagement benefit. No winner is calculated or skill modified."] });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) add("schema", `${issue.path.join(".")}: ${issue.message}`);
    return finish();
  }
  const exp = parsed.data;
  const unique = (name: string, ids: readonly string[]) => {
    if (new Set(ids).size !== ids.length) add("duplicate_id", `${name} must be unique.`);
  };
  unique("Source IDs", exp.sources.map(s => s.id));
  unique("Variant IDs", exp.variants.map(v => v.id));
  unique("Observation IDs", exp.observations.map(o => o.id));
  if (exp.variants.filter(v => v.role === "baseline").length !== 1) add("baseline", "Exactly one baseline is required.");
  const sources = new Map(exp.sources.map(s => [s.id, s]));
  const variants = new Map(exp.variants.map(v => [v.id, v]));
  const matchesIdentity = (identity: z.infer<typeof variantIdentitySchema>, variant: EngagementExperiment["variants"][number]) =>
    JSON.stringify(identity) === JSON.stringify(experimentVariantIdentity(variant));
  const durations = new Map<string, number>();
  for (const asset of [...exp.sources, ...exp.variants]) {
    if (durations.has(asset.sha256) && Math.abs(durations.get(asset.sha256)! - asset.duration) > 0.000001) add("identity_conflict", "The same declared media bytes cannot have different durations.");
    durations.set(asset.sha256, asset.duration);
  }
  for (const variant of exp.variants) {
    if (variant.packaging && (variant.packaging.thumbnailPath === null) !== (variant.packaging.thumbnailSha256 === null)) add("thumbnail_identity", `${variant.id}: thumbnail path and SHA-256 must both be provided or both be null.`);
    for (const span of variant.mapping) {
      const source = sources.get(span.sourceId);
      if (!source) add("unknown_source", `${variant.id}: unknown source ${span.sourceId}.`);
      if (span.sourceEnd <= span.sourceStart || span.outputEnd <= span.outputStart) add("range_order", `${variant.id}: ranges must have positive duration.`);
      if (source && span.sourceEnd > source.duration + 0.000001) add("source_bounds", `${variant.id}: source range exceeds ${source.id}.`);
      if (span.outputEnd > variant.duration + 0.000001) add("output_bounds", `${variant.id}: mapping exceeds output duration.`);
    }
    if (!variant.review) { warn("review_missing", `${variant.id}: inspect the actual variant and record the editorial checks.`); continue; }
    if (!matchesIdentity(variant.review.variantIdentity, variant)) add("stale_review", `${variant.id}: review belongs to different video bytes or packaging; inspect this version before recording a new review.`);
    unique(`${variant.id} check dimensions`, variant.review.checks.map(c => c.dimension));
    unique(`${variant.id} coverage modalities`, variant.review.coverage);
    for (const dimension of requiredEditorialChecks(exp.scope.format)) {
      const check = variant.review.checks.find(c => c.dimension === dimension);
      if (!check) warn("check_missing", `${variant.id}: ${dimension} has not been checked.`);
      if (check?.outcome === "not_applicable") add("required_check", `${variant.id}: ${dimension} applies to this format; use unknown if uninspected.`);
    }
    for (const check of variant.review.checks) {
      if (["unknown", "fail"].includes(check.outcome)) warn("editorial_unresolved", `${variant.id} ${check.dimension}: ${check.note}`);
      if (check.outcome === "pass" && !check.ranges.length) add("review_evidence", `${variant.id} ${check.dimension}: a pass needs output-relative ranges.`);
      if (check.dimension === "portrait_context" && check.outcome === "pass" && !variant.review.coverage.some(m => m === "frames" || m === "video")) {
        add("visual_coverage", `${variant.id}: portrait framing cannot pass from transcript/audio alone.`);
      }
      if (check.dimension === "speech_boundaries" && check.outcome === "pass" && !variant.review.coverage.includes("audio")) {
        add("audio_coverage", `${variant.id}: speech-boundary listening needs explicit audio coverage; video does not imply sound.`);
      }
      for (const range of check.ranges) if (range.end <= range.start || range.end > variant.duration + 0.000001) {
        add("review_bounds", `${variant.id} ${check.dimension}: invalid output review range.`);
      }
    }
  }
  if (exp.design.kind !== "observational_uploads") {
    const sourceSets = exp.variants.map(v => [...new Set(v.mapping.map(s => sources.get(s.sourceId)?.sha256))].sort().join(","));
    if (new Set(sourceSets).size !== 1) add("source_mismatch", "Controlled comparisons must use the same source-file set; different uploads are observational.");
  } else warn("observational", "Separate organic uploads cannot establish that the changed edit caused a difference; record topic, timing and audience confounders.");
  if (exp.design.kind === "platform_packaging_ab") {
    if (exp.scope.format !== "long" || exp.change.dimension !== "packaging") add("packaging_design", "This design is for long-form packaging, not Shorts or video-body edits.");
    if (new Set(exp.variants.map(v => v.sha256)).size !== 1) add("packaging_asset", "Packaging variants must refer to the same rendered video bytes.");
    if (exp.variants.some(v => !v.packaging)) add("packaging_missing", "Record the actual title and thumbnail identity for every packaging variant.");
    if (new Set(exp.variants.flatMap(v => v.publication ? [v.publication.url] : [])).size > 1) add("packaging_publication", "A native packaging comparison uses one published video, not separate uploads.");
    warn("platform_rules", "Check current official eligibility before running a platform test; this command does not run one.");
  }
  const analytics = exp.observations.filter(o => o.kind === "audience_analytics" && o.metric !== null);
  for (const observation of exp.observations) {
    const variant = variants.get(observation.variantId);
    if (!variant) add("unknown_variant", `${observation.id}: unknown variant.`);
    else if (!matchesIdentity(observation.variantIdentity, variant)) add("stale_observation", `${observation.id}: feedback/analytics belong to different video bytes or packaging; do not relabel old evidence for a new version.`);
    if ((observation.kind === "audience_analytics") !== (observation.metric !== null)) add("observation_kind", `${observation.id}: analytics require a metric; editorial feedback must not masquerade as analytics.`);
    const m = observation.metric;
    if (!m) continue;
    if (metricUnits[m.name] !== m.unit) add("metric_unit", `${observation.id}: ${m.name} uses ${metricUnits[m.name]}.`);
    if (m.unit === "count" && !Number.isInteger(m.value)) add("metric_count", `${observation.id}: counts must be integers.`);
    if (m.unit === "percent" && m.name !== "average_percentage_viewed" && m.value > 100) add("metric_percent", `${observation.id}: percentage must be 0..100.`);
    if (m.sampleSize === null) warn("sample_unknown", `${observation.id}: sample size unavailable; do not substitute zero or infer significance.`);
    if (m.sampleSize === 0 && m.unit !== "count") add("empty_denominator", `${observation.id}: a percentage or average is unavailable with a zero-sized sample; omit the metric.`);
    if (Date.parse(m.window.end) <= Date.parse(m.window.start) || Date.parse(m.window.end) > Date.parse(observation.observedAt)) add("metric_window", `${observation.id}: use an ordered, completed measurement window.`);
    if (variant?.publication && Date.parse(m.window.start) < Date.parse(variant.publication.publishedAt)) add("publication_window", `${observation.id}: the window begins before this variant was published.`);
    if (exp.design.kind === "same_footage_review") add("review_analytics", "Use an audience-study design to record analytics; a local editorial review is not audience measurement.");
    if (exp.design.kind !== "randomized_panel" && !variant?.publication) add("publication_missing", `${observation.id}: public analytics need the exact variant's publication identity.`);
  }
  for (const name of new Set(analytics.map(o => o.metric!.name))) {
    const rows = analytics.filter(o => o.metric?.name === name);
    if (new Set(rows.map(o => o.variantId)).size !== exp.variants.length) warn("measurement_missing", `${name}: not measured for every variant; no missing value is imputed.`);
    const signatures = rows.map(o => {
      const m = o.metric!;
      const published = variants.get(o.variantId)?.publication?.publishedAt;
      return JSON.stringify([m.unit, m.denominator, m.definition, m.trafficSource, m.audienceSegment,
        Date.parse(m.window.end) - Date.parse(m.window.start), published ? Date.parse(m.window.start) - Date.parse(published) : null]);
    });
    if (new Set(signatures).size > 1) warn("not_comparable", `${name}: definitions, denominators, windows, publication ages or audience/traffic segments differ. Do not compare headline values directly.`);
  }
  if (analytics.length) { evidenceLevel = "audience_data_recorded_unverified"; stage = "observations_recorded"; }
  else if (exp.observations.length) { evidenceLevel = "editorial_feedback_only"; stage = "observations_recorded"; }
  else warn("not_measured", "No audience outcome has been measured. Preserve null conclusion and approval until actual evidence exists.");
  if (exp.conclusion) {
    stage = "conclusion_recorded";
    unique("Conclusion observation IDs", exp.conclusion.observationIds);
    const observations = new Map(exp.observations.map(o => [o.id, o]));
    for (const observationId of exp.conclusion.observationIds) if (!observations.has(observationId)) add("unknown_observation", `Conclusion cites missing observation ${observationId}.`);
    const covered = new Set(exp.conclusion.observationIds.map(key => observations.get(key)?.variantId));
    if (exp.conclusion.result !== "inconclusive" && exp.variants.some(v => !covered.has(v.id))) add("conclusion_coverage", "A directional conclusion must cite observations for every compared variant.");
    warn("authored_conclusion", "Conclusion and confidence are the author's interpretation, not a computed winner or evidence of statistical significance.");
  }
  if (exp.userApproval && !exp.conclusion) add("approval_without_conclusion", "Record a supported conclusion before attaching scoped approval; approval never activates a skill.");
  return finish();
}
