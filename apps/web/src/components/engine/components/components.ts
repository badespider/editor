/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { VideoCodec, AudioCodec } from "mediabunny";
import type { ContainerFormat } from "../encode/types";
import type { Token } from "../utils/text";
import type { AudioBus as AudioBusInstance } from "../services/audio-bus";
import type { HtmlHost as HtmlHostInstance } from "../decoders/html";
import type { SurfaceHost as SurfaceHostInstance } from "../decoders/surface";
import type { ShaderHost as ShaderHostInstance } from "../decoders/shader";
import type { ImageDecoder as ImageDecoderInstance } from "../decoders/image";
import type { VideoDecoderInstance } from "../decoders/video";
import type { SequenceDecoder as SequenceDecoderInstance } from "../decoders/sequence";
import type { AudioDecoder as AudioDecoderInstance } from "../decoders/audio";
import type { CaptionDecoder as CaptionDecoderInstance } from "../decoders/caption";
import type { VectorPathCommand } from "@diffusionstudio/jsx";
// Geometric primitive — RECT or TEXT (see GeometryType). Other node-like
// roles (group, audio, scene, caption) are layered on top via tag components.
export const Geometry = [] as number[];

// Persisted editable geometry. Commands are local pixels, never SVG markup or executable code.
export const VectorPath = {
  commands: [] as VectorPathCommand[][],
  fillEnabled: [] as boolean[],
};

// Paint applied to a geometry (or stroke). The value is a PaintType enum index.
export const Paint = [] as number[];

// Tag marking a geometry as a group container. An explicit Size defines a
// fixed logical box; otherwise Computed bounds derive from direct children.
// They carry a transform
// state (Position/Rotation/Scale/...) like any other entity.
export const Group = {};

// Tag marking a geometry as a scene — a clipped, playable frame. Scenes
// have a fixed Size like any frame; the tag layers playback + clipping on
// top. Scenes are NOT Groups.
export const Scene = {};

// Tag marking a geometry as an audio clip (no visual rendering).
export const Audio = {};

export const AdjustmentLayer = {};

export const ExportSettings = {
  templateId: [] as (string | null)[],
  format: [] as (ContainerFormat | undefined)[],
  videoEnabled: [] as (boolean | undefined)[],
  videoCodec: [] as (VideoCodec | undefined)[],
  videoBitrate: [] as (number | undefined)[],
  videoFps: [] as (number | undefined)[],
  videoResolution: [] as (number | undefined)[],
  audioEnabled: [] as (boolean | undefined)[],
  audioCodec: [] as (AudioCodec | undefined)[],
  audioSampleRate: [] as (number | undefined)[],
};

export const Effect = {
  type: [] as number[],
  value: [] as number[],
};

// Tag marking an entity as a mask. Masks are ChildOf their target.
// MaskCache[targetEid] is derived by childCacheSystem from IsMask + ChildOf queries.
export const IsMask = {};

// Clips this geometry's own drawing and descendants to its current local box.
// Unlike ClipsContent, this also applies before text/paint rendering.
export const ClipToBox = {};

// Tag for shadow sub-entities (distinguishes from other Effect sub-entities in ChildOf queries).
export const Shadow = {};

// Tag for stroke sub-entities (distinguishes from parent Stroke component in ChildOf queries).
export const Stroke = {};

// Caption preset configuration — only on CAPTION node entities.
// The transcript is either a standalone TRANSCRIPT asset or embedded in an AUDIO/VIDEO asset, referenced via AssetId.
export const Caption = {
  type: [] as number[], // CaptionType enum index,
  colors: [] as number[][],
  verticalAlign: [] as (number | undefined)[], // CaptionAlign enum index; unset = the preset's default
};

export const Name = [] as string[];

// Stable identity for entities.
export const Key = [] as string[];

// On a mount's root entity: the compiled module (a SCRIPT asset) that a world
// re-executes to rebuild this mount's reactive graph and runtime hosts.
export const MountScript = {
  mountId: [] as string[],
  scriptAssetId: [] as string[],
};

// On every entity a mount materializes: its stable structural key (an index
// path from the mount root), so a re-run in adopt mode can bind to the existing
// entity instead of minting a new one.
export const MountPath = {
  mountId: [] as string[],
  path: [] as string[],
};

export const Position = {
  x: [] as number[],
  y: [] as number[],
};

export const Offset = {
  x: [] as number[],
  y: [] as number[],
};

export const Rotation = [] as number[];

export const Scale = {
  x: [] as number[],
  y: [] as number[],
};

export const UniformScale = [] as number[];

export const Anchor = {
  x: [] as number[],
  y: [] as number[],
};

export const Skew = {
  x: [] as number[],
  y: [] as number[],
};

export const Size = {
  width: [] as number[],
  height: [] as number[],
};

export const Flip = {
  x: [] as (-1 | 1)[],
  y: [] as (-1 | 1)[],
};

export const LocalTransform = {
  a: [] as number[],
  b: [] as number[],
  c: [] as number[],
  d: [] as number[],
  e: [] as number[],
  f: [] as number[],
};

export const WorldTransform = {
  a: [] as number[],
  b: [] as number[],
  c: [] as number[],
  d: [] as number[],
  e: [] as number[],
  f: [] as number[],
};

export const WorldBounds = {
  minX: [] as number[],
  minY: [] as number[],
  maxX: [] as number[],
  maxY: [] as number[],
};

export const Culled = {};

export const Hidden = {};

export const ClipsContent = {};

// Tag marking a container whose direct children cannot overlap in time.
// Drag/trim of any direct child clamps at the neighbour's edge.
export const Sequential = {};

export const Generating = {};

export const Appearance = {
  opacity: [] as number[],
  blendMode: [] as number[],
};

export const CornerRadius = [] as number[];

// Per-corner radii (CSS order: TL, TR, BR, BL).
export const MixedCornerRadius = {
  topLeft: [] as number[],
  topRight: [] as number[],
  bottomRight: [] as number[],
  bottomLeft: [] as number[],
};

export const Blur = [] as number[];

export const Color = [] as number[];

export const AssetId = [] as string[];

// Scale mode — index into SCALE_MODES. Used by image fills and any future
// entity with a scaled asset display.
export const ScaleMode = [] as number[];

// Audio volume in decibels (0 dB = unity, -Infinity = silence).
export const Volume = [] as number[];

// Audio mute tag — presence means muted.
export const Muted = {};

// Runtime-only solo tag (not serialized) — presence means soloed.
export const Soloed = {};

// Text content — stores text-specific data for TextNode entities.
// Text characters — only on the parent TextNode, not shared with ranges.
export const Chars = [] as string[];

// Text style properties — shared between TextNode and TextRange sub-entities.
// On a TextNode this is the default style; on a range sub-entity it overrides.
export const TextStyle = {
  leading: [] as number[],
  fontSize: [] as number[],
  fontFamily: [] as string[],
  fontWeight: [] as string[],
  fontStyle: [] as number[],    // index into FONT_STYLES
  textAlign: [] as number[],    // index into TEXT_ALIGNS
  textBaseline: [] as number[], // index into TEXT_BASELINES
  textCase: [] as number[],     // -1 = none, index into TEXT_CASES
  letterSpacing: [] as number[], // extra spacing between characters (px)
};

// Runtime-only: cached text layout data (not serialized).
export const TextCache = {
  tokens: [] as Token[][][],
};

export const TextRange = {
  start: [] as number[],
  end: [] as (number | null)[],
};

// Single gradient stop. Each stop is its own entity, ChildOf the gradient fill.
// Stop count is fixed for the lifetime of the fill — to animate "between
// gradients with different stop counts" use a separate fill and cross-fade.
export const ColorStop = {
  offset: [] as number[],
  color: [] as number[],
  opacity: [] as number[],
};

export const StrokeStyle = {
  width: [] as number[],
  join: [] as number[], // 0=miter, 1=round, 2=bevel
  cap: [] as number[], // 0=butt, 1=round, 2=square
  miterLimit: [] as number[],
};

// Playback state of an entity.
export const Playback = {
  playing: [] as number[],               // 0 = paused, 1 = playing
  loop: [] as number[],                  // 0 = no loop, 1 = loop
  speed: [] as number[],                 // playback speed multiplier (negative = reverse, default 1)
};

// Per-clip user-customized row height.
export const ClipHeight = [] as number[];

// Tag: this clip's keyframe rows are expanded below the clip body.
export const Expanded = {};

// Offset where the node starts inside its parent's timeline (frames).
export const Delay = [] as number[];

// Speed multiplier for the node's local time (1 = normal).
export const PlaybackRate = [] as number[];

// Explicit duration window in the clip's own local time. When present, the
// node has fixed bounds (workarea on scenes, trimmed source on media clips).
// When absent: scenes auto-fit to their children, other nodes have no
// inherent duration (runtime adds Trim immediately on creation).
export const Trim = {
  start: [] as number[],
  end: [] as number[],
};

// Explicit playback/export window on a scene
export const Workarea = {
  start: [] as number[],
  end: [] as number[],
};

// Constraint anchoring — stores CONSTRAINT_TYPES values (0=MIN, 1=MAX, 2=CENTER).
export const Constraint = {
  horizontal: [] as number[],
  vertical: [] as number[],
};

// Aspect ratio lock — stores the target aspect ratio snapshot
// When the component is set, the current dimensions are captured.
export const KeepAspectRatio = {
  width: [] as number[],
  height: [] as number[],
};

// KeyframeTrack entity — one per (target, property) pair. ChildOf its target
// (geometry, paint, color stop, …) and owns the Keyframe entities as children.
// `target` is denormalised: ChildOf is authoritative, but the keyed lookup is
// refreshed in `aggregateKeyframeTracks` so motion/render don't have to walk
// up the relation on every frame.
export const KeyframeTrack = {
  property: [] as string[],
  target: [] as number[],
};

// Keyframe entity component — each keyframe is its own entity, ChildOf its KeyframeTrack.
// Easing applies to the segment from this keyframe to the next-in-time on the same track.
export const Keyframe = {
  time: [] as number[],
  value: [] as number[],
  easing: [] as string[],
};

// Animation component — each animation is its own entity.
export const Animation = {
  type: [] as number[],
  duration: [] as number[],
  delay: [] as number[],
  phase: [] as number[],
};

export const ConstraintCache = {
  parentWidth: [] as number[],
  parentHeight: [] as number[],
  childWidth: [] as number[],
  childHeight: [] as number[],
};

export const Computed = {
  positionX: [] as number[],
  positionY: [] as number[],
  offsetX: [] as number[],
  offsetY: [] as number[],
  // Local-space origin of the entity's bounding rect. Non-zero only for
  // Group containers whose children's AABB extends past (0, 0)
  originX: [] as number[],
  originY: [] as number[],
  rotation: [] as number[],
  scaleX: [] as number[],
  scaleY: [] as number[],
  skewX: [] as number[],
  skewY: [] as number[],
  opacity: [] as number[],
  color: [] as number[],
  blur: [] as number[],
  volume: [] as number[],
  value: [] as number[],
  strokeWidth: [] as number[],
  cornerRadius: [] as number[],
  cornerRadiusTopLeft: [] as number[],
  cornerRadiusTopRight: [] as number[],
  cornerRadiusBottomRight: [] as number[],
  cornerRadiusBottomLeft: [] as number[],
  stopOffset: [] as number[],
  stopColor: [] as number[],
  stopOpacity: [] as number[],
  width: [] as number[],
  height: [] as number[],
  chars: [] as (string | undefined)[],
  localTimeInSeconds: [] as number[],  // playhead position in seconds
  localTime: [] as number[],   // playhead position in frames (mirrors localTimeInSeconds)
  duration: [] as number[],    // duration in frames
  start: [] as number[],
  end: [] as number[],
  delay: [] as number[],
  visibility: [] as number[],
};

export const ItemIndex = [] as number[];

// Per-entity owned-sub-entity lists. Populated by observers from ChildOf
// queries; consumed by render, motion, and UI code.
export const Cache = {
  children: [] as number[][],
  fills: [] as number[][],
  shadows: [] as number[][],
  strokes: [] as number[][],
  effects: [] as number[][],
  textRanges: [] as number[][],
  masks: [] as number[][],
  keyframeTracks: [] as number[][],
  keyframes: [] as number[][],
  animations: [] as number[][],
};

export const HtmlHost = [] as (HtmlHostInstance | null)[];

export const SurfaceHost = [] as (SurfaceHostInstance | null)[];

export const Shader = {
  code: [] as string[],
  uniforms: [] as (Record<string, number | number[] | string> | null)[],
};

export const ShaderHost = [] as (ShaderHostInstance | null)[];

// Renderer-runtime state on mounted entities (never serialized)
export type MountData = {
  props: Record<string, unknown>;
  textBox?: DocumentFragment;
};

export const Data = [] as (MountData | null)[];

export const ImageDecoder = [] as (ImageDecoderInstance | null)[];

export const VideoDecoder = [] as (VideoDecoderInstance | null)[];

export const SequenceDecoder = [] as (SequenceDecoderInstance | null)[];

export const AudioDecoder = [] as (AudioDecoderInstance | null)[];

export const CaptionDecoder = [] as (CaptionDecoderInstance | null)[];

export const AudioBus = [] as (AudioBusInstance | null)[];

// Transition between adjacent clips in a track.
// Stored on clip entities — describes the transition INTO this clip from the previous one.
export const Transition = {
  type: [] as number[],              // TransitionType enum index
  duration: [] as number[],  // duration in frames
};

export const AudioPlayback = {
  wasPlaying: [] as number[],
  contextOffsetInSeconds: [] as number[],
  timelineOffsetInSeconds: [] as number[],
};

export const Selected = {};

export const Deleted = {};

export const Interactive = {};

export const Hovering = {};

export const Dragging = {};

export const Timeline = {
  scrollX: [] as number[],
  scrollY: [] as number[],
  resolution: [] as number[],
  transform: [] as DOMMatrix[],
};

export const ClipDragOrigin = {
  delay: [] as number[],
  start: [] as number[],
  end: [] as number[],
};

export const KeyframeDragOrigin = {
  time: [] as number[],
};

// Snapshot of the clip's start/end frames at the moment a trim interaction
// began. Tagged on the single clip being trimmed; removed on release.
export const TrimDragOrigin = {
  start: [] as number[],
  end: [] as number[],
};
