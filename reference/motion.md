# Agent-driven caption motion workflow

For full compositions, word-level typography and reference-fidelity criteria, use
the separate [scene motion mode](scene-motion.md), `playbook motion scene workflow`.
The caption format below remains supported without migration.

This connects dense reference evidence, an agent's existing structured breakdown,
an editable recipe, new-footage adaptation, and a bounded actual-editor
render/review/correction loop. V1 supports caption entry/hold/exit effects:
translation, rotation, opacity, modest scaling, line stagger and blur.
It is not a universal animation reverse-engineer or a new model service.

## Agent and runtime responsibilities

The current vision-capable agent reads image pages and authors the breakdown;
`motion next` supplies resumable work and evidence. A CLI process does not call
the agent back or magically interpret filenames. A host can keep invoking these
commands until the job stops, using its own vision/audio tools. Local commands
make zero external model calls; the host's own image tools may process images.
Missing capabilities remain explicit. Speech recognition, word alignment,
subject tracking, sound-event analysis and exact easing recovery are not added.

Requirements are the existing Node/FFmpeg evidence runtime and, for rendering,
the running desktop editor. Start with a 1–3 second complete effect, not an entire
video. `motion workflow` exposes strict schemas. All files and caches stay local.

```sh
dapi playbook motion workflow
dapi playbook motion start reference.mp4 --start 0 --end 2 -o motion-job
dapi playbook motion next motion-job --from 24
dapi playbook motion interpret motion-job breakdown.json intent.json
dapi playbook motion adapt motion-job input.json
dapi playbook motion render motion-job
dapi playbook motion review motion-job review.json
# Only when the review failed and the job has retries remaining:
dapi playbook motion correct motion-job correction.json
dapi playbook motion render motion-job
dapi playbook motion review motion-job revised-review.json
```

`next` can be called at any point. It reports the required stage; it never records
viewing or a positive review. An interrupted export is not automatically retried.
`inspect` resumes evidence preparation if the exported preview already exists.
Partial directories are retained for diagnosis and are not overwritten.

## Reference interpretation and recipe generation

Use the existing [breakdown schema](media/reference-analysis.md). Every frame in
the selected range must be listed as actually inspected; choose a smaller range
when necessary. `interpret` checks the sequence fingerprint and verifies cited
frame files. This checks attribution/integrity, not the truth of the agent's claim.

An intent selects one element's uniquely named phases:

```json
{
  "elementId": "caption",
  "entryPhase": "entry",
  "exitPhase": "exit",
  "rationale": "Recreate the observed staggered caption reveal with a blur exit.",
  "settings": { "easing": "easeOut", "blurPx": 8, "staggerSeconds": 0.08 }
}
```

Durations come from original PTS differences at the declared phase endpoints.
Position/rotation/scale differences come from authored endpoint keyframes, using
the entry end/exit start as resting baselines. Missing transforms use a stated
fade-only fallback. V1 rejects overlapping phases and phase spans outside
0.03–3 seconds; intermediate overshoots, masks, 3D motion and arbitrary paths
are not reproduced. Easing, typography and blur are explicit estimates/choices,
not inferred original software settings. Inspect unsupported detail and retain
uncertainty rather than claiming an exact reconstruction.

The saved recipe is versioned data with attribution and source hashes, separate
from words/timestamps. `motion reuse existing-job -o new-job` carries its original
recipe into a new job without reinterpreting it or inheriting a footage review.
Keep the original job/reference files: reuse references their evidence cache.
Per-footage corrections remain in that job, not silently promoted to the library.

## New footage and timing

`input.json` uses seconds from the source's **first video PTS**, not container
timestamps or output-relative times. Provide an absolute local source path and
its evidence-pipeline SHA-256. The 30 fps preview range is at most 30 seconds,
with up to 24 complete, nonoverlapping cues and even dimensions up to 1920 pixels.

```json
{
  "source": { "path": "/absolute/clean-clip.mp4", "sha256": "REPLACE_WITH_SOURCE_SHA256" },
  "range": { "start": 10, "end": 14 },
  "width": 1080, "height": 1920, "fps": 30,
  "captions": {
    "sourceSha256": "REPLACE_WITH_SOURCE_SHA256",
    "provenance": "Source-aligned local transcript; words need listening review",
    "verification": "unverified",
    "cues": [{ "id": "phrase-1", "start": 10.3, "end": 13.7, "text": "Make this moment count" }]
  },
  "subjectCoverage": "agent_inspected",
  "protectedRegions": [{ "start": 10, "end": 14,
    "box": { "x": 0.2, "y": 0.1, "width": 0.6, "height": 0.5 }, "reason": "Speaker face" }]
}
```

This example needs a real path/hash and inspected coordinates. Protected boxes
are normalized **output** coordinates after contain-fitting; no automatic crop
or tracking is performed. Whole-frame boxes can intentionally make placement
impossible. Unknown subject coverage is allowed only with an explicit warning.

Adaptation wraps without changing words, scales font size within bounds, warns
about reading rate and compresses motion to retain hold time. It checks a swept
motion envelope against picture edges and supplied regions, trying the requested,
upper and middle placement. Impossible fits fail rather than dropping text.
Width estimates are conservative heuristics, not installed-font measurements;
inspect actual rendered text. Use a locally available font you have permission
to use; this module does not download or bundle fonts. Canvas fits each measured
line to its box; native text still needs actual font/placement review.

Preparation makes a bounded, source-bound 30 fps base clip with synchronized
original audio, contain-fitting and no added music. It re-encodes; it is not a
bit-exact audio copy. Original footage is never overwritten. Burned-in captions
are not removed; choose a caption-free source/prepared clip.

## Editable output and correction

Each revision stores its recipe/input, derived cards/timing, frozen base media,
and generated `edit.tsx`. Translation/rotation/opacity use native editable text
and keyframe tracks. Scaling/blur use a seek-safe canvas surface with editable
recipe parameters; individual canvas glyphs are not native inspector text layers.
Reference text is serialized as data, never executed as generated code.

The render command verifies source and generated composition fingerprints, creates
a new editor project, exports `preview_DRAFT.mp4`, then prepares native frames at
cue entry, settled state, midpoint and exit, plus an audio excerpt when audible.
Inspect all supplied frames. For smoothness or rapid details, extract and view
dense ranges from the returned render `sessionId` using `--cache-dir JOB/evidence`.
Compare phases and normalized movement against the reference, not raw whole-frame
pixel similarity when footage, fonts or aspect ratios differ.

Technical checks cover decoding, frame count/rate, duration, dimensions and audio presence; they
do not prove audio identity, caption accuracy, smoothness or aesthetic quality.
A review binds the exact adaptation, rendered bytes and inspection hashes and
contains one finding for each of `motion`, `timing`, `readability`, `placement`,
and `audio`. Each finding uses `pass`, `fail`, `unknown`, or (silent audio only)
`not_applicable`, with notes and inspected evidence IDs. Mark audio unknown when
no listening capability is available. A frame or ASR transcript is not listening.

An additional review on the same unchanged preview appends an immutable review
record (up to eight), so a later listener can resolve unknown audio. It does not
erase earlier findings. Corrections must cite the latest review hash.

Failed reviews allow a correction with current `adaptationSha256`,
`reviewSha256`, `reason`, partial `settings`, and optionally
`captionOffsetSeconds` (-0.5 to +0.5). Offsets invalidate transcript verification
and still must fit the chosen range. Corrections cannot replace the source or
rewrite captions. Every correction creates a new immutable revision and requires
another render/review. The default is two corrections, configurable at job
creation from zero to four. No-op, stale, unreviewed and over-budget corrections
are rejected. `reviewed_draft` remains an agent-reported draft, never publication
approval or an automatically installed style skill.

## Tests

Pure tests cover phase bindings, timestamps, layout/reading-time constraints,
protected regions, seek safety, inert strings, exact review identity, capability
limits and correction stops. `test/motion-cli-smoke.ts` exercises the CLI and
FFmpeg using synthetic media; its fixture reports are labeled as test data, not
agent viewing. Run it from `packages/editing-playbook` after building the CLI.
Use `--editor` for the optional actual-editor export test with an isolated profile.
Neither synthetic test is evidence of engagement uplift or broad style fidelity.
