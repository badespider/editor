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
| [09-native-effects.tsx](09-native-effects.tsx) | `dapi mount examples/09-native-effects.tsx` | native effects gallery, using a local illustrated source served by the desktop dev server |
| [10-native-motion.tsx](10-native-motion.tsx) | `dapi mount examples/10-native-motion.tsx` | native motion gallery with editable keyframes |
| [11-documentary-story.tsx](11-documentary-story.tsx) | `dapi mount examples/11-documentary-story.tsx` | an original, illustrative question/map/evidence/timeline/reveal sequence with native documentary graphics |
| [12-education-kit.tsx](12-education-kit.tsx) | `dapi mount examples/12-education-kit.tsx` | editable math, worked steps, plots, force vectors, network flows, literal code and an authored quiz reveal |
| [13-education-portrait.tsx](13-education-portrait.tsx) | `dapi mount examples/13-education-portrait.tsx` | 9:16 lesson and quiz cards with explicit mobile layout |
| [14-curated-looks.tsx](14-curated-looks.tsx) | `dapi mount examples/14-curated-looks.tsx` | large original/processed comparisons of four curated native look presets |
| [15-editor-guided-lesson.tsx](15-editor-guided-lesson.tsx) | `dapi mount examples/15-editor-guided-lesson.tsx` | one force lesson preserving prerequisite, calculation, units, staged code and supplied proof |
| [16-editor-looks.tsx](16-editor-looks.tsx) | `dapi mount examples/16-editor-looks.tsx` | four looks compared on the same authored code/diagram fixture at delivery size |
| [20-motion-recipes.tsx](20-motion-recipes.tsx) | `dapi mount examples/20-motion-recipes.tsx` | two independently timed reusable counters combined with a native background, chart and source label; portrait export available |

Requirements: `02-genai.tsx` consumes generation credits (results are cached per session);
`01-basics.tsx`, `06-three.tsx`, and `08-shader-paint.tsx` fetch remote media.

Mount each native-library gallery into a separate project for isolated preview/export.
Their shared layout lives in `native-library-scenes.tsx`.

Typecheck with `tsc -p examples --noEmit` (part of `npm run check`).
