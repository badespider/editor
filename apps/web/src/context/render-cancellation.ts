/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** Remember cancellation while the asynchronous encoder is still being created. */
export function createPendingRenderCancellation(signal?: AbortSignal) {
  let cancelled = false, target: (() => void) | undefined;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    target?.();
  };
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  return {
    cancel,
    attach(callback: () => void) { target = callback; if (cancelled) callback(); },
    dispose() { signal?.removeEventListener("abort", cancel); target = undefined; },
  };
}
