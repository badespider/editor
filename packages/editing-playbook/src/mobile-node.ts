import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, resolve, sep } from 'node:path';
import { defaultMobileProfile, mobileOutputSchema, mobileProfileSchema, parseCaptionText, mapCaptionCues, renderCaptionAss, validateMobileOutput } from './mobile.ts';
import type { MobileOutput } from './mobile.ts';
import { runMedia } from './media-process.ts';

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
async function localBytes(path: string, limit: number) {
  const actual = await realpath(resolve(path)), info = await stat(actual);
  if (!info.isFile() || info.size > limit || !info.size) throw new Error(`Expected a nonempty local file of at most ${limit} bytes`);
  const bytes = await readFile(actual);
  if (!bytes.length || bytes.length > limit) throw new Error('Mobile asset changed or exceeded its size budget');
  return { path: actual, bytes, sha256: sha256(bytes) };
}

/** Read the font's own SFNT name table instead of trusting a filename/fallback font. */
export function fontFamilies(bytes: Buffer) {
  if (bytes.length < 12 || !(bytes.readUInt32BE(0) === 0x00010000 || bytes.toString('ascii', 0, 4) === 'OTTO')) {
    throw new Error('Captions require a standalone TrueType/OpenType font (.ttf/.otf), not a font collection or webfont');
  }
  const count = bytes.readUInt16BE(4);
  if (!count || count > 1000 || 12 + count * 16 > bytes.length) throw new Error('Invalid font table directory');
  let offset = -1, length = 0;
  for (let i = 0; i < count; i++) {
    const pos = 12 + i * 16;
    if (bytes.toString('ascii', pos, pos + 4) === 'name') {
      offset = bytes.readUInt32BE(pos + 8); length = bytes.readUInt32BE(pos + 12); break;
    }
  }
  if (offset < 0 || length < 6 || offset + length > bytes.length) throw new Error('Font has no valid name table');
  const table = bytes.subarray(offset, offset + length), records = table.readUInt16BE(2), strings = table.readUInt16BE(4);
  if (records > 10000 || 6 + records * 12 > table.length || strings < 6 + records * 12 || strings > table.length) throw new Error('Invalid font names');
  const names: { name: string; priority: number }[] = [];
  for (let i = 0; i < records; i++) {
    const pos = 6 + i * 12, platform = table.readUInt16BE(pos), language = table.readUInt16BE(pos + 4), id = table.readUInt16BE(pos + 6);
    if (id !== 1 && id !== 16) continue;
    const size = table.readUInt16BE(pos + 8), start = strings + table.readUInt16BE(pos + 10);
    if (start + size > table.length) throw new Error('Font name leaves its table');
    const data = Buffer.from(table.subarray(start, start + size));
    let name: string;
    if ((platform === 0 || platform === 3) && size % 2 === 0) name = data.swap16().toString('utf16le');
    else if (platform === 1 && data.every(n => n >= 32 && n <= 126)) name = data.toString('ascii');
    else continue;
    name = name.trim();
    if (name && name.length <= 100 && !/[\x00-\x1f\x7f,{}\\]/.test(name)) names.push({name, priority: (id === 16 ? 2 : 0) + (language === 0x409 ? 1 : 0)});
  }
  const result = [...new Set(names.sort((a,b) => b.priority - a.priority).map(n => n.name))];
  if (!result.length) throw new Error('Font has no supported family name');
  return result;
}

export async function importMobileOutput(options: {
  profile?: unknown; captions?: string; font?: string; fontFamily?: string; timebase?: 'source' | 'clip';
  start: number; end: number; width: number; height: number; frames: number;
}) {
  const profile = mobileProfileSchema.parse(options.profile ?? defaultMobileProfile);
  if (!options.captions && (options.font || options.fontFamily || options.timebase)) throw new Error('Caption font/timebase options require --captions');
  if (!options.captions) return { mobile: mobileOutputSchema.parse({schemaVersion:1, profile, captions:null}), warnings: ['No captions imported; readability and placement still require phone-size review.'] };
  if (!options.font) throw new Error('Imported captions require an explicit local --font file; no system font or cloud transcription is selected silently');
  const source = await localBytes(options.captions, 1_000_000), font = await localBytes(options.font, 32_000_000);
  const extension = extname(source.path).toLowerCase();
  if (extension !== '.srt' && extension !== '.vtt') throw new Error('Caption input must be a plain-text .srt or .vtt file');
  const format = extension.slice(1) as 'srt' | 'vtt', families = fontFamilies(font.bytes), family = options.fontFamily ?? families[0];
  if (!families.includes(family)) throw new Error('Requested caption font family does not match the supplied font');
  const timebase = options.timebase ?? 'source';
  const mapped = mapCaptionCues(parseCaptionText(new TextDecoder('utf-8', {fatal:true}).decode(source.bytes), format), {start:options.start, end:options.end, fps:30, timebase});
  const mobile = mobileOutputSchema.parse({schemaVersion:1, profile, captions:{
    source:{path:source.path, sha256:source.sha256, format, timebase}, font:{path:font.path, sha256:font.sha256, family},
    style:{fontSize:Math.round(options.width / 18), outline:Math.max(1,Math.round(options.width / 360)), position:'bottom', maxLines:3}, cues:mapped.cues,
  }});
  const errors = validateMobileOutput(mobile, options);
  if (errors.length) throw new Error(errors.join('; '));
  return {mobile, warnings:[...mapped.warnings, 'The generic profile is editable editorial guidance, not a certified platform safe zone. Review line wrapping, glyph coverage and timing.']};
}

type MobileAssets = { source: Buffer; font: Buffer; fontExtension: 'ttf' | 'otf'; ass: string };
/** Snapshot verified bytes before any bundle is created; later source changes cannot race the copy. */
export async function loadMobileAssets(mobile: MobileOutput, geometry: {width:number;height:number;frames:number}, checkRenderer = true, signal?: AbortSignal): Promise<MobileAssets | null> {
  const parsed = mobileOutputSchema.parse(mobile), errors = validateMobileOutput(parsed, geometry);
  if (errors.length) throw new Error(errors.join('; '));
  if (!parsed.captions) return null;
  const captions = parsed.captions;
  if (!isAbsolute(captions.source.path) || !isAbsolute(captions.font.path)) throw new Error('Mobile caption and font asset paths must be absolute');
  signal?.throwIfAborted();
  const source = await localBytes(captions.source.path, 1_000_000), font = await localBytes(captions.font.path, 32_000_000);
  if (source.sha256 !== captions.source.sha256 || font.sha256 !== captions.font.sha256) throw new Error('Caption or font asset changed; import again and record a new framing review');
  if (!fontFamilies(font.bytes).includes(captions.font.family)) throw new Error('Caption font family disagrees with its fingerprinted file');
  if (checkRenderer) {
    const help = (await runMedia(['-hide_banner','-h','filter=subtitles'], {signal})).toString();
    if (!/^Filter subtitles\b/m.test(help) || !help.includes('fontsdir')) throw new Error('Caption preparation requires FFmpeg with the subtitles/libass filter; no uncaptioned fallback was produced');
  }
  return {source:source.bytes, font:font.bytes, fontExtension:font.bytes.toString('ascii',0,4)==='OTTO'?'otf':'ttf', ass:renderCaptionAss(parsed,geometry.width,geometry.height)};
}

export async function writeMobileAssets(root: string, mobile: MobileOutput, assets: MobileAssets | null) {
  if (!assets || !mobile.captions) return;
  const directory = join(root, 'mobile-assets');
  await mkdir(join(directory,'fonts'), {recursive:true});
  await writeFile(join(directory,`source.${mobile.captions.source.format}`), assets.source, {flag:'wx'});
  await writeFile(join(directory,'fonts',`font.${assets.fontExtension}`), assets.font, {flag:'wx'});
  await writeFile(join(directory,'captions.ass'), assets.ass, {flag:'wx',encoding:'utf8'});
}

export async function verifyMobileAssets(root: string, mobile: MobileOutput, geometry: {width:number;height:number;frames:number}) {
  if (!mobile.captions) return;
  const directory = join(root,'mobile-assets'), captions = mobile.captions;
  const bounded = async(path: string, limit: number) => {
    const data = await localBytes(path,limit);
    if (!data.path.startsWith(root + sep)) throw new Error('Mobile assets escape the prepared bundle');
    return data;
  };
  const source = await bounded(join(directory,`source.${captions.source.format}`),1_000_000);
  let font: Awaited<ReturnType<typeof localBytes>>;
  try { font = await bounded(join(directory,'fonts','font.ttf'),32_000_000); }
  catch(error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; font = await bounded(join(directory,'fonts','font.otf'),32_000_000); }
  if (source.sha256 !== captions.source.sha256 || font.sha256 !== captions.font.sha256 || !fontFamilies(font.bytes).includes(captions.font.family)) throw new Error('Prepared caption or font asset changed');
  const ass = await bounded(join(directory,'captions.ass'),2_000_000);
  if (ass.bytes.toString('utf8') !== renderCaptionAss(mobile,geometry.width,geometry.height)) throw new Error('Prepared caption rendering changed; prepare a new bundle');
}
