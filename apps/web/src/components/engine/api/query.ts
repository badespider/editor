/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { query, hasComponent, Not } from 'bitecs';
import { ChildOf, GeometryType, PaintType } from '../components';
import { getParentEntity } from './base';

import type { EngineWorld } from './world';

export function isScene(world: EngineWorld, eid: number): boolean {
	return hasComponent(world, eid, world.components.Scene);
}

/**
 * Nearest ancestor of `eid` (excluding `eid` itself) that is a scene, or null.
 */
export function getSceneAncestor(world: EngineWorld, eid: number): number | null {
	let current = getParentEntity(world, eid);
	while (current !== null) {
		if (isScene(world, current)) return current;
		current = getParentEntity(world, current);
	}
	return null;
}

export function isGroup(world: EngineWorld, eid: number): boolean {
	return hasComponent(world, eid, world.components.Group);
}

export function isGroupLike(world: EngineWorld, eid: number): boolean {
	const c = world.components;
	return hasComponent(world, eid, c.Group) || hasComponent(world, eid, c.Scene);
}

export function isSequence(world: EngineWorld, eid: number): boolean {
	return hasComponent(world, eid, world.components.Sequential);
}

export function isAudio(world: EngineWorld, eid: number): boolean {
	return hasComponent(world, eid, world.components.Audio);
}

export function isAdjustmentLayer(world: EngineWorld, eid: number): boolean {
	return hasComponent(world, eid, world.components.AdjustmentLayer);
}

export function isCaption(world: EngineWorld, eid: number): boolean {
	return hasComponent(world, eid, world.components.Caption);
}

export function isText(world: EngineWorld, eid: number): boolean {
	const c = world.components;
	return hasComponent(world, eid, c.Geometry) && c.Geometry[eid] === GeometryType.TEXT;
}

export function isRect(world: EngineWorld, eid: number): boolean {
	const c = world.components;
	return hasComponent(world, eid, c.Geometry) && c.Geometry[eid] === GeometryType.RECT;
}

/** A vanilla rect — not a container (group/scene/sequence) or audio clip.
 *  (Captions live on TEXT geometry, so they're naturally excluded.) */
export function isShape(world: EngineWorld, eid: number): boolean {
	const c = world.components;
	return hasComponent(world, eid, c.Geometry)
		&& (c.Geometry[eid] === GeometryType.RECT || c.Geometry[eid] === GeometryType.PATH)
		&& !hasComponent(world, eid, c.Group)
		&& !hasComponent(world, eid, c.Scene)
		&& !hasComponent(world, eid, c.Audio);
}

export function hasHtmlPaint(world: EngineWorld, eid: number): boolean {
	const c = world.components;
	return (c.Cache.fills[eid] ?? []).some(fid => c.Paint[fid] === PaintType.HTML);
}

export function hasSurfacePaint(world: EngineWorld, eid: number): boolean {
	const c = world.components;
	return (c.Cache.fills[eid] ?? []).some(fid => c.Paint[fid] === PaintType.SURFACE);
}

export function isMask(world: EngineWorld, eid: number): boolean {
	return hasComponent(world, eid, world.components.IsMask);
}

/**
 * Returns the local frame for a node in its own source/content time — the
 * timeline frame relative to the node's delay, scaled by its playback rate.
 * This matches `Computed.localTime` (the space keyframes are sampled
 * in), so keyframes authored at any playback rate land on the right content
 * frame.
 */
export function getNodeLocalFrame(world: EngineWorld, nodeEid: number): number {
	const c = world.components;

	const delay = c.Computed.delay[nodeEid];
	const playbackRate = c.PlaybackRate[nodeEid] ?? 1;

	let current: number | null = nodeEid;
	while (current) {
		const parent = getParentEntity(world, current);

		// must be a root playback entity
		if (hasComponent(world, current, c.Playback) && parent === null) {
			const currentTime = c.Computed.localTime[current];
			return Math.round((currentTime - delay) * playbackRate);
		}

		current = parent;
	}

	return 0;
}

export function getNextName(world: EngineWorld, prefix: string): string {
	const c = world.components;

	let max = 0;
	const pattern = new RegExp(`^${prefix} (\\d+)$`);

	for (let i = 0; i < c.Name.length; i++) {
		if (c.Name[i] === undefined) continue;
		const match = c.Name[i]?.match(pattern);
		if (match) {
			const n = parseInt(match[1] ?? '0');
			if (n > max) max = n;
		}
	}

	return `${prefix} ${max + 1}`;
}

export function getEntityTree(world: EngineWorld, rootEid: number): number[] {
	const c = world.components;

	const tree: number[] = [];

	const walk = (eid: number): number[] => {
		tree.push(eid);

		for (const cid of query(world, [ChildOf(eid), Not(c.Deleted)])) {
			walk(cid);
		}

		return tree;
	}

	return walk(rootEid);
}
