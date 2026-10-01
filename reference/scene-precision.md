# Precision controls and actual-pixel measurements

Use these opt-in controls for `layered-v2` recipes. Existing recipes and pinned
catalog entries retain their old rendering. No model, API key or upload is used.
The calling agent still chooses the design, seed, evidence and corrections.

## Editable curves and timing

A key controls interpolation **from that key to the next**. `easing` accepts the
existing names, `bounce`, a cubic Bezier `{kind:"bezier",x1:.22,y1:1,x2:.36,y2:1}`,
or a normalized damped curve `{kind:"spring",damping:6,cycles:1.5}`. The latter
is an authored curve, not a recovered physical spring. All use deterministic
absolute-time seeking, including backward seeks and exposure samples.

Optional `propertyTiming` gives each property a local interval inside that key
segment, e.g. `{opacity:{start:0,end:.4,easing:"easeOut"}}`. Optional `path`
contains absolute normalized cubic control points `{x1,y1,x2,y2}` between the
two key positions. Path timing follows the main easing; independent x/y timing
on the same key is rejected. Media and groups need identical width/height timing
to preserve aspect ratio. Opacity/reveal, blur and positive dimensions are
bounded; position and scale may overshoot. Inspect paths near screen edges.

## Readable layout on new footage

```sh
dapi playbook motion scene layout recipe.json input.json options.json -o new-layout
```

Options: `minFontSize` (fraction of shorter dimension, default .04), `maxLines`
(2), `margin` (.05), `lineGap` (1.1), optional `layerIds`. By default titles at
font size >=.03 are selected, not tiny credits. The proposal respects supplied
protected regions, caption boxes, other text envelopes and motion across every
frame. Grouped titles and layouts without a safe placement remain unresolved.
It does not detect faces or infer semantic importance. Inspect the report and
preflight before starting a job; an available box may still be a poor design.

The renderer uses actual Canvas font metrics to wrap and fit `textLayout`
layers. It preserves every word, never horizontally squeezes glyphs, and throws
if the minimum readable size cannot fit. A chosen box does not prove readability
or an available font. Review native output pixels. Long words and extreme aspect
ratios can require another design. Catalog apply accepts the same optional
`layout` settings without modifying pinned entries.

## Seed a visible object in reference frames

After extracting and viewing a short sequence through `media reference`, write:

```json
{"seedFrame":0,"from":0,"count":30,"box":{"x":0.2,"y":0.3,"width":0.3,"height":0.2}}
```

```sh
dapi media reference track SESSION SEQUENCE seed.json --cache-dir evidence -o track.json
```

The box uses top-left normalized coordinates on the selected native seed frame.
`from`/`seedFrame` are range-local indices. Up to 120 frames are decoded at a
maximum 480px dimension for bounded grayscale patch matching; timestamps remain
the original native PTS. The seed needs distinctive texture and at least 8px per
dimension at tracking resolution. Optional `searchRadius`, `minScore`,
`ambiguityMargin`, `scaleStep`, `rotationStep` appear in `media reference workflow`.
Do not lower thresholds merely to obtain a pass.

Outputs are relative translation/scale/rotation candidates, not semantic object
detection, opacity/font recognition, calibrated confidence or original keyframes.
Occlusion, repeated objects, blur and lighting can defeat matching. Tracking
stops in a direction when uncertain; inspect candidate positions before using
them as evidence. Preserve failures and source/timestamp/hash bindings.

## Measure the rendered result, then use the existing correction loop

First render and inspect the actual editor job. Pick a distinctive visible layer
patch and save a target (up to three, each <=4 seconds and within one shot):

```json
{"targets":[{"id":"object","shotId":"shot","layerId":"hero","start":0,"end":1,"seedTime":0.5,"box":{"x":0.2,"y":0.3,"width":0.3,"height":0.2}}]}
```

```sh
dapi playbook motion scene measure JOB targets.json
```

The sealed report compares actual pixel tracks with planned transforms at the
same times, preserving missing coverage. It reports per-frame position, scale,
rotation errors and an optional local lag hypothesis (within +/-3 frames).
Motion is seed-relative: initial placement, glyph size and opacity are not
checked. Nonuniform deformation/skew is outside the patch similarity model.
Errors are diagnostics, not a fidelity score or instructions to change the story.

Inspect the track and both videos. If an actual mismatch remains, record a failed
exact-render review and use `scene correct`. Do not silently rewrite sealed
recipes, accept a lost track, or spawn fresh jobs to evade the correction budget.
Passing measurements never replace listening/style review.

## Golden-frame checks for reusable catalog designs

```json
{"frames":[0,5,15,30,60,90],"width":160}
```

```sh
dapi playbook motion scene golden REVIEWED_JOB frames.json -o baseline.json
dapi playbook motion scene compare-golden NEW_JOB baseline.json --tolerance 1
```

Use the same input, assets, frame indices, dimensions, fonts and runtime to test
a changed renderer/recipe. Capture entrance, hold, cue and exit frames for each
catalog design. Preserve a reviewed baseline before changing code. Baselines
contain RGB samples plus input, recipe, render and pixel hashes; they are not a
video or inherited approval. Limit 24 samples and <4MiB JSON; choose fewer/smaller
samples when the aspect ratio exceeds that budget. Different footage or input
is rejected, not compared as a style match.

`visual_change_requires_review` means sampled pixels differ beyond the requested
0–20 mean RGB threshold. It does not say which version is better. Downscaled
samples can miss small details and between-sample errors; dense/native inspection
still matters. Keep private imagery/baselines local unless authorized to distribute
them. Unit fixtures test change detection, drift and uncertainty; real-editor
golden comparisons are separate integration checks, not automatic CI coverage
of every future catalog entry.

An explicit desktop integration check is available (after building the CLI):

```sh
node packages/editing-playbook/test/scene-golden-smoke.ts EXISTING_JOB NEW_DIRECTORY
```

It preserves the existing job, renders the same input in a new job, and compares
up to 24 samples at tolerance 1. It needs the original local media and a running
editor. Run it on a short multi-template fixture; it does not approve either video.
