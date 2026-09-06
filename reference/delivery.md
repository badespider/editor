# Prepared edits and checked delivery

Use this path for an authorized, evidence-backed **cut-only** edit or a reviewed
[portrait clip](portrait.md) whose framing is applied during preparation. The existing
agent evidence workflow still comes first. Local tools expose the footage; the
calling agent chooses and explains the cuts. These commands do not call another
AI, upload footage, publish a video, or approve the story automatically.

## Commands

Requires Node 24+, FFmpeg/FFprobe and a built CLI. Run from the repository:

```sh
npm run build --workspace=@diffusionstudio/cli
node apps/cli/dist/index.js playbook check plan.json
node apps/cli/dist/index.js playbook prepare plan.json -o new-edit-bundle --settings settings.json
node apps/cli/dist/index.js playbook deliver new-edit-bundle -o new-delivery.mp4
node apps/cli/dist/index.js playbook verify new-edit-bundle new-delivery.mp4 -o new-review.json
```

`prepare` and `verify` need no running editor. `deliver` needs the desktop editor
and creates a **new project**, leaving earlier edits intact. It leaves its new
project active. Do not edit or switch the app's project during delivery; coordinate
other callers. This is not a multi-user transactional render queue.

Read [the agent workflow](agent-workflow.md) and [plan contract](playbook.md) first.
Every referenced source must have its actual SHA-256 from inspection. Do not
fabricate evidence, reviewed speech boundaries, or source hashes to pass checks.
Relative source paths resolve from the input plan, not the shell directory.

## Settings

All fields are optional. This example assumes the named segments actually exist,
the first starts the edit, and consecutive chapters last at least ten seconds:

```json
{
  "name": "Evidence-backed vlog",
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "maxDuration": 1800,
  "chapters": [
    { "segmentId": "opening", "title": "Getting started" },
    { "segmentId": "main_action", "title": "The main activity" },
    { "segmentId": "ending", "title": "Wrapping up" }
  ]
}
```

- Supply both dimensions or neither. Dimensions must be even; width 160–3840,
  height 160–2160. Without them, the first selected source's probed aspect ratio
  determines the width at 1080 high. Specify dimensions explicitly for unusual
  display rotation/pixel-aspect metadata. All footage is contained, never cropped.
- This first version uses the editor's canonical **30-fps** timebase. A selected
  duration rounds up by less than one frame; the remainder holds picture and pads
  sound. Leave room for this rounding inside the plan's maximum duration.
- The default output budget is 1,800 seconds; explicitly raise it to at most 7,200.
  A plan can contain at most 100 cuts / 32 sources. Referenced files are local,
  regular files of at most 16 GiB each and at most two hours each.
- Chapter anchors use `segmentId` plus optional `offset` in seconds within that
  retained segment. Their timestamps are recalculated from the aligned output
  timeline. They are metadata, **not title graphics**. Omit chapters for short
  edits. The checker follows YouTube's current manual chapter requirements:
  00:00 first, three or more ascending entries, each at least ten seconds.
  [YouTube chapter help](https://support.google.com/youtube/answer/9884579?hl=en)

## What preparation produces

The new bundle contains `plan.json`, `settings.json`, `bundle.json`, `edit.tsx`,
`encode.json`, `chapters.txt`, and selected normalized media in `media/`.
The manifest records original source hashes/ranges and integer timeline frames.
The generated composition places those cuts in order with original sound and
contain framing. Inputs without an audio track receive silence.

Source cuts use the first original video PTS as the shared origin for both tracks;
nonzero timestamps and an existing audio delay are preserved. Four extra tail
frames in each prepared file are **not on the final timeline**; they prevent
decoder starvation at a cut boundary. Normalization uses H.264/AAC and is lossy;
delivery through the editor encodes again. This is not a lossless archival path.

Source files are never modified. Existing bundle directories are rejected.
Hashes protect the generated composition, plan and prepared media from accidental
changes; they do not authenticate an agent's observations. Bundles are bound to
their location. Moving them or hand-editing the generated composition requires
preparing a new bundle. For manual graphics/audio work, use a separate project
and review its actual composition; this cut-only verifier is not suitable for it.

Generic preparation does not add captions, music, transitions, B-roll, animated
crops, speed changes or SEO copy. The dedicated `clips portrait prepare` command
adds reviewed shot-local crop pans/contain fallback and a hash-bound recipe to
the bundle; final delivery remains a one-scene cut-only timeline of that prepared
media. Chapter text can be reused in a separately authored
description. The [clipping layer](clips.md) now proposes source-linked boundary
hints and exports agent-reviewed clip plans. Semantic highlight judgment remains
with the caller; automatic subject detection/tracking and captions are not included.

## Delivery and review gates

Delivery verifies the bundle before changing the app. It creates a unique
`.render-*` run folder, records the new project, mounts the generated composition,
reads current scene IDs, and renders the **actual editor project**. It then checks:

- Track presence, dimensions, frame rate, duration and timestamp alignment.
- A full video/audio decode with streaming low-resolution frame analysis.
- Sampled picture matches at the first/second/last frame and interior positions
  of each cut, covering both sides of every join.
- Sampled original-sound waveform correlation, level and lag against the selected
  prepared media, not against audio from an unrelated project.

The full decode detects decoding failures; the uniform-frame scan only warns.
Naturally dark footage or solid cards are not automatically removed. Silent or
very short audio cannot prove source identity and stays explicitly uncertain.
Waveform matching can also be ambiguous for repetitive sounds.

Only a technical pass is copied to the requested filename, with exclusive writes
for the MP4, `.review.json`, and `.chapters.txt`. A technical failure leaves the
diagnostic render/project available and returns `technical_review_failed` with
no delivery output. No old render, original or project is deleted.

Success is **`technical_pass_needs_visual_review`**, never automatic publication
approval. Inspect action continuity, speech meaning, framing/readability, important
joins and A/V sync. Record the actual review coverage and unresolved issues.
Sampled checks do not mean anyone watched or listened to the complete export.

Each preparation, verification and render request has a bounded local timeout.
Ctrl+C cancels local preparation/verification. Disconnecting during desktop export
does not guarantee the app stopped rendering. Inspect `run.json`, the retained
project and files before retrying. A killed process may leave its last recorded
state; a failure during saving can leave a partial set of delivery files. These
files are never automatically overwritten or removed on retry.

## Regression checks

```sh
npm test --workspace=@diffusionstudio/editing-playbook
npm run test:cache --workspace=@diffusionstudio/web
node packages/editing-playbook/test/delivery-smoke.ts NEW-SCRATCH-DIRECTORY
```

The synthetic smoke creates normal and mixed-media bundles, tests delayed sound
and nonzero PTS, fractional trims, silent/portrait input, wrong media, fingerprints
and no-overwrite behavior. For an actual editor smoke, run `playbook deliver` on
the generated `bundle` and `mixed-bundle` in an **isolated desktop profile**.

`apps/cli/src/test/desktop-render-smoke.ts` reproduces the project-switch cache bug
using two distinct synthetic chirps. Bundle it with the CLI's esbuild Node/CJS
settings into an ignored directory such as `node_modules/.cache/`, and run it
with a new scratch directory. Use only an isolated profile: it creates two test
projects, restores the previously active project if present, and deletes only
the two projects it created. The test is an audio-source regression, not an
evaluation of an agent's creative judgment.

Decoder caches now use actual asset/track object identity rather than project-local
asset IDs, so a new project's repeated ID cannot reuse another project's media.
