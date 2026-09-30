/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// html-in-canvas (https://github.com/WICG/html-in-canvas). Chromium only,
// behind chrome://flags/#canvas-draw-element; the API surface is still
// moving, so every touchpoint is typed and isolated here.
type DrawElementContext = Ctx2D & {
	drawElementImage(source: Element | unknown, dx: number, dy: number, dw: number, dh: number): DOMMatrix;
};

export function isHtmlInCanvasSupported(): boolean {
	return typeof CanvasRenderingContext2D !== 'undefined'
		&& 'drawElementImage' in CanvasRenderingContext2D.prototype;
}

/**
 * Resolves after the browser's next rendering update (style/layout/paint) has completed.
 */
export function nextRenderingUpdate(): Promise<void> {
	return new Promise(resolve => {
		// timeout in case requestAnimationFrame is not called
		const timeout = setTimeout(resolve, 250);

		requestAnimationFrame(() => {
			clearTimeout(timeout);
			setTimeout(resolve, 0);
		});
	});
}

let htmlCanvas: HTMLCanvasElement | null = null;
let htmlCtx: CanvasRenderingContext2D | null = null;
let htmlHosts = 0;

async function waitForHtmlPaint(): Promise<void> {
	const canvas = htmlCanvas as (HTMLCanvasElement & { requestPaint?: () => void }) | null;
	if (canvas?.requestPaint) {
		await new Promise<void>((resolve, reject) => {
			const done = () => { clearTimeout(timer); canvas.removeEventListener('paint', done); resolve(); };
			const timer = setTimeout(() => { canvas.removeEventListener('paint', done); reject(new Error('HTML export timed out waiting for a paint record')); }, 2000);
			canvas.addEventListener('paint', done, { once: true });
			try { canvas.requestPaint!(); }
			catch (error) { clearTimeout(timer); canvas.removeEventListener('paint', done); reject(error); }
		});
	} else {
		throw new Error('Strict HTML export requires browser canvas paint synchronization');
	}
}

function acquireLayoutCanvas(): HTMLCanvasElement {
	if (!htmlCanvas) {
		htmlCanvas = document.createElement('canvas');
		htmlCanvas.width = 1;
		htmlCanvas.height = 1;
		htmlCanvas.toggleAttribute('layoutsubtree', true);
		htmlCanvas.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;pointer-events:none;';
		document.body.appendChild(htmlCanvas);
		htmlCtx = htmlCanvas.getContext('2d')!;
	}
	htmlHosts++;
	return htmlCanvas;
}

function releaseLayoutCanvas(): void {
	if (--htmlHosts === 0) {
		htmlCanvas?.remove();
		htmlCanvas = null;
		htmlCtx = null;
	}
}

/**
 * DOM host for one HTML paint: a div inside the shared layoutsubtree canvas.
 * The mount document inserts the paint's JSX children into `element` as real,
 * reactive DOM; the browser lays them out at the parent geometry's box size
 * and `draw` rasterizes the result at the destination's device scale and
 * blits it into the rendering context (stage or offscreen alike).
 */
export class HtmlHost {
	public readonly element: HTMLDivElement;
	private disposed = false;
	private warned = false;
	private width = -1;
	private height = -1;

	public constructor() {
		const el = document.createElement('div');
		// pointer-events: none — layoutsubtree children participate in hit
		// testing and would otherwise swallow page interactions.
		el.style.cssText = 'position:absolute;left:0;top:0;overflow:hidden;pointer-events:none;';
		acquireLayoutCanvas().appendChild(el);
		this.element = el;
	}

	/**
	 * Resolves asynchronously loaded html resources.
	 */
	public async whenReady(timeInSeconds: number, strict = false): Promise<void> {
		// sync animations
		for (const animation of this.element.getAnimations({ subtree: true })) {
			if (animation.playState !== 'paused') animation.pause();
			animation.currentTime = timeInSeconds * 1000;
		}

		// wait for fonts to be ready
		const pending: Promise<unknown>[] = [document.fonts.ready];

		// wait for images to be ready
		for (const image of this.element.querySelectorAll('img')) {
			const check = () => {
				if (strict && (image.currentSrc || image.getAttribute?.('src')) && (!image.naturalWidth || !image.naturalHeight))
					throw new Error('HTML export image is missing or failed to decode');
			};
			if (image.complete) { check(); continue; }
			pending.push(image.decode().then(check).catch(error => {
				if (strict) throw new Error('HTML export image failed to decode', { cause: error });
			}));
		}

		return Promise.all(pending).then(() => strict ? waitForHtmlPaint() : nextRenderingUpdate());
	}

	public setSize(width: number, height: number): void {
		if (width === this.width && height === this.height) return;
		this.width = width;
		this.height = height;
		this.element.style.width = `${width}px`;
		this.element.style.height = `${height}px`;
		// Resizing clears Chromium's cached descendant paint records. Allocate
		// the ordinary 1x surface before readiness, never on its first draw.
		if (htmlCanvas && htmlCanvas.width < Math.ceil(width)) htmlCanvas.width = Math.ceil(width);
		if (htmlCanvas && htmlCanvas.height < Math.ceil(height)) htmlCanvas.height = Math.ceil(height);
	}

	/** Allocate at the final export transform BEFORE waiting for browser paint. */
	public prepare(width: number, height: number, scaleX: number, scaleY: number): void {
		this.setSize(width, height);
		if (htmlCanvas && htmlCanvas.width < Math.ceil(width * scaleX)) htmlCanvas.width = Math.ceil(width * scaleX);
		if (htmlCanvas && htmlCanvas.height < Math.ceil(height * scaleY)) htmlCanvas.height = Math.ceil(height * scaleY);
	}

	public draw(ctx: Ctx2D, width: number, height: number, strict = false): void {
		if (this.disposed || !htmlCanvas || !htmlCtx) {
			if (strict) throw new Error('HTML export host is unavailable');
			return;
		}

		this.setSize(width, height);

		try {
			const m = ctx.getTransform();
			const sx = Math.hypot(m.a, m.b) || 1;
			const sy = Math.hypot(m.c, m.d) || 1;
			const pw = Math.max(1, Math.ceil(width * sx));
			const ph = Math.max(1, Math.ceil(height * sy));

			// Grow-only: shrinking would clear and reallocate every time hosts
			// of different sizes share the canvas within one frame.
			if (strict && (htmlCanvas.width < pw || htmlCanvas.height < ph)) throw new Error('HTML export raster changed after paint preparation');
			if (htmlCanvas.width < pw) htmlCanvas.width = pw;
			if (htmlCanvas.height < ph) htmlCanvas.height = ph;

			htmlCtx.setTransform(sx, 0, 0, sy, 0, 0);
			htmlCtx.clearRect(0, 0, width, height);
			(htmlCtx as DrawElementContext).drawElementImage(this.element, 0, 0, width, height);
			ctx.drawImage(htmlCanvas, 0, 0, pw, ph, 0, 0, width, height);
		} catch (e) {
			if (strict) throw new Error(`HTML export paint failed: ${e instanceof Error ? e.message : e}`, { cause: e });
			// A transient failure (subtree not yet laid out or painted) just
			// skips the frame; log once so a permanent one doesn't spam.
			if (!this.warned) {
				this.warned = true;
				console.error(`Error drawing <HtmlPaint> content: ${e instanceof Error ? `${e.name}: ${e.message}` : e}`);
			}
		}
	}

	public dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.element.remove();
		releaseLayoutCanvas();
	}
}
