# Illustrated exchange: scoped reference study

The user asked for native vector drawings, nested groups and a reusable money
exchange scene based on the supplied *How The Economic Machine Works by Ray
Dalio.mp4*. This implementation uses original simplified contours and authored
tracks. It does not bundle source footage, original drawing assets or narration.

Source SHA-256:
`5468270fe3f51066c9acdfd74c174cde660e6dc026f5ee4d51565682250cfc5c`.
The local evidence pipeline prepared native frames from 319–326 seconds,
supplementing a previous whole-video overview. Direct inspection included 319,
320.5, 321, 322, 323, 325 and 326 seconds. Sampled images establish changed
states; they do not establish the original rig, exact easing or continuous
audiovisual equivalence.

Observed: outlined people with gray clothes, a woman at left and man at right,
curved limbs, stacked green banknotes and a brown parcel. Money and goods change
position in opposing directions. The later samples hold money above the parcel
in the center, with SPENT at left and EARN at right and directional arrows.

The reusable behavior is separately editable people and joints, opposing object
arcs, a center cycle or recipient handoff, and delayed explanatory labels.
[ExchangeDiagram](jsx/illustrated-exchange.md) exposes those choices through
bounded content, timing and appearance props. Independent `IllustratedPerson`,
`MoneyNote` and `GoodsBox` components can be combined for other relationships.
The [illustrated exchange skill](../.agents/skills/editor-illustrated-exchange/SKILL.md)
guides their use. [Vector authoring](jsx/vectors.md) covers native commands,
local coordinates and pivots.

The scene intentionally approximates the drawing style. Paper texture, exact
contours, typography, limb deformation and source narration are outside this
first component. No popularity, educational outcome or universal style
preference is inferred from this reference.

Validation includes strict command and hierarchy checks, varied content and
format tests, native path/paint/stroke persistence with shuffled serialized
records, and actual editor save/reload plus forward/reverse captures. The native
exchange study contains 37 paths, 19 groups and three text nodes, with no picture
media nodes. Actual exports and source/render comparisons remain local project
artifacts with exact hashes and declared inspection coverage; automated tests
alone do not establish visual fidelity.
