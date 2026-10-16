import assert from "node:assert/strict";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { compileProject } from "../compile-project.ts";

test("executable catalog modules preserve app singletons through file compilation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "editor-motion-compile-"));
  const path = join(directory, "moment.js");
  try {
    await writeFile(path, 'import { Rect } from "dapi-host:@diffusionstudio/jsx"; import { createMemo } from "dapi-host:solid-js"; export default () => Rect({width:createMemo(()=>42)()});');
    const output = await compileProject({ path });
    assert.match(output, /from "dapi-host:@diffusionstudio\/jsx"/);
    assert.match(output, /from "dapi-host:solid-js"/);
    assert.doesNotMatch(output, /https:\/\/esm\.sh/);
    await writeFile(path, 'import api from "dapi-host:unknown"; export default () => api();');
    await assert.rejects(compileProject({ path }), /Unknown app-provided module/);
  } finally { await unlink(path); await rmdir(directory); }
});

test("canonical host and ordinary userland imports retain their existing resolution", async () => {
  const output = await compileProject({ code: 'import { Rect } from "@diffusionstudio/jsx"; import { createMemo } from "solid-js"; import other from "some-userland-module"; export default () => Rect({width:createMemo(()=>other)()});' });
  assert.match(output, /from "dapi-host:@diffusionstudio\/jsx"/);
  assert.match(output, /from "dapi-host:solid-js"/);
  assert.match(output, /from "https:\/\/esm\.sh\/some-userland-module"/);
});

test("native path tags compile to the host while SVG path descendants remain DOM elements", async () => {
  const native = await compileProject({ code: 'export default () => <rect scene="vector" width={400} height={300}><path width={100} height={100} commands={[{op:"M",x:0,y:0},{op:"L",x:100,y:100}]} strokeColor="#000000" fillEnabled={false}/></rect>;' });
  assert.match(native, /Path as/);
  assert.match(native, /commands/);
  const svg = await compileProject({ code: 'export default () => <rect scene="svg" width={400} height={300}><htmlPaint><svg><path d="M0 0L100 100" /></svg></htmlPaint></rect>;' });
  assert.match(svg, /createElement\("path"\)/);
  assert.doesNotMatch(svg, /Path as/);
});
