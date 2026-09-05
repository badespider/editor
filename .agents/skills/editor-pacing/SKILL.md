---
name: editor-pacing
description: Tighten or reshape the pacing of footage in Diffusion Studio while preserving meaning, complete actions and useful pauses. Use for trimming repetition or dead time; not as a requirement to shorten every video.
---

# Give each cut a reason

Read [the plan and checking contract](../../../reference/playbook.md). Use an existing story plan or `editor-story-plan` when sequence changes affect meaning. The user's requested duration is a constraint, not permission to discard the proof or the point.

- Identify what the viewer gains from each interval. Remove actual repetition or waiting, not all silence. A silent frame can contain the decisive event.
- Preserve reading time, demonstrations, reactions, breaths and deliberate emotional pauses when they carry information. There is no universal cuts-per-minute target.
- Inspect both sides of every proposed cut using `media inspect` on the source's existing pipeline session; see [the evidence workflow](../../../reference/agent-workflow.md). Use original timestamps and complete thought/action boundaries. Add `speechRanges` for known speech units and `protectedRanges` for actions or text that must remain intact.
- When faster pacing conflicts with reading time, consult `editor-visual-focus`. When it conflicts with speech or rhythm, consult `editor-audio-continuity`.
- Treat reordered/repeated source time as an explicit creative choice (`allowReorder`), and check that it does not imply a false sequence of events.

For a comparison, change one substantial pacing choice at a time and preserve a baseline. Produce a candidate plan and a short preview with `dapi playbook preview candidate.json -o candidate.mp4`; do not overwrite the source or baseline. The built-in preview performs hard cuts only. Apply other techniques through the editor's documented commands/TSX, not invented preview options.

Report time removed, the reason for each cut, and anything that may have become harder to follow. Route the result to `editor-review`. Keep a longer version if it explains the action better.
