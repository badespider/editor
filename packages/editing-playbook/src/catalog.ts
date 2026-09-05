export const formats = ["tutorial", "interview", "story", "montage"] as const;
export type Format = typeof formats[number];
export const skillIds = ["editor-story-plan", "editor-pacing", "editor-visual-focus",
  "editor-audio-continuity", "editor-reference-learning", "editor-review", "editor-video-evidence"] as const;
export type SkillId = typeof skillIds[number];

export const skills = [
  { id: skillIds[0], category: "storytelling", purpose: "Connect audience, story beats and source evidence before cutting." },
  { id: skillIds[1], category: "pacing", purpose: "Remove repetition while preserving meaning, reading time and complete actions." },
  { id: skillIds[2], category: "framing", purpose: "Guide attention without hiding important context or inventing detail." },
  { id: skillIds[3], category: "audio", purpose: "Preserve speech, pauses and audio continuity; distinguish silence from missing analysis." },
  { id: skillIds[4], category: "learning", purpose: "Turn reference examples into attributed, untrusted candidate lessons for testing." },
  { id: skillIds[5], category: "verification", purpose: "Check a draft against evidence, inspect a preview, and record the user's feedback." },
  { id: skillIds[6], category: "evidence", purpose: "Use the default provider-free pipeline; inspect, refine, and persist evidence with the calling agent's own capabilities." },
].map(skill => ({ ...skill, path: `.agents/skills/${skill.id}/SKILL.md`, maturity: "starter" as const }));

// These are application-level routing relationships, not a native Codex graph feature.
export const relationships: Array<{ from: SkillId; to: SkillId; type: "requires" | "verify_with" | "tension"; when: string }> = [
  { from: 'editor-story-plan', to: 'editor-video-evidence', type: 'requires', when: 'Ground footage-based choices in inspected, source-relative evidence.' },
  { from: "editor-pacing", to: "editor-story-plan", type: "requires", when: "A cut can remove context, a complete action or the payoff." },
  { from: "editor-visual-focus", to: "editor-story-plan", type: "requires", when: "Choose a crop or emphasis from the purpose of the beat." },
  { from: "editor-audio-continuity", to: "editor-story-plan", type: "requires", when: "Audio edits must preserve the speaker's meaning." },
  { from: "editor-pacing", to: "editor-visual-focus", type: "tension", when: "Faster cutting competes with time to read on-screen content." },
  { from: "editor-pacing", to: "editor-audio-continuity", type: "tension", when: "Shorter pauses compete with speech boundaries or emotional rhythm." },
  { from: "editor-reference-learning", to: "editor-review", type: "verify_with", when: "A candidate lesson needs a local comparison before promotion." },
  ...(["editor-story-plan", "editor-pacing", "editor-visual-focus", "editor-audio-continuity"] as const)
    .map(from => ({ from, to: "editor-review" as const, type: "verify_with" as const, when: "Inspect the rendered result, not only the plan." })),
];

export function recommend(format: Format, goal: string, hasReference = false) {
  const selected = new Map<SkillId, string>([
    ["editor-video-evidence", "Default footage understanding uses the calling agent and persistent local evidence, not an additional model."],
    ["editor-story-plan", "Ground the edit in audience, purpose and footage."],
    ["editor-review", "Check the plan and inspect the resulting preview."],
  ]);
  if (format !== "montage" || /pace|trim|cut|short|rhythm/i.test(goal)) selected.set("editor-pacing", "Timing and context need joint review.");
  if (format === "tutorial" || /zoom|crop|screen|text|frame|vertical/i.test(goal)) selected.set("editor-visual-focus", "Check what the audience must see and read.");
  if (format === "interview" || /audio|speech|music|voice|dialog|sound/i.test(goal)) selected.set("editor-audio-continuity", "Inspect sound independently of visual content.");
  if (hasReference) selected.set("editor-reference-learning", "Analyse an explicitly supplied reference as candidate knowledge.");
  return {
    method: "deterministic format and keyword routing; agent may select additional relevant skills",
    skills: skills.filter(skill => selected.has(skill.id)).map(skill => ({ ...skill, reason: selected.get(skill.id) })),
    relationships: relationships.filter(edge => selected.has(edge.from) && selected.has(edge.to)),
    providerRequired: false,
  };
}
