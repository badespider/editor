/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { hasComponent, query, Not, Or } from 'bitecs';
import { ChildOf, COMPOSITE_OPERATIONS, EffectType, GeometryType, PaintType, ScaleMode, StrokeCap, StrokeJoin, TransitionType } from '../components';
import { getParentEntity } from '../api/base';
import { cubicBezier } from 'animejs';
import { resolveImageDecoder, resolveVideoDecoder, resolveSequenceDecoder, resolveCaptionDecoder, resolveShaderHost } from '../decoders';
import { getAudioPeaks } from '../decoders/audio-peaks';
import { renderText } from '../utils/text';
import { getTransitionWindow } from '../utils/transition';
import { colorToHex } from '../../../utils/color';
import { handleCanvasInteraction, handleGeometryInteraction } from '../api/interactions';

import type { EngineWorld } from '../api/world';
import type { Quad } from '..';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const MISSING_ASSET_COLOR = '#5C2828';

export function drawRectPath(world: EngineWorld, eid: number): void {
	const ctx = world.ctx!;
	const c = world.components;
	const w = c.Computed.width[eid];
	const h = c.Computed.height[eid];

	const computed = c.Computed;
	const hasMixed = hasComponent(world, eid, c.MixedCornerRadius);
	let tl = hasMixed ? computed.cornerRadiusTopLeft[eid] : computed.cornerRadius[eid];
	let tr = hasMixed ? computed.cornerRadiusTopRight[eid] : tl;
	let br = hasMixed ? computed.cornerRadiusBottomRight[eid] : tl;
	let bl = hasMixed ? computed.cornerRadiusBottomLeft[eid] : tl;

	ctx.beginPath();

	if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
		ctx.rect(0, 0, w, h);
	} else if (tl === tr && tr === br && br === bl) {
		ctx.roundRect(0, 0, w, h, tl);
	} else {
		// Clamp radii so adjacent corners don't exceed the edge length (CSS spec algorithm)
		const scale = Math.min(
			w / (tl + tr || 1),
			h / (tr + br || 1),
			w / (br + bl || 1),
			h / (bl + tl || 1),
			1,
		);
		if (scale < 1) {
			tl *= scale;
			tr *= scale;
			br *= scale;
			bl *= scale;
		}

		ctx.moveTo(tl, 0);
		ctx.lineTo(w - tr, 0);
		if (tr > 0) ctx.arcTo(w, 0, w, tr, tr);
		else ctx.lineTo(w, 0);
		ctx.lineTo(w, h - br);
		if (br > 0) ctx.arcTo(w, h, w - br, h, br);
		else ctx.lineTo(w, h);
		ctx.lineTo(bl, h);
		if (bl > 0) ctx.arcTo(0, h, 0, h - bl, bl);
		else ctx.lineTo(0, h);
		ctx.lineTo(0, tl);
		if (tl > 0) ctx.arcTo(0, 0, tl, 0, tl);
		else ctx.lineTo(0, 0);
	}

	ctx.closePath();
}

function getScaledImageProps(
	mode: number,
	imgW: number,
	imgH: number,
	targetW: number,
	targetH: number,
): [dx: number, dy: number, sw: number, sh: number] {
	if (mode === ScaleMode.FILL) {
		return [0, 0, targetW, targetH];
	}
	if (mode === ScaleMode.FIT) {
		const scale = Math.min(targetW / imgW, targetH / imgH);
		const sw = imgW * scale;
		const sh = imgH * scale;
		return [(targetW - sw) / 2, (targetH - sh) / 2, sw, sh];
	}
	if (mode === ScaleMode.COVER) {
		const scale = Math.max(targetW / imgW, targetH / imgH);
		const sw = imgW * scale;
		const sh = imgH * scale;
		return [(targetW - sw) / 2, (targetH - sh) / 2, sw, sh];
	}
	// ScaleMode.NONE — original size
	return [0, 0, imgW, imgH];
}

/** Create a canvas linear gradient from ECS components. */
export function createLinearGradient(
	world: EngineWorld,
	fid: number,
	ctx: Ctx2D,
	w: number,
	h: number,
): CanvasGradient {
	const Computed = world.components.Computed;

	// (px, py) is the gradient center in normalized shape-local space. Fills
	// without a Position component (the default for stock gradient fills) get
	// (0.5, 0.5) so the gradient spans the shape. With Position present, the
	// motion-system-sampled Computed values are used (keyframeable).
	const hasPos = hasComponent(world, fid, world.components.Position);
	const px = hasPos ? Computed.positionX[fid] : 0.5;
	const py = hasPos ? Computed.positionY[fid] : 0.5;
	const sx = Computed.scaleX[fid];
	const sy = Computed.scaleY[fid];
	const angle = (Computed.rotation[fid] * Math.PI) / 180;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);

	// Transform normalized start (0, 0.5) and end (1, 0.5) points
	const startLocalX = (0 - 0.5) * sx;
	const startLocalY = (0.5 - 0.5) * sy;
	const x0 = (px + startLocalX * cos - startLocalY * sin) * w;
	const y0 = (py + startLocalX * sin + startLocalY * cos) * h;

	const endLocalX = (1 - 0.5) * sx;
	const endLocalY = (0.5 - 0.5) * sy;
	const x1 = (px + endLocalX * cos - endLocalY * sin) * w;
	const y1 = (py + endLocalX * sin + endLocalY * cos) * h;

	const gradient = ctx.createLinearGradient(x0, y0, x1, y1);

	addStopsTo(world, fid, gradient);
	return gradient;
}

/** Create a canvas radial gradient from ECS components. */
export function createRadialGradient(
	world: EngineWorld,
	fid: number,
	ctx: Ctx2D,
	w: number,
	h: number,
): CanvasGradient {
	const Computed = world.components.Computed;

	const hasPos = hasComponent(world, fid, world.components.Position);
	const px = hasPos ? Computed.positionX[fid] : 0.5;
	const py = hasPos ? Computed.positionY[fid] : 0.5;
	const sx = Computed.scaleX[fid];
	const sy = Computed.scaleY[fid];
	const angle = (Computed.rotation[fid] * Math.PI) / 180;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);

	// Center point (0.5, 0.5) in normalized space
	const cx = px * w;
	const cy = py * h;

	// Edge points to determine radius
	const edgeXLocalX = (1 - 0.5) * sx;
	const edgeXLocalY = (0.5 - 0.5) * sy;
	const edgeXAbsX = (px + edgeXLocalX * cos - edgeXLocalY * sin) * w;
	const edgeXAbsY = (py + edgeXLocalX * sin + edgeXLocalY * cos) * h;

	const edgeYLocalX = (0.5 - 0.5) * sx;
	const edgeYLocalY = (1 - 0.5) * sy;
	const edgeYAbsX = (px + edgeYLocalX * cos - edgeYLocalY * sin) * w;
	const edgeYAbsY = (py + edgeYLocalX * sin + edgeYLocalY * cos) * h;

	const distX = Math.hypot(edgeXAbsX - cx, edgeXAbsY - cy);
	const distY = Math.hypot(edgeYAbsX - cx, edgeYAbsY - cy);
	const outerRadius = Math.max(0.0001, distX, distY);

	const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerRadius);

	addStopsTo(world, fid, gradient);
	return gradient;
}

/** Push a fill's ColorStop children onto a CanvasGradient. Reads Computed
 *  values so the latest keyframe-sampled state is what gets painted. Offsets
 *  beyond 1 wrap via modulo (1.5 → 0.5) so animated stops can cycle; offset
 *  exactly 1 is preserved as the gradient end. */
function addStopsTo(world: EngineWorld, fid: number, gradient: CanvasGradient): void {
	const c = world.components;
	const Computed = c.Computed;
	const stops = [...query(world, [c.ColorStop, ChildOf(fid), Not(c.Deleted)])]
		.map(sid => {
			const raw = Computed.stopOffset[sid];
			return {
				offset: raw <= 1 ? Math.max(0, raw) : raw % 1,
				color: Computed.stopColor[sid],
				opacity: Computed.stopOpacity[sid],
			};
		})
		.sort((a, b) => a.offset - b.offset);

	for (const { offset, color, opacity } of stops) {
		gradient.addColorStop(offset, toGradientColor(color, opacity));
	}
}

function toGradientColor(color: number, opacity: number): string {
	if (opacity >= 1) return colorToHex(color);

	const r = (color >> 16) & 0xFF;
	const g = (color >> 8) & 0xFF;
	const b = color & 0xFF;
	return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, opacity))})`;
}

const EPSILON = 1e-4;

/** Build a single CSS filter fragment from an effect sub-entity. Returns null if hidden or no-op. */
function effectFilter(world: EngineWorld, subEid: number): string | null {
	const c = world.components;

	if (hasComponent(world, subEid, c.Hidden)) return null;

	const value = c.Computed.value[subEid];
	const type = c.Effect.type[subEid] ?? 0;

	if (type === EffectType.LAYER_BLUR) {
		const clamped = Math.max(0, value);
		return clamped > EPSILON ? `blur(${clamped}px)` : null;
	}
	if (type === EffectType.BRIGHTNESS) {
		const clamped = Math.min(1, Math.max(0, value));
		return Math.abs(clamped - 1) > EPSILON ? `brightness(${clamped})` : null;
	}
	if (type === EffectType.CONTRAST) {
		const clamped = Math.min(1, Math.max(0, value));
		return Math.abs(clamped - 1) > EPSILON ? `contrast(${clamped})` : null;
	}
	if (type === EffectType.GRAYSCALE) {
		const clamped = Math.min(1, Math.max(0, value));
		return clamped > EPSILON ? `grayscale(${clamped})` : null;
	}
	if (type === EffectType.HUE_ROTATION) {
		return Math.abs(value) > EPSILON ? `hue-rotate(${value}deg)` : null;
	}
	if (type === EffectType.INVERT) {
		const clamped = Math.min(1, Math.max(0, value));
		return clamped > EPSILON ? `invert(${clamped})` : null;
	}
	if (type === EffectType.SATURATE) {
		const clamped = Math.min(1, Math.max(0, value));
		return Math.abs(clamped - 1) > EPSILON ? `saturate(${clamped})` : null;
	}
	if (type === EffectType.SEPIA) {
		const clamped = Math.min(1, Math.max(0, value));
		return clamped > EPSILON ? `sepia(${clamped})` : null;
	}
	return null;
}

/** Apply CSS filter from effect sub-entities. Returns true if a filter was applied. */
function buildEffects(world: EngineWorld, eid: number): string | null {
	const c = world.components;

	const parts: string[] = [];

	const blurVal = c.Computed.blur[eid];
	if (blurVal > EPSILON) {
		parts.push(`blur(${blurVal}px)`);
	}

	const effects = c.Cache.effects[eid];
	for (const effect of effects) {
		const f = effectFilter(world, effect);
		if (f) parts.push(f);
	}

	if (parts.length === 0) return null;

	return parts.join(' ');
}

export function renderFills(world: EngineWorld, eid: number): void {
	const c = world.components;
	const ctx = world.ctx!;
	const fills = c.Cache.fills[eid];

	for (let index = 0; index < fills.length; index++) {
		const fid = fills[index];
		if (hasComponent(world, fid, c.Hidden) || shaderConsumesFill(world, eid, fills, index)) continue;
		const savedAlpha = ctx.globalAlpha;
		const savedCO = ctx.globalCompositeOperation;
		const bi = c.Appearance.blendMode[fid] ?? 0;

		if (bi !== 0) {
			ctx.globalCompositeOperation = COMPOSITE_OPERATIONS[bi];
		}

		ctx.globalAlpha = savedAlpha * c.Computed.opacity[fid];

		if (c.Paint[fid] === PaintType.IMAGE) {
			const decoder = resolveImageDecoder(world, fid)?.decoder;
			const w = c.Computed.width[eid];
			const h = c.Computed.height[eid];
			const bitmap = decoder?.getBitmap(w, h);

			if (bitmap) {
				ctx.save();
				ctx.clip();

				const mode = c.ScaleMode[fid] ?? 0;
				const [dx, dy, sw, sh] = getScaledImageProps(mode, bitmap.width, bitmap.height, w, h);
				ctx.drawImage(bitmap, dx, dy, sw, sh);

				ctx.restore();
			} else if (decoder?.failed) {
				ctx.fillStyle = MISSING_ASSET_COLOR;
				ctx.fill();
			}
		} else if (c.Paint[fid] === PaintType.VIDEO) {
			const decoder = resolveVideoDecoder(world, fid);
			const frame = decoder?.toBitmap();

			if (frame) {
				const w = c.Computed.width[eid];
				const h = c.Computed.height[eid];

				ctx.save();
				ctx.clip();

				const mode = c.ScaleMode[fid] ?? 0;
				const [dx, dy, sw, sh] = getScaledImageProps(mode, frame.width, frame.height, w, h);
				ctx.drawImage(frame, dx, dy, sw, sh);

				ctx.restore();
			} else if (decoder?.errored) {
				ctx.fillStyle = MISSING_ASSET_COLOR;
				ctx.fill();
			}
		} else if (c.Paint[fid] === PaintType.SEQUENCE) {
			const decoder = resolveSequenceDecoder(world, fid);
			const frame = decoder?.toBitmap();

			if (frame) {
				const w = c.Computed.width[eid];
				const h = c.Computed.height[eid];

				ctx.save();
				ctx.clip();

				const mode = c.ScaleMode[fid] ?? 0;
				const [dx, dy, sw, sh] = getScaledImageProps(mode, frame.width, frame.height, w, h);
				ctx.drawImage(frame, dx, dy, sw, sh);

				ctx.restore();
			} else if (decoder?.errored) {
				ctx.fillStyle = MISSING_ASSET_COLOR;
				ctx.fill();
			}
		} else if (c.Paint[fid] === PaintType.HTML) {
			const host = c.HtmlHost[fid];

			if (host) {
				ctx.save();
				ctx.clip();
				host.draw(ctx, c.Computed.width[eid], c.Computed.height[eid], world.mode === 'offline-video');
				ctx.restore();
			}
		} else if (c.Paint[fid] === PaintType.SURFACE) {
			const host = c.SurfaceHost[fid];

			if (host) {
				ctx.save();
				ctx.clip();
				host.draw(ctx, c.Computed.width[eid], c.Computed.height[eid]);
				ctx.restore();
			}
		} else if (c.Paint[fid] === PaintType.SOLID) {
			ctx.fillStyle = colorToHex(c.Computed.color[fid]);
			ctx.fill();
		} else if (c.Paint[fid] === PaintType.LINEAR_GRADIENT) {
			const w = c.Computed.width[eid];
			const h = c.Computed.height[eid];
			ctx.fillStyle = createLinearGradient(world, fid, ctx, w, h);
			ctx.fill();
		} else if (c.Paint[fid] === PaintType.RADIAL_GRADIENT) {
			const w = c.Computed.width[eid];
			const h = c.Computed.height[eid];
			ctx.fillStyle = createRadialGradient(world, fid, ctx, w, h);
			ctx.fill();
		} else if (c.Paint[fid] === PaintType.WAVEFORM) {
			renderWaveform(world, eid, fid);
		} else if (c.Paint[fid] === PaintType.SHADER) {
			renderShaderFill(world, eid, fills, index);
		}

		ctx.globalCompositeOperation = savedCO;
		ctx.globalAlpha = savedAlpha;
	}
}

/** The current frame of a video/image paint, as a GPU-uploadable source. */
function shaderSourceBitmap(
	world: EngineWorld,
	fid: number,
	w: number,
	h: number,
): { source: GPUCopyExternalImageSource; width: number; height: number } | null {
	const c = world.components;

	if (c.Paint[fid] === PaintType.IMAGE) {
		const bitmap = resolveImageDecoder(world, fid)?.decoder?.getBitmap(w, h);
		return bitmap ? { source: bitmap, width: bitmap.width, height: bitmap.height } : null;
	}
	if (c.Paint[fid] === PaintType.VIDEO) {
		const frame = resolveVideoDecoder(world, fid)?.toBitmap();
		return frame ? { source: frame, width: frame.width, height: frame.height } : null;
	}
	return null;
}

/**
 * Whether the fill at `index` is the input of a ready shader paint directly
 * above it. Only the immediate neighbor counts (a hidden paint in between
 * decouples the pair). Must mirror `renderShaderFill`'s input selection
 * exactly — a consumed media paint that the shader then fails to draw would
 * blank the element, so both sides check pipeline readiness and frame
 * availability.
 */
function shaderConsumesFill(world: EngineWorld, eid: number, fills: number[], index: number): boolean {
	const c = world.components;
	const fid = fills[index];
	if (c.Paint[fid] !== PaintType.IMAGE && c.Paint[fid] !== PaintType.VIDEO) return false;

	const next = fills[index + 1];
	if (next === undefined || c.Paint[next] !== PaintType.SHADER) return false;
	if (hasComponent(world, next, c.Hidden)) return false;
	if (!resolveShaderHost(world, next)?.ready) return false;

	const w = c.Computed.width[eid];
	const h = c.Computed.height[eid];
	return shaderSourceBitmap(world, fid, w, h) !== null;
}

/**
 * Draws a shader paint: the media paint directly below it in the fill stack
 * is sampled as the shader's `source` texture and its output lands in the
 * parent's box in the media paint's place. Without a media paint below the
 * shader runs procedurally over a transparent source; before the pipeline is
 * ready it draws nothing and the media, if any, draws normally.
 */
function renderShaderFill(world: EngineWorld, eid: number, fills: number[], index: number): void {
	const c = world.components;
	const ctx = world.ctx!;

	const host = resolveShaderHost(world, fills[index]);
	if (!host?.ready) return;

	const w = c.Computed.width[eid];
	const h = c.Computed.height[eid];

	// A visible media paint directly below is the shader's input. Anything
	// else (no fill below, a hidden one, a solid/gradient) runs the shader
	// procedurally over a transparent source, stacking like a normal paint.
	const mid = fills[index - 1];
	const isMedia = mid !== undefined
		&& !hasComponent(world, mid, c.Hidden)
		&& (c.Paint[mid] === PaintType.IMAGE || c.Paint[mid] === PaintType.VIDEO);
	let input: ReturnType<typeof shaderSourceBitmap> = null;
	if (isMedia) {
		input = shaderSourceBitmap(world, mid, w, h);
		if (!input) return;
	}

	const fit = input
		? getScaledImageProps(c.ScaleMode[mid] ?? 0, input.width, input.height, w, h)
		: [0, 0, w, h] as [number, number, number, number];
	const time = (c.Computed.localTime[eid] ?? 0) / world.frameRate;

	ctx.save();
	ctx.clip();
	host.draw(ctx, w, h, input?.source ?? null, input?.width ?? 1, input?.height ?? 1, fit, time, c.Shader.uniforms[fills[index]] ?? null);
	ctx.restore();
}

function renderShadows(world: EngineWorld, eid: number): void {
	const ctx = world.ctx!;
	const c = world.components;

	const shadows = c.Cache.shadows[eid];
	if (!shadows) return;

	ctx.save();
	const savedAlpha = ctx.globalAlpha;

	// ctx.shadowBlur/OffsetX/OffsetY are in device-pixel space and are not
	// affected by the current transform, so scale them up to match the
	// content transform (camera * resolution).
	const shadowScale = world.camera.a * world.resolution;

	for (const sid of shadows) {
		if (hasComponent(world, sid, c.Hidden)) continue;
		const color = colorToHex(c.Computed.color[sid]);
		ctx.shadowColor = color;
		ctx.fillStyle = color;
		ctx.globalAlpha = savedAlpha * c.Computed.opacity[sid];
		ctx.shadowBlur = c.Computed.blur[sid] * shadowScale;
		ctx.shadowOffsetX = c.Computed.offsetX[sid] * shadowScale;
		ctx.shadowOffsetY = c.Computed.offsetY[sid] * shadowScale;
		ctx.fill();
	}

	ctx.restore();
}

function renderStrokes(world: EngineWorld, eid: number): void {
	const ctx = world.ctx!;
	const strokes = world.components.Cache.strokes[eid];
	if (!strokes) return;

	const Stroke = world.components.StrokeStyle;
	const Computed = world.components.Computed;

	ctx.lineWidth = Computed.strokeWidth[eid];
	ctx.lineJoin = StrokeJoin[Stroke.join[eid] ?? 0].toLocaleLowerCase() as CanvasLineJoin;
	ctx.lineCap = StrokeCap[Stroke.cap[eid] ?? 0].toLocaleLowerCase() as CanvasLineCap;
	ctx.miterLimit = Stroke.miterLimit[eid] ?? 3;

	const Hidden = world.components.Hidden;
	const Appearance = world.components.Appearance;
	const Paint = world.components.Paint;

	for (const sid of strokes) {
		if (hasComponent(world, sid, Hidden)) continue;
		const savedAlpha = ctx.globalAlpha;
		const savedCO = ctx.globalCompositeOperation;
		const bi = Appearance.blendMode[sid] ?? 0;

		if (bi !== 0) {
			ctx.globalCompositeOperation = COMPOSITE_OPERATIONS[bi];
		}

		ctx.globalAlpha = savedAlpha * Computed.opacity[sid];

		const paintType = Paint[sid];
		if (paintType === PaintType.LINEAR_GRADIENT) {
			const w = Computed.width[eid];
			const h = Computed.height[eid];
			ctx.strokeStyle = createLinearGradient(world, sid, ctx, w, h);
		} else if (paintType === PaintType.RADIAL_GRADIENT) {
			const w = Computed.width[eid];
			const h = Computed.height[eid];
			ctx.strokeStyle = createRadialGradient(world, sid, ctx, w, h);
		} else {
			ctx.strokeStyle = colorToHex(Computed.color[sid]);
		}
		ctx.stroke();

		ctx.globalCompositeOperation = savedCO;
		ctx.globalAlpha = savedAlpha;
	}
}

/**
 * Pulse animation for entities with the Generating tag.
 *
 * Easing:     cubic-bezier(0.52, 0.18, 0.56, 0.88)
 * Duration:   0.6s per half-cycle (alternating)
 * Delay:      0.2s before the first transition
 * Full cycle: 0.2 delay + 0.6 forward + 0.6 reverse = 1.4s
 *             repeats ∞ for the entire gen phase (~4.5s)
 *
 * Pulses between --background (#1c1c1c) and --secondary (#292929).
 */
const generatingEase = cubicBezier(0.52, 0.18, 0.56, 0.88);

const GEN_DELAY = 200;  // ms
const GEN_DURATION = 600;  // ms per half-cycle
const GEN_CYCLE = GEN_DURATION * 2; // full forward+reverse cycle

// Colors: #1c1c1c → rgb(28,28,28) and #292929 → rgb(41,41,41)
const GEN_FROM_R = 28, GEN_FROM_G = 28, GEN_FROM_B = 28;
const GEN_TO_R = 41, GEN_TO_G = 41, GEN_TO_B = 41;

function renderGenerating(world: EngineWorld, eid: number): void {
	const c = world.components;
	const ctx = world.ctx!;
	if (!hasComponent(world, eid, c.Generating)) return;

	const t = world.timestamp.now;

	// Before initial delay → show base color
	const elapsed = t % (GEN_DELAY + GEN_CYCLE);
	let factor = 0;

	if (elapsed >= GEN_DELAY) {
		const cycleT = elapsed - GEN_DELAY;
		const half = cycleT % GEN_DURATION;
		const progress = half / GEN_DURATION;
		const eased = generatingEase(progress);

		// Alternate direction: first half forward, second half reverse
		const inReverse = cycleT >= GEN_DURATION;
		factor = inReverse ? 1 - eased : eased;
	}

	const r = Math.round(GEN_FROM_R + (GEN_TO_R - GEN_FROM_R) * factor);
	const g = Math.round(GEN_FROM_G + (GEN_TO_G - GEN_FROM_G) * factor);
	const b = Math.round(GEN_FROM_B + (GEN_TO_B - GEN_FROM_B) * factor);

	ctx.fillStyle = `rgb(${r},${g},${b})`;
	ctx.fill();
}

// ── WAVEFORM paint ─────────────────────────────────────
//
// Renders an audio asset's pre-computed peaks as a bar chart inside the
// parent geometry's bounds. Sourced from `c.AssetId[fid]` — the paint
// carries its own asset reference, exactly like IMAGE/VIDEO/SEQUENCE paints.

const WAVEFORM_BAR_WIDTH = 6;
const WAVEFORM_BAR_GAP = 6;
const WAVEFORM_BAR_RADIUS = WAVEFORM_BAR_WIDTH / 2;
const WAVEFORM_MIN_BAR_HEIGHT = 4;
const WAVEFORM_PADDING = 12;
const WAVEFORM_BG_COLOR = '#202020';
const WAVEFORM_BG_RADIUS = 12;

function renderWaveform(world: EngineWorld, eid: number, fid: number): void {
	const c = world.components;
	const ctx = world.ctx!;

	const assetId = c.AssetId[fid];
	if (!assetId) return;

	const asset = world.assets.get(assetId);
	// Both AUDIO and VIDEO assets carry pre-computed peaks (video has audio).
	if (asset?.type !== 'AUDIO' && asset?.type !== 'VIDEO') return;

	const peaks = getAudioPeaks(asset);
	if (!peaks || peaks.length === 0) return;

	const w = c.Computed.width[eid];
	const h = c.Computed.height[eid];

	ctx.save();
	ctx.clip();

	// Background
	ctx.fillStyle = WAVEFORM_BG_COLOR;
	ctx.beginPath();
	ctx.roundRect(0, 0, w, h, WAVEFORM_BG_RADIUS);
	ctx.fill();

	// Bars
	const step = WAVEFORM_BAR_WIDTH + WAVEFORM_BAR_GAP;
	const availableWidth = w - WAVEFORM_PADDING * 2;
	const barCount = Math.floor(availableWidth / step);
	const maxBarHeight = h - WAVEFORM_PADDING * 2;
	if (barCount <= 0 || maxBarHeight <= 0) {
		ctx.restore();
		return;
	}

	const startX = WAVEFORM_PADDING + (availableWidth - barCount * step + WAVEFORM_BAR_GAP) / 2;

	ctx.fillStyle = '#ffffff';

	for (let i = 0; i < barCount; i++) {
		const peakIndex = Math.floor((i / barCount) * peaks.length);
		const value = (peaks[peakIndex] ?? 0) / 255;
		const barHeight = Math.max(value * maxBarHeight, WAVEFORM_MIN_BAR_HEIGHT);
		const x = startX + i * step;
		const y = (h - barHeight) / 2;

		ctx.beginPath();
		ctx.roundRect(x, y, WAVEFORM_BAR_WIDTH, barHeight, WAVEFORM_BAR_RADIUS);
		ctx.fill();
	}

	ctx.restore();
}

function renderShapeNode(world: EngineWorld, eid: number): void {
	drawRectPath(world, eid);
	renderShadows(world, eid);
	renderFills(world, eid);
	renderGenerating(world, eid);
	renderStrokes(world, eid);
}

function renderTextNode(world: EngineWorld, eid: number): void {
	renderText(world, eid);
}

function renderCaptionNode(world: EngineWorld, eid: number): void {
	resolveCaptionDecoder(world, eid)?.draw(world, eid);
}

// ── Transition rendering ─────────────────────────────────────

function renderTransition(world: EngineWorld, sceneEid: number, leftEid: number): void {
	const ctx = world.ctx!;

	const c = world.components;

	const currentTime = c.Computed.localTime[sceneEid];

	const children = world.components.Cache.children[sceneEid];
	const rightEid = children.find(rid => c.Computed.start[rid] === c.Computed.end[leftEid]);
	if (!rightEid) return;

	const win = getTransitionWindow(world, leftEid, rightEid);

	if (currentTime < win.start || currentTime >= win.end) return;

	// we are transitioning
	const duration = win.end - win.start;
	const completion = (currentTime - win.start) / duration;

	const Transition = world.components.Transition;
	const type = Transition.type[leftEid] ?? TransitionType.DISSOLVE;

	const Computed = world.components.Computed;
	const parentEid = getParentEntity(world, leftEid);
	if (parentEid === null) return;
	const width = Computed.width[parentEid];
	const height = Computed.height[parentEid];

	switch (type) {
		case TransitionType.SLIDE_FROM_RIGHT: {
			renderNode(world, leftEid);
			ctx.save();
			ctx.translate(((1 - completion) ** 2 * width) | 0, 0);
			renderNode(world, rightEid);
			ctx.restore();
			break;
		}
		case TransitionType.SLIDE_FROM_LEFT: {
			renderNode(world, leftEid);
			ctx.save();
			ctx.translate(((1 - completion) ** 2 * width * -1) | 0, 0);
			renderNode(world, rightEid);
			ctx.restore();
			break;
		}
		case TransitionType.FADE_TO_BLACK: {
			if (completion < 0.5) {
				renderNode(world, leftEid);
			} else {
				renderNode(world, rightEid);
			}
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, width, height);
			ctx.closePath();
			ctx.fillStyle = '#000000';
			ctx.globalAlpha = completion < 0.5 ? 2 * completion : 2 * (1 - completion);
			ctx.fill();
			ctx.restore();
			break;
		}
		case TransitionType.FADE_TO_WHITE: {
			if (completion < 0.5) {
				renderNode(world, leftEid);
			} else {
				renderNode(world, rightEid);
			}
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, width, height);
			ctx.closePath();
			ctx.fillStyle = '#FFFFFF';
			ctx.globalAlpha = completion < 0.5 ? 2 * completion : 2 * (1 - completion);
			ctx.fill();
			ctx.restore();
			break;
		}
		default: {
			// Dissolve (default)
			renderNode(world, leftEid);
			ctx.save();
			ctx.globalAlpha = completion;
			renderNode(world, rightEid);
			ctx.restore();
			break;
		}
	}

	// Mark both partners as already drawn this frame so the parent's
	// children loop skips its plain renderNode pass for them.
	c.Computed.visibility[leftEid] = 0;
	c.Computed.visibility[rightEid] = 0;
}

export function renderNode(world: EngineWorld, eid: number): void {
	const c = world.components;
	const ctx = world.ctx!;

	if (c.Computed.visibility[eid] === 0 || hasComponent(world, eid, c.Culled)) return;

	if (hasComponent(world, eid, c.Interactive)) {
		world.hitRegions.push({
			callback: handleGeometryInteraction,
			target: { kind: 'entity', id: eid },
		});
	}

	if (hasComponent(world, eid, c.IsMask) || hasComponent(world, eid, c.Hidden)) return;

	ctx.save();

	ctx.transform(
		c.LocalTransform.a[eid],
		c.LocalTransform.b[eid],
		c.LocalTransform.c[eid],
		c.LocalTransform.d[eid],
		c.LocalTransform.e[eid],
		c.LocalTransform.f[eid],
	);

	for (const maskEid of world.components.Cache.masks[eid]) {
		if (c.Computed.visibility[maskEid] === 0) continue;
		ctx.save();
		ctx.setTransform(
			c.WorldTransform.a[maskEid],
			c.WorldTransform.b[maskEid],
			c.WorldTransform.c[maskEid],
			c.WorldTransform.d[maskEid],
			c.WorldTransform.e[maskEid],
			c.WorldTransform.f[maskEid],
		);
		drawRectPath(world, maskEid);
		ctx.restore();
		ctx.clip();
	}

	// Appearance
	ctx.globalAlpha *= c.Computed.opacity[eid];
	const bi = c.Appearance.blendMode[eid] ?? 0;
	if (bi !== 0) ctx.globalCompositeOperation = COMPOSITE_OPERATIONS[bi];

	const effects = buildEffects(world, eid);
	let initialFilter = 'none';

	if (effects !== null) {
		initialFilter = ctx.filter;
		ctx.filter = effects;
	}


	if (hasComponent(world, eid, c.Caption)) {
		renderCaptionNode(world, eid);
	} else if (c.Geometry[eid] === GeometryType.TEXT) {
		renderTextNode(world, eid);
	} else if (c.Geometry[eid] === GeometryType.RECT) {
		renderShapeNode(world, eid);
	}

	// Clip and render children
	const children = c.Cache.children[eid];
	if (children.length) {
		if (hasComponent(world, eid, c.ClipsContent)) {
			ctx.save();
			ctx.clip();
		}

		for (const child of children) {
			// Edge case: Child with transition
			if (hasComponent(world, child, c.Transition)) {
				renderTransition(world, eid, child);
				// Note: we are not breaking here since the transition handler will hide/unhide the children
			}

			renderNode(world, child);
		}

		if (hasComponent(world, eid, c.ClipsContent)) {
			ctx.restore();
		}
	}

	// Reset filter after drawing
	if (initialFilter !== 'none') {
		ctx.filter = initialFilter;
	}

	ctx.restore();
}

/**
 * Render system entry point. Call after transformSystem.
 *
 * Reads camera, background, and canvas size from world state and applies
 * DPR * Camera as the base canvas transform before drawing top-level nodes.
 */
export function renderSystem(world: EngineWorld): void {
	const ctx = world.ctx!;

	const cw = world.canvas!.width;
	const ch = world.canvas!.height;
	const c = world.components;

	// Clear + background (identity transform for full-canvas clear)
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, cw, ch);

	// The stage background is a preview-only affordance; offline encoding
	// renders just the scene onto a transparent canvas (the scene paints its
	// own fill if it has one).
	if (world.mode === 'realtime') {
		ctx.fillStyle = colorToHex(world.background);
		ctx.fillRect(0, 0, cw, ch);
		world.hitRegions.push({
			target: { kind: 'hud', id: 'canvas', quad: getCanvasQuad(world) },
			callback: handleCanvasInteraction,
		});
	}

	// Apply camera transform: DPR * Camera
	ctx.setTransform(
		world.camera.a * world.resolution,
		world.camera.b * world.resolution,
		world.camera.c * world.resolution,
		world.camera.d * world.resolution,
		world.camera.e * world.resolution,
		world.camera.f * world.resolution,
	);

	// Render top-level nodes.
	for (const eid of query(world, [Or(c.Geometry, c.Group), Not(ChildOf('*')), Not(c.Deleted), Not(c.Culled)])) {
		renderNode(world, eid);
	}
}

function getCanvasQuad(world: EngineWorld): Quad {
	return [
		{ x: 0, y: 0 },
		{ x: world.canvas!.width, y: 0 },
		{ x: world.canvas!.width, y: world.canvas!.height },
		{ x: 0, y: world.canvas!.height },
	];
}
