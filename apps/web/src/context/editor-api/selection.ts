/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { Accessor } from "solid-js";

import {
  addComponent,
  removeComponent,
  findGeometryAsset,
  isScene,
  isGroup,
  isText,
  isCaption,
  isAdjustmentLayer,
  PaintType,
} from "@/components/engine";
import { Not, Or, query, hasComponent, entityExists } from "bitecs";

import type { EngineWorld, Engine } from "@/components/engine";
import type { NodeRef } from "@diffusionstudio/cli/channels";

function resolveNodeEids(world: EngineWorld, ids: number[]): number[] {
  const c = world.components;
  return ids.map((eid) => {
    if (
      !Number.isInteger(eid) ||
      !entityExists(world, eid) ||
      hasComponent(world, eid, c.Deleted) ||
      !isNode(world, eid)
    ) {
      throw new Error(`No such node: ${eid}`);
    }
    return eid;
  });
}

function isNode(world: EngineWorld, eid: number): boolean {
  const c = world.components;
  return (
    hasComponent(world, eid, c.Geometry) ||
    hasComponent(world, eid, c.Group) ||
    hasComponent(world, eid, c.AdjustmentLayer)
  );
}

export function entityType(world: EngineWorld, eid: number): string {
  const c = world.components;
  if (hasComponent(world, eid, c.ColorStop)) return "colorStop";
  if (hasComponent(world, eid, c.Paint)) {
    switch (c.Paint[eid]) {
      case PaintType.SOLID: return "solidPaint";
      case PaintType.LINEAR_GRADIENT: return "linearGradientPaint";
      case PaintType.RADIAL_GRADIENT: return "radialGradientPaint";
      case PaintType.IMAGE: return "imagePaint";
      case PaintType.VIDEO: return "videoPaint";
      case PaintType.HTML: return "htmlPaint";
      case PaintType.SURFACE: return "surfacePaint";
      case PaintType.SHADER: return "shaderPaint";
      default: return "paint";
    }
  }
  if (hasComponent(world, eid, c.Stroke)) return "stroke";
  if (hasComponent(world, eid, c.Shadow)) return "shadow";
  if (hasComponent(world, eid, c.Effect)) return "effect";
  if (hasComponent(world, eid, c.TextRange)) return "textRange";
  if (hasComponent(world, eid, c.KeyframeTrack)) return "keyframeTrack";
  if (hasComponent(world, eid, c.Keyframe)) return "keyframe";
  if (hasComponent(world, eid, c.Animation)) return "animation";
  if (isScene(world, eid)) return "scene";
  if (isAdjustmentLayer(world, eid)) return "adjustmentLayer";
  if (isGroup(world, eid)) return "group";
  if (isCaption(world, eid)) return "caption";
  if (isText(world, eid)) return "text";
  if (hasComponent(world, eid, c.Audio)) return "audio";

  const asset = findGeometryAsset(world, eid);
  if (asset?.type === "IMAGE") return "image";
  if (asset?.type === "VIDEO") return "video";
  if (asset?.type === "AUDIO") return "audio";

  return "rect";
}

function toNodeRef(world: EngineWorld, eid: number): NodeRef {
  const c = world.components;
  return {
    id: eid,
    name: c.Name[eid] ?? "",
    type: entityType(world, eid),
  };
}

export function selectedNodeIds(world: EngineWorld): number[] {
  const c = world.components;
  return [...query(world, [c.Selected, Or(c.Geometry, c.Group, c.AdjustmentLayer), Not(c.Deleted)])];
}

function selectedNodes(world: EngineWorld): NodeRef[] {
  return selectedNodeIds(world).map((eid) => toNodeRef(world, eid));
}

export function handleSelectionList(engine: Accessor<Engine>) {
  return async () => {
    const { world } = engine();
    return selectedNodes(world);
  }
}

export function handleSelectionSet(engine: Accessor<Engine>) {
  return async ({ ids }: { ids: number[] }) => {
    const { world } = engine();
    const c = world.components;
    const eids = resolveNodeEids(world, ids);
    // Scope clearing to nodes so a co-existing keyframe selection survives.
    for (const eid of query(world, [c.Selected, Or(c.Geometry, c.Group, c.AdjustmentLayer)])) {
      removeComponent(world, eid, c.Selected, false);
    }
    for (const eid of eids) addComponent(world, eid, c.Selected, false);
    return selectedNodes(world);
  }
}

export function handleSelectionFocus(engine: Accessor<Engine>) {
  return async () => {
    const { world, camera } = engine();
    camera.focusEntities(selectedNodeIds(world));
    return selectedNodes(world);
  }
}
