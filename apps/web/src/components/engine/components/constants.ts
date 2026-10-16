/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export enum BlendMode {
  SOURCE_OVER,
  MULTIPLY,
  SCREEN,
  OVERLAY,
  DARKEN,
  LIGHTEN,
  COLOR_DODGE,
  COLOR_BURN,
  HARD_LIGHT,
  SOFT_LIGHT,
  DIFFERENCE,
  EXCLUSION,
  HUE,
  SATURATION,
  COLOR,
  LUMINOSITY,
};

export const COMPOSITE_OPERATIONS = Object.keys(BlendMode)
  .filter(key => isNaN(Number(key)))
  .map(key => key.toLowerCase().replace(/_/g, '-')) as GlobalCompositeOperation[];

export enum StrokeJoin {
  MITER,
  ROUND,
  BEVEL,
}

export enum StrokeCap {
  BUTT,
  ROUND,
  SQUARE,
}

export enum ScaleMode {
  COVER,
  FILL,
  FIT,
  NONE,
}

export enum ConstraintType {
  MIN,
  MAX,
  CENTER,
  STRETCH,
  SCALE,
}

export enum GeometryType {
  RECT,
  TEXT,
  PATH,
}

export enum PaintType {
  SOLID,
  IMAGE,
  VIDEO,
  LINEAR_GRADIENT,
  RADIAL_GRADIENT,
  SEQUENCE,
  WAVEFORM,
  HTML,
  SURFACE,
  SHADER,
}

export enum EffectType {
  DROP_SHADOW,
  LAYER_BLUR,
  BRIGHTNESS,
  CONTRAST,
  GRAYSCALE,
  HUE_ROTATION,
  INVERT,
  SATURATE,
  SEPIA,
}

export enum MotionType {
  ANIMATION,
  KEYFRAME,
}

export enum AnimationType {
  FADE,
  GAIN,
  GROW,
  SHRINK,
  BLUR,
  SLIDE_LEFT,
  SLIDE_RIGHT,
  SLIDE_UP,
  SLIDE_DOWN,
  SPIN,
  TWIST,
  APPEAR_WORD,
  APPEAR_CHAR,
  SCRAMBLE,
}

export enum AnimationPhase {
  IN,
  OUT,
}

export enum TextAlign {
  LEFT,
  CENTER,
  RIGHT,
}

export enum TextBaseline {
  TOP,
  MIDDLE,
  BOTTOM,
  ALPHABETIC,
}

export enum TextCase {
  ORIGINAL,
  UPPER,
  LOWER,
}

export enum FontStyle {
  NORMAL,
  ITALIC,
  OBLIQUE,
}

export enum TransitionType {
  DISSOLVE,
  SLIDE_FROM_RIGHT,
  SLIDE_FROM_LEFT,
  FADE_TO_BLACK,
  FADE_TO_WHITE,
}

export enum CaptionType {
  CLASSIC,
  CASCADE,
  SPOTLIGHT,
  WHISPER,
  PAPER,
  GUINEA,
  STARK,
}

export enum CaptionAlign {
  TOP,
  CENTER,
  BOTTOM,
}

export enum ToolType {
  MOVE,
  HAND,
  BLADE,
  SCENE,
  RECT,
  TEXT,
  TEXT_EDIT,
}
