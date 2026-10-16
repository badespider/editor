/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { clamp } from "@/utils";
import { colorToHex } from "@/utils/color";
import { COMPOSITE_OPERATIONS, PaintType, FontStyle, StrokeCap, StrokeJoin, TextAlign, TextBaseline, TextCase } from "../components";
import { createLinearGradient, createRadialGradient } from "../systems/render";
import { hasComponent } from "bitecs";

import type { EngineWorld } from "../api/world";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type TokenOptions = {
  /**
   * Defines the characters to render
   */
  chars: string;
  /**
   * Defines the X offset of the token to the left of the line
   */
  offset: number;
  /**
   * Defines the metrics of the token
   */
  metrics: TextMetrics;
  /**
   * Defines the style of the token
   */
  ranges: number[];
}

export type Line = {
  offsetX: number;
  offsetY: number;
  baseline: number;
  height: number;
};

type RenderSplit = {
  words: string[];
  ranges: number[];
};

/** Global offscreen canvas used solely for text measurement. */
let measureCanvas: OffscreenCanvas | null = null;
let measureCtx: OffscreenCanvasRenderingContext2D | null = null;

function getMeasureCtx(): OffscreenCanvasRenderingContext2D {
  if (!measureCtx) {
    measureCanvas = new OffscreenCanvas(1, 1);
    measureCtx = measureCanvas.getContext('2d', { willReadFrequently: true, alpha: true })!;
  }
  return measureCtx;
}

export class Token {
  public offset: number;
  public metrics: TextMetrics;
  public ranges: number[];
  public chars: string;
  public width: number;
  public height: number;
  public line = { offsetX: 0, offsetY: 0, baseline: 0, height: 0 };

  constructor(options: TokenOptions) {
    this.offset = options.offset;
    this.metrics = options.metrics;
    this.ranges = options.ranges;
    this.width = options.metrics.width;
    this.height = options.metrics.fontBoundingBoxAscent + options.metrics.fontBoundingBoxDescent;
    this.chars = options.chars;
  }

  public get x(): number {
    return (this.offset + this.line.offsetX) | 0;
  }

  public get y(): number {
    return (this.line.offsetY + this.line.baseline) | 0;
  }

  public get left(): number {
    return (
      this.offset +
      this.line.offsetX -
      this.metrics.actualBoundingBoxLeft
    ) | 0;
  }

  public get right(): number {
    return (
      this.offset +
      this.line.offsetX +
      this.metrics.actualBoundingBoxRight
    ) | 0;
  }

  public get top(): number {
    return (
      this.line.offsetY +
      this.line.baseline -
      this.metrics.actualBoundingBoxAscent
    ) | 0
  }

  public get bottom(): number {
    return (
      this.line.offsetY +
      this.line.baseline +
      this.metrics.actualBoundingBoxDescent
    ) | 0
  }

  public setLine(line: Line) {
    this.line = { ...line };
  }
}

function applyFont(ctx: Ctx, world: EngineWorld, eid: number, ranges: number[]) {
  const size = getFontSize(world, eid, ranges);
  const family = getFontFamily(world, eid, ranges);
  const weight = getFontWeight(world, eid, ranges);
  const style = getFontStyle(world, eid, ranges);
  const baseline = getTextBaseline(world, eid, ranges);
  const spacing = getLetterSpacing(world, eid, ranges);

  const mappedStyle = FontStyle[style].toLowerCase();
  const mappedBaseline = TextBaseline[baseline].toLowerCase() as CanvasTextBaseline;

  ctx.font = `${mappedStyle} ${weight.toLowerCase()} ${size}px ${family}`.trim();
  ctx.textBaseline = mappedBaseline;
  ctx.letterSpacing = `${spacing}px`;
}

function applyStroke(ctx: Ctx, world: EngineWorld, eid: number) {
  const Stroke = world.components.StrokeStyle;

  ctx.lineWidth = Stroke.width[eid] ?? 1;
  ctx.lineJoin = StrokeJoin[Stroke.join[eid] ?? 0].toLocaleLowerCase() as CanvasLineJoin;
  ctx.lineCap = StrokeCap[Stroke.cap[eid] ?? 0].toLocaleLowerCase() as CanvasLineCap;
  ctx.miterLimit = Stroke.miterLimit[eid] ?? 3;
}

function shapeTokens(world: EngineWorld, eid: number): void {
  const Computed = world.components.Computed;
  const Size = world.components.Size;
  const lines = world.components.TextCache.tokens[eid];
  const leading = world.components.TextStyle.leading[eid] ?? 1;
  const textAlign = world.components.TextStyle.textAlign[eid] ?? TextAlign.LEFT;
  const textBaseline = world.components.TextStyle.textBaseline[eid] ?? TextBaseline.TOP;
  if (!lines) return;

  // Measure each line's width by summing word widths and spaces
  const lineWidths: number[] = lines.map(line => line.reduce((acc, word) => acc + word.width, 0));
  const lineHeights: number[] = lines.map(line => Math.max(...line.map(word => word.height)));

  // Find the maximum line width
  const maxLineWidth = Math.max(...lineWidths);

  // Calculate total height based on leading
  const totalHeight = lineHeights.reduce((acc, height, i) => acc + height * (i < lineHeights.length - 1 ? leading : 1), 0);

  // When Size is assigned, use Computed for positioning; otherwise set it from text dimensions
  const hasSizeComponent = hasComponent(world, eid, Size);
  const explicitClipBox = hasSizeComponent && hasComponent(world, eid, world.components.ClipToBox);
  if (!hasSizeComponent || !explicitClipBox && (!Computed.width[eid] || !Computed.height[eid])) {
    Computed.width[eid] = Math.ceil(maxLineWidth);
    Computed.height[eid] = Math.ceil(totalHeight);
  }

  const containerWidth = Computed.width[eid];
  const containerHeight = Computed.height[eid];

  // Calculate initial vertical offset based on text baseline and container height
  let offsetY = 0;
  if (textBaseline === TextBaseline.MIDDLE) {
    offsetY = (containerHeight - totalHeight) / 2;
  } else if (textBaseline === TextBaseline.BOTTOM) {
    offsetY = containerHeight - totalHeight;
  }

  // Calculate coordinates for each word
  const line = {
    offsetX: 0,
    offsetY,
    baseline: 0,
    height: 0,
  };

  for (let l = 0; l < lines.length; l++) {
    line.height = lineHeights[l];

    if (textAlign === TextAlign.LEFT) {
      line.offsetX = 0;
    } else if (textAlign === TextAlign.CENTER) {
      line.offsetX = (containerWidth - lineWidths[l]) / 2;
    } else if (textAlign === TextAlign.RIGHT) {
      line.offsetX = containerWidth - lineWidths[l];
    }

    if (textBaseline === TextBaseline.TOP) {
      line.baseline = 0;
    } else if (textBaseline === TextBaseline.MIDDLE) {
      line.baseline = lineHeights[l] / 2;
    } else if (textBaseline === TextBaseline.BOTTOM) {
      line.baseline = lineHeights[l];
    } else if (textBaseline === TextBaseline.ALPHABETIC) {
      const maxAscent = Math.max(...lines[l].map(word => word.metrics.fontBoundingBoxAscent));
      line.baseline = maxAscent || lineHeights[l] * 0.75; // Fallback if no words in line
    }

    for (const word of lines[l]) {
      word.setLine(line);
    }

    line.offsetY += lineHeights[l] * leading;
  }
}

function tokenizeText(world: EngineWorld, eid: number) {
  const ctx = getMeasureCtx();

  // Split text into segments based on style overrides first
  const lines: Token[][] = [[]];

  let maxWidth = world.components.Size.width[eid] ?? Number.POSITIVE_INFINITY;
  if (typeof maxWidth === 'string') {
    maxWidth = world.components.Computed.width[eid] ?? Number.POSITIVE_INFINITY;
  }

  let offset = 0;
  for (const { words, ranges } of createRenderSplits(world, eid)) {
    applyFont(ctx, world, eid, ranges);

    for (const word of words) {
      const splits = word.split('\n');

      for (let i = 0; i < splits.length; i++) {
        const caseValue = getTextCase(world, eid, ranges);
        const chars = transformText(splits[i], caseValue);

        const metrics = ctx.measureText(chars);

        // check if word is too wide for the current line but not the first word
        if (offset + metrics.width > maxWidth && offset > 0) {
          lines.push([]);
          offset = 0;
        }

        // add word to current line
        lines[lines.length - 1].push(new Token({ chars, ranges, metrics, offset }));
        offset += metrics.width;

        // add new line if not the last line
        if (i < splits.length - 1) {
          lines.push([]);
          offset = 0;
        }
      }
    }
  }

  world.components.TextCache.tokens[eid] = lines;
}

/** Renders text tokens directly to the given canvas context. */
function renderTokens(ctx: Ctx, world: EngineWorld, eid: number): void {
  const lines = world.components.TextCache.tokens[eid];
  if (!lines) return;
  const words = lines.flat();

  const savedAlpha = ctx.globalAlpha;

  // Draw all text shadows
  {
    ctx.save();
    ctx.textAlign = 'start';
    ctx.textBaseline = 'top';

    // ctx.shadowBlur/OffsetX/OffsetY are in device-pixel space and are not
    // affected by the current transform, so scale them up to match the
    // content transform (camera * resolution).
    const shadowScale = world.camera.a * world.resolution;

    for (const word of words) {
      applyFont(ctx, world, eid, word.ranges);

      const strokes = getStrokes(world, eid, word.ranges);
      const shadows = getShadows(world, eid, word.ranges);

      if (strokes.length) {
        applyStroke(ctx, world, eid);
      }

      // Draw shadows first (if any)
      for (const sid of shadows) {
        if (hasComponent(world, sid, world.components.Hidden)) continue;

        ctx.shadowOffsetX = (world.components.Offset.x[sid] ?? 0) * shadowScale;
        ctx.shadowOffsetY = (world.components.Offset.y[sid] ?? 0) * shadowScale;
        ctx.shadowBlur = (world.components.Blur[sid] ?? 0) * shadowScale;
        ctx.shadowColor = colorToHex(world.components.Color[sid] ?? 0x000000);
        ctx.fillStyle = colorToHex(world.components.Color[sid] ?? 0x000000);
        ctx.globalAlpha = savedAlpha * (world.components.Appearance.opacity[sid] ?? 1);

        if (strokes.length) {
          ctx.strokeText(word.chars, word.x, word.y);
        } else {
          ctx.fillText(word.chars, word.x, word.y);
        }
      }

      // Reset shadow properties if any shadows are applied
      if (shadows.length) {
        ctx.globalAlpha = savedAlpha;
        ctx.shadowColor = 'transparent';
      }
    }
    ctx.restore();
  }

  // Draw all text strokes
  {
    ctx.save();
    ctx.textAlign = 'start';
    ctx.textBaseline = 'top';

    for (const word of words) {
      const strokes = getStrokes(world, eid, word.ranges);
      if (!strokes.length) continue;

      applyFont(ctx, world, eid, word.ranges);
      applyStroke(ctx, world, eid);

      const w = world.components.Computed.width[eid];
      const h = world.components.Computed.height[eid];

      // Draw strokes (if any)
      for (const sid of strokes) {
        if (hasComponent(world, sid, world.components.Hidden)) continue;

        const savedCO = ctx.globalCompositeOperation;
        const blendMode = world.components.Appearance.blendMode[sid] ?? 0;
        if (blendMode !== 0) {
          ctx.globalCompositeOperation = COMPOSITE_OPERATIONS[blendMode];
        }
        ctx.globalAlpha = savedAlpha * (world.components.Appearance.opacity[sid] ?? 1);

        const paintType = world.components.Paint[sid];
        if (paintType === PaintType.LINEAR_GRADIENT) {
          ctx.strokeStyle = createLinearGradient(world, sid, ctx, w, h);
        } else if (paintType === PaintType.RADIAL_GRADIENT) {
          ctx.strokeStyle = createRadialGradient(world, sid, ctx, w, h);
        } else {
          ctx.strokeStyle = colorToHex(world.components.Color[sid] ?? 0x000000);
        }
        ctx.strokeText(word.chars, word.x, word.y);
        ctx.globalCompositeOperation = savedCO;
      }
    }
    ctx.restore();
  }

  // Draw all text fills
  {
    ctx.save();
    ctx.textAlign = 'start';
    ctx.textBaseline = 'top';

    for (const word of words) {
      const fills = getFills(world, eid, word.ranges);
      if (!fills.length) continue;

      applyFont(ctx, world, eid, word.ranges);

      const w = world.components.Computed.width[eid];
      const h = world.components.Computed.height[eid];

      for (const fid of fills) {
        if (hasComponent(world, fid, world.components.Hidden)) continue;

        const savedCO = ctx.globalCompositeOperation;
        const blendMode = world.components.Appearance.blendMode[fid] ?? 0;
        if (blendMode !== 0) {
          ctx.globalCompositeOperation = COMPOSITE_OPERATIONS[blendMode];
        }
        ctx.globalAlpha = savedAlpha * (world.components.Appearance.opacity[fid] ?? 1);

        const paintType = world.components.Paint[fid];
        if (paintType === PaintType.LINEAR_GRADIENT) {
          ctx.fillStyle = createLinearGradient(world, fid, ctx, w, h);
        } else if (paintType === PaintType.RADIAL_GRADIENT) {
          ctx.fillStyle = createRadialGradient(world, fid, ctx, w, h);
        } else {
          ctx.fillStyle = colorToHex(world.components.Color[fid] ?? 0x000000);
        }
        ctx.fillText(word.chars, word.x, word.y);
        ctx.globalCompositeOperation = savedCO;
      }
    }
    ctx.restore();
  }
}

/** Render text tokens directly to world.ctx. Call measureText first. */
export function renderText(world: EngineWorld, eid: number) {
  const ctx = world.ctx;
  if (!ctx) return;
  tokenizeText(world, eid);
  shapeTokens(world, eid);
  renderTokens(ctx, world, eid);
}

/**
 * Splits text into segments based on overlapping text range eids.
 * Handles overlapping ranges by merging their eids.
 * @returns Array of RenderSplit objects with words, merged style, and contributing styleIds
 */
function createRenderSplits(world: EngineWorld, eid: number): RenderSplit[] {
  const chars = world.components.Computed.chars[eid] ?? world.components.Chars[eid] ?? '';

  const textRangeEids = world.components.Cache.textRanges[eid];

  // Fast path: no styles
  if (textRangeEids.length === 0) {
    return [{
      words: tokenize(chars),
      ranges: [],
    }];
  }

  // Fast path: empty text
  if (chars.length === 0) {
    return [{
      words: [],
      ranges: [],
    }];
  }

  // Collect all unique boundary points
  const boundaries = new Set<number>();
  boundaries.add(0);
  boundaries.add(chars.length);

  for (const rid of textRangeEids) {
    let start = world.components.TextRange.start[rid] ?? 0;
    let end = world.components.TextRange.end[rid] ?? chars.length;

    // Clamp boundaries to valid text range
    start = clamp(start, 0, chars.length);
    end = clamp(end, 0, chars.length);

    boundaries.add(start);
    boundaries.add(end);
  }

  // Sort boundaries in ascending order
  const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);

  // Create segments between each pair of boundaries
  const segments: RenderSplit[] = [];

  for (let i = 0; i < sortedBoundaries.length - 1; i++) {
    const segStart = sortedBoundaries[i];
    const segEnd = sortedBoundaries[i + 1];

    // Skip empty segments
    if (segStart >= segEnd) continue;

    // Find all active styles for this segment
    const ranges: number[] = [];

    for (const rid of textRangeEids) {
      let start = world.components.TextRange.start[rid] ?? 0;
      let end = world.components.TextRange.end[rid] ?? chars.length;

      // Clamp boundaries to valid text range
      start = clamp(start, 0, chars.length);
      end = clamp(end, 0, chars.length);

      // A style is active if segment falls within its range [start, end)
      // Using < for end to treat ranges as [start, end)
      if (start <= segStart && end > segStart) {
        ranges.push(rid);
      }
    }

    segments.push({
      words: tokenize(chars.slice(segStart, segEnd)),
      ranges: ranges,
    });
  }

  return segments;
}

function tokenize(input: string): string[] {
  // Fast path for inputs without spaces
  if (input.indexOf(' ') === -1) {
    return [input];
  }

  // Use regex to match:
  // 1. Any characters up to and including a space
  // 2. OR any remaining characters to the end
  return input.match(/[^]*? |[^]+$/g) || [input];
}

export function transformText(text: string, textCase?: number): string {
  if (textCase == TextCase.LOWER) {
    return text.toLocaleLowerCase();
  }

  if (textCase == TextCase.UPPER) {
    return text.toUpperCase();
  }

  return text;
}


function getFills(world: EngineWorld, eid: number, ranges: number[]) {
  let value = world.components.Cache.fills[eid];

  for (const rid of ranges) {
    const rangeValue = world.components.Cache.fills[rid];
    if (rangeValue.length) {
      value = rangeValue;
    }
  }

  return value;
}


function getStrokes(world: EngineWorld, eid: number, ranges: number[]) {
  let value = world.components.Cache.strokes[eid];

  for (const rid of ranges) {
    const rangeValue = world.components.Cache.strokes[rid];
    if (rangeValue.length) {
      value = rangeValue;
    }
  }

  return value;
}

function getShadows(world: EngineWorld, eid: number, ranges: number[]) {
  let value = world.components.Cache.shadows[eid];

  for (const rid of ranges) {
    const rangeValue = world.components.Cache.shadows[rid];
    if (rangeValue.length) {
      value = rangeValue;
    }
  }

  return value;
}

function getTextCase(world: EngineWorld, eid: number, ranges: number[]) {
  let value = world.components.TextStyle.textCase[eid] ?? 0;

  for (const rid of ranges) {
    const rangeValue = world.components.TextStyle.textCase[rid];
    if (rangeValue !== undefined) {
      value = rangeValue;
    }
  }

  return value;
}

function getFontSize(world: EngineWorld, eid: number, ranges: number[]) {
  let value = world.components.TextStyle.fontSize[eid] ?? 16;

  for (const rid of ranges) {
    const rangeValue = world.components.TextStyle.fontSize[rid];
    if (rangeValue !== undefined) {
      value = rangeValue;
    }
  }

  return value;
}

function getFontFamily(world: EngineWorld, eid: number, ranges: number[]) {
  let value = world.components.TextStyle.fontFamily[eid] ?? 'Inter';

  for (const rid of ranges) {
    const rangeValue = world.components.TextStyle.fontFamily[rid];
    if (rangeValue !== undefined) {
      value = rangeValue;
    }
  }

  return value;
}

function getFontWeight(world: EngineWorld, eid: number, ranges: number[]) {
  let value = world.components.TextStyle.fontWeight[eid] ?? '400';

  for (const rid of ranges) {
    const rangeValue = world.components.TextStyle.fontWeight[rid];
    if (rangeValue !== undefined) {
      value = rangeValue;
    }
  }

  return value;
}


function getFontStyle(world: EngineWorld, eid: number, ranges: number[]) {
  let value = world.components.TextStyle.fontStyle[eid] ?? FontStyle.NORMAL;

  for (const rid of ranges) {
    const rangeValue = world.components.TextStyle.fontStyle[rid];
    if (rangeValue !== undefined) {
      value = rangeValue;
    }
  }

  return value;
}

function getTextBaseline(world: EngineWorld, eid: number, ranges: number[]) {
  let value = world.components.TextStyle.textBaseline[eid] ?? TextBaseline.TOP;

  for (const rid of ranges) {
    const rangeValue = world.components.TextStyle.textBaseline[rid];
    if (rangeValue !== undefined) {
      value = rangeValue;
    }
  }

  return value;
}

function getLetterSpacing(world: EngineWorld, eid: number, ranges: number[]) {
  let value = world.components.TextStyle.letterSpacing[eid] ?? 0;

  for (const rid of ranges) {
    const rangeValue = world.components.TextStyle.letterSpacing[rid];
    if (rangeValue !== undefined) {
      value = rangeValue;
    }
  }

  return value;
}
