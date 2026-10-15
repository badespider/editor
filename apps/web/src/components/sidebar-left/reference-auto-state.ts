/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** Cancel requests do not make a running worker disappear; wait for its promise to settle before re-entry. */
export function createReferenceRunGate() {
  let current: AbortController | null = null;
  return {
    begin(): AbortController | null {
      if (current) return null;
      current = new AbortController(); return current;
    },
    isCurrent(controller: AbortController) { return current === controller; },
    cancel() { current?.abort(); },
    finish(controller: AbortController): boolean {
      if (current !== controller) return false;
      current = null; return true;
    },
  };
}

export function validateAutomaticReferenceFile(file: Pick<File, "name" | "size" | "type">): void {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0) throw new Error("Choose a nonempty local video file.");
  if (!file.type.startsWith("video/") && !/\.(?:mp4|m4v|mov|webm|mkv|avi|mts|m2ts)$/i.test(file.name)) throw new Error("Choose a video file for automatic reference analysis.");
}
