import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Plan } from "../src/schema.ts";
import { probe, renderPreview } from "../src/preview.ts";

const output = process.argv[2];
if (!output) throw new Error("Usage: node test/synthetic-preview.ts <new-scratch-directory>");
const directory = resolve(output);
await mkdir(directory, { recursive: false });
const ffmpeg = (args: string[]) => {
  const result = spawnSync(process.env.FFMPEG_PATH || "ffmpeg", ["-v", "error", "-nostdin", "-n", ...args], { windowsHide: true, encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  return result;
};
ffmpeg(["-f", "lavfi", "-i", "color=c=red:s=96x160:r=30:d=0.5", "-an", "-c:v", "libx264", join(directory, "red.mp4")]);
ffmpeg(["-f", "lavfi", "-i", "color=c=blue:s=160x90:r=30:d=0.5", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.5", "-c:v", "libx264", "-c:a", "aac", "-shortest", join(directory, "blue.mp4")]);
const plan: Plan = {
  schemaVersion: 1, brief: { goal: "Technical mixed-source fixture", audience: "Developers", format: "montage", minDuration: 0.9, maxDuration: 1.1, allowReorder: false },
  skills: ["editor-review"], sources: [
    { id: "red", path: "red.mp4", duration: 0.5, audio: "no_track" },
    { id: "blue", path: "blue.mp4", duration: 0.5, audio: "other" },
  ],
  evidence: ["red", "blue"].map(id => ({ id, sourceId: id, start: 0, end: 0.5, observation: `Generated ${id} color fixture`, kind: "visual", verification: "observed" })),
  beats: ["red", "blue"].map(id => ({ id, role: "action", purpose: `Display ${id} fixture`, evidenceIds: [id] })),
  segments: ["red", "blue"].map(id => ({ id, sourceId: id, beatId: id, in: 0, out: 0.5, reason: "Test mixed orientation and audio track availability", evidenceIds: [id] })),
  protectedRanges: [], speechRanges: [], preferences: [], review: { previewInspected: false, reviewer: "", checks: [] },
};
const result = await renderPreview(plan, { output: join(directory, "mixed.mp4"), baseDirectory: directory });
const metadata = await probe(result.path);
assert.equal(metadata.duration, 1);
assert.equal(metadata.width, 1280); assert.equal(metadata.height, 720); assert.ok(metadata.hasAudio);
// Decode actual samples. The absent first track must be silence, while the second source retains its tone.
const samples = spawnSync(process.env.FFMPEG_PATH || "ffmpeg", ["-v", "error", "-i", result.path, "-map", "0:a:0", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"], { windowsHide: true, timeout: 30_000, maxBuffer: 2_000_000 });
assert.equal(samples.status, 0, samples.stderr?.toString());
const meanPower = (start: number, end: number, buffer = samples.stdout) => {
  let sum = 0, count = 0;
  for (let i = Math.floor(start * 48000); i < Math.floor(end * 48000); i++) { const sample = buffer.readFloatLE(i * 4); sum += sample * sample; count++; }
  return sum / count;
};
assert.ok(meanPower(0.05, 0.4) < 0.000001);
assert.ok(meanPower(0.6, 0.9) > 0.0001);
// Nonzero video origin and an intentional 200 ms audio delay must remain aligned.
ffmpeg(["-copyts", "-f", "lavfi", "-i", "color=c=green:s=160x90:r=30:d=0.5", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.3",
  "-vf", "setpts=PTS+5/TB", "-af", "asetpts=PTS+5.2/TB", "-fps_mode", "passthrough", "-c:v", "libx264", "-c:a", "pcm_s16le", join(directory, "offset.mkv")]);
const offsetPlan = structuredClone(plan);
offsetPlan.sources = [{ id: "offset", path: "offset.mkv", duration: 0.5, audio: "other" }];
offsetPlan.evidence = [{ ...plan.evidence[0], id: "offset", sourceId: "offset" }];
offsetPlan.beats = [{ ...plan.beats[0], id: "offset", evidenceIds: ["offset"] }];
offsetPlan.segments = [{ ...plan.segments[0], id: "offset", sourceId: "offset", beatId: "offset", evidenceIds: ["offset"] }];
offsetPlan.brief.minDuration = 0.4; offsetPlan.brief.maxDuration = 0.6;
const offsetResult = await renderPreview(offsetPlan, { output: join(directory, "aligned.mp4"), baseDirectory: directory });
const aligned = spawnSync(process.env.FFMPEG_PATH || "ffmpeg", ["-v", "error", "-i", offsetResult.path, "-map", "0:a:0", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"], { windowsHide: true, timeout: 30_000, maxBuffer: 2_000_000 });
assert.equal(aligned.status, 0, aligned.stderr?.toString());
assert.ok(meanPower(0.04, 0.15, aligned.stdout) < 0.000001, "Audio delay was lost");
assert.ok(meanPower(0.3, 0.44, aligned.stdout) > 0.0001, "Expected delayed audio is absent");
const report = { ...result, syntheticOnly: true, mixedAspectRatiosEncoded: true, missingTrackPaddedWithSilence: true, secondTrackToneRetained: true, commonVideoOriginAndAudioDelayPreserved: true };
await writeFile(join(directory, "result.json"), JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify(report, null, 2));
