/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { entityExists, hasComponent, query, Not } from "bitecs";

import { createImageEncoder } from "@/components/engine/encode/image-encoder";
import { ElectronWritableFileHandle } from "@/lib/electron-file-writable";
import { renderScene } from "@/context/render";

import {
  AnimationPhase,
  deleteEntity,
  isText,
  isScene,
  getSceneAncestor,
  getEntityTree,
  cloneSubtree,
  serializeEntity,
  composeSheet,
  decodePngBase64,
  planSheet,
  planSheetSizes,
  sheetTimecode,
} from "@/components/engine";
import { ChildOf } from "@/components/engine/components";
import { ANIMATION_TYPE_MAP, CAPTION_ALIGN_MAP, WorldDocument } from "@/utils/jsx";
import { entityType } from "./selection";

import type { EngineWorld, Engine } from "@/components/engine";
import type {
  EntityRecord,
  NodeDeleteResult,
  NodeDuplicateResult,
  NodeGrepMatch,
  NodeGrepRequest,
  NodeGrepResult,
  NodePatch,
  NodePatchResult,
  NodeRef,
  NodeTree,
  NodeRenderRequest,
  NodeRenderResult,
  NodeCaptureRequest,
  NodeCaptureResult,
  TimecodedImage,
} from "@diffusionstudio/cli/channels";
import type { EncoderConfig } from "@/components/engine/encode/interfaces";
import type { Accessor } from "solid-js";

// The JSX animation names, keyed by engine preset.
const ANIMATION_TYPE_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ANIMATION_TYPE_MAP).map(([name, type]) => [type, name]),
);

// The JSX caption alignment names, keyed by engine enum.
const CAPTION_ALIGN_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(CAPTION_ALIGN_MAP).map(([name, align]) => [align, name]),
);

// Scenes are nodes too, so node ops accept them alongside geometry, groups,
// and adjustment layers.
export function isNode(world: EngineWorld, eid: number): boolean {
  const c = world.components;
  return (
    hasComponent(world, eid, c.Geometry) ||
    hasComponent(world, eid, c.Group) ||
    hasComponent(world, eid, c.AdjustmentLayer) ||
    hasComponent(world, eid, c.Scene)
  );
}

// Any live entity — `ls`, `tree`, `rm`, `patch`, and `insert` also target
// paints and color stops, which are sub-entities rather than nodes.
export function resolveEntityEid(world: EngineWorld, eid: number): number {
  if (
    !Number.isInteger(eid) ||
    !entityExists(world, eid) ||
    hasComponent(world, eid, world.components.Deleted)
  ) {
    throw new Error(`No such entity: ${eid}`);
  }
  return eid;
}

export function resolveNodeEid(world: EngineWorld, eid: number): number {
  resolveEntityEid(world, eid);
  if (!isNode(world, eid)) {
    throw new Error(`No such node: ${eid}`);
  }
  return eid;
}

export function handleNodeList(engine: Accessor<Engine>) {
  return async ({ ids }: { ids?: number[] }): Promise<EntityRecord[]> => {
    const { world } = engine();
    const c = world.components;

    // No ids → the root: top-level nodes
    if (ids === undefined || ids.length === 0) {
      const roots = [...query(world, [c.Geometry, Not(ChildOf("*")), Not(c.Deleted)])];
      return roots.map((eid) => serializeEntity(world, eid) as EntityRecord);
    }

    return ids.map((id) => serializeEntity(world, resolveEntityEid(world, id)) as EntityRecord);
  };
}

/**
 * Key characteristics of an entity, from whatever components it carries — 
 * e.g. "hidden; size: 200x300; text: Hello World". Times print as seconds.
 */
function describeEntity(world: EngineWorld, eid: number): string {
  const c = world.components;
  const parts: string[] = [];
  const fmtTime = (frames: number) => `${Math.round((frames / world.frameRate) * 100) / 100}s`;
  const hex = (packed: number) => `#${((packed >>> 0) & 0xffffff).toString(16).padStart(6, "0")}`;

  if (hasComponent(world, eid, c.Hidden)) parts.push("hidden");
  if (hasComponent(world, eid, c.Size)) {
    parts.push(`size: ${c.Size.width[eid] ?? 0}x${c.Size.height[eid] ?? 0}`);
  }
  if (hasComponent(world, eid, c.Position)) {
    const x = c.Position.x[eid] ?? 0;
    const y = c.Position.y[eid] ?? 0;
    if (x !== 0 || y !== 0) parts.push(`pos: ${x},${y}`);
  }
  if (hasComponent(world, eid, c.Offset)) {
    const x = c.Offset.x[eid] ?? 0;
    const y = c.Offset.y[eid] ?? 0;
    if (x !== 0 || y !== 0) parts.push(`offset: ${x},${y}`);
  }
  if (hasComponent(world, eid, c.Rotation) && c.Rotation[eid]) {
    parts.push(`rotation: ${c.Rotation[eid]}°`);
  }
  if (hasComponent(world, eid, c.CornerRadius) && c.CornerRadius[eid]) {
    parts.push(`cornerRadius: ${c.CornerRadius[eid]}`);
  }
  if (hasComponent(world, eid, c.Appearance)) {
    const opacity = c.Appearance.opacity[eid];
    if (opacity !== undefined && opacity !== 1) parts.push(`opacity: ${opacity}`);
  }
  const delay = hasComponent(world, eid, c.Delay) ? c.Delay[eid] ?? 0 : 0;
  const hasTrim = hasComponent(world, eid, c.Trim);
  const sourceIn = hasTrim ? c.Trim.start[eid] : undefined;
  const sourceOut = hasTrim ? c.Trim.end[eid] : undefined;
  const timelineStart = delay + (sourceIn ?? 0);
  if (timelineStart !== 0) parts.push(`start: ${fmtTime(timelineStart)}`);
  if (sourceOut !== undefined) parts.push(`end: ${fmtTime(delay + sourceOut)}`);
  if (sourceIn) parts.push(`sourceIn: ${fmtTime(sourceIn)}`);
  if (sourceIn && sourceOut !== undefined) parts.push(`sourceOut: ${fmtTime(sourceOut)}`);
  if (hasComponent(world, eid, c.Volume)) {
    const db = c.Volume[eid] ?? 0;
    parts.push(`volume: ${db === -Infinity ? "-inf" : Math.round(db * 10) / 10} dB`);
  }
  if (hasComponent(world, eid, c.AssetId)) parts.push(`asset: ${c.AssetId[eid]}`);
  if (hasComponent(world, eid, c.Caption)) {
    const align = c.Caption.verticalAlign[eid];
    if (align !== undefined) parts.push(`verticalAlign: ${CAPTION_ALIGN_NAMES[align]}`);
  }
  if (hasComponent(world, eid, c.TextStyle)) {
    const family = c.TextStyle.fontFamily[eid];
    const size = c.TextStyle.fontSize[eid];
    const font = [family, size !== undefined ? `${size}px` : undefined].filter(Boolean).join(" ");
    if (font) parts.push(`font: ${font}`);
  }
  if (hasComponent(world, eid, c.Color)) parts.push(`color: ${hex(c.Color[eid] ?? 0)}`);
  if (hasComponent(world, eid, c.ColorStop)) {
    const offset = c.ColorStop.offset[eid];
    const color = c.ColorStop.color[eid];
    const opacity = c.ColorStop.opacity[eid];
    if (offset !== undefined) parts.push(`offset: ${offset}`);
    if (color !== undefined) parts.push(`color: ${hex(color)}`);
    if (opacity !== undefined && opacity !== 1) parts.push(`opacity: ${opacity}`);
  }
  if (hasComponent(world, eid, c.StrokeStyle) && c.StrokeStyle.width[eid] !== undefined) {
    parts.push(`width: ${c.StrokeStyle.width[eid]}`);
  }
  if (hasComponent(world, eid, c.KeyframeTrack)) {
    parts.push(`property: ${c.KeyframeTrack.property[eid]}`);
  }
  if (hasComponent(world, eid, c.Keyframe)) {
    parts.push(`time: ${fmtTime(c.Keyframe.time[eid] ?? 0)}`, `value: ${c.Keyframe.value[eid]}`);
    if (c.Keyframe.easing[eid]) parts.push(`easing: ${c.Keyframe.easing[eid]}`);
  }
  if (hasComponent(world, eid, c.Animation)) {
    parts.push(
      `type: ${ANIMATION_TYPE_NAMES[c.Animation.type[eid] ?? 0] ?? c.Animation.type[eid]}`,
      `phase: ${c.Animation.phase[eid] === AnimationPhase.OUT ? "out" : "in"}`,
      `duration: ${fmtTime(c.Animation.duration[eid] ?? 0)}`,
    );
    if (c.Animation.delay[eid]) parts.push(`delay: ${fmtTime(c.Animation.delay[eid])}`);
  }
  if (hasComponent(world, eid, c.TextRange)) {
    parts.push(`range: ${c.TextRange.start[eid] ?? 0}–${c.TextRange.end[eid] ?? "end"}`);
  }
  if (isText(world, eid)) {
    const text = c.Chars[eid] ?? "";
    parts.push(`text: ${text.length > 80 ? `${text.slice(0, 79)}…` : text}`);
  }

  return parts.join("; ");
}

type TreeBucket = keyof Omit<NodeTree, keyof NodeRef | "description">;

// First match wins: masks carry IsMask + Geometry, shadows carry Shadow + Effect.
function childBucket(world: EngineWorld, eid: number): TreeBucket | null {
  const c = world.components;
  if (hasComponent(world, eid, c.IsMask)) return "masks";
  if (isNode(world, eid)) return "children";
  if (hasComponent(world, eid, c.ColorStop)) return "colorStops";
  if (hasComponent(world, eid, c.Paint)) return "paints";
  if (hasComponent(world, eid, c.Stroke)) return "strokes";
  if (hasComponent(world, eid, c.Shadow)) return "shadows";
  if (hasComponent(world, eid, c.Effect)) return "effects";
  if (hasComponent(world, eid, c.TextRange)) return "textRanges";
  if (hasComponent(world, eid, c.KeyframeTrack)) return "keyframeTracks";
  if (hasComponent(world, eid, c.Keyframe)) return "keyframes";
  if (hasComponent(world, eid, c.Animation)) return "animations";
  return null;
}

export function handleNodeTree(engine: Accessor<Engine>) {
  return async ({ id, depth }: { id?: number; depth?: number }): Promise<NodeTree[]> => {
    const { world } = engine();
    const c = world.components;

    // depth caps how many levels of descendants to descend into; the root is
    // level 0, so --depth 1 yields the root plus its immediate children.
    const build = (eid: number, level: number): NodeTree => {
      const node: NodeTree = {
        id: eid,
        name: c.Name[eid] ?? "",
        type: entityType(world, eid),
        description: describeEntity(world, eid),
      };
      if (depth !== undefined && level + 1 > depth) return node;
      for (const cid of query(world, [ChildOf(eid), Not(c.Deleted)])) {
        const bucket = childBucket(world, cid);
        if (bucket === null) continue;
        (node[bucket] ??= []).push(build(cid, level + 1));
      }
      return node;
    };

    if (id === undefined) {
      const roots = [...query(world, [c.Geometry, Not(ChildOf("*")), Not(c.Deleted)])];
      return roots.map((eid) => build(eid, 0));
    }

    return [build(resolveEntityEid(world, id), 0)];
  };
}

export function handleNodeGrep(engine: Accessor<Engine>) {
  return async ({
    pattern,
    ignoreCase,
    id,
    types,
    components,
  }: NodeGrepRequest): Promise<NodeGrepResult[]> => {
    const { world } = engine();
    const c = world.components;
    const re = new RegExp(pattern, ignoreCase ? "i" : "");

    // The corpus: the given entity's subtree, or every live entity.
    const eids =
      id !== undefined
        ? getEntityTree(world, resolveEntityEid(world, id))
        : [...query(world, [c.Geometry, Not(ChildOf("*")), Not(c.Deleted)])].flatMap((root) =>
          getEntityTree(world, root),
        );

    const results: NodeGrepResult[] = [];
    for (const eid of eids) {
      const type = entityType(world, eid);
      if (types !== undefined && types.length > 0 && !types.includes(type)) continue;

      const record = serializeEntity(world, eid);
      const matches: NodeGrepMatch[] = [];
      for (const [component, value] of Object.entries(record)) {
        if (component === "id" || component === "eid") continue;
        if (components !== undefined && components.length > 0 && !components.includes(component)) {
          continue;
        }
        const text = typeof value === "string" ? value : JSON.stringify(value);
        if (re.test(text)) matches.push({ component, value: text });
      }
      if (matches.length > 0) {
        results.push({ id: eid, name: c.Name[eid] ?? "", type, matches });
      }
    }
    return results;
  };
}

// Ceiling on the height a sheet cell renders a node at.
const SHEET_CAPTURE_HEIGHT = 1080;

export function handleNodeCapture(engine: Accessor<Engine>) {
  return async ({ id, frames, combine = true, perSheet }: NodeCaptureRequest): Promise<NodeCaptureResult> => {
    const e = engine();
    const w = e.world;

    const eid = resolveNodeEid(w, id);

    if (!hasComponent(w, eid, w.components.Playback)) {
      const scene = getSceneAncestor(w, eid);
      const hint = scene !== null ? ` Capture its scene (id ${scene}) instead.` : "";
      throw new Error(
        `Node ${id} has no timeline clock and cannot be captured on its own.${hint}`,
      );
    }

    // `undefined` means the node's first visible frame (the encoder's frame 0).
    let shots = frames;
    if (shots === undefined || shots.length === 0) {
      shots = [0];
    }

    const encoder = await createImageEncoder(w, {
      eid,
      frames: shots,
      resolution: 720,
    });

    // Sheets render at their cell size instead of the flat 720p: with a few
    // frames that is sharper than a standalone capture, never coarser. A node
    // is drawn, not decoded, so a small one is worth rendering past its own
    // bounds; beyond SHEET_CAPTURE_HEIGHT that only costs tokens.
    const aspect = encoder.bounds.width / encoder.bounds.height;
    const height = Math.max(encoder.bounds.height, SHEET_CAPTURE_HEIGHT);
    const sizes = combine ? planSheetSizes(shots.length, perSheet) : [];
    const plans = sizes.map((n) => planSheet(n, { width: height * aspect, height }));
    if (combine) {
      encoder.resize(Math.max(...plans.map((plan) => plan.cellHeight)));
    }

    const result = await encoder.render();

    if (result.type === "canceled") throw new Error("Capture canceled");
    if (result.type === "error") throw result.error;

    if (!combine) return result.data;

    const sheets: TimecodedImage[] = [];
    let offset = 0;
    for (const [sheet, size] of sizes.entries()) {
      const group = result.data.slice(offset, offset + size);
      const cells = group.map(({ timecode }, k) => ({ at: shots[offset + k], timecode }));
      offset += size;
      const images = await Promise.all(group.map((image) => decodePngBase64(image.base64)));
      sheets.push({
        timecode: sheetTimecode(cells),
        base64: composeSheet(
          images.map((image, k) => ({ image, label: group[k].timecode })),
          plans[sheet],
        ),
      });
      for (const image of images) image.close();
    }
    return sheets;
  };
}

export function handleNodeRender(engine: Accessor<Engine>, signal?: AbortSignal) {
  return async ({ id, output, config }: NodeRenderRequest): Promise<NodeRenderResult> => {
    const e = engine();
    const w = e.world;

    const sceneEid = id ?? w.selection.scene;
    if (sceneEid === null || sceneEid === undefined) {
      throw new Error("No active scene. Provide a scene id, or open a scene first.");
    }
    if (!entityExists(w, sceneEid) || !isScene(w, sceneEid)) {
      throw new Error(`Node ${sceneEid} is not a scene.`);
    }

    const target = new ElectronWritableFileHandle(output);
    const result = await renderScene(e, {
      scene: sceneEid,
      target,
      config: config as Partial<EncoderConfig>,
      signal,
    });

    if (result.type !== "success") {
      // Clean up the partial file on cancel / error.
      await target.dispose().catch(() => { });
      if (result.type === "canceled") throw new Error("Export canceled");
      throw new Error(result.error.message || "Export failed");
    }

    return { path: output };
  };
}

export function handleNodeDelete(engine: Accessor<Engine>) {
  return async ({ ids }: { ids: number[] }): Promise<NodeDeleteResult[]> => {
    const { world } = engine();
    const eids = ids.map((id) => resolveEntityEid(world, id));

    world.history.transaction("deleting nodes", () => {
      for (const eid of eids) {
        deleteEntity(world, eid);
      }
    });

    return ids.map((id) => ({ id }));
  };
}

export function handleNodeDuplicate(engine: Accessor<Engine>) {
  return async ({ ids }: { ids: number[] }): Promise<NodeDuplicateResult[]> => {
    const { world } = engine();
    const resolved = ids.map((id) => ({
      id,
      tree: getEntityTree(world, resolveNodeEid(world, id)),
    }));

    const newRootEids = new Map<number, number>();
    world.history.transaction("duplicating nodes", () => {
      for (const { id, tree } of resolved) {
        newRootEids.set(id, cloneSubtree(world, tree).get(id)!);
      }
    });

    return ids.map((id) => ({ sourceId: id, newId: newRootEids.get(id)! }));
  };
}

export function handleNodePatch(engine: Accessor<Engine>) {
  return async ({ patches }: { patches: NodePatch[] }): Promise<NodePatchResult[]> => {
    const e = engine();
    const world = e.world;

    // Entity ids are validated upfront; a failing patch still aborts the
    // batch mid-way, leaving earlier patches applied (and its own props
    // rolled back).
    for (const patch of patches) {
      resolveEntityEid(world, patch.id);
    }

    const results: NodePatchResult[] = [];
    for (const patch of patches) {
      const doc = new WorldDocument(e.world, { engine: e });

      try {
        world.history.startTransaction("patching node");
        try {
          const node = doc.element(resolveEntityEid(world, patch.id));
          for (const [key, value] of Object.entries(patch)) {
            if (key === "id") continue;
            doc.setProperty(node, key, value);
          }
          world.history.commitTransaction();
        } catch (error) {
          world.history.rollbackTransaction();
          throw error;
        }

        // `src` mounts asynchronously; a failed mount rejects this patch, but
        // its synchronous props are committed at this point regardless.
        world.history.startTransaction("Commit document");
        try {
          await doc.commit();
        } finally {
          world.history.commitTransaction();
        }
      } catch (error) {
        throw new Error(`Entity ${patch.id}: ${(error as Error).message}`);
      }

      results.push({ id: patch.id });
    }

    return results;
  };
}
