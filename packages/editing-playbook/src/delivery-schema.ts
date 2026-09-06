import { z } from 'zod';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const positive = z.number().finite().positive();
export const deliverySettingsSchema = z.object({
  name: z.string().trim().min(1).max(160).default('Evidence-backed edit'),
  // Omitted dimensions preserve the first retained source's aspect ratio at 1080 high.
  width: z.number().int().min(160).max(3840).optional(),
  height: z.number().int().min(160).max(2160).optional(),
  // JSX uses the editor's canonical 30-fps timeline. Other rates need explicit timebase support.
  fps: z.literal(30).default(30),
  maxDuration: positive.max(7200).default(1800),
  chapters: z.array(z.object({ segmentId: id, offset: z.number().finite().nonnegative().default(0),
    title: z.string().trim().min(1).max(160).regex(/^[^\r\n]+$/) }).strict()).max(100).default([]),
}).strict().refine(v => (v.width === undefined) === (v.height === undefined), 'Set width and height together')
  .refine(v => (v.width === undefined || v.width % 2 === 0) && (v.height === undefined || v.height % 2 === 0), 'Dimensions must be even');
export type DeliverySettings = z.infer<typeof deliverySettingsSchema>;

export const deliveryBundleSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal('editor-delivery-bundle'),
  name: z.string(), fps: z.literal(30), width: z.number().int().min(160).max(3840), height: z.number().int().min(160).max(2160),
  frames: z.number().int().positive(), duration: positive,
  compositionSha256: sha256, planSha256: sha256,
  portrait: z.object({ documentSha256: sha256, recipeSha256: sha256 }).strict().optional(),
  sources: z.array(z.object({ id, path: z.string(), sha256, bytes: positive, mtimeMs: z.number().finite() }).strict()),
  clips: z.array(z.object({ id, sourceId: id, sourceIn: z.number().finite().nonnegative(), sourceOut: positive,
    startFrame: z.number().int().nonnegative(), durationFrames: z.number().int().positive(),
    path: z.string().regex(/^media\/[a-zA-Z0-9_-]+\.mp4$/), sha256, hasSourceAudio: z.boolean(),
  }).strict()).min(1).max(100),
  chapters: z.array(z.object({ seconds: z.number().finite().nonnegative(), title: z.string() }).strict()),
  limitations: z.array(z.string()),
}).strict();
export type DeliveryBundle = z.infer<typeof deliveryBundleSchema>;

export function planDeliveryTimeline(segments: {id: string; in: number; out: number}[], fps: number) {
  let frame = 0;
  return segments.map(segment => {
    // Keep the whole selected range. Any sub-frame remainder is held/padded, never removed.
    const durationFrames = Math.ceil((segment.out - segment.in) * fps - 1e-7);
    const item = { id: segment.id, startFrame: frame, durationFrames };
    frame += durationFrames;
    return item;
  });
}

export function mapDeliveryChapters(settings: DeliverySettings, timeline: ReturnType<typeof planDeliveryTimeline>, fps: number) {
  const duration = timeline.reduce((n, c) => n + c.durationFrames, 0) / fps;
  const chapters = settings.chapters.map(chapter => {
    const clip = timeline.find(c => c.id === chapter.segmentId);
    if (!clip || chapter.offset >= clip.durationFrames / fps) throw new Error(`Chapter references an unknown segment or out-of-range offset: ${chapter.segmentId}`);
    return { seconds: Math.floor(clip.startFrame / fps + chapter.offset), title: chapter.title };
  });
  if (chapters.length && (chapters.length < 3 || chapters[0].seconds !== 0 ||
    chapters.some((c, i) => (chapters[i + 1]?.seconds ?? duration) - c.seconds < 10))) {
    throw new Error('YouTube chapters need 00:00 first, at least three ascending entries, each at least 10 seconds long. Omit chapters for shorter edits.');
  }
  return chapters;
}

export function formatChapters(chapters: {seconds: number; title: string}[]) {
  return chapters.map(c => {
    const hours = Math.floor(c.seconds / 3600);
    const minutes = Math.floor(c.seconds / 60) % 60;
    const seconds = String(c.seconds % 60).padStart(2, '0');
    return `${hours ? `${hours}:${String(minutes).padStart(2, '0')}` : String(minutes).padStart(2, '0')}:${seconds} ${c.title}`;
  }).join('\n') + (chapters.length ? '\n' : '');
}
