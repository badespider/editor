/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { JSX as SolidJSX } from "solid-js";
import type { AssetRef } from "./generate";

/**
 * Composition-relative time: seconds (number), frames ("30f"), or a
 * "MM:SS" / "HH:MM:SS" clock string. The canonical internal unit is frames
 * at 30 fps; all formats are converted on import. Values may be negative.
 */
export type Time = number | `${number}f` | `${string}:${string}`;

export type Fit = "cover" | "contain" | "fill";

/**
 * Easing for the segment from a keyframe to the next one: a named preset or
 * an explicit descriptor. `cubicBezier(x1,y1,x2,y2)` takes CSS-style control
 * points, `spring(bounce,duration)` a 0–1 bounce and a duration in ms,
 * `steps(n)` holds n discrete values.
 */
export type Easing =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "gentle"
  | "snappy"
  | "bouncy"
  | "strong"
  | `cubicBezier(${string})`
  | `spring(${string})`
  | `steps(${string})`;

export type Keyframe<T> = {
  /** Node-local time: 0 is where the clip begins (its `start`). Any `Time` format. */
  time: Time;
  value: T;
  /** Shapes the segment to the next keyframe; ignored on the last. Default "linear". */
  easing?: Easing;
};

/**
 * A static value, or keyframes animating it over the node's local time.
 * Setting a static value removes any existing keyframe track on the property.
 */
export type Animatable<T> = T | Keyframe<T>[];

/** Transition styles — the editor's transition inspector options. */
export type TransitionType =
  | "dissolve"
  | "slideFromRight"
  | "slideFromLeft"
  | "fadeToBlack"
  | "fadeToWhite";

/** The `transition` prop's value — see `PatchProps["transition"]`. */
export type TransitionSpec = {
  /** Transition style. Default "dissolve". */
  type?: TransitionType;
  /** Length of the transition, centered on the cut. Any `Time` format. Default 1 second. */
  duration?: Time;
};

/**
 * Preset animation styles — the editor's animations inspector options.
 * "appearWord" / "appearChar" / "scramble" apply only to text elements;
 * "gain" ramps audio and has no visual effect.
 */
export type AnimationType =
  | "fade"
  | "gain"
  | "grow"
  | "shrink"
  | "blur"
  | "slideLeft"
  | "slideRight"
  | "slideUp"
  | "slideDown"
  | "spin"
  | "twist"
  | "appearWord"
  | "appearChar"
  | "scramble";

/** One entry of the `animations` prop's list — see `PatchProps["animations"]`. */
export type AnimationSpec = {
  /** Animation style. */
  type: AnimationType;
  /** "in" plays from the clip's head, "out" into its tail. Default "in". */
  phase?: "in" | "out";
  /** Length of the animation. Any `Time` format. Default 1 second. */
  duration?: Time;
  /**
   * Gap between the clip edge and the animation: after the head for "in",
   * before the tail for "out". Any `Time` format. Default 0.
   */
  delay?: Time;
};

/** Caption style presets — the editor's caption inspector presets. */
export type CaptionPreset =
  | "classic"
  | "cascade"
  | "spotlight"
  | "whisper"
  | "paper"
  | "guinea"
  | "stark";

/**
 * Every property assignable through the renderer — exactly the set
 * `WorldDocument.setProperty` accepts. This is the single property table:
 * element props pick from it, and `dapi node patch` takes any subset per
 * patch entry with identical value requirements, so JSX and CLI can't drift.
 */
export type PatchProps = {
  /**
   * A within-render label so another node can reference this one: `syncTo`
   * names the `key` of the clip it aligns against. Not a mount mechanism, and
   * invalid on a scene root, which is identified by `scene`.
   */
  key?: string;
  /**
   * Promotes this element to a scene (mount root), and is the root's stable
   * identity across mounts: re-mounting replaces the scene carrying the same
   * `scene` value, or creates it if absent. Only valid on `<rect>`; a scene
   * root cannot also carry placement or timing props (`x`/`y`/`start`/`end`/
   * `transition`/`animations`) or a separate `key`.
   */
  scene?: string;
  /** Human-readable node name. */
  name?: string;
  /** Position relative to the parent, px. Defaults to 0. Animatable. */
  x?: Animatable<number>;
  y?: Animatable<number>;
  /**
   * Render-time translation on top of `x`/`y`, px — moves the drawn content
   * without changing the layout box (the property slide animations drive).
   * Subpixel values are kept. Defaults to 0. Animatable.
   */
  offsetX?: Animatable<number>;
  offsetY?: Animatable<number>;
  /** Box size, px. Defaults to the parent's size. Animatable. */
  width?: Animatable<number>;
  height?: Animatable<number>;
  /** Rotation in degrees. Animatable. */
  rotation?: Animatable<number>;
  /** Uniform scale around the element's center. Non-negative; 1 is the authored size. Animatable. */
  scale?: Animatable<number>;
  /** Opacity, 0–1 (out-of-range values clamp, like CSS). Animatable. */
  opacity?: Animatable<number>;
  /** Uniform corner radius, px. Animatable. */
  cornerRadius?: Animatable<number>;
  /** Parent-timeline time at which the node begins. Default 0. */
  start?: Time;
  /** Parent-timeline time at which the node ends. Alternative to `sourceOut`. */
  end?: Time;
  /** Source in point: where playback begins within the source, trimming the head. Default 0. */
  sourceIn?: Time;
  /** Source out point: where playback ends within the source. Defaults to the natural end. Alternative to `end`. */
  sourceOut?: Time;
  /**
   * Key of another element carrying an audio track. Derives the timeline
   * placement (`start`) by cross-correlating the two audio signals so the
   * recordings coincide on the timeline. Mutually exclusive with `start`.
   */
  syncTo?: string;
  /**
   * Transition into the next clip, rendered centered on the cut, set on the
   * outgoing clip. Only on direct children of `<Sequence>`; a partial value
   * merges into the clip's existing transition, `null` removes it.
   */
  transition?: TransitionSpec | null;
  /**
   * Preset in/out animations, played over the clip's head and tail. The list
   * replaces the node's existing animations; `[]` removes them all.
   */
  animations?: AnimationSpec[];
  /** Any CSS color, applied to the node's solid fill (created if absent); alpha is ignored — use `opacity`. */
  fill?: string;
  /**
   * Path, URL, asset id, or a `generate.*` declaration. On `<Captions>` a
   * transcript source (.srt, .vtt, or transcript .json) mounted instead of
   * transcribing the scene; `generate.*` is not accepted there.
   */
  src?: string | AssetRef;
  /** How the source maps into the box. Default "cover" on `<Video>`, "contain" on `<Image>`. */
  objectFit?: Fit;
  /**
   * Fragment-stage WGSL of a `<ShaderPaint>`, applied to the video/image
   * paint directly below it in the paint stack, or run procedurally (over a
   * transparent source) when there is none. Entry point
   * `@fragment fn main(@location(0) uv: vec2f) -> @location(0) vec4f`;
   * sample the media with `sampleSource(uv)`.
   */
  wgsl?: string;
  /**
   * Values for the shader's `@group(1)` uniform declarations, matched by
   * name: numbers bind to `f32`, arrays of 2-4 to `vec2f`-`vec4f`, CSS
   * color strings to `vec3f`/`vec4f`.
   */
  uniforms?: Record<string, number | number[] | string>;
  /** Decibels: 0 = unity gain, negative attenuates (-6 ≈ half as loud), -Infinity = silence. Use `muted` to silence. Animatable. */
  volume?: Animatable<number>;
  /** Excludes the node's audio from the mix; independent of `volume`. */
  muted?: boolean;
  /** A family available on the machine (`dapi fonts`). */
  fontFamily?: string;
  /** Font size, px. */
  fontSize?: number;
  /** CSS weights 100–900, or "normal" / "bold". */
  fontWeight?: number | "normal" | "bold";
  fontStyle?: "normal" | "italic";
  /** Any CSS color: the glyph color on `<Text>`, the paint color on paints and color stops. Animatable. */
  color?: Animatable<string>;
  /** Horizontal alignment of glyphs within the box. Default "left". */
  textAlign?: "left" | "center" | "right";
  /** Vertical alignment within the box. Default "top". */
  textBaseline?: "top" | "middle" | "bottom";
  /** Position along the gradient, 0–1. Animatable. */
  offset?: Animatable<number>;
  /** Caption style preset — `<Captions>` only. Default "classic". */
  preset?: CaptionPreset;
  /** Fills the caption preset's color slots in order; any CSS color, alpha is ignored. */
  colors?: string[];
  /**
   * Vertical placement of the caption block — `<Captions>` only: anchored to
   * the top or bottom safe margin, or centered. The preset keeps owning the
   * horizontal placement. Defaults to the preset's own alignment.
   */
  verticalAlign?: "top" | "center" | "bottom";
  /**
   * Transcription seed — `<Captions>` only. Part of the transcript cache key,
   * so a new value bypasses the cached transcript and transcribes the scene
   * again; reusing a value replays that take from cache.
   */
  seed?: number;
};

/** Every PatchProps key, at runtime — the `dapi node patch` allowlist. */
export const PATCH_PROP_KEYS = Object.keys({
  key: true,
  scene: true,
  name: true,
  x: true,
  y: true,
  offsetX: true,
  offsetY: true,
  width: true,
  height: true,
  rotation: true,
  scale: true,
  opacity: true,
  cornerRadius: true,
  start: true,
  end: true,
  sourceIn: true,
  sourceOut: true,
  syncTo: true,
  transition: true,
  animations: true,
  fill: true,
  src: true,
  objectFit: true,
  wgsl: true,
  uniforms: true,
  volume: true,
  muted: true,
  fontFamily: true,
  fontSize: true,
  fontWeight: true,
  fontStyle: true,
  color: true,
  textAlign: true,
  textBaseline: true,
  offset: true,
  preset: true,
  colors: true,
  verticalAlign: true,
  seed: true,
} satisfies Record<keyof PatchProps, true>) as ReadonlyArray<keyof PatchProps>;

type TimingProps = Pick<PatchProps, "start" | "end" | "sourceIn" | "sourceOut">;

type CommonProps = TimingProps &
  Pick<
    PatchProps,
    | "key" | "scene" | "name" | "x" | "y" | "offsetX" | "offsetY" | "width" | "height" | "rotation" | "scale"
    | "opacity" | "cornerRadius" | "transition" | "animations"
  >;

export type GroupProps = CommonProps & Pick<PatchProps, "fill"> & {
  children?: SolidJSX.Element;
};

export type RectProps = CommonProps & Pick<PatchProps, "fill"> & {
  /** Paint children (`<SolidPaint>`, `<LinearGradientPaint>`, `<RadialGradientPaint>`). */
  children?: SolidJSX.Element;
};

export type SolidPaintProps = Required<Pick<PatchProps, "color">> & Pick<PatchProps, "opacity">;

export type GradientPaintProps = Pick<PatchProps, "opacity"> & {
  /** Gradient rotation in degrees. Defaults to 0 (left to right). */
  rotation?: number;
  /** `<ColorStop>` children — the gradient's color stops. */
  children?: SolidJSX.Element;
};

export type ColorStopProps = Required<Pick<PatchProps, "offset" | "color">> &
  Pick<PatchProps, "opacity">;

export type VideoProps = CommonProps &
  Required<Pick<PatchProps, "src">> &
  Pick<PatchProps, "objectFit" | "volume" | "muted" | "syncTo"> & {
    /** Paint children, stacked over the media paint created by `src`. */
    children?: SolidJSX.Element;
  };

export type ImageProps = CommonProps &
  Required<Pick<PatchProps, "src">> &
  Pick<PatchProps, "objectFit"> & {
    /** Paint children, stacked over the media paint created by `src`. */
    children?: SolidJSX.Element;
  };

export type HtmlPaintProps = Pick<PatchProps, "opacity"> & {
  /**
   * HTML children — real DOM elements laid out by the browser at the parent
   * geometry's box size and drawn into it (html-in-canvas). Fully reactive:
   * signals in attributes and text update the drawn content.
   */
  children?: SolidJSX.Element;
};

/** `<Html>` — a rectangle carrying an `<HtmlPaint>` with the given children. */
export type HtmlProps = CommonProps & Pick<HtmlPaintProps, "children">;

// HTMLCanvasElement without requiring the DOM lib (this package also
// type-checks in node contexts): the real type when present, a structural
// stub otherwise.
type HostCanvas = typeof globalThis extends { HTMLCanvasElement: new () => infer T } ? T
  : { width: number; height: number; getContext(contextId: string, options?: unknown): unknown };

/** `<ShaderPaint>` — transforms the media paint directly below it. Takes no children. */
export type ShaderPaintProps = Required<Pick<PatchProps, "wgsl">> &
  Pick<PatchProps, "uniforms" | "opacity">;

export type SurfacePaintProps = Pick<PatchProps, "opacity"> & {
  /**
   * Receives the surface's backing canvas once the paint materializes. Draw to
   * any context type (2d, webgl, webgpu); the engine samples the bitmap every
   * frame and stretches it into the parent geometry's box. Callback form
   * only — the renderer has no element to assign to a variable ref.
   */
  ref: (canvas: HostCanvas) => void;
};

/** `<Surface>` — a rectangle carrying a `<SurfacePaint>` with the given ref. */
export type SurfaceProps = CommonProps & Pick<SurfacePaintProps, "ref">;

export type AudioProps = TimingProps &
  Required<Pick<PatchProps, "src">> &
  Pick<PatchProps, "name" | "volume" | "muted" | "syncTo" | "animations">;

export type TextProps = CommonProps &
  Pick<
    PatchProps,
    "fontFamily" | "fontSize" | "fontWeight" | "fontStyle" | "fill" | "textAlign" | "textBaseline"
  > & {
    /** The text content. Required. */
    children: SolidJSX.Element;
  };

export type SequenceProps = Pick<PatchProps, "name"> & {
  children?: SolidJSX.Element;
};

export type CaptionsProps = Pick<
  PatchProps,
  | "preset" | "colors" | "verticalAlign" | "offsetX" | "offsetY" | "src"
  | "start" | "end" | "sourceIn" | "sourceOut" | "animations" | "seed"
>;
