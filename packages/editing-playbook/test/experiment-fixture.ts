import { experimentVariantIdentity } from "../src/experiment.ts";
import type { EngagementExperiment } from "../src/experiment.ts";

// Synthetic identities and measurements. Never a claim about a real channel/video.
export function experimentFixture(): EngagementExperiment {
  return { schemaVersion: 1, kind: "editor-engagement-experiment", status: "candidate", id: "synthetic",
    scope: { channel: "Test fixture only", format: "short", language: "en", audience: "Fixture reviewers" },
    hypothesis: "A complete opening may clarify the same moment.",
    change: { dimension: "clip_boundaries", description: "Change the start boundary", heldConstant: ["Source, ending, crop, audio and caption policy"] },
    design: { kind: "same_footage_review", assignment: "Local editorial comparison only", confounders: ["Reviewer knows both versions"] },
    sources: [{ id: "source", path: "synthetic-source.mp4", sha256: "a".repeat(64), duration: 100 }],
    variants: (["baseline", "candidate"] as const).map((role, n) => ({ id: role, role, label: role, artifactPath: `${role}.mp4`,
      sha256: (n ? "c" : "b").repeat(64), duration: 30, mapping: [{ sourceId: "source", sourceStart: n, sourceEnd: n + 30, outputStart: 0, outputEnd: 30 }],
      packaging: null, publication: null, review: null })),
    observations: [], conclusion: null, userApproval: null };
}

export function analyticsFixture(): EngagementExperiment {
  const record = experimentFixture();
  record.design = { kind: "observational_uploads", assignment: "Separate uploads, not randomized", confounders: ["Different publication dates"] };
  record.variants.forEach((v, n) => { v.publication = { url: `https://www.youtube.com/watch?v=${n ? "ABCDEFGHIJK" : "abcdefghijk"}`, publishedAt: `2026-09-0${n + 1}T00:00:00Z` }; });
  record.observations = record.variants.map((v, n) => ({ id: `analytics-${n}`, variantId: v.id, variantIdentity: experimentVariantIdentity(v), kind: "audience_analytics", observedAt: "2026-09-10T00:00:00Z",
    evidencePath: `synthetic-${n}.json`, note: "Synthetic metrics, not real analytics", metric: { name: "stayed_to_watch", value: 60 + n, unit: "percent",
      denominator: "Shorts feed opportunities", sampleSize: 100, definition: "Stayed beyond the initial seconds, fixture definition",
      window: { start: `2026-09-0${n + 1}T00:00:00Z`, end: `2026-09-0${n + 8}T00:00:00Z` }, trafficSource: "Shorts feed", audienceSegment: "All" } }));
  return record;
}
