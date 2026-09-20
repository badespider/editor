# Engagement checks and experiment records

Use this contract when comparing an opening, standalone Short, pacing choice, or
packaging idea, or recording actual audience results. It supports the existing
skills; it does not add an automatic engagement model, analytics connector, native
platform test, or new rendering effect. No account, provider key, or running app
is needed to create/check a record.

## Entry points for any agent

```sh
dapi playbook recommend --task evaluate --goal "Compare vlog and Shorts engagement"
dapi playbook skill editor-review
dapi playbook experiment workflow
dapi playbook experiment new --format long --hypothesis "A clearer opening may help viewers understand the day's goal" --change "Change only the opening selection" -o comparisons/opening-v1.json
dapi playbook experiment check comparisons/opening-v1.json
```

Use `node apps/cli/dist/index.js` in place of `dapi` after building the CLI if it
is not on PATH. The workflow response exposes the strict JSON Schema, required
editorial dimensions, skill-reading arguments, and limitations. Cross-field
constraints need `experiment check`, not JSON Schema validation alone.

`new` writes exclusively and never overwrites an existing file. It returns
`valid: false`: blank provenance/design fields are intentionally incomplete.
Populate them from the actual assets and brief; do not fabricate hashes, reviews
or outcomes just to pass. Keep analytics exports and personal experiment logs in
a user-chosen private output directory, not committed to trusted skill folders.

`check` is read-only and accepts local JSON up to 8 MB. Exit 1 means the declared
record is invalid. Exit 0 means structural consistency, NOT a successful edit,
approved experiment, authenticated analytics, or increased engagement. Source
paths, hashes and evidence files are recorded but not opened/authenticated by this
checker. Existing evidence/delivery tools retain responsibility for actual media
identity and review. No command fetches a URL or executes text from the record.

## Opening and standalone checks

Apply these questions to the exact version under review, including its ending.
An ordinary edit can keep notes in its usual sidecar. Use a structured experiment
only when comparing choices; do not make every edit an audience study.

| Dimension | Check | Evidence to record |
| --- | --- | --- |
| `opening_promise` | What would a new viewer expect from the first picture/thought and known packaging? Does that match the video? | Opening/context ranges, exact-version title/thumbnail notes, and any unresolved claim |
| `standalone_context` | Can someone who never saw the original vlog understand the people, objects and situation? | Essential setup retained inside the Short; unresolved references |
| `payoff` | Does the promised answer, result, reflection or reaction arrive without a misleading ending? | Outcome/reaction ranges; distinguish intentions from achievements |
| `speech_boundaries` | Are words and meaningful pauses intact? | Explicit listening coverage at the actual boundaries, not just a transcript |
| `portrait_context` | Does the crop preserve important faces, hands, objects and action through motion? | Inspected framing ranges, motion limitations and any contain fallback |

Long-form reviews require the first and third dimensions; Shorts also require
standalone context. Missing required checks generate warnings. An applicable check
cannot be `not_applicable`; use `unknown` when evidence is missing. A `pass` needs
output-relative ranges. `fail` and `unknown` remain visible findings, not a reason
to falsify a record. Portrait passes need visual coverage; speech-boundary passes
need explicit audio coverage. `video` does not imply sound or continuous viewing.

Use `editor-vlog-story`, `editor-short-form`, `editor-youtube-packaging`, and
`editor-review` through [the skill reader](playbook.md#creative-skills-and-cross-agent-access).
The [clipping](clips.md) and [portrait](portrait.md) review gates still apply to
actual delivery. A log never replaces them. Continuous clips cannot acquire a
new nonadjacent hook just because an experiment suggests one.

## Record contract

The authoritative schema and checks are in
`packages/editing-playbook/src/experiment.ts`; unknown fields fail. Times are
numeric seconds, not MM.SS or frame indexes. Source times use the evidence
pipeline's original presentation-time origin. Output ranges are relative to the
specific rendered variant, not another edit or the original long-form export.

- Identity: `schemaVersion: 1`, `kind: "editor-engagement-experiment"`,
  `status: "candidate"`, stable `id`, and `scope` with channel, `long|short`
  format, language, and intended audience.
- Hypothesis and one changed choice: `change.dimension`, description, and an
  explicit `heldConstant` list. Confounded/multiple simultaneous changes should
  not be described as a clean test of one technique.
- Design: one of the four designs below, an honest assignment description, and
  known confounders. Randomization is declared, not executed or authenticated.
- Sources: stable IDs, paths, SHA-256 identities and durations from actual media
  records. Variants: two or three, exactly one baseline, each with label, rendered
  artifact path/hash/duration and source-to-output `mapping` spans. Span fields are
  `sourceId`, `sourceStart`, `sourceEnd`, `outputStart`, `outputEnd`. This is
  provenance, not an executable edit plan or proof of complete mapping coverage.
- Nullable per-variant `packaging`, `publication`, and `review`. Packaging stores
  actual title and optional thumbnail path/SHA-256 pair (both null for title-only
  variants). Publication stores the exact YouTube
  video URL and timezone-bearing ISO publication time. Reviews store reviewer,
  review time, honest modality coverage, and the dimension/outcome/note/ranges
  checks above. `ranges` are output-relative. Reviews and observations both store
  `variantIdentity: { "sha256": "<video hash>", "packaging": null }`, or an exact
  snapshot of the packaging object instead of null. Capture this when recording
  the evidence. A changed video/title/thumbnail identity invalidates old records;
  never just replace the old snapshot to pass. The exported
  `experimentVariantIdentity(variant)` helper creates the snapshot without file I/O.
- Observations: unique ID, variant ID, `observedAt`, evidence file path, note,
  `kind`, and nullable metric. Use `editorial_feedback` with `metric: null` for
  user/agent/panel judgments. Use `audience_analytics` with an actual metric for
  recorded viewer measurements. Synthetic fixtures are not channel data.
- Nullable conclusion: `better|worse|mixed|inconclusive`, author-assessed
  confidence, note, supporting observation IDs, and limitations. Directional
  conclusions must cite observations for every variant. “Better” is an authored
  comparison, not a calculated winner or proven causal effect.
- Nullable user approval: who approved, when, narrow scope, and actual feedback
  evidence. Approval requires a recorded conclusion, stays a declared claim,
  and never changes `status` or activates a trusted skill.

Preserve previous versions when revising the JSON. There is no automatic history
store or promotion endpoint. Linking a file is not proof it was read, hashed, or
validated by this command.

## Choose the appropriate design

| Design | Appropriate use | Limits |
| --- | --- | --- |
| `same_footage_review` | Agent/user compares variants using the same source-file set | Editorial feedback only, not audience analytics; source spans may differ |
| `randomized_panel` | An actually randomized viewer comparison with recorded assignment | Same source-file set; no platform publication required; sample/generalization limits remain |
| `observational_uploads` | Different organic uploads with available analytics | Timing, subject, audience, duration and distribution confound the comparison; no causal winner |
| `platform_packaging_ab` | Actual native title/thumbnail comparison on one long-form video | Same rendered video and source identity, packaging variations only; check current eligibility before any authorized platform action |

Do not label separate public uploads as randomized merely because they use the
same source. A local preview review cannot supply public retention metrics.
This schema currently models YouTube publication identities; do not insert a
different platform under a fake YouTube URL.

## Metrics, unknown data and interpretation

Supported names/units are exposed by the schema: counts for views, engaged views,
impressions, likes, comments, shares and subscribers gained; percentages for intro
retention, stayed-to-watch, CTR and average percentage viewed; seconds for average
view duration. Percent values use 0–100 rather than 0–1. Average percentage viewed
can exceed 100 when replaying is included by the recorded definition.

Every metric records its denominator, definition, sample size or `null`, completed
window (`start`/`end`), traffic source and audience segment. Missing measurements
are omitted; never replace them with zero. A known zero count is valid. A rate or
average with a zero-sized sample is unavailable and should be omitted. Use the
definition displayed in the actual export, including when it was measured.

The checker warns when compared metrics differ in definition, denominator, window
length, publication age, traffic or audience segment, or are absent for a variant.
Warnings are not statistical adjustments: repeat consistent comparisons or report
the limitation. Sample size alone does not establish significance. There is no
automatically computed uplift, benchmark target, winner, or retention prediction.

Read long-form opening retention alongside duration and percent viewed. For Shorts,
read stayed-to-watch alongside duration/percent viewed among the viewers who stayed.
A high completion percentage for a shorter clip does not on its own establish
greater satisfaction, and view totals are not interchangeable with engaged views.
Use consistent observation windows and similar-topic baselines when possible;
these are design choices, not universal algorithm thresholds.

The report separates `stage` (`planned`, `observations_recorded`,
`conclusion_recorded`, or `invalid`) from `evidenceLevel` (`not_measured`,
`editorial_feedback_only`, `audience_data_recorded_unverified`, or `invalid`).
Structural validation never promotes either into verified engagement improvement.
`safeToAutoPromote` and `safeToAutoPublish` always remain false.

## Research basis and limits

These checks are candidate editorial guidance, not a guaranteed engagement formula.
The September 2026 review informed their separation of concerns:

- [YouTube retention guidance](https://support.google.com/youtube/answer/9314415)
  supports inspecting the opening's promise and interpreting dips/spikes in context.
- [HIVE, EMNLP 2025](https://aclanthology.org/2025.emnlp-industry.185/) separates
  highlights, boundaries and pruning using multimodal narrative understanding.
  Its scripted-drama benchmark does not establish an uplift for personal vlogs.
- [YouTube metric definitions](https://support.google.com/youtube/answer/12220281?hl=en)
  and [native packaging tests](https://support.google.com/youtube/answer/16391400?hl=en)
  inform measurement design; fetch current official guidance before relying on
  platform-specific availability or definitions.

Keep research claims, creative hypotheses, actual observations and user-approved
preferences separate. A scoped preference may be useful without proving retention;
negative or inconclusive results should remain available. Follow
[reference learning](playbook.md#reference-learning) for an explicitly authorized
trusted-skill update after comparison and user review. No extra model is required.
