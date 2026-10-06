# Detailed reference-to-template analysis

Use this workflow for a detailed technique analysis, explicit reconstruction or specific
fidelity complaint. For reusable style across different videos, continue with
[motion styles](motion-styles.md) after studying several scenes. The agent inspects
images and authors the analysis; the local tools retain evidence and validate its
structure. No additional AI provider is invoked.

## Analyze before adapting

1. Map the reference's distinct scenes using the normal evidence pipeline. Choose a
   representative **3–5 second** scene for the first technique study. Extract every
   native frame with `media reference extract`, then open every page. Open native-size
   frames around typography, texture, masks and transitions. A contact sheet alone is
   insufficient for pixel-level measurements. Analyze additional distinct scenes in
   separate bounded records before describing the whole video's style.
2. Run `media reference design-template SESSION SEQUENCE --cache-dir CACHE -o draft.json`.
   Fill all 14 categories: composition, typography, palette, texture, layers, masks,
   lighting, depth, camera, motion, transitions, timing, assets and audio. Each must be
   observed, absent, or unknown. Record evidence, measurement method, estimates and
   uncertainty. Keep absent distinct from unassessed. Audio remains unknown without
   listening; ASR is not a sound-design review.
3. Describe visible elements, approximate/ measured bounds and back-to-front ordering;
   describe motion phases with actual frame indices. Record 4–20 concrete, independently
   reviewable features. Each feature needs its elements, evidence, tolerance and review
   method. Include all visually defining details, not only captions. Use existing
   `reference annotate`/`track` for more detailed keyframe hypotheses or seeded tracking.
   A claim of a measured font size, trajectory or easing needs supporting measurements,
   not just a plausible number. Record unsupported effects and replacement rules.
4. Seal with `media reference design SESSION SEQUENCE draft.json --cache-dir CACHE`.
   Completion means all frames in the bounded sequence are accounted for, all categories
   assessed (unknown is valid), and each defining feature has an explicit verification
   target. A sealed record is still **agent-reported**, not independently true or approved.

The tool validates sequence identity, frame coverage, element references, observed
categories, consecutive motion evidence and listening declarations. It cannot verify
that an agent actually opened an image or that an observation is correct. Original
fonts, editable layers, masks, hidden pixels, 3D geometry and easing are generally not
uniquely recoverable from a flattened video.

## Carry the requirements into a short proof

Add `style.design: [{referenceId, analysis}]` to the scene recipe, using the sealed
record's `value`. Keep the matching `style.references` binding. Generate criteria with
`designCriteria(referenceId, analysis, index)` from
`@diffusionstudio/video-understanding/reference-design`; `index` is the record's
zero-based position in `style.design`. This produces `design-INDEX-FEATURE` IDs. Include
them in the shot's criteria. The validator rejects missing or weakened generated
requirements. At least one essential criterion in each of framing, typography, motion
and rhythm is still required. Split jobs if their requirements exceed 24; retain detail.

For new reference-to-template work, use detailed analysis by default. Old sealed recipes
without `style.design` remain readable for compatibility, but are not detailed analyses.

For an explicit reconstruction or a specific uncertain effect, build a short
**reference-control**: editable titles and independently controlled
layers, with the closest available lawful assets. Clearly disclose any reference-image
crops used in a private study; keep them out of the shared catalog. Distinguish real
camera geometry from coordinated 2D approximations. Record any unavailable effect as
unmatched rather than replacing it silently. Render through the normal scene workflow.

## Compare and correct

Open all returned render frames and inspect entry, middle and exit natively. Compare
every feature, not just overall readability. The normal exact-render `scene review`
now includes each detailed requirement, and the same bounded correction loop applies.
Audio can remain unknown in a visual-only study. A technical render pass is not fidelity.

For a native-resolution diagnostic, open the candidate in the **same evidence cache**,
extract its corresponding range, and use:

```sh
dapi media reference pixels REF_SESSION REF_SEQUENCE CAND_SESSION CAND_SEQUENCE pair.json --cache-dir CACHE -o comparison.json
```

```json
{"referenceFrame":30,"candidateFrame":24,"rationale":"Corresponding middle-title focus beat","region":{"x":200,"y":450,"width":650,"height":500}}
```

The region is optional, integer, native pixel coordinates. Dimensions must match; no
resizing is implicit. The command checks source-frame hashes and produces a 50/50
overlay, absolute-difference image and RGB error measurements. Record why those frames
and that region correspond. Inspect multiple phases; one matching still proves no
animation match. Compression, color conversion, different text/assets and timing all
affect errors. These are diagnostics, **not a style percentage or automatic pass**.

For reconstruction, report failed control features and use remaining corrections before
claiming a match. For style learning, generalize the design behavior through the style
guide and test different content directly. Keep useful material/motion/typography rules
while adapting layout, wording, media and timing. Review each export independently.

## Reuse without losing the analysis

Catalog capture carries `designKnowledge`: categories, feature requirements, adaptation
rules and limitations, without local frame IDs, sequence hashes or inherited approval.
Inspect prose for private names/paths before explicit catalog addition. This is portable
design knowledge, not permission to redistribute imagery or fonts. Catalog `show` exposes
the detail. Catalog `apply` creates fresh **per-feature** review criteria; it refuses an
oversized checklist rather than collapsing detail into four generic labels. Source assets
remain explicit new-media slots. New renders still require independent review.

## Rendering support

Existing masks, layer/group transforms, blur, outlined titles, precision curves and
speech cues remain available. Unwrapped layered title fonts can opt into
`horizontalScale` (0.5–1.5) for an explicitly estimated condensed glyph aspect;
this is not font identification and is rejected on captions/measured reflow titles.
Remotion templates can additionally use
`finish: {grain: 0.17, vignette: 0.32, seed: 407}` (strengths 0–1). Grain is deterministic
per frame; vignette is a fixed radial finish. This is not a procedural material system,
3D camera solver or chromatic-aberration estimator. The editor renderer rejects this
Remotion-only finish explicitly. `caption.visible: false` may hide speech captions in
a deliberate visual-control study while retaining the transcript and timing data;
state that choice to the user. Normal narration review is unchanged.
