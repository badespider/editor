import { isVlogJournalEdit, profileForRecommendation } from "./style-profile.ts";
import type { StyleProfile } from "./style-profile.ts";

export const formats = ["tutorial", "interview", "story", "montage"] as const;
export type Format = typeof formats[number];
export const skillIds = ["editor-story-plan", "editor-pacing", "editor-visual-focus",
  "editor-audio-continuity", "editor-reference-learning", "editor-review", "editor-video-evidence",
  "editor-vlog-story", "editor-scene-building", "editor-short-form", "editor-youtube-packaging", "editor-sound-polish"] as const;
export type SkillId = typeof skillIds[number];
export const recommendationTasks = ["edit", "package", "evaluate"] as const;
export type RecommendationTask = typeof recommendationTasks[number];

export const skills = [
  { id: skillIds[0], category: "storytelling", purpose: "Connect audience, story beats and source evidence before cutting." },
  { id: skillIds[1], category: "pacing", purpose: "Remove repetition while preserving meaning, reading time and complete actions." },
  { id: skillIds[2], category: "framing", purpose: "Guide attention without hiding important context or inventing detail." },
  { id: skillIds[3], category: "audio", purpose: "Preserve speech, pauses and audio continuity; distinguish silence from missing analysis." },
  { id: skillIds[4], category: "learning", purpose: "Turn reference examples into attributed, untrusted candidate lessons for testing." },
  { id: skillIds[5], category: "verification", purpose: "Check a draft, inspect a preview, or record provisional engagement comparisons without automatic learning." },
  { id: skillIds[6], category: "evidence", purpose: "Use the default provider-free pipeline; inspect, refine, and persist evidence with the calling agent's own capabilities." },
  { id: skillIds[7], category: "vlog", purpose: "Find an honest thread in everyday or multi-day footage and identify missing recording coverage." },
  { id: skillIds[8], category: "coverage", purpose: "Choose purposeful B-roll and complete visual scenes without inventing continuity or unsupported audio edits." },
  { id: skillIds[9], category: "short-form", purpose: "Choose complete standalone moments through the existing clipping and portrait review workflow." },
  { id: skillIds[10], category: "packaging", purpose: "Create truthful titles, full descriptions, chapters and thumbnail concepts for the exact video and language; never publish." },
  { id: skillIds[11], category: "sound-polish", purpose: "Assess dialogue clarity and conservative sound treatment while preserving ambience and truthful listening coverage." },
].map(skill => ({ ...skill, path: `.agents/skills/${skill.id}/SKILL.md`,
  readArgs: ["playbook", "skill", skill.id], maturity: "starter" as const }));

// These are application-level routing relationships, not a native Codex graph feature.
export const relationships: Array<{ from: SkillId; to: SkillId; type: "requires" | "verify_with" | "tension"; when: string }> = [
  { from: 'editor-story-plan', to: 'editor-video-evidence', type: 'requires', when: 'Ground footage-based choices in inspected, source-relative evidence.' },
  { from: "editor-pacing", to: "editor-story-plan", type: "requires", when: "A cut can remove context, a complete action or the payoff." },
  { from: "editor-visual-focus", to: "editor-story-plan", type: "requires", when: "Choose a crop or emphasis from the purpose of the beat." },
  { from: "editor-audio-continuity", to: "editor-story-plan", type: "requires", when: "Audio edits must preserve the speaker's meaning." },
  { from: "editor-pacing", to: "editor-visual-focus", type: "tension", when: "Faster cutting competes with time to read on-screen content." },
  { from: "editor-pacing", to: "editor-audio-continuity", type: "tension", when: "Shorter pauses compete with speech boundaries or emotional rhythm." },
  { from: "editor-reference-learning", to: "editor-review", type: "verify_with", when: "A candidate lesson needs a local comparison before promotion." },
  { from: "editor-vlog-story", to: "editor-story-plan", type: "requires", when: "Vlog direction specializes the source-grounded story plan." },
  { from: "editor-vlog-story", to: "editor-pacing", type: "requires", when: "Keep personality and useful pauses while selecting everyday moments." },
  { from: "editor-scene-building", to: "editor-story-plan", type: "requires", when: "Each shot serves a known beat rather than decorative coverage." },
  { from: "editor-scene-building", to: "editor-visual-focus", type: "requires", when: "Preserve the action, context and relevant details across shots." },
  { from: "editor-scene-building", to: "editor-audio-continuity", type: "requires", when: "Specify what is heard under each picture and preserve source timing." },
  { from: "editor-short-form", to: "editor-story-plan", type: "requires", when: "Standalone promise, setup and payoff need evidence inside the selected moment." },
  { from: "editor-short-form", to: "editor-pacing", type: "requires", when: "Choose complete speech/action boundaries within the clip budget." },
  { from: "editor-short-form", to: "editor-visual-focus", type: "requires", when: "Inspect context and framing, including portrait when requested." },
  { from: "editor-sound-polish", to: "editor-audio-continuity", type: "requires", when: "Sound treatment must preserve source clocks, meaning and honest listening coverage." },
  { from: "editor-scene-building", to: "editor-pacing", type: "tension", when: "A cutaway may hide the decisive action or interrupt a useful pause." },
  { from: "editor-youtube-packaging", to: "editor-video-evidence", type: "verify_with", when: "Reuse source-backed records for copy; inspect only unsupported claims, not a mandatory new edit." },
  ...(["editor-story-plan", "editor-pacing", "editor-visual-focus", "editor-audio-continuity",
    "editor-vlog-story", "editor-scene-building", "editor-short-form", "editor-sound-polish"] as const)
    .map(from => ({ from, to: "editor-review" as const, type: "verify_with" as const, when: "Inspect the rendered result, not only the plan." })),
];

export function recommend(format: Format, goal: string, hasReference = false, task: RecommendationTask = "edit", profile?: StyleProfile | null) {
  const styleProfile = profileForRecommendation(profile, { format, goal, task });
  const selected = new Map<SkillId, string>(task === "package" ? [
    ["editor-youtube-packaging", "Package the known video and language without requesting a new edit or render."],
  ] : task === "evaluate" ? [
    ["editor-review", "Review existing evidence or engagement experiments; no new edit, render or analytics access is implied."],
  ] : [
    ["editor-video-evidence", "Default footage understanding uses the calling agent and persistent local evidence, not an additional model."],
    ["editor-story-plan", "Ground the edit in audience, purpose and footage."],
    ["editor-review", "Check the plan and inspect the resulting preview."],
  ]);
  if (task === "edit") {
    if (format !== "montage" || /pace|trim|cut|short|rhythm/i.test(goal)) selected.set("editor-pacing", "Timing and context need joint review.");
    if (format === "tutorial" || /zoom|crop|screen|text|frame|vertical/i.test(goal)) selected.set("editor-visual-focus", "Check what the audience must see and read.");
    if (format === "interview" || /audio|speech|music|voice|dialog|sound/i.test(goal)) selected.set("editor-audio-continuity", "Inspect sound independently of visual content.");
    if (isVlogJournalEdit({ format, goal, task })) {
      selected.set("editor-vlog-story", "Connect everyday events without manufacturing drama; identify missing coverage.");
    }
    if (styleProfile) {
      selected.set("editor-vlog-story", "Apply the selected profile's scoped life-journal preferences while preserving the current brief.");
      selected.set("editor-scene-building", "Inspect personal environment and everyday cutaways; narration need not describe each picture.");
      selected.set("editor-audio-continuity", "Preserve natural sound, speech boundaries, place/time and breathing room for the selected profile.");
      selected.set("editor-sound-polish", "Consider natural sound and optional authorized music balance; selecting a profile does not request automatic processing or music acquisition.");
    }
    if (/\bb[\s-]?roll\b|\bcutaways?\b|\bpick[\s-]?up\s+shots?\b|\bscene[\s-]+building\b|\bvisual\s+(?:coverage|sequenc(?:e|es|ing))\b|\bestablishing\s+shots?\b/i.test(goal)) {
      selected.set("editor-scene-building", "Plan purposeful visual coverage with explicit source and audio choices.");
    }
    if (/\b(?:shorts|reels?|tiktoks?|clipping)\b|\bshort[\s-]+form\b|\b(?:mobile|vertical|standalone)\s+(?:shorts?|clips?|excerpts?)\b|\b(?:clips?|excerpts?)\s+(?:out\s+of|from)\b|\b(?:create|make|extract|select|pick|pull|find)\s+(?:(?:some|a|the|few|\d+)\s+){0,2}clips?\b/i.test(goal)) {
      selected.set("editor-short-form", "Make each excerpt understandable on its own through the reviewed clipping pipeline.");
    }
    if (/\bseo\b|\bthumbnails?\b|\b(?:youtube|upload)\s+(?:packag(?:e|ing)|descriptions?|titles?|metadata)\b|\bpinned\s+comments?\b|\bvideo\s+descriptions?\b/i.test(goal)) {
      selected.set("editor-youtube-packaging", "Keep requested packaging complete and grounded in the actual delivered version.");
    }
    if (/\bdenois(?:e|ing)\b|\bnoise[\s-]+reduction\b|\b(?:dialogue?|speech|audio|sound)\s+(?:clarity|clean[\s-]?up|polish|mix(?:ing)?|cleaner|clearer)\b|\buneven\s+(?:volume|levels?)\b|\b(?:clean|cleaner|clearer)\s+(?:audio|sound|dialogue?|speech)\b/i.test(goal)) {
      selected.set("editor-sound-polish", "Assess specific sound problems and conservative treatment, not automatic processing.");
    }
  }
  if (hasReference) {
    selected.set("editor-reference-learning", "Analyse an explicitly supplied reference as candidate knowledge.");
    selected.set("editor-review", "Evaluate candidate reference lessons without treating them as automatically learned rules.");
  }
  // Include instruction prerequisites, not automatic tool execution or authority.
  // Fixed-point expansion is safe even if a future catalog accidentally adds a cycle.
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of relationships) {
      if (edge.type === "requires" && selected.has(edge.from) && !selected.has(edge.to)) {
        selected.set(edge.to, `Required by ${edge.from}: ${edge.when}`);
        changed = true;
      }
    }
  }
  return {
    method: "deterministic format and keyword routing; agent may select additional relevant skills",
    task,
    styleProfile,
    ...(task === "evaluate" ? { experimentWorkflowArgs: ["playbook", "experiment", "workflow"] } : {}),
    skills: skills.filter(skill => selected.has(skill.id)).map(skill => ({ ...skill, reason: selected.get(skill.id) })),
    relationships: relationships.filter(edge => selected.has(edge.from) && selected.has(edge.to)),
    providerRequired: false,
  };
}
