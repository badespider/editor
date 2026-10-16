/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The composition elements, as PascalCase components: the canonical form the
 * CLI compile rewrites camelCase tags into (`<rect>` -> `Rect`, unless an SVG
 * container makes it SVG content). Hosts therefore receive PascalCase tags
 * for composition elements and lowercase tags only for DOM content under
 * `<htmlPaint>` — `createElement` can tell them apart by case alone. These
 * exports are the compile target and the ABI of persisted compiled bundles
 * (which import them by name via the host-module shim), not an authoring
 * surface.
 */

import { splitProps } from "solid-js";
import { createElement, spread, use } from "./renderer";

import type { JSX as SolidJSX } from "solid-js";
import type {
  AudioProps,
  CaptionsProps,
  ColorStopProps,
  GradientPaintProps,
  GroupProps,
  HtmlPaintProps,
  HtmlProps,
  ImageProps,
  PathProps,
  RectProps,
  SequenceProps,
  ShaderPaintProps,
  SolidPaintProps,
  SurfacePaintProps,
  SurfaceProps,
  TextProps,
  VideoProps,
} from "./types";

/**
 * A component wrapping one host element: creates the node, routes `ref`
 * through the renderer's `use` (so hosts with `applyRef` hand the callback
 * the backing object, e.g. a surface's canvas), and spreads the remaining
 * props and children reactively.
 */
function hostElement<P extends object>(tag: string): (props: P) => SolidJSX.Element {
  return (props) => {
    const el = createElement(tag);
    const [local, rest] = splitProps(props as P & { ref?: unknown }, ["ref"]);
    if (typeof local.ref === "function") use(local.ref as (target: unknown) => void, el);
    spread(el, rest, false);
    return el as SolidJSX.Element;
  };
}

export const Group = hostElement<GroupProps>("Group");
export const Rect = hostElement<RectProps>("Rect");
export const Path = hostElement<PathProps>("Path");
export const Video = hostElement<VideoProps>("Video");
export const Image = hostElement<ImageProps>("Image");
export const Audio = hostElement<AudioProps>("Audio");
export const Text = hostElement<TextProps>("Text");
export const Sequence = hostElement<SequenceProps>("Sequence");
export const Captions = hostElement<CaptionsProps>("Captions");
export const SolidPaint = hostElement<SolidPaintProps>("SolidPaint");
export const LinearGradientPaint = hostElement<GradientPaintProps>("LinearGradientPaint");
export const RadialGradientPaint = hostElement<GradientPaintProps>("RadialGradientPaint");
export const ColorStop = hostElement<ColorStopProps>("ColorStop");
export const HtmlPaint = hostElement<HtmlPaintProps>("HtmlPaint");
export const Html = hostElement<HtmlProps>("Html");
export const ShaderPaint = hostElement<ShaderPaintProps>("ShaderPaint");
export const SurfacePaint = hostElement<SurfacePaintProps>("SurfacePaint");
export const Surface = hostElement<SurfaceProps>("Surface");
