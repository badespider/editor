/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { referenceStudySchema } from "@diffusionstudio/editing-playbook/reference";
import type { ReferenceMedia, ReferenceStudy } from "@diffusionstudio/editing-playbook/reference";

export const MAX_REFERENCE_STUDY_BYTES = 524_288;

/** JSON is inert data. This helper never fetches paths, mounts code or reads media bytes. */
export function parseReferenceStudyText(text: string): ReferenceStudy {
  if (new TextEncoder().encode(text).byteLength > MAX_REFERENCE_STUDY_BYTES) throw new RangeError("Study JSON must be at most 512 KiB");
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw new TypeError("Study file must contain valid JSON"); }
  return referenceStudySchema.parse(input);
}

/** Bound the exact emitted UTF-8 bytes so our own download/display always reloads. */
export function serializeReferenceStudy(input: unknown): string {
  const study = referenceStudySchema.parse(input);
  const encoder = new TextEncoder();
  const pretty = JSON.stringify(study, null, 2);
  if (encoder.encode(pretty).byteLength <= MAX_REFERENCE_STUDY_BYTES) return pretty;
  const compact = JSON.stringify(study);
  if (encoder.encode(compact).byteLength <= MAX_REFERENCE_STUDY_BYTES) return compact;
  throw new RangeError("Study JSON must be at most 512 KiB");
}

export type ReferenceBinding = Readonly<{ matches: boolean; identity: "unattached" | "mismatch" | "metadata-only" | "checksum"; message: string }>;
/** Browser-selected files use metadata; an unavailable hash must never be represented as a checksum match. */
export function matchReferenceMedia(expected: ReferenceMedia, actual: ReferenceMedia | null): ReferenceBinding {
  if (!actual) return { matches: false, identity: "unattached", message: `Choose ${expected.name} to attach this study.` };
  if (expected.name !== actual.name || expected.bytes !== actual.bytes || expected.width !== actual.width || expected.height !== actual.height ||
      !Number.isFinite(actual.duration) || Math.abs(expected.duration - actual.duration) > .05) {
    return { matches: false, identity: "mismatch", message: "This file's name, size, dimensions or duration differs from the study. Choose its reference file or start a new study." };
  }
  if (expected.sha256 && actual.sha256 && expected.sha256 !== actual.sha256) return { matches: false, identity: "mismatch", message: "The reference checksum differs from this study." };
  if (expected.sha256 && actual.sha256) return { matches: true, identity: "checksum", message: "Reference metadata and checksum match." };
  return { matches: true, identity: "metadata-only", message: "Reference metadata matches. Checksum identity is unverified in this preview." };
}

export type ReferenceComparisonWindow = Readonly<{ referenceStart: number; renderStart: number; duration: number }>;
/** Two authored starts share an elapsed preview clock only over their valid overlap. */
export function referenceComparisonWindow(referenceDuration: number, renderDuration: number, referenceStart: number, renderStart: number): ReferenceComparisonWindow | null {
  if (![referenceDuration, renderDuration, referenceStart, renderStart].every(Number.isFinite) || referenceDuration <= 0 || renderDuration <= 0 ||
      referenceStart < 0 || renderStart < 0 || referenceStart >= referenceDuration || renderStart >= renderDuration) return null;
  return Object.freeze({ referenceStart, renderStart, duration: Math.min(referenceDuration - referenceStart, renderDuration - renderStart) });
}

export function referenceComparisonTimes(window: ReferenceComparisonWindow, elapsed: number) {
  if (!Number.isFinite(elapsed)) throw new RangeError("Comparison time must be finite");
  const time = Math.max(0, Math.min(window.duration, elapsed));
  return { elapsed: time, reference: window.referenceStart + time, render: window.renderStart + time };
}

export function newReferenceBeat(sourceTime: number, duration: number, existingIds: readonly string[]): ReferenceStudy["beats"][number] {
  if (!Number.isFinite(sourceTime) || !Number.isFinite(duration) || duration <= 0) throw new RangeError("A finite reference duration and playhead are required");
  if (existingIds.length >= 64) throw new RangeError("A study supports at most 64 beats");
  let index = 1; while (existingIds.includes(`beat-${index}`)) index++;
  const start = Math.max(0, Math.min(sourceTime, Math.max(0, duration - .001)));
  return { id: `beat-${index}`, start, end: Math.min(duration, start + 2), observation: "", inference: "", uncertainty: "", layout: "", typography: "", palette: [], motion: "", camera: "", transition: "", nativeMomentIds: [] };
}
