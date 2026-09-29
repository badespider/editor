# Reference-led scene motion

Use `playbook motion scene workflow` for the authoritative recipe, input, review
and correction schemas. This adds coordinated scenes to the existing editor;
caption-only `motion` jobs keep their original contract. The caller supplies visual
interpretation and judgment. No model, upload, tracking, transcription, music or
publication call is made by these commands.

## Reference specification first

Inspect every original frame in short [reference sequences](media/reference-analysis.md).
Store their cache/session/sequence hashes and the actually inspected indices in
`recipe.style.references`. Define essential criteria for **framing**, **typography**,
**motion** and **rhythm**, citing specific frame indices. Record optional details,
intentional exclusions and uncertainty separately. A schema can bind evidence,
not authenticate viewing or discover the original layers/easing/software.

Choose criteria that describe the supplied reference, not generic quality. For
example: changing full-screen compositions, progressive word build with unequal
emphasis, independently moving foreground/background, and a specific cut or hold.
Different footage/content may require a deliberate adaptation; document it. A new
decorative template is not a substitute for an unsupported essential technique.

## Reusable recipes and adaptation

The **recipe** contains style criteria, templates and typography. Legacy templates
put media slots before drawn layers; v2 allows free layer ordering. Bind slots and
source-relative trims in the separate **input**. Reuse the same recipe with another
input/new job; previous footage reviews are never inherited.

### Rich compositing (`compositor: "layered-v2"`)

For new photographic scene recipes, select `layered-v2`. The existing schema-1
branch without this field keeps its original composition code and limits.

1. Storyboard the visual argument and choose source-backed assets first. Give
   photographic texture, foreground/background separation and readable hierarchy
   essential criteria when these are part of the requested look.
2. Order images, drawn layers and native videos in the intended back-to-front
   stack. Image bindings accept a normalized `crop`, applied before the layer's
   mask; declare provenance for each source still. Image masks are an ellipse or
   a polygon of normalized `[x,y]` points. Drawn layers accept these masks too.
3. Use optional template `groups` for a shared camera-like move. A layer's `group`
   names one group. Groups use the ordinary pose/keys, uniform width=height scale,
   center-relative movement, rotation and opacity. This is 2D compositing, not a
   recovered 3D camera. Independent layer moves remain editable underneath it.
4. Tie important movements to real words: a key's `at` can be
   `{ "cue": "expand", "edge": "start", "offsetSeconds": 0 }`; each shot binds
   `cues: { "expand": "word-id" }`. Resolution uses the word's source time minus
   the narration start and shot start. Missing, reversed and out-of-shot keys
   fail; choose new offsets instead of clamping or inventing speech timestamps.
5. Use `motionBlur: { "samples": 4, "shutter": 0.5 }` sparingly on image/drawn
   layers. It averages past subframe transforms over half an output frame, clipped
   at the shot start. It is deterministic transform blur, distinct from static
   `pose.blur`; it does not synthesize intermediate moving-video frames. More
   samples/layers cost render time. Video effects unsupported by native tracks
   are rejected. Image decoding stays owned by the editor.
6. Inspect a short real-editor proof before the full render. Check cutout edges,
   texture, shadows, exposure trails, cue timing and mobile-size typography.
   Caption `minFontSize` applies to every scaled word in v2; shorten the group or
   change its layout when it fails. Fonts may specify tracking in em; captions
   may specify stroke color/width. Match observed hierarchy, not gratuitous effects.

V2 permits up to 60 seconds and 48 layers per template; the 16-shot and bounded
correction limits remain. Longer samples still require exact-version reference
review and a separate listening verdict. Source frame extractions and hand-authored
masks are evidence/creative choices, not automatic segmentation or rights clearance.

Layer `x/y` are normalized **center** positions; width/height are normalized canvas
dimensions. Key `at` is normalized shot time (0–1); partial poses accumulate.
Easing belongs to the segment following its key. Supported easing is linear,
cubic ease-in/out/in-out and hold; these are recreation choices, not recovered
curves. Multiple keys support overshoot/settle and independent layer movement.

Drawn layers: rectangle, vertical gradient, ellipse, hexagon and single-line text, with opacity,
scale via dimensions, translation, rotation, horizontal shear, blur, rectangular
reveal and shadow. Media layers: local video/image with translation, dimensions,
rotation and opacity. Legacy media blur/shear/reveal is rejected; v2 still-image
effects and masks follow the opt-in contract above. Native video retains those
restrictions in both modes. True 3D and automatic segmentation are not implemented.
Drawn glyphs remain recipe-editable canvas content, not native inspector glyphs.

The input owns an asset manifest with hashes, provenance and permission declarations;
shot purposes, reference-criterion mapping, inspected framing evidence and protected
output-picture boxes; and the original continuous narration range. Every shot
needs its framing rationale, even a generated illustration. Rectangular source
crops are explicit, normalized source coordinates; use native evidence to choose
them. Media layer boxes must retain the cropped asset's aspect ratio (2% tolerance);
stretching a landscape picture into portrait is rejected. Crop dimensions are
rounded down to even pixels. Picture is muted; narration
is prepared once at its original clock, avoiding duplicate/misaligned shot audio.
Legacy images use their complete pixels and authored output dimensions; v2 images
may use the explicit source crop described above.

Import real word timestamps from available source-aligned ASR/forced alignment or
a reviewed transcript. The module performs no alignment itself. All word times are
relative to the source's first video PTS; shot/caption-group times are output-relative.
Words retain their text and individual onset, with per-word row, size, weight,
italic and color. Revealed words accumulate until the group's end. Rows reserve
their final measured width so late words do not unexpectedly shift earlier ones.
Every supplied word must occur exactly once. The checker cannot detect words an
upstream transcript omitted. Minimum font size is enforced during actual rendering;
inspect text at native size. Unknown/ASR timing remains unverified.

## Commands and stopping conditions

```sh
dapi playbook motion scene check recipe.json input.json
dapi playbook motion scene start recipe.json input.json -o NEW_JOB --max-corrections 2
dapi playbook motion scene render NEW_JOB
dapi playbook motion scene next NEW_JOB
dapi playbook motion scene review NEW_JOB review.json
dapi playbook motion scene correct NEW_JOB correction.json
dapi playbook motion scene render NEW_JOB
```

`start` validates reference/source fingerprints, freezes media, and generates a
composition. `render` creates a new actual-editor project and prepares evidence.
`inspect` resumes evidence preparation when an export completed but inspection did
not. Start with a short proof, usually 6–10s. Legacy limits are 30s and 32 layers
per template; v2 limits are 60s and 48 layers. Both support up to 16 shots,
1080×1920 or other even dimensions up to 1920, at 30 fps.

`next` returns reference frames and actual-render samples. Inspect every supplied
frame, then use dense `media reference extract/page` on the returned render session
for important motion. Record dense coverage in review notes; samples alone do not
prove smoothness. Compare phase timing, hierarchy, picture use and relative layer
movement, not whole-frame pixel similarity across different subjects. Keep audio
and speech sync unknown unless actually listened to with a capable tool/person.

Reviews bind recipe adaptation, actual export and inspection hashes. Every style
criterion needs its own verdict and cited reference/render evidence. Essential
failures produce `mismatch`, even when export/readability checks pass. Optional
criteria still unresolved produce `partial_match`, not a full match. Unavailable
judgments remain unknown. `agent_reported_match` is not independent proof, audience
engagement evidence or user approval.

Corrections accept a revised recipe/input but preserve the style specification,
asset manifest, narration range and transcript. They require the latest failed
review and hashes, reject no-ops, and keep immutable revisions. Default two
corrections, maximum four. Stop at the limit or a technical/interrupted render;
inspect diagnostics rather than retrying concurrently or evading the limit with
a new job. Files are not overwritten. Every output remains a draft.

## Verification

Run the package tests/typecheck and CLI build. `test/scene-motion.test.ts` covers
word preservation, source clocks, reusable bindings, protected regions, keyframe
seeking, canvas/native data generation and reference-vs-technical review gates.
`test/scene-cli-smoke.ts` covers real local evidence/preparation and source tampering
with synthetic fixtures. A synthetic pass is not style fidelity; finish substantive
changes with an actual-editor preview and evidence-backed comparison.
