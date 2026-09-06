# Agent-directed mobile clips

This is the default **mobile/vertical clip** workflow, following the reviewed
selection in [clips](clips.md). It connects source evidence, the agent's narrative
and framing decisions, 9:16 preparation, actual-editor delivery, and a separate
render review. No Gemini, second AI model, upload or paid analysis is required.
The caller must have image-reading tools and suitable speech/audio capabilities.
This is not autonomous subject detection or a headless agent reasoning loop.

## Workflow

Use Node 24+, local FFmpeg/FFprobe, and the built CLI. Replace `dapi` with
`node apps/cli/dist/index.js` when running from this repo. All outputs are new;
commands refuse to overwrite earlier versions. Use `--cache-dir DIR` consistently
when the source evidence lives in a custom cache.

```sh
dapi playbook clips portrait workflow
dapi playbook clips portrait init reviewed-candidates.json clip-1 -o portrait.json
dapi playbook clips portrait check portrait.json
```

`init` requires an accepted, exact-selection source/context review. It snapshots
the candidate collection and binds the corresponding playbook plan. The default
is **1080×1920, 30 fps**, a centered cover draft with **no framing review**.
It has not detected a person or decided that the center is safe. `check` returns
what remains to inspect and `inspectArgs` arrays for the source evidence pipeline.

Actually inspect those frames and relevant motion/audio. Edit only the recipe's
shot decisions, not its source bindings. A changed selection needs a new source
review and a new portrait draft. Explain the framing and cite source artifact IDs
for every shot. Split at known hard cuts or deliberate changes in attention.
Protect the subject, hands, demonstration, reactions and context that matter.
If a crop cannot do that, explicitly choose `contain` for the affected shot.

## Recipe coordinates

`recipe.sourceWidth/sourceHeight` come from probing the exact source.
`recipe.frames` is the selected duration rounded up to integer 30-fps frames.
All `startFrame`, `endFrame` and keyframe `frame` values refer to the **clip's
output timeline**, not the long-form source and not a shot-local clock.
Shot intervals are start-inclusive, end-exclusive and must tile the whole clip.
Source seconds = candidate range start + output frame / 30.

Example `shots` for an already inspected 4-second / 120-frame selection:

```json
[
  {
    "startFrame": 0, "endFrame": 60, "mode": "cover",
    "keyframes": [{ "frame": 0, "x": 0.4, "y": 0.5 }, { "frame": 59, "x": 0.6, "y": 0.5 }],
    "reason": "Replace with the actual inspected framing reason.",
    "evidenceIds": ["REPLACE_WITH_REAL_SOURCE_ARTIFACT_IDS"]
  },
  {
    "startFrame": 60, "endFrame": 120, "mode": "contain", "keyframes": [],
    "reason": "Replace with why the full picture is needed here.",
    "evidenceIds": ["REPLACE_WITH_REAL_SOURCE_ARTIFACT_IDS"]
  }
]
```

`x/y` are normalized center coordinates in the entire source image (0..1).
The viewport uses the minimum cover scale. Centers outside the legal viewport
bounds are rejected with the permitted range; they are not silently clamped into
a different creative decision. A cover shot needs a keyframe on its first frame.
Keys must increase strictly and remain inside that shot. One key is a static crop;
multiple keys interpolate **linearly**, holding the last value afterwards. Pans
never interpolate across shot boundaries. For a 4:3 source filling portrait height,
`y` is normally fixed at 0.5 because there is no vertical crop margin.

`contain` fits the entire picture on a dark background and takes no keyframes.
No zoom, stabilizer, face model, captions, new soundtrack or graphic is implied.
Supported output presets: 360×640 (cheap tests), 720×1280 and 1080×1920 (default).
Limits: 120 seconds, 16 shots, 64 total keyframes, bounded cover pixel budget.
Rotated or non-square-pixel sources are rejected until normalized and reinspected;
the implementation does not guess how coordinates should transform.

## Review the framing, then prepare and deliver

`check` returns `recipeSha256`. Author `framing-review.json` using the strict
schema from `portrait workflow`: `recipeSha256`, `reviewer`, `decision`, and
exactly one check each for `subject`, `context`, and `motion`, each with an actual
`pass`/`fail` finding and `note`. Never copy pass outcomes without inspection.

```sh
dapi playbook clips portrait review portrait.json framing-review.json -o reviewed-portrait.json
dapi playbook clips portrait prepare reviewed-portrait.json -o portrait-bundle
dapi playbook deliver portrait-bundle -o mobile-clip.mp4
```

`check` exits zero for a valid draft as well as a reviewed recipe: inspect
`canPrepare`, `status`, `errors` and `needs`. Preparation requires `canPrepare`.
Reviews bind the exact recipe, selection, source and source-review snapshot.
Changing the framing invalidates the old review. Source evidence must cover
shot boundaries, pan keys/midpoints and periodic hold samples. Availability of
evidence is not proof that an agent opened or understood it.

Preparation applies the numeric crop recipe with local FFmpeg, producing
already-reframed media with original sound. It preserves source-to-output timing
and the existing four unused decoder tail frames. It writes the hash-bound
`portrait.json` into the normal [delivery bundle](delivery.md). The recipe stays
editable by making a new reviewed version and preparing a new bundle; the crop
is baked into media, not represented as editable crop keyframes in the desktop UI.
Normalization and the final editor render are lossy encodes.

Delivery creates one new project containing one scene per invocation. Run clips
sequentially while the app is otherwise idle; this is not a transactional batch
queue. Source-trimmed animation clocks and sibling scenes cannot affect the crop
because it is already baked and the scene is isolated. This is a workflow-level
avoidance of known engine issues, not a claim those engine bugs were repaired.

The actual export receives normal full-decode, duration, picture and audio checks,
plus picture comparisons at the portrait sample frames. Comparisons are against
prepared media: they detect export corruption but do not independently prove the
agent selected the correct subject. No technical result approves publication.

## Inspect and record the actual output

```sh
dapi playbook clips portrait inspect portrait-bundle mobile-clip.mp4 -o render-evidence.json
dapi playbook clips portrait review-render render-evidence.json render-review.json -o reviewed-render.json
```

`inspect` rechecks the actual video against its bundle, opens a separate evidence
session, and returns native boundary/pan/hold frames plus full-range audio. It
does **not** mark them viewed. Open the returned files with the caller's available
tools. Check story, speech, framing and continuity; refine uncertain moments with
the evidence pipeline. Record failures and re-author/re-render as needed, keeping
earlier versions. The command can also check a compatible externally rendered file;
its success is not proof of which application created the bytes.

`render-review.json` has `packetSha256` from `inspect`, `reviewer`, `decision`,
`evidenceIds`, a truthful `coverage` description and four checks: `story`, `speech`,
`framing`, `continuity`, each with `outcome` and `note`. Acceptance requires every
sample frame and, for audible footage, the full audio artifact to be cited.
Only speech can be `not_applicable`, only for a digitally silent output. Schema
validation cannot tell whether cited audio was listened to or transcribed.

The resulting status is `agent_review_recorded` or `rejected`, never automatic
publication approval. The receipt binds output bytes, recipe, bundle and evidence
packet. Modified output, recipe or evidence requires a new inspection/review.
These are attributed local records, not cryptographically authenticated proof of
viewing. A separate agent may reuse the record but must not claim it personally
watched the video. Sampled frames are not continuous audiovisual review.

## Regression checks

```sh
npm test --workspace=@diffusionstudio/editing-playbook
npm run check --workspaces --if-present
npm run build --workspace=@diffusionstudio/cli
node packages/editing-playbook/test/portrait-cli-smoke.ts NEW-SCRATCH-DIRECTORY
```

The synthetic smoke clears provider credentials from its process. It tests the
complete CLI contract, moving crop pixels, a hard framing reset, contain mode,
nonzero source trim, blocked/stale reviews, missing evidence and overwrite refusal.
Its verification stand-in is explicitly not an editor export. To check desktop
delivery, render its generated `bundle` with `playbook deliver` in an isolated
desktop profile, then use `portrait inspect` on that actual MP4.
