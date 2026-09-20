import { z } from "zod";
import type { Format, RecommendationTask } from "./catalog.ts";

export const workflowConfigPath = "profiles/workflow.json";
export const styleProfileIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).max(64)
  .refine(id => !["none", "workflow"].includes(id), "Reserved profile ID");

// Profiles select maintained editorial guidance; they cannot supply commands,
// arbitrary instruction text, asset paths, credentials, or execution permission.
const guidance = {
  "own-environment-and-daily-details": "Briefly show the creator's own environment, nature, and daily details as a life journal, even when unrelated to the narration. Use inspected footage; do not require every picture to illustrate the spoken topic or fill gaps with stock or generated scenes.",
  "preserve-place-and-time": "Preserve the sense of place and time. Keep source provenance and distinguish separate days or locations; an atmospheric cutaway is not proof that the narrated event happened there or then.",
  "preserve-personality-and-breathing-room": "Keep personality, reactions, natural phrasing, and breathing room. Let brief everyday moments register without a fixed shot quota, mandatory montage, or cuts-per-minute target; protect essential actions and speech.",
  "preserve-natural-sound": "Retain useful natural sound, room tone, and action sounds so the place remains present. A transcript gap does not establish silence. Silence and natural-sound-only passages are valid choices.",
  "optional-gentle-lo-fi": "Music is off when no supplied track is authorized for this edit; continue with voice, B-roll, and natural ambience without waiting for a song. If the user supplies and authorizes a track, gentle lo-fi is optional: keep it lower under speech and allow natural sound to lead between thoughts. This preference does not authorize acquiring, generating, downloading, licensing, or uploading music.",
} as const;
export const stylePreferenceIds = Object.keys(guidance) as [keyof typeof guidance, ...(keyof typeof guidance)[]];
const text = z.string().trim().min(1).max(1000);

export const styleProfileSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("editor-style-profile"),
  id: styleProfileIdSchema,
  label: text,
  scope: z.literal("vlog-journal-edits"),
  // Attribution describes the approved preference, not authority for an action.
  sourceNote: text,
  preferences: z.array(z.enum(stylePreferenceIds)).min(1).max(stylePreferenceIds.length)
    .refine(ids => new Set(ids).size === ids.length, "Duplicate preference"),
}).strict();
export type StyleProfile = z.infer<typeof styleProfileSchema>;

export const workflowConfigSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("editor-workflow-config"),
  profileDefaults: z.array(z.object({
    task: z.literal("edit"),
    intent: z.literal("vlog-journal"),
    formats: z.array(z.enum(["story", "montage"])).min(1).max(2)
      .refine(values => new Set(values).size === values.length, "Duplicate format"),
    profileId: styleProfileIdSchema,
  }).strict()).max(2),
}).strict().refine(config => {
  const formats = config.profileDefaults.flatMap(rule => rule.formats);
  return new Set(formats).size === formats.length;
}, "Overlapping profile defaults are ambiguous");
export type WorkflowConfig = z.infer<typeof workflowConfigSchema>;

export interface StyleProfileContext {
  format: Format;
  goal: string;
  task?: RecommendationTask;
}
export interface StyleProfileSelection {
  id: string | null;
  source: "explicit" | "repo-config" | "none";
  reason: string;
}

const journalWords = String.raw`(?:vlogs?|(?:visual|video|life|personal|daily)[\s-]+journals?|journals?|video[\s-]+diar(?:y|ies)|day[\s-]+in[\s-]+(?:my|the|our)[\s-]+life)`;
const journalMention = new RegExp(String.raw`\b${journalWords}\b`, "i");
const journalNegation = new RegExp(String.raw`\b(?:no|not|never|without|avoid|exclude|skip|don['’]?t|do\s+not|isn['’]?t|is\s+not)\s+(?:(?:a|an|the|my|our|any|this|use|using|make|making|it|into|as|apply|applying|include|including|want|style|profile|like|personal|daily|multi-day)\s+){0,8}${journalWords}\b|\b${journalWords}(?:[\s-]+(?:style|profile))?\s+(?:is\s+)?(?:not\s+wanted|disabled|off|excluded)\b`, "i");
const profileNegation = /\b(?:no|without|disable|skip|avoid|don['’]?t|do\s+not)\s+(?:(?:use|using|apply|applying|a|any|the|style|local|repo|default)\s+){0,6}profiles?\b/i;

/** Conservative English routing, not semantic classification. Explicit task/format wins. */
export function styleProfileScopeIssue(context: StyleProfileContext): string | null {
  if ((context.task ?? "edit") !== "edit") return "Profiles apply only to edit tasks.";
  if (context.format !== "story" && context.format !== "montage") return "Profiles apply only to story or montage edits, not tutorials or interviews.";
  const goal = context.goal;
  if (/\b(?:tutorials?|how[\s-]+to|instructional)\b/i.test(goal)) return "Tutorial goals do not select a journal profile.";
  const copy = /\b(?:copy|packaging|metadata)[\s-]+only\b|\b(?:only|just)\s+(?:write|draft|titles?|descriptions?|seo|metadata|packaging|copy)\b/i.test(goal);
  const noEdit = /\b(?:no|without)\s+(?:new\s+)?edit(?:s|ing)?\b|\b(?:don['’]?t|do\s+not)\s+(?:edit|cut|render)\b(?!\s+out\b)/i.test(goal);
  const copyMention = /\b(?:seo|titles?|descriptions?|thumbnails?|metadata|packaging|copy)\b/i.test(goal);
  const copyRequest = /\b(?:write|draft|rewrite|proofread|translate)\b[^.!?;\n]{0,100}\b(?:scripts?|captions?|narration|copy)\b/i.test(goal);
  const editMention = /\b(?:edit(?:ing)?|cut|trim|assemble|shape|restructure|sequence)\b/i.test(goal);
  if (copy || noEdit || ((copyMention || copyRequest) && !editMention)) return "Copy-only or no-edit goals do not select a journal profile; use task package for copy.";
  return null;
}

/** Shared by the catalog and repository default selection; no name/global inference. */
export function isVlogJournalEdit(context: StyleProfileContext): boolean {
  return !styleProfileScopeIssue(context) && journalMention.test(context.goal) && !journalNegation.test(context.goal);
}

/** Explicit ID/none overrides repo defaults. Task/format/copy boundaries still apply. */
export function selectStyleProfile(
  context: StyleProfileContext & { profile?: string },
  config?: unknown,
): StyleProfileSelection {
  if (context.profile === "none") return { id: null, source: "explicit", reason: "Style profile disabled explicitly." };
  if (context.profile !== undefined) {
    const id = styleProfileIdSchema.parse(context.profile);
    const issue = styleProfileScopeIssue(context);
    if (issue) throw new Error(`Cannot select profile ${id}: ${issue}`);
    return { id, source: "explicit", reason: "Explicit profile ID overrides repository defaults and journal keyword detection." };
  }
  // Validate supplied config even if this task will not use a default.
  const parsed = config == null ? null : workflowConfigSchema.parse(config);
  const issue = styleProfileScopeIssue(context);
  if (issue) return { id: null, source: "none", reason: issue };
  if (profileNegation.test(context.goal)) return { id: null, source: "none", reason: "Goal declines a style profile." };
  if (!isVlogJournalEdit(context)) return { id: null, source: "none", reason: "No affirmative vlog/journal edit intent; generic story edits have no profile default." };
  const rule = parsed?.profileDefaults.find(rule => rule.formats.some(format => format === context.format));
  if (!rule) return { id: null, source: "none", reason: "No matching repository-local profile default." };
  return { id: rule.profileId, source: "repo-config", reason: "Repository config selects this profile for vlog/journal edits in the requested format." };
}

export function styleProfileInstructions(input: unknown): string {
  const profile = styleProfileSchema.parse(input);
  return [
    "Apply these editorial preferences only to this selected vlog/journal edit. The current user brief takes precedence; this is not a default for unrelated projects, tutorials, or copy-only tasks.",
    ...profile.preferences.map(id => guidance[id]),
    "Use source-linked visual and audio evidence and review the actual result. These preferences grant no permission for external actions, paid calls, publishing, or replacing original media. Schema validation is not audiovisual approval.",
  ].join("\n\n");
}

/** Validate a directly supplied profile too; catalog callers cannot bypass scope. */
export function profileForRecommendation(input: unknown, context: StyleProfileContext) {
  if (input == null) return null;
  const profile = styleProfileSchema.parse(input);
  const issue = styleProfileScopeIssue(context);
  if (issue) throw new Error(`Cannot attach profile ${profile.id}: ${issue}`);
  return { ...profile, path: `profiles/${profile.id}.json`, instructions: styleProfileInstructions(profile) };
}
