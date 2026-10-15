# Motion sources and integration scope

External references are research inputs. They do not install skills, change the
native renderer or make third-party media ready to redistribute. Keep proposed
sources separate from implemented, reviewed native catalog entries.

## The linked post

The supplied [HyperFrames post](https://x.com/hyperframes_/status/2110072407784616067)
links to the October 13, 2026 article
[“Prompting in HyperFrames Studio”](https://x.com/i/article/2110068006676275200).
The recovered article describes short, purpose-specific motion examples called
Moments: searchable references, explicit reuse intent, selecting one motion
element and numbered revision notes. It does **not** provide a package or
repository list in its text.

Direct X retrieval failed during this research. The article body was recovered
from the [public FxTwitter response](https://api.fxtwitter.com/hyperframes_/status/2110072407784616067).
[X's oEmbed response](https://publish.twitter.com/oembed?url=https%3A%2F%2Fx.com%2Fhyperframes_%2Fstatus%2F2110072407784616067)
independently confirmed the status, author, date and linked short URL; it did not
independently expose the article body. Embedded screenshots and motion examples
were not visually reviewed in this research pass. Claims about launch-video
performance remain the article author's claims, not measured editor results.

Useful native adaptation: index original examples by beat purpose and physical
motion; keep editable timing, parameters, source identity, reuse intent and actual
render-review evidence. This is a design proposal, not permission to copy the
article's reference footage, branding or example assets.

## Related repository, separately verified

The [HyperFrames repository](https://github.com/heygen-com/hyperframes) was reviewed
at commit [`49c49504a44e0352f6877611f5384e7aedcc4e92`](https://github.com/heygen-com/hyperframes/tree/49c49504a44e0352f6877611f5384e7aedcc4e92).
These findings concern that repository, **not a list from the post**.

- Its [root LICENSE](https://github.com/heygen-com/hyperframes/blob/49c49504a44e0352f6877611f5384e7aedcc4e92/LICENSE)
  is Apache-2.0. No root `NOTICE` file was present in the complete pinned tree.
- Its [CREDITS](https://github.com/heygen-com/hyperframes/blob/49c49504a44e0352f6877611f5384e7aedcc4e92/CREDITS.md)
  distinguish third-party software and assets: MIT Three.js, three-mesh-bvh and
  opentype.js; ISC d3-delaunay; Boost Clipper; OFL fonts; and a CC0 HDR image.
- GSAP is separately covered by its
  [Standard License](https://gsap.com/standard-license), which the repository
  explicitly identifies as non-OSI. It is not treated as an Apache dependency.
- The credits also list several textures whose origins remain unconfirmed.
  Those assets are outside the eligible metadata candidate below.

HTML composition blocks, GSAP timelines and WebGL effects are not native
Solid/Canvas2D/WGSL components. Any adapter or port needs an explicit benefit,
dependency/asset review and seek/export testing. No upstream renderer or catalog
assets were integrated by this research.

## One bounded metadata candidate

[packages/core/src/registry/types.ts](https://github.com/heygen-com/hyperframes/blob/49c49504a44e0352f6877611f5384e7aedcc4e92/packages/core/src/registry/types.ts)
is 9,463 bytes of catalog types, constants, guards and a deterministic tag-to-
category helper. The inspected file has no imports, GSAP calls, asset loads or
network access. Its metadata distinguishes identity, tags, per-item license,
parameters, previews and distribution file types.

It is **eligible for evaluation, not integrated**. A native catalog can reuse
the metadata design without importing HyperFrames-specific file/install types.
Copying the classifier has not shown a benefit over the editor's own typed
catalog, so no source code was copied.

| Pinned file | SHA-256 |
| --- | --- |
| `packages/core/src/registry/types.ts` | `35e53ca28acd370fd3e5fc84e027266fb46ef68dd88d3d2d5b90d4084224d141` |
| `LICENSE` | `4259155fb06f127687ee7b0a8a3682d45132db0f2da26cbc0b7a2d1e796436b8` |
| `CREDITS.md` | `a484f3ddebdb8cdde6b3fb4e597e57d953fd5b83bf872701ad9d7c0c5761a39e` |

The [strict research candidate](../integrations/motion-candidates/hyperframes-moments.json)
records this scope with empty test/export/review evidence. Its local check is
`valid: true`, `readiness: "needs_evidence"`, `safeToActivate: false`; those fields
do not make it an integrated native Moment.

An external candidate record must retain the exact source/ref, license scope,
excluded assets, native compatibility limits and pending checks. Passing its
schema is not integration approval or proof of better motion. Follow the
editor's [reference and review contract](playbook.md#reference-learning) and
[purpose-led graphics guidance](jsx/editor-guidance.md).
