# Authored caption presets

`CaptionTrack` renders supplied cues as editable native Text/Rect/Group nodes.
It does not read footage, run speech recognition or verify what anyone said.
Use prepared text and timings checked against the exact audio, or identify a
silent authored example as illustrative. The separate [`Captions`](captions.md)
component supports transcript assets and scene transcription; that asynchronous
contract is unchanged.

```tsx
import { CaptionTrack, captionSafeLayout } from "@diffusionstudio/jsx";

const cues = [
  {start: 0, end: 2, text: "Keep context.", words: [
    {text: "Keep", start: 0, end: .8},
    {text: "context.", start: .8, end: 2},
  ]},
];

// Direct child of the scene. This example has authored, illustrative timing.
<CaptionTrack start={4} duration={3} cues={cues} preset="karaoke"
  canvasWidth={1080} canvasHeight={1920} fontSize={48} />;
```

## Timing and truth

Cue and word `start`/`end` share the **track-local** origin. A word in a cue
starting at 3 seconds also uses times at or after 3 seconds. The track's `start`
places that origin on the parent scene exactly once; it is not a source trim.
For the example above, the first word is active at scene seconds 4–4.8.

Times accept seconds, frame strings or valid clock strings and round to canonical
30fps frames. Cues and words use half-open intervals `[start, end)`; touching
boundaries are allowed, overlap or zero duration after rounding fails. Gaps keep
the full phrase visible without an active word. Cues remain ordered; the helper
does not silently sort, estimate timing or correct wording.

Use `CaptionTrack` as a direct scene child, matching its `start` to the scene
placement. A differently timed or trimmed nested parent requires explicit clock
adaptation. Karaoke derives selection from the scene ticker, supporting direct
and reverse seeks. Every native leaf has an explicit end, including cues later
than the usual 16-second sourceless-leaf default.

## Props and styles

| Prop | Contract |
| --- | --- |
| `cues` | Required complete array of 1–500 `{text, start, end, words?}` cues. |
| `words` in a cue | Optional complete array of 1–128 `{text, start, end}` tokens; required for karaoke. At most 4,096 words per track. |
| `start`, `duration` | Scene placement defaults to 0; duration defaults to the final cue end. An explicit duration must contain every cue. Track end is limited to 108,000 scene frames. |
| `preset` | `clean` (default): full phrase; `boxed`: phrase over a dark card; `karaoke`: full phrase with only the currently timed token highlighted. |
| `canvasWidth`, `canvasHeight` | Defaults 1920×1080. Integer dimensions, width ≥320, height ≥180, each ≤8192 and at most 16 megapixels. |
| `x`, `y`, `width`, `height` | Optional caption-box overrides in canvas pixels. Must remain within the canvas with room for text and padding. |
| `fontSize`, `fontFamily` | Default 56 for portrait, 44 otherwise; local Arial. Font size 8–256px. No font downloads. |
| `maxLines`, `padding` | Defaults 2 lines and 20px. One to three lines; text overflow fails rather than truncating. |
| `textAlign` | `center` (default) or `left`. |
| `textColor`, `highlightColor`, `backgroundColor` | `#RRGGBB`, defaults white, cyan `#54D6C7`, navy `#101C2B`. |
| `backgroundOpacity` | 0–1, default .88. Applies to boxed/karaoke backgrounds. |

Each cue retains literal case, punctuation and LF newlines; text has a 1,024
character per-cue and 65,536 character track budget. Each timed word is one
literal token without whitespace. Tokens must reconstruct the complete cue,
allowing its authored whitespace between tokens. Include punctuation in the
token, or provide a separately timed literal punctuation token. Hidden, omitted,
case-changed or reordered words fail validation. Unknown fields, sparse arrays
and inherited array entries are rejected. Caller arrays are not mutated.

The local renderer measures system-font glyph widths with OffscreenCanvas when
available. Pure CPU validation defaults to conservative 1.1em cells, or accepts
an explicit `CaptionMeasure`. This fallback can reject text that a real font
could fit; shorten it or pass actual measurements. Neither path certifies reading
time or platform-safe positioning. Review the intended font and actual render.

## Reserve caption space

```tsx
const caption = captionSafeLayout({width: 1080, height: 1920, fontSize: 48});
// For a scene-sized EvidenceCallout, this protects the caption region:
<EvidenceCallout target={authoredTarget} label="Relevant detail"
  protectedAreas={[caption.protectedArea]} />;
```

`captionSafeLayout({width, height, fontSize?, maxLines?, position?, padding?,
insets?})` returns `{x, y, width, height, protectedArea, safeArea, insets,
fontSize, maxLines, padding}`. `position` is `bottom` or `top`. Portrait defaults
reserve 7.5% at top, 15% at right, 17% at bottom and 6.7% at left; landscape
defaults are 7%, 5%, 10% and 5%. Override individual inset pixels for the actual
destination. These are starting guides, not current platform specifications or
subject detection. Keep faces, hands, objects, code and source credits clear as
well; a valid box alone cannot establish that context is preserved.

Pure helpers `validateCaptionTrackOptions`, `layoutCaptionText` and
`getCaptionTrackState` expose validation, measured line/word layout and selection.
The state helper takes an **absolute canonical scene frame**, subtracts track
start once and returns `{cueIndex, wordIndex}`; `-1` means inactive. Validate
before passing options to the state helper.

See [the silent three-style example](../../examples/19-caption-presets.tsx).
Render the actual editor composition; inspect cue/word boundaries, gaps, later
cues and the last visible frame at native and useful phone display sizes. Compare
words with the exact source audio when claiming speech accuracy, and record
unavailable listening or uncertain wording through [editor-review](../../.agents/skills/editor-review/SKILL.md).
