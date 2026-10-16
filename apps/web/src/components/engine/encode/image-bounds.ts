/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { hasComponent, Not, Or, query } from "bitecs";
import { ChildOf } from "../components";
import type { EngineWorld } from "../api/world";
import type { AABB } from "../math";

/** Union visible native boxes without including descendants clipped by their owner. */
export function measureImageBounds(world: EngineWorld, eid: number, bounds: AABB): void {
  const c = world.components;
  if (hasComponent(world, eid, c.Hidden) || hasComponent(world, eid, c.IsMask) || c.Computed.visibility[eid] === 0) return;
  bounds.minX = Math.min(bounds.minX, c.WorldBounds.minX[eid]);
  bounds.minY = Math.min(bounds.minY, c.WorldBounds.minY[eid]);
  bounds.maxX = Math.max(bounds.maxX, c.WorldBounds.maxX[eid]);
  bounds.maxY = Math.max(bounds.maxY, c.WorldBounds.maxY[eid]);
  if (hasComponent(world, eid, c.ClipsContent) || hasComponent(world, eid, c.ClipToBox)) return;
  for (const child of query(world, [Or(c.Geometry, c.Group), ChildOf(eid), Not(c.Deleted)])) measureImageBounds(world, child, bounds);
}
