/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Public authoring API (used by project modules).
export { generate, AssetRef, isAssetRef, getAssetSpec } from "./generate";
export type {
  AspectRatio,
  AssetInput,
  AssetSpecInput,
  GenerateAudioOptions,
  GenerateImageOptions,
  GenerateVideoOptions,
  GenerateVoiceOptions,
} from "./generate";
export { PATCH_PROP_KEYS } from "./types";
export { parseTime, TIME_FPS } from "./time";
// Native visual treatments and frame-based motion presets share the host runtime.
export * from "./effects";
export * from "./look-presets";
export * from "./motion-presets";
export * from "./presentation-themes";
export * from "./documentary";
export * from "./documentary-map";
export * from "./education-core";
export * from "./education-equation";
export * from "./education-cards";
export * from "./education-diagrams";
export {
  Audio,
  Captions,
  ColorStop,
  Group,
  Html,
  HtmlPaint,
  Image,
  LinearGradientPaint,
  RadialGradientPaint,
  Rect,
  Sequence,
  ShaderPaint,
  SolidPaint,
  Surface,
  SurfacePaint,
  Text,
  Video,
} from "./elements";
export { useTicker, useFile } from "./renderer";
export type { Ticker } from "./renderer";
export type {
  Animatable,
  AnimationSpec,
  AnimationType,
  AudioProps,
  CaptionPreset,
  CaptionsProps,
  ColorStopProps,
  Easing,
  Fit,
  GradientPaintProps,
  GroupProps,
  HtmlPaintProps,
  HtmlProps,
  ImageProps,
  Keyframe,
  PatchProps,
  RectProps,
  SequenceProps,
  ShaderPaintProps,
  SolidPaintProps,
  SurfacePaintProps,
  SurfaceProps,
  TextProps,
  Time,
  TransitionSpec,
  TransitionType,
  VideoProps,
} from "./types";

// Renderer runtime — compiled project modules import these (babel-preset-solid
// universal mode, moduleName "@diffusionstudio/jsx").
export {
  render,
  effect,
  memo,
  createComponent,
  createElement,
  createTextNode,
  insertNode,
  insert,
  spread,
  setProp,
  mergeProps,
  use,
  renderProject,
} from "./renderer";

export type { ProjectDocument, ProjectTick } from "./document";
