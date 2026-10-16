/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { addComponent, removeComponent, hasComponent, query, Not, Or } from "bitecs";
import { ChildOf } from "../components";
import * as utils from "./utils";
import { getParentEntity } from "./base";
import { setComponent } from "./events";
import { assert } from "@/utils";
import { getEntityTree } from "./query";
import { sortByItemIndex } from "../utils/sort";

import type { EngineWorld } from "./world";

export type ReorderTarget = 'front' | 'back' | number;

export function appendChild(world: EngineWorld, eid: number, pid: number): void {
  const parentEid = getParentEntity(world, eid);
  assert(parentEid === null, "Entity already has a parent");
  assert(pid !== eid, "Cannot parent entity into itself");
  assert(!getEntityTree(world, eid).includes(pid), "Cannot parent entity into its own subtree");

  world.history.transaction('Append child', () => {
    // Query order is an ECS implementation detail and changes after restore.
    // Give every fresh child (including paints/strokes) a persisted stacking
    // position before attaching. Explicit positions, such as a media paint's
    // negative background index, must survive deserialize and reparenting.
    if (!hasComponent(world, eid, world.components.ItemIndex)) {
      const siblings = query(world, [ChildOf(pid), Not(world.components.Deleted)]);
      const next = siblings.length === 0 ? 0 : Math.max(...siblings.map(child => world.components.ItemIndex[child] ?? 0)) + 1;
      setComponent(world, eid, world.components.ItemIndex, next);
    }
    world.history.push({
      label: `appending child ${eid} to parent ${pid}`,
      execute: () => appendChildComponent(world, eid, pid),
      reverse: () => removeChildComponent(world, eid, pid),
    });
  });
}

export function removeChild(world: EngineWorld, eid: number, pid: number): void {
  const parentEid = getParentEntity(world, eid);
  assert(parentEid === pid, "Entity is not a child of the specified parent");

  world.history.push({
    label: `removing child ${eid} from parent ${pid}`,
    execute: () => removeChildComponent(world, eid, pid),
    reverse: () => appendChildComponent(world, eid, pid),
  });
}

function appendChildComponent(world: EngineWorld, eid: number, pid: number): void {
  addComponent(world, eid, ChildOf(pid));
  utils.rebuildCaches(world, eid, pid);
  utils.propagateSize(world, eid);
  utils.resolveConstraintOffsets(world, eid);
  utils.disconnectAudioBus(world, eid);
  utils.reactToChildAttached(world, eid);
  utils.persistEntity(world, eid);
  utils.syncInteractiveState(world);
  world.rebuildTimelineIndex();
}

function removeChildComponent(world: EngineWorld, eid: number, pid: number): void {
  removeComponent(world, eid, ChildOf(pid));
  utils.rebuildCaches(world, eid, pid);
  utils.disconnectAudioBus(world, eid);
  utils.persistEntity(world, eid);
  utils.syncInteractiveState(world);
  world.rebuildTimelineIndex();
}

/**
 * Move a single entity within its geometry siblings by rewriting `ItemIndex`
 * on every sibling. `target` may be:
 * - `'front'` — move to the last index (highest ItemIndex = drawn on top)
 * - `'back'`  — move to index 0 (lowest ItemIndex = drawn first)
 * - a number — move to that absolute index (clamped into range)
 */
export function reorderEntity(world: EngineWorld, eid: number, target: ReorderTarget): void {
  const c = world.components;
  const parent = getParentEntity(world, eid);
  if (parent === null) return;
  const siblings = [...query(world, [ChildOf(parent), Not(c.Deleted), Or(c.Geometry, c.Group, c.AdjustmentLayer)])];
  siblings.sort(sortByItemIndex(world));
  const index = siblings.indexOf(eid);
  if (index === -1) return;
  const newIndex = resolveReorderIndex(target, siblings.length);
  if (index === newIndex) return;
  siblings.splice(newIndex, 0, siblings.splice(index, 1)[0]);
  world.history.transaction('Reorder', () => {
    for (const [idx, sib] of siblings.entries()) {
      setComponent(world, sib, c.ItemIndex, idx);
    }
  });
}

/**
 * Move the current geometry selection within its parent. `target` may be:
 * - `'front'` — move all selected entities to the front
 * - `'back'`  — move all selected entities to the back
 * - a number — insert the selected entities starting at that absolute index
 *
 * Selections that span multiple parents are reordered per-parent; the
 * relative order of the selected entities within each parent is preserved.
 */
export function reorderSelection(world: EngineWorld, target: ReorderTarget): void {
  const c = world.components;
  const selection = [...query(world, [c.Selected, Or(c.Geometry, c.Group, c.AdjustmentLayer)])];
  if (selection.length === 0) return;

  const byParent = new Map<number, Set<number>>();
  for (const eid of selection) {
    const parent = getParentEntity(world, eid);
    if (parent === null) continue;
    if (!byParent.has(parent)) byParent.set(parent, new Set());
    byParent.get(parent)!.add(eid);
  }

  world.history.transaction('Reorder', () => {
    for (const [parent, selected] of byParent) {
      const siblings = [...query(world, [ChildOf(parent), Not(c.Deleted), Or(c.Geometry, c.Group, c.AdjustmentLayer)])];
      siblings.sort(sortByItemIndex(world));
      const selectedOrdered = siblings.filter(eid => selected.has(eid));
      const rest = siblings.filter(eid => !selected.has(eid));

      let newOrder: number[];
      if (target === 'front') {
        newOrder = [...rest, ...selectedOrdered];
      } else if (target === 'back') {
        newOrder = [...selectedOrdered, ...rest];
      } else {
        // Insert the selected block starting at the target index, clamped so
        // the whole block still fits inside the sibling array.
        const maxStart = Math.max(0, rest.length);
        const insertAt = Math.max(0, Math.min(maxStart, Math.trunc(target)));
        newOrder = [...rest.slice(0, insertAt), ...selectedOrdered, ...rest.slice(insertAt)];
      }

      let changed = false;
      for (let i = 0; i < newOrder.length; i++) {
        if (newOrder[i] !== siblings[i]) { changed = true; break; }
      }
      if (!changed) continue;

      for (const [idx, sib] of newOrder.entries()) {
        setComponent(world, sib, c.ItemIndex, idx);
      }
    }
  });
}

function resolveReorderIndex(target: ReorderTarget, length: number): number {
  if (target === 'front') return length - 1;
  if (target === 'back') return 0;
  // Numeric target: clamp into [0, length - 1].
  return Math.max(0, Math.min(length - 1, Math.trunc(target)));
}
