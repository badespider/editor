import assert from "node:assert/strict";
import test from "node:test";
import { driveMotionLearning } from "../src/components/sidebar-left/reference-learn-flow.ts";

type Job = { id: string; projectId: string; state: string; message: string; error: string | null;
  renderTask: { token: string; variant: number } | null; receipt: { added: string[] } | null };
const job = (state: string, token?: string): Job => ({ id: "job-1", projectId: "project-1", state, message: state, error: null,
  renderTask: token ? { token, variant: token === "first" ? 0 : 1 } : null, receipt: state === "complete" ? { added: ["learned-pattern"] } : null });

test("learning renders both content variations before their host acknowledgments and returns the durable library receipt", async () => {
  const calls: string[] = [], signal = new AbortController().signal;
  const statuses = [job("awaiting-render", "first"), job("awaiting-render", "second")];
  const receipt = await driveMotionLearning({ projectId: "project-1", signal, assertCurrent() {},
    start: async () => job("discovering"), status: async () => statuses.shift()!, cancel: async () => calls.push("cancel"),
    wait: async () => {}, onProgress: current => calls.push(current.state),
    render: async current => { calls.push(`render:${current.renderTask!.token}`); return 5; },
    rendered: async (_id, scene, token) => { assert.equal(scene, 5); calls.push(`ack:${token}`); return token === "first" ? job("authoring") : job("complete"); },
  });
  assert.deepEqual(receipt, { added: ["learned-pattern"] });
  assert.deepEqual(calls, ["discovering", "awaiting-render", "render:first", "ack:first", "authoring", "awaiting-render", "render:second", "ack:second", "complete"]);
});

test("a stale render snapshot never mounts or acknowledges the same variation twice", async () => {
  let renders = 0, cancels = 0, acknowledgments = 0;
  const receipt = await driveMotionLearning({ projectId: "project-1", signal: new AbortController().signal, assertCurrent() {},
    start: async () => job("awaiting-render", "first"), status: async () => job("complete"), cancel: async () => { cancels++; },
    wait: async () => {}, onProgress() {}, render: async () => { renders++; return 5; },
    rendered: async () => { acknowledgments++; return job("awaiting-render", "first"); },
  });
  assert.deepEqual(receipt, { added: ["learned-pattern"] });
  assert.equal(renders, 1); assert.equal(acknowledgments, 1); assert.equal(cancels, 0);
});

test("cancellation during a slow start cancels the returned job before any native mutation", async () => {
  const controller = new AbortController(); let renders = 0; const cancelled: string[] = [];
  await assert.rejects(driveMotionLearning({ projectId: "project-1", signal: controller.signal, assertCurrent() {},
    start: async () => { controller.abort(); return job("awaiting-render", "first"); }, status: async () => job("complete"),
    cancel: async id => { cancelled.push(id); }, wait: async () => {}, onProgress() {},
    render: async () => { renders++; return 1; }, rendered: async () => job("complete"),
  }), /abort/i);
  assert.equal(renders, 0); assert.ok(cancelled.includes("job-1"));
});

test("project changes after discovery stop before rendering and cancel the owning job", async () => {
  let project = "project-1", renders = 0, cancels = 0;
  await assert.rejects(driveMotionLearning({ projectId: "project-1", signal: new AbortController().signal,
    assertCurrent() { if (project !== "project-1") throw new Error("Project changed"); },
    start: async () => job("discovering"), status: async () => { project = "project-2"; return job("awaiting-render", "first"); },
    cancel: async () => { cancels++; }, wait: async () => {}, onProgress() {},
    render: async () => { renders++; return 1; }, rendered: async () => job("complete"),
  }), /Project changed/);
  assert.equal(renders, 0); assert.equal(cancels, 1);
});

test("foreign job results and missing receipts fail without presenting successful library additions", async () => {
  for (const invalid of [{ ...job("complete"), projectId: "other-project" }, { ...job("complete"), receipt: null }, { ...job("awaiting-render"), renderTask: null }]) {
    let renders = 0;
    await assert.rejects(driveMotionLearning({ projectId: "project-1", signal: new AbortController().signal, assertCurrent() {},
      start: async () => invalid, status: async () => job("complete"), cancel: async () => {}, wait: async () => {}, onProgress() {},
      render: async () => { renders++; return 1; }, rendered: async () => job("complete"),
    }), /another job or project|without a library receipt|no native render task/);
    assert.equal(renders, 0);
  }
});
