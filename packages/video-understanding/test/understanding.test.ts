import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { GeminiProvider, geminiSchema } from "../src/gemini.ts";
import { applyEvidenceChecks, cacheKey, UnderstandingService, validateReview } from "../src/service.ts";
import { overviewSchema, reviewSchema, requestSchema, searchEvidence, validateOverview } from "../src/types.ts";
import type { AnalysisRecord, VideoEvent } from "../src/types.ts";
import { audioEvidence, frame, prepare, probe, run } from "../src/media.ts";

const event = { id: "e1", start: 0, end: 1, observation: "A red screen", speech: "", onScreenText: "", inference: "", uncertainty: "", modalities: ["visual"] };
const checks = { observation: { status: "supported", reason: "Visible red screen" },
  speech: { status: "not_applicable", reason: "No quoted speech" }, screenText: { status: "not_applicable", reason: "No quoted text" } };
test("overview rejects invalid timestamps, duplicate ids, and budget overruns", () => {
  assert.equal(validateOverview({ summary: "Clip", events: [event] }, 2, 1).events.length, 1);
  for (const events of [[{ ...event, start: -1 }], [{ ...event, end: 3 }], [{ ...event, start: 1 }], [event, event]]) {
    assert.throws(() => validateOverview({ summary: "Clip", events }, 2, 3));
  }
  assert.throws(() => validateOverview({ summary: "Clip", events: [event] }, 2, 0));
});
test("verification requires consistent, localized evidence", () => {
  const review = { status: "supported", reason: "Visible", observedStart: 0, observedEnd: 1, checks };
  assert.equal(validateReview(review, 2).status, "supported");
  assert.throws(() => validateReview({ ...review, observedEnd: 3 }, 2));
  assert.throws(() => validateReview({ ...review, observedStart: null, observedEnd: null }, 2));
  assert.throws(() => validateReview({ ...review, observedStart: null }, 2));
});
test("digital silence overrides a model's falsely supported speech claim", () => {
  const review = reviewSchema.parse({ status: "supported", reason: "Interface visible", observedStart: 0, observedEnd: 1,
    checks: { ...checks, speech: { status: "supported", reason: "The model claims a voice is audible" } } });
  const candidate = { ...event, speech: "This is a test of the emergency broadcast system." } as VideoEvent;
  const corrected = applyEvidenceChecks(review, candidate, { hasTrack: true, digitalSilence: true, peakDb: null, samples: 1000 });
  assert.equal(corrected.status, "contradicted");
  assert.equal(corrected.checks.speech.status, "contradicted");
  assert.match(corrected.reason, /digital silence/);
  assert.equal(review.status, "supported", "Do not mutate the provider's original response");
});
test("a verifier must check every nonempty claim, and a partial clip is not full verification", () => {
  const review = reviewSchema.parse({ status: "supported", reason: "Interface", observedStart: 0, observedEnd: 1, checks });
  const audio = { hasTrack: true, digitalSilence: false, peakDb: -10, samples: 1000 };
  assert.equal(applyEvidenceChecks(review, { ...event, onScreenText: "Success" } as VideoEvent, audio).status, "insufficient_evidence");
  assert.equal(applyEvidenceChecks(review, event as VideoEvent, audio, false).status, "insufficient_evidence");
});
test("cache key changes with source, model, goal, mode, and event budget", () => {
  const options = requestSchema.parse({ path: "video.mp4", allowUpload: true });
  const key = cacheKey("abc", options, "gemini-3.7-flash");
  for (const changed of [{ ...options, goal: "different" }, { ...options, mode: "prepare" as const }, { ...options, maxEvents: 2 }]) {
    assert.notEqual(cacheKey("abc", changed, "gemini-3.7-flash"), key);
  }
  assert.notEqual(cacheKey("xyz", options, "gemini-3.7-flash"), key);
  assert.notEqual(cacheKey("abc", options, "gemini-3.5-flash-lite"), key);
  assert.equal(cacheKey("abc", { ...options, path: "moved.mp4", force: true }, "gemini-3.7-flash"), key);
});
test("search preserves uncertainty and excludes unsupported events when requested", () => {
  const record = { events: [
    { ...event, verification: { status: "supported" } },
    { ...event, id: "e2", verification: { status: "insufficient_evidence" } },
  ] } as unknown as AnalysisRecord;
  assert.equal(searchEvidence(record, "RED", true).length, 1);
  assert.equal(searchEvidence(record, "red", false).length, 2);
  assert.equal(searchEvidence(record, "green").length, 0);
});
test("upload consent and untrusted job ids are validated", async () => {
  const service = new UnderstandingService(join(tmpdir(), "unused-understanding-test"));
  await assert.rejects(service.start({ path: "anything" }), /uploads video/);
  await assert.rejects(service.status("../../secrets"), /Invalid job/);
});
test("Gemini contract: local async mode, defensive polling, final output only, usage and cleanup", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (init?.method === "POST") return Response.json({ id: "i1", status: "in_progress" });
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({ id: "i1", status: "completed", usage: { total_tokens: 123 }, steps: [
      { type: "thought", content: [{ type: "text", text: "not evidence" }] },
      { type: "model_output", content: [{ type: "text", text: '{"ok":true}' }] },
    ] });
  };
  const provider = new GeminiProvider("test-placeholder", fetcher, 1);
  const result = await provider.ask("gemini-3.7-flash", [{ type: "video", uri: "files/test", mime_type: "video/mp4", processing: "agentic", resolution: "high" }], "Inspect", z.object({ ok: z.boolean() }), new AbortController().signal);
  assert.deepEqual(result, { ok: true });
  const body = JSON.parse(calls[0].init?.body as string);
  assert.equal(body.input[0].processing, "agentic");
  assert.equal(body.response_format.mime_type, "application/json");
  assert.equal(body.background, false);
  assert.equal(body.store, false);
  assert.equal(body.generation_config.max_output_tokens, 4096);
  assert.equal(provider.usage[0].total_tokens, 123);
  assert.deepEqual(await provider.close(), []);
  assert.equal(calls.at(-1)?.init?.method, "DELETE");
});
test("Gemini does not retry billable failures or accept malformed JSON", async () => {
  let count = 0;
  const failed = new GeminiProvider("test", async () => { count++; return new Response("private server details", { status: 429 }); }, 1);
  await assert.rejects(failed.ask("gemini-3.7-flash", [], "x", z.object({ ok: z.boolean() }), new AbortController().signal), /HTTP 429/);
  assert.equal(count, 1);
  const malformed = new GeminiProvider("test", async () => Response.json({ id: "i2", status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "not json" }] }] }), 1);
  await assert.rejects(malformed.ask("gemini-3.7-flash", [], "x", z.object({ ok: z.boolean() }), new AbortController().signal), /invalid structured evidence/);
});
test("Gemini schema uses a compatible subset without weakening local checks", () => {
  const schema = JSON.stringify(geminiSchema(overviewSchema));
  for (const unsupported of ["$schema", "maxLength", "minLength", "maxItems", "minItems", "additionalProperties"]) assert.ok(!schema.includes(unsupported));
  const review = geminiSchema(reviewSchema) as { properties: { observedStart: { type: string[] } } };
  assert.deepEqual(review.properties.observedStart.type, ["number", "null"]);
  assert.throws(() => overviewSchema.parse({ summary: "", events: [] }));
});
test("Gemini stateless completed responses need no stored interaction id", async () => {
  const provider = new GeminiProvider("test", async () => Response.json({ status: "completed", usage: { total_tokens: 10 }, steps: [
    { type: "processing_call" }, { type: "processing_result" },
    { type: "model_output", content: [{ type: "text", text: '{"ok":true}' }] },
  ] }));
  assert.deepEqual(await provider.ask("gemini-3.5-flash-lite", [], "x", z.object({ ok: z.boolean() }), new AbortController().signal), { ok: true });
  assert.equal(provider.usage[0].processing_calls, 1);
  assert.deepEqual(await provider.close(), []);
});
test("Gemini cancellation stops polling and cancels the remote interaction", async () => {
  const methods: string[] = [];
  const controller = new AbortController();
  const provider = new GeminiProvider("test", async (url, init) => {
    methods.push(`${init?.method} ${url}`);
    if (methods.length === 1) { controller.abort(); return Response.json({ id: "i3", status: "in_progress" }); }
    return new Response(null, { status: 204 });
  }, 1);
  await assert.rejects(provider.ask("gemini-3.7-flash", [], "x", z.object({ ok: z.boolean() }), controller.signal));
  await provider.close();
  assert.equal(methods.length, 3);
  assert.ok(methods[1].endsWith("/cancel"));
});

// Real codecs and filesystem, synthetic known content, zero network/API charges.
test("real media: native pixels, VFR PTS, offline job persistence and cache", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "editor-understanding-test-"));
  const input = join(directory, "source.mkv");
  await run(process.env.FFMPEG_PATH || "ffmpeg", ["-v", "error", "-nostdin", "-n", "-f", "lavfi", "-i", "color=c=red:s=320x180:r=10:d=2",
    "-vf", "select=not(mod(n\\,3))", "-fps_mode", "vfr", "-c:v", "libx264", input]);
  const source = await prepare(input, join(directory, "prepared"), 10);
  assert.equal(source.width, 320); assert.equal(source.height, 180);
  assert.equal(source.audio.hasTrack, false);
  const image = await frame(source.preparedPath, 0.31, join(directory, "prepared"), "pts");
  assert.ok(image.time >= 0.31 && image.time <= 0.61, `Unexpected decoded PTS ${image.time}`);
  assert.ok((await readFile(image.path)).byteLength > 0);
  const service = new UnderstandingService(join(directory, "cache"), async () => { throw new Error("Offline mode must not create a provider"); });
  const first = await service.start({ path: input, mode: "prepare" });
  const completed = await service.wait(first.id);
  assert.equal(completed.state, "completed", completed.error);
  const evidence = await service.evidence(first.id);
  assert.equal(evidence.events.length, 0);
  assert.equal(evidence.overviewFrames.length, 3);
  assert.equal((await probe(input)).width, 320);
  const second = await service.start({ path: input, mode: "prepare" });
  const cached = await service.wait(second.id);
  assert.equal(cached.cached, true);
  assert.equal(cached.resultPath, completed.resultPath);
  const restarted = new UnderstandingService(join(directory, "cache"));
  assert.equal((await restarted.status(first.id)).state, "completed");
});
test("real audio: distinguish digitally silent samples from an audible tone", { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "editor-audio-evidence-"));
  for (const [name, filter, silence] of [["silent", "anullsrc=r=16000:cl=mono", true], ["tone", "sine=frequency=440:sample_rate=16000", false]] as const) {
    const path = join(directory, `${name}.wav`);
    await run(process.env.FFMPEG_PATH || "ffmpeg", ["-v", "error", "-nostdin", "-n", "-f", "lavfi", "-i", filter, "-t", "0.5", path]);
    const result = await audioEvidence(path, true);
    assert.equal(result.digitalSilence, silence);
    assert.ok(result.samples > 0);
  }
});
test("full pipeline rejects hallucinated speech, records usage, and reuses cache without a provider", { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "editor-understanding-pipeline-"));
  const input = join(directory, "silent.mp4");
  await run(process.env.FFMPEG_PATH || "ffmpeg", ["-v", "error", "-nostdin", "-n", "-f", "lavfi", "-i", "color=c=red:s=320x180:r=10:d=2",
    "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "2", "-c:v", "libx264", "-c:a", "aac", input]);
  let calls = 0, factories = 0, closed = 0;
  const service = new UnderstandingService(join(directory, "cache"), async () => {
    factories++;
    return {
      usage: [{ total_tokens: 123 }],
      upload: async () => ({ name: "files/test", uri: "test-only", state: "ACTIVE" }),
      ask: async () => ++calls === 1 ? { summary: "Red screen", events: [{ ...event, speech: "An invented quote" }] }
        : { status: "supported", reason: "Model agrees", observedStart: 0, observedEnd: 1,
          checks: { ...checks, speech: { status: "supported", reason: "Invented claim" } } },
      close: async () => { closed++; return []; },
    };
  });
  const first = await service.start({ path: input, allowUpload: true });
  const done = await service.wait(first.id);
  assert.equal(done.state, "completed", done.error);
  const result = await service.evidence(first.id);
  assert.equal(result.events[0].verification.status, "contradicted");
  assert.equal(result.events[0].editReadiness.safeToAutoEdit, false);
  assert.equal((await service.evidence(first.id, "", true)).events.length, 0);
  const second = await service.start({ path: input, allowUpload: true });
  assert.equal((await service.wait(second.id)).cached, true);
  assert.equal(factories, 1); assert.equal(calls, 2); assert.equal(closed, 1);
});
