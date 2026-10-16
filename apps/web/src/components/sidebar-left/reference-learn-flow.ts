/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

type LearningJob = { id: string; projectId: string; state: string; message: string; error: string | null;
  renderTask: { token: string } | null; receipt: unknown };

function pollDelay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 700);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** A task token is rendered once; publishing remains the host's post-render decision. */
export async function driveMotionLearning<Job extends LearningJob>(options: {
  projectId: string; signal: AbortSignal; assertCurrent(): void;
  start(): Promise<Job>; status(id: string): Promise<Job>; cancel(id: string): Promise<unknown>;
  render(job: Job): Promise<number>; rendered(id: string, sceneId: number, token: string): Promise<Job>;
  onProgress(job: Job): void; wait?: (signal: AbortSignal) => Promise<void>;
}): Promise<NonNullable<Job["receipt"]>> {
  const { signal } = options, rendered = new Set<string>();
  let id: string | undefined;
  const current = () => { signal.throwIfAborted(); options.assertCurrent(); };
  const abort = () => { if (id) void options.cancel(id).catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    current(); let job = await options.start(); id = job.id;
    if (signal.aborted) abort();
    while (true) {
      current();
      if (job.id !== id || job.projectId !== options.projectId) throw new Error("Motion learning result belongs to another job or project.");
      options.onProgress(job);
      if (job.state === "failed" || job.state === "cancelled") throw new Error(job.error || `Motion learning ${job.state}`);
      if (job.state === "complete") {
        if (!job.receipt) throw new Error("Motion learning finished without a library receipt.");
        return job.receipt as NonNullable<Job["receipt"]>;
      }
      if (job.state === "awaiting-render") {
        const task = job.renderTask;
        if (!task) throw new Error("Motion learning has no native render task.");
        if (rendered.has(task.token)) {
          // A status snapshot may lag the completed acknowledgment. Never
          // remount or acknowledge an old token; wait for the host to advance.
          await (options.wait ?? pollDelay)(signal); current(); job = await options.status(id); continue;
        }
        const sceneId = await options.render(job); current(); rendered.add(task.token);
        job = await options.rendered(id, sceneId, task.token);
      } else {
        await (options.wait ?? pollDelay)(signal); current(); job = await options.status(id);
      }
    }
  } catch (error) { abort(); throw error; }
  finally { signal.removeEventListener("abort", abort); }
}
