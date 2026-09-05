import type { Plan } from "../src/schema.ts";

export function fixture(): Plan {
  return {
    schemaVersion: 1,
    brief: { goal: "Show the recording UI changing state", audience: "A viewer learning OBS", format: "tutorial", minDuration: 0.5, maxDuration: 8, allowReorder: false },
    skills: ["editor-story-plan", "editor-pacing", "editor-review"],
    sources: [{ id: "obs", path: "sample.mkv", duration: 7.722, audio: "silent", sha256: "b5695751dcf310f758f4baec487a72c090ed842d75541e30e6d55d5a243e7297" }],
    evidence: [{ id: "recording-change", sourceId: "obs", start: 0.017, end: 0.034,
      observation: "Adjacent original frames show Start Recording at 0.017s and Stop Recording with a red indicator at 0.033s. This localizes visible UI state, not a physical click or encoder start.",
      kind: "screen_text", verification: "observed" }],
    beats: [{ id: "action", role: "action", purpose: "Show the original before/after state change.", evidenceIds: ["recording-change"] }],
    segments: [{ id: "opening", beatId: "action", sourceId: "obs", in: 0, out: 2,
      reason: "Retain the starting state and a short hold after the change.", evidenceIds: ["recording-change"] }],
    protectedRanges: [{ sourceId: "obs", start: 0, end: 0.1, reason: "Keep the complete visible before/after event." }],
    speechRanges: [], preferences: [],
    review: { previewInspected: false, reviewer: "", checks: [] },
  };
}
