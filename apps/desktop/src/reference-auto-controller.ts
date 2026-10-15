/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ReferenceAutoService } from "@diffusionstudio/editing-playbook/reference-auto";
import { compareReferenceVideos } from "@diffusionstudio/editing-playbook/reference-node";
import { runMedia } from "@diffusionstudio/editing-playbook/delivery";

const deliverySchema = z.object({ id: z.string().uuid(), projectId: z.string().min(1).max(100), sceneId: z.number().int().nonnegative() }).strict();

/** Use retained decoded source instants, not an assumed reference frame rate. */
export function automaticReferenceComparisonTimes(input: {
  duration: number; sourceRange: { start: number; end: number }; frames: { decodedTime: number }[];
}) {
  const options = z.object({ duration: z.number().finite().min(1 / 30).max(120),
    sourceRange: z.object({ start: z.number().finite().nonnegative(), end: z.number().finite().positive() }).strict(),
    frames: z.array(z.object({ decodedTime: z.number().finite().min(-.00001) })).min(1).max(48),
  }).strict().parse(input);
  if (options.sourceRange.end <= options.sourceRange.start) throw new Error("Reference sample range must have positive duration.");
  // The trusted native generator rounds once onto the same 30 fps grid used
  // by the preview encoder. Requests after its final PTS have no decoded frame.
  const renderedFrames = Math.round(options.duration * 30), renderedLast = (renderedFrames - 1) / 30;
  const intervalEnd = Math.min(options.duration, options.sourceRange.end - options.sourceRange.start);
  const epsilon = .000001;
  const candidates = [...new Set(options.frames.flatMap(frame => {
    const local = frame.decodedTime - options.sourceRange.start;
    if (local < -.00001 || local >= intervalEnd || local > renderedLast + 1e-9) return [];
    // Stay just before a known source PTS: serializing a rounded-up decimal
    // must not select the following source frame. The manifest still reports
    // the actual first-at-or-after decoded timestamp for each side separately.
    return [Math.max(0, Math.min(renderedLast, local - epsilon))];
  }))].sort((a, b) => a - b);
  if (!candidates.length) throw new Error("No retained source frame overlaps the available native preview interval. Inspect additional source evidence before comparing.");
  const count = Math.min(8, candidates.length);
  return count === 1 ? candidates : Array.from({ length: count }, (_, index) => candidates[Math.round(index * (candidates.length - 1) / (count - 1))]);
}

export type AutomaticReferenceReceipt = {
  jobId: string; sceneId: number; projectId: string; layerCount: number; outputDirectory: string;
  previewPath: string; comparisonPath: string; warnings: string[]; technicalPass: true; visualReview: "pending";
};

/** Owns the local post-render comparison. It never executes model-authored code. */
export class ReferenceAutoController {
  readonly service: ReferenceAutoService;
  private comparisons = new Map<string, { controller: AbortController; promise: Promise<AutomaticReferenceReceipt> }>();
  constructor(service = new ReferenceAutoService()) { this.service = service; }

  async cancel(id: string) {
    this.comparisons.get(id)?.controller.abort();
    return this.service.cancel(id);
  }
  finish(input: z.input<typeof deliverySchema>): Promise<AutomaticReferenceReceipt> {
    const options = deliverySchema.parse(input);
    if (this.comparisons.has(options.id)) throw new Error("This reference comparison is already running.");
    const controller = new AbortController();
    const promise = this.finishLocal(options, controller.signal).finally(() => this.comparisons.delete(options.id));
    this.comparisons.set(options.id, { controller, promise });
    return promise;
  }
  private async finishLocal(options: z.output<typeof deliverySchema>, signal: AbortSignal): Promise<AutomaticReferenceReceipt> {
    const job = await this.service.status(options.id);
    if (job.state !== "ready" || !job.result) throw new Error("The reference agent has not produced a validated layer plan.");
    if (job.projectId !== options.projectId) throw new Error("Reference result belongs to another project.");
    const result = job.result, previewPath = join(result.outputDirectory, "preview.mp4");
    signal.throwIfAborted();
    await runMedia(["-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe", "-i", previewPath, "-f", "null", "-"], { signal });
    const times = automaticReferenceComparisonTimes({ duration: result.plan.duration, sourceRange: result.sourceRange, frames: result.evidence.frames });
    const comparison = await compareReferenceVideos({ reference: result.source.path, render: previewPath, times,
      referenceStart: result.sourceRange.start, renderStart: 0, outputDirectory: join(result.outputDirectory, "comparison"), signal });
    if (comparison.comparison.reference.sha256 !== result.source.sha256) throw new Error("Reference video changed after analysis. The draft is preserved; start a new run with the current source.");
    signal.throwIfAborted();
    const warnings = [...new Set([...result.warnings, ...result.plan.uncertainties,
      `Compared ${times.length} retained source-frame instants with the native preview; these sparse pairs are not continuous viewing.`,
      "Style recreation is an AI-generated draft from sampled frames. Review fine text, motion and any omitted details.",
      ...(result.sourceRange.end < result.source.duration ? [`The first ${result.sourceRange.end}s supplied the style sample; later footage was not recreated.`] : [])])];
    const receipt: AutomaticReferenceReceipt = { jobId: job.id, sceneId: options.sceneId, projectId: options.projectId,
      layerCount: result.plan.layers.length + 1, outputDirectory: result.outputDirectory, previewPath,
      comparisonPath: join(comparison.directory, "index.html"), warnings, technicalPass: true, visualReview: "pending" };
    await writeFile(join(result.outputDirectory, "delivery.json"), JSON.stringify({ ...receipt, comparison: comparison.comparison,
      modulePath: join(result.outputDirectory, "native-module.js"), completedAt: new Date().toISOString() }, null, 2), { flag: "wx", mode: 0o600 });
    return receipt;
  }
  async shutdown() {
    for (const item of this.comparisons.values()) item.controller.abort();
    await this.service.shutdown();
    await Promise.allSettled([...this.comparisons.values()].map(item => item.promise));
  }
}
