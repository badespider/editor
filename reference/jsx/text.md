# `<text>`

A text node; children become editable glyphs. Because the box defaults to the parent's box, a centered full-frame title is simply `<text textAlign="center" textBaseline="middle">…</text>`.

```tsx
<text fill="#FFFFFF" fontSize={128} fontWeight="bold" textAlign="center" textBaseline="middle">
  Hello World
</text>
```

## Props

All [common props](./elements.md#common-props), plus:

| Prop | Type | Default | Meaning |
| ---- | ---- | ------- | ------- |
| children | `string` (or expressions resolving to strings) | **required** | The text content. |
| `fontFamily` | `string` | editor default | A family available on the machine ([`dapi fonts`](../fonts.md)); see [fonts.md](./fonts.md). |
| `fontSize` | `number` | editor default | Px. |
| `letterSpacing` | `number` | `0` | Extra spacing between characters in CSS pixels. Finite, may be negative; fractional values are preserved. Static. |
| `leading` | `number` | `1` | Non-negative multiplier between successive line origins: `1.2` advances by 1.2 times each line's measured height. Static. |
| `fontWeight` | `number \| "normal" \| "bold"` | `"normal"` | CSS weights `100`-`900`. |
| `fontStyle` | `"normal" \| "italic"` | `"normal"` | |
| `fill` | `string` | white | The glyph color; any CSS color, alpha ignored (use `opacity`). Shorthand for a solid paint child (see [paints.md](./paints.md)); animate it by declaring the paint explicitly. |
| `textAlign` | `"left" \| "center" \| "right"` | `"left"` | Horizontal alignment of glyphs within the box. |
| `textBaseline` | `"top" \| "middle" \| "bottom"` | `"top"` | Vertical alignment within the box. |

The text-only [animation types](./animations.md) (`"appearWord"`, `"appearChar"`, `"scramble"`) animate the glyphs themselves.

For measured typography, set these values explicitly rather than inserting
spaces into the literal text:

```tsx
<text fontFamily="Arial" fontSize={96} fontWeight={700}
  letterSpacing={-1.25} leading={1.1} width={900} height={240}>
  {"2024\n2025"}
</text>
```

`letterSpacing` is a pixel amount, not a percentage of the font size. `leading`
is a multiplier, not an absolute pixel line height; the native renderer measures
each line using its actual font metrics. Zero leading places successive lines
at the same origin, so readable multi-line text normally needs a positive value.
Both properties use the same setters through `dapi node patch`, persist as native
text style values, and remain editable in the inspector. They do not install or
identify a font. Use an available local family and review the actual glyphs and
line breaks at delivery size.

For a measured reveal, `clipToBox={true}` clips the glyphs to the current text box,
including an animated height. An explicitly sized clipped box with zero width or
height stays empty; it does not trigger legacy text autosizing. A short height
alone does not establish clipping.
Static `scaleX`/`scaleY` reshape the rendered glyphs and their local box around the
node center; they multiply the uniform scale animation. Preserve separate
`letterSpacing` values for inter-glyph gaps rather than using tracking to imitate
wider numeral bodies.

Curated editor web-font families, such as `Inter`, use the same documented font
loader as the font picker. A mount waits for the face before completing, so its
first export does not silently measure a fallback while the font is loading.
This may fetch that curated family's configured font file; arbitrary font URLs
are not accepted by `fontFamily`. Installed families outside that catalog use
the local renderer. An unavailable local family can still fall back, so confirm
the actual face and glyph geometry when matching a reference.
Curated family lookup is case-insensitive (`inter` loads the canonical `Inter`
face); the authored native family string remains unchanged.
