# Channel explainer template

This channel-specific template implements the user's navy/white/cyan brief. It
does not change vlog defaults or claim to have learned a reference video. Any
agent can discover its complete request schema with `dapi playbook channel workflow`.
The package interface is `@diffusionstudio/editing-playbook/channel-template`.

## Reuse

`channel-explainer@1` has six editable section types: `hook`, `roadmap`,
`explanation`, `demonstration`, `comparison` and `next-step`. Select just the
sections needed for a clip; a Short need not repeat an entire long-form episode.
Supply a headline/action, three roadmap stops with section-relative activation
times, three diagram nodes, a normalized screen highlight, or two/three option
cards with the same skills/work/first-project fields. The font is Arial regular
and bold. Navy panels, white text, cyan emphasis, short fades and gentle slides
stay fixed. Actual font measurements reject titles that cannot fit readably.

`visualStyle` defaults to `paper`: original, seeded navy folds, mottling and
fibers behind content, with rounded framed panels, cyan markers and staggered
diagram/comparison entrances. The material is static for stable cuts/seeks and
never overlays camera footage, screen captures or captions. It is inspired by
[Remotion Elements](https://www.remotion.dev/elements/backgrounds/paper-texture/),
not a copy of its shader or a recovered editing project. Select `clean` for the
original flat layout. The paper preset requires the local Remotion renderer;
the editor renderer rejects it rather than dropping the material.

### Rebuilt native editorial preset

Set `visualStyle` to `editorial` for the rebuilt React/SVG version. It keeps the
same six section types and the normal `build`, `demo`, `adapt` and scene-review
commands. The earlier `paper` and `clean` presets remain available unchanged.

The native preset uses left-aligned editorial headlines, a folded navy paper
background, an incrementally connected roadmap, two inputs merging into one
result, a source-relative screen focus, matching comparison fields, and a drawn
checkmark for the final action. The portrait version has independently placed
graphics and a two-line caption band. Animation uses the local frame clock, so
scrubbing and parallel rendering give the same poses. Native headline measurement
reduces oversized copy within a readable limit and rejects an unfit heading.
Inspect the actual export for all other text, footage and application UI overlap.

Each native scene is a separate component in `packages/remotion-renderer/src/channel`.
`ChannelConnectedScenes` registers those same component references for independent
Studio preview. Content instances are intentionally controlled by the validated
request JSON; the shared component source owns their design. This is not a new
drag-and-drop editor interface. Native version 1 lives in `template.channel`;
the regular layer list retains only fixed camera/screen media slots. Bind sources
through the normal evidence workflow, and make framing changes with reviewed
source crops. Unsupported engines and arbitrary layer overrides fail closed.

To review a redesign, render a short hook and a portrait comparison first, then
the complete demo. Open section holds, both sides of cuts, native-size text and
dense ranges around roadmap activation, diagram assembly and the screen focus.
Keep the previous exports for comparison; record the exact reviewed render hash.

```sh
dapi playbook channel example --layout landscape
dapi playbook channel build request.json -o NEW_TEMPLATE_BUNDLE
dapi playbook channel demo request.json -o NEW_DEMO_JOB
```

The `example` returns sample JSON, not an output file. Save/edit it locally.
`layout-demo` uses labeled schematic camera/screen placeholders and authored
two-line caption examples. Its generated-only renderer is **intentionally
silent**, with no source assets, fake transcript, synthesized speech, music,
model calls, downloads or publication. The returned technical receipt and
sampled frames still require visual inspection; motion should also be checked
in bounded dense sequences. Failed/interrupted jobs are retained, not overwritten
or automatically retried.

`landscape` is 1920×1080, with side-by-side presenter/graphics and comparison
columns. `portrait` is 1080×1920: presenter/graphics stack, roadmap flows down,
and comparison cards become rows. Portrait graphics stay above a separate
two-line caption band; the right/bottom UI margins are conservative starting
points, not a guarantee against every social app overlay. This is independent
layout authoring, **not** cropping the widescreen composition.

## Actual footage

Use the editor's existing agent evidence pipeline first. Switch `mode` to
`footage`, remove `demoCaption`, and supply a normal source-bound `SceneInput`:
original media hashes/provenance/permission, continuous audio range, actual word
timestamps/caption groups, section IDs/times, framing evidence/protected regions,
and `camera`/`screen` slot bindings where requested. The builder never derives
speech timestamps from authored prose. Roadmap/highlight activation times must
be chosen from inspected speech and converted to section-relative seconds.

```sh
dapi playbook channel adapt request.json input.json -o NEW_SCENE_BUNDLE
dapi playbook motion scene start NEW_SCENE_BUNDLE/recipe.json NEW_SCENE_BUNDLE/input.json -o NEW_JOB
dapi playbook motion scene render NEW_JOB --renderer remotion
dapi playbook motion scene next NEW_JOB
```

Follow the usual exact-export review/correction limits. User-brief criteria
yield `agent_reported_brief_conformance`, not original-reference match, catalog
approval or audience-engagement evidence. Fresh footage never inherits the
demo's review. Audio/speech synchronization requires listening.

`cameraAspectRatio` and `screenAspectRatio` describe the **bound, optionally
cropped** source picture. Images are contained, never stretched. For a large
portrait screen demonstration, supply an evidence-selected focus crop and its
matching aspect ratio; otherwise a landscape screen is deliberately letterboxed.
Highlight coordinates are relative to that actual screen picture. Keep the small
camera window away from important screen details during review.

Shorts retain genuine caption wording/timing, with at most two rows in the fixed
reserved band. Long form hides full captions and displays optional `keyPhrase`.
Each render bundle is bounded to 60 seconds; build longer episodes from reviewed
section bundles using the existing delivery/continuous-audio assembly workflow.
This is a reusable renderer/agent template, not a new graphical editor panel.

The optional next-step `pdf` requires `ready:true`, a short label and an HTTPS
download page. Without it the template shows only the action. The caller must
verify that the resource exists and is authorized: the builder does not create,
upload or verify the PDF or publish its URL.
