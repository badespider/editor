# Editable vector drawings and articulated groups

Use native `Path` for drawn contours, line illustrations and independently
editable diagram parts. Use fixed-size nested `Group` nodes for joints and
object motion. [Illustrated exchange](illustrated-exchange.md) supplies reusable
people, banknotes, parcels and a complete exchange action.

```tsx
import { Group, Path } from "@diffusionstudio/jsx";

<Group name="Shoulder" x={200} y={200} width={160} height={160}
  anchorX={0} anchorY={0} start={0} end={4}
  rotation={[{time: 0, value: -20}, {time: 2, value: 20, easing: "easeInOut"}]}>
  <Path name="Upper arm" width={160} height={160} start={0} end={4}
    fillEnabled={false} strokeColor="#363B32" strokeWidth={3}
    strokeCap="round" strokeJoin="round"
    commands={[{op: "M", x: 0, y: 0}, {op: "Q", cx: 30, cy: 70, x: 80, y: 90}]} />
  <Group name="Elbow" x={80} y={90} width={80} height={70}
    anchorX={0} anchorY={0} start={0} end={4} rotation={-15}>
    <Path name="Forearm" width={80} height={70} start={0} end={4}
      fillEnabled={false} strokeColor="#363B32" strokeWidth={3} strokeCap="round"
      commands={[{op: "M", x: 0, y: 0}, {op: "C", c1x: 20, c1y: 20, c2x: 50, c2y: 10, x: 75, y: 0}]} />
  </Group>
</Group>
```

Commands are plain local-pixel data. Each subpath starts with `M`. `L` adds a
line, `Q` a quadratic curve, `C` a cubic curve and `Z` closes the current subpath.
Native authoring accepts at most 1,024 commands per path with finite coordinates
within ±1,000,000; the automatic learner uses a smaller bounded subset described
in [motion learning](../motion-learning.md). Markup and executable expressions
are not command data.

`fill` sets the normal native solid paint; `fillEnabled={false}` leaves only
outlines. `strokeColor`, `strokeWidth`, `strokeCap` (`butt|round|square`) and
`strokeJoin` (`miter|round|bevel`) configure a native stroke. Zero width hides it.
Keep the path's logical box large enough for its control points and stroke.
Width and height define this box; scale the node/group or transform the command
coordinates when the drawing itself needs resizing.

A `Group` with explicit width/height has a fixed logical box, which keeps pivots
stable while limbs or children move. An unsized group retains automatic child
bounds. Positions are relative to the immediate parent. `anchorX` and `anchorY`
are normalized 0..1 pivots, defaulting to .5/.5; 0/0 rotates at the box's upper
left. The existing Anchor inspector edits these values. Child timing is local to
its parent; give each leaf an explicit lifetime and convert clocks once.

Select a native path to edit its command JSON, fill and outline in the inspector.
The same properties work through `node patch` and participate in undo and saved
project data. Command editing currently uses numeric JSON controls; interactive
Bezier handles are a later drawing-tool addition. Verify overlapping artwork,
joint poses, direct/reverse seeks and save/reload in the actual native export.
