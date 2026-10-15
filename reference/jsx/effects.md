# Native effects and motion presets

Import the library from `@diffusionstudio/jsx`. It uses the editor's own paint,
keyframe and export systems; there is no separate effect renderer, CDN module,
model call, or additional package to install.

## Apply an effect stack

```tsx
import { Effects, filmLook, vignette, grain } from "@diffusionstudio/jsx";

<video src="/Movies/clip.mp4" width={1920} height={1080} start={0} end={8}>
  <Effects effects={[
    filmLook({ warmth: 0.2, grain: 0, vignette: 0 }),
    vignette({ strength: 0.3 }),
    grain({ amount: 0.12, seed: 17 }),
  ]} />
</video>
```

Each factory returns an immutable, validated effect description. `Effects`
compiles the complete list into **one** native shader paint. Effects apply in
the listed order, including spatial sampling: a pixelation or RGB split later
in the list samples the output of the preceding effects. Repeated instances
have independent controls. Empty lists are a passthrough.

Use **one `Effects` child per video or image**. Separate sibling shader paints
do not chain in the underlying engine. The first release processes the source
media paint, not a composited group, text layer or entire scene.

For one common treatment there is also a convenience component:

```tsx
import { FilmLook } from "@diffusionstudio/jsx";

<image src="/Pictures/photo.jpg" width={1920} height={1080}>
  <FilmLook warmth={0.2} grain={0.1} vignette={0.3} strength={0.8} />
</image>
```

`FilmLook` is an alternative to `Effects`, not another sibling in the same
stack. To combine it with other treatments, use the `filmLook()` factory.

## Curated looks

Use `createLook` for a ready-made stack, then adjust its strength:

```tsx
import { Effects, createLook, LOOK_PRESETS } from "@diffusionstudio/jsx";
<image src="/Pictures/photo.jpg" width={1920} height={1080}>
  <Effects effects={createLook("documentary", { strength: 0.8, seed: 17 })} />
</image>
```

Names are `documentary` (restrained warmth/texture), `clean-teaching` (clean
contrast), `archive` (warm/desaturated texture), and `night-tech` (cool balance
with a small RGB offset). `LOOK_PRESETS` exposes each title, purpose and
`usesSeed`. These are authored treatments, not film-stock simulations or
evidence of a recording's age. Strength is finite 0–1, default 1; zero is exact
passthrough. Seed is an integer −65536…65536, default 0, and affects the two
grain looks. Stacks are frozen and contain at most three effects. Use one stack
on each source. See [the comparison example](../../examples/14-curated-looks.tsx).

## Available treatments

| Factory | Main controls | Neutral setting |
| --- | --- | --- |
| `colorGrade()` | exposure in stops, contrast, saturation, warmth, tint | All defaults |
| `filmLook()` | warmth, grain, vignette, overall strength | `strength: 0` |
| `vignette()` | strength, softness, roundness | `strength: 0` |
| `grain()` | amount, seed, speed | `amount: 0` |
| `chromaticAberration()` | red/blue offset in composition pixels | `amount: 0` |
| `pixelate()` | grid size in composition pixels | `size: 1` |
| `scanlines()` | strength, spacing in composition pixels | `strength: 0` |
| `duotone()` | dark/light `#RRGGBB` colors, amount | `amount: 0` |

`EFFECT_CATALOG` contains each treatment's label, description, control labels,
default values, inclusive ranges and units. It is the typed source of truth
for future controls or an effect browser. Numeric input must be finite and
within its documented range. Unknown controls, malformed colors and invalid
values throw clear errors; values are never silently clamped.

Effect descriptions are created by the factories, not by deserializing their
internal structure. To restore saved settings, retain a factory name and its
plain options, validate those options, then call the matching factory again.

## Animated controls and reproducibility

`Effects` and `FilmLook` read reactive props. A control change updates uniforms;
changing values without changing the effect order keeps the compiled WGSL
unchanged. Use Solid signals for interactive controls and `useTicker()` for
playhead-driven animation:

```tsx
import { Effects, vignette, useTicker } from "@diffusionstudio/jsx";

function AnimatedVignette() {
  const { time } = useTicker();
  return <Effects effects={[vignette({ strength: 0.2 + 0.1 * Math.sin(time()) })]} />;
}
```

Grain uses the media element's local playhead, quantized to 30 fps, plus an
explicit seed. It repeats when seeking back to the same local frame. `speed: 0`
freezes the texture. Film look uses a fixed seed for its built-in grain; use
`grain()` separately when you need to choose a seed. Color treatments preserve
premultiplied alpha and operate in decoded RGB space, rather than claiming a
color-managed film-emulation or HDR grading pipeline.

## Motion presets

```tsx
import { motion } from "@diffusionstudio/jsx";

<text width={800} height={100} fontSize={60}
  {...motion.captionPop({ delay: "6f", duration: "12f" })}>
  A little moment.
</text>

<video src="/Movies/clip.mp4" start={0} end={8}
  {...motion.slowZoom({ duration: 8, from: 1, to: 1.08 })} />

<text width={800} height={100} fontSize={60}
  {...motion.combine(
    motion.slideIn({ direction: "left", distance: 80, duration: 0.6 }),
    motion.fadeIn({ duration: 0.6 }),
  )}>Back outside.</text>
```

| Preset | Result |
| --- | --- |
| `motion.popIn()` | Scale and opacity entrance, with native spring easing |
| `motion.captionPop()` | Shorter, subtler pop for captions and short labels |
| `motion.slideIn()` | Render-time translation from an edge, leaving layout position intact |
| `motion.fadeIn()` | Opacity entrance |
| `motion.fadeOut({at})` | Opacity exit beginning at an explicit local time |
| `motion.slowZoom({duration})` | Centered uniform-scale movement |
| `motion.float({duration})` | Whole up/down cycles, ending at the original offset |
| `motion.reveal({duration})` | Entrance, stable reading hold and a faster exit |
| `motion.combine(...)` | Merge presets owning different properties |
| `motion.forClip({sourceIn}, ...)` | Map clip-relative presets onto trimmed media's source clock |

For a complete finite beat, `reveal` avoids combining conflicting opacity
tracks. Duration includes the default 3-frame delay, 12-frame entrance, reading
hold and 8-frame exit. `enterDuration`, `exitDuration`, `delay`, `direction`
(entry edge; `none` means opacity only) and `distance` are configurable. There
must be at least one full hold frame. The last key is `durationFrames − 1`, so
the last visible frame is fully transparent. Apply `motion.forClip` as usual
when a media source is trimmed.

```tsx
<text start={0} end={4} fontSize={72}
  {...motion.reveal({ duration: 4, direction: "left", distance: 32 })}>
  Let the idea land.
</text>
```

The returned objects spread onto native visual elements and become ordinary
editable keyframes. They do not start wall-clock timers. Seconds, frame strings
and clock notation normalize to the editor's integer 30 fps frame timeline.
Presets start at local frame zero. On untrimmed elements the motion travels
with the element. Trimmed media uses the engine's existing source clock, so
map the preset with `forClip` when `sourceIn` is nonzero:

```tsx
const clip = { sourceIn: 10, sourceOut: 18, start: 0 };
<video src="/Movies/clip.mp4" {...clip}
  {...motion.forClip(clip, motion.popIn())} />
```

`forClip` returns only motion properties. It shifts key times by the declared
source in point and preserves the existing engine clock and saved projects;
spread the same clip timing separately as shown. Alternatively, animate an
untrimmed container around the media. Changing a trim in the inspector does
not regenerate authored keyframes automatically; update the preset clock
alongside the trim in code.
Durations must round to at least one frame; delays and exit start times may be
zero. Values hold outside their keyframe range. Keep a clip long enough for its
motion; presets do not change clip duration.

`motion.combine()` rejects repeated properties, even when their time windows
are separate. For a combined fade-in and fade-out, author one explicit opacity
track. Do not mix a preset with another spread or native `animations` writing
the same property unless replacement is intentional. `combine` rejects native
`animations` lists because their property ownership is implicit.

`scale` is now a common animatable authoring/patch property: `1` keeps the
authored size, scaling around its center. The existing engine's native uniform
scale and keyframe track implement it, so it remains editable in the inspector.

## Limits and verification

WebGPU is required for visual effects. The engine logs a warning and renders
the source unshaded if WebGPU is unavailable. Shader compilation is asynchronous
in playback; captures and exports wait for compilation. Native motion presets
do not depend on WebGPU.

The compiler bounds a stack to eight effects, eleven effect uniform buffers
(plus the engine's globals buffer), and eighty-one source samples per pixel.
RGB split triples the conservative sample estimate, so four RGB splits are
permitted and five are rejected, even at neutral settings. Most color
treatments use one source sample. Limits fail before a GPU pipeline is created.

`compileEffects()` exposes the generated `{wgsl, uniforms}` for diagnostics and
hardware verification. Use `npm run test:effects` for factory, composition,
reactivity, timing and motion tests. Typecheck with `npm run check`.

For a local generated-only gallery, start the desktop development editor and
mount `examples/09-native-effects.tsx`. Its source SVG is served locally by the
development server; it fetches no remote media. Mount `examples/10-native-motion.tsx`
in a separate project for the motion gallery. Each project contains one scene
so capture and export remain isolated. This release provides code components and
native keyframes; it does not add a drag-and-drop effects-browser panel.
