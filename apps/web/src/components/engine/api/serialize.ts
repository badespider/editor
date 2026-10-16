/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { hasComponent, getRelationTargets } from "bitecs";
import { ChildOf } from "../components/relations";
import { assert } from "@/utils";
import { createEntity, deleteEntity } from "./entities";
import { appendChild } from "./hierarchy";
import { addComponent, setComponent } from "./events";
import { resizeEntity } from "./resize";

import type { DBEntity } from "../types";
import type { EngineWorld } from "./world";

export function serializeEntity(world: EngineWorld, eid: number): DBEntity {
	const record: DBEntity = { id: String(eid), eid };
	const c = world.components;

	if (hasComponent(world, eid, c.Geometry)) {
		record.Geometry = c.Geometry[eid];
	}
	if (hasComponent(world, eid, c.Paint)) {
		record.Paint = c.Paint[eid];
	}
	if (hasComponent(world, eid, c.Group)) {
		record.Group = {};
	}
	if (hasComponent(world, eid, c.Scene)) {
		record.Scene = {};
	}
	if (hasComponent(world, eid, c.Audio)) {
		record.Audio = {};
	}
	if (hasComponent(world, eid, c.AdjustmentLayer)) {
		record.AdjustmentLayer = {};
	}
	if (hasComponent(world, eid, c.Effect)) {
		record.Effect = { type: c.Effect.type[eid], value: c.Effect.value[eid] };
	}
	if (hasComponent(world, eid, c.Shadow)) {
		record.Shadow = {};
	}
	if (hasComponent(world, eid, c.Stroke)) {
		record.Stroke = {};
	}
	if (hasComponent(world, eid, c.Name)) {
		record.Name = c.Name[eid];
	}
	if (hasComponent(world, eid, c.Key)) {
		record.Key = c.Key[eid];
	}
	if (hasComponent(world, eid, c.MountScript)) {
		record.MountScript = {
			mountId: c.MountScript.mountId[eid],
			scriptAssetId: c.MountScript.scriptAssetId[eid],
		};
	}
	if (hasComponent(world, eid, c.MountPath)) {
		record.MountPath = {
			mountId: c.MountPath.mountId[eid],
			path: c.MountPath.path[eid],
		};
	}
	if (hasComponent(world, eid, c.ItemIndex)) {
		record.ItemIndex = c.ItemIndex[eid] ?? 0;
	}
	if (hasComponent(world, eid, c.ClipHeight)) {
		record.ClipHeight = c.ClipHeight[eid];
	}
	if (hasComponent(world, eid, c.Expanded)) {
		record.Expanded = {};
	}
	if (hasComponent(world, eid, ChildOf('*'))) {
		record.ChildOf = getRelationTargets(world, eid, ChildOf)[0] ?? 0;
	}
	if (hasComponent(world, eid, c.IsMask)) {
		record.IsMask = {};
	}
	if (hasComponent(world, eid, c.ClipToBox)) {
		record.ClipToBox = {};
	}
	if (hasComponent(world, eid, c.Position)) {
		record.Position = { x: c.Position.x[eid], y: c.Position.y[eid] };
	}
	if (hasComponent(world, eid, c.Offset)) {
		record.Offset = { x: c.Offset.x[eid], y: c.Offset.y[eid] };
	}
	if (hasComponent(world, eid, c.Rotation)) {
		record.Rotation = c.Rotation[eid];
	}
	if (hasComponent(world, eid, c.Scale)) {
		record.Scale = { x: c.Scale.x[eid], y: c.Scale.y[eid] };
	}
	if (hasComponent(world, eid, c.UniformScale)) {
		record.UniformScale = c.UniformScale[eid];
	}
	if (hasComponent(world, eid, c.Anchor)) {
		record.Anchor = { x: c.Anchor.x[eid], y: c.Anchor.y[eid] };
	}
	if (hasComponent(world, eid, c.Skew)) {
		record.Skew = { x: c.Skew.x[eid], y: c.Skew.y[eid] };
	}
	if (hasComponent(world, eid, c.Size)) {
		record.Size = { width: c.Size.width[eid], height: c.Size.height[eid] };
	}
	if (hasComponent(world, eid, c.Flip)) {
		record.Flip = { x: c.Flip.x[eid], y: c.Flip.y[eid] };
	}
	if (hasComponent(world, eid, c.Appearance)) {
		record.Appearance = {
			opacity: c.Appearance.opacity[eid],
			blendMode: c.Appearance.blendMode[eid],
		};
	}
	if (hasComponent(world, eid, c.CornerRadius)) {
		record.CornerRadius = c.CornerRadius[eid];
	}
	if (hasComponent(world, eid, c.MixedCornerRadius)) {
		record.MixedCornerRadius = {
			topLeft: c.MixedCornerRadius.topLeft[eid],
			topRight: c.MixedCornerRadius.topRight[eid],
			bottomRight: c.MixedCornerRadius.bottomRight[eid],
			bottomLeft: c.MixedCornerRadius.bottomLeft[eid],
		};
	}
	if (hasComponent(world, eid, c.Color)) {
		record.Color = c.Color[eid];
	}
	if (hasComponent(world, eid, c.Blur)) {
		record.Blur = c.Blur[eid];
	}
	if (hasComponent(world, eid, c.AssetId)) {
		record.AssetId = c.AssetId[eid];
	}
	if (hasComponent(world, eid, c.ScaleMode)) {
		record.ScaleMode = c.ScaleMode[eid];
	}
	if (hasComponent(world, eid, c.Shader)) {
		record.Shader = {
			code: c.Shader.code[eid],
			uniforms: c.Shader.uniforms[eid] ?? undefined,
		};
	}
	if (hasComponent(world, eid, c.Volume)) {
		record.Volume = c.Volume[eid];
	}
	if (hasComponent(world, eid, c.Muted)) {
		record.Muted = {};
	}
	if (hasComponent(world, eid, c.ColorStop)) {
		record.ColorStop = {
			offset: c.ColorStop.offset[eid],
			color: c.ColorStop.color[eid],
			opacity: c.ColorStop.opacity[eid],
		};
	}
	if (hasComponent(world, eid, c.StrokeStyle)) {
		record.StrokeStyle = {
			width: c.StrokeStyle.width[eid],
			join: c.StrokeStyle.join[eid],
			cap: c.StrokeStyle.cap[eid],
			miterLimit: c.StrokeStyle.miterLimit[eid],
		};
	}
	if (hasComponent(world, eid, c.Hidden)) {
		record.Hidden = true;
	}
	if (hasComponent(world, eid, c.ClipsContent)) {
		record.ClipsContent = true;
	}
	if (hasComponent(world, eid, c.Sequential)) {
		record.Sequential = {};
	}
	if (hasComponent(world, eid, c.Playback)) {
		record.Playback = {
			loop: c.Playback.loop[eid],
		};
	}
	if (hasComponent(world, eid, c.Delay)) {
		record.Delay = c.Delay[eid];
	}
	if (hasComponent(world, eid, c.PlaybackRate)) {
		record.PlaybackRate = c.PlaybackRate[eid];
	}
	if (hasComponent(world, eid, c.Trim)) {
		record.Trim = {
			start: c.Trim.start[eid],
			end: c.Trim.end[eid],
		};
	}
	if (hasComponent(world, eid, c.Transition)) {
		record.Transition = {
			type: c.Transition.type[eid],
			duration: c.Transition.duration[eid],
		};
	}
	if (hasComponent(world, eid, c.Constraint)) {
		record.Constraint = {
			horizontal: c.Constraint.horizontal[eid],
			vertical: c.Constraint.vertical[eid],
		};
	}
	if (hasComponent(world, eid, c.KeepAspectRatio)) {
		record.KeepAspectRatio = {
			width: c.KeepAspectRatio.width[eid],
			height: c.KeepAspectRatio.height[eid],
		};
	}
	if (hasComponent(world, eid, c.KeyframeTrack)) {
		record.KeyframeTrack = {
			property: c.KeyframeTrack.property[eid],
		};
	}
	if (hasComponent(world, eid, c.Keyframe)) {
		record.Keyframe = {
			time: c.Keyframe.time[eid],
			value: c.Keyframe.value[eid],
			easing: c.Keyframe.easing[eid],
		};
	}
	if (hasComponent(world, eid, c.Animation)) {
		record.Animation = {
			duration: c.Animation.duration[eid],
			delay: c.Animation.delay[eid],
			type: c.Animation.type[eid],
			phase: c.Animation.phase[eid],
		};
	}
	if (hasComponent(world, eid, c.Caption)) {
		record.Caption = {
			type: c.Caption.type[eid],
			colors: c.Caption.colors[eid]?.map(v => v),
			verticalAlign: c.Caption.verticalAlign[eid],
		};
	}
	if (hasComponent(world, eid, c.Chars)) {
		record.Chars = c.Chars[eid];
	}
	if (hasComponent(world, eid, c.TextStyle)) {
		record.TextStyle = {
			leading: c.TextStyle.leading[eid],
			fontSize: c.TextStyle.fontSize[eid],
			fontFamily: c.TextStyle.fontFamily[eid],
			fontWeight: c.TextStyle.fontWeight[eid],
			fontStyle: c.TextStyle.fontStyle[eid],
			textAlign: c.TextStyle.textAlign[eid],
			textBaseline: c.TextStyle.textBaseline[eid],
			textCase: c.TextStyle.textCase[eid],
			letterSpacing: c.TextStyle.letterSpacing[eid],
		};
	}

	return record;
}

export function deserializeEntity(world: EngineWorld, eid: number, e: Partial<DBEntity>): void {
	const c = world.components;

	if (e.Geometry !== undefined) {
		setComponent(world, eid, c.Geometry, e.Geometry);
	}
	if (e.Paint !== undefined) {
		setComponent(world, eid, c.Paint, e.Paint);
	}
	if (e.Group !== undefined) {
		addComponent(world, eid, c.Group);
	}
	if (e.Scene !== undefined) {
		addComponent(world, eid, c.Scene);
	}
	if (e.Audio !== undefined) {
		addComponent(world, eid, c.Audio);
	}
	if (e.AdjustmentLayer !== undefined) {
		addComponent(world, eid, c.AdjustmentLayer);
	}
	if (e.Effect !== undefined) {
		setComponent(world, eid, c.Effect, e.Effect);
	}
	if (e.Shadow !== undefined) {
		addComponent(world, eid, c.Shadow);
	}
	if (e.Stroke !== undefined) {
		addComponent(world, eid, c.Stroke);
	}
	if (e.Name !== undefined) {
		setComponent(world, eid, c.Name, e.Name);
	}
	if (e.Key !== undefined) {
		setComponent(world, eid, c.Key, e.Key);
	}
	if (e.MountScript !== undefined) {
		setComponent(world, eid, c.MountScript, e.MountScript);
	}
	if (e.MountPath !== undefined) {
		setComponent(world, eid, c.MountPath, e.MountPath);
	}
	if (e.ItemIndex !== undefined) {
		setComponent(world, eid, c.ItemIndex, e.ItemIndex);
	}
	if (e.ClipHeight !== undefined) {
		setComponent(world, eid, c.ClipHeight, e.ClipHeight);
	}
	if (e.Expanded !== undefined) {
		addComponent(world, eid, c.Expanded);
	}
	if (e.IsMask !== undefined) {
		addComponent(world, eid, c.IsMask);
	}
	if (e.ClipToBox !== undefined) {
		addComponent(world, eid, c.ClipToBox);
	}
	if (e.Position !== undefined) {
		setComponent(world, eid, c.Position, e.Position);
	}
	if (e.Offset !== undefined) {
		setComponent(world, eid, c.Offset, e.Offset);
	}
	if (e.Rotation !== undefined) {
		setComponent(world, eid, c.Rotation, e.Rotation);
	}
	if (e.Scale !== undefined) {
		setComponent(world, eid, c.Scale, e.Scale);
	}
	if (e.UniformScale !== undefined) {
		setComponent(world, eid, c.UniformScale, e.UniformScale);
	}
	if (e.Anchor !== undefined) {
		setComponent(world, eid, c.Anchor, e.Anchor);
	}
	if (e.Skew !== undefined) {
		setComponent(world, eid, c.Skew, e.Skew);
	}
	if (e.Size !== undefined) {
		resizeEntity(world, eid, e.Size);
	}
	if (e.Flip !== undefined) {
		setComponent(world, eid, c.Flip, e.Flip);
	}
	if (e.Appearance !== undefined) {
		setComponent(world, eid, c.Appearance, e.Appearance);
	}
	if (e.CornerRadius !== undefined) {
		setComponent(world, eid, c.CornerRadius, e.CornerRadius);
	}
	if (e.MixedCornerRadius !== undefined) {
		setComponent(world, eid, c.MixedCornerRadius, e.MixedCornerRadius);
	}
	if (e.Color !== undefined) {
		setComponent(world, eid, c.Color, e.Color);
	}
	if (e.Blur !== undefined) {
		setComponent(world, eid, c.Blur, e.Blur);
	}
	if (e.AssetId !== undefined) {
		setComponent(world, eid, c.AssetId, e.AssetId);
	}
	if (e.ScaleMode !== undefined) {
		setComponent(world, eid, c.ScaleMode, e.ScaleMode);
	}
	if (e.Shader !== undefined) {
		setComponent(world, eid, c.Shader, e.Shader);
	}
	if (e.Volume !== undefined) {
		setComponent(world, eid, c.Volume, e.Volume);
	}
	if (e.Muted !== undefined) {
		addComponent(world, eid, c.Muted);
	}
	if (e.ColorStop !== undefined) {
		setComponent(world, eid, c.ColorStop, e.ColorStop);
	}
	if (e.StrokeStyle !== undefined) {
		setComponent(world, eid, c.StrokeStyle, e.StrokeStyle);
	}
	if (e.Hidden !== undefined) {
		addComponent(world, eid, c.Hidden);
	}
	if (e.ClipsContent !== undefined) {
		addComponent(world, eid, c.ClipsContent);
	}
	if (e.Sequential !== undefined) {
		addComponent(world, eid, c.Sequential);
	}
	if (e.Playback !== undefined) {
		setComponent(world, eid, c.Playback, e.Playback);
	}
	if (e.Delay !== undefined) {
		setComponent(world, eid, c.Delay, e.Delay);
	}
	if (e.PlaybackRate !== undefined) {
		setComponent(world, eid, c.PlaybackRate, e.PlaybackRate);
	}
	if (e.Trim !== undefined) {
		setComponent(world, eid, c.Trim, e.Trim);
	}
	if (e.Transition !== undefined) {
		setComponent(world, eid, c.Transition, e.Transition);
	}
	if (e.Constraint !== undefined) {
		setComponent(world, eid, c.Constraint, e.Constraint);
	}
	if (e.KeepAspectRatio !== undefined) {
		setComponent(world, eid, c.KeepAspectRatio, e.KeepAspectRatio);
	}
	if (e.KeyframeTrack !== undefined) {
		setComponent(world, eid, c.KeyframeTrack, e.KeyframeTrack);
	}
	if (e.Keyframe !== undefined) {
		setComponent(world, eid, c.Keyframe, e.Keyframe);
	}
	if (e.Animation !== undefined) {
		setComponent(world, eid, c.Animation, e.Animation);
	}
	if (e.Caption !== undefined) {
		setComponent(world, eid, c.Caption, e.Caption);
	}
	if (e.Chars !== undefined) {
		setComponent(world, eid, c.Chars, e.Chars);
	}
	if (e.TextStyle !== undefined) {
		setComponent(world, eid, c.TextStyle, e.TextStyle);
	}
	// Attach to parent last so rebuildCaches sees every component this entity
	// has (KeyframeTrack, Keyframe, Animation, IsMask, …). Otherwise their
	// caches stay empty and the UI/motion system can't find them after reload.
	if (e.ChildOf !== undefined) {
		appendChild(world, eid, e.ChildOf);
	}
}

export function cloneFromRecords(world: EngineWorld, records: DBEntity[]) {
	const eidMap = new Map<number, number>();

	for (const record of records) {
		eidMap.set(record.eid, createEntity(world));
	}

	for (const record of records) {
		const eid = eidMap.get(record.eid);
		const copy = { ...record };

		try {
			assert(eid, `Entity ${copy.eid} not found`);

			if (copy.ChildOf !== undefined) {
				copy.ChildOf = eidMap.get(copy.ChildOf) ?? copy.ChildOf;
			}

			deserializeEntity(world, eid, copy);
		} catch (error) {
			if (eid) deleteEntity(world, eid);
			console.error(error);
		}
	}

	return eidMap;
}

/**
 * Strips mount identity from records so a *same-world* copy doesn't collide
 * with the original mount's id — adopt would otherwise bind two entities to one
 * `MountPath`. A duplicated/pasted mount becomes plain static entities: its
 * runtime hosts won't re-run (a documented limitation; re-mount to re-animate).
 * The export/capture clone (`cloneFromRecords` directly) keeps identity so it
 * can adopt.
 */
export function stripMountIdentity(records: DBEntity[]): DBEntity[] {
	return records.map(({ MountScript: _script, MountPath: _path, ...rest }) => rest);
}

export function cloneSubtree(world: EngineWorld, tree: number[]) {
	const records = tree.map(e => serializeEntity(world, e));
	return cloneFromRecords(world, stripMountIdentity(records));
}
