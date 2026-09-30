import test from 'node:test';
import assert from 'node:assert/strict';
import { HtmlHost } from '../src/components/engine/decoders/html.ts';

// Exercise the real host with a minimal browser adapter: export must not silently
// succeed after a failed image decode or drawElementImage call.
function fixture(images: object[] = [], drawError = false) {
  const ctx = { setTransform() {}, clearRect() {}, drawElementImage() { if (drawError) throw Error('paint failed'); } };
  const listeners = new Set<() => void>();
  const canvas = { width: 1, height: 1, style: {}, toggleAttribute() {}, appendChild() {}, remove() {}, getContext: () => ctx,
    addEventListener: (_type:string, listener:()=>void) => listeners.add(listener),
    removeEventListener: (_type:string, listener:()=>void) => listeners.delete(listener),
    requestPaint: () => setTimeout(() => { for (const listener of [...listeners]) listener(); }, 0) };
  const element = { style: {}, remove() {}, getAnimations: () => [], querySelectorAll: () => images };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    fonts: { ready: Promise.resolve() }, body: { appendChild() {} }, createElement: (tag: string) => tag === 'canvas' ? canvas : element,
  } });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (cb: () => void) => setTimeout(cb, 0) });
  return new HtmlHost();
}

test('strict HTML export rejects failed images, including complete-but-broken images', async () => {
  for (const complete of [false, true]) {
    const host = fixture([{ complete, naturalWidth: 0, naturalHeight: 0, currentSrc: 'local.png', src: 'local.png', decode: async () => { throw Error('decode failed'); } }]);
    try { await assert.rejects(host.whenReady(0, true), /image/i); } finally { host.dispose(); }
  }
});

test('strict HTML export propagates paint failures, while realtime remains tolerant', () => {
  const host = fixture([], true);
  const ctx = { getTransform: () => ({ a: 1, b: 0, c: 0, d: 1 }), drawImage() {} } as unknown as CanvasRenderingContext2D;
  try { assert.throws(() => host.draw(ctx, 100, 100, true), /paint failed/); }
  finally { host.dispose(); }
});

test('strict HTML export accepts decoded images and updates every requested animation clock', async () => {
  const host = fixture([{ complete: true, naturalWidth: 10, naturalHeight: 10, currentSrc: 'local.png', src: 'local.png' }]);
  const animation = { playState: 'paused', currentTime: -1 };
  host.element.getAnimations = () => [animation as unknown as Animation];
  try { for (const time of [0, 1/30, 2/30, 0]) { await host.whenReady(time, true); assert.equal(animation.currentTime, time * 1000); } }
  finally { host.dispose(); }
});

test('strict readiness waits for an actual paint event and rejects unsupported synchronization',async()=>{
  const host=fixture();
  const canvas=document.createElement('canvas') as HTMLCanvasElement & {requestPaint?:()=>void};
  const paint=canvas.requestPaint!;let requested=false,settled=false;
  canvas.requestPaint=()=>{requested=true;};
  try {
    const ready=host.whenReady(0,true).then(()=>{settled=true;});
    await new Promise(resolve=>setTimeout(resolve,0));assert(requested);assert.equal(settled,false);
    paint();await ready;assert.equal(settled,true);
    delete canvas.requestPaint;await assert.rejects(host.whenReady(0,true),/synchronization/);
  } finally {host.dispose();}
});

test('higher-resolution raster is allocated before paint and is not resized during strict drawing',async()=>{
  const host=fixture(),canvas=document.createElement('canvas');
  const ctx={getTransform:()=>({a:2,b:0,c:0,d:2}),drawImage(){}} as unknown as CanvasRenderingContext2D;
  try {
    host.prepare(100,150,2,2);await host.whenReady(0,true);
    assert.equal(canvas.width,200);assert.equal(canvas.height,300);
    host.draw(ctx,100,150,true);assert.equal(canvas.width,200);assert.equal(canvas.height,300);
  } finally {host.dispose();}
});
