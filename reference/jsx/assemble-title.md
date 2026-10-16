# AssembleTitle

`AssembleTitle` resolves individually editable native letters from deterministic
offsets, scale, opacity and the native blur animation into a fixed headline.
Its separately editable subtitle appears after the title settles. It generalizes
the letter assembly observed at source 105.5–107.1 s; exact typeface, letter order,
background flashes and source wording are separate from this component.

```tsx
<AssembleTitle text="IDEAS INTO ACTION" subtitle="An original editable example"
  x={96} y={100} width={1728} height={380} start={0} duration={6}
  revealDuration={1.2} glyphDuration={.4} minHold={3}
  color="#19272E" subtitleColor="#47606A" />
```

Supply one line of 1–48 printable ASCII characters and an optional subtitle of
up to 96. This per-letter component does not shape joined scripts or wrap prose;
use ordinary native Text or KineticText for those tasks. Font metrics are measured
with native OffscreenCanvas when available, with a conservative headless fallback.
Load the intended font before mounting; this component does not await an
asynchronous font download. Remount after font loading if initial layout used a
fallback face, then inspect the actual render. The demo uses local Arial.

`revealDuration` (default 1.2 s) includes the last glyph's assembly. `glyphDuration`
(default 0.4 s) must fit that interval; glyph onsets spread deterministically through
the remaining time. `subtitleDelay` (default 3f) is measured from the title's settled
frame; its entrance lasts 6f. `minHold` (default 2 s) protects the complete result.
These must fit `duration` (default 6 s) or the alternative absolute parent `end`.
All clocks normalize once to 30 fps. Start is applied once at the transparent root;
native children and tracks use local clocks. Direct and reverse seeks reuse nodes.

The default box is 1600×400. Width must be 160–4096, height 120–4096, total area
at most 8 megapixels. `fontSize` defaults to a conservative fit, in 8–256 px;
`fontWeight` is 100–900 in hundreds. Colors are #RRGGBB. The fixed root clips all ink.
`scatter` in 0..1 controls offsets; `blur={false}` retains the other native motion.
`animate={false}` presents the complete title immediately and retains the authored
subtitle onset as a separate stage. Optional key/name identify repeated instances.

`getAssembleTitleLayout` returns immutable glyph boxes, onsets, subtitle timing,
settled-frame and hold budgets. Validation checks fit; inspect the actual title
at early/mid/settled/end frames and at phone size for portrait output. Keep the
settled headline as the reading interval, rather than treating scattered letters
as already readable. No reference images, fonts, media or model calls are bundled.

Agent guidance: [editor-title-assembly](../../.agents/skills/editor-title-assembly/SKILL.md).

The native component uses `subtitle?: string`. In catalog and mix JSON, settings
inherit the selected preset's example values; use `"subtitle": null` to create a
title-only instance explicitly. The trusted adapter removes that field before
calling the native component. An empty subtitle string is rejected.
