---
name: editor-review
description: Review a Diffusion Studio edit plan and rendered preview for story, speech, readability and continuity, and record explicit user feedback. Use before handing off a substantive footage edit or testing a new editing lesson.
---

# Inspect the result, not only the instructions

Read [the checking and preview contract](../../../reference/playbook.md). For a plan, run `dapi playbook check plan.json`. Resolve technical failures before rendering. A pass checks declared ranges and references; it does not independently confirm observations, speech, style or permission.

Render an exclusive new preview with `dapi playbook preview plan.json -o preview.mp4` for hard-cut plans. For crops, overlays, transitions or music, render the actual editor composition using [node render](../../../reference/node/render.md). Preserve the baseline and original sources.

Inspect the preview using available video/frame/audio tools. Use the source's pipeline dossier to check important claims; refine uncertain source events with `media inspect` and record corrections as new attributed observations. A saved render can also be opened as a separate pipeline session. See [the agent workflow](../../../reference/agent-workflow.md). Be explicit about the modality: extracted frames plus signal statistics are not a continuous audiovisual viewing. Use original frames for exact timing or tiny text because the local preview is 720p at 30 fps.

Record a short finding for each dimension:

- **Story:** Does the sequence answer the brief, retain the necessary context and show the real payoff? Are implications supported by the original footage?
- **Speech:** Are words intact and audio transitions clean? Mark not-applicable only when speech is absent; unknown is not absent.
- **Readability:** Can the intended viewer read essential text at delivery size and pace? State what was actually checked.
- **Continuity:** Are changes in place, time, speaker, screen state and sound understandable? Check around every join.

Do not set `previewInspected` based on an encoder success or schema validation. Record failed checks honestly; a review record is not an automatic editing approval. The checker always keeps `safeToAutoEdit: false`.

For skill evaluation, compare a baseline and one candidate on the same brief. Report technical checks separately from subjective preference. Ask the user which works better when taste is decisive. Save preferences only when explicitly approved, with their scope and the feedback source. Do not turn a one-off correction into a universal rule.
