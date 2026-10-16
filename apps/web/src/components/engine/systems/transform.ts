/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { hasComponent, query, Not, Or } from 'bitecs';

import { ChildOf } from '../components/relations';
import { addComponent, removeComponent } from '../api/events';
import { getParentEntity } from '../api/base';

import type { EngineWorld } from '../api/world';

import {
	multiply2D,
	aabbFromTransformedRect,
	aabbsIntersect,
	translate2D,
	rotate2D,
	skew2D,
	scale2D,
	type Mat2D,
} from '../math';

/**
 * Compute the local 2D affine matrix from Offset, Rotation, Scale,
 * Anchor, Skew and Size.  Stores result in LocalMatrix[eid].
 */
export function computeLocalMatrix(world: EngineWorld, eid: number): void {
	const Flip = world.components.Flip;
	const Anchor = world.components.Anchor;
	const Computed = world.components.Computed;
	const LocalTransform = world.components.LocalTransform;

	const positionX = Computed.positionX[eid] + Computed.offsetX[eid];
	const positionY = Computed.positionY[eid] + Computed.offsetY[eid];
	const hasAnchor = hasComponent(world, eid, Anchor);
	const pivotX = (hasAnchor ? Anchor.x[eid] ?? 0.5 : .5) * Computed.width[eid];
	const pivotY = (hasAnchor ? Anchor.y[eid] ?? 0.5 : .5) * Computed.height[eid];
	const scaleX = (Flip.x[eid] ?? 1) * Computed.scaleX[eid];
	const scaleY = (Flip.y[eid] ?? 1) * Computed.scaleY[eid];
	const rotation = Computed.rotation[eid];
	const skewX = Computed.skewX[eid];
	const skewY = Computed.skewY[eid];

	let mat = translate2D(positionX, positionY);
	mat = multiply2D(mat, translate2D(pivotX, pivotY));
	mat = multiply2D(mat, rotate2D(rotation));
	mat = multiply2D(mat, skew2D(skewX, skewY));
	mat = multiply2D(mat, scale2D(scaleX, scaleY));
	mat = multiply2D(mat, translate2D(-pivotX, -pivotY));

	LocalTransform.a[eid] = mat.a;
	LocalTransform.b[eid] = mat.b;
	LocalTransform.c[eid] = mat.c;
	LocalTransform.d[eid] = mat.d;
	LocalTransform.e[eid] = mat.e;
	LocalTransform.f[eid] = mat.f;
}

/**
 * WorldTransform = Parent.WorldTransform * LocalMatrix
 * For top-level entities (no entity parent), pass the camera × DPR matrix.
 */
export function computeWorldTransform(world: EngineWorld, eid: number, parentEid: number | null): void {
	const WorldTransform = world.components.WorldTransform;
	const LocalTransform = world.components.LocalTransform;

	if (LocalTransform.a[eid] === undefined) {
		LocalTransform.a[eid] = 1;
		LocalTransform.b[eid] = 0;
		LocalTransform.c[eid] = 0;
		LocalTransform.d[eid] = 1;
		LocalTransform.e[eid] = 0;
		LocalTransform.f[eid] = 0;
	}

	let parent: Mat2D;
	if (parentEid !== null) {
		parent = {
			a: WorldTransform.a[parentEid], b: WorldTransform.b[parentEid],
			c: WorldTransform.c[parentEid], d: WorldTransform.d[parentEid],
			e: WorldTransform.e[parentEid], f: WorldTransform.f[parentEid],
		}
	} else {
		const res = world.resolution;
		parent = {
			a: world.camera.a * res, b: world.camera.b * res,
			c: world.camera.c * res, d: world.camera.d * res,
			e: world.camera.e * res, f: world.camera.f * res,
		};
	}

	const local: Mat2D = {
		a: LocalTransform.a[eid], b: LocalTransform.b[eid],
		c: LocalTransform.c[eid], d: LocalTransform.d[eid],
		e: LocalTransform.e[eid], f: LocalTransform.f[eid],
	};

	const m = multiply2D(parent, local);

	WorldTransform.a[eid] = m.a;
	WorldTransform.b[eid] = m.b;
	WorldTransform.c[eid] = m.c;
	WorldTransform.d[eid] = m.d;
	WorldTransform.e[eid] = m.e;
	WorldTransform.f[eid] = m.f;
}

/**
 * Compute world-space AABB from world transform and size.
 */
export function computeWorldBounds(world: EngineWorld, eid: number): void {
	const WorldBounds = world.components.WorldBounds;
	const WorldTransform = world.components.WorldTransform;
	const Computed = world.components.Computed;

	const worldMat: Mat2D = {
		a: WorldTransform.a[eid], b: WorldTransform.b[eid],
		c: WorldTransform.c[eid], d: WorldTransform.d[eid],
		e: WorldTransform.e[eid], f: WorldTransform.f[eid],
	};
	const mat = multiply2D(worldMat, translate2D(Computed.originX[eid], Computed.originY[eid]));
	const bounds = aabbFromTransformedRect(mat, Computed.width[eid], Computed.height[eid]);

	WorldBounds.minX[eid] = bounds.minX;
	WorldBounds.minY[eid] = bounds.minY;
	WorldBounds.maxX[eid] = bounds.maxX;
	WorldBounds.maxY[eid] = bounds.maxY;
}

function cullEntity(world: EngineWorld, eid: number, parentEid: number | null): void {
	const WorldBounds = world.components.WorldBounds;
	const Culled = world.components.Culled;

	// Inherit cull from the parent: the renderer already skips entire
	// subtrees of culled parents, so descendants are effectively invisible
	// even when their own AABB intersects the parent's. Propagating the tag
	// down lets us free their decoders too. Pre-order DFS guarantees the
	// parent's tag is already settled by the time we reach the child.


	let intersect = true;

	if (parentEid === null) {
		intersect = aabbsIntersect({
			minX: WorldBounds.minX[eid],
			minY: WorldBounds.minY[eid],
			maxX: WorldBounds.maxX[eid],
			maxY: WorldBounds.maxY[eid],
		}, {
			minX: 0,
			minY: 0,
			maxX: world.canvas!.width,
			maxY: world.canvas!.height,
		});
	} else {
		intersect = !hasComponent(world, parentEid, Culled);
	}

	const wasCulled = hasComponent(world, eid, Culled);

	if (!intersect) {
		if (!wasCulled) {
			addComponent(world, eid, Culled, false);
		}
	} else if (wasCulled) {
		removeComponent(world, eid, Culled, false);
	}
}

/**
 * Recompute a Group entity's Computed bounds from the union of its children's
 * transformed boxes. Sequences aren't spatial constructs — they mirror their
 * parent's frame instead (the walk is parent-first, so the parent's Computed
 * values are already settled). Leaf entities own an absolute Size and need no
 * resolution here.
 */
export function computeGroupBounds(world: EngineWorld, eid: number): void {
	const c = world.components;

	if (hasComponent(world, eid, c.Sequential)) {
		const parentEid = getParentEntity(world, eid);
		if (parentEid !== null) {
			c.Computed.width[eid] = c.Computed.width[parentEid];
			c.Computed.height[eid] = c.Computed.height[parentEid];
			c.Computed.originX[eid] = c.Computed.originX[parentEid] ?? 0;
			c.Computed.originY[eid] = c.Computed.originY[parentEid] ?? 0;
			return;
		}
	}

	if (hasComponent(world, eid, c.Group)) {
		if (hasComponent(world, eid, c.Size)) {
			c.Computed.originX[eid] = 0;
			c.Computed.originY[eid] = 0;
			return;
		}
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		let any = false;

		for (const childEid of query(world, [Or(c.Geometry, c.Group), ChildOf(eid), Not(c.Deleted), Not(c.Hidden)])) {
			const mat: Mat2D = {
				a: c.LocalTransform.a[childEid] ?? 1, b: c.LocalTransform.b[childEid] ?? 0,
				c: c.LocalTransform.c[childEid] ?? 0, d: c.LocalTransform.d[childEid] ?? 1,
				e: c.LocalTransform.e[childEid] ?? 0, f: c.LocalTransform.f[childEid] ?? 0,
			};
			const bounds = aabbFromTransformedRect(mat, c.Computed.width[childEid], c.Computed.height[childEid]);
			if (bounds.minX < minX) minX = bounds.minX;
			if (bounds.minY < minY) minY = bounds.minY;
			if (bounds.maxX > maxX) maxX = bounds.maxX;
			if (bounds.maxY > maxY) maxY = bounds.maxY;
			any = true;
		}

		if (!any) {
			c.Computed.width[eid] = 0;
			c.Computed.height[eid] = 0;
			return;
		}

		c.Computed.width[eid] = Math.max(0, maxX - minX);
		c.Computed.height[eid] = Math.max(0, maxY - minY);
		c.Computed.originX[eid] = minX;
		c.Computed.originY[eid] = minY;
	}
}

function adjustLayers(world: EngineWorld, adjust: number) {
	const c = world.components;

	if (c.Computed.visibility[adjust] === 0 || hasComponent(world, adjust, c.Hidden)) return;


	// get next non sequential parent
	let slot = adjust;
	let parent = getParentEntity(world, slot);
	while (parent !== null && hasComponent(world, parent, c.Sequential)) {
		slot = parent;
		parent = getParentEntity(world, slot);
	}
	if (parent === null) return;

	const siblings = c.Cache.children[parent];
	if (!siblings) return;
	const idx = siblings.indexOf(slot);
	if (idx <= 0) return;

	const target = siblings[idx - 1];
	if (target === undefined) return;

	// adjust's own local matrix must be current; it is not visited by the walk
	// (adjustment layers are neither Geometry nor Group) and reads only
	// motion-resolved Computed values.
	computeLocalMatrix(world, adjust);

	const adjustLocal: Mat2D = {
		a: c.LocalTransform.a[adjust], b: c.LocalTransform.b[adjust], c: c.LocalTransform.c[adjust],
		d: c.LocalTransform.d[adjust], e: c.LocalTransform.e[adjust], f: c.LocalTransform.f[adjust],
	};
	const clipLocal: Mat2D = {
		a: c.LocalTransform.a[target], b: c.LocalTransform.b[target], c: c.LocalTransform.c[target],
		d: c.LocalTransform.d[target], e: c.LocalTransform.e[target], f: c.LocalTransform.f[target],
	};

	const composed = multiply2D(adjustLocal, clipLocal);
	c.LocalTransform.a[target] = composed.a;
	c.LocalTransform.b[target] = composed.b;
	c.LocalTransform.c[target] = composed.c;
	c.LocalTransform.d[target] = composed.d;
	c.LocalTransform.e[target] = composed.e;
	c.LocalTransform.f[target] = composed.f;

	const reworld = (eid: number, parentEid: number | null) => {
		computeWorldTransform(world, eid, parentEid);
		computeWorldBounds(world, eid);
		cullEntity(world, eid, parentEid);

		for (const childEid of query(world, [Or(c.Geometry, c.Group), ChildOf(eid), Not(c.Deleted)])) {
			reworld(childEid, eid);
		}
	}

	reworld(target, parent);
}

/**
 * Transform system entry point. Call once per frame before renderSystem.
 */
export function transformSystem(world: EngineWorld): void {
	const c = world.components;

	const walk = (eid: number, parentEid: number | null) => {
		computeGroupBounds(world, eid);
		computeLocalMatrix(world, eid);
		computeWorldTransform(world, eid, parentEid);
		computeWorldBounds(world, eid);
		cullEntity(world, eid, parentEid);

		for (const childEid of query(world, [Or(c.Geometry, c.Group), ChildOf(eid), Not(c.Deleted)])) {
			walk(childEid, eid);
		}
	}

	for (const eid of query(world, [Not(ChildOf('*')), Or(c.Geometry, c.Group), Not(c.Deleted)])) {
		walk(eid, null);
	}

	for (const adjust of query(world, [c.AdjustmentLayer, Not(c.Deleted)])) {
		adjustLayers(world, adjust);
	}
}
