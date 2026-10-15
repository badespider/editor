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
