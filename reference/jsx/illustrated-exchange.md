# Editable illustrated exchange

`ExchangeDiagram` assembles original simple line-art people, a stack of notes,
and a parcel from native `Path`, `Group` and `Text` nodes. There is no raster,
HTML or Surface artwork inside these components. The payer is left and seller
right. Each person's shoulder and elbow are separate nested groups with fixed
logical boxes and normalized joint anchors. Paths carry native M/L/Q/C/Z command
data and independent fill/stroke styles.

The reusable mechanics are two opposite transfers, articulated gestures and
separately timed labels. The default drawing interprets the inspected money
exchange around 320–325 seconds in the supplied *How The Economic Machine Works*
reference. It uses newly authored contours and keyframes; it is not the source's
hidden vector assets or original rig. Texture, exact limb deformation, source
narration and every source frame are outside this component contract.

The [scoped source study](../illustrated-exchange-study.md) records the inspected
interval, provenance and remaining approximation. Use [native vector
authoring](vectors.md) when changing contours or joint construction.

The [portrait remix](../../examples/23-illustrated-exchange-portrait.tsx) combines
the drawing with an assembled title and concept link. It uses an explicit native
clip wrapper to remove unused outer margins and enlarge essential illustration
parts on a phone. Inspect the whole move when changing that framing.

```tsx
import { ExchangeDiagram } from "@diffusionstudio/jsx";

<ExchangeDiagram key="shop" x={0} y={0} width={1920} height={1080}
  start={0} duration={7} spentLabel="SPENT" earnedLabel="EARNED"
  moneyLabel="$" presentation="cycle" transferStart={0.5} transferDuration={3.5}
  labelDelay={4.1} minHold={1} />
```

| Property | Contract |
| --- | --- |
| `x`, `y`, `width`, `height` | Static authored box; defaults 0, 0, 1000, 600. Width ≥360, height ≥240, maximum 4096 per side and 8 megapixels. The 1000×600 artwork is contained and centered. |
| `start`, `end` or `duration` | Parent-local Time. Defaults start 0/duration 7 seconds. End and duration are mutually exclusive; all time rounds once to 30fps. |
| `spentLabel`, `earnedLabel` | Single-line text, 1–18 characters. Defaults SPENT/EARNED. |
| `moneyLabel`, `goodsLabel` | Single-line text, respectively 1–8 and 1–12 characters. Defaults `$` and no parcel label. Prefer a short currency symbol for a small note. |
| `presentation` | `cycle` (default) holds the note above the parcel between the people, then reveals circular flow arrows and labels. `handoff` ends each object at its recipient. |
| `transferStart`, `transferDuration` | Default .5/3.5 seconds. Travel uses at least four frames. |
| `labelDelay`, `minHold` | Defaults 4.1/1 seconds. Labels begin after the transfer, fade for six frames, then retain the complete authored hold. All phases must fit. |
| `animate` | Defaults true. False removes transform/opacity tracks and keeps labels at their supplied onset. |
| Colors | `outlineColor`, `clothingColor`, `hairColor`, `skinColor`, `moneyColor`, `goodsColor`, `textColor`: strict #RRGGBB. No background is painted. |
| `fontFamily` | Nonempty single-line font name, default Arial. |

`getExchangeDiagramLayout(props)` exposes frozen validated timing, geometry and
literal content without creating a scene. Unknown fields fail before mounting.

## Reuse a part

```tsx
import { Group, IllustratedPerson, MoneyNote, GoodsBox } from "@diffusionstudio/jsx";

<Group name="Custom illustrated explanation" width={1000} height={600}>
  <IllustratedPerson x={100} y={150} width={170} height={265}
    duration={7} appearance="ponytail" facing="right"
    clothingColor="#7896B0" gestureStart={0.5} gestureDuration={1.2} />
  <MoneyNote x={400} y={160} width={80} height={64} duration={7} label="€" />
  <GoodsBox x={550} y={220} width={90} height={81} duration={7} label="BOOK" />
</Group>
```

All parts accept the same box, key/name and lifetime fields. Each path's native
selection box encloses its control-point envelope and stroke; commands are
translated into that local box without flattening the drawing. A person defaults to
270×420 logical coordinates; `appearance` is `short` or `ponytail`, `facing` is
`left` or `right`, gesture start/duration default .5/1.2 seconds and must settle
before its last frame. Its color fields are outline/clothing/hair/skin. Money
defaults 100×78 and goods 100×90; each has `color`, `outlineColor`, `fontFamily`
and optional literal `label`. The parcel's three faces and note stack's three
notes remain separate native paths. In a remix, animate the enclosing group to
move the entire object, and rotate joint groups to pose the person.

## Catalog and bounded mixing

`playbook motion catalog exchange` discovers `exchange-diagram`.
`playbook motion create exchange-diagram --mode template` creates its native template;
the CLI's `--help` lists output and content options. `playbook motion mix` accepts
the same strict content fields inside an instance:

```json
{
  "schemaVersion": 1,
  "format": "landscape",
  "duration": 7,
  "instances": [{
    "key": "shop", "presetId": "exchange-diagram", "start": 0, "end": 7,
    "box": {"x": 80, "y": 160, "width": 1760, "height": 880},
    "content": {"spentLabel": "PAID", "earnedLabel": "RECEIVED", "moneyLabel": "€"}
  }]
}
```

The component is transparent, so create the background before foreground nodes.
For a reference study, retain source/time provenance in the project artifacts.
For general lessons, label authored examples and supply any needed evidence
separately. Render, inspect at delivery size and test saved reload and reverse
seeks before reporting a finished result.
