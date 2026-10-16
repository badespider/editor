/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { hasComponent, query } from "bitecs";
import { syncKeyframeTrack } from "./keyframe";
import { removeComponent, setComponent } from "./events";
import { getParentEntity } from "./base";
import { ChildOf, ConstraintType } from "../components";

import type { EngineWorld } from "./world";

type ResizeParams = { width?: number; height?: number };

/**
 * Resize an entity. Enforces aspect ratio, writes the final Size, propagates
 * Computed size down the subtree, reapplies sibling constraints, and syncs
 * the width/height keyframe tracks. Explicitly sizing a spatial Group fixes its
 * logical box; a Sequence still mirrors its parent and never owns a Size.
 */
export function resizeEntity(world: EngineWorld, eid: number, params: ResizeParams): void {
  const c = world.components;

  if (hasComponent(world, eid, c.Sequential)) {
    removeComponent(world, eid, c.Size);
    return;
  }

  world.history.transaction('Resize', () => {
    // Enforce aspect ratio
    const arWidth = c.KeepAspectRatio.width[eid] ?? 0;
    const arHeight = c.KeepAspectRatio.height[eid] ?? 0;

    if (hasComponent(world, eid, c.KeepAspectRatio) && arWidth > 0 && arHeight > 0) {
      const ratio = arWidth / arHeight;

      if (params.width !== undefined && params.height === undefined) {
        params.height = Math.round(params.width / ratio);
      } else if (params.height !== undefined && params.width === undefined) {
        params.width = Math.round(params.height * ratio);
      } else if (params.width !== undefined && params.height !== undefined) {
        params.height = Math.round(params.width / ratio);
      }
    }

    if (typeof params.width === 'number') {
      params.width = Math.round(params.width);
    }
    if (typeof params.height === 'number') {
      params.height = Math.round(params.height);
    }

    setComponent(world, eid, c.Size, params);
    propagateSize(world, eid);
    resolveConstraintOffsets(world, eid);

    if (params.width !== undefined) {
      syncKeyframeTrack(world, eid, "width");
    }
    if (params.height !== undefined) {
      syncKeyframeTrack(world, eid, "height");
    }
  });
}

export function propagateSize(world: EngineWorld, eid: number) {
  const c = world.components;
  if (!hasComponent(world, eid, c.Size)) return;

  c.Computed.width[eid] = Math.round(c.Size.width[eid]);
  c.Computed.height[eid] = Math.round(c.Size.height[eid]);

  for (const child of query(world, [ChildOf(eid), c.Size])) {
    propagateSize(world, child);
  }
}

export function resolveConstraintOffsets(world: EngineWorld, eid: number): void {
  const c = world.components;

  let dimsEid: number | null = eid;
    // Sequences aren't spatial constructs — they mirror their parent's frame.
  while (dimsEid !== null && hasComponent(world, dimsEid, c.Sequential)) {
    dimsEid = getParentEntity(world, dimsEid);
  }
  if (dimsEid === null) return;

  resolveConstraintOffsetsAgainst(world, eid, dimsEid);
}

function resolveConstraintOffsetsAgainst(world: EngineWorld, eid: number, dimsEid: number): void {
  const c = world.components;

  // Sequential children are transparent: resolve their children against the
  // same spatial parent.
  for (const childEid of query(world, [ChildOf(eid), c.Sequential])) {
    resolveConstraintOffsetsAgainst(world, childEid, dimsEid);
  }

  for (const childEid of query(world, [ChildOf(eid), c.Constraint])) {
    if (hasComponent(world, childEid, c.Sequential)) continue;

    const curParentW = c.Computed.width[dimsEid];
    const curParentH = c.Computed.height[dimsEid];

    const prevParentW = c.ConstraintCache.parentWidth[childEid];
    const prevParentH = c.ConstraintCache.parentHeight[childEid];

    const horizontalConstraint = c.Constraint.horizontal[childEid] ?? 0;
    const verticalConstraint = c.Constraint.vertical[childEid] ?? 0;

    const curChildW = c.Computed.width[childEid];
    const curChildH = c.Computed.height[childEid];

    const prevChildW = c.ConstraintCache.childWidth[childEid];
    const prevChildH = c.ConstraintCache.childHeight[childEid];

    // Update caches
    c.ConstraintCache.parentWidth[childEid] = curParentW;
    c.ConstraintCache.parentHeight[childEid] = curParentH;
    c.ConstraintCache.childWidth[childEid] = curChildW;
    c.ConstraintCache.childHeight[childEid] = curChildH;

    // First time seeing this child (e.g. constraint just assigned): seed the cache
    // without adjusting position — diffing against `undefined` would yield NaN.
    if (prevParentW === undefined || prevParentH === undefined) {
      resolveConstraintOffsets(world, childEid);
      continue;
    }

    // No change
    if (prevParentW === curParentW && prevParentH === curParentH) continue;

    const dpW = curParentW - prevParentW;
    const dpH = curParentH - prevParentH;
    const dcW = curChildW - (prevChildW ?? curChildW);
    const dcH = curChildH - (prevChildH ?? curChildH);
    const positionX = c.Computed.positionX[childEid];
    const positionY = c.Computed.positionY[childEid];

    // Resizing constraints (STRETCH/SCALE) record their new dimension here
    // rather than writing it straight away, so a locked aspect ratio can couple
    // the two axes before the Size is committed.
    let newChildW: number | undefined;
    let newChildH: number | undefined;

    if (horizontalConstraint === ConstraintType.MAX) {
      setComponent(world, childEid, c.Position, { x: positionX + dpW - dcW });
    } else if (horizontalConstraint === ConstraintType.CENTER) {
      setComponent(world, childEid, c.Position, { x: positionX + dpW / 2 - dcW / 2 });
    } else if (horizontalConstraint === ConstraintType.STRETCH) {
      // Pin both left and right edges: hold the left edge in place and grow the
      // child by the parent's width delta so the right margin stays constant.
      newChildW = curChildW + dpW;
    } else if (horizontalConstraint === ConstraintType.SCALE && prevParentW !== 0) {
      // Scale offset and width by the parent's horizontal ratio so the child
      // keeps its relative position and proportion.
      const scale = curParentW / prevParentW;
      newChildW = Math.round(curChildW * scale);
      setComponent(world, childEid, c.Position, { x: positionX * scale });
    }

    if (verticalConstraint === ConstraintType.MAX) {
      setComponent(world, childEid, c.Position, { y: positionY + dpH - dcH });
    } else if (verticalConstraint === ConstraintType.CENTER) {
      setComponent(world, childEid, c.Position, { y: positionY + dpH / 2 - dcH / 2 });
    } else if (verticalConstraint === ConstraintType.STRETCH) {
      // Pin both top and bottom edges: hold the top edge in place and grow the
      // child by the parent's height delta so the bottom margin stays constant.
      newChildH = curChildH + dpH;
    } else if (verticalConstraint === ConstraintType.SCALE && prevParentH !== 0) {
      // Scale offset and height by the parent's vertical ratio so the child
      // keeps its relative position and proportion.
      const scale = curParentH / prevParentH;
      newChildH = Math.round(curChildH * scale);
      setComponent(world, childEid, c.Position, { y: positionY * scale });
    }

    // When the child's aspect ratio is locked, drive the other dimension from
    // whichever axis resized so the proportion is preserved. Width wins when
    // both axes resize, mirroring resizeEntity's precedence.
    const arWidth = c.KeepAspectRatio.width[childEid] ?? 0;
    const arHeight = c.KeepAspectRatio.height[childEid] ?? 0;
    if (
      hasComponent(world, childEid, c.KeepAspectRatio) &&
      arWidth > 0 && arHeight > 0 &&
      (newChildW !== undefined || newChildH !== undefined)
    ) {
      const ratio = arWidth / arHeight;
      if (newChildW !== undefined) {
        newChildH = Math.round(newChildW / ratio);
      } else if (newChildH !== undefined) {
        newChildW = Math.round(newChildH * ratio);
      }
    }

    if (newChildW !== undefined) {
      setComponent(world, childEid, c.Size, { width: newChildW });
      c.Computed.width[childEid] = newChildW;
      c.ConstraintCache.childWidth[childEid] = newChildW;
    }
    if (newChildH !== undefined) {
      setComponent(world, childEid, c.Size, { height: newChildH });
      c.Computed.height[childEid] = newChildH;
      c.ConstraintCache.childHeight[childEid] = newChildH;
    }

    resolveConstraintOffsets(world, childEid);
  }
}
