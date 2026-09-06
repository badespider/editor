/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AudioSampleSink } from 'mediabunny';
import { getAudioTrack } from './audio';

import type { AudioAsset, VideoAsset } from '../db';

let peakCache = new WeakMap<AudioAsset | VideoAsset, Uint8ClampedArray>();
let inflight = new WeakMap<AudioAsset | VideoAsset, Promise<Uint8ClampedArray | null>>();

const TARGET_BARS = 128;

export function clearAudioPeaksCache() {
	peakCache = new WeakMap<AudioAsset | VideoAsset, Uint8ClampedArray>();
	inflight = new WeakMap<AudioAsset | VideoAsset, Promise<Uint8ClampedArray | null>>();
}

/**
 * Synchronous, allocation-free peak lookup for hot paths (render loop).
 * Returns cached peaks or `null`. Kicks off a build on first call.
 */
export function getAudioPeaks(
	asset: AudioAsset | VideoAsset,
): Uint8ClampedArray | null {
	const key = asset;

	const cached = peakCache.get(key);
	if (cached) return cached;

	if (!inflight.has(key)) {
		inflight.set(key, buildPeaks(key, asset));
	}

	return null;
}

/**
 * Async peak lookup for UI components that can await.
 * Returns peaks from cache or waits for the build to finish.
 */
export async function getAudioPeaksAsync(
	asset: AudioAsset | VideoAsset,
): Promise<Uint8ClampedArray | null> {
	const key = asset;

	const cached = peakCache.get(key);
	if (cached) return cached;

	let promise = inflight.get(key);
	if (!promise) {
		promise = buildPeaks(key, asset);
		inflight.set(key, promise);
	}

	return promise;
}

async function buildPeaks(
	key: AudioAsset | VideoAsset,
	asset: AudioAsset | VideoAsset,
): Promise<Uint8ClampedArray | null> {
	// An invalidation must not be undone by an older asynchronous peak build.
	const cache = peakCache;
	const pending = inflight;
	try {
		const track = await getAudioTrack(asset);
		if (!track) return null;

		const sink = new AudioSampleSink(track);
		const chunks: Uint8ClampedArray[] = [];

		for await (const sample of sink.samples()) {
			let floats: Float32Array;
			let numChannels: number;
			let numFrames: number;
			try {
				const size = sample.allocationSize({ format: 'f32', planeIndex: 0 });
				floats = new Float32Array(size / Float32Array.BYTES_PER_ELEMENT);
				sample.copyTo(floats, { format: 'f32', planeIndex: 0 });

				numChannels = sample.numberOfChannels;
				numFrames = floats.length / numChannels;
			} finally {
				sample.close();
			}

			const framePeaks = new Uint8ClampedArray(numFrames);
			for (let f = 0; f < numFrames; f++) {
				let max = 0;
				for (let ch = 0; ch < numChannels; ch++) {
					max = Math.max(max, Math.pow(Math.abs(floats[f * numChannels + ch]), 0.8));
				}
				framePeaks[f] = Math.floor(max * 255);
			}
			chunks.push(framePeaks);
		}

		if (chunks.length === 0) return null;

		const totalFrames = chunks.reduce((s, c) => s + c.length, 0);
		const merged = new Uint8ClampedArray(totalFrames);
		let offset = 0;
		for (const chunk of chunks) {
			merged.set(chunk, offset);
			offset += chunk.length;
		}

		const peaks = new Uint8ClampedArray(TARGET_BARS);
		const ratio = totalFrames / TARGET_BARS;

		for (let i = 0; i < TARGET_BARS; i++) {
			const start = Math.floor(i * ratio);
			const end = Math.floor((i + 1) * ratio);
			let max = 0;
			for (let j = start; j < end && j < totalFrames; j++) {
				max = Math.max(max, merged[j]);
			}
			peaks[i] = max;
		}

		cache.set(key, peaks);
		return peaks;
	} catch (e) {
		console.error('Failed to build audio peaks', e);
		return null;
	} finally {
		pending.delete(key);
	}
}
