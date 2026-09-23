import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMedia } from '../src/media-process.ts';

test('relative media executables retain their original base when the child cwd changes',async()=>{
  const cwd=dirname(fileURLToPath(import.meta.url)),binary=relative(process.cwd(),process.execPath);
  const result=await runMedia(['-e','process.stdout.write(process.cwd())'],{binary,cwd});
  assert.equal(result.toString(),cwd);
});

test('relative FFMPEG_PATH is resolved before entering the prepared bundle directory',async()=>{
  const previous=process.env.FFMPEG_PATH,cwd=dirname(fileURLToPath(import.meta.url));
  process.env.FFMPEG_PATH=relative(process.cwd(),process.execPath);
  try {
    const result=await runMedia(['-e','process.stdout.write(process.cwd())'],{cwd});
    assert.equal(result.toString(),cwd);
  } finally {
    if(previous===undefined)delete process.env.FFMPEG_PATH;else process.env.FFMPEG_PATH=previous;
  }
});
