/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ChildOf } from '../components';
import { Not, query } from 'bitecs';
import { createEngineWorld, restoreWorld, switchActiveScene } from '../api';

import { transformSystem } from '../systems/transform';
import { renderSystem } from '../systems/render';
import { playbackSystem } from '../systems/playback';
import { motionSystem } from '../systems/motion';
import { syncDomSystem } from '../systems/dom';
import { inputSystem } from '../systems/input-system';
import { createCameraController } from '../systems';
import { hudSystem } from '../systems/hud';
import { createKeyboardSystem } from '../systems/keyboard';
import { realizeMounts } from '@/utils/mount';
import { createSignal } from 'solid-js';

import type Stats from 'stats.js';

export type Engine = ReturnType<typeof createEngine>;


export function createEngine(id: string) {
	const audio = new AudioContext({ latencyHint: 'playback' });
	const world = createEngineWorld(id, audio);
	const camera = createCameraController(world);
	const keyboard = createKeyboardSystem(world, camera);
	const [initialized, setInitialized] = createSignal(false);

	let running = false;
	let disposed = false;
	let rafId: number | null = null;
	let stats: Stats | null = null;

	async function init(el: HTMLCanvasElement) {
		if (disposed || world.canvas) return;

		world.canvas = el;
		world.ctx = el.getContext('2d');
		camera.init(el);
		keyboard.init();

		await restoreWorld(world);
		if (disposed) return;
		await realizeMounts(world);
		if (disposed) { world.liveMounts.disposeAll(); return; }

		const c = world.components;
		// Auto-select the first scene as the active timeline
		for (const eid of query(world, [c.Geometry, c.Scene, Not(ChildOf('*')), Not(c.Deleted)])) {
			switchActiveScene(world, eid);
			break;
		}

		// Mount FPS stats panel if in development mode
		if (import.meta.env.DEV) {
			const { default: Stats } = await import('stats.js');
			if (disposed) return;
			stats = new Stats();
			stats.showPanel(0); // 0 = FPS
			stats.dom.style.position = 'absolute';
			stats.dom.style.top = '12px';
			stats.dom.style.left = '12px';
			stats.dom.style.zIndex = '100';
			world.canvas.parentElement!.appendChild(stats.dom);
		}

		applyResize();
		start();
		setInitialized(true);
	}

	function tick(timestamp: number): void {
		if (disposed || !running || !world.ctx || !world.canvas) return;

		stats?.begin();

		world.timestamp.delta = timestamp - world.timestamp.now
		world.timestamp.now = timestamp

		inputSystem(world);
		playbackSystem(world);
		motionSystem(world);
		transformSystem(world);
		renderSystem(world);
		hudSystem(world);
		syncDomSystem(world);

		stats?.end();

		rafId = requestAnimationFrame(tick);
	}

	function start(): void {
		if (disposed || running) return;
		running = true;
		rafId = requestAnimationFrame(tick);
	}

	function stop(): void {
		running = false;
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	}

	function dispose(): void {
		if (disposed) return;
		disposed = true;
		stop();
		world.liveMounts.disposeAll();
		keyboard.dispose();
		camera.dispose();
	}

	function applyResize(): void {
		const canvas = world.canvas;
		if (!(canvas instanceof HTMLCanvasElement)) return;
		const parent = canvas.parentElement;
		if (!parent) return;

		const rect = parent.getBoundingClientRect();
		const dpr = window.devicePixelRatio;
		const nextWidth = Math.round(rect.width * dpr);
		const nextHeight = Math.round(rect.height * dpr);

		canvas.style.width = `${rect.width}px`;
		canvas.style.height = `${rect.height}px`;

		// Always update world.canvas — the renderer reads it for the clear
		// rect and the transform system uses it as the top-level parent rect
		// for size/constraint/culling, regardless of bitmap reassignment.
		canvas.width = nextWidth;
		canvas.height = nextHeight;
		world.resolution = dpr;

		// Skip the bitmap reassignment when nothing changed — assigning
		// canvas.width/height resets the 2d context and clears the bitmap.
		if (canvas.width === nextWidth && canvas.height === nextHeight) return;

		canvas.width = nextWidth;
		canvas.height = nextHeight;
	}

	function resize(): void {
		if (disposed) return;
		applyResize();

		// ResizeObserver fires after layout, before paint. Without a synchronous
		// redraw, the just-cleared canvas (assigning width/height clears the
		// bitmap) paints empty until the next requestAnimationFrame — visible
		// as a flash during continuous resize. Re-run the render pipeline now
		// so the new canvas size paints with fresh content in the same frame.
		if (running) {
			transformSystem(world);
			renderSystem(world);
			syncDomSystem(world);
		}
	}

	return {
		init,
		start,
		stop,
		dispose,
		resize,
		initialized,
		get running() { return running; },
		get disposed() { return disposed; },
		get world() { return world; },
		get camera() { return camera; },
	};
}
