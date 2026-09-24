# Examples

Self-contained compositions demonstrating the JSX API (see [reference/jsx](../reference/jsx/README.md)).
Run from the repo root with the editor open (`dapi open`). Each root carries a stable `scene`
identity, so re-mounting an example replaces its scene in place.

| Example | Command | Shows |
| --- | --- | --- |
| [01-basics.tsx](01-basics.tsx) | `dapi mount examples/01-basics.tsx` | the `scene` prop promoting a root, `<sequence>` with a dissolve, `<video>`, `<audio>`, `<image>`, `<text>` titles from data via `<For>` |
| [02-genai.tsx](02-genai.tsx) | `dapi mount examples/02-genai.tsx` | multi-stage generation: `generate.image` refs feeding `generate.video`, TTS voiceover, generated ambience, `<captions>` |
| [03-ticker.tsx](03-ticker.tsx) | `dapi mount examples/03-ticker.tsx` | declarative animation: `useTicker` + `createMemo` derived values driving props |
| [04-html-in-canvas.tsx](04-html-in-canvas.tsx) | `dapi mount examples/04-html-in-canvas.tsx` | `<html>`: an AI prompt box as real DOM, typed out from the playhead |
| [05-anime-timeline.tsx](05-anime-timeline.tsx) | `dapi mount examples/05-anime-timeline.tsx` | anime.js timeline seeked from `useTicker`, driving an ECS node and `<html>` content in lockstep |
| [06-three.tsx](06-three.tsx) | `dapi mount examples/06-three.tsx` | three.js WebGL renderer owning a `<surface>`, glTF model loaded over the network |
| [07-webgpu.tsx](07-webgpu.tsx) | `dapi mount examples/07-webgpu.tsx` | raw WebGPU on a `<surface>`: a triangle whose colors cycle with composition time |
| [08-shader-paint.tsx](08-shader-paint.tsx) | `dapi mount examples/08-shader-paint.tsx` | `<shaderPaint>` post-processing a `<video>`: WGSL chromatic aberration + vignette, uniforms patchable live |
| [09-stacked-caption-animation.tsx](09-stacked-caption-animation.tsx) | `dapi mount examples/09-stacked-caption-animation.tsx` | local `<surface>` captions driven by `useTicker`: staggered lines, emphasis sizes, and overlapping blur/fade exits; generic text, no media required |

Requirements: `02-genai.tsx` consumes generation credits (results are cached per session);
`01-basics.tsx`, `06-three.tsx`, and `08-shader-paint.tsx` fetch remote media.

Typecheck with `tsc -p examples --noEmit` (part of `npm run check`).

## Adapting the caption-animation example

Example 09 preserves the animation approach from a local, frame-analyzed test,
without distributing the reference video, user's footage, transcript, or cache.
It is not an automatically learned skill, a default style, or a general caption
importer. See [frame-by-frame reference analysis](../reference/media/reference-analysis.md)
for inspecting a reference and storing attributed observations before adapting it.

Set `source` to your own caption-free local clip, set `duration`, and author `cards`
using seconds on that clip's timeline. Each card has ordered text/size pairs.
The last line must have time to appear and remain readable; short cards may need
fewer lines or less stagger. Fonts use local availability, with no remote download.
The example is fixed at 1080x1920 with manually chosen chest-level placement;
adjust layout and review it for the actual footage. It does not erase existing
burned-in captions, locate faces, infer word timing, or approve publication.

Render the actual composition, inspect the result, and listen for caption timing.
The transition intentionally overlaps departing and arriving phrases briefly;
reduce that overlap if it hurts readability. Do not claim increased engagement
from a visual test alone. No reference assets or font binaries are bundled.
