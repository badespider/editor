/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { hasComponent, Not, Or, query } from 'bitecs';
import { ChildOf, PaintType } from '../components';
import { resolveAudioDecoder, resolveCaptionDecoder, resolveImageDecoder, resolveSequenceDecoder, resolveShaderHost, resolveVideoDecoder } from '../decoders';
import { getParentEntity } from '../api';
import { getTransitionWindow } from '../utils/transition';
import { AudioBus } from '../services/audio-bus';
import { clamp } from '@/utils';
import { addComponent, removeComponent } from '../api/events';

import type { EngineWorld } from '../api/world';

const WARMUP_FRAMES = 15;

function advancePlayhead(world: EngineWorld, eid: number): void {
	const c = world.components;
	// In offline mode the encoder sets the playhead explicitly per frame, so
	// skip the delta-based advance — running it would either double-step or
	// drift depending on how the caller set `world.timestamp.delta`.
	if (world.mode !== 'realtime') return;

	const fps = world.frameRate;
	let looped = false;

	// Only advance the playhead while playing. The audio play/stop bookkeeping
	// below must still run when stopped, otherwise a manual stop (playing
	// flipped to 0 externally) is never observed — `wasPlaying` stays stuck at
	// 1 and the next play isn't re-anchored, so scheduled buffers land in the
	// past and play silently.
	if (c.Playback.playing[eid] === 1) {
		const dt = world.timestamp.delta / 1000;
		const speed = c.Playback.speed[eid] || 1;
		const previousTime = c.Computed.localTimeInSeconds[eid];
		let time = previousTime + dt * speed;

		const hasWorkarea = hasComponent(world, eid, c.Workarea);
		const duration = c.Computed.duration[eid];
		const durationSeconds = duration / fps;

		const maxSeconds = hasWorkarea
			? (c.Workarea.end[eid] ?? duration) / fps
			: durationSeconds;

		const minSeconds = hasWorkarea
			? (c.Workarea.start[eid] ?? 0) / fps
			: 0;

		if (time >= maxSeconds) {
			if (c.Playback.loop[eid] === 1) {
				time = minSeconds;
				looped = true;
			} else {
				c.Playback.playing[eid] = 0;
			}
		} else if (time <= minSeconds) {
			if (c.Playback.loop[eid] === 1) {
				time = maxSeconds;
				looped = true;
			} else {
				c.Playback.playing[eid] = 0;
				time = minSeconds;
			}
		}

		c.Computed.localTimeInSeconds[eid] = clamp(time, minSeconds, maxSeconds);
		c.Computed.localTime[eid] = Math.round(c.Computed.localTimeInSeconds[eid] * fps);
	}

	// Handle audio play/stop transitions
	const ctx = world.audio;
	const playing = c.Playback.playing[eid] ?? 0;
	const wasPlaying = c.AudioPlayback.wasPlaying[eid] ?? 0;

	if ((playing && !wasPlaying) || looped) {
		c.AudioPlayback.contextOffsetInSeconds[eid] = ctx.currentTime;
		c.AudioPlayback.timelineOffsetInSeconds[eid] = c.Computed.localTimeInSeconds[eid];
	}

	if (!playing && wasPlaying) {
		resetDecoders(world, eid);
	}

	c.AudioPlayback.wasPlaying[eid] = playing;
}

function forwardVideoDecoder(world: EngineWorld, sid: number, eid: number, fid: number): void {
	const c = world.components;
	const fps = world.frameRate;

	const globalFrame = c.Computed.localTime[sid];
	const localFrame = c.Computed.localTime[eid];
	const start = c.Computed.start[eid];
	const end = c.Computed.end[eid];
	const hasCache = world.mode === 'realtime';
	const warmupDecoder = globalFrame >= start - WARMUP_FRAMES && globalFrame < end + WARMUP_FRAMES && hasCache;

	let trimStart = 0
	let trimEnd = c.Computed.duration[eid];

	if (hasComponent(world, eid, c.Trim)) {
		trimStart = c.Trim.start[eid];
		trimEnd = c.Trim.end[eid] ?? trimEnd;
	}

	const decoder = resolveVideoDecoder(world, fid);
	if (!decoder) return;

	if (c.Computed.visibility[eid] === 1 || warmupDecoder) {
		const seekFrame = clamp(localFrame, trimStart, trimEnd);
		const seekPromise = decoder.seekTo(seekFrame, fps);
		world.promises?.push(seekPromise ?? null);
	}
}

function forwardSequenceDecoder(world: EngineWorld, sid: number, eid: number, fid: number): void {
	const c = world.components;
	const fps = world.frameRate;

	const globalFrame = c.Computed.localTime[sid];
	const localFrame = c.Computed.localTime[eid];
	const start = c.Computed.start[eid];
	const end = c.Computed.end[eid];
	const hasCache = world.mode === 'realtime';
	const warmupDecoder = globalFrame >= start - WARMUP_FRAMES && globalFrame < end + WARMUP_FRAMES && hasCache;

	let trimStart = 0
	let trimEnd = c.Computed.duration[eid];

	if (hasComponent(world, eid, c.Trim)) {
		trimStart = c.Trim.start[eid];
		trimEnd = c.Trim.end[eid] ?? trimEnd;
	}

	const decoder = resolveSequenceDecoder(world, fid, hasCache);
	if (!decoder) return;

	if (c.Computed.visibility[eid] === 1 || warmupDecoder) {
		const seekFrame = clamp(localFrame, trimStart, trimEnd);
		const seekPromise = decoder.seekTo(seekFrame, fps);
		world.promises?.push(seekPromise);
	}
}

function forwardCaptionDecoder(world: EngineWorld, _sid: number, eid: number): void {
	const c = world.components;

	const localFrame = c.Computed.localTime[eid];
	const fps = world.frameRate;

	const decoder = resolveCaptionDecoder(world, eid);
	decoder?.seekTo(world, eid, localFrame / fps);
}

/**
 * Forward audio decoder for a child entity.
 * @param world Engine World
 * @param sid Scene Entity Id
 * @param eid Child Entity Id
 * @param aid Optional alterantive eid of the entity that carries the audio
 * @returns 
 */
function forwardAudioDecoder(world: EngineWorld, sid: number, eid: number, aid?: number): void {
	const c = world.components;

	if (hasComponent(world, eid, c.Muted)) return;

	const resolvedDecoder = resolveAudioDecoder(world, aid ?? eid);
	if (!resolvedDecoder) return;

	const { decoder, initPromise } = resolvedDecoder;

	const fps = world.frameRate;
	const currentTime = c.Computed.localTime[sid];
	const localFrame = c.Computed.localTime[eid];
	const trimStart = c.Trim.start[eid] ?? 0;

	const playbackRate = c.PlaybackRate[eid] ?? 1;
	const delay = c.Computed.delay[eid];
	const trimEnd = c.Trim.end[eid] ?? c.Computed.duration[eid] ?? 0;

	const audioOffset = c.AudioPlayback.contextOffsetInSeconds[sid] ?? 0;
	const playbackOffset = c.AudioPlayback.timelineOffsetInSeconds[sid] ?? 0;
	// In offline rendering the encoder pins contextOffset to 0 and playbackOffset
	// to the workarea start, so this term shifts scheduled audio back into the
	// encoded window (and resolves to 0 when there is no workarea).
	const audioDelay = audioOffset - playbackOffset
	const bus = resolveAudioBus(world, eid);

	if (!decoder.ready) {
		world.promises?.push(initPromise);
	} else if (c.Computed.visibility[eid] === 1 && c.Playback.playing[sid] === 1) {
		const playPromise = decoder.playTo(bus, {
			relativeFrom: localFrame / fps,
			relativeTo: (localFrame + 15) / fps,
			trimStart: trimStart / fps,
			trimEnd: trimEnd / fps,
			playbackRate,
			currentTime: currentTime / fps,
			relativeDelay: (delay / fps) + audioDelay,
		});
		world.promises?.push(playPromise);
	} else {
		decoder.reset();
	}
}

function forwardImageDecoder(world: EngineWorld, _sid: number, _eid: number, fid: number): void {
	const resolvedDecoder = resolveImageDecoder(world, fid);
	if (!resolvedDecoder) return;

	const { decoder, initPromise } = resolvedDecoder;

	if (!decoder.ready) {
		world.promises?.push(initPromise);
	}
}

/**
 * Forward decoders for a child entity.
 * @param world Engine World
 * @param sid Scene Entity Id
 * @param eid Child Entity Id
 */
function forwardDecoders(world: EngineWorld, sid: number, eid: number): void {
	const c = world.components;

	const hidden =
		hasComponent(world, eid, c.Hidden)
		|| hasComponent(world, eid, c.Culled);
	const visualsEnabled = !hidden && world.mode !== 'offline-audio';

	let paintAudioEid: number | undefined;
	if (!hidden) {
		for (const fid of query(world, [ChildOf(eid), c.Paint, Not(c.Deleted), Not(c.Hidden)])) {
			if (c.Paint[fid] === PaintType.VIDEO) {
				if (visualsEnabled) {
					forwardVideoDecoder(world, sid, eid, fid);
				}
				paintAudioEid = fid;
			}

			if (c.Paint[fid] === PaintType.SEQUENCE && visualsEnabled) {
				forwardSequenceDecoder(world, sid, eid, fid);
			}

			if (c.Paint[fid] === PaintType.IMAGE && visualsEnabled) {
				forwardImageDecoder(world, sid, eid, fid);
			}

			if (c.Paint[fid] === PaintType.SHADER && visualsEnabled) {
				const ready = resolveShaderHost(world, fid)?.whenReady();
				if (ready) world.promises?.push(ready);
			}
		}
	}

	if (hasComponent(world, eid, c.Caption) && visualsEnabled) {
		forwardCaptionDecoder(world, sid, eid);
	}

	if (hasComponent(world, eid, c.Audio) || paintAudioEid) {
		forwardAudioDecoder(world, sid, eid, paintAudioEid);
	}

	for (const cid of query(world, [ChildOf(eid), Or(c.Geometry, c.Group, c.AdjustmentLayer), Not(c.Deleted), Not(c.Hidden)])) {
		forwardDecoders(world, sid, cid);
	}
}

function updateVisibility(world: EngineWorld, sid: number, eid: number): void {
	const c = world.components;

	// Root or dragging entity is always visible
	if (eid === sid || hasComponent(world, eid, c.Dragging)) {
		c.Computed.visibility[eid] = 1;
	} else {
		const globalFrame = c.Computed.localTime[sid];
		const delay = c.Computed.delay[eid] ?? 0;
		const playbackRate = c.PlaybackRate[eid] ?? 1;

		const start = c.Computed.start[eid];
		const end = c.Computed.end[eid];

		c.Computed.localTime[eid] = Math.round((globalFrame - delay) * playbackRate);
		c.Computed.visibility[eid] = globalFrame >= start && globalFrame < end ? 1 : 0;
	}

	for (const cid of query(world, [Or(c.Geometry, c.Group, c.AdjustmentLayer), ChildOf(eid), Not(c.Deleted)])) {
		updateVisibility(world, sid, cid);
	}
}

function resetDecoders(world: EngineWorld, eid: number): void {
	const c = world.components;
	c.AudioDecoder[eid]?.reset();

	for (const cid of query(world, [ChildOf(eid), c.AudioDecoder, Not(c.Deleted)])) {
		resetDecoders(world, cid);
	}
}


function collectAncestors(world: EngineWorld, eid: number): number[] {
	const path: number[] = [];

	let current: number | null = eid;
	while (current) {
		path.push(current);
		current = getParentEntity(world, current);
	}

	return path.toReversed();
}

function resolveAudioBus(world: EngineWorld, eid: number) {
	const c = world.components;
	let bus = c.AudioBus[eid];
	if (bus) return bus;

	const ancestors = collectAncestors(world, eid);

	// Walk root -> leaf, connecting each bus's gain into its parent's input
	// (root connects into the context destination). Reuse buses that already
	// exist; only newly created ones need wiring.
	let currentInput: AudioNode = world.audio.destination;

	for (const aeid of ancestors) {
		let abus = c.AudioBus[aeid];

		if (!abus) {
			abus = new AudioBus(world, aeid);
			addComponent(world, aeid, c.AudioBus, false);
			c.AudioBus[aeid] = abus;
			abus.connect(currentInput);
		}

		currentInput = abus.input;
	}

	return c.AudioBus[eid];
}

function getGlobalFrame(world: EngineWorld, eid: number): number {
	const c = world.components;

	let current: number | null = eid;
	while (current) {
		if (hasComponent(world, current, c.Playback)) {
			return c.Computed.localTime[current];
		}
		current = getParentEntity(world, current);
	}

	return 0;
}

export function playbackSystem(world: EngineWorld): void {
	const c = world.components;

	// handle root playback
	for (const eid of query(world, [c.Playback, Not(c.Deleted)])) {
		advancePlayhead(world, eid);
	}

	for (const eid of query(world, [Or(c.Geometry, c.Group, c.AdjustmentLayer), Not(ChildOf('*')), Not(c.Deleted)])) {
		updateVisibility(world, eid, eid);
		forwardDecoders(world, eid, eid);
	}

	// handle transition visibility
	for (const cid of query(world, [Or(c.Geometry, c.Group, c.AdjustmentLayer), c.Transition, Not(c.Deleted)])) {
		const parentEid = getParentEntity(world, cid);

		if (parentEid == null || !hasComponent(world, parentEid, c.Sequential)) {
			console.info('Removing transition due to non-sequential parent', cid);
			// System-driven cleanup of orphaned state — not a user edit.
			removeComponent(world, cid, c.Transition, false);
			continue;
		}

		const children = query(world, [ChildOf(parentEid), Or(c.Geometry, c.Group, c.AdjustmentLayer), Not(c.Deleted)]);
		const partner = children.find(rid => c.Computed.start[rid] === c.Computed.end[cid]);
		if (!partner) continue;
		const window = getTransitionWindow(world, cid, partner);
		const globalFrame = getGlobalFrame(world, cid);
		if (globalFrame >= window.start && globalFrame < window.end) {
			c.Computed.visibility[cid] = 1;
			c.Computed.visibility[partner] = 1;
		}
	}

	// Sync audio buses
	let soloedEntities: Set<number> | null = null;
	for (const eid of query(world, [c.AudioBus, Not(c.Deleted)])) {
		c.AudioBus[eid]?.sync();
		if (!hasComponent(world, eid, c.Soloed)) continue;

		if (soloedEntities === null) {
			soloedEntities = new Set();
		}

		for (const aid of collectAncestors(world, eid)) {
			soloedEntities.add(aid);
		}
	}

	if (soloedEntities) {
		for (const eid of query(world, [c.AudioBus, Not(c.Deleted)])) {
			if (!soloedEntities.has(eid)) {
				c.AudioBus[eid]?.mute();
			}
		}
	}

	world.liveMounts.advance();
}
