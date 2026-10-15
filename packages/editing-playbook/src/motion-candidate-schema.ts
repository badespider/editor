import { z } from "zod";

const text = z.string().trim().min(1).max(2000);
const id = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).max(80);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const httpsUrl = z.string().max(2048).refine(value => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password && !url.port;
  } catch { return false; }
}, "Expected an HTTPS URL without credentials or a custom port");
const draftUrl = z.union([z.literal(""), httpsUrl]);
const localPath = z.string().min(1).max(500).refine(value =>
  !/^[\\/]|^[a-z]:|^[a-z][a-z0-9+.-]*:/i.test(value) &&
  !/[\u0000-\u001f\u007f]/.test(value) &&
  !value.split(/[\\/]/).some(part => part === ".." || part === ""),
"Expected a relative artifact path without parent traversal");

/** This pins a declared version; the checker does not resolve tags or authenticate a repository. */
export function isPinnedMotionRevision(value: string): boolean {
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64}|v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.test(value);
}

// Recognizing an identifier is not a compatibility determination. A current
// license-review test is also required; an unrecognized/custom license stays a candidate.
export const recognizedMotionLicenseIds = ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MPL-2.0",
  "GPL-2.0-only", "GPL-2.0-or-later", "GPL-3.0-only", "GPL-3.0-or-later", "LGPL-2.1-only", "LGPL-2.1-or-later",
  "LGPL-3.0-only", "LGPL-3.0-or-later", "AGPL-3.0-only", "AGPL-3.0-or-later", "CC0-1.0", "Unlicense",
  "CC-BY-4.0", "CC-BY-SA-4.0"] as const;
const licenses = new Set<string>(recognizedMotionLicenseIds);
export const motionAdapterKinds = ["native-keyframes", "native-component", "seekable-surface", "prepared-media"] as const;
export const motionTestKinds = ["license-review", "seek-repeat", "reverse-seek", "source-clock", "disposal", "bounded-resources", "native-export"] as const;
const result = z.enum(["pass", "fail", "unknown"]);
const editorialResult = z.enum(["pass", "fail", "unknown", "not_applicable"]);

export const motionCandidateSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.literal("candidate"),
  id,
  title: text,
  originUrl: httpsUrl,
  source: z.object({
    repositoryUrl: draftUrl,
    revision: z.string().max(120).refine(value => value === "" || isPinnedMotionRevision(value), "Pin a complete commit SHA or exact semantic version, not a branch or latest tag"),
    licenseId: z.string().trim().max(120),
    licenseUrl: draftUrl,
    notice: text.optional(),
    assets: z.array(z.object({
      id, originUrl: httpsUrl, licenseId: z.string().trim().max(120), licenseUrl: draftUrl,
      availability: z.enum(["available", "not-included", "unavailable", "unsupported"]),
      path: localPath.optional(), sha256: sha256.optional(), notice: text.optional(),
    }).strict()).max(100),
  }).strict(),
  capabilities: z.array(text).max(30),
  adapter: z.object({ kind: z.enum(motionAdapterKinds), implementationPath: localPath.optional() }).strict(),
  evidence: z.object({
    tests: z.array(z.object({
      id, kind: z.enum(motionTestKinds), outcome: result, sourceRevision: text,
      artifactPath: localPath, artifactSha256: sha256, note: text,
    }).strict()).max(100),
    exports: z.array(z.object({
      id, path: localPath, sha256, sourceRevision: text, renderer: z.literal("native-editor"),
      width: z.number().int().positive().max(16384), height: z.number().int().positive().max(16384),
      fps: z.number().positive().max(240), frames: z.number().int().positive().max(10_000_000),
      durationSeconds: z.number().positive().max(86400),
    }).strict()).max(30),
    reviews: z.array(z.object({
      exportId: id, exportSha256: sha256, reviewer: text, outcome: result,
      inspected: z.enum(["frames", "video", "video_and_audio"]),
      readability: editorialResult, protectedContext: editorialResult, nativeEditability: editorialResult,
      note: text,
    }).strict()).max(100),
  }).strict(),
  limits: z.array(text).max(30), useWhen: z.array(text).max(30), avoidWhen: z.array(text).max(30),
}).strict();

export type MotionCandidate = z.infer<typeof motionCandidateSchema>;
export type MotionCandidateCheck = {
  valid: boolean;
  readiness: "invalid" | "needs_evidence" | "ready_for_review";
  candidate: MotionCandidate | null;
  mechanicalErrors: string[];
  missingEvidence: string[];
  safeToActivate: false;
  externalCalls: 0;
  limitations: string[];
};

/** Make an inert research draft. No source is fetched, installed, read, or executed. */
export function createMotionCandidate(originUrl: string, title = "Motion integration candidate"): MotionCandidate {
  return motionCandidateSchema.parse({
    schemaVersion: 1, status: "candidate", id: "motion-candidate", title, originUrl,
    source: { repositoryUrl: "", revision: "", licenseId: "", licenseUrl: "", assets: [] },
    capabilities: [], adapter: { kind: "native-keyframes" },
    evidence: { tests: [], exports: [], reviews: [] }, limits: [], useWhen: [], avoidWhen: [],
  });
}

/** Check declared evidence only. File contents, license terms and review judgments are not authenticated. */
export function checkMotionCandidate(input: unknown): MotionCandidateCheck {
  const parsed = motionCandidateSchema.safeParse(input);
  const mechanicalErrors: string[] = parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join(".") || "candidate"}: ${issue.message}`);
  const missingEvidence: string[] = [];
  const candidate = parsed.success ? parsed.data : null;
  const limitations = [
    "Pure structural and declared-evidence checks; no network, file reads, installation or execution.",
    "Hashes, source/version authenticity, license compatibility and inspection claims need independent review.",
    "Ready for review is not trusted, activated, approved for reuse, or evidence of audience benefit.",
  ];
  if (candidate) {
    const { source, evidence } = candidate;
    const duplicateIds = (items: ReadonlyArray<{ id: string }>, label: string) => {
      const seen = new Set<string>();
      for (const item of items) {
        if (seen.has(item.id)) mechanicalErrors.push(`${label}: duplicate ID ${item.id}`);
        seen.add(item.id);
      }
    };
    duplicateIds(source.assets, "source.assets");
    duplicateIds(evidence.tests, "evidence.tests");
    duplicateIds(evidence.exports, "evidence.exports");
    if (!source.repositoryUrl) missingEvidence.push("source.repositoryUrl: identify the upstream repository");
    if (!source.revision) missingEvidence.push("source.revision: pin a complete commit SHA or exact version");
    if (!licenses.has(source.licenseId)) missingEvidence.push("source.licenseId: unknown or unrecognized license needs review");
    if (!source.licenseUrl) missingEvidence.push("source.licenseUrl: retain the pinned source license link");
    for (const asset of source.assets) {
      if (!licenses.has(asset.licenseId) || !asset.licenseUrl) missingEvidence.push(`asset ${asset.id}: identify its separate license and license URL`);
      if (asset.availability !== "available" || !asset.path || !asset.sha256) missingEvidence.push(`asset ${asset.id}: supported local availability, path and SHA-256 are required`);
    }
    for (const name of ["capabilities", "limits", "useWhen", "avoidWhen"] as const) {
      if (!candidate[name].length) missingEvidence.push(`${name}: describe the scope and exceptions`);
    }
    if (!candidate.adapter.implementationPath) missingEvidence.push("adapter.implementationPath: identify the local adapter or prepared-media manifest");
    const requiredTests = motionTestKinds.filter(kind => candidate.adapter.kind !== "prepared-media" || (kind !== "disposal" && kind !== "bounded-resources"));
    for (const kind of requiredTests) {
      if (!evidence.tests.some(test => test.kind === kind && test.outcome === "pass" && test.sourceRevision === source.revision)) {
        missingEvidence.push(`test ${kind}: current-revision passing receipt is missing`);
      }
    }
    for (const test of evidence.tests) {
      if (test.sourceRevision === source.revision && test.outcome !== "pass") missingEvidence.push(`test ${test.id}: ${test.outcome}`);
    }
    const currentExports = evidence.exports.filter(artifact => artifact.sourceRevision === source.revision);
    if (!currentExports.length) missingEvidence.push("exports: record an actual current-revision native-editor export");
    for (const artifact of evidence.exports) {
      if (Math.abs(artifact.durationSeconds - artifact.frames / artifact.fps) > 1 / artifact.fps + 0.000001) {
        mechanicalErrors.push(`export ${artifact.id}: duration disagrees with its frame count and frame rate`);
      }
    }
    for (const review of evidence.reviews) {
      const artifact = evidence.exports.find(artifact => artifact.id === review.exportId);
      if (!artifact || artifact.sha256 !== review.exportSha256) mechanicalErrors.push(`review ${review.exportId}: export ID/SHA-256 does not match a recorded export`);
    }
    for (const artifact of currentExports) {
      const reviews = evidence.reviews.filter(review => review.exportId === artifact.id && review.exportSha256 === artifact.sha256);
      if (!reviews.some(review => review.outcome === "pass" && [review.readability, review.protectedContext, review.nativeEditability].every(check => check === "pass" || check === "not_applicable"))) {
        missingEvidence.push(`export ${artifact.id}: inspect readability, protected context and native editability in an exact-identity review`);
      }
      if (reviews.some(review => review.outcome === "fail" || [review.readability, review.protectedContext, review.nativeEditability].includes("fail"))) {
        missingEvidence.push(`export ${artifact.id}: a failed review remains unresolved`);
      }
    }
  }
  const valid = mechanicalErrors.length === 0;
  return { valid, readiness: !valid ? "invalid" : missingEvidence.length ? "needs_evidence" : "ready_for_review",
    candidate, mechanicalErrors, missingEvidence, safeToActivate: false, externalCalls: 0, limitations };
}
