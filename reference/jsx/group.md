# `<group>`

A container whose children use local coordinates and inherit its transform.
An unsized group derives its box from its children; explicit width and height
fix a logical box for stable pivots, articulated drawings and camera-like moves.

```tsx
<group x={100} y={100}>
  {/* children */}
</group>
```

## Props

A group accepts the common transform, size, pivot and timing props
(see [common props](./elements.md#common-props) and [timing.md](./timing.md)).
Use a rectangle for a painted background. With no explicit size, the group
auto-fits its child bounds. When timing is omitted, it spans its children in
time as well. For predictable articulated parts, set both dimensions and an
explicit local lifetime on every leaf. See [vector drawings and nested
joints](vectors.md) for an example with shoulder and elbow pivots.
