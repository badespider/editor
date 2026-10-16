/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { query, Not, Or, Hierarchy, hasComponent } from 'bitecs';
import { cubicBezier, steps, spring } from "animejs";
import { AnimationType, ChildOf } from '../components';
import type { EngineWorld } from '../api/world';
import { revealChars, revealWords, scrambleChars } from '../utils/text-motion';
import { resetAnimatedValues } from '../api/utils';


/**
 * Apply an animation to a node.
 * @param world - The engine world.
 * @param eid - The entity id of the node to apply the animation to.
 * @param aid - The animation id.
 * @param progress - The progress of the animation.
 */
function applyAnimation(world: EngineWorld, eid: number, aid: number, progress: number) {
	const c = world.components;

	switch (c.Animation.type[aid]) {
		case AnimationType.FADE: {
			const phase = c.Animation.phase[aid];
			const func = cubicBezier(0.1, 0.7, 0.5, 1);
			const eased = clamp01(func(progress));
			c.Computed.opacity[eid] = phase == 1 ? 1 - eased : eased;
			break;
		}
		case AnimationType.GAIN: {
			const phase = c.Animation.phase[aid];
			const func = cubicBezier(0.4, 0.095, 0.546, 0.875);
			const eased = clamp01(func(progress));
			c.Computed.volume[eid] = phase == 1 ? 1 - eased : eased;
			break;
		}
		case AnimationType.GROW: {
			const phase = c.Animation.phase[aid];
			const func = cubicBezier(0.1, 0.7, 0.5, 1);
			const eased = clamp01(func(progress));
			const t = phase == 1 ? eased : 1 - eased;
			const scale = 1 - 0.5 * t;
			c.Computed.scaleX[eid] = scale;
			c.Computed.scaleY[eid] = scale;
			break;
		}
		case AnimationType.SHRINK: {
			const phase = c.Animation.phase[aid];
			const func = cubicBezier(0.1, 0.7, 0.5, 1);
			const eased = clamp01(func(progress));
			const t = phase == 1 ? eased : 1 - eased;
			const scale = 1 + 0.5 * t;
			c.Computed.scaleX[eid] = scale;
			c.Computed.scaleY[eid] = scale;
			break;
		}
		case AnimationType.BLUR: {
			const phase = c.Animation.phase[aid];
			const func = phase == 1 ? cubicBezier(0.4, 0, 1, 1) : cubicBezier(0.33, 0, 0.2, 1);
			const eased = clamp01(func(progress));
			c.Computed.blur[eid] = phase == 1 ? lerp(0, 24, eased) : lerp(24, 0, eased);
			break;
		}
		case AnimationType.SLIDE_LEFT:
		case AnimationType.SLIDE_RIGHT:
		case AnimationType.SLIDE_UP:
		case AnimationType.SLIDE_DOWN: {
			const phase = c.Animation.phase[aid];
			const type = c.Animation.type[aid];
			const func = cubicBezier(0.1, 0.7, 0.5, 1);
			const eased = clamp01(func(progress));
			const t = phase == 1 ? eased : 1 - eased;

			const sign = phase == 1 ? -1 : 1;
			if (type === AnimationType.SLIDE_LEFT) {
				c.Computed.offsetX[eid] = sign * 100 * t;
			} else if (type === AnimationType.SLIDE_RIGHT) {
				c.Computed.offsetX[eid] = sign * -100 * t;
			} else if (type === AnimationType.SLIDE_UP) {
				c.Computed.offsetY[eid] = sign * 100 * t;
			} else if (type === AnimationType.SLIDE_DOWN) {
				c.Computed.offsetY[eid] = sign * -100 * t;
			}
			c.Computed.opacity[eid] = 1 - t;
			break;
		}
		case AnimationType.SPIN: {
			const phase = c.Animation.phase[aid];
			const func = cubicBezier(0.44, 0.02, 0.252, 0.992);
			const eased = clamp01(func(progress));
			const t = phase == 1 ? eased : 1 - eased;
			const scale = 1 - t;
			c.Computed.scaleX[eid] = scale;
			c.Computed.scaleY[eid] = scale;
			c.Computed.rotation[eid] = -45 * t;
			break;
		}
		case AnimationType.TWIST: {
			const phase = c.Animation.phase[aid];
			const func = cubicBezier(0.1, 0.7, 0.5, 1);
			const eased = clamp01(func(progress));
			const t = phase == 1 ? eased : 1 - eased;
			const scale = 1 + t;
			c.Computed.scaleX[eid] = scale;
			c.Computed.scaleY[eid] = scale;
			c.Computed.rotation[eid] = -10 * t;
			c.Computed.offsetX[eid] = -30 * t;
			c.Computed.offsetY[eid] = -30 * t;
			break;
		}
		case AnimationType.APPEAR_WORD: {
			const phase = c.Animation.phase[aid];
			const t = phase == 1 ? progress : 1 - progress;
			const chars = c.Chars[eid] ?? '';
			c.Computed.chars[eid] = revealWords(chars, 1 - t);
			break;
		}
		case AnimationType.APPEAR_CHAR: {
			const phase = c.Animation.phase[aid];
			const t = phase == 1 ? progress : 1 - progress;
			const chars = c.Chars[eid] ?? '';
			c.Computed.chars[eid] = revealChars(chars, 1 - t);
			break;
		}
		case AnimationType.SCRAMBLE: {
			const phase = c.Animation.phase[aid];
			const t = phase == 1 ? progress : 1 - progress;
			const chars = c.Chars[eid] ?? '';
			c.Computed.chars[eid] = scrambleChars(chars, 1 - t);
			break;
		}
	}
}

export function motionSystem(world: EngineWorld): void {
	const c = world.components;
	const worldProps = getPropertyPaths(world);

	for (const eid of query(world, [Or(c.Geometry, c.Group, c.AdjustmentLayer), Hierarchy(ChildOf), ChildOf('*'), Not(c.Deleted), Not(c.Hidden), Not(c.Culled)])) {

		if (c.Computed.visibility[eid] === 0) continue;

		const hasAnimations = c.Cache.animations[eid].length > 0;
		const hasKeyframes = c.Cache.keyframeTracks[eid].length > 0;
		if (!hasAnimations && !hasKeyframes) continue;

		resetAnimatedValues(world, eid);
		const hasUniform = hasComponent(world, eid, c.UniformScale);
		const hasScale = hasComponent(world, eid, c.Scale);
		// Keep native independent-axis tracks unchanged. For static axes,
		// evaluate a fresh uniform factor, then apply the authored axes once.
		const hasAxisTracks = c.Cache.keyframeTracks[eid].some(tid => c.KeyframeTrack.property[tid] === 'scale.x' || c.KeyframeTrack.property[tid] === 'scale.y');
		const composeAxes = hasUniform || hasScale && !hasAxisTracks;
		if (composeAxes) {
			const factor = hasUniform ? c.UniformScale[eid] ?? 1 : 1;
			c.Computed.scaleX[eid] = factor;
			c.Computed.scaleY[eid] = factor;
		}

		let trimStart = 0
		let trimEnd = c.Computed.duration[eid];

		if (hasComponent(world, eid, c.Trim)) {
			trimStart = c.Trim.start[eid];
			trimEnd = c.Trim.end[eid] ?? trimEnd;
		}

		const localFrame = c.Computed.localTime[eid];

		// 1: Preset animations (FADE/GAIN/GROW/SHRINK/BLUR/SLIDE)
		for (const aid of c.Cache.animations[eid]) {
			const duration = c.Animation.duration[aid] ?? 0;
			if (duration <= 0) continue;

			const delay = c.Animation.delay[aid] ?? 0;
			const isOut = c.Animation.phase[aid] == 1;
			const windowStart = isOut
				? trimEnd - duration - delay
				: trimStart + delay;
			const windowEnd = windowStart + duration;
			if (isOut ? localFrame < windowStart : localFrame >= windowEnd) continue;

			const progress = clamp01((localFrame - windowStart) / duration);
			applyAnimation(world, eid, aid, progress);
		}

		// 2: Keyframe tracks
		for (const tid of c.Cache.keyframeTracks[eid]) {
			const property = c.KeyframeTrack.property[tid] as PropertyPath;
			const target = c.KeyframeTrack.target[tid];
			const keyframes = c.Cache.keyframes[tid] ?? [];
			const result = sampleTrack(world, keyframes, localFrame, property);
			if (result === null) continue;
			worldProps[property].computed[target] = result;
		}

		if (composeAxes) {
			const factorX = c.Computed.scaleX[eid];
			const factorY = hasUniform ? factorX : c.Computed.scaleY[eid];
			c.Computed.scaleX[eid] = factorX * (hasScale ? c.Scale.x[eid] ?? 1 : 1);
			c.Computed.scaleY[eid] = factorY * (hasScale ? c.Scale.y[eid] ?? 1 : 1);
		}
	}
}

/**
 * Read the current value of an ECS component property by dot-path string.
 */
export function getPropertyPaths(world: EngineWorld) {
	const c = world.components;
	return {
		'position.x': {
			computed: c.Computed.positionX,
			authored: c.Position.x,
		},
		'position.y': {
			computed: c.Computed.positionY,
			authored: c.Position.y,
		},
		'offset.x': {
			computed: c.Computed.offsetX,
			authored: c.Offset.x,
		},
		'offset.y': {
			computed: c.Computed.offsetY,
			authored: c.Offset.y,
		},
		'rotation': {
			computed: c.Computed.rotation,
			authored: c.Rotation,
		},
		'scale.x': {
			computed: c.Computed.scaleX,
			authored: c.Scale.x,
		},
		'scale.y': {
			computed: c.Computed.scaleY,
			authored: c.Scale.y,
		},
		'scale': {
			computed: c.Computed.scaleX,
			authored: c.UniformScale,
		},
		'skew.x': {
			computed: c.Computed.skewX,
			authored: c.Skew.x,
		},
		'skew.y': {
			computed: c.Computed.skewY,
			authored: c.Skew.y,
		},
		'width': {
			computed: c.Computed.width,
			authored: c.Size.width,
		},
		'height': {
			computed: c.Computed.height,
			authored: c.Size.height,
		},
		'opacity': {
			computed: c.Computed.opacity,
			authored: c.Appearance.opacity,
		},
		'color': {
			computed: c.Computed.color,
			authored: c.Color,
		},
		'blur': {
			computed: c.Computed.blur,
			authored: c.Blur,
		},
		'volume': {
			computed: c.Computed.volume,
			authored: c.Volume,
		},
		'effect.value': {
			computed: c.Computed.value,
			authored: c.Effect.value,
		},
		'stroke.width': {
			computed: c.Computed.strokeWidth,
			authored: c.StrokeStyle.width,
		},
		'vertexRadius': {
			computed: c.Computed.cornerRadius,
			authored: c.CornerRadius,
		},
		'mixedVertexRadius.topLeft': {
			computed: c.Computed.cornerRadiusTopLeft,
			authored: c.MixedCornerRadius.topLeft,
		},
		'mixedVertexRadius.topRight': {
			computed: c.Computed.cornerRadiusTopRight,
			authored: c.MixedCornerRadius.topRight,
		},
		'mixedVertexRadius.bottomRight': {
			computed: c.Computed.cornerRadiusBottomRight,
			authored: c.MixedCornerRadius.bottomRight,
		},
		'mixedVertexRadius.bottomLeft': {
			computed: c.Computed.cornerRadiusBottomLeft,
			authored: c.MixedCornerRadius.bottomLeft,
		},
		'stop.offset': {
			computed: c.Computed.stopOffset,
			authored: c.ColorStop.offset,
		},
		'stop.color': {
			computed: c.Computed.stopColor,
			authored: c.ColorStop.color,
		},
		'stop.opacity': {
			computed: c.Computed.stopOpacity,
			authored: c.ColorStop.opacity,
		},
		'chars': {
			computed: c.Computed.chars,
			authored: c.Chars,
		},
	};
}

export type PropertyPath = keyof ReturnType<typeof getPropertyPaths>;

// ─── Easing ─────────────────────────────────────────────────

type EasingFunction = (t: number) => number;

const easingCache = new Map<string, EasingFunction>();

/**
 * Parse an easing descriptor string and return an easing function.
 * Returns null for empty/undefined (= default linear interpolation).
 * Supported formats:
 *   "steps(9)"  or "steps(9,true)"        → animejs steps(n, fromStart?)
 *   "cubicBezier(0.25,0.1,0.25,1)"       → animejs cubicBezier(x1,y1,x2,y2)
 *   "spring(0.5,500)"                     → animejs spring({ bounce, duration })
 */
function resolveEasing(descriptor: string | undefined): EasingFunction | null {
	if (!descriptor || descriptor === '') return null;

	const cached = easingCache.get(descriptor);
	if (cached) return cached;

	let fn: EasingFunction | null = null;

	const stepsMatch = descriptor.match(/^steps\((\d+)(?:,(true|false))?\)$/);
	if (stepsMatch) {
		const n = Number.parseInt(stepsMatch[1], 10);
		const fromStart = stepsMatch[2] === 'true';
		fn = steps(n, fromStart);
	}

	const bezierMatch = descriptor.match(/^cubicBezier\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)$/);
	if (bezierMatch) {
		const [, x1, y1, x2, y2] = bezierMatch;
		fn = cubicBezier(Number(x1), Number(y1), Number(x2), Number(y2));
	}

	const springMatch = descriptor.match(/^spring\(([\d.-]+),([\d.-]+)\)$/);
	if (springMatch) {
		const [, bounce, duration] = springMatch;
		const s = spring({
			bounce: Number(bounce),
			duration: Number(duration),
		});
		fn = (t: number) => s.ease(t);
	}

	if (fn) {
		easingCache.set(descriptor, fn);
		return fn;
	}

	return null;
}

/**
 * Sample a presorted aggregated keyframe track at a local frame.
 * Returns null only if the track has no keyframes.
 */
function sampleTrack(
	world: EngineWorld,
	keyframes: number[],
	frame: number,
	property: PropertyPath,
): number | null {
	const Keyframe = world.components.Keyframe;
	if (keyframes.length === 0) return null;

	if (keyframes.length === 1) {
		return Keyframe.value[keyframes[0]];
	}

	const firstValue = Keyframe.value[keyframes[0]];
	const lastValue = Keyframe.value[keyframes[keyframes.length - 1]];

	const firstFrame = Keyframe.time[keyframes[0]];
	const lastFrame = Keyframe.time[keyframes[keyframes.length - 1]];

	if (frame <= firstFrame) {
		return firstValue;
	}

	if (frame >= lastFrame) {
		return lastValue;
	}

	for (let i = 0; i < keyframes.length - 1; i++) {
		const start = Keyframe.time[keyframes[i]];
		const end = Keyframe.time[keyframes[i + 1]];
		if (frame < start || frame > end) continue;

		const span = end - start;
		if (span <= 0) continue;

		let progress = Math.max(0, Math.min(1, (frame - start) / span));

		const easingFn = resolveEasing(Keyframe.easing[keyframes[i]]);
		if (easingFn) {
			progress = easingFn(progress);
		}

		const startValue = Keyframe.value[keyframes[i]];
		const endValue = Keyframe.value[keyframes[i + 1]];

		if (property === 'color' || property === 'stop.color') {
			return lerpColor(startValue, endValue, progress);
		}

		// Linear interpolation
		return startValue + (endValue - startValue) * progress;
	}

	return lastValue;
}

/**
 * Channel-wise linear interpolation between two packed 0xRRGGBB colors.
 * Linear interpolation on the packed integer bleeds bits between channels
 * and produces wrong intermediate hues.
 */
function lerpColor(from: number, to: number, progress: number): number {
	const r0 = (from >> 16) & 0xFF;
	const g0 = (from >> 8) & 0xFF;
	const b0 = from & 0xFF;
	const r1 = (to >> 16) & 0xFF;
	const g1 = (to >> 8) & 0xFF;
	const b1 = to & 0xFF;
	const r = Math.round(r0 + (r1 - r0) * progress);
	const g = Math.round(g0 + (g1 - g0) * progress);
	const b = Math.round(b0 + (b1 - b0) * progress);
	return (r << 16) | (g << 8) | b;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function lerp(from: number, to: number, progress: number): number {
	return from + (to - from) * progress;
}
