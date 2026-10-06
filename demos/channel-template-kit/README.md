# Channel template previews

Standalone, generated-only Remotion demos for the channel's navy/white/cyan
visual identity. No private footage, reference-creator assets, speech, music,
credentials or rendered videos are included.

## Run

Use Node 24+ and install this demo's pinned dependencies independently of the
editor workspaces:

```sh
cd demos/channel-template-kit
npm ci
npm run check
npm run studio
```

Open the localhost URL printed by Studio. Select `Five-Ways-One-Brand` for
the 39-second sampler, `Template-Overview` for the comparison sheet, or a
composition under `Five-Templates`. `One-Useful-Task` preserves the preceding
18-second story demo and its four editable scenes.

See [template-kit/README.md](template-kit/README.md) for the template choices,
editable inputs, limits and inspiration sources. `npm run poster` makes an
optional local PNG; it does not upload anything. Exporting an MP4 is optional
through Studio's Render control.

These are draft 16:9 cutaway components, not automatically approved catalog
recipes or changes to the editor's default workflow. They require narrative
timing and new visual review when adapted to actual footage. Shorts need a
separate vertical layout.

The checked-in `public/template-fixtures/review.svg` is an original, labelled
synthetic screenshot for testing the image slot. `qa-*-props.json` are optional
reuse-test inputs. Images in `public/` are served by Studio; put only media
intended for the preview there.

Remotion is a separately licensed dependency. Its license is not replaced by
the repository's MPL-2.0 license; consult its official terms before commercial
or organizational use. This demo makes no paid API calls.
