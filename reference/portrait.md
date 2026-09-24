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

## Explicit unreviewed draft export

When the user wants a watchable preview before source/speech approval, use the
separate draft path. Do not fabricate a review to unblock normal preparation.

```sh
dapi playbook clips portrait draft-export candidates.json clip-1 --recipe recipe.json --acknowledge-unreviewed --captions draft.srt --font caption-font.ttf -o clip_DRAFT.mp4
```

`recipe.json` is the strict numeric `recipe` object described below, not a reviewed
portrait document. It must match the candidate's probed source geometry and frame
count. Captions are optional; their default timebase is source-relative, with
`--timebase clip` available for clip-relative SRT/VTT. Existing caption/font and
pixel budgets apply. No transcript is generated or uploaded.

This local draft encoder reuses the production crop and caption primitives. It
checks source bytes, selection bounds, transcript-unit boundaries, crop geometry,
caption/font files, dimensions, duration, audio-track presence and full decode.
Unresolved narrative, speech and framing needs are retained in the sidecar, not
changed into passes. Only missing review needs are allowed; technical errors,
stale reviews and unknown evidence still fail. Evidence availability is not proof
that someone inspected it. An explicit `--acknowledge-unreviewed` and a filename
ending `_DRAFT.mp4` or `.draft.mp4` are required.

The output has an exclusive `.draft.json` sidecar with status `unreviewed_draft`,
`reviewRequired: true`, and `safeToAutoPublish: false`. Its `.draft-assets/`
directory retains the request, frozen caption/font assets, filter and encoded
staging file for diagnosis. Existing outputs are never overwritten; a failed or
interrupted run can retain partial files, so choose a new output name on retry.
The draft is **not** a desktop-editor export, normal delivery bundle, portrait
review document or accepted render receipt. Normal `init/prepare/deliver` and
review gates are unchanged. Review the draft with the evidence pipeline and
attribute any user listening feedback honestly before making a reviewed export.

## Imported captions and phone-size review (V2 opt-in)

Existing V1 documents remain supported. Opt into the versioned mobile contract
before recording the framing review:

```sh
dapi playbook clips portrait mobile portrait.json --captions transcript.srt --font caption-font.ttf -o mobile.json
dapi playbook clips portrait check mobile.json
```

Use `mobile.json` in the subsequent framing-review command. This operation always
clears framing approval, even when upgrading an already reviewed V1 document.
It makes no model call and does not transcribe or upload anything. The local font
must be a standalone TTF/OTF file that you are licensed to use. Its family is read
from the font; an optional `--font-family` must match. Font bytes and caption input
bytes are fingerprinted. Changing either file requires re-import and fresh review.

Caption timestamps default to the **original source timeline**. Use `--timebase
clip` only when the supplied captions already begin at the selected clip's zero.
Cues are mapped to half-open 30-fps frame ranges and clamped to the selection.
Boundary warnings require checking words against retained speech: segment timing
is not word alignment. Plain-text SRT and WebVTT are supported, including UTF-8,
BOM and CRLF. Overlaps, markup/entities, positioning settings and unsupported VTT
metadata are rejected rather than silently discarded. Line breaks are explicit;
there is no automatic word rewriting or karaoke timing. The first burn-in renderer
rejects literal ASCII braces/backslashes rather than rewriting them or permitting
ASS control injection. At most 200 output cues and three lines per cue are allowed;
coarse width checks can require manual reflow. They are not font-metric proof.

`mobile` without `--captions` enables the profile and phone-review gate alone.
On an existing V2 document it retains captions; `--without-captions` explicitly
removes them. Use `--profile profile.json` to supply a strict, editable profile:

```json
{"id":"my-channel-mobile","revision":1,"safeArea":{"left":0.08,"right":0.18,"top":0.1,"bottom":0.22}}
```

Insets are normalized fractions of the output dimensions. These values, including
the `generic-mobile` default, are **editorial guidance, not certified platform safe
zones**. Adjust them against the intended placement and actual devices. Caption
style and mapped cues remain editable in a new document. Every content, font,
style or profile change invalidates its old framing approval. Dense screen content
still needs appropriate framing; captions do not enlarge unreadable source text.

V2 preparation requires FFmpeg's `subtitles`/libass capability. It copies the exact
source captions and font into `mobile-assets/`, generates bounded ASS, and bakes
captions after reframing. The prepared reference therefore contains the intended
captions; normal render comparisons are not bypassed. The bundle verifies its
frozen assets and does not depend on the original external font/caption files
remaining available after preparation. Missing capabilities fail explicitly.

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
`pass`/`fail` finding and `note`. V2 additionally requires `captions` and `placement`
(five checks total); only `captions` may be `not_applicable`, only when captions
are absent. Never copy pass outcomes without inspection.

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
For V1, only speech can be `not_applicable`, only for a digitally silent output.
Schema validation cannot tell whether cited audio was listened to or transcribed.

For V2, `inspect` also samples caption boundaries/midpoints and writes a sibling
`render-evidence.json.mobile/` directory. Its clean **360x640 motion preview** keeps
the whole clip, while phone-size stills add a cyan safe-area guide; these guides
are review artifacts, never burned into the delivered clip. Both are fingerprinted
and bound to the exact video and profile, with an independent generation record in
`bundle/mobile-inspections/`. Review checks that record as well as actual motion
format/duration and PNG dimensions; self-declared filenames/hashes are insufficient.
These local records are not authentication against someone who controls the entire
filesystem. View the motion preview at its intended
size, inspect guided stills, and check words, timing, wrapping and relevant picture
content without assuming native-resolution readability transfers to a phone.

V2 render review requires seven checks: `story`, `speech`, `framing`, `continuity`,
`readability`, `captions`, and `placement`. Acceptance also requires citation of
`phone-motion` and at least one returned `phone-frame-<frame>` artifact, alongside
all required native samples and audible-output audio. Only silent-output speech
and genuinely absent captions may be `not_applicable`. A legacy four-check review
cannot approve a V2 render. Profile, preview or still-image changes require a new
inspection. This recorded attribution is not proof of viewing or real-device QA.

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
node packages/editing-playbook/test/mobile-cli-smoke.ts NEW-SCRATCH-DIRECTORY NEW-MOBILE-DIRECTORY LOCAL-FONT.ttf
node packages/editing-playbook/test/portrait-draft-cli-smoke.ts NEW-DRAFT-SCRATCH-DIRECTORY LOCAL-FONT.ttf
```

The synthetic smoke clears provider credentials from its process. It tests the
complete CLI contract, moving crop pixels, a hard framing reset, contain mode,
nonzero source trim, blocked/stale reviews, missing evidence and overwrite refusal.
Its verification stand-in is explicitly not an editor export. To check desktop
delivery, render its generated `bundle` with `playbook deliver` in an isolated
desktop profile, then use `portrait inspect` on that actual MP4.

The separate draft smoke checks explicit acknowledgement, unapproved status,
source-time caption burn-in, crop/cut/contain pixels, full decode, overwrite
refusal and that the normal reviewed path remains blocked.
