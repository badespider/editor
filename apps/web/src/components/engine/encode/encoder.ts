/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { framesToSeconds } from '../utils';
import {
	CanvasSource,
	Output,
	AudioSample,
	AudioSampleSource,
} from 'mediabunny';
import { TargetBuffer } from './buffer';
import { createOutputFormat } from './format';
import { assert } from '@/utils';
import { createRenderEventDetail, getRenderFrameCount } from './utils';
import { version } from '../../../../package.json';
import { hasComponent, Hierarchy, Not, Or, query } from 'bitecs';

import { ChildOf } from '../components';
import { createEngineWorld, switchActiveScene } from '../api';
import { recomputeEntityTimeRange } from '../api/utils';
import { addComponent } from '../api/events';
import { playbackSystem } from '../systems/playback';
import { motionSystem } from '../systems/motion';
import { transformSystem } from '../systems/transform';
import { renderSystem } from '../systems/render';
import { cloneFromRecords, serializeEntity } from '../api/serialize';
import { getEntityTree } from '../api/query';
import { AudioBus } from '../services/audio-bus';
import { realizeMounts } from '@/utils/mount';

import type { EngineWorld } from '../api/world';
import type { EncoderConfig } from './interfaces';
import type { ExportResult } from './types';

export async function createEncoder(sourceWorld: EngineWorld, config: EncoderConfig) {
	const sourceComponents = sourceWorld.components;
	const sourceSceneEid = config.scene;
	const frameRate = config.video?.fps ?? sourceWorld.frameRate;
	const numberOfChannels = config.audio?.numberOfChannels ?? 2;
	const sampleRate = config.audio?.sampleRate ?? 48000;
	const sceneWidth = sourceComponents.Computed.width[sourceSceneEid];
	const sceneHeight = sourceComponents.Computed.height[sourceSceneEid];
	const sceneEnd = sourceComponents.Computed.end[sourceSceneEid];

	// Honor the scene's Workarea component: render only the frames between
	// Workarea.start and Workarea.end instead of the full scene duration.
	const hasWorkarea = hasComponent(sourceWorld, sourceSceneEid, sourceComponents.Workarea);
	const workareaStart = hasWorkarea
		? Math.max(0, Math.min(sceneEnd, sourceComponents.Workarea.start[sourceSceneEid] ?? 0))
		: 0;
	const workareaEnd = hasWorkarea
		? Math.max(workareaStart, Math.min(sceneEnd, sourceComponents.Workarea.end[sourceSceneEid] ?? sceneEnd))
		: sceneEnd;
	const workareaFrames = workareaEnd - workareaStart;

	const playheadStartSeconds = framesToSeconds(workareaStart, sourceWorld.frameRate);
	const duration = framesToSeconds(workareaFrames, sourceWorld.frameRate);
	const audioBitrate = config.audio?.bitrate ?? 128e3;
	const videoBitrate = config.video?.bitrate ?? 10e6;
	const audioCodec = config.audio?.codec ?? 'aac';
	const resolution = config.video?.resolution ?? 1080;
	const scale = Math.round(resolution * 1e6 / sceneHeight) / 1e6;
	const width = Math.round(sceneWidth * scale / 2) * 2;
	const height = Math.round(sceneHeight * scale / 2) * 2;
	const videoCodec = config.video?.codec ?? 'avc';
	const containerFormat = config.format ?? 'mp4';
	const audioEnabled = config.audio?.enabled ?? true;
	const videoEnabled = config.video?.enabled ?? true;
	const frameDuration = 1 / frameRate;

	if (config.format === 'ogg') {
		config.audio = { ...config.audio, enabled: true };
		config.video = { ...config.video, enabled: false };
	}

	const sceneSubtree = getEntityTree(sourceWorld, sourceSceneEid);
	const subtreeRecords = sceneSubtree.map(eid => serializeEntity(sourceWorld, eid));

	// Offscreen canvas
	const offscreenCanvas = new OffscreenCanvas(width, height);
	const offscreenCtx = offscreenCanvas.getContext('2d')!;

	// Offline audio context
	const offlineAudioCtx = new OfflineAudioContext(
		numberOfChannels,
		Math.ceil(duration * sampleRate),
		sampleRate,
	);

	// Build a fresh offline world that shares assets with the source. Fonts are
	// already loaded into the document; copying the array just tracks them as
	// loaded so the new world doesn't try to re-add them.
	const world = createEngineWorld(sourceWorld.projectId, offlineAudioCtx);
	world.mode = videoEnabled ? 'offline-video' : 'offline-audio';
	world.assets = sourceWorld.assets;
	world.fonts = [...sourceWorld.fonts];
	world.ctx = offscreenCtx;
	world.canvas = offscreenCanvas;
	world.resolution = scale;
	world.camera = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
	world.frameRate = frameRate;
	world.promises = [];

	const eidMap = cloneFromRecords(world, subtreeRecords);
	const sceneEid = eidMap.get(sourceSceneEid);
	assert(sceneEid !== undefined, 'Failed to clone scene subtree');

	rescaleFrameTimestamps(world, sourceWorld.frameRate, frameRate);
	rescaleAllTimeRanges(world);
	normalizeSceneTransform(world, sceneEid);

	switchActiveScene(world, sceneEid);

	const c = world.components;
	// The workarea (Workarea component) is runtime-only and never serialized, so
	// it isn't cloned into the offline world — nothing to strip here. The encoder
	// drives the playhead explicitly within the [workareaStart, workareaEnd]
	// window computed from the source scene above.
	c.Computed.localTimeInSeconds[sceneEid] = playheadStartSeconds;
	c.Computed.localTime[sceneEid] = Math.round(playheadStartSeconds * frameRate);
	c.Playback.playing[sceneEid] = 1;
	c.Playback.loop[sceneEid] = 0;
	c.Playback.speed[sceneEid] = 1;
	// Anchor audio scheduling: context starts at t=0 but the playhead starts at
	// playheadStartSeconds, so audioDelay = -playheadStartSeconds shifts each
	// entity's scheduled audio back into the encoded window.
	c.AudioPlayback.contextOffsetInSeconds[sceneEid] = 0;
	c.AudioPlayback.timelineOffsetInSeconds[sceneEid] = playheadStartSeconds;

	// Re-execute any mounts into this offline world so it owns its own reactive
	// graphs + runtime hosts (surface/html). The per-frame playbackSystem then
	// drives them via world.liveMounts, so ticker-animated surfaces render.
	const mounts = videoEnabled ? await realizeMounts(world) : null;

	// Set up mediabunny output
	const buffer = await TargetBuffer.create(config.target);
	const format = await createOutputFormat(buffer, config.format);
	const output = new Output({ format, target: buffer.target });

	output.setMetadataTags({
		comment: `Made with Diffusion v${version}`,
	});

	const audioSource = new AudioSampleSource({
		codec: audioCodec,
		bitrate: audioBitrate,
	});

	const sceneFills = [...query(world, [c.Paint, ChildOf(sceneEid), Not(c.Deleted)])];

	const videoSource = new CanvasSource(offscreenCanvas, {
		codec: videoCodec,
		bitrate: videoBitrate,
		latencyMode: 'quality',
		alpha: containerFormat === 'webm' && !sceneFills.length
			? 'keep'
			: 'discard',
	});

	if (audioEnabled) {
		output.addAudioTrack(audioSource);
	}

	if (videoEnabled) {
		output.addVideoTrack(videoSource);
	}

	// Audio worklet streams render-quantum chunks back to the main thread so
	// we can hand them to mediabunny in step with the visual frame loop.
	const audioWorkletUrl = createAudioWorkletUrl();
	await offlineAudioCtx.audioWorklet.addModule(audioWorkletUrl);

	const sharedBuffer = new SharedArrayBuffer(4);
	const sharedUint32Array = new Uint32Array(sharedBuffer);
	const mixNode = offlineAudioCtx.createGain();

	const sinkNode = new AudioWorkletNode(offlineAudioCtx, 'sink', {
		channelCount: numberOfChannels,
		channelCountMode: 'explicit',
		numberOfInputs: 1,
		numberOfOutputs: 1,
		outputChannelCount: [numberOfChannels],
		processorOptions: {
			buffer: sharedUint32Array,
		},
	});

	mixNode.connect(sinkNode);
	sinkNode.connect(offlineAudioCtx.destination);

	// connect the scene bus to the mix node
	addComponent(world, sceneEid, c.AudioBus, false);
	const newbus = new AudioBus(world, sceneEid);
	c.AudioBus[sceneEid] = newbus;
	newbus.connect(mixNode);

	let sampleIndex = 0;
	let audioSourcePromise: Promise<void> | null = null;

	const allAudioReceived = Promise.withResolvers<void>();

	sinkNode.port.onmessage = event => {
		if (output?.state === 'canceled') {
			return;
		}

		const planarBuffer = event.data as Float32Array;

		if (planarBuffer.length === 0) {
			allAudioReceived.resolve();
			return;
		}

		const sampleCount = planarBuffer.length / numberOfChannels;

		const audioSample = new AudioSample({
			data: planarBuffer,
			format: 'f32-planar',
			numberOfChannels,
			sampleRate,
			timestamp: sampleIndex / sampleRate,
		});
		audioSourcePromise = audioSource.add(audioSample).finally(() => {
			audioSample.close();
		});

		sampleIndex += sampleCount;
	};

	const emitProgress = createThrottledCallback(config.onProgress, 1000 / 3); // 3 times per second

	let canceled = false;
	const cancel = () => (canceled = true);

	const render = async (): Promise<ExportResult> => {
		try {
			await output.start();
			const start = performance.now();
			const startTime = start;
			const totalFrames = getRenderFrameCount(workareaFrames, sourceWorld.frameRate, frameRate);

			let audioRenderingDone = false;
			let audioRenderingCompleted: Promise<AudioBuffer> | null = null;
			if (audioEnabled) {
				audioRenderingCompleted = offlineAudioCtx.startRendering();
				audioRenderingCompleted.then(() => { audioRenderingDone = true; });
			}

			let lastAudioSampleCount = 0;

			for (let frame = 0; frame < totalFrames; frame++) {
				if (canceled) {
					await output.cancel();
					Atomics.store(sharedUint32Array, 0, 2 ** 31 - 1);
					return { type: 'canceled' };
				}

				const timestamp = frame * frameDuration;
				const playheadSeconds = playheadStartSeconds + timestamp;

				// advancePlayhead is a no-op in offline mode; the encoder owns the
				// playhead and writes both seconds + frames before each tick.
				c.Computed.localTimeInSeconds[sceneEid] = playheadSeconds;
				c.Computed.localTime[sceneEid] = Math.round(playheadSeconds * frameRate);
				world.timestamp.delta = frameDuration * 1000;
				world.timestamp.now += world.timestamp.delta;

				{
					playbackSystem(world);
					await resolverSystem(world);
					motionSystem(world);
				}

				if (videoEnabled) {
					// only visual systems
					transformSystem(world);
					renderSystem(world);
				}

				if (videoEnabled) {
					await videoSource.add(timestamp, frameDuration);
				}

				if (audioEnabled) {
					await audioSourcePromise;

					while (Atomics.load(sharedUint32Array, 0) > sampleRate && !audioRenderingDone) {
						await new Promise(resolve => setTimeout(resolve, 0));
					}

					const totalAudioSampleCount = Math.floor(timestamp * sampleRate);
					const diff = totalAudioSampleCount - lastAudioSampleCount;
					Atomics.add(sharedUint32Array, 0, diff);
					lastAudioSampleCount = totalAudioSampleCount;
				}

				emitProgress(createRenderEventDetail(frame, totalFrames, startTime));
			}

			console.info(
				`Encoded frames at ${((totalFrames * 1000) / (performance.now() - start)).toFixed(2)}FPS`
			);

			if (audioEnabled) {
				assert(audioRenderingCompleted !== null, 'Audio rendering was not started');

				Atomics.add(
					sharedUint32Array,
					0,
					Math.ceil(duration * sampleRate) + sampleRate - lastAudioSampleCount,
				);

				await audioRenderingCompleted;

				sinkNode.port.postMessage(null);
				await allAudioReceived.promise;
			}

			console.info('Finalizing file');

			await output.finalize();

			console.info('Export complete');

			return {
				type: 'success',
				data: await buffer.close(containerFormat),
			};
		} catch (e) {
			return {
				type: 'error',
				error: e instanceof Error ? e : new Error('Unknown error'),
			};
		} finally {
			URL.revokeObjectURL(audioWorkletUrl);
			// Free the graphs + hosts realized above (this offline world is
			// discarded, so nothing else disposes them — an HtmlHost otherwise
			// leaks a canvas on document.body).
			mounts?.disposeAll();
		}
	};

	return {
		render,
		cancel,
	};
}


function audioWorkletCode() {
	// eslint-disable-next-line no-undef
	class SinkProcessor extends AudioWorkletProcessor {
		buffer: Uint32Array;

		constructor(options: {
			processorOptions: {
				buffer: Uint32Array;
			};
		}) {
			super();

			this.buffer = options.processorOptions.buffer;

			this.port.onmessage = () => {
				this.port.postMessage(new Float32Array(0));
			};
		}

		process(inputs: Float32Array[][], outputs: Float32Array[][]) {
			const input = inputs[0];
			const output = outputs[0];
			const renderQuantum = output[0].length;

			while (Atomics.load(this.buffer, 0) < renderQuantum);

			const planarBuffer = new Float32Array(output.length * output[0].length);
			for (let channel = 0; channel < Math.min(input.length, output.length); channel++) {
				planarBuffer.set(input[channel], channel * output[0].length);
			}

			this.port.postMessage(planarBuffer, [planarBuffer.buffer]);

			Atomics.sub(this.buffer, 0, renderQuantum);

			return true;
		}
	}

	// eslint-disable-next-line no-undef
	registerProcessor('sink', SinkProcessor);
}

function createAudioWorkletUrl(): string {
	const blob = new Blob([`(${audioWorkletCode.toString()})()`], { type: 'application/javascript' });
	return URL.createObjectURL(blob);
}

function createThrottledCallback<T>(callback: ((value: T) => void) | undefined, intervalMs: number): (value: T) => void {
	let lastCalledAt = -Infinity;

	return (value: T) => {
		const now = performance.now();
		if (now - lastCalledAt < intervalMs) {
			return;
		}

		lastCalledAt = now;
		callback?.(value);
	};
}

function rescaleFrameTimestamps(
	world: EngineWorld,
	sourceFrameRate: number,
	targetFrameRate: number,
): void {
	if (sourceFrameRate === targetFrameRate) return;

	const c = world.components;
	const ratio = targetFrameRate / sourceFrameRate;
	const rescale = (v: number) => Math.round(v * ratio);

	for (const eid of query(world, [Or(c.Delay, c.Trim, c.Transition, c.Keyframe, c.Animation)])) {
		if (hasComponent(world, eid, c.Delay)) {
			c.Delay[eid] = rescale(c.Delay[eid] ?? 0);
		}
		if (hasComponent(world, eid, c.Trim)) {
			c.Trim.start[eid] = rescale(c.Trim.start[eid] ?? 0);
			c.Trim.end[eid] = rescale(c.Trim.end[eid] ?? 0);
		}
		if (hasComponent(world, eid, c.Transition)) {
			c.Transition.duration[eid] = rescale(c.Transition.duration[eid] ?? 0);
		}
		if (hasComponent(world, eid, c.Keyframe)) {
			c.Keyframe.time[eid] = rescale(c.Keyframe.time[eid] ?? 0);
		}
		if (hasComponent(world, eid, c.Animation)) {
			c.Animation.duration[eid] = rescale(c.Animation.duration[eid] ?? 0);
			c.Animation.delay[eid] = rescale(c.Animation.delay[eid] ?? 0);
		}
	}
}

function normalizeSceneTransform(world: EngineWorld, sceneEid: number): void {
	const c = world.components;
	c.Position.x[sceneEid] = 0;
	c.Position.y[sceneEid] = 0;
	c.Offset.x[sceneEid] = 0;
	c.Offset.y[sceneEid] = 0;
	c.Rotation[sceneEid] = 0;
	c.Scale.x[sceneEid] = 1;
	c.Scale.y[sceneEid] = 1;
	c.Skew.x[sceneEid] = 0;
	c.Skew.y[sceneEid] = 0;
	// computeLocalMatrix reads the Computed.* mirror, not the raw components.
	// The base components are populated via setComponent during the clone, which
	// fires the observer that copies the (canvas) position into Computed. Writing
	// the raw arrays above bypasses that observer, so the Computed mirror must be
	// reset here too — otherwise the scene renders at its canvas position instead
	// of centered in the export.
	c.Computed.positionX[sceneEid] = 0;
	c.Computed.positionY[sceneEid] = 0;
	c.Computed.offsetX[sceneEid] = 0;
	c.Computed.offsetY[sceneEid] = 0;
	c.Computed.rotation[sceneEid] = 0;
	c.Computed.scaleX[sceneEid] = 1;
	c.Computed.scaleY[sceneEid] = 1;
	c.Computed.skewX[sceneEid] = 0;
	c.Computed.skewY[sceneEid] = 0;
}

async function resolverSystem(world: EngineWorld) {
	if (world.promises?.length) {
		await Promise.all(world.promises.filter(promise => promise !== null));
		world.promises = [];
	}
}

function rescaleAllTimeRanges(world: EngineWorld): void {
  const c = world.components;
	// TODO: Find a better solution for this
  // Hierarchy(ChildOf) yields parents before children (top-down). A single pass
  // is wrong for group-like nodes: their bounds aggregate from children, but the
  // children haven't been rescaled yet when the parent is visited, so the group
  // would inherit stale (pre-rescale) child bounds. Do two passes:
  //   1. top-down  — refresh accumulated delay + leaf/Trim bounds (parents first)
  //   2. bottom-up — groups now aggregate from already-rescaled children
  const entities = query(world, [Or(c.Geometry, c.Group), Hierarchy(ChildOf), Not(c.Deleted)]);
  for (let i = 0; i < entities.length; i++) {
    recomputeEntityTimeRange(world, entities[i]);
  }
  for (let i = entities.length - 1; i >= 0; i--) {
    recomputeEntityTimeRange(world, entities[i]);
  }
}
