/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';
import { runMedia } from './delivery.ts';

export type RecreationCanvas = { width: number; height: number; rotation: 0 };
type Source = { path: string; width: number; height: number };
const dimension = z.number().finite().int().min(2);
const rotation = z.union([z.number().finite(), z.string().trim().min(1).max(64)]);
const metadataSchema = z.object({ streams: z.array(z.object({
  width: dimension, height: dimension,
  tags: z.object({ rotate: rotation.optional() }).passthrough().optional(),
  side_data_list: z.array(z.object({ rotation: rotation.optional() }).passthrough()).max(32).optional(),
}).passthrough()).length(1) }).passthrough();

/** Match the current native compiler and AVC encoder before using account calls. */
export function validateRecreationCanvas(size: { width: number; height: number }, rotations: readonly (number | string)[] = []): RecreationCanvas {
  const { width, height } = z.object({ width: dimension, height: dimension }).strict().parse(size);
  if (width > 4096 || height > 4096 || width * height > 8_294_400) {
    throw new Error('Reference recreation requires a canvas with sides at most 4096 pixels and at most 8,294,400 total pixels. Resize and reinspect this source before recreation.');
  }
  if (width % 2 || height % 2) {
    throw new Error('Reference recreation requires even canvas width and height for its AVC render. Normalize odd source dimensions before recreation.');
  }
  for (const value of rotations) {
    const parsed = rotation.parse(value), degrees = typeof parsed === 'number' ? parsed : Number(parsed);
    if (!Number.isFinite(degrees)) throw new Error('Reference display rotation is invalid. Normalize the source before recreation.');
    if (degrees % 360 !== 0) throw new Error('Reference recreation does not yet support display rotation. Normalize the rotated source before recreation.');
  }
  return { width, height, rotation: 0 };
}

/** Read bounded stream metadata only; the caller supplies its resolved local source. */
export async function preflightRecreationCanvas(source: Source, options: { signal?: AbortSignal } = {}): Promise<RecreationCanvas> {
  options.signal?.throwIfAborted();
  const size = validateRecreationCanvas({ width: source.width, height: source.height });
  const path = z.string().min(1).max(32768).regex(/^[^\u0000-\u001f\u007f]*$/).parse(source.path);
  const timeout = AbortSignal.timeout(30000), signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const bytes = await runMedia(['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height:stream_side_data=rotation:stream_tags=rotate', '-of', 'json', '-protocol_whitelist', 'file,pipe', path],
  { binary: process.env.FFPROBE_PATH || 'ffprobe', signal, limit: 65536 });
  signal.throwIfAborted();
  const stream = metadataSchema.parse(JSON.parse(bytes.toString('utf8'))).streams[0];
  if (stream.width !== size.width || stream.height !== size.height) throw new Error('Reference canvas dimensions changed. Reinspect the source before recreation.');
  // Containers such as Matroska preserve this legacy key as uppercase ROTATE.
  const tagRotations = Object.entries(stream.tags ?? {}).filter(([key]) => key.toLowerCase() === 'rotate').map(([, value]) => rotation.parse(value));
  const rotations = [...tagRotations, ...(stream.side_data_list ?? []).map(item => item.rotation)]
    .filter((value): value is number | string => value !== undefined);
  return validateRecreationCanvas({ width: size.width, height: size.height }, rotations);
}
