# Documentary and storytelling components

Import these components from `@diffusionstudio/jsx`. `ChapterCard`, `LowerThird`, `SourceCard`, `QuoteCard`, `Timeline`, and `EvidenceCallout` compose native groups, rectangles, and editable text. `MapRoute` draws geographic data into a native canvas surface; its labels are edited through its props rather than as separate text entities.

## Example

This original example introduces an **illustrative itinerary**. It does not assert that a journey took place. The map is a direct child of its scene, so its `start` matches the scene clock.

```tsx
/* @jsxImportSource @diffusionstudio/jsx */
import {
  ChapterCard, LowerThird, MapRoute, DOCUMENTARY_THEME,
} from "@diffusionstudio/jsx";

export default function RouteStory() {
  return <rect scene="route-story" width={1920} height={1080}
    end={12} fill={DOCUMENTARY_THEME.background}>
    <ChapterCard start={0} duration={3} chapter="01 / PLACE"
      title="Connect the places"
      subtitle="An illustrative route through three cities." />
    <MapRoute x={96} y={96} width={1728} height={888}
      start={3} duration={6} revealDuration={4}
      title="Illustrative itinerary"
      bounds={{ west: -6, east: 12, south: 40, north: 52 }}
      points={[
        { longitude: 2.3522, latitude: 48.8566, label: "Paris" },
        { longitude: 4.8357, latitude: 45.7640, label: "Lyon" },
        { longitude: 5.3698, latitude: 43.2965, label: "Marseille" },
      ]}
      camera={{ fromZoom: 1, toZoom: 1.03 }} />
    <LowerThird start={9} duration={3} name="ILLUSTRATIVE ROUTE"
      role="Replace with verified context."
      theme={{ accent: "#D95B3F" }} />
  </rect>;
}
```

See [the complete example](../../examples/11-documentary-story.tsx) for all seven components in a 24-second **fictional mail-route case**. Its invented dispatch, route, timeline and conclusion tell the same story; real city coordinates do not make the fictional mail journey a historical claim.

## Shared card props

The six native components accept `DocumentaryProps`:

| Prop | Contract |
| --- | --- |
| `x`, `y`, `width`, `height` | Composition pixels; positive width/height. Defaults below target a 1920×1080 scene. Override for other formats. |
| `start` | Parent-local placement, default `0`. |
| `duration` | Visible duration, default `6` seconds. Does not estimate reading time. |
| `end` | Absolute end on the parent's timeline; use **either** `end` **or** `duration`. |
| `animate` | Default `true`: fade and a 24px entrance slide, up to 12 canonical frames. `EvidenceCallout` fades **in place**, keeping the authored target pinned. `false` is static. `ChapterCard` also grows its underline. There is no automatic exit animation. |
| `fontSize` | Base typography size, default `32`; individual labels scale from it. |
| `theme` | Partial override of `DOCUMENTARY_THEME`; defaults are not mutated. |

Times accept the existing [time formats](./timing.md): numeric seconds, frame strings such as `"90f"`, or clock strings. They round to canonical 30fps frames; a card must last at least one frame. A one-frame card stays visible without an entrance. Children use the card's local clock.

`DOCUMENTARY_THEME` contains `background: "#101C2B"`, `surface: "#1C2D42"`, `text: "#F6F0E4"`, `muted: "#C4C7CC"`, `accent: "#F47B39"`, and `fontFamily: "Arial"`. Colors must be `#RRGGBB`; the font must be installed on the rendering machine. Unknown theme fields fail validation. `MapRoute` has its own fixed map palette and does not accept these shared card props.

## Component content

| Component | Required content | Optional content | Default box `(x, y, width, height)` |
| --- | --- | --- | --- |
| `ChapterCard` | `title` | `chapter`, `subtitle` | `(96, 96, 1728, 888)` |
| `LowerThird` | `name` | `role`, `source` | `(96, 794, 1120, 190)` |
| `SourceCard` | `title`, `source` | `detail`, `date`, `url` | `(1104, 96, 720, 520)` |
| `QuoteCard` | `quote`, `attribution` | `source` | `(192, 224, 1536, 632)` |
| `Timeline` | `events` | `title`, `activeIndex` | `(96, 230, 1728, 620)` |
| `EvidenceCallout` | `target`, `label` | `detail`, `source`, `labelPosition`, `protectedAreas` | `(0, 0, 1920, 1080)` |

All provenance, dates, URLs, quotations, and labels are caller-supplied text. Components do not retrieve sources, verify claims, detect subjects, or invent missing attribution. `SourceCard.url` is displayed text; it is not fetched.

`Timeline.events` is a complete array of 2–6 `{date, title, detail?}` objects. Events retain the supplied order; date strings are not parsed or sorted. `activeIndex` is a zero-based index, default `0`; a reactive getter can change the highlighted event. It does not advance automatically.

### Evidence label placement

`target: {x, y, width, height}` uses coordinates **local to the callout's box** and must fit inside it. The callout draws an outline around that authored rectangle; it does not magnify or analyze the picture. Its entrance changes opacity only, so the frame stays aligned with the supplied pixels from its first visible frame. This does not track a moving or separately animated source: the caller must supply matching target coordinates and timing.

`labelPosition` accepts `"auto"` (default), `"above"`, `"below"`, `"left"`, or `"right"`. Auto tries **above → below → right → left**. Each candidate must fit without overlapping the target or any `protectedAreas`; an explicit side fails on collision rather than silently moving elsewhere. If no candidate works, enlarge the available box, revise the authored layout or choose another shot. The label panel is up to 680×240px with a 16px gap; side placements center vertically and clamp to the component bounds.

`protectedAreas` is an optional readonly array of at most 64 complete `{x, y, width, height}` rectangles in the **same local coordinate system**. Every rectangle must have finite coordinates, positive size and fit the callout box; missing/inherited array entries are rejected. Use them for source identity, dates, URLs, surrounding command output or another essential action. They reserve space from the **label panel**; they do not crop, hide, detect or reposition the underlying content. Caller input is not mutated. The target outline can still mark a rectangle within protected context. Boundary contact is allowed, so author a margin if needed.

```tsx
<EvidenceCallout start={2} duration={4}
  target={{ x: 160, y: 606, width: 1000, height: 170 }}
  protectedAreas={[
    { x: 170, y: 275, width: 980, height: 320 }, // Source title and identity.
    { x: 170, y: 780, width: 980, height: 130 }, // Provenance footer.
  ]}
  labelPosition="right" label="Authored annotation"
  detail="State what matters."
  source="Source record ID" />
```

Keep a wider context view long enough to establish the source before the annotation appears. Inspect the **actual editor render** at the first visible entrance frame, during the fade and after settling, plus any source/target movement. Check target alignment and essential text at the delivery size; successful placement validation does not establish readability, source truth or sufficient reading time.

### Text limits

Native card text wraps conservatively using 1.1em character cells, including splitting long words and URLs. It is not measured with browser font metrics. Text is never silently discarded: exceeding a field's line budget throws a named error. Shorten the text, enlarge the box, or reduce `fontSize`, then review the actual render. Required text must be nonempty. `wrapDocumentaryText(value, {width, fontSize, maxLines, label?})` exposes the same wrapping and validation for custom compositions.

## `MapRoute`

| Prop | Contract |
| --- | --- |
| `points` | Required array of 2–32 distinct adjacent `{longitude, latitude, label?}` stops. Longitude −180…180, latitude −90…90; every stop must lie inside `bounds`. |
| `width`, `height` | Required integer canvas size: width 320…4096, height 180…4096, at most 8,388,608 pixels. |
| `x`, `y` | Placement in composition pixels, default `0`. |
| `start`, `duration` | Scene-local start `0`; visible duration `6` seconds by default. Each is limited to 108,000 canonical 30fps frames. |
| `revealDuration` | Defaults to 75% of duration; positive and no longer than duration. The complete route holds for the remainder. |
| `bounds` | `{west, east, south, north}`; defaults to `WORLD_MAP_BOUNDS`. Require west < east, south < north, and spans of at least 0.01°. |
| `camera` | `{fromZoom?, toZoom?}`, each 1…4, default `1`. Smooth centered zoom across the total duration; zoom may clip edge stops. |
| `title`, `credits` | Single lines, at most 100 / 140 characters. Pin labels allow 80. Titles may ellipsize; complete labels/credits must fit or fail clearly before drawing. |
| `land` | Optional real land polygons: an array of polygons, each containing an exterior ring and optional hole rings, using `[longitude, latitude]` pairs. Maximum 1,024 polygons / 20,000 vertices. Supply source attribution with `credits`. |

Use `MapRoute` as a **direct scene child**. It samples `useTicker()` and computes `floor(sceneTime × 30) − startFrame`; it does not infer a nested group's, sequence's, or trimmed parent's clock. Do not nest it under a differently timed parent without explicitly adapting that clock. Seeking and export use playhead time rather than wall-clock timers.

The map uses an **equirectangular projection** and projected straight segments between stops. Great-circle distances weight each leg's reveal duration; the displayed path is not a geodesic route or a navigation result. Regional bounds crop the same geographic geometry. Dateline-crossing bounds and adjacent longitude jumps over 180° are unsupported; split them into separate maps. Labels use deterministic collision placement and leader lines when shifted. Dense labels that cannot fit fail with an actionable error; use a wider view or shorter names. Frames before/after the map's lifetime reuse held pixels while camera motion continues through its declared duration.

The bundled land is real [Natural Earth 1:110m land](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson), [public domain](https://www.naturalearthdata.com/about/terms-of-use/), with exterior rings retained and coordinates rounded to 0.001°. Lakes are not cut out. The visible “Made with Natural Earth” credit remains when bundled geometry is used; `DOCUMENTARY_LAND_SOURCE` records its source URL, license, derivation, and SHA-256. `NATURAL_EARTH_LAND` exposes the local exterior rings. No remote tiles, geocoding, routing services, API keys, or runtime downloads are used.

For custom drawing, `validateMapRouteOptions`, `getMapRouteFrame`, `drawMapRouteFrame`, `projectMapPoint`, and `mapPointDistance` expose the validated deterministic layout, frame state, drawing, projection, and distance helpers. Validate before using the drawing/frame helpers; they consume the snapshotted `ValidatedMapRouteOptions` result.
