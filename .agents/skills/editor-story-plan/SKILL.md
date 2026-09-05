---
name: editor-story-plan
description: Plan a footage-based edit in Diffusion Studio from audience, purpose and timestamped evidence. Use before assembling or substantially restructuring a story, tutorial, interview or montage; not for unrelated coding or a one-property correction.
---

# Plan the story from the footage

Use the user's chosen editor and brief. Separate observed footage, proposed narrative meaning, and approved stylistic preferences. A planning request alone does not authorize editing or publishing.

Read [the playbook contract](../../../reference/playbook.md) for commands and the plan format. Run `dapi playbook recommend --format tutorial --goal "the user's actual goal"` with the appropriate format to discover relevant skills. Read selected skill files, not the entire catalog. Run commands from the editor repository; if `dapi` is not installed use `node apps/cli/dist/index.js` after building the CLI.

## Decisions that matter

- Start from an inspected pipeline dossier using [the default agent workflow](../../../reference/agent-workflow.md) and `editor-video-evidence`. Reuse source fingerprints and artifact IDs instead of reconstructing ad hoc evidence. Separate stored reports from what you personally inspected.
- Identify the intended audience, the question the video answers, and the actual payoff. Infer low-risk details and disclose them; ask only for choices that would materially change the edit.
- Build a few beats, each with a purpose and specific evidence. A hook is optional, not permission to invent a result, exaggerate stakes, or move an outcome into a misleading causal order.
- For an instructional sequence, preserve the prerequisite, the action and visible proof. For a personal story, allow context, hesitation and emotional pauses when they serve the story. Do not apply tutorial pacing to every format.
- Inspect important changes in original frames. Record the observed before/after interval; a visible button change does not prove the exact physical click time. Readable UI is not speech evidence.
- Mark unclear claims as uncertain. Identify missing footage instead of adding unsupported narration. Decide whether more inspection can resolve the gap before editing.

## Deliverable

Create a plan with source-relative seconds, sources, evidence, beats, segments and protected ranges. Source time is measured from the first video presentation timestamp, not container or audio start. Add source fingerprints when feasible. Keep preference statements separate and include only preferences the user actually approved.

Use a protected range for an action that must survive intact, including the before-state needed to understand the change.

Check the plan with `dapi playbook check plan.json`. Explain why the chosen ordering serves the brief. If editing is requested, route to the relevant techniques and then `editor-review`; preserve reversible project state. A passing plan check does not establish that the footage claims or story are true.
