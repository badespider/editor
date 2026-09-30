/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { hasComponent, Hierarchy, Not, Or, query } from 'bitecs';

import { ChildOf } from '../components';
import { createEngineWorld } from '../api';
import { createEntity } from '../api/entities';
import { appendChild } from '../api/hierarchy';
import { recomputeEntityTimeRange } from '../api/utils';
import { addComponent, removeComponent } from '../api/events';
import { playbackSystem } from '../systems/playback';
import { motionSystem } from '../systems/motion';
import { transformSystem } from '../systems/transform';
import { renderSystem } from '../systems/render';
import { prepareHtmlFrame } from '../systems/html-prepare';
import { cloneFromRecords, serializeEntity } from '../api/serialize';
import { getEntityTree } from '../api/query';
import { realizeMounts } from '@/utils/mount';
import { framesToSeconds, formatTimecode } from '../utils';
import { assert } from '@/utils';

import type { EngineWorld } from '../api/world';
import type { AABB } from '../math';

type ImageEncoderConfig = {
  eid: number;
  /** Frames to capture, relative to the entity's first visible frame. */
  frames: number[];
  /** Target output height in px (default: the entity's native size). */
  resolution?: number;
};

/** One capture: the PNG plus the timecode of the frame rendered, e.g. `01s15f`. */
export type CapturedImage = { base64: string; timecode: string };

export type ImageExportResult =
  | { type: 'success'; data: CapturedImage[] }
  | { type: 'canceled' }
  | { type: 'error'; error: Error };

/**
 * Renders single frames of one entity into standalone PNGs (base64, no
 * data-url prefix). The entity's subtree is cloned into a fresh offline
 * world and drawn at the top level: the canvas is sized to the union of the
 * entity's world-space AABBs across the requested frames and the camera
 * shifts that box onto the canvas, so the node is fully visible regardless
 * of where it sat in its source scene.
 */
export async function createImageEncoder(sourceWorld: EngineWorld, config: ImageEncoderConfig) {
  assert(config.frames.length > 0, 'No frames requested');

  const subtree = getEntityTree(sourceWorld, config.eid);
  const records = subtree.map(eid => serializeEntity(sourceWorld, eid));

  // Re-root the node. Its parent isn't part of the clone, so a dangling
  // ChildOf would attach to an arbitrary entity in the new world; Delay and
  // Hidden only mean something on the timeline it was lifted out of.
  const rootRecord = records.find(record => record.eid === config.eid);
  assert(rootRecord !== undefined, `No such entity: ${config.eid}`);
  delete rootRecord.ChildOf;
  delete rootRecord.Delay;
  delete rootRecord.Hidden;

  const offscreenCanvas = new OffscreenCanvas(2, 2);
  const offscreenCtx = offscreenCanvas.getContext('2d')!;

  // Never started — image capture is video-only; the context just satisfies
  // world construction and lazy audio-bus wiring.
  const offlineAudioCtx = new OfflineAudioContext(2, 1, 48000);

  const world = createEngineWorld(sourceWorld.projectId, offlineAudioCtx);
  world.mode = 'offline-video';
  world.assets = sourceWorld.assets;
  world.fonts = [...sourceWorld.fonts];
  world.ctx = offscreenCtx;
  world.canvas = offscreenCanvas;
  world.resolution = 1;
  world.camera = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  world.frameRate = sourceWorld.frameRate;
  world.promises = [];

  const eidMap = cloneFromRecords(world, records);
  const rootEid = eidMap.get(config.eid);
  assert(rootEid !== undefined, 'Failed to clone entity subtree');

  const mounts = await realizeMounts(world);

  const clonedEids = [...eidMap.values()];
  const c = world.components;

  // Mute everything so the playback system never initializes audio decoders.
  for (const eid of clonedEids) {
    addComponent(world, eid, c.Muted, false);
  }

  // The motion system only samples parented entities, so the node's own
  // keyframes would be skipped as a top-level root. A synthetic group above
  // it owns the playhead instead and keeps the node an ordinary child.
  const stageEid = createEntity(world);
  addComponent(world, stageEid, c.Group, false);
  appendChild(world, rootEid, stageEid);

  recomputeAllTimeRanges(world);

  // Map "frame 0 = first visible frame": with Delay stripped the node's
  // computed start is 0 unless it carries a Trim, whose start offsets it.
  const startFrame = c.Computed.start[rootEid] ?? 0;

  // Entities in the clone that own a timeline clock
  const clockEids = [...query(world, [c.Playback, Not(c.Deleted)])];

  const seek = (frame: number) => {
    const stageFrame = startFrame + frame;
    const stageSeconds = framesToSeconds(stageFrame, world.frameRate);
    c.Computed.localTime[stageEid] = stageFrame;
    c.Computed.localTimeInSeconds[stageEid] = stageSeconds;

    for (const eid of clockEids) {
      c.Computed.localTime[eid] = stageFrame;
      c.Computed.localTimeInSeconds[eid] = stageSeconds;
      c.Playback.playing[eid] = 1;
    }

    world.timestamp.delta = 1000 / world.frameRate;
    world.timestamp.now += world.timestamp.delta;

    // Cull flags derived from a stale canvas/camera would make the motion
    // system skip entities and keep decoders idle — clear them every tick.
    for (const eid of clonedEids) {
      removeComponent(world, eid, c.Culled, false);
    }

    playbackSystem(world);
  };

  // Union an entity's world-space AABB into `bounds`, descending so children
  // that overflow a leaf's own rect still count — except where content is
  // clipped. Group bounds already aggregate their children.
  const measure = (eid: number, bounds: AABB): void => {
    if (hasComponent(world, eid, c.Hidden) || hasComponent(world, eid, c.IsMask)) return;
    if (c.Computed.visibility[eid] === 0) return;

    bounds.minX = Math.min(bounds.minX, c.WorldBounds.minX[eid]);
    bounds.minY = Math.min(bounds.minY, c.WorldBounds.minY[eid]);
    bounds.maxX = Math.max(bounds.maxX, c.WorldBounds.maxX[eid]);
    bounds.maxY = Math.max(bounds.maxY, c.WorldBounds.maxY[eid]);

    if (hasComponent(world, eid, c.ClipsContent)) return;
    for (const childEid of query(world, [Or(c.Geometry, c.Group), ChildOf(eid), Not(c.Deleted)])) {
      measure(childEid, bounds);
    }
  };

  // Warm-up tick: group bounds aggregate from their children's local
  // matrices, which don't exist until the first transform walk has visited
  // them — measuring on that walk would union stale boxes.
  seek(config.frames[0]);
  motionSystem(world);
  transformSystem(world);

  // Measure pass: run motion + transforms over every requested frame with an
  // identity camera and union the bounds, so an animated node stays fully
  // visible in a fixed-size output across all frames.
  const bounds: AABB = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const frame of config.frames) {
    seek(frame);
    motionSystem(world);
    transformSystem(world);
    measure(rootEid, bounds);
  }
  assert(Number.isFinite(bounds.minX), 'Entity is not visible at any of the requested frames');

  const boundsWidth = Math.max(1, bounds.maxX - bounds.minX);
  const boundsHeight = Math.max(1, bounds.maxY - bounds.minY);

  /** Re-target the output height; callers that lay frames out do this once measured. */
  const resize = (height?: number) => {
    const scale = height ? height / boundsHeight : 1;
    offscreenCanvas.width = Math.max(1, Math.round(boundsWidth * scale));
    offscreenCanvas.height = Math.max(1, Math.round(boundsHeight * scale));
    world.resolution = scale;
  };

  resize(config.resolution);
  // Shift the measured box onto the canvas so the node is centered in view;
  // the camera translation is scaled by world.resolution at render time.
  world.camera.e = -bounds.minX;
  world.camera.f = -bounds.minY;

  let canceled = false;
  const cancel = () => (canceled = true);

  const render = async (): Promise<ImageExportResult> => {
    try {
      const images: CapturedImage[] = [];

      for (const frame of config.frames) {
        if (canceled) {
          return { type: 'canceled' };
        }

        seek(frame);
        await resolverSystem(world);
        motionSystem(world);
        transformSystem(world);
        await prepareHtmlFrame(world);
        renderSystem(world);

        const stampFrame = startFrame + frame;
        images.push({
          base64: await toBase64Png(offscreenCanvas),
          timecode: formatTimecode(framesToSeconds(stampFrame, world.frameRate), world.frameRate),
        });
      }

      return { type: 'success', data: images };
    } catch (e) {
      return {
        type: 'error',
        error: e instanceof Error ? e : new Error('Unknown error'),
      };
    } finally {
      // Free the graphs + hosts realized above (this offline world is
      // discarded; realized HtmlHosts otherwise leak a canvas on document.body).
      mounts.disposeAll();
    }
  };

  return {
    render,
    cancel,
    resize,
    bounds: { width: boundsWidth, height: boundsHeight },
  };
}

async function toBase64Png(canvas: OffscreenCanvas): Promise<string> {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.split(',')[1] ?? '';
}

async function resolverSystem(world: EngineWorld) {
  if (world.promises?.length) {
    await Promise.all(world.promises.filter(promise => promise !== null));
    world.promises = [];
  }
}

function recomputeAllTimeRanges(world: EngineWorld): void {
  const c = world.components;
  // Hierarchy(ChildOf) yields parents before children (top-down). A single pass
  // is wrong for group-like nodes: their bounds aggregate from children, but the
  // children haven't been recomputed yet when the parent is visited. Do two passes:
  //   1. top-down  — refresh accumulated delay + leaf/Trim bounds (parents first)
  //   2. bottom-up — groups now aggregate from already-recomputed children
  const entities = query(world, [Or(c.Geometry, c.Group), Hierarchy(ChildOf), Not(c.Deleted)]);
  for (let i = 0; i < entities.length; i++) {
    recomputeEntityTimeRange(world, entities[i]);
  }
  for (let i = entities.length - 1; i >= 0; i--) {
    recomputeEntityTimeRange(world, entities[i]);
  }
}
