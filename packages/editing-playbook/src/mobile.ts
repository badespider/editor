import { z } from 'zod';

const MAX_INPUT_BYTES = 1_048_576;
const MAX_SOURCE_CUES = 10_000;
const FRAME_EPSILON = 1e-7;
// Keep ordinary Unicode, including RTL letters, combining marks and emoji joiners.
// Reject C0/C1 controls, alternative line separators and bidi overrides/isolates.
const dangerousText = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u2028-\u202E\u2066-\u2069]/u;
const dangerousFile = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028-\u202E\u2066-\u2069]/u;
const plainText = z.string()
  .refine(s => s.isWellFormed(), 'Text must contain well-formed Unicode')
  .refine(s => !dangerousText.test(s), 'Remove caption control characters; only LF newlines are supported');
const captionText = plainText.pipe(z.string().trim().min(1).max(500));
const singleLineText = plainText.refine(s => !s.includes('\n'), 'Newlines are not allowed here');
const pathText = singleLineText.refine(s => s.trim().length > 0, 'Path must not be empty');
const hash = z.string().length(64).regex(/^[a-f0-9]{64}$/);
const inset = z.number().finite().min(0).max(0.45);

export const mobileProfileSchema = z.object({
  id: z.string().min(1).max(64).refine(s => !/[^A-Za-z0-9_-]/.test(s), 'Use only A-Z, a-z, 0-9, _ and - in the profile ID'),
  revision: z.number().int().min(1).max(1000),
  safeArea: z.object({ left: inset, right: inset, top: inset, bottom: inset }).strict()
    .refine(s => s.left + s.right < 0.9, 'Left and right insets must sum to less than 0.9')
    .refine(s => s.top + s.bottom < 0.9, 'Top and bottom insets must sum to less than 0.9'),
}).strict();

/** Editable conservative editorial guidance, NOT official platform safe zones. */
export const defaultMobileProfile = mobileProfileSchema.parse({
  id: 'generic-mobile', revision: 1,
  safeArea: { left: 0.08, right: 0.18, top: 0.1, bottom: 0.22 },
});

const frameCueSchema = z.object({
  startFrame: z.number().int().min(0).max(3599),
  endFrame: z.number().int().min(1).max(3600),
  text: captionText,
}).strict();

export const mobileOutputSchema = z.object({
  schemaVersion: z.literal(1),
  profile: mobileProfileSchema,
  captions: z.object({
    source: z.object({ path: pathText, sha256: hash, format: z.enum(['srt', 'vtt']), timebase: z.enum(['source', 'clip']) }).strict(),
    font: z.object({
      path: pathText, sha256: hash,
      family: singleLineText.pipe(z.string().trim().min(1).max(100).regex(/^[^,\\{}]+$/, 'Font family cannot contain commas, backslashes or braces')),
    }).strict(),
    style: z.object({
      fontSize: z.number().int().min(12).max(200), outline: z.number().int().min(0).max(10),
      position: z.enum(['top', 'bottom']), maxLines: z.number().int().min(1).max(3),
    }).strict(),
    cues: z.array(frameCueSchema).min(1).max(200),
  }).strict().nullable(),
}).strict();

export type MobileOutput = z.infer<typeof mobileOutputSchema>;
type SourceCue = { start: number; end: number; text: string };
type FrameCue = { startFrame: number; endFrame: number; text: string };

function timestamp(value: string, format: 'srt' | 'vtt', cue: number): number {
  const match = format === 'srt' ? /^(\d{2,}):(\d{2}):(\d{2}),(\d{3})$/.exec(value) :
    /^(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})$/.exec(value);
  if (!match) throw new Error(`Cue ${cue}: malformed ${format.toUpperCase()} timestamp "${value.slice(0, 80)}"; use ${format === 'srt' ? 'HH:MM:SS,mmm' : '[HH:]MM:SS.mmm'}`);
  const [, hours, minutes, seconds, milliseconds] = match;
  const total = ((Number(hours ?? 0) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(milliseconds);
  if (Number(minutes) > 59 || Number(seconds) > 59 || !Number.isSafeInteger(total)) {
    throw new Error(`Cue ${cue}: timestamp components are out of range or exceed safe numeric precision`);
  }
  return total / 1000;
}

function timing(line: string | undefined, format: 'srt' | 'vtt', cue: number) {
  const parts = line?.split('-->');
  if (!parts || parts.length !== 2) throw new Error(`Cue ${cue}: expected a timestamp --> timestamp timing line`);
  const [start, end] = parts.map(p => p.replace(/^[ \t]+|[ \t]+$/g, ''));
  if (/[ \t]/.test(end)) throw new Error(`Cue ${cue}: cue settings/coordinates are unsupported; export plain-text captions without positioning settings`);
  return { start: timestamp(start, format, cue), end: timestamp(end, format, cue) };
}

function assertPlainCaption(text: string, cue: number) {
  const result = plainText.safeParse(text);
  if (!result.success) throw new Error(`Cue ${cue}: ${result.error.issues.map(i => i.message).join('; ')}`);
  if (!text.trim()) throw new Error(`Cue ${cue}: caption text is empty`);
  if (/<(?:\/?[a-zA-Z]|[!?]|\d{2,}:)/.test(text) || /&(?:#[0-9]+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/.test(text) || /\{\s*\\/.test(text)) {
    throw new Error(`Cue ${cue}: markup, entities and inline styling are unsupported; export plain text (preserving all spoken words)`);
  }
}

/** Strict plain-text import. Cue bodies are never searched for an arbitrary '-->'. */
export function parseCaptionText(input: string, format: 'srt' | 'vtt'): Array<SourceCue> {
  if (typeof input !== 'string' || (format !== 'srt' && format !== 'vtt')) throw new Error('Supply caption text and an srt or vtt format');
  if (input.length > MAX_INPUT_BYTES || new TextEncoder().encode(input).length > MAX_INPUT_BYTES) throw new Error('Caption input exceeds the 1 MiB limit');
  const normalized = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!normalized.isWellFormed() || dangerousFile.test(normalized)) throw new Error('Caption input contains unsupported controls or invalid Unicode; use UTF-8 with LF or CRLF newlines');
  const blocks: string[][] = [];
  let block: string[] = [];
  for (const line of normalized.split('\n')) {
    if (/^[ \t]*$/.test(line)) {
      if (block.length) blocks.push(block);
      block = [];
    } else block.push(line);
  }
  if (block.length) blocks.push(block);
  if (format === 'vtt') {
    const header = blocks.shift();
    if (!header || !/^WEBVTT(?:[ \t].*)?$/.test(header[0]) || header[0].includes('-->')) throw new Error('WebVTT must begin with a WEBVTT header');
    if (header.length !== 1) throw new Error('Separate the WEBVTT header with a blank line; header metadata (including X-TIMESTAMP-MAP) is unsupported');
  }
  const cues: SourceCue[] = [];
  for (const lines of blocks) {
    if (format === 'vtt' && /^NOTE(?:[ \t]|$)/.test(lines[0])) continue;
    if (format === 'vtt' && /^(?:STYLE|REGION)(?:[ \t]|$)/.test(lines[0])) throw new Error('WebVTT STYLE/REGION blocks are unsupported; export plain-text captions');
    const cue = cues.length + 1;
    if (cue > MAX_SOURCE_CUES) throw new Error('Caption input exceeds 10000 source cues');
    // SRT numeric indices are optional; VTT permits one identifier before timing.
    const timingIndex = format === 'srt' ? (/^\d+$/.test(lines[0]) ? 1 : 0) : (lines[0].includes('-->') ? 0 : 1);
    const range = timing(lines[timingIndex], format, cue);
    const body = lines.slice(timingIndex + 1);
    if (body.some(line => /^[ \t]*(?:\d+:){1,2}\d+[.,]\d+[ \t]*-->/.test(line))) {
      throw new Error(`Cue ${cue}: a second timing line occurs inside the text; separate cues with a blank line`);
    }
    const text = body.join('\n');
    assertPlainCaption(text, cue);
    if (range.end <= range.start) throw new Error(`Cue ${cue}: end must be later than start`);
    if (cues.length && range.start < cues[cues.length - 1].end) throw new Error(`Cue ${cue}: cues overlap or are out of order; supply sorted nonoverlapping cues`);
    cues.push({ ...range, text: text.trim() });
  }
  if (!cues.length) throw new Error('Caption input contains no cues');
  return cues;
}

const time = z.number().finite().nonnegative();
const sourceCuesSchema = z.array(z.object({
  start: time, end: time,
  // Source cues can be longer than an output cue if they are outside the selection.
  text: plainText.refine(s => s.trim().length > 0, 'Caption text must not be empty').pipe(z.string().max(MAX_INPUT_BYTES)),
}).strict().refine(c => c.end > c.start, 'Cue end must be later than start')).min(1).max(MAX_SOURCE_CUES);
const mapOptionsSchema = z.object({
  start: time, end: time, fps: z.literal(30), timebase: z.enum(['source', 'clip']),
}).strict().refine(o => o.end > o.start, 'Clip end must be later than start');
const toFrame = (seconds: number) => Math.ceil(seconds * 30 - FRAME_EPSILON);

/** Frame n represents t=n/30; both interval endpoints use ceil for [start,end). */
export function mapCaptionCues(cues: Array<SourceCue>, options: { start: number; end: number; fps: 30; timebase: 'source' | 'clip' }): { cues: Array<FrameCue>; warnings: string[] } {
  sourceCuesSchema.parse(cues);
  const selection = mapOptionsSchema.parse(options);
  const duration = selection.end - selection.start, frames = toFrame(duration);
  if (frames < 1 || frames > 3600) throw new Error('Clip selection must contain 1..3600 output frames at 30 fps');
  let bytes = 0, previousEnd = 0;
  for (const [i, cue] of cues.entries()) {
    bytes += new TextEncoder().encode(cue.text).length;
    if (bytes > MAX_INPUT_BYTES) throw new Error('Source caption text exceeds the 1 MiB limit');
    if (cue.start < previousEnd) throw new Error(`Cue ${i + 1}: cues overlap or are out of order; supply sorted nonoverlapping cues`);
    previousEnd = cue.end;
  }
  const mapped: FrameCue[] = [], warnings: string[] = [];
  const offset = selection.timebase === 'source' ? selection.start : 0;
  let intersects = false;
  for (const [i, cue] of cues.entries()) {
    const relativeStart = cue.start - offset, relativeEnd = cue.end - offset;
    const start = Math.max(0, relativeStart), end = Math.min(duration, relativeEnd);
    if (end <= start) continue;
    intersects = true;
    if (relativeStart < 0 || relativeEnd > duration) {
      const boundary = relativeStart < 0 && relativeEnd > duration ? 'start and end' : relativeStart < 0 ? 'start' : 'end';
      warnings.push(`Cue ${i + 1} was clipped at the clip ${boundary}; review the caption text against the retained speech (no word timing was inferred)`);
    }
    const startFrame = Math.min(frames, Math.max(0, toFrame(start)));
    const endFrame = Math.min(frames, Math.max(0, toFrame(end)));
    if (endFrame <= startFrame) {
      warnings.push(`Cue ${i + 1} was dropped because it has no output frames after 30 fps quantization`);
      continue;
    }
    if (cue.text.length > 500) throw new Error(`Cue ${i + 1}: output caption exceeds 500 characters; review/split it manually`);
    const checked = frameCueSchema.safeParse({ startFrame, endFrame, text: cue.text });
    if (!checked.success) throw new Error(`Cue ${i + 1}: output caption is invalid; keep text within 500 characters and review/split it manually: ${checked.error.issues.map(i => i.message).join('; ')}`);
    // Mapping does not rewrite words, whitespace, or infer word-level timing.
    mapped.push({ startFrame, endFrame, text: cue.text });
    if (mapped.length > 200) throw new Error('Selection exceeds 200 output caption cues; shorten the selection or edit the captions');
  }
  if (!mapped.length) throw new Error(intersects ? 'No caption cues have output frames after quantization' : 'No caption cues intersect the clip; check the selection and caption timebase');
  return { cues: mapped, warnings };
}

// Structural callers may supply a full portrait recipe; only output geometry is used.
const geometrySchema = z.object({
  width: z.number().int().min(1).max(16384), height: z.number().int().min(1).max(16384),
  frames: z.number().int().min(1).max(3600),
}).strip();

function margins(mobile: MobileOutput, width: number, height: number) {
  const { safeArea } = mobile.profile, padding = mobile.captions?.style.outline ?? 0;
  return {
    left: Math.ceil(width * safeArea.left) + padding, right: Math.ceil(width * safeArea.right) + padding,
    top: Math.ceil(height * safeArea.top) + padding, bottom: Math.ceil(height * safeArea.bottom) + padding,
  };
}

function estimatedLineWidth(line: string, fontSize: number): number {
  let ems = 0;
  for (const char of line.normalize('NFC')) {
    if (/[\p{Mark}\u200C-\u200F\uFE0E\uFE0F]/u.test(char)) continue;
    ems += /\s/u.test(char) ? 0.35 : /[\u0021-\u007E]/u.test(char) ? 0.65 : 1;
  }
  return ems * fontSize;
}

/** Coarse line-box checks only: actual font metrics, shaping and readability require render review. */
export function validateMobileOutput(mobile: MobileOutput, geometry: { width: number; height: number; frames: number }): string[] {
  const parsed = mobileOutputSchema.safeParse(mobile), dimensions = geometrySchema.safeParse(geometry);
  const errors: string[] = [];
  if (!parsed.success) errors.push(...parsed.error.issues.map(i => `Mobile output ${i.path.join('.')}: ${i.message}`));
  if (!dimensions.success) errors.push(...dimensions.error.issues.map(i => `Geometry ${i.path.join('.')}: ${i.message}`));
  if (!parsed.success || !dimensions.success) return errors;
  const { captions } = parsed.data;
  if (!captions) return errors;
  const { width, height, frames } = dimensions.data, box = margins(parsed.data, width, height);
  const availableWidth = width - box.left - box.right, availableHeight = height - box.top - box.bottom;
  const { fontSize, maxLines } = captions.style;
  if (availableWidth < fontSize) errors.push('Caption font size does not fit the safe-area width; reduce fontSize or edit the profile insets');
  if (fontSize * 1.25 * maxLines > availableHeight) errors.push('Configured caption line box exceeds the safe-area height; reduce fontSize/maxLines or edit the profile insets');
  let previousEnd = 0;
  for (const [i, cue] of captions.cues.entries()) {
    const label = `Cue ${i + 1}`;
    // No verified lossless ASS escape for these characters: fail closed, never substitute glyphs.
    if (/[\\{}]/.test(cue.text)) errors.push(`${label}: literal ASCII backslashes and braces are unsupported by this burn-in renderer; no text was rewritten. Edit the caption explicitly or disable caption burn-in`);
    if (cue.endFrame <= cue.startFrame) errors.push(`${label}: endFrame must exceed startFrame`);
    if (cue.startFrame >= frames || cue.endFrame > frames) errors.push(`${label}: frames must be inside the ${frames}-frame output`);
    if (cue.startFrame < previousEnd) errors.push(`${label}: cues must be sorted and nonoverlapping`);
    previousEnd = cue.endFrame;
    const lines = cue.text.split('\n');
    if (lines.length > maxLines) errors.push(`${label}: ${lines.length} explicit lines exceed maxLines=${maxLines}; reflow the text manually`);
    for (const [line, text] of lines.entries()) {
      if (estimatedLineWidth(text, fontSize) > availableWidth) errors.push(`${label}, line ${line + 1}: estimated text width exceeds the safe area; shorten/reflow the line or reduce fontSize, then review the render`);
    }
  }
  return errors;
}

function assTime(frame: number): string {
  // Floor BOTH endpoints: at 30 fps this includes exactly the selected frame
  // timestamps, while the end never exceeds endFrame/30. Ceil(start) would lose
  // a first frame at e.g. 1/30. ASS cannot express arbitrary sub-centisecond times.
  const cs = Math.floor(frame * 10 / 3);
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

/** Deterministic ASS v4+ data, with no paths, user overrides, expressions or karaoke. */
export function renderCaptionAss(mobile: MobileOutput, width: number, height: number): string {
  const parsed = mobileOutputSchema.parse(mobile), { captions } = parsed;
  if (!captions) throw new Error('Cannot render ASS without captions');
  const errors = validateMobileOutput(parsed, { width, height, frames: Math.max(...captions.cues.map(c => c.endFrame)) });
  if (errors.length) throw new Error(errors.join('; '));
  const box = margins(parsed, width, height), { style, font } = captions;
  const alignment = style.position === 'top' ? 8 : 2, marginV = style.position === 'top' ? box.top : box.bottom;
  const lines = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${width}`, `PlayResY: ${height}`,
    'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${font.family},${style.fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,3,${style.outline},0,${alignment},${box.left},${box.right},${marginV},1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...captions.cues.map(c => `Dialogue: 0,${assTime(c.startFrame)},${assTime(c.endFrame)},Default,,0,0,0,,${c.text.replace(/\n/g, '\\N')}`),
    '',
  ];
  return lines.join('\n');
}
