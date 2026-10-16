/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { hasComponent, query, Not } from "bitecs";
import { AnimationPhase, AnimationType, BlendMode, CaptionType, ConstraintType, EffectType, FontStyle, GeometryType, PaintType, ScaleMode, StrokeCap, StrokeJoin, TextAlign, TextBaseline, TextCase, TransitionType } from "../components/constants";
import { ChildOf } from "../components/relations";
import { DEFAULT_CLIP_HEIGHT } from "../timeline/config";
import { getParentEntity } from "./base";
import { observe, addComponent, removeComponent } from "./events";
import { syncKeyframeTrack } from "./keyframe";
import { DEFAULT_DURATION_FRAMES } from "../constants";
import * as utils from "./utils";

import type { EngineWorld } from "./world";

export function observeWorld(world: EngineWorld) {
  const c = world.components;

  observe(world, "set", c.Geometry, (eid, type) => {
    c.Geometry[eid] = type ?? c.Geometry[eid] ?? GeometryType.RECT;
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.Paint, (eid, type) => {
    c.Paint[eid] = type ?? c.Paint[eid] ?? PaintType.SOLID;
    utils.reactToPaintChange(world, eid);
    utils.bubbleTimeRangeUp(world, eid);
    utils.persistEntity(world, eid);
  });

  observe(world, "add", c.Group, (eid) => {
    utils.recomputeEntityTimeRange(world, eid);
    utils.bubbleTimeRangeUp(world, eid);
    utils.persistEntity(world, eid);
  });

  observe(world, "remove", c.Group, (eid) => {
    utils.persistEntity(world, eid);
  });

  observe(world, "add", c.Scene, (eid) => {
    utils.recomputeEntityTimeRange(world, eid);
    utils.bubbleTimeRangeUp(world, eid);
    utils.persistEntity(world, eid);
  });

  observe(world, "remove", c.Scene, (eid) => {
    utils.persistEntity(world, eid);
  });

  observe(world, "add", c.Audio, (eid) => {
    utils.recomputeEntityTimeRange(world, eid);
    utils.bubbleTimeRangeUp(world, eid);
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.ExportSettings, (eid, data) => {
    const s = c.ExportSettings;
    s.templateId[eid] = data.templateId ?? s.templateId[eid] ?? null;
    s.format[eid] = data.format ?? s.format[eid] ?? 'mp4';
    s.videoEnabled[eid] = data.videoEnabled ?? s.videoEnabled[eid] ?? true;
    s.videoCodec[eid] = data.videoCodec ?? s.videoCodec[eid] ?? 'avc';
    s.videoBitrate[eid] = data.videoBitrate ?? s.videoBitrate[eid] ?? 10e6;
    s.videoFps[eid] = data.videoFps ?? s.videoFps[eid] ?? 30;
    s.videoResolution[eid] = data.videoResolution ?? s.videoResolution[eid] ?? 1080;
    s.audioEnabled[eid] = data.audioEnabled ?? s.audioEnabled[eid] ?? true;
    s.audioCodec[eid] = data.audioCodec ?? s.audioCodec[eid] ?? 'aac';
    s.audioSampleRate[eid] = data.audioSampleRate ?? s.audioSampleRate[eid] ?? 48000;
  });

  observe(world, "add", c.Selected, (eid) => {
    if (!hasComponent(world, eid, c.Audio)) return;
    for (const fid of [...query(world, [c.Paint, ChildOf(eid), Not(c.Deleted)])]) {
      if (c.Paint[fid] === PaintType.WAVEFORM) {
        removeComponent(world, fid, c.Hidden);
      }
    }
  });

  observe(world, "remove", c.Selected, (eid) => {
    if (!hasComponent(world, eid, c.Audio) || getParentEntity(world, eid) === null) return;
    for (const fid of [...query(world, [c.Paint, ChildOf(eid), Not(c.Deleted)])]) {
      if (c.Paint[fid] === PaintType.WAVEFORM) {
        addComponent(world, fid, c.Hidden);
      }
    }
  });

  observe(world, "set", c.Effect, (eid, { type, value }) => {
    c.Effect.type[eid] = type ?? c.Effect.type[eid] ?? EffectType.BRIGHTNESS;
    c.Effect.value[eid] = value ?? c.Effect.value[eid] ?? 0.5;
    c.Computed.value[eid] = c.Effect.value[eid];
    utils.persistEntity(world, eid);
    if (value !== undefined) syncKeyframeTrack(world, eid, 'effect.value');
  });

  observe(world, "add", c.IsMask, (eid) => {
    utils.persistEntity(world, eid);
  });

  observe(world, "add", c.ClipToBox, (eid) => {
    utils.persistEntity(world, eid);
  });

  observe(world, "remove", c.ClipToBox, (eid) => {
    utils.persistEntity(world, eid);
  });

  observe(world, "remove", c.IsMask, (eid) => {
    utils.persistEntity(world, eid);
  });

  observe(world, "add", c.Shadow, (eid) => {
    utils.persistEntity(world, eid);
  });

  observe(world, "add", c.Stroke, (eid) => {
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.Caption, (eid, { type, colors, verticalAlign }) => {
    c.Caption.type[eid] = type ?? c.Caption.type[eid] ?? CaptionType.CLASSIC;
    c.Caption.colors[eid] = colors ?? c.Caption.colors[eid] ?? [0xFFFFFF];
    c.Caption.verticalAlign[eid] = verticalAlign ?? c.Caption.verticalAlign[eid];
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.Shader, (eid, { code, uniforms }) => {
    c.Shader.code[eid] = code ?? c.Shader.code[eid] ?? "";
    c.Shader.uniforms[eid] = uniforms ?? c.Shader.uniforms[eid] ?? null;
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.Name, (eid, name) => {
    c.Name[eid] = name ?? c.Name[eid] ?? "";
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.Key, (eid, key) => {
    c.Key[eid] = key ?? c.Key[eid] ?? "";
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.MountScript, (eid, { mountId, scriptAssetId }) => {
    c.MountScript.mountId[eid] = mountId ?? c.MountScript.mountId[eid] ?? "";
    c.MountScript.scriptAssetId[eid] = scriptAssetId ?? c.MountScript.scriptAssetId[eid] ?? "";
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.MountPath, (eid, { mountId, path }) => {
    c.MountPath.mountId[eid] = mountId ?? c.MountPath.mountId[eid] ?? "";
    c.MountPath.path[eid] = path ?? c.MountPath.path[eid] ?? "";
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.Position, (eid, { x, y }) => {
    c.Position.x[eid] = x ?? c.Position.x[eid] ?? 0;
    c.Position.y[eid] = y ?? c.Position.y[eid] ?? 0;
    c.Computed.positionX[eid] = c.Position.x[eid];
    c.Computed.positionY[eid] = c.Position.y[eid];
    utils.persistEntity(world, eid);
    if (x !== undefined) syncKeyframeTrack(world, eid, 'position.x');
    if (y !== undefined) syncKeyframeTrack(world, eid, 'position.y');
  });

  observe(world, "set", c.Offset, (eid, { x, y }) => {
    c.Offset.x[eid] = x ?? c.Offset.x[eid] ?? 0;
    c.Offset.y[eid] = y ?? c.Offset.y[eid] ?? 0;
    c.Computed.offsetX[eid] = c.Offset.x[eid];
    c.Computed.offsetY[eid] = c.Offset.y[eid];
    utils.persistEntity(world, eid);
    if (x !== undefined) syncKeyframeTrack(world, eid, 'offset.x');
    if (y !== undefined) syncKeyframeTrack(world, eid, 'offset.y');
  });

  observe(world, "set", c.Rotation, (eid, rotation) => {
    c.Rotation[eid] = rotation ?? c.Rotation[eid] ?? 0;
    c.Computed.rotation[eid] = c.Rotation[eid];
    utils.persistEntity(world, eid);
    if (rotation !== undefined) syncKeyframeTrack(world, eid, 'rotation');
  });

  const refreshScale = (eid: number) => {
    const uniform = hasComponent(world, eid, c.UniformScale) ? c.UniformScale[eid] ?? 1 : 1;
    const hasScale = hasComponent(world, eid, c.Scale);
    c.Computed.scaleX[eid] = (hasScale ? c.Scale.x[eid] ?? 1 : 1) * uniform;
    c.Computed.scaleY[eid] = (hasScale ? c.Scale.y[eid] ?? 1 : 1) * uniform;
    utils.persistEntity(world, eid);
  };
  // Undo removes component membership without clearing bitecs' backing arrays.
  // Refresh static nodes too: the motion system skips nodes without tracks.
  for (const component of [c.Scale, c.UniformScale]) {
    observe(world, "add", component, refreshScale);
    observe(world, "remove", component, refreshScale);
  }

  observe(world, "set", c.Scale, (eid, { x, y }) => {
    c.Scale.x[eid] = x ?? c.Scale.x[eid] ?? 1;
    c.Scale.y[eid] = y ?? c.Scale.y[eid] ?? 1;
    refreshScale(eid);
    if (x !== undefined) syncKeyframeTrack(world, eid, 'scale.x');
    if (y !== undefined) syncKeyframeTrack(world, eid, 'scale.y');
  });

  observe(world, "set", c.UniformScale, (eid, scale) => {
    c.UniformScale[eid] = scale ?? c.UniformScale[eid] ?? 1;
    refreshScale(eid);
    if (scale !== undefined) syncKeyframeTrack(world, eid, 'scale');
  });

  observe(world, "set", c.Anchor, (eid, { x, y }) => {
    c.Anchor.x[eid] = x ?? c.Anchor.x[eid] ?? 0.5;
    c.Anchor.y[eid] = y ?? c.Anchor.y[eid] ?? 0.5;
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.Skew, (eid, { x, y }) => {
    c.Skew.x[eid] = x ?? c.Skew.x[eid] ?? 0;
    c.Skew.y[eid] = y ?? c.Skew.y[eid] ?? 0;
    c.Computed.skewX[eid] = c.Skew.x[eid];
    c.Computed.skewY[eid] = c.Skew.y[eid];
    utils.persistEntity(world, eid);
    if (x !== undefined) syncKeyframeTrack(world, eid, 'skew.x');
    if (y !== undefined) syncKeyframeTrack(world, eid, 'skew.y');
  });

  observe(world, "set", c.Size, (eid, params) => {
    c.Size.width[eid] = params.width ?? c.Size.width[eid] ?? 300;
    c.Size.height[eid] = params.height ?? c.Size.height[eid] ?? 300;
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.Flip, (eid, { x, y }) => {
    c.Flip.x[eid] = x ?? c.Flip.x[eid] ?? 1;
    c.Flip.y[eid] = y ?? c.Flip.y[eid] ?? 1;
    utils.persistEntity(world, eid);
  });

  observe(world, "add", c.Hidden, (eid) => {
    utils.persistEntity(world, eid);
  });

  observe(world, "remove", c.Hidden, (eid) => {
    utils.persistEntity(world, eid);
  });

  observe(world, "add", c.ClipsContent, (eid) => {
    utils.persistEntity(world, eid);
  });

  observe(world, "remove", c.ClipsContent, (eid) => {
    utils.persistEntity(world, eid);
  });

  observe(world, "add", c.Sequential, (eid) => {
    addComponent(world, eid, c.Group);
    removeComponent(world, eid, c.Position);
    removeComponent(world, eid, c.Offset);
    removeComponent(world, eid, c.Rotation);
    removeComponent(world, eid, c.Scale);
    removeComponent(world, eid, c.Skew);
    removeComponent(world, eid, c.Anchor);
    removeComponent(world, eid, c.Flip);
    utils.syncInteractiveState(world);
    utils.persistEntity(world, eid);
  });

  observe(world, "remove", c.Sequential, (eid) => {
    utils.syncInteractiveState(world);
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.Appearance, (eid, { opacity, blendMode }) => {
    c.Appearance.opacity[eid] = opacity ?? c.Appearance.opacity[eid] ?? 1;
    c.Appearance.blendMode[eid] = blendMode ?? c.Appearance.blendMode[eid] ?? BlendMode.SOURCE_OVER;
    c.Computed.opacity[eid] = c.Appearance.opacity[eid];
    utils.persistEntity(world, eid);
    if (opacity !== undefined) syncKeyframeTrack(world, eid, 'opacity');
  });

  observe(world, "set", c.CornerRadius, (eid, cornerRadius) => {
    c.CornerRadius[eid] = cornerRadius ?? c.CornerRadius[eid] ?? 0;
    c.Computed.cornerRadius[eid] = c.CornerRadius[eid];
    utils.persistEntity(world, eid);
    if (cornerRadius !== undefined) syncKeyframeTrack(world, eid, 'vertexRadius');
  });

  observe(world, "set", c.MixedCornerRadius, (eid, params) => {
    c.MixedCornerRadius.topLeft[eid] = params.topLeft ?? c.MixedCornerRadius.topLeft[eid] ?? 0;
    c.MixedCornerRadius.topRight[eid] = params.topRight ?? c.MixedCornerRadius.topRight[eid] ?? 0;
    c.MixedCornerRadius.bottomRight[eid] = params.bottomRight ?? c.MixedCornerRadius.bottomRight[eid] ?? 0;
    c.MixedCornerRadius.bottomLeft[eid] = params.bottomLeft ?? c.MixedCornerRadius.bottomLeft[eid] ?? 0;
    c.Computed.cornerRadiusTopLeft[eid] = c.MixedCornerRadius.topLeft[eid];
    c.Computed.cornerRadiusTopRight[eid] = c.MixedCornerRadius.topRight[eid];
    c.Computed.cornerRadiusBottomRight[eid] = c.MixedCornerRadius.bottomRight[eid];
    c.Computed.cornerRadiusBottomLeft[eid] = c.MixedCornerRadius.bottomLeft[eid];
    utils.persistEntity(world, eid);
    if (params.topLeft !== undefined) syncKeyframeTrack(world, eid, 'mixedVertexRadius.topLeft');
    if (params.topRight !== undefined) syncKeyframeTrack(world, eid, 'mixedVertexRadius.topRight');
    if (params.bottomRight !== undefined) syncKeyframeTrack(world, eid, 'mixedVertexRadius.bottomRight');
    if (params.bottomLeft !== undefined) syncKeyframeTrack(world, eid, 'mixedVertexRadius.bottomLeft');
  });

  observe(world, "set", c.Color, (eid, color) => {
    c.Color[eid] = color ?? c.Color[eid] ?? 0xE0E0E0;
    c.Computed.color[eid] = c.Color[eid];
    utils.persistEntity(world, eid);
    if (color !== undefined) syncKeyframeTrack(world, eid, 'color');
  });

  observe(world, "set", c.Blur, (eid, blur) => {
    c.Blur[eid] = blur ?? c.Blur[eid] ?? 0;
    c.Computed.blur[eid] = c.Blur[eid];
    utils.persistEntity(world, eid);
    if (blur !== undefined) syncKeyframeTrack(world, eid, 'blur');
  });

  observe(world, "set", c.AssetId, (eid, assetId) => {
    c.AssetId[eid] = assetId ?? c.AssetId[eid] ?? "";
    utils.reactToAssetChange(world, eid);
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.ScaleMode, (eid, scaleMode) => {
    c.ScaleMode[eid] = scaleMode ?? c.ScaleMode[eid] ?? ScaleMode.FIT;
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.Volume, (eid, volume) => {
    c.Volume[eid] = volume ?? c.Volume[eid] ?? 0;
    c.Computed.volume[eid] = c.Volume[eid];
    utils.persistEntity(world, eid);
    if (volume !== undefined) syncKeyframeTrack(world, eid, 'volume');
  });

  observe(world, "add", c.AudioBus, () => {
    // AudioBus is created lazily during the playback tick (resolveAudioBus),
    // after the appendChild rebuild has already run. Rebuild the timeline index
    // so audio-aware UI (e.g. the soundboard meters) reacts to the newly
    // metered layer instead of staying stale until the next reorder/delete.
    world.rebuildTimelineIndex();
  });

  observe(world, "add", c.Muted, (eid) => {
    utils.persistEntity(world, eid);
  });

  observe(world, "remove", c.Muted, (eid) => {
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.Chars, (eid, chars) => {
    c.Chars[eid] = chars ?? c.Chars[eid] ?? "Text";
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.TextStyle, (eid, params) => {
    // A TextStyle on a TextRange entity is a *partial* override of its parent's
    // style — only the fields explicitly provided should be written. Defaulting
    // the rest (as we do for standalone text below) would clobber the parent's
    // font, size, case, etc. with "Arial"/16px and break sub-range captions.
    if (hasComponent(world, eid, c.TextRange)) {
      if (params.leading !== undefined) c.TextStyle.leading[eid] = params.leading;
      if (params.fontSize !== undefined) c.TextStyle.fontSize[eid] = params.fontSize;
      if (params.fontFamily !== undefined) c.TextStyle.fontFamily[eid] = params.fontFamily;
      if (params.fontWeight !== undefined) c.TextStyle.fontWeight[eid] = params.fontWeight;
      if (params.fontStyle !== undefined) c.TextStyle.fontStyle[eid] = params.fontStyle;
      if (params.textAlign !== undefined) c.TextStyle.textAlign[eid] = params.textAlign;
      if (params.textBaseline !== undefined) c.TextStyle.textBaseline[eid] = params.textBaseline;
      if (params.textCase !== undefined) c.TextStyle.textCase[eid] = params.textCase;
      if (params.letterSpacing !== undefined) c.TextStyle.letterSpacing[eid] = params.letterSpacing;
      utils.persistEntity(world, eid);
      return;
    }

    c.TextStyle.leading[eid] = params.leading ?? c.TextStyle.leading[eid] ?? 1;
    c.TextStyle.fontSize[eid] = params.fontSize ?? c.TextStyle.fontSize[eid] ?? 16;
    c.TextStyle.fontFamily[eid] = params.fontFamily ?? c.TextStyle.fontFamily[eid] ?? "Arial";
    c.TextStyle.fontWeight[eid] = params.fontWeight ?? c.TextStyle.fontWeight[eid] ?? "400";
    c.TextStyle.fontStyle[eid] = params.fontStyle ?? c.TextStyle.fontStyle[eid] ?? FontStyle.NORMAL;
    c.TextStyle.textAlign[eid] = params.textAlign ?? c.TextStyle.textAlign[eid] ?? TextAlign.LEFT;
    c.TextStyle.textBaseline[eid] = params.textBaseline ?? c.TextStyle.textBaseline[eid] ?? TextBaseline.TOP;
    c.TextStyle.textCase[eid] = params.textCase ?? c.TextStyle.textCase[eid] ?? TextCase.ORIGINAL;
    c.TextStyle.letterSpacing[eid] = params.letterSpacing ?? c.TextStyle.letterSpacing[eid] ?? 0;
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.TextRange, (eid, { start, end }) => {
    c.TextRange.start[eid] = start ?? c.TextRange.start[eid] ?? 0;
    c.TextRange.end[eid] = end ?? c.TextRange.end[eid] ?? null;
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.ColorStop, (eid, { offset, color, opacity }) => {
    c.ColorStop.offset[eid] = offset ?? c.ColorStop.offset[eid] ?? 0;
    c.ColorStop.color[eid] = color ?? c.ColorStop.color[eid] ?? 0xFFFFFF;
    c.ColorStop.opacity[eid] = opacity ?? c.ColorStop.opacity[eid] ?? 1;
    c.Computed.stopOffset[eid] = c.ColorStop.offset[eid];
    c.Computed.stopColor[eid] = c.ColorStop.color[eid];
    c.Computed.stopOpacity[eid] = c.ColorStop.opacity[eid];
    utils.persistEntity(world, eid);
    if (offset !== undefined) syncKeyframeTrack(world, eid, 'stop.offset');
    if (color !== undefined) syncKeyframeTrack(world, eid, 'stop.color');
    if (opacity !== undefined) syncKeyframeTrack(world, eid, 'stop.opacity');
  });

  observe(world, "set", c.StrokeStyle, (eid, params) => {
    c.StrokeStyle.width[eid] = params.width ?? c.StrokeStyle.width[eid] ?? 1;
    c.StrokeStyle.join[eid] = params.join ?? c.StrokeStyle.join[eid] ?? StrokeJoin.MITER;
    c.StrokeStyle.cap[eid] = params.cap ?? c.StrokeStyle.cap[eid] ?? StrokeCap.BUTT;
    c.StrokeStyle.miterLimit[eid] = params.miterLimit ?? c.StrokeStyle.miterLimit[eid] ?? 3;
    c.Computed.strokeWidth[eid] = c.StrokeStyle.width[eid];
    utils.persistEntity(world, eid);
    if (params.width !== undefined) syncKeyframeTrack(world, eid, 'stroke.width');
  });

  observe(world, "set", c.Playback, (eid, { playing, loop, speed }) => {
    c.Playback.playing[eid] = playing ?? c.Playback.playing[eid] ?? 0;
    c.Playback.loop[eid] = loop ?? c.Playback.loop[eid] ?? 1;
    c.Playback.speed[eid] = speed ?? c.Playback.speed[eid] ?? 1;
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.ClipHeight, (eid, height) => {
    c.ClipHeight[eid] = height ?? c.ClipHeight[eid] ?? DEFAULT_CLIP_HEIGHT;
    utils.persistEntity(world, eid);
  });

  observe(world, "add", c.Expanded, (eid) => {
    utils.persistEntity(world, eid);
    world.rebuildTimelineIndex();
  });

  observe(world, "remove", c.Expanded, (eid) => {
    utils.persistEntity(world, eid);
    world.rebuildTimelineIndex();
  });

  observe(world, "set", c.Delay, (eid, delay) => {
    c.Delay[eid] = delay ?? c.Delay[eid] ?? 0;
    utils.propagateTimeRangeDown(world, eid);
    utils.bubbleTimeRangeUp(world, eid);
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.PlaybackRate, (eid, playbackRate) => {
    c.PlaybackRate[eid] = playbackRate ?? c.PlaybackRate[eid] ?? 1;
    utils.propagateTimeRangeDown(world, eid);
    utils.bubbleTimeRangeUp(world, eid);
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.Trim, (eid, { start, end }) => {
    const fallbackDuration = c.Computed.duration[eid] ?? DEFAULT_DURATION_FRAMES;
    c.Trim.start[eid] = start ?? c.Trim.start[eid] ?? 0;
    c.Trim.end[eid] = end ?? c.Trim.end[eid] ?? fallbackDuration;
    utils.clampTrimToAssetDuration(world, eid);
    utils.recomputeEntityTimeRange(world, eid);
    utils.bubbleTimeRangeUp(world, eid);
    utils.persistEntity(world, eid);
  });

  observe(world, "remove", c.Trim, (eid) => {
    utils.recomputeEntityTimeRange(world, eid);
    utils.bubbleTimeRangeUp(world, eid);
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.Workarea, (eid, { start, end }) => {
    const fallbackEnd = c.Computed.duration[eid] ?? DEFAULT_DURATION_FRAMES;
    c.Workarea.start[eid] = start ?? c.Workarea.start[eid] ?? 0;
    c.Workarea.end[eid] = end ?? c.Workarea.end[eid] ?? fallbackEnd;
  });

  observe(world, "set", c.Constraint, (eid, { horizontal, vertical }) => {
    c.Constraint.horizontal[eid] = horizontal ?? c.Constraint.horizontal[eid] ?? ConstraintType.MIN;
    c.Constraint.vertical[eid] = vertical ?? c.Constraint.vertical[eid] ?? ConstraintType.MIN;
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.KeepAspectRatio, (eid, { width, height }) => {
    c.KeepAspectRatio.width[eid] = width ?? c.KeepAspectRatio.width[eid] ?? 1;
    c.KeepAspectRatio.height[eid] = height ?? c.KeepAspectRatio.height[eid] ?? 1;
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.KeyframeTrack, (eid, { property }) => {
    c.KeyframeTrack.property[eid] = property ?? c.KeyframeTrack.property[eid] ?? "";
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.Keyframe, (eid, { time, value, easing }) => {
    c.Keyframe.time[eid] = time ?? c.Keyframe.time[eid] ?? 0;
    c.Keyframe.value[eid] = value ?? c.Keyframe.value[eid] ?? 0;
    c.Keyframe.easing[eid] = easing ?? c.Keyframe.easing[eid] ?? "linear";
    // Ensure keyframes are sorted by frame
    utils.rebuildCaches(world, eid, getParentEntity(world, eid));
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.Animation, (eid, { duration, delay, type, phase }) => {
    c.Animation.duration[eid] = duration ?? c.Animation.duration[eid] ?? 0;
    c.Animation.delay[eid] = delay ?? c.Animation.delay[eid] ?? 0;
    c.Animation.type[eid] = type ?? c.Animation.type[eid] ?? AnimationType.FADE;
    c.Animation.phase[eid] = phase ?? c.Animation.phase[eid] ?? AnimationPhase.IN;
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.ItemIndex, (eid, index) => {
    c.ItemIndex[eid] = index ?? c.ItemIndex[eid] ?? 0;
    utils.rebuildCaches(world, eid, getParentEntity(world, eid));
    world.rebuildTimelineIndex();
    utils.persistEntity(world, eid);
  });

  observe(world, "set", c.Transition, (eid, { type, duration }) => {
    c.Transition.type[eid] = type ?? c.Transition.type[eid] ?? TransitionType.DISSOLVE;
    c.Transition.duration[eid] = duration ?? c.Transition.duration[eid] ?? 0;
    utils.persistEntity(world, eid);
  });

  observe(world, "add", c.Deleted, (eid) => {
    utils.rebuildCaches(world, eid, getParentEntity(world, eid));
    utils.reactToChildDetached(world, eid);
    utils.disposeDecoders(world, eid);
    utils.disposeHtmlHosts(world, eid);
    utils.disposeSurfaceHosts(world, eid);
    utils.disposeShaderHosts(world, eid);
    utils.disconnectAudioBus(world, eid);
    utils.unpersistEntity(world, eid);
    world.rebuildTimelineIndex();
  });

  observe(world, "remove", c.Deleted, (eid) => {
    utils.rebuildCaches(world, eid, getParentEntity(world, eid));
    utils.persistEntity(world, eid);
    world.rebuildTimelineIndex();
  });

  observe(world, "add", c.Culled, (eid) => {
    utils.disposeDecoders(world, eid);
  });

  // Non persistent components
  observe(world, "set", c.ClipDragOrigin, (eid, { delay, start, end }) => {
    c.ClipDragOrigin.delay[eid] = delay ?? c.ClipDragOrigin.delay[eid] ?? 0;
    c.ClipDragOrigin.start[eid] = start ?? c.ClipDragOrigin.start[eid] ?? 0;
    c.ClipDragOrigin.end[eid] = end ?? c.ClipDragOrigin.end[eid] ?? 0;
  });

  observe(world, "set", c.KeyframeDragOrigin, (eid, { time }) => {
    c.KeyframeDragOrigin.time[eid] = time ?? c.KeyframeDragOrigin.time[eid] ?? 0;
  });

  observe(world, "set", c.TrimDragOrigin, (eid, { start, end }) => {
    c.TrimDragOrigin.start[eid] = start ?? c.TrimDragOrigin.start[eid] ?? 0;
    c.TrimDragOrigin.end[eid] = end ?? c.TrimDragOrigin.end[eid] ?? 0;
  });
}
