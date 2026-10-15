/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { hasComponent, query, Not } from "bitecs";
import { getAssetSpec, isAssetRef, parseTime } from "@diffusionstudio/jsx";
import * as solid from "solid-js";
import * as solidStore from "solid-js/store";
import { SVGElements } from "solid-js/web";
import * as diffusionJsx from "@diffusionstudio/jsx";
import {
  AnimationPhase,
  AnimationType,
  CaptionAlign,
  CaptionType,
  FontStyle,
  GeometryType,
  PaintType,
  ScaleMode,
  TextAlign,
  TextBaseline,
  TransitionType,
  addComponent,
  appendChild,
  computeAudioSyncOffsetCached,
  createEntity,
  deleteEntity,
  findAssetDuration,
  findGeometryAsset,
  getAssetFile,
  getEntityTree,
  getNextName,
  getParentEntity,
  getSceneAncestor,
  hasAudioSources,
  removeChild,
  removeComponent,
  resizeEntity,
  setComponent,
  setKeyframeTrack,
  transcribeScene,
  transcriptTrim,
} from "@/components/engine";
import { HtmlHost, isHtmlInCanvasSupported } from "@/components/engine/decoders/html";
import { SurfaceHost } from "@/components/engine/decoders/surface";
import { resolveTranscript } from "@/components/engine/decoders/caption/utils";
import { ChildOf } from "@/components/engine/components";
import { ASPECT_RATIO_DIMENSIONS, findEmptyPlacement } from "@/utils/genai";
import { resolveAsset, resolveGeneratedAsset } from "@/utils/jsx-generation";
import { assert, assertAllSettled, parseColor } from "@/utils";

import type { AssetInput, AssetRef, AssetSpecInput, ProjectDocument, ProjectTick } from "@diffusionstudio/jsx";
import type { AABB, Engine, EngineWorld, MountData } from "@/components/engine";
import type { GenerationMemo } from "@/utils/jsx-generation";

export class EntityNode {
  public constructor(public readonly eid: number) { }
}

/**
 * The renderer's host node: an entity handle, or a DOM node for <HtmlPaint>
 * content — the ECS world and the DOM are the scene graph, with no shadow
 * tree in between. A tag's case decides which side a node lands on at
 * creation (PascalCase composition elements mint entities, lowercase tags
 * mint DOM nodes), so `setProperty` always has a live target. Project files
 * author camelCase tags; the CLI compile canonicalizes them to the PascalCase
 * components (SVG ancestry keeps the shared rect/text/image names DOM-side),
 * so the case split holds by the time tags reach this document.
 */
type HostNode = EntityNode | Element | Text;

const STAGE = new EntityNode(-1);

/**
 * Reads a timing prop as local frames. The record always holds raw `Time`
 * values (numbers are seconds), so every read parses; an unparsable value
 * reads as absent until its own apply rejects it.
 */
function timingProp(props: Record<string, unknown> | undefined, name: "start" | "end" | "sourceIn" | "sourceOut"): number | undefined {
  const value = props?.[name];
  return value === undefined ? undefined : parseFrames(String(value), 30);
}

const SVG_NS = "http://www.w3.org/2000/svg";

// `src` values an html `<img>` carries straight to the browser; anything else
// is a composition source the host has to resolve first.
const DIRECT_SRC_RE = /^(?:data|blob):/i;

// Multiple new scenes are laid side by side in render order.
const PLACEMENT_GAP = 40;

const SCALE_MODE_MAP = {
  cover: ScaleMode.COVER,
  contain: ScaleMode.FIT,
  fill: ScaleMode.FILL,
} as const;

const FONT_STYLE_MAP = {
  normal: FontStyle.NORMAL,
  italic: FontStyle.ITALIC,
  oblique: FontStyle.OBLIQUE,
} as const;

const TEXT_ALIGN_MAP = {
  left: TextAlign.LEFT,
  center: TextAlign.CENTER,
  right: TextAlign.RIGHT,
} as const;

const TEXT_BASELINE_MAP = {
  top: TextBaseline.TOP,
  middle: TextBaseline.MIDDLE,
  bottom: TextBaseline.BOTTOM,
} as const;

// Named easing presets, expanded to the descriptors the interpolation
// inspector writes so JSX-authored keyframes match hand-edited ones.
const EASING_PRESET_MAP: Record<string, string> = {
  linear: "",
  easeIn: "cubicBezier(0.42,0,1,1)",
  easeOut: "cubicBezier(0,0,0.58,1)",
  easeInOut: "cubicBezier(0.42,0,0.58,1)",
  gentle: "spring(0.5,628)",
  snappy: "spring(0.15,300)",
  bouncy: "spring(0.4,500)",
  strong: "spring(0.65,400)",
};

function parseEasing(value: unknown): string {
  assert(typeof value === "string", "keyframe `easing` must be a string" + `, value: ${value}`);
  const preset = EASING_PRESET_MAP[value];
  if (preset !== undefined) return preset;

  const valid =
    /^cubicBezier\(-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+\)$/.test(value) ||
    /^spring\(-?[\d.]+,-?[\d.]+\)$/.test(value) ||
    /^steps\(\d+(,(true|false))?\)$/.test(value);
  assert(valid, `invalid keyframe easing: "${value}"`);
  return value;
}

/**
 * Parses a keyframe-list prop value: times to local frames (0 = the node's
 * in point), values through `convert` into the property's authored unit,
 * easings through the preset map. Returns the list sorted by time — callers
 * land `[0].value` as the authored value and hand the list to
 * `setKeyframeTrack`.
 */
function parseKeyframes(
  name: string,
  entries: unknown[],
  convert: (value: unknown) => number,
): { time: number; value: number; easing: string }[] {
  assert(entries.length > 0, `\`${name}\` keyframe list must not be empty`);

  const frames = new Set<number>();
  const keyframes = entries.map((entry) => {
    assert(
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
      `\`${name}\` keyframes must be { time, value, easing? } objects`,
    );
    const { time, value, easing } = entry as Record<string, unknown>;
    const frame = parseFrames(String(time), 30);
    assert(typeof frame === "number", `\`${name}\` keyframe \`time\` must be a time value` + `, value: ${time}`);
    assert(!frames.has(frame), `\`${name}\` has two keyframes at frame ${frame}`);
    frames.add(frame);
    return {
      time: frame,
      value: convert(value),
      easing: easing === undefined ? "" : parseEasing(easing),
    };
  });

  return keyframes.sort((a, b) => a.time - b.time);
}

const TRANSITION_TYPE_MAP = {
  dissolve: TransitionType.DISSOLVE,
  slideFromRight: TransitionType.SLIDE_FROM_RIGHT,
  slideFromLeft: TransitionType.SLIDE_FROM_LEFT,
  fadeToBlack: TransitionType.FADE_TO_BLACK,
  fadeToWhite: TransitionType.FADE_TO_WHITE,
} as const;

// 1 second at the canonical 30 fps — the transition inspector's default.
const TRANSITION_DEFAULT_DURATION = 30;

function parseTransitionType(value: unknown): number {
  assert(typeof value === "string", "transition `type` must be a string" + `, value: ${value}`);
  const type = TRANSITION_TYPE_MAP[value as keyof typeof TRANSITION_TYPE_MAP];
  assert(type !== undefined, `invalid transition type: "${value}"`);
  return type;
}

function parseTransitionDuration(value: unknown): number {
  const frames = parseFrames(String(value), 30);
  assert(typeof frames === "number", "transition `duration` must be a time value" + `, value: ${value}`);
  assert(frames > 0, "transition `duration` must be > 0");
  return frames;
}

// JSX animation names, mapped to the presets the animations inspector writes.
// Exported for `node tree`'s entity descriptions.
export const ANIMATION_TYPE_MAP = {
  fade: AnimationType.FADE,
  gain: AnimationType.GAIN,
  grow: AnimationType.GROW,
  shrink: AnimationType.SHRINK,
  blur: AnimationType.BLUR,
  slideLeft: AnimationType.SLIDE_LEFT,
  slideRight: AnimationType.SLIDE_RIGHT,
  slideUp: AnimationType.SLIDE_UP,
  slideDown: AnimationType.SLIDE_DOWN,
  spin: AnimationType.SPIN,
  twist: AnimationType.TWIST,
  appearWord: AnimationType.APPEAR_WORD,
  appearChar: AnimationType.APPEAR_CHAR,
  scramble: AnimationType.SCRAMBLE,
} as const;

const TEXT_ANIMATION_TYPES: ReadonlySet<AnimationType> = new Set([
  AnimationType.APPEAR_WORD,
  AnimationType.APPEAR_CHAR,
  AnimationType.SCRAMBLE,
]);

// 1 second at the canonical 30 fps — the animations inspector's default.
const ANIMATION_DEFAULT_DURATION = 30;

function parseAnimationSpec(
  entry: unknown,
  isTextNode: boolean,
): { type: AnimationType; phase: AnimationPhase; duration: number; delay: number } {
  assert(
    typeof entry === "object" && entry !== null && !Array.isArray(entry),
    "`animations` entries must be { type, phase?, duration?, delay? } objects" + `, value: ${entry}`,
  );
  const { type, phase, duration, delay } = entry as Record<string, unknown>;

  assert(typeof type === "string", "animation `type` must be a string" + `, value: ${type}`);
  const parsedType = ANIMATION_TYPE_MAP[type as keyof typeof ANIMATION_TYPE_MAP];
  assert(parsedType !== undefined, `invalid animation type: "${type}"`);
  assert(
    isTextNode || !TEXT_ANIMATION_TYPES.has(parsedType),
    `animation type "${type}" only applies to text elements`,
  );

  let parsedPhase = AnimationPhase.IN;
  if (phase !== undefined) {
    assert(phase === "in" || phase === "out", 'animation `phase` must be "in" or "out"' + `, value: ${phase}`);
    if (phase === "out") parsedPhase = AnimationPhase.OUT;
  }

  let parsedDuration = ANIMATION_DEFAULT_DURATION;
  if (duration !== undefined) {
    const frames = parseFrames(String(duration), 30);
    assert(typeof frames === "number", "animation `duration` must be a time value" + `, value: ${duration}`);
    assert(frames > 0, "animation `duration` must be > 0");
    parsedDuration = frames;
  }

  let parsedDelay = 0;
  if (delay !== undefined) {
    const frames = parseFrames(String(delay), 30);
    assert(typeof frames === "number", "animation `delay` must be a time value" + `, value: ${delay}`);
    assert(frames >= 0, "animation `delay` must be >= 0");
    parsedDelay = frames;
  }

  return { type: parsedType, phase: parsedPhase, duration: parsedDuration, delay: parsedDelay };
}

const CAPTION_PRESET_MAP = {
  classic: CaptionType.CLASSIC,
  cascade: CaptionType.CASCADE,
  spotlight: CaptionType.SPOTLIGHT,
  whisper: CaptionType.WHISPER,
  paper: CaptionType.PAPER,
  guinea: CaptionType.GUINEA,
  stark: CaptionType.STARK,
} as const;

export const CAPTION_ALIGN_MAP = {
  top: CaptionAlign.TOP,
  center: CaptionAlign.CENTER,
  bottom: CaptionAlign.BOTTOM,
} as const;

type GenaiQueueItem = {
  eid: number;
  ref?: AssetRef;
  targetKey?: string;
  type: "asset" | "caption" | "sync";
};

/** 
 * A surface awaiting its box size (and ref) until its subtree connects.
 */
type PendingSurface = {
  eid: number;
  host: SurfaceHost;
  paint: boolean;
  ref?: (target: unknown) => void;
};

type PendingHtmlHost = {
  eid: number;
  host: HtmlHost;
  paint: boolean;
};

export interface WorldDocumentOptions {
  /** Mount into an existing parent entity (e.g. `dapi node insert`). */
  parentEid?: number;
  /** Only needed for `commit()`'s captioning phase (`author` mode). */
  engine?: Engine;
  /**
   * `author` (default) mints entities and defines structure — an explicit
   * `dapi mount`. `adopt` binds the re-run to already-persisted entities by
   * their `MountPath`, rebuilding runtime hosts without re-authoring structure
   * (restore, export, capture).
   */
  mode?: "author" | "adopt";
  /** Identity shared by every entity of this mount (author stamps, adopt matches). */
  mountId?: string;
  /** SCRIPT asset holding the compiled module, stamped onto the mount root. */
  scriptAssetId?: string;
  /** `adopt` mode: creation ordinal (`MountPath.path`) -> existing entity id, built from the world. */
  adoptIndex?: Map<string, number>;
}

export class WorldDocument implements ProjectDocument<HostNode> {
  public promises: Promise<void>[] = [];
  public stage: HostNode = STAGE;
  public roots: HostNode[] = [];
  public rootEid: number | null = null;
  public world: EngineWorld;
  public engine?: Engine;

  private readonly mode: "author" | "adopt";
  private readonly stageEid?: number;
  private readonly mountId?: string;
  private readonly scriptAssetId?: string;
  private readonly adoptIndex?: Map<string, number>;

  // Runtime hosts this render created. Offline (export/capture) worlds are
  // discarded without an entity-delete pass, so their hosts (an HtmlHost
  // appends a canvas to document.body) must be freed explicitly on dispose.
  private createdHosts: { dispose(): void }[] = [];

  private queue: GenaiQueueItem[] = [];

  // Entities mint in module-execution order; the ordinal is each element's
  // persisted identity (`MountPath.path`). A re-run of the same module mints
  // in the same order, which is what lets adopt bind in `createElement`.
  private nextOrdinal = 0;

  // Surfaces whose box size (and so ref) can only resolve once their
  // ancestor chain exists — flushed when the subtree connects to the stage.
  private pendingSurfaces: PendingSurface[] = [];

  // Html hosts awaiting their initial box size, resolved once the ancestor
  // chain exists — flushed alongside surfaces when the subtree connects.
  private pendingHtmlHosts: PendingHtmlHost[] = [];

  // Entities this render minted or adopted — exactly the renderer's element
  // nodes. Traversal filters ECS children through this set so internal
  // sub-entities (a <Text>'s paint) and hand-added children stay invisible
  // to Solid's reconciler, which deletes whatever it can see but no longer
  // tracks.
  private managed = new Set<number>();

  // Adopted entities keep their persisted (possibly hand-edited) values
  // through the initial adopt render; only post-commit effects write.
  private adopted = new Set<number>();

  // World-space boxes of the new roots this mount has already placed. A fresh
  // root has no computed layout yet, so `findEmptyPlacement` cannot see it in
  // the world; recording each placement here keeps sibling roots from stacking.
  private placedRootBoxes: AABB[] = [];

  // Entities this render soft-deleted via removeNode. Solid's reconciler
  // shuffles by removing and re-inserting nodes, so re-attaching one of
  // these resurrects it — but only these: an entity deleted from outside
  // (keyed replace, user delete) must stay dead even if a stale reconcile
  // still references it.
  private removed = new Set<number>();

  // DOM containers back to their owning entity, as Solid knows it: an html
  // host element maps to the element Solid inserts DOM content under, a text
  // fragment to its <Text> entity.
  private nodeOwner = new WeakMap<Node, number>();

  // Html host per element the renderer inserts DOM content under (the
  // wrapper for <Html>, the paint entity for <HtmlPaint>).
  private htmlHosts = new Map<number, HtmlHost>();

  // Object URLs minted for host-resolved <img> sources: a reactive `src` swap
  // frees the one its element held, and teardown frees whatever is left.
  private objectUrls = new Map<HTMLImageElement, string>();

  // Per-element request counter, so a slow resolution that a newer `src` has
  // already superseded doesn't land on top of it.
  private imageEpochs = new WeakMap<HTMLImageElement, number>();

  // One stable handle per entity: Solid's reconciliation compares host nodes
  // by object identity, so traversal must return the same instance that
  // `createElement` handed out.
  private entityNodes = new Map<number, EntityNode>();

  /** The entity's stable renderer handle, created on first touch. */
  private entity(eid: number): EntityNode {
    let node = this.entityNodes.get(eid);
    if (node === undefined) {
      node = new EntityNode(eid);
      this.entityNodes.set(eid, node);
    }
    return node;
  }

  /** The entity's runtime renderer state, created on first touch. */
  private data(eid: number): MountData {
    const c = this.world.components;
    if (!hasComponent(this.world, eid, c.Data)) {
      addComponent(this.world, eid, c.Data, false);
      c.Data[eid] = { props: {} };
    }
    return c.Data[eid]!;
  }

  /** The entity's recorded raw props, if any were recorded. */
  private props(eid: number): Record<string, unknown> | undefined {
    const c = this.world.components;
    return hasComponent(this.world, eid, c.Data) ? c.Data[eid]?.props : undefined;
  }

  private trackHost<T extends { dispose(): void }>(host: T): T {
    this.createdHosts.push(host);
    return host;
  }

  /** Frees the runtime hosts this render created (paired with the graph dispose). */
  public disposeHosts(): void {
    for (const host of this.createdHosts) host.dispose();
    this.createdHosts.length = 0;
    for (const url of this.objectUrls.values()) URL.revokeObjectURL(url);
    this.objectUrls.clear();
  }

  // Set once `commit()` finishes. A mount keeps its reactive graph running
  // past commit, so later writes flow through the same paths, untracked;
  // otherwise the undo stack would fill with one entry per reactive update.
  private committed = false;

  private track<T>(fn: () => T): T {
    if (!this.committed) return fn();
    let result!: T;
    this.world.history.untrack(() => {
      result = fn();
    });
    return result;
  }

  public constructor(world: EngineWorld, options: WorldDocumentOptions = {}) {
    this.world = world;
    this.engine = options.engine;
    this.stageEid = options.parentEid;
    this.mode = options.mode ?? "author";
    this.mountId = options.mountId;
    this.scriptAssetId = options.scriptAssetId;
    this.adoptIndex = options.adoptIndex;
  }

  /**
   * Waits for the rendering to complete and then handles the genai queue.
   */
  public async commit(): Promise<void> {
    const world = this.world;
    const c = world.components;

    // Wait for assets to settle
    {
      const results = await Promise.allSettled(this.promises);
      assertAllSettled(results);
    }

    // Handle generative queue
    {
      const memo: GenerationMemo = new Map();

      const results = await Promise.allSettled(this.queue.map(({ eid, ref, type }) => {
        if (type !== "asset" || !ref) return;
        return this.generateInto(eid, ref, memo);
      }));

      assertAllSettled(results);
    }

    // Handle sync queue: after generated assets have landed (either side may
    // be generated), before captions read the scene's final placement.
    {
      for (const { eid: nodeEid, targetKey, type } of this.queue) {
        if (type !== "sync" || !targetKey || hasComponent(world, nodeEid, c.Deleted)) continue;
        const targetEid = query(world, [c.Key, Not(c.Deleted)]).find(eid => c.Key[eid] === targetKey);

        assert(targetEid !== undefined, `syncTo: no other element carries key "${targetKey}"`);

        const source = findGeometryAsset(world, nodeEid);
        assert(
          source !== null && (source.type === "AUDIO" || source.type === "VIDEO"),
          `syncTo: node ${nodeEid} has no audio or video source to align`,
        );
        const targetSource = findGeometryAsset(world, targetEid);
        assert(
          targetSource !== null && (targetSource.type === "AUDIO" || targetSource.type === "VIDEO"),
          `syncTo: target "${targetKey}" has no audio or video source to align against`,
        );

        const { offsetSeconds } = await computeAudioSyncOffsetCached(source, targetSource);

        const offsetFrames = Math.round(offsetSeconds * world.frameRate);
        const parentEid = getParentEntity(world, nodeEid);
        const parentDelay = parentEid !== null ? (c.Computed.delay[parentEid] ?? 0) : 0;
        const delay = (c.Computed.delay[targetEid] ?? 0) + offsetFrames - parentDelay;

        setComponent(world, nodeEid, c.Delay, delay);

        const targetStart = (c.Computed.start[targetEid] ?? 0) - parentDelay;
        const targetEnd = (c.Computed.end[targetEid] ?? 0) - parentDelay;
        const duration = findAssetDuration(world, nodeEid);

        // `sourceIn`/`sourceOut` are source-relative; default to the overlap
        // with the target window. `end` (timeline) converts through `delay`.
        const props = this.data(nodeEid).props;
        const end = timingProp(props, "end");
        const trimStart = timingProp(props, "sourceIn") ?? Math.max(0, targetStart - delay);
        const trimEnd = timingProp(props, "sourceOut")
          ?? (end !== undefined
            ? end - delay
            : (duration !== null ? Math.min(duration, targetEnd - delay) : targetEnd - delay));
        assert(trimEnd > trimStart, `syncTo: the aligned clip does not overlap the window of "${targetKey}"`);
        setComponent(world, nodeEid, c.Trim, { start: trimStart, end: trimEnd });
        props.sourceIn = `${trimStart}f`;
        props.sourceOut = `${trimEnd}f`;
        delete props.end;
        props.start = `${delay + trimStart}f`;
      }
    }

    // Handle captioning queue
    {
      for (const { eid: nodeEid, type } of this.queue) {
        if (hasComponent(world, nodeEid, c.Deleted) || type !== "caption") continue;

        const props = this.data(nodeEid).props;
        const seed = props.seed as number | undefined;
        if (c.AssetId[nodeEid] && (seed === undefined || props.src !== undefined)) continue;

        const sceneEid = getSceneAncestor(world, nodeEid);
        if (!sceneEid || !hasAudioSources(world, sceneEid)) continue;

        assert(this.engine, "captioning requires an engine (author-mode mount)");
        const { asset, trim } = await transcribeScene(this.engine, sceneEid, undefined, seed);
        setComponent(world, nodeEid, c.AssetId, asset.id);

        const hasIn = timingProp(props, "sourceIn") !== undefined;
        const hasOut = timingProp(props, "sourceOut") !== undefined || timingProp(props, "end") !== undefined;
        setComponent(world, nodeEid, c.Trim, {
          start: hasIn ? c.Trim.start[nodeEid] : trim.start,
          end: hasOut ? c.Trim.end[nodeEid] : trim.end,
        });
      }
    }

    this.queue.length = 0;
    this.committed = true;
  }

  private ticker = solid.createSignal<ProjectTick>(
    { time: 0, frame: 0, delta: 0, playing: false },
    { equals: (a, b) => a.time === b.time && a.frame === b.frame && a.delta === b.delta && a.playing === b.playing },
  );
  private lastTickTime: number | null = null;

  public tick(): ProjectTick {
    return this.ticker[0]();
  }

  /**
   * Backs `useFile`: resolves a source (path, URL, asset id, or `AssetRef`) to
   * its `File`, the same input `src` accepts. A `generate.*` ref generates on
   * demand (content-cached in the library, so it collapses with the mount's own
   * generation of the same spec).
   */
  public loadFile(input: AssetInput): Promise<File> {
    const promise = (async () => {
      const asset = isAssetRef(input)
        ? await resolveGeneratedAsset(this.world, input, new Map())
        : await resolveAsset(this.world, input);
      return await asset.handle.getFile();
    })();

    // Let commit() await the initial resolution so the first exported/captured
    // frame reflects a `useFile`-driven draw rather than rendering before the
    // file lands. Post-commit refetches update reactively and aren't tracked.
    if (!this.committed) {
      this.promises.push(promise.then(() => undefined, () => undefined));
    }

    return promise;
  }

  /**
   * Reads the playhead of the nearest Playback-carrying ancestor of the
   * mount's root (the root itself for a mounted scene) into the ticker
   * signal. Called by the playback system once per tick.
   */
  public advanceTicker(): void {
    const c = this.world.components;
    const sid = this.playbackRoot();
    const time = sid !== null ? (c.Computed.localTimeInSeconds[sid] ?? 0) : 0;
    const delta = this.lastTickTime === null ? 0 : time - this.lastTickTime;
    this.lastTickTime = time;
    this.ticker[1]({
      time,
      frame: sid !== null ? (c.Computed.localTime[sid] ?? 0) : 0,
      delta,
      playing: sid !== null && c.Playback.playing[sid] === 1,
    });
  }

  private playbackRoot(): number | null {
    // Resolved per tick rather than cached: the root lands after component
    // bodies run (so it is null during the first render), and reparenting or
    // keyed replacement can change the answer later.

    const world = this.world;
    const c = world.components;
    let current = this.rootEid ?? this.stageEid ?? null;
    while (current !== null && !hasComponent(world, current, c.Deleted)) {
      if (hasComponent(world, current, c.Playback)) return current;
      current = getParentEntity(world, current);
    }
    return null;
  }

  /**
   * Resolves a generated asset and attaches it: during commit via the genai
   * queue, or immediately when a live mount sets an asset ref after commit.
   */
  private async generateInto(eid: number, ref: AssetRef, memo: GenerationMemo): Promise<void> {
    const world = this.world;
    const c = world.components;
    if (hasComponent(world, eid, c.Deleted)) return;
    try {
      const asset = await resolveGeneratedAsset(world, ref, memo);
      await this.mountSource(eid, asset.id);
    } finally {
      world.history.untrack(() => removeComponent(world, eid, c.Generating));
    }
  }

  public createElement(tag: string): HostNode {
    // When the tag starts with a lowercase letter, it's a DOM vocabulary
    if (tag[0] === tag[0].toLowerCase()) {
      // Media doesn't play under a paint host — playback and the timeline
      // belong to the composition elements.
      assert(
        tag !== "audio" && tag !== "video",
        `<${tag}> is not supported as html content; media plays through the <${tag}> composition element outside the html subtree`,
      );
      return SVGElements.has(tag)
        ? document.createElementNS(SVG_NS, tag)
        : document.createElement(tag);
    }
    return this.entity(this.track(() => this.bindEntity(tag)));
  }

  /**
   * Binds a composition element to its entity: adopt mode looks up the
   * persisted entity minted at the same creation ordinal, author mode creates
   * one and stamps the ordinal as its `MountPath`. New elements an adopted
   * mount's effects create later (no persisted counterpart) author as usual.
   */
  private bindEntity(tag: string): number {
    const path = String(this.nextOrdinal++);
    const adoptedEid = this.mode === "adopt" ? this.adoptIndex?.get(path) : undefined;

    let eid: number;
    if (adoptedEid !== undefined) {
      eid = adoptedEid;
      this.adopted.add(eid);
      this.reattachRuntimeHostsForTag(tag, eid);
    } else {
      eid = this.createEntityForTag(tag);
      if (this.mountId !== undefined) {
        setComponent(this.world, eid, this.world.components.MountPath, { mountId: this.mountId, path });
      }
    }

    this.managed.add(eid);
    return eid;
  }

  public createTextNode(text: string): HostNode {
    return document.createTextNode(text);
  }

  /** Tag-specific entity setup for a composition element. */
  private createEntityForTag(tag: string): number {
    const world = this.world;
    const c = world.components;
    const eid = createEntity(world);

    switch (tag) {
      case "Group": {
        setComponent(world, eid, c.Geometry, GeometryType.RECT);
        addComponent(world, eid, c.Group);
        setComponent(world, eid, c.Name, getNextName(world, "Group"));
        break;
      } case "Rect": {
        setComponent(world, eid, c.Geometry, GeometryType.RECT);
        setComponent(world, eid, c.Name, getNextName(world, "Rect"));
        break;
      } case "Sequence": {
        addComponent(world, eid, c.Group);
        addComponent(world, eid, c.Sequential);
        setComponent(world, eid, c.Name, getNextName(world, "Sequence"));
        break;
      } case "Video": {
        setComponent(world, eid, c.Geometry, GeometryType.RECT);
        setComponent(world, eid, c.Name, getNextName(world, "Video"));
        break;
      } case "Image": {
        setComponent(world, eid, c.Geometry, GeometryType.RECT);
        setComponent(world, eid, c.Name, getNextName(world, "Image"));
        break;
      } case "Audio": {
        addComponent(world, eid, c.Audio);
        setComponent(world, eid, c.Geometry, GeometryType.RECT);
        setComponent(world, eid, c.Name, getNextName(world, "Audio"));
        break;
      } case "Text": {
        setComponent(world, eid, c.Geometry, GeometryType.TEXT);
        const fid = createEntity(world);
        setComponent(world, fid, c.Paint, PaintType.SOLID);
        setComponent(world, fid, c.Color, 0xffffff);
        appendChild(world, fid, eid);
        break;
      } case "Captions": {
        assert(!this.committed, "<Captions> cannot be created after commit; re-mount instead");
        setComponent(world, eid, c.Geometry, GeometryType.TEXT);
        setComponent(world, eid, c.Caption, {});
        setComponent(world, eid, c.Name, getNextName(world, "Captions"));
        this.queue.push({ eid, type: "caption" });
        break;
      } case "SolidPaint": {
        setComponent(world, eid, c.Paint, PaintType.SOLID);
        setComponent(world, eid, c.Color, 0xE0E0E0);
        break;
      } case "LinearGradientPaint": {
        setComponent(world, eid, c.Paint, PaintType.LINEAR_GRADIENT);
        break;
      } case "RadialGradientPaint": {
        setComponent(world, eid, c.Paint, PaintType.RADIAL_GRADIENT);
        break;
      } case "ColorStop": {
        setComponent(world, eid, c.ColorStop, {});
        break;
      } case "HtmlPaint": {
        assert(
          isHtmlInCanvasSupported(),
          "<HtmlPaint> requires the html-in-canvas API; enable chrome://flags/#canvas-draw-element",
        );
        setComponent(world, eid, c.Paint, PaintType.HTML);
        const host = this.trackHost(new HtmlHost());
        addComponent(world, eid, c.HtmlHost, false);
        c.HtmlHost[eid] = host;
        this.registerHtmlHost(eid, host, true);
        break;
      } case "Html": {
        // A rect carrying an html paint; the element's children are the
        // paint's DOM content, so the wrapper routes to the paint's host.
        assert(
          isHtmlInCanvasSupported(),
          "<Html> requires the html-in-canvas API; enable chrome://flags/#canvas-draw-element",
        );
        setComponent(world, eid, c.Geometry, GeometryType.RECT);
        setComponent(world, eid, c.Name, getNextName(world, "HTML"));
        const fid = createEntity(world);
        setComponent(world, fid, c.Paint, PaintType.HTML);
        const host = this.trackHost(new HtmlHost());
        addComponent(world, fid, c.HtmlHost, false);
        c.HtmlHost[fid] = host;
        appendChild(world, fid, eid);
        this.registerHtmlHost(eid, host, false);
        break;
      } case "ShaderPaint": {
        setComponent(world, eid, c.Paint, PaintType.SHADER);
        break;
      } case "SurfacePaint": {
        setComponent(world, eid, c.Paint, PaintType.SURFACE);
        const host = this.trackHost(new SurfaceHost());
        addComponent(world, eid, c.SurfaceHost, false);
        c.SurfaceHost[eid] = host;
        this.pendingSurfaces.push({ eid, host, paint: true });
        break;
      } case "Surface": {
        // A rect carrying a surface paint; the element's ref receives the
        // paint's backing canvas.
        setComponent(world, eid, c.Geometry, GeometryType.RECT);
        setComponent(world, eid, c.Name, getNextName(world, "Surface"));
        const fid = createEntity(world);
        setComponent(world, fid, c.Paint, PaintType.SURFACE);
        const host = this.trackHost(new SurfaceHost());
        addComponent(world, fid, c.SurfaceHost, false);
        c.SurfaceHost[fid] = host;
        appendChild(world, fid, eid);
        this.pendingSurfaces.push({ eid, host, paint: false });
        break;
      } default: {
        assert(false, `<${tag}> is not a composition element`);
      }
    }

    return eid;
  }

  /**
   * Wraps an existing entity so props can be applied to it through the same
   * `setProperty` path a fresh render uses (e.g. `dapi node patch`). Timing
   * state is hydrated from the entity's components so a partial patch (say,
   * only `sourceIn`) composes with its existing delay/trim like a full render.
   */
  public element(eid: number): EntityNode {
    const world = this.world;
    const c = world.components;
    const props = this.data(eid).props;
    // Reset the timing record from the entity's components — they are the
    // source of truth (hand-edits bypass any props a live mount recorded).
    delete props.start;
    delete props.end;
    delete props.sourceIn;
    delete props.sourceOut;
    const delay = hasComponent(world, eid, c.Delay) ? c.Delay[eid] : 0;
    if (hasComponent(world, eid, c.Trim)) {
      const start = c.Trim.start[eid];
      const end = c.Trim.end[eid];
      if (start !== undefined) {
        props.sourceIn = `${start}f`;
      }
      if (end !== undefined) {
        props.sourceOut = `${end}f`;
      }
    }
    // start = timeline placement of source-0 (Delay) shifted by the source in point.
    if (hasComponent(world, eid, c.Delay) || props.sourceIn !== undefined) {
      props.start = `${delay + (timingProp(props, "sourceIn") ?? 0)}f`;
    }
    return this.entity(eid);
  }

  private reconcileTiming(eid: number) {
    const world = this.world;
    const c = world.components;
    const props = this.props(eid);
    const sourceIn = timingProp(props, "sourceIn") ?? 0;
    const start = timingProp(props, "start") ?? 0;
    const end = timingProp(props, "end");
    const sourceOut = timingProp(props, "sourceOut");
    const delay = start - sourceIn;
    setComponent(world, eid, c.Delay, delay);

    if (timingProp(props, "sourceIn") !== undefined) {
      setComponent(world, eid, c.Trim, { start: sourceIn });
    }
    if (sourceOut !== undefined) {
      setComponent(world, eid, c.Trim, { end: sourceOut });
    } else if (end !== undefined) {
      const trimEnd = end - delay;
      assert(trimEnd > sourceIn, `\`end\` must be after \`start\`, got start=${start}, end=${end}`);
      setComponent(world, eid, c.Trim, { end: trimEnd });
    }
  }

  public replaceText(node: HostNode, text: string) {
    assert(node instanceof Text, "replaceText target is not a text node");
    node.data = text;
    // Text inside a <Text> element (a live mount updating a signal) must
    // land in the world too.
    const owner = node.parentNode !== null ? this.nodeOwner.get(node.parentNode) : undefined;
    if (owner !== undefined && this.isTextEntity(owner)) {
      this.track(() => this.syncChars(owner));
    }
  }

  public isTextNode(node: HostNode): boolean {
    return node instanceof Text;
  }

  private isTextEntity(eid: number): boolean {
    const c = this.world.components;
    return c.Geometry[eid] === GeometryType.TEXT;
  }

  /**
   * Chars mirrors the concatenation of a text element's text runs, held in
   * its Data fragment — a reactive segment compiles to its own text node
   * (`frame {frame()}` is two).
   */
  private syncChars(eid: number): void {
    const c = this.world.components;
    // Adopted text keeps its persisted (possibly hand-edited) Chars through
    // the initial adopt render; only actively re-running effects write.
    if (this.adopted.has(eid) && !this.committed) return;
    const textBox = hasComponent(this.world, eid, c.Data) ? c.Data[eid]?.textBox : undefined;

    if (textBox === undefined || textBox.firstChild === null) {
      removeComponent(this.world, eid, c.Chars);
    } else {
      setComponent(this.world, eid, c.Chars, textBox.textContent ?? "");
    }
  }

  public setProperty(node: HostNode, name: string, value: unknown) {
    if (name === "children" || name === "ref" || value === undefined || node instanceof Text) return;

    if (node instanceof Element) {
      if (name === "src" && node instanceof HTMLImageElement) {
        this.setImageSource(node, value);
        return;
      }
      setDomProperty(node, name, value);
      return;
    }
    const eid = node.eid;
    // Recorded even when not applied: timing, sync, and box-size resolution
    // read the raw props back.
    this.data(eid).props[name] = value;
    // Adopted entities keep their persisted (possibly hand-edited) values
    // through the initial adopt render; only actively re-running effects write.
    if (this.adopted.has(eid) && !this.committed) return;
    this.track(() => this.applyEcsProperty(eid, name, value));
  }

  private applyEcsProperty(eid: number, name: string, value: unknown) {
    const world = this.world;
    const c = world.components;

    switch (name) {
      case "name": {
        assert(typeof value === "string", "`name` must be a string" + `, value: ${value}`);
        setComponent(world, eid, c.Name, value);
        break;
      } case "x": {
        if (Array.isArray(value)) {
          const keyframes = parseKeyframes(name, value, (v) => {
            assert(typeof v === "number", "`x` must be a number" + `, value: ${v}`);
            return Math.round(v);
          });
          setComponent(world, eid, c.Position, { x: keyframes[0].value });
          setKeyframeTrack(world, eid, "position.x", keyframes);
          break;
        }
        setKeyframeTrack(world, eid, "position.x", []);
        assert(typeof value === "number", "`x` must be a number" + `, value: ${value}`);
        setComponent(world, eid, c.Position, { x: Math.round(value) });
        break;
      } case "y": {
        if (Array.isArray(value)) {
          const keyframes = parseKeyframes(name, value, (v) => {
            assert(typeof v === "number", "`y` must be a number" + `, value: ${v}`);
            return Math.round(v);
          });
          setComponent(world, eid, c.Position, { y: keyframes[0].value });
          setKeyframeTrack(world, eid, "position.y", keyframes);
          break;
        }
        setKeyframeTrack(world, eid, "position.y", []);
        assert(typeof value === "number", "`y` must be a number" + `, value: ${value}`);
        setComponent(world, eid, c.Position, { y: Math.round(value) });
        break;
      } case "offsetX": {
        if (Array.isArray(value)) {
          const keyframes = parseKeyframes(name, value, (v) => {
            assert(typeof v === "number", "`offsetX` must be a number" + `, value: ${v}`);
            return v;
          });
          setComponent(world, eid, c.Offset, { x: keyframes[0].value });
          setKeyframeTrack(world, eid, "offset.x", keyframes);
          break;
        }
        setKeyframeTrack(world, eid, "offset.x", []);
        assert(typeof value === "number", "`offsetX` must be a number" + `, value: ${value}`);
        setComponent(world, eid, c.Offset, { x: value });
        break;
      } case "offsetY": {
        if (Array.isArray(value)) {
          const keyframes = parseKeyframes(name, value, (v) => {
            assert(typeof v === "number", "`offsetY` must be a number" + `, value: ${v}`);
            return v;
          });
          setComponent(world, eid, c.Offset, { y: keyframes[0].value });
          setKeyframeTrack(world, eid, "offset.y", keyframes);
          break;
        }
        setKeyframeTrack(world, eid, "offset.y", []);
        assert(typeof value === "number", "`offsetY` must be a number" + `, value: ${value}`);
        setComponent(world, eid, c.Offset, { y: value });
        break;
      } case "width": {
        if (Array.isArray(value)) {
          const keyframes = parseKeyframes(name, value, (v) => {
            assert(typeof v === "number", "`width` must be a number" + `, value: ${v}`);
            assert(v >= 0, "`width` must be >= 0");
            return Math.round(v);
          });
          resizeEntity(world, eid, { width: keyframes[0].value });
          setKeyframeTrack(world, eid, "width", keyframes);
          break;
        }
        setKeyframeTrack(world, eid, "width", []);
        assert(typeof value === "number", "`width` must be a number" + `, value: ${value}`);
        assert(value >= 0, "`width` must be >= 0");
        resizeEntity(world, eid, { width: Math.round(value) });
        break;
      } case "height": {
        if (Array.isArray(value)) {
          const keyframes = parseKeyframes(name, value, (v) => {
            assert(typeof v === "number", "`height` must be a number" + `, value: ${v}`);
            assert(v >= 0, "`height` must be >= 0");
            return Math.round(v);
          });
          resizeEntity(world, eid, { height: keyframes[0].value });
          setKeyframeTrack(world, eid, "height", keyframes);
          break;
        }
        setKeyframeTrack(world, eid, "height", []);
        assert(typeof value === "number", "`height` must be a number" + `, value: ${value}`);
        assert(value >= 0, "`height` must be >= 0");
        resizeEntity(world, eid, { height: Math.round(value) });
        break;
      } case "scale": {
        const readScale = (v: unknown): number => {
          assert(typeof v === "number" && Number.isFinite(v) && v >= 0, "`scale` must be a finite non-negative number");
          return v;
        };
        if (Array.isArray(value)) {
          const keyframes = parseKeyframes(name, value, readScale);
          setComponent(world, eid, c.UniformScale, keyframes[0].value);
          setKeyframeTrack(world, eid, "scale", keyframes);
          break;
        }
        const scale = readScale(value);
        setKeyframeTrack(world, eid, "scale", []);
        setComponent(world, eid, c.UniformScale, scale);
        break;
      } case "rotation": {
        if (Array.isArray(value)) {
          const keyframes = parseKeyframes(name, value, (v) => {
            assert(typeof v === "number", "`rotation` must be a number" + `, value: ${v}`);
            return v;
          });
          setComponent(world, eid, c.Rotation, keyframes[0].value);
          setKeyframeTrack(world, eid, "rotation", keyframes);
          break;
        }
        setKeyframeTrack(world, eid, "rotation", []);
        assert(typeof value === "number", "`rotation` must be a number" + `, value: ${value}`);
        setComponent(world, eid, c.Rotation, value);
        break;
      } case "opacity": {
        const isStop = hasComponent(world, eid, c.ColorStop);
        if (Array.isArray(value)) {
          const keyframes = parseKeyframes(name, value, (v) => {
            assert(typeof v === "number", "`opacity` must be a number" + `, value: ${v}`);
            return Math.min(1, Math.max(0, v));
          });
          if (isStop) setComponent(world, eid, c.ColorStop, { opacity: keyframes[0].value });
          else setComponent(world, eid, c.Appearance, { opacity: keyframes[0].value });
          setKeyframeTrack(world, eid, isStop ? "stop.opacity" : "opacity", keyframes);
          break;
        }
        setKeyframeTrack(world, eid, isStop ? "stop.opacity" : "opacity", []);
        assert(typeof value === "number", "`opacity` must be a number" + `, value: ${value}`);
        const opacity = Math.min(1, Math.max(0, value));
        if (isStop) {
          setComponent(world, eid, c.ColorStop, { opacity });
        } else {
          setComponent(world, eid, c.Appearance, { opacity });
        }
        break;
      } case "cornerRadius": {
        if (Array.isArray(value)) {
          const keyframes = parseKeyframes(name, value, (v) => {
            assert(typeof v === "number", "`cornerRadius` must be a number" + `, value: ${v}`);
            assert(v >= 0, "`cornerRadius` must be >= 0");
            return Math.round(v);
          });
          setComponent(world, eid, c.CornerRadius, keyframes[0].value);
          setKeyframeTrack(world, eid, "vertexRadius", keyframes);
          break;
        }
        setKeyframeTrack(world, eid, "vertexRadius", []);
        assert(typeof value === "number", "`cornerRadius` must be a number" + `, value: ${value}`);
        assert(value >= 0, "`cornerRadius` must be >= 0");
        setComponent(world, eid, c.CornerRadius, Math.round(value));
        break;
      } case "start": {
        const parsed = parseFrames(String(value), 30);
        assert(typeof parsed === "number", "`start` must be a string or number" + `, value: ${value}`);
        this.reconcileTiming(eid);
        break;
      } case "end": {
        const parsed = parseFrames(String(value), 30);
        assert(typeof parsed === "number", "`end` must be a string or number" + `, value: ${value}`);
        delete this.data(eid).props.sourceOut;
        this.reconcileTiming(eid);
        break;
      } case "sourceIn": {
        const parsed = parseFrames(String(value), 30);
        assert(typeof parsed === "number", "`sourceIn` must be a string or number" + `, value: ${value}`);
        this.reconcileTiming(eid);
        break;
      } case "sourceOut": {
        const parsed = parseFrames(String(value), 30);
        assert(typeof parsed === "number", "`sourceOut` must be a string or number" + `, value: ${value}`);
        delete this.data(eid).props.end;
        this.reconcileTiming(eid);
        break;
      }
      case "fill": {
        assert(typeof value === "string", "`fill` must be a string" + `, value: ${value}`);
        const color = parseColor(value);
        assert(color !== null, `fill is not a valid CSS color: "${value}"`);
        const fills = [...query(world, [c.Paint, ChildOf(eid), Not(c.Deleted)])]
          .filter((fid) => c.Paint[fid] === PaintType.SOLID);

        if (fills.length === 0) {
          const fid = createEntity(world);
          setComponent(world, fid, c.Paint, PaintType.SOLID);
          appendChild(world, fid, eid);
          fills.push(fid);
        }


        for (const fid of fills) {
          setComponent(world, fid, c.Color, color);
        }
        break;
      }
      case "volume": {
        if (Array.isArray(value)) {
          const keyframes = parseKeyframes(name, value, (v) => {
            assert(typeof v === "number", "`volume` must be a number (dB)" + `, value: ${v}`);
            // Keyframed silence floors at -60 dB so segments toward it
            // interpolate over finite values.
            return Math.max(v, -60);
          });
          setComponent(world, eid, c.Volume, keyframes[0].value);
          setKeyframeTrack(world, eid, "volume", keyframes);
          break;
        }
        setKeyframeTrack(world, eid, "volume", []);
        assert(typeof value === "number", "`volume` must be a number (dB)" + `, value: ${value}`);
        setComponent(world, eid, c.Volume, value);
        break;
      } case "muted": {
        assert(typeof value === "boolean", "`muted` must be a boolean" + `, value: ${value}`);
        if (value) addComponent(world, eid, c.Muted);
        else removeComponent(world, eid, c.Muted);
        break;
      } case "syncTo": {
        assert(typeof value === "string", "`syncTo` must be a string" + `, value: ${value}`);
        assert(value.trim().length > 0, "`syncTo` must be a non-empty string");
        assert(!this.committed, "`syncTo` cannot change after commit; re-mount instead");
        this.queue.push({ eid, targetKey: value.trim(), type: "sync" });
        break;
      } case "transition": {
        if (value === null) {
          removeComponent(world, eid, c.Transition);
          break;
        }
        assert(
          typeof value === "object" && !Array.isArray(value),
          "`transition` must be a { type?, duration? } object or null" + `, value: ${value}`,
        );
        const { type, duration } = value as Record<string, unknown>;
        const spec: { type?: number; duration?: number } = {};
        if (type !== undefined) spec.type = parseTransitionType(type);
        if (duration !== undefined) spec.duration = parseTransitionDuration(duration);

        if (!hasComponent(world, eid, c.Transition)) {
          spec.type ??= TransitionType.DISSOLVE;
          spec.duration ??= TRANSITION_DEFAULT_DURATION;
        }
        setComponent(world, eid, c.Transition, spec);
        break;
      } case "animations": {
        assert(
          Array.isArray(value),
          "`animations` must be an array of { type, phase?, duration?, delay? } objects" + `, value: ${value}`,
        );
        const isTextNode = c.Geometry[eid] === GeometryType.TEXT;
        const specs = value.map((entry) => parseAnimationSpec(entry, isTextNode));

        // The list replaces the node's existing animations; [] clears them.
        // Materialized before deleting — removal mutates the live query.
        for (const aid of [...query(world, [c.Animation, ChildOf(eid), Not(c.Deleted)])]) {
          deleteEntity(world, aid);
        }
        for (const spec of specs) {
          const aid = createEntity(world);
          setComponent(world, aid, c.Animation, spec);
          appendChild(world, aid, eid);
        }
        break;
      } case "src": {
        if (isAssetRef(value)) {
          world.history.untrack(() => addComponent(world, eid, c.Generating));
          if (!hasComponent(world, eid, c.Size)) {
            resizeEntity(world, eid, placeholderSize(getAssetSpec(value)));
          }
          // Post-commit (live mount) nothing drains the queue; resolve now.
          if (this.committed) this.generateInto(eid, value, new Map()).catch(console.error);
          else this.queue.push({ eid, ref: value, type: "asset" });
          break;
        }
        assert(typeof value === "string", "`src` must be a string" + `, value: ${value}`);
        assert(value.trim().length > 0, "`src` must be a non-empty string");

        if (this.committed) this.mountSource(eid, value).catch(console.error);
        else this.promises.push(this.mountSource(eid, value));
        break;
      } case "objectFit": {
        assert(typeof value === "string", "`objectFit` must be a string" + `, value: ${value}`);
        assert(value in SCALE_MODE_MAP, `invalid objectFit value: "${value}"`);
        const mode = SCALE_MODE_MAP[value as keyof typeof SCALE_MODE_MAP];

        for (const pid of query(world, [c.Paint, ChildOf(eid), Not(c.Deleted)])) {
          if (c.Paint[pid] === PaintType.IMAGE || c.Paint[pid] === PaintType.VIDEO) {
            setComponent(world, pid, c.ScaleMode, mode);
          }
        }
        break;
      }
      case "key": {
        assert(typeof value === "string", "`key` must be a string" + `, value: ${value}`);
        assert(value.trim().length > 0, "`key` must be a non-empty string");
        setComponent(world, eid, c.Key, value.trim());
        break;
      }
      case "scene": {
        // Promotes a rectangle geometry to a scene (mount root): it carries the
        // Scene markers, and the `scene` value is the root's identity (stamped
        // onto Key, which insertRoot uses to replace a scene on re-mount).
        assert(typeof value === "string", "`scene` must be a string" + `, value: ${value}`);
        assert(value.trim().length > 0, "`scene` must be a non-empty string");
        assert(
          c.Geometry[eid] === GeometryType.RECT,
          "`scene` only applies to a rectangle geometry (`<rect>`, `<group>`, `<html>`, `<image>`, `<video>`)",
        );
        if (!hasComponent(world, eid, c.Scene)) {
          addComponent(world, eid, c.Scene);
          addComponent(world, eid, c.ClipsContent);
          setComponent(world, eid, c.Playback, {});
        }
        setComponent(world, eid, c.Key, value.trim());
        break;
      }
      case "wgsl": {
        assert(c.Paint[eid] === PaintType.SHADER, "`wgsl` only applies to <ShaderPaint>");
        assert(typeof value === "string", "`wgsl` must be a string" + `, value: ${value}`);
        assert(value.trim().length > 0, "`wgsl` must be a non-empty string");
        setComponent(world, eid, c.Shader, { code: value });
        break;
      }
      case "uniforms": {
        assert(c.Paint[eid] === PaintType.SHADER, "`uniforms` only applies to <ShaderPaint>");
        assert(
          typeof value === "object" && value !== null && !Array.isArray(value),
          "`uniforms` must be an object of numbers, number arrays, or CSS colors" + `, value: ${value}`,
        );
        for (const [uniform, entry] of Object.entries(value)) {
          if (typeof entry === "number") {
            assert(Number.isFinite(entry), `uniform \`${uniform}\` must be finite, value: ${entry}`);
          } else if (Array.isArray(entry)) {
            assert(
              entry.length >= 2 && entry.length <= 4 && entry.every((v) => typeof v === "number" && Number.isFinite(v)),
              `uniform \`${uniform}\` must be an array of 2-4 finite numbers, value: ${entry}`,
            );
          } else {
            assert(typeof entry === "string", `uniform \`${uniform}\` must be a number, number array, or CSS color, value: ${entry}`);
            assert(parseColor(entry) !== null, `uniform \`${uniform}\` is not a valid CSS color: "${entry}"`);
          }
        }
        setComponent(world, eid, c.Shader, { uniforms: { ...value } });
        break;
      }
      case "fontFamily":
        assert(typeof value === "string", "`fontFamily` must be a string" + `, value: ${value}`);
        assert(value.trim().length > 0, "`fontFamily` must be a non-empty string");
        setComponent(world, eid, c.TextStyle, { fontFamily: value.trim() });
        break;
      case "fontSize":
        assert(typeof value === "number", "`fontSize` must be a number" + `, value: ${value}`);
        assert(value > 0, "`fontSize` must be > 0");
        setComponent(world, eid, c.TextStyle, { fontSize: Math.round(value) });
        break;
      case "fontWeight":
        if (value === "normal") value = "400";
        else if (value === "bold") value = "700";
        else if (typeof value === "number") value = String(value);
        assert(typeof value === "string", "`fontWeight` must be a number, \"normal\", or \"bold\"" + `, value: ${value}`);
        assert(Number.isFinite(Number(value)), "`fontWeight` must be a number");
        setComponent(world, eid, c.TextStyle, { fontWeight: value });
        break;
      case "fontStyle":
        assert(typeof value === "string", "`fontStyle` must be a string" + `, value: ${value}`);
        assert(value in FONT_STYLE_MAP, `invalid fontStyle value: "${value}"`);
        setComponent(world, eid, c.TextStyle, { fontStyle: FONT_STYLE_MAP[value as keyof typeof FONT_STYLE_MAP] });
        break;
      case "textAlign":
        assert(typeof value === "string", "`textAlign` must be a string" + `, value: ${value}`);
        assert(value in TEXT_ALIGN_MAP, `invalid textAlign value: "${value}"`);
        setComponent(world, eid, c.TextStyle, { textAlign: TEXT_ALIGN_MAP[value as keyof typeof TEXT_ALIGN_MAP] });
        break;
      case "textBaseline":
        assert(typeof value === "string", "`textBaseline` must be a string" + `, value: ${value}`);
        assert(value in TEXT_BASELINE_MAP, `invalid textBaseline value: "${value}"`);
        setComponent(world, eid, c.TextStyle, { textBaseline: TEXT_BASELINE_MAP[value as keyof typeof TEXT_BASELINE_MAP] });
        break;
      case "color": {
        const isStop = hasComponent(world, eid, c.ColorStop);
        assert(isStop || hasComponent(world, eid, c.Paint), "`color` only applies to paints or color stops");
        if (Array.isArray(value)) {
          const keyframes = parseKeyframes(name, value, (v) => {
            assert(typeof v === "string", "`color` must be a string" + `, value: ${v}`);
            const color = parseColor(v);
            assert(color !== null, `color is not a valid CSS color: "${v}"`);
            return color;
          });
          if (isStop) setComponent(world, eid, c.ColorStop, { color: keyframes[0].value });
          else setComponent(world, eid, c.Color, keyframes[0].value);
          setKeyframeTrack(world, eid, isStop ? "stop.color" : "color", keyframes);
          break;
        }
        setKeyframeTrack(world, eid, isStop ? "stop.color" : "color", []);
        assert(typeof value === "string", "`color` must be a string" + `, value: ${value}`);
        const color = parseColor(value);
        assert(color !== null, `color is not a valid CSS color: "${value}"`);
        if (isStop) {
          setComponent(world, eid, c.ColorStop, { color });
        } else {
          setComponent(world, eid, c.Color, color);
        }
        break;
      } case "offset": {
        assert(hasComponent(world, eid, c.ColorStop), "`offset` only applies to <ColorStop>");
        if (Array.isArray(value)) {
          const keyframes = parseKeyframes(name, value, (v) => {
            assert(typeof v === "number", "`offset` must be a number" + `, value: ${v}`);
            assert(v >= 0 && v <= 1, "`offset` must be between 0 and 1");
            return v;
          });
          setComponent(world, eid, c.ColorStop, { offset: keyframes[0].value });
          setKeyframeTrack(world, eid, "stop.offset", keyframes);
          break;
        }
        setKeyframeTrack(world, eid, "stop.offset", []);
        assert(typeof value === "number", "`offset` must be a number" + `, value: ${value}`);
        assert(value >= 0 && value <= 1, "`offset` must be between 0 and 1");
        setComponent(world, eid, c.ColorStop, { offset: value });
        break;
      } case "preset": {
        assert(hasComponent(world, eid, c.Caption), "`preset` only applies to <Captions>");
        assert(typeof value === "string", "`preset` must be a string" + `, value: ${value}`);
        assert(value in CAPTION_PRESET_MAP, `invalid preset value: "${value}"`);
        setComponent(world, eid, c.Caption, { type: CAPTION_PRESET_MAP[value as keyof typeof CAPTION_PRESET_MAP] });
        break;
      } case "colors": {
        assert(hasComponent(world, eid, c.Caption), "`colors` only applies to <Captions>");
        assert(Array.isArray(value), "`colors` must be an array of CSS colors" + `, value: ${value}`);
        const colors = value.map((entry) => {
          assert(typeof entry === "string", "`colors` entries must be strings" + `, value: ${entry}`);
          const color = parseColor(entry);
          assert(color !== null, `colors entry is not a valid CSS color: "${entry}"`);
          return color;
        });
        setComponent(world, eid, c.Caption, { colors });
        break;
      } case "verticalAlign": {
        assert(hasComponent(world, eid, c.Caption), "`verticalAlign` only applies to <Captions>");
        assert(typeof value === "string", "`verticalAlign` must be a string" + `, value: ${value}`);
        assert(value in CAPTION_ALIGN_MAP, `invalid verticalAlign value: "${value}"`);
        setComponent(world, eid, c.Caption, { verticalAlign: CAPTION_ALIGN_MAP[value as keyof typeof CAPTION_ALIGN_MAP] });
        // A live decoder has already placed the box from the old alignment.
        c.CaptionDecoder[eid]?.reposition(world, eid);
        break;
      } case "seed": {
        assert(hasComponent(world, eid, c.Caption), "`seed` only applies to <Captions>");
        assert(typeof value === "number", "`seed` must be a number" + `, value: ${value}`);
        if (!this.committed && !this.queue.some((item) => item.type === "caption" && item.eid === eid)) {
          this.queue.push({ eid, type: "caption" });
        }
        break;
      }
    }
  }

  public insertNode(parent: HostNode, node: HostNode, anchor?: HostNode) {
    this.track(() => this.attach(parent, node, anchor));
    this.flushConnectedSurfaces();
    this.flushConnectedHtmlHosts();
  }

  /**
   * Links `node` under its parent: DOM nodes into the parent's DOM (an
   * <HtmlPaint>'s host element, or an element under one), entities into the
   * ECS tree. Both sides already exist — the tag's case decided the
   * environment at creation — so insertion only validates and links.
   */
  private attach(parent: HostNode, node: HostNode, anchor?: HostNode): void {
    const world = this.world;
    const c = world.components;

    if (parent instanceof Element) {
      assert(
        node instanceof Element || node instanceof Text,
        "a composition element cannot be <html> content; an SVG fragment (<rect>/<text>/<image>) compiles as SVG only inside <svg> or <g>; wrap it",
      );
      parent.insertBefore(node, anchor instanceof Node ? anchor : null);
      return;
    }
    assert(parent instanceof EntityNode, "text nodes cannot contain children");

    // DOM content lands in the parent's html host (the wrapper's paint host
    // for <Html>); text runs of a <Text> element land in its Data fragment.
    if (node instanceof Element || node instanceof Text) {
      if (parent === STAGE) {
        // Only Solid's empty placeholders may sit at the stage; they hold
        // root positions in `roots` but never touch the world.
        assert(node instanceof Text && node.data === "", "the stage cannot contain content");
        this.insertRoot(node, anchor);
        return;
      }

      const host = this.htmlHosts.get(parent.eid);
      if (host !== undefined) {
        host.element.insertBefore(node, anchor instanceof Node && anchor.parentNode === host.element ? anchor : null);
        return;
      }

      if (this.isTextEntity(parent.eid)) {
        assert(node instanceof Text, "a text element can only contain text");
        const data = this.data(parent.eid);
        if (data.textBox === undefined) {
          data.textBox = document.createDocumentFragment();
          this.nodeOwner.set(data.textBox, parent.eid);
        }
        data.textBox.insertBefore(node, anchor instanceof Node && anchor.parentNode === data.textBox ? anchor : null);
        this.syncChars(parent.eid);
        return;
      }

      // Anywhere else only the empty placeholders Solid's control flow
      // leaves behind pass; they stay unparented and act as inert anchors.
      assert(node instanceof Text && node.data === "", "this element cannot contain text or DOM content");
      return;
    }

    if (parent !== STAGE) {
      assert(
        !this.htmlHosts.has(parent.eid),
        "a composition element cannot be <html> content; an SVG fragment (<rect>/<text>/<image>) compiles as SVG only inside <svg> or <g>; wrap it",
      );
      assert(
        this.adopted.has(node.eid) || !hasComponent(world, node.eid, c.Scene),
        "a scene cannot be nested: the `scene` property is valid only at the document root",
      );
      // Adopted entities already sit under their persisted parent, so this
      // no-ops for them on the initial adopt render; afterwards it moves and
      // resurrects them like any other entity (e.g. a <For> shuffling rows).
      this.attachEntity(node.eid, parent.eid);
      return;
    }

    this.insertRoot(node, anchor);
    const eid = node.eid;

    // An adopted root is already placed and parented in the world; re-running
    // placement/replace would overwrite its persisted position and delete it.
    if (this.adopted.has(eid)) {
      this.rootEid = eid;
      return;
    }

    if (this.stageEid !== undefined) {
      this.attachEntity(eid, this.stageEid);
    } else {
      assert(
        hasComponent(world, eid, c.Scene),
        'only a scene can be a mount root: promote a rectangle geometry with `scene`, e.g. <rect scene="main" width={1920} height={1080}>',
      );
      const key = c.Key[eid];

      // Find and replace node with the same key
      const existing = query(world, [c.Key, Not(c.Deleted)])
        .find((other) => other !== eid && c.Key[other] === key);

      if (existing === undefined) {
        const { width, height } = this.props(eid) ?? {};
        assert(
          typeof width === "number" && typeof height === "number",
          "a scene requires numeric `width` and `height`",
        );
        setComponent(world, eid, c.Position, this.findPlacement(width, height));
      } else {
        setComponent(world, eid, c.Position, {
          x: c.Position.x[existing] ?? 0,
          y: c.Position.y[existing] ?? 0,
        });
        deleteEntity(world, existing);
      }
    }

    // Stamp the mount's identity on its root so any world can re-run the
    // module (export, capture, reload) in adopt mode.
    if (this.mode === "author" && this.mountId !== undefined && this.scriptAssetId !== undefined) {
      setComponent(world, eid, c.MountScript, {
        mountId: this.mountId,
        scriptAssetId: this.scriptAssetId,
      });
    }

    this.rootEid = eid;
  }

  /** Places a node into the stage's `roots` list (its only bookkeeping). */
  private insertRoot(node: HostNode, anchor?: HostNode): void {
    const existing = this.roots.indexOf(node);
    if (existing !== -1) this.roots.splice(existing, 1);
    const index = anchor !== undefined ? this.roots.indexOf(anchor) : -1;
    if (index === -1) this.roots.push(node);
    else this.roots.splice(index, 0, node);
  }

  // Fresh entities append; an entity that already has a parent is a Solid
  // reorder or reparent (e.g. a <For> moving rows in a live mount).
  private attachEntity(eid: number, parentEid: number): void {
    const c = this.world.components;
    if (hasComponent(this.world, eid, c.Deleted)) {
      // Like a DOM node, an entity this render just removed re-attaches
      // intact; anything something else deleted stays dead.
      if (!this.removed.delete(eid)) return;
      for (const e of getEntityTree(this.world, eid)) {
        removeComponent(this.world, e, c.Deleted);
      }
      this.managed.add(eid);
    }
    const currentParent = getParentEntity(this.world, eid);
    if (currentParent === null) {
      appendChild(this.world, eid, parentEid);
      return;
    }
    if (currentParent !== parentEid) {
      removeChild(this.world, eid, currentParent);
      appendChild(this.world, eid, parentEid);
    }
  }

  /**
   * A `ref` callback (the renderer's `use`). DOM elements exist eagerly, so
   * their refs fire immediately; surface refs receive the paint's backing
   * canvas, which is only sized once the ancestor chain exists, so they wait
   * for the subtree to connect to the stage.
   */
  public applyRef(node: HostNode, ref: (target: unknown) => void): void {
    if (node instanceof Element || node instanceof Text) {
      solid.untrack(() => ref(node));
      return;
    }
    const pending = this.pendingSurfaces.find((entry) => entry.eid === node.eid);
    assert(pending !== undefined, "`ref` is only supported on surface elements");
    pending.ref = ref;
  }

  /**
   * The box a canvas paint's bitmap is initially allocated at: the nearest
   * explicit size up the entity's ancestor chain (every element's box
   * defaults to its parent's), falling back to a live ancestor's computed
   * size for mounts into existing entities (`dapi node insert`).
   */
  private resolveBoxSize(eid: number): { width: number; height: number } {
    const c = this.world.components;
    let width: number | undefined;
    let height: number | undefined;

    // Recorded props first — entities in the mounted subtree are fresh, so
    // their Computed sizes are defaults, not layout. Live ancestors'
    // Computed only backstops mounts into existing entities (node insert).
    for (let cursor: number | null = eid; cursor !== null; cursor = getParentEntity(this.world, cursor)) {
      const props = this.props(cursor);
      width ??= sizeProp(props?.width);
      height ??= sizeProp(props?.height);
      if (width !== undefined && height !== undefined) return { width, height };
    }
    for (let cursor: number | null = eid; cursor !== null; cursor = getParentEntity(this.world, cursor)) {
      // Freshly created entities carry no Size yet; only already live ones
      // (e.g. the target of a `node insert`) carry a real box.
      if (!hasComponent(this.world, cursor, c.Size)) continue;
      width ??= c.Computed.width[cursor] || undefined;
      height ??= c.Computed.height[cursor] || undefined;
      if (width !== undefined && height !== undefined) break;
    }

    return { width: width ?? 300, height: height ?? 150 };
  }

  /** Whether the entity's ancestor chain reaches the stage. */
  private isConnected(eid: number): boolean {
    for (let cursor: number | null = eid; cursor !== null; cursor = getParentEntity(this.world, cursor)) {
      if (cursor === this.stageEid) return true;
      const handle = this.entityNodes.get(cursor);
      if (handle !== undefined && this.roots.includes(handle)) return true;
    }
    return false;
  }

  /**
   * Sizes and hands out the canvases of surfaces whose subtree just connected
   * to the stage: the box size walks ancestor props, and Solid attaches a
   * subtree's root last, so only now is the chain complete. Disconnected
   * surfaces stay pending — a Solid reorder removes and re-inserts them.
   */
  private flushConnectedSurfaces(): void {
    if (this.pendingSurfaces.length === 0) return;
    this.pendingSurfaces = this.pendingSurfaces.filter((entry) => {
      if (!this.isConnected(entry.eid)) return true;

      const boxEid = entry.paint ? getParentEntity(this.world, entry.eid) ?? entry.eid : entry.eid;
      const box = this.resolveBoxSize(boxEid);
      entry.host.setSize(box.width, box.height);
      if (entry.ref !== undefined) {
        const ref = entry.ref;
        solid.untrack(() => ref(entry.host.canvas));
      }
      return false;
    });
  }

  private flushConnectedHtmlHosts(): void {
    if (this.pendingHtmlHosts.length === 0) return;
    this.pendingHtmlHosts = this.pendingHtmlHosts.filter((entry) => {
      if (!this.isConnected(entry.eid)) return true;

      const boxEid = entry.paint ? getParentEntity(this.world, entry.eid) ?? entry.eid : entry.eid;
      const box = this.resolveBoxSize(boxEid);
      entry.host.setSize(box.width, box.height);
      return false;
    });
  }

  /**
   * Wires an html host to the element the renderer inserts DOM content under
   */
  private registerHtmlHost(eid: number, host: HtmlHost, paint: boolean): void {
    this.htmlHosts.set(eid, host);
    this.nodeOwner.set(host.element, eid);
    this.pendingHtmlHosts.push({ eid, host, paint });
  }

  /**
   * Adopt mode: rebuild the runtime-only hosts a persisted entity can't carry,
   * binding a fresh host to the existing (adopted) paint entity. Mirrors the
   * host setup in `createEntityForTag` but never creates structural entities.
   */
  private reattachRuntimeHostsForTag(tag: string, eid: number): void {
    const world = this.world;
    const c = world.components;

    switch (tag) {
      case "SurfacePaint": {
        const host = this.trackHost(new SurfaceHost());
        addComponent(world, eid, c.SurfaceHost, false);
        c.SurfaceHost[eid] = host;
        this.pendingSurfaces.push({ eid, host, paint: true });
        break;
      }
      case "Surface": {
        const fid = this.findPaintChild(eid, PaintType.SURFACE);
        assert(fid !== undefined, "adopted <Surface> has no surface paint child");
        const host = this.trackHost(new SurfaceHost());
        addComponent(world, fid, c.SurfaceHost, false);
        c.SurfaceHost[fid] = host;
        this.pendingSurfaces.push({ eid, host, paint: false });
        break;
      }
      case "HtmlPaint": {
        const host = this.trackHost(new HtmlHost());
        addComponent(world, eid, c.HtmlHost, false);
        c.HtmlHost[eid] = host;
        this.registerHtmlHost(eid, host, true);
        break;
      }
      case "Html": {
        const fid = this.findPaintChild(eid, PaintType.HTML);
        assert(fid !== undefined, "adopted <Html> has no html paint child");
        const host = this.trackHost(new HtmlHost());
        addComponent(world, fid, c.HtmlHost, false);
        c.HtmlHost[fid] = host;
        this.registerHtmlHost(eid, host, false);
        break;
      }
    }
  }

  /** The child paint entity of `eid` carrying the given paint type, if any. */
  private findPaintChild(eid: number, paint: PaintType): number | undefined {
    const world = this.world;
    const c = world.components;
    for (const fid of query(world, [ChildOf(eid), c.Paint, Not(c.Deleted)])) {
      if (c.Paint[fid] === paint) return fid;
    }
    return undefined;
  }

  public removeNode(parent: HostNode, node: HostNode) {
    this.track(() => {
      if (node instanceof Element || node instanceof Text) {
        const owner = node.parentNode !== null ? this.nodeOwner.get(node.parentNode) : undefined;
        node.remove();
        if (owner !== undefined && this.isTextEntity(owner)) this.syncChars(owner);
        const index = this.roots.indexOf(node);
        if (index !== -1) this.roots.splice(index, 1);
        return;
      }
      if (parent === STAGE) {
        // Stage roots persist in the world past their mount — removal only
        // forgets the renderer's bookkeeping.
        const index = this.roots.indexOf(node);
        if (index !== -1) this.roots.splice(index, 1);
        return;
      }
      if (parent instanceof EntityNode) {
        // A stale removal of an already-dead entity (the old graph of a
        // superseded mount racing its dispose) must not detach or re-arm it.
        if (hasComponent(this.world, node.eid, this.world.components.Deleted)) return;
        removeChild(this.world, node.eid, parent.eid);
        deleteEntity(this.world, node.eid);
        this.managed.delete(node.eid);
        this.removed.add(node.eid);
      }
    });
  }

  public getParentNode(node: HostNode): HostNode | undefined {
    if (node instanceof Element || node instanceof Text) {
      const parent = node.parentNode;
      if (parent === null) return undefined;
      const owner = this.nodeOwner.get(parent);
      if (owner !== undefined) return this.entity(owner);
      return parent instanceof Element ? parent : undefined;
    }
    if (this.roots.includes(node)) return STAGE;
    const parent = getParentEntity(this.world, node.eid);
    return parent === null ? undefined : this.entity(parent);
  }

  public getFirstChild(node: HostNode): HostNode | undefined {
    if (node instanceof Element) return node.firstChild as Element | Text | null ?? undefined;
    if (node instanceof Text) return undefined;
    if (node === STAGE) return this.roots[0];
    const host = this.htmlHosts.get(node.eid);
    if (host !== undefined) return host.element.firstChild as Element | Text | null ?? undefined;
    if (this.isTextEntity(node.eid)) {
      const c = this.world.components;
      const textBox = hasComponent(this.world, node.eid, c.Data) ? c.Data[node.eid]?.textBox : undefined;
      return textBox?.firstChild as Text | null ?? undefined;
    }
    const first = this.entityChildren(node.eid)[0];
    return first === undefined ? undefined : this.entity(first);
  }

  public getNextSibling(node: HostNode): HostNode | undefined {
    if (node instanceof Element || node instanceof Text) {
      return node.nextSibling as Element | Text | null ?? undefined;
    }
    const parent = getParentEntity(this.world, node.eid);
    if (parent === null) {
      const index = this.roots.indexOf(node);
      return index === -1 ? undefined : this.roots[index + 1];
    }
    const siblings = this.entityChildren(parent);
    const index = siblings.indexOf(node.eid);
    const next = index === -1 ? undefined : siblings[index + 1];
    return next === undefined ? undefined : this.entity(next);
  }

  /**
   * The renderer-visible entity children of `eid`: its ECS children filtered
   * to this render's managed set, so internal sub-entities (a <Text>'s paint)
   * and hand-added children stay out of Solid's reconciliation.
   */
  private entityChildren(eid: number): number[] {
    const c = this.world.components;
    return [...query(this.world, [ChildOf(eid), Not(c.Deleted)])].filter((child) => this.managed.has(child));
  }

  private findPlacement(width: number, height: number): { x: number; y: number } {
    const center = findEmptyPlacement(this.world, width, height, PLACEMENT_GAP, this.placedRootBoxes);
    this.placedRootBoxes.push({
      minX: center.x - width / 2,
      minY: center.y - height / 2,
      maxX: center.x + width / 2,
      maxY: center.y + height / 2,
    });
    return {
      x: Math.round(center.x - width / 2),
      y: Math.round(center.y - height / 2),
    };
  }

  /**
   * Attaches a resolved asset to a media element — shared by plain `src`
   * values (resolved during mount) and generated assets (landing after commit).
   */
  private async mountSource(eid: number, src: string) {
    const asset = await resolveAsset(this.world, src);
    const transcript = asset.type === 'TRANSCRIPT' ? await resolveTranscript(asset) : null;

    this.track(() => {
      const world = this.world;
      const c = world.components;

      if (asset.type === 'TRANSCRIPT') {
        // AssetId set here makes commit's caption phase skip transcription.
        setComponent(world, eid, c.AssetId, asset.id);
        setComponent(world, eid, c.Trim, transcriptTrim(transcript!));
      } else if (asset.type === 'AUDIO') {
        setComponent(world, eid, c.AssetId, asset.id);
        resizeEntity(world, eid, { width: 500, height: 150 });
      } else if (asset.type === 'IMAGE' || asset.type === 'VIDEO') {
        const fid = createEntity(world);
        setComponent(world, fid, c.Paint, asset.type === 'IMAGE' ? PaintType.IMAGE : PaintType.VIDEO);
        const objectFit = this.props(eid)?.objectFit as keyof typeof SCALE_MODE_MAP | undefined;
        setComponent(world, fid, c.ScaleMode, objectFit ? SCALE_MODE_MAP[objectFit] : ScaleMode.COVER);
        setComponent(world, fid, c.AssetId, asset.id);
        // The asset resolves after the element's JSX paint children have
        // attached, but the media paint belongs at the bottom of the stack:
        // paint children draw over it, and a shader paint reads it.
        const fills = query(world, [c.Paint, ChildOf(eid), Not(c.Deleted)]);
        if (fills.length > 0) {
          setComponent(world, fid, c.ItemIndex, Math.min(...fills.map((f) => c.ItemIndex[f] ?? 0)) - 1);
        }
        appendChild(world, fid, eid);

        if (!hasComponent(world, eid, c.Size)) {
          resizeEntity(world, eid, { width: asset.width, height: asset.height });
        }
      }

      setComponent(world, eid, c.Name, asset.name);
    });
  }

  /**
   * `src` of an `<img>` inside html content. It takes the same inputs as a
   * composition `src` — a path, an asset id, a URL, or a `generate.*` ref —
   * which the module can't read itself, so they resolve through the host into
   * an object URL. Sources the browser can already fetch (`data:`, `blob:`)
   * are set as they are.
   */
  private setImageSource(el: HTMLImageElement, value: unknown): void {
    const epoch = (this.imageEpochs.get(el) ?? 0) + 1;
    this.imageEpochs.set(el, epoch);

    if (typeof value === "string" && DIRECT_SRC_RE.test(value)) {
      this.pointImageAt(el, value, false);
      return;
    }

    // An empty `src` is the placeholder a signal reads before its source
    // exists, so it clears the element rather than failing the render.
    if (typeof value === "string" && value.trim().length === 0) {
      this.releaseImageUrl(el);
      el.removeAttribute("src");
      return;
    }

    assert(
      isAssetRef(value) || typeof value === "string",
      "an <img> `src` must be a path, URL, asset id, or `generate.*` ref" + `, value: ${value}`,
    );

    this.trackImageLoad((async () => {
      const input = value as AssetInput;
      const asset = isAssetRef(input)
        ? await resolveGeneratedAsset(this.world, input, new Map())
        : await resolveAsset(this.world, input);
      const file = await getAssetFile(asset);

      // A newer `src` claimed this element while the old one resolved.
      if (this.imageEpochs.get(el) !== epoch) return;

      this.pointImageAt(el, URL.createObjectURL(file), true);
      // Decoded here rather than at draw time so the first frame that samples
      // this subtree already has pixels; a broken source just paints nothing.
      await el.decode().catch(() => undefined);
    })());
  }

  /** Points the element at `url`, freeing the object URL it held before. */
  private pointImageAt(el: HTMLImageElement, url: string, owned: boolean): void {
    this.releaseImageUrl(el);
    if (owned) this.objectUrls.set(el, url);
    el.src = url;
  }

  /** Frees the object URL this element holds, if it minted one. */
  private releaseImageUrl(el: HTMLImageElement): void {
    const url = this.objectUrls.get(el);
    if (url === undefined) return;
    URL.revokeObjectURL(url);
    this.objectUrls.delete(el);
  }

  /**
   * Makes an image source part of what a render waits for: `commit()` for the
   * initial mount, so export and capture have it by frame 0, and the world's
   * promise queue, which offline renders drain before every frame — that is
   * what catches a live mount swapping `src` mid-timeline. Only the commit
   * copy rejects; a source that breaks later must not take an export down.
   */
  private trackImageLoad(promise: Promise<void>): void {
    this.world.promises?.push(promise.catch(() => undefined));
    if (this.committed) promise.catch(console.error);
    else this.promises.push(promise);
  }

}

/**
 * Prop assignment for DOM nodes inside <HtmlPaint>: enough of Solid's DOM
 * conventions (style objects, class, classList, innerHTML) for drawn markup.
 * Event handlers are dropped — the content is painted, not interactive.
 */
function setDomProperty(el: Element, name: string, value: unknown): void {
  if (typeof value === "function") return;

  if (name === "style") {
    const style = (el as HTMLElement).style;
    if (typeof value === "string") {
      style.cssText = value;
    } else if (typeof value === "object" && value !== null) {
      Object.assign(style, value);
    }
  } else if (name === "class" || name === "className") {
    el.setAttribute("class", String(value));
  } else if (name === "classList") {
    if (typeof value === "object" && value !== null) {
      for (const [key, on] of Object.entries(value)) {
        el.classList.toggle(key, !!on);
      }
    }
  } else if (name === "innerHTML") {
    el.innerHTML = String(value);
  } else if (name === "textContent") {
    el.textContent = String(value);
  } else if (value === false || value === null) {
    el.removeAttribute(name);
  } else {
    el.setAttribute(name, value === true ? "" : String(value));
  }
}

function placeholderSize(spec: AssetSpecInput): { width: number; height: number } {
  if (spec.type === "image" || spec.type === "video") {
    return ASPECT_RATIO_DIMENSIONS[spec.aspectRatio ?? "16:9"] ?? { width: 1920, height: 1080 };
  }
  return { width: 500, height: 150 };
}

function parseFrames(value: string | null | undefined, fps: number): number | undefined {
  const seconds = parseTime(value);
  return seconds === undefined ? undefined : Math.round(seconds * fps);
}

/**
 * Reads a recorded width/height prop as a number; keyframed sizes read as their first keyframe.
 */
function sizeProp(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (Array.isArray(value) && typeof (value[0] as { value?: unknown })?.value === "number") {
    return (value[0] as { value: number }).value;
  }
  return undefined;
}

/**
 * Evaluates a compiled project module. The CLI ships a
 * single-file ESM bundle whose host modules are left external under the
 * "dapi-host:" prefix
 */

// Must match HOST_MODULE_PREFIX in @diffusionstudio/cli's compile step.
const HOST_MODULE_PREFIX = "dapi-host:";

const HOST_MODULES: Record<string, object> = {
  "solid-js": solid,
  "solid-js/store": solidStore,
  "@diffusionstudio/jsx": diffusionJsx,
};

declare global {
  var __dapiHostModules__: Record<string, object> | undefined;
}

const shimUrls = new Map<string, string>();

// A blob module cannot import bare specifiers, so the shim reaches its target
// namespace through a global and re-exports every name statically.
function getShimUrl(name: string): string {
  const cached = shimUrls.get(name);
  if (cached) return cached;

  const ns = HOST_MODULES[name]!;
  globalThis.__dapiHostModules__ ??= {};
  globalThis.__dapiHostModules__[name] = ns;

  const lines = [`const m = globalThis.__dapiHostModules__[${JSON.stringify(name)}];`];
  for (const key of Object.keys(ns)) {
    if (key === "default") continue;
    lines.push(`export const ${key} = m[${JSON.stringify(key)}];`);
  }
  if ("default" in ns) lines.push("export default m.default;");

  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/javascript" }));
  shimUrls.set(name, url);
  return url;
}

export async function importProjectModule(code: string): Promise<Record<string, unknown>> {
  let rewritten = code;
  for (const name of Object.keys(HOST_MODULES)) {
    rewritten = rewritten.replaceAll(
      JSON.stringify(`${HOST_MODULE_PREFIX}${name}`),
      JSON.stringify(getShimUrl(name)),
    );
  }

  const url = URL.createObjectURL(new Blob([rewritten], { type: "text/javascript" }));
  try {
    // Top-level code (including top-level await) runs to completion here.
    return (await import(/* @vite-ignore */ url)) as Record<string, unknown>;
  } finally {
    URL.revokeObjectURL(url);
  }
}
