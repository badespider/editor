---
name: editor-review
description: Review a Diffusion Studio edit and rendered preview, or record a scoped editing/engagement comparison. Use for substantive footage handoff and testing editing lessons; analytics-only review does not authorize a new edit.
---

# Inspect the result, not only the instructions

Read [the checking and preview contract](../../../reference/playbook.md). For a plan, run `dapi playbook check plan.json`. Resolve technical failures before rendering. A pass checks declared ranges and references; it does not independently confirm observations, speech, style or permission.

Render an exclusive new preview with `dapi playbook preview plan.json -o preview.mp4` for hard-cut plans. For crops, overlays, transitions or music, render the actual editor composition using [node render](../../../reference/node/render.md). Preserve the baseline and original sources.

For supported silent B-roll over continuous source sound, prefer the reusable
[layered workflow](../../../reference/layered.md). Use its own verify/inspect/review
commands: compare the visible cutaway picture separately from the original voice,
check both sides of each return to the speaker, and record chronology/naturalness.
The cut-only verifier assumes picture and sound share a source, so it cannot
validate this arrangement. Technical checks and ASR do not prove direct listening.

Inspect the preview using available video/frame/audio tools. Use the source's pipeline dossier to check important claims; refine uncertain source events with `media inspect` and record corrections as new attributed observations. A saved render can also be opened as a separate pipeline session. See [the agent workflow](../../../reference/agent-workflow.md). Be explicit about the modality: extracted frames plus signal statistics are not a continuous audiovisual viewing. Use original frames for exact timing or tiny text because the local preview is 720p at 30 fps.

Record a short finding for each dimension:

- **Story:** Does the sequence answer the brief, retain the necessary context and show the real payoff? Are implications supported by the original footage?
- **Speech:** Are words intact and audio transitions clean? Mark not-applicable only when speech is absent; unknown is not absent.
- **Readability:** Can the intended viewer read essential text at delivery size and pace? State what was actually checked.
- **Continuity:** Are changes in place, time, speaker, screen state and sound understandable? Check around every join.

Do not set `previewInspected` based on an encoder success or schema validation. Record failed checks honestly; a review record is not an automatic editing approval. The checker always keeps `safeToAutoEdit: false`.

For skill evaluation, compare a baseline and one candidate on the same brief. Report technical checks separately from subjective preference. Ask the user which works better when taste is decisive. Save preferences only when explicitly approved, with their scope and the feedback source. Do not turn a one-off correction into a universal rule.

## Engagement comparisons

When the task is to test an editing choice or analyze viewer results, read
[the experiment contract](../../../reference/engagement.md) and run
`dapi playbook experiment workflow`. Use `new` to start a local candidate record,
then `check` after adding real provenance and evidence. Analytics-only work can
reuse existing reviews/exports; do not create a plan or render just to fill a log.

Keep opening-promise, standalone-context and payoff checks in the experiment's
variant review, not extra fields in the strict edit-plan schema. Check results
describe authored judgments; schema validity and an encoder pass do not supply
those judgments. Use `unknown` for uninspected or unsupported claims.

Record exact versions, one changed choice, source/output mappings, evidence paths,
measurement windows/definitions, missing data and confounders. Local preference,
randomized-panel feedback, organic-upload observations and native packaging tests
are different designs. Do not impute missing metrics as zero, infer causality from
different uploads, or promise an uplift. A conclusion stays provisional even if
the user approves a scoped style choice. The log never activates trusted skills.
