# Visual-journal cutaways over continuous voice

Use `dapi playbook layered workflow` for versioned JSON schemas and the command
sequence. This is a separate, reusable actual-editor workflow, not extra fields
added to the strict cut-only plan. It makes no AI calls, uploads or downloads.

V1 supports full-frame, **silent B-roll over the base edit's original sound**.
The voice continues when the picture changes and returns in sync. Original
environment/action sound can lead in a standalone base-plan segment; leave such
moments some breathing room. Cutaways do not double their original dialogue.
Music, ducking, EQ/denoise, speed changes, transitions and multiple overlay lanes
are not supported here. The user has deferred music; do not acquire a track.

## Choose the style, then inspect footage

```sh
dapi playbook recommend --format story --task edit --goal "Edit my daily vlog"
dapi playbook layered workflow
```

Read the returned skills and `styleProfile.instructions`. The repository's
[scoped profile](style-profiles.md) prefers a life journal: the creator's own
street, weather, nature, room and daily details can matter even without literally
illustrating narration. It does not mandate B-roll or a fixed shot frequency.
Keep the original picture if the available cutaway is distracting or misleading.

Use the [evidence pipeline](agent-workflow.md) on all selected sources. Actually
inspect each proposed cutaway and its boundaries; use the first video PTS as the
common source origin. Distinguish sampled frames, inferred continuity and direct
listening. A transcript gap is not evidence of silence. Retain artifact paths,
source hashes and attributed observations.

## Layered plan

The `editor-layered-plan` contains:

- `basePlan`: the existing evidence-backed plan, including all referenced sources
  and evidence. Its ordered segments define the complete duration and original
  sound. Keep speech units intact using `speechRanges`.
- `settings`: existing delivery settings (30 fps, even dimensions, bounded
  duration, optional separate chapters).
- `pictureProtectedRanges`: output-frame ranges that must stay visible, with
  reasons. The base plan's protected source moments also protect picture.
- `cutaways`: unique IDs, source IDs, source `in`/`out` seconds, output `atFrame`,
  purpose (`environment`, `illustration`, `memory`), reason, `chronologyNote`,
  inspected visual `evidenceIds`, and `audio: "muted"`.

Each cutaway's visible duration is `ceil((out-in)*30)` frames, with at most a
sub-frame hold. Its start is an integer frame. It must fit entirely inside the
base timeline, cannot overlap another cutaway, and cannot cover a protected
moment. Cutaway evidence must cover the selected source range, be attributed as
observed visual evidence, and name an artifact. This validates declarations; it
does not authenticate whether someone really watched those artifacts.

Example cutaway (the complete surrounding plan is still required):

```json
{
  "id": "street-view",
  "sourceId": "day-one-drive",
  "in": 6,
  "out": 11,
  "atFrame": 435,
  "purpose": "environment",
  "reason": "Briefly remember the surroundings while the reflection continues.",
  "chronologyNote": "Earlier in the same drive; not proof of the narrated event.",
  "evidenceIds": ["inspected-road-range"],
  "audio": "muted"
}
```

The base plan retains the voice; the five-second picture change starts at 14.5s.
It does **not** shift narration, shorten the edit or change speech ordering.

## Prepare and render

```sh
dapi playbook layered check layered-plan.json
dapi playbook layered prepare layered-plan.json -o new-layered-bundle
dapi playbook layered deliver new-layered-bundle -o new-journal.mp4
```

`prepare` needs Node/FFmpeg and local sources, not a running app. Source hashes,
actual bounds and geometry are checked. The bundle keeps the base preparation,
normalized silent cutaways, per-base-clip audio stems, a continuous original-sound
WAV, source/timeline mapping, hashed recipe and generated `edit.tsx`. Visible
picture spans are flattened; voice is a separate audio node in the real editor.
The audio WAV is not separate editable dialogue/ambience stems: it contains the
original recording mix. Reprepare from the retained recipe to change its timing.

`deliver` requires the app and creates a **new** project. It renders the actual
composition and uses the layered verifier before copying to a new destination.
Existing bundles, exports and review files are never overwritten. Failed or
interrupted jobs retain diagnostics; inspect their run record before retrying.
Do not move a prepared bundle: composition paths are hash-bound. Reprepare in the
new location instead. Preparation may duplicate selected media; retain the final
export and ask before deleting working files.

## Review the actual output

```sh
dapi playbook layered verify new-layered-bundle new-journal.mp4 -o technical.json
dapi playbook layered inspect new-layered-bundle new-journal.mp4 --cache-dir evidence -o inspection.json
dapi media inspect <render-session> --cache-dir evidence --start 12 --end 22 --count 12 --audio --clip
dapi playbook layered inspect new-layered-bundle new-journal.mp4 --cache-dir evidence -o inspection-refined.json
dapi playbook layered review new-layered-bundle new-journal.mp4 review.json --inspection inspection-refined.json --cache-dir evidence -o agent-review.json
```

`verify` fully decodes the file, checks duration/frame count/dimensions, compares
sampled picture against its intended visible source, checks the continuous WAV
against base audio, and checks rendered audio separately through picture joins.
This matters: a cut-only comparison would incorrectly expect the cutaway's sound.
Silent/periodic samples remain ambiguous. The checks are sampled technical
comparisons, not continuous audiovisual approval or a taste/engagement score.

`inspect` opens the **export** with the normal evidence pipeline, prepares
important boundary frames and aligned audio, and hashes its artifact/contact-sheet
packet. It prepares candidate evidence only; it does not certify a bundle match.
Open the returned images/audio, refine motion boundaries,
and check the first/last picture, return-to-speaker sync, intended emotion, place,
and whether the cutaway refreshes the passage or distracts from it.

After extra `media inspect` refinement, run `layered inspect` again with a new
output name to snapshot those additional artifacts. Reused inspections are cached.
The review schema is available in `workflow`. It binds the author, the packet's
`packetSha256`, selected inspection artifacts, exact exported bytes and bundle identity. It records
`sampled_frames` or `sampled_video`, and `direct_listening`, `asr_only` or
`not_reviewed` separately. `review` reruns technical verification and refuses
stale source/bundle/artifact links; the recorded observations remain
`agent_reported_sampled_review`. A review file or successful check is never
automatic publishing permission. When direct listening was unavailable, say so
and invite the user to check the sample's sound.

## Regression checks

```sh
npm run test --workspace=@diffusionstudio/editing-playbook
node packages/editing-playbook/test/layered-media-smoke.ts
npm run check --workspace=@diffusionstudio/cli
```

The optional media smoke uses synthetic picture/sound, checks preparation,
independent audio, wrong-sound rejection, no-overwrite and tamper detection. It
does not claim an actual-editor render; perform a separate short real-editor
test after changing composition/render behavior.
