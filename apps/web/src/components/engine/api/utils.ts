/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { entityExists, hasComponent, query, Not, Or } from "bitecs";
import { ChildOf } from "../components/relations";
import { sortByFrame, sortByItemIndex } from "../utils/sort";
import { DEFAULT_DURATION_FRAMES } from "../constants";
import { findAssetDuration } from "../utils/time";
import { getParentEntity } from "./base";
import { isGroupLike, isScene } from "./query";
import { removeComponent, setComponent, addComponent, clearComponent } from "./events";

import type { EngineWorld } from "./world";

export function rebuildCaches(world: EngineWorld, eid: number, pid: number | null) {
  const c = world.components;
  if (pid === null) return;

  if (hasComponent(world, eid, c.Geometry) || hasComponent(world, eid, c.Group) || hasComponent(world, eid, c.AdjustmentLayer)) {
    c.Cache.children[pid] = [...query(world, [Or(c.Geometry, c.Group, c.AdjustmentLayer), ChildOf(pid), Not(c.IsMask), Not(c.Deleted)])];
    c.Cache.children[pid].sort(sortByItemIndex(world));
  }

  if (hasComponent(world, eid, c.IsMask)) {
    c.Cache.masks[pid] = [...query(world, [c.Geometry, c.IsMask, ChildOf(pid), Not(c.Deleted)])];
    c.Cache.masks[pid].sort(sortByItemIndex(world));
  }

  if (hasComponent(world, eid, c.KeyframeTrack)) {
    const geomEid = findClosestParentGeometry(world, pid);
    aggregateKeyframeTracks(world, geomEid);
    resetAnimatedValues(world, geomEid);
  }

  if (hasComponent(world, eid, c.Keyframe)) {
    c.Cache.keyframes[pid] = [...query(world, [c.Keyframe, ChildOf(pid), Not(c.Deleted)])];
    c.Cache.keyframes[pid].sort(sortByFrame(world));
  }

  if (hasComponent(world, eid, c.Animation)) {
    c.Cache.animations[pid] = [...query(world, [c.Animation, ChildOf(pid), Not(c.Deleted)])];
    c.Cache.animations[pid].sort(sortByItemIndex(world));
    resetAnimatedValues(world, pid);
  }

  if (hasComponent(world, eid, c.Paint)) {
    c.Cache.fills[pid] = [...query(world, [c.Paint, ChildOf(pid), Not(c.Deleted)])];
    c.Cache.fills[pid].sort(sortByItemIndex(world));
  }

  if (hasComponent(world, eid, c.Stroke)) {
    c.Cache.strokes[pid] = [...query(world, [c.Stroke, ChildOf(pid), Not(c.Deleted)])];
    c.Cache.strokes[pid].sort(sortByItemIndex(world));
  }

  if (hasComponent(world, eid, c.Effect)) {
    c.Cache.effects[pid] = [...query(world, [c.Effect, ChildOf(pid), Not(c.Shadow), Not(c.Deleted)])];
    c.Cache.effects[pid].sort(sortByItemIndex(world));
  }

  if (hasComponent(world, eid, c.Shadow)) {
    c.Cache.shadows[pid] = [...query(world, [c.Shadow, ChildOf(pid), Not(c.Effect), Not(c.Deleted)])];
    c.Cache.shadows[pid].sort(sortByItemIndex(world));
  }

  if (hasComponent(world, eid, c.TextRange)) {
    c.Cache.textRanges[pid] = [...query(world, [c.TextRange, ChildOf(pid), Not(c.Deleted)])];
    c.Cache.textRanges[pid].sort(sortByItemIndex(world));
  }
}

export function persistEntity(world: EngineWorld, eid: number) {
  const c = world.components;

  if (world.mode !== 'realtime' || !entityExists(world, eid) || hasComponent(world, eid, c.Deleted)) return;

  world.store.queue.scheduleWrite(world, eid);
}

export function unpersistEntity(world: EngineWorld, eid: number) {
  const c = world.components;

  if (world.mode !== 'realtime' || !entityExists(world, eid) || !hasComponent(world, eid, c.Deleted)) return;

  removeComponent(world, eid, c.Selected, false);
  world.store.queue.scheduleDelete(world, eid);
}

export function findClosestParentGeometry(world: EngineWorld, eid: number) {
  const c = world.components;
  let current: number | null = eid;
  while (current) {
    if (hasComponent(world, current, c.Geometry) || hasComponent(world, current, c.Group) || hasComponent(world, current, c.AdjustmentLayer)) {
      return current;
    }
    current = getParentEntity(world, current);
  }
  return null;
}

/**
 * Collect every KeyframeTrack under a geometry, stopping at nested geometries
 * (each enclosing geometry owns its own cache entry). Refreshes the denormalised
 * `target` field on each track so consumers iterating the cache can look up the
 * animated entity without walking ChildOf.
 */
export function aggregateKeyframeTracks(world: EngineWorld, nodeEid: number | null): void {
  if (nodeEid === null) return;

  const c = world.components;
  const tracks: number[] = [];

  const walk = (eid: number) => {
    for (const cid of query(world, [ChildOf(eid), Not(c.Deleted)])) {
      if (hasComponent(world, cid, c.KeyframeTrack)) {
        c.KeyframeTrack.target[cid] = getParentEntity(world, cid) ?? 0;
        tracks.push(cid);
        continue;
      }
      // Stop at nested nodes — each geometry, group, or adjustment layer owns
      // its own cache entry.
      if (hasComponent(world, cid, c.Geometry) || hasComponent(world, cid, c.Group) || hasComponent(world, cid, c.AdjustmentLayer)) continue;
      walk(cid);
    }
  };

  walk(nodeEid);
  c.Cache.keyframeTracks[nodeEid] = tracks;
}

export function disposeDecoders(world: EngineWorld, eid: number): void {
  const ImageDecoder = world.components.ImageDecoder;
  const VideoDecoder = world.components.VideoDecoder;
  const SequenceDecoder = world.components.SequenceDecoder;
  const AudioDecoder = world.components.AudioDecoder;

  ImageDecoder[eid]?.dispose();
  ImageDecoder[eid] = null;
  VideoDecoder[eid]?.dispose();
  VideoDecoder[eid] = null;
  SequenceDecoder[eid]?.dispose();
  SequenceDecoder[eid] = null;
  AudioDecoder[eid]?.reset();
  AudioDecoder[eid] = null;

  for (const child of query(world, [ChildOf(eid)])) {
    disposeDecoders(world, child);
  }
}

export function disposeHtmlHosts(world: EngineWorld, eid: number): void {
  const HtmlHost = world.components.HtmlHost;

  HtmlHost[eid]?.dispose();
  HtmlHost[eid] = null;

  for (const child of query(world, [ChildOf(eid)])) {
    disposeHtmlHosts(world, child);
  }
}

export function disposeSurfaceHosts(world: EngineWorld, eid: number): void {
  const SurfaceHost = world.components.SurfaceHost;

  SurfaceHost[eid]?.dispose();
  SurfaceHost[eid] = null;

  for (const child of query(world, [ChildOf(eid)])) {
    disposeSurfaceHosts(world, child);
  }
}

export function disposeShaderHosts(world: EngineWorld, eid: number): void {
  const ShaderHost = world.components.ShaderHost;

  ShaderHost[eid]?.dispose();
  ShaderHost[eid] = null;

  for (const child of query(world, [ChildOf(eid)])) {
    disposeShaderHosts(world, child);
  }
}

export function disconnectAudioBus(world: EngineWorld, eid: number): void {
  const AudioBus = world.components.AudioBus;
  AudioBus[eid]?.disconnect();
  AudioBus[eid] = null;

  for (const child of query(world, [ChildOf(eid)])) {
    disconnectAudioBus(world, child);
  }
}

/**
 * Time utilty functions.
 */

/**
 * Recompute trim when asset id of an entity changes.
 */
export function reactToAssetChange(world: EngineWorld, eid: number) {
  const c = world.components;

  if (hasComponent(world, eid, c.Paint)) {
    reactToPaintChange(world, eid);
  } else if (hasComponent(world, eid, c.Audio)) {
    reactToGeometryDurationChange(world, eid);
  } else if (hasComponent(world, eid, c.Caption)) {
    // Re-pointed transcript: drop the decoder so it re-resolves with the new asset.
    c.CaptionDecoder[eid]?.dispose();
    c.CaptionDecoder[eid] = null;
  }
}

/**
 * Re-clamp the parent geometry's trim and bubble the new bounds up.
 */
export function reactToPaintChange(world: EngineWorld, paintEid: number) {
  const c = world.components;
  const eid = getParentEntity(world, paintEid);
  if (eid === null || !hasComponent(world, eid, c.Geometry)) return;

  clampTrimToAssetDuration(world, eid);
  recomputeEntityTimeRange(world, eid);
  bubbleTimeRangeUp(world, eid);
}

/**
 * Recompute a geometry's bounds and bubble. Used when something other than
 * its own Trim/Delay shifts its duration (e.g. an attached asset id on an
 * Audio entity).
 */
export function reactToGeometryDurationChange(world: EngineWorld, eid: number) {
  const c = world.components;
  if (!hasComponent(world, eid, c.Geometry)) return;

  clampTrimToAssetDuration(world, eid);
  recomputeEntityTimeRange(world, eid);
  bubbleTimeRangeUp(world, eid);
}

/**
 * Deleted onAdd hook (covers the user-facing "remove" path). Mirror of
 * reactToChildAttached: if the dying entity is a geometry the parent group's
 * bounds may shrink; if it's a paint the parent geometry may lose its asset
 * source and needs a Trim pinned at its current duration.
 */
export function reactToChildDetached(world: EngineWorld, childEid: number) {
  const c = world.components;

  if (hasComponent(world, childEid, c.Geometry) || hasComponent(world, childEid, c.Group)) {
    bubbleTimeRangeUp(world, childEid);
    return;
  }

  if (hasComponent(world, childEid, c.Paint)) {
    const parentEid = getParentEntity(world, childEid);
    if (parentEid === null || !hasComponent(world, parentEid, c.Geometry)) return;
    // Pin the current duration before recomputing — otherwise the geometry
    // would silently fall back to the 16s default after losing its paint.
    pinTrimToCurrentDuration(world, parentEid);
  }
}

export function recomputeEntityTimeRange(world: EngineWorld, eid: number): void {
  const c = world.components;

  const parentEid = getParentEntity(world, eid);

  const parentDelay = parentEid !== null ? (c.Computed.delay[parentEid] ?? 0) : 0;
  const ownDelay = c.Delay[eid] ?? 0;
  const accumulatedDelay = parentDelay + ownDelay;

  c.Computed.delay[eid] = accumulatedDelay;

  const playbackRate = c.PlaybackRate[eid] ?? 1;

  let start: number;
  let end: number;

  if (hasComponent(world, eid, c.Trim)) {
    const trimStart = c.Trim.start[eid] ?? 0;
    const trimEnd = c.Trim.end[eid] ?? 0;
    start = Math.round(accumulatedDelay + trimStart / playbackRate);
    end = Math.round(accumulatedDelay + trimEnd / playbackRate);
  } else if (isGroupLike(world, eid)) {
    const children = c.Cache.children[eid] ?? [];
    if (children.length === 0) {
      start = accumulatedDelay;
      end = accumulatedDelay + DEFAULT_DURATION_FRAMES;
    } else {
      let minStart = Infinity;
      let maxEnd = -Infinity;
      for (const child of children) {
        const cs = c.Computed.start[child] ?? accumulatedDelay;
        const ce = c.Computed.end[child] ?? accumulatedDelay;
        if (cs < minStart) minStart = cs;
        if (ce > maxEnd) maxEnd = ce;
      }
      start = minStart;
      end = maxEnd;
    }
  } else {
    const assetDuration = findAssetDuration(world, eid);
    const sourceDuration = assetDuration ?? DEFAULT_DURATION_FRAMES;
    start = accumulatedDelay;
    end = Math.round(accumulatedDelay + sourceDuration / playbackRate);
  }

  c.Computed.start[eid] = start;
  c.Computed.end[eid] = end;
  c.Computed.duration[eid] = end - start;
}

/**
 * Recompute eid and every descendant (geometry children). Use when something
 * that affects accumulated delay or playback rate changes — every child below
 * needs its delay refreshed.
 */
export function propagateTimeRangeDown(world: EngineWorld, eid: number): void {
  const c = world.components;
  recomputeEntityTimeRange(world, eid);
  for (const child of c.Cache.children[eid] ?? []) {
    propagateTimeRangeDown(world, child);
  }
  for (const mask of c.Cache.masks[eid] ?? []) {
    propagateTimeRangeDown(world, mask);
  }
  recomputeEntityTimeRange(world, eid);
}

/**
 * Walk upward recomputing any ancestor whose bounds depend on its children
 * (group-like without an explicit Trim). Call with the PARENT of the entity
 * that changed.
 */
export function bubbleTimeRangeUp(world: EngineWorld, childEid: number): void {
  const eid = getParentEntity(world, childEid);
  if (eid === null) return;

  const c = world.components;

  const dependsOnChildren = isGroupLike(world, eid) && !hasComponent(world, eid, c.Trim);
  if (!dependsOnChildren) return;

  recomputeEntityTimeRange(world, eid);
  bubbleTimeRangeUp(world, eid);
}

/**
 * Clamp a Trim's end so it never exceeds the entity's available asset
 * duration. Mutates the Trim component directly — caller is responsible for
 * triggering downstream recomputes.
 */
export function clampTrimToAssetDuration(world: EngineWorld, eid: number): void {
  const c = world.components;
  if (!hasComponent(world, eid, c.Trim)) return;

  const assetDuration = findAssetDuration(world, eid);
  if (!assetDuration) return;

  c.Trim.end[eid] = Math.min(c.Trim.end[eid] ?? 0, assetDuration);
}

/**
 * "Paint is removed" rule: if the geometry has no Trim, pin its current
 * computed duration as a fresh Trim so the entity does not silently fall
 * back to the 16s default after losing its asset source.
 */
export function pinTrimToCurrentDuration(world: EngineWorld, eid: number): void {
  const c = world.components;
  if (hasComponent(world, eid, c.Trim)) return;

  const playbackRate = c.PlaybackRate[eid] ?? 1;
  const globalDuration = c.Computed.duration[eid] ?? 0;
  const localDuration = Math.round(globalDuration * playbackRate);

  setComponent(world, eid, c.Trim, {
    start: 0,
    end: localDuration,
  });
}

export function reactToChildAttached(world: EngineWorld, childEid: number) {
  const c = world.components;

  if (hasComponent(world, childEid, c.Geometry) || hasComponent(world, childEid, c.Group)) {
    propagateTimeRangeDown(world, childEid);
    bubbleTimeRangeUp(world, childEid);
    return;
  }

  if (hasComponent(world, childEid, c.Paint)) {
    reactToPaintChange(world, childEid);
  }
}

export function syncInteractiveState(world: EngineWorld) {
  const c = world.components;

  clearComponent(world, c.Interactive, false);

  const walk = (eid: number, isRoot: boolean) => {
    const children = query(world, [Or(c.Geometry, c.Group, c.AdjustmentLayer), ChildOf(eid), Not(c.Deleted)]);
    const isSequential = hasComponent(world, eid, c.Sequential);
    // Only a root (top-level) scene passes through to its children. A nested
    // scene is a clickable unit like a group: it becomes Interactive itself
    // and does not expose its children until it is entered (double-click).
    const isRootSceneWithChildren = isRoot && isScene(world, eid) && children.length > 0;

    if (isSequential || isRootSceneWithChildren) {
      for (const child of children) {
        walk(child, false);
      }
      return;
    }

    addComponent(world, eid, c.Interactive, false);
  }

  for (const eid of query(world, [Or(c.Geometry, c.Group, c.AdjustmentLayer), Not(ChildOf('*')), Not(c.Deleted)])) {
    walk(eid, true);
  }
}

export function resetAnimatedValues(world: EngineWorld, eid: number | null) {
  if (eid === null) return;

  const c = world.components;

  c.Computed.positionX[eid] = c.Position.x[eid] ?? 0;
  c.Computed.positionY[eid] = c.Position.y[eid] ?? 0;
  c.Computed.offsetX[eid] = c.Offset.x[eid] ?? 0;
  c.Computed.offsetY[eid] = c.Offset.y[eid] ?? 0;
  c.Computed.rotation[eid] = c.Rotation[eid] ?? 0;
  c.Computed.skewX[eid] = c.Skew.x[eid] ?? 0;
  c.Computed.skewY[eid] = c.Skew.y[eid] ?? 0;
  c.Computed.opacity[eid] = c.Appearance.opacity[eid] ?? 1;
  c.Computed.color[eid] = c.Color[eid] ?? 0;
  c.Computed.blur[eid] = c.Blur[eid] ?? 0;
  c.Computed.volume[eid] = c.Volume[eid] ?? 0;
  c.Computed.strokeWidth[eid] = c.StrokeStyle.width[eid] ?? 1;
  c.Computed.cornerRadius[eid] = c.CornerRadius[eid] ?? 0;
  c.Computed.cornerRadiusTopLeft[eid] = c.MixedCornerRadius.topLeft[eid] ?? 0;
  c.Computed.cornerRadiusTopRight[eid] = c.MixedCornerRadius.topRight[eid] ?? 0;
  c.Computed.cornerRadiusBottomRight[eid] = c.MixedCornerRadius.bottomRight[eid] ?? 0;
  c.Computed.cornerRadiusBottomLeft[eid] = c.MixedCornerRadius.bottomLeft[eid] ?? 0;
  c.Computed.stopOffset[eid] = c.ColorStop.offset[eid] ?? 0;
  c.Computed.stopColor[eid] = c.ColorStop.color[eid] ?? 0;
  c.Computed.stopOpacity[eid] = c.ColorStop.opacity[eid] ?? 1;
  c.Computed.chars[eid] = c.Chars[eid] ?? '';

  const uniform = hasComponent(world, eid, c.UniformScale) ? c.UniformScale[eid] ?? 1 : 1;
  const hasScale = hasComponent(world, eid, c.Scale);
  c.Computed.scaleX[eid] = (hasScale ? c.Scale.x[eid] ?? 1 : 1) * uniform;
  c.Computed.scaleY[eid] = (hasScale ? c.Scale.y[eid] ?? 1 : 1) * uniform;
}

export { propagateSize, resolveConstraintOffsets } from "./resize";
