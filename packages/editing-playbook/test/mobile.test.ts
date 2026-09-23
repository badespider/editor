import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mobileProfileSchema, defaultMobileProfile, mobileOutputSchema,
  parseCaptionText, mapCaptionCues, validateMobileOutput, renderCaptionAss,
} from '../src/mobile.ts';
import type { MobileOutput } from '../src/mobile.ts';

function fixture(): MobileOutput {
  return mobileOutputSchema.parse({
    schemaVersion: 1, profile: defaultMobileProfile,
    captions: {
      source: { path: 'captions.srt', sha256: 'a'.repeat(64), format: 'srt', timebase: 'source' },
      font: { path: 'caption-font.ttf', sha256: 'b'.repeat(64), family: 'Example Sans' },
      style: { fontSize: 42, outline: 3, position: 'bottom', maxLines: 2 },
      cues: [{ startFrame: 0, endFrame: 30, text: 'Hello, world!\n你好 مرحبًا' }],
    },
  });
}
const geometry = { width: 1080, height: 1920, frames: 120 };
const sourceOptions = { start: 10, end: 12, fps: 30, timebase: 'source' } as const;
function stamp(ms: number, separator = ','): string {
  return `${String(Math.floor(ms / 3_600_000)).padStart(2, '0')}:${String(Math.floor(ms / 60_000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}${separator}${String(ms % 1000).padStart(3, '0')}`;
}
function srt(start: number, end: number, text = 'Caption', index = 1): string {
  return `${index}\n${stamp(start)} --> ${stamp(end)}\n${text}`;
}
function eventRows(ass: string): string[][] {
  return ass.split('\n').filter(l => l.startsWith('Dialogue: ')).map(l => l.slice('Dialogue: '.length).split(','));
}
function styleFields(ass: string): Record<string, string> {
  const lines = ass.split('\n');
  const start = lines.indexOf('[V4+ Styles]');
  const names = lines[start + 1].slice('Format: '.length).split(', ');
  const values = lines[start + 2].slice('Style: '.length).split(',');
  assert.equal(values.length, names.length);
  return Object.fromEntries(names.map((name, i) => [name, values[i]]));
}
function seconds(value: string): number {
  const [h, m, s] = value.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

test('default profile is parsed, versioned editable editorial guidance', () => {
  assert.deepEqual(defaultMobileProfile, { id: 'generic-mobile', revision: 1, safeArea: { left: 0.08, right: 0.18, top: 0.1, bottom: 0.22 } });
  const mobile = fixture(), original = JSON.stringify(mobile);
  mobile.profile.revision = 2;
  mobile.profile.safeArea.right = 0.2;
  assert(mobileOutputSchema.safeParse(mobile).success);
  assert.notEqual(JSON.stringify(mobile), original);
  assert.equal(defaultMobileProfile.revision, 1);
  const before = renderCaptionAss(fixture(), 1080, 1920), after = renderCaptionAss(mobile, 1080, 1920);
  assert.notEqual(before, after);
  assert.equal(styleFields(after).MarginR, '219');
});

test('profile limits reject unsafe identifiers, revisions and collapsed/nonfinite safe areas', () => {
  for (const id of ['', 'x'.repeat(65), '../profile', 'bad id', 'id\n', '{id}']) assert(!mobileProfileSchema.safeParse({ ...defaultMobileProfile, id }).success, id);
  for (const revision of [0, 1001, 1.5, NaN, Infinity]) assert(!mobileProfileSchema.safeParse({ ...defaultMobileProfile, revision }).success);
  for (const safeArea of [
    { left: 0.45, right: 0.45, top: 0, bottom: 0 }, { left: 0, right: 0, top: 0.45, bottom: 0.45 },
    { ...defaultMobileProfile.safeArea, left: -0.1 }, { ...defaultMobileProfile.safeArea, right: 0.450001 },
    { ...defaultMobileProfile.safeArea, top: NaN }, { ...defaultMobileProfile.safeArea, bottom: Infinity },
  ]) assert(!mobileProfileSchema.safeParse({ ...defaultMobileProfile, safeArea }).success);
  assert(mobileProfileSchema.safeParse({ id: 'A-z_09', revision: 1000, safeArea: { left: 0, right: 0.45, top: 0.44, bottom: 0.45 } }).success);
});

test('every mobile object is strict; captions may be explicitly null, not omitted', () => {
  const select: Array<(m: MobileOutput) => object> = [m => m, m => m.profile, m => m.profile.safeArea,
    m => m.captions!, m => m.captions!.source, m => m.captions!.font, m => m.captions!.style, m => m.captions!.cues[0]];
  for (const get of select) {
    const mobile = fixture();
    Object.assign(get(mobile), { unexpected: true });
    assert(!mobileOutputSchema.safeParse(mobile).success);
  }
  assert(!mobileOutputSchema.safeParse({ ...fixture(), schemaVersion: 2 }).success);
  assert(!mobileOutputSchema.safeParse({ schemaVersion: 1, profile: defaultMobileProfile }).success);
  const mobile = { ...fixture(), captions: null };
  assert(mobileOutputSchema.safeParse(mobile).success);
  assert.deepEqual(validateMobileOutput(mobile, geometry), []);
  assert.throws(() => renderCaptionAss(mobile, 1080, 1920), /without captions/);
});

test('source, font, style and frame schemas enforce their bounded contracts', () => {
  const changes: Array<(m: MobileOutput) => void> = [
    m => { m.captions!.source.path = ''; }, m => { m.captions!.font.path = ' '; },
    m => { m.captions!.source.sha256 = 'A'.repeat(64); }, m => { m.captions!.font.sha256 += '\n'; },
    m => { m.captions!.style.fontSize = 11; }, m => { m.captions!.style.fontSize = 201; },
    m => { m.captions!.style.fontSize = 20.5; }, m => { m.captions!.style.outline = -1; }, m => { m.captions!.style.outline = 11; },
    m => { m.captions!.style.maxLines = 0; }, m => { m.captions!.style.maxLines = 4; },
    m => { m.captions!.cues[0].startFrame = -1; }, m => { m.captions!.cues[0].startFrame = 3600; },
    m => { m.captions!.cues[0].endFrame = 0; }, m => { m.captions!.cues[0].endFrame = 3601; },
    m => { m.captions!.cues[0].endFrame = 1.5; }, m => { m.captions!.cues[0].text = ' '; },
    m => { m.captions!.cues[0].text = 'x'.repeat(501); }, m => { m.captions!.cues = []; },
    m => { m.captions!.cues = Array.from({ length: 201 }, () => ({ startFrame: 0, endFrame: 1, text: 'x' })); },
  ];
  for (const change of changes) { const mobile = fixture(); change(mobile); assert(!mobileOutputSchema.safeParse(mobile).success); }
  const mobile = fixture(); mobile.captions!.cues[0].text = '  你好\nhello  ';
  assert.equal(mobileOutputSchema.parse(mobile).captions!.cues[0].text, '你好\nhello');
});

test('font attributes and dangerous controls cannot become ASS syntax', () => {
  for (const family of ['', 'x'.repeat(101), 'Arial,200', 'Arial\nStyle: Evil', 'Arial\rBad', 'Arial\\fnOther', '{Arial}', 'Arial\t', 'Arial\u0000', 'Arial\u202E']) {
    const mobile = fixture(); mobile.captions!.font.family = family;
    assert(!mobileOutputSchema.safeParse(mobile).success, JSON.stringify(family));
    assert.throws(() => renderCaptionAss(mobile, 1080, 1920));
  }
  for (const control of ['\u0000', '\t', '\r', '\u001b', '\u007f', '\u0085', '\u2028', '\u2029', '\u202E', '\u2066', '\ud800']) {
    const mobile = fixture(); mobile.captions!.cues[0].text = `${control}Hello${control}`;
    assert(!mobileOutputSchema.safeParse(mobile).success, JSON.stringify(control));
    assert.throws(() => parseCaptionText(srt(0, 1000, `Hello${control}`), 'srt'), /control|Unicode/i);
  }
});

test('SRT accepts BOM/CRLF, multiline Unicode and literal arrows without reading them as timing', () => {
  const text = '👩‍💻 中文 مرحبًا cafe\u0301\nA --> B; {literal} C:\\folder';
  const input = `\uFEFF${srt(1234, 3456, text)}\n\n${srt(3456, 4000, 'Next', 2)}\n`.replace(/\n/g, '\r\n');
  assert.deepEqual(parseCaptionText(input, 'srt'), [{ start: 1.234, end: 3.456, text }, { start: 3.456, end: 4, text: 'Next' }]);
  assert.deepEqual(parseCaptionText('00:00:00,000 --> 00:00:01,000\nUnnumbered', 'srt'), [{ start: 0, end: 1, text: 'Unnumbered' }]);
});

test('WebVTT accepts hour/minute forms, identifiers and NOTE blocks, not cue settings', () => {
  const input = '\uFEFFWEBVTT a transcript\r\n\r\nNOTE source note\r\n00:00.000 --> not a cue\r\n\r\ncue-1\r\n00:01.250 --> 00:02.500\r\n你好 --> world\r\n\r\nNOTE another note\r\n\r\n00:00:02.500 --> 00:00:03.000\r\nSecond\r\n';
  assert.deepEqual(parseCaptionText(input, 'vtt'), [{ start: 1.25, end: 2.5, text: '你好 --> world' }, { start: 2.5, end: 3, text: 'Second' }]);
  assert.throws(() => parseCaptionText('WEBVTT\n\n00:00.000 --> 00:01.000 align:start\nHello', 'vtt'), /settings.*plain-text/);
  for (const feature of ['STYLE\n::cue { color: red; }', 'REGION\nid:top']) {
    assert.throws(() => parseCaptionText(`WEBVTT\n\n${feature}\n\n00:00.000 --> 00:01.000\nHello`, 'vtt'), /STYLE\/REGION/);
  }
  assert.throws(() => parseCaptionText('WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00.000,MPEGTS:0\n\n00:00.000 --> 00:01.000\nHello', 'vtt'), /metadata/);
  assert.throws(() => parseCaptionText('00:00.000 --> 00:01.000\nHello', 'vtt'), /WEBVTT header/);
});

test('malformed, empty, reversed, overlapping and unsorted cues fail explicitly', () => {
  for (const timing of [
    '00:00:00.000 --> 00:00:01.000', '00:00,000 --> 00:01,000', '0:00:00,000 --> 00:00:01,000',
    '00:00:60,000 --> 00:01:01,000', '00:60:00,000 --> 01:01:00,000',
    '00:00:00,00 --> 00:00:01,000', '-00:00:00,000 --> 00:00:01,000',
    '99999999999999:00:00,000 --> 99999999999999:00:01,000',
    '00:00:00,000 --> 00:00:01,000 --> 00:00:02,000',
  ]) assert.throws(() => parseCaptionText(`1\n${timing}\nHello`, 'srt'), /timestamp|range|precision/);
  for (const timing of ['00:00,000 --> 00:01,000', '0:00.000 --> 00:01.000', '00:60.000 --> 01:01.000']) {
    assert.throws(() => parseCaptionText(`WEBVTT\n\n${timing}\nHello`, 'vtt'), /timestamp|range/);
  }
  for (const input of ['', 'WEBVTT\n\nNOTE only comments']) assert.throws(() => parseCaptionText(input, input ? 'vtt' : 'srt'), /no cues/);
  assert.throws(() => parseCaptionText('1\n00:00:00,000 --> 00:00:01,000', 'srt'), /empty/);
  for (const [start, end] of [[1000, 1000], [2000, 1000]]) assert.throws(() => parseCaptionText(srt(start, end), 'srt'), /later than start/);
  for (const second of [srt(500, 2000), srt(0, 500)]) {
    assert.throws(() => parseCaptionText(`${srt(1000, 1500)}\n\n${second}`, 'srt'), /overlap|out of order/);
  }
  assert.throws(() => parseCaptionText(`${srt(0, 1000)}\n${srt(1000, 2000)}`, 'srt'), /second timing line.*blank line/);
});

test('markup/entities are rejected with a plain-text remedy, not silently stripped', () => {
  for (const text of ['<i>Hello</i>', '<v Speaker>Hello', '<ruby>word<rt>reading</rt></ruby>', '<00:00:00.500>Hello', '&amp; Hello', '{\\an8}Hello', '<i unclosed']) {
    assert.throws(() => parseCaptionText(srt(0, 1000, text), 'srt'), /markup.*plain text/i);
  }
  assert.equal(parseCaptionText(srt(0, 1000, 'A & B; 2 < 3; A --> B'), 'srt')[0].text, 'A & B; 2 < 3; A --> B');
});

test('input byte/source-cue limits are separate from the 200-cue output cap', () => {
  assert.throws(() => parseCaptionText('é'.repeat(524289), 'srt'), /1 MiB/);
  assert.throws(() => parseCaptionText('x'.repeat(1048577), 'srt'), /1 MiB/);
  const transcript = Array.from({ length: 10000 }, (_, i) => srt(i * 20, (i + 1) * 20, 'x', i + 1)).join('\n\n');
  const cues = parseCaptionText(transcript, 'srt');
  assert.equal(cues.length, 10000);
  const mapped = mapCaptionCues(cues, { start: 150, end: 151, fps: 30, timebase: 'source' });
  assert.equal(mapped.cues.length, 30);
  assert.equal(mapped.cues.at(-1)!.endFrame, 30);
  assert.throws(() => parseCaptionText(`${transcript}\n\n${srt(200000, 200020, 'last', 10001)}`, 'srt'), /10000 source cues/);
  const many = Array.from({ length: 201 }, (_, i) => ({ start: i / 30, end: (i + 1) / 30, text: 'x' }));
  assert.throws(() => mapCaptionCues(many, { start: 0, end: 7, fps: 30, timebase: 'clip' }), /200 output/);
});

test('nonzero source selection clips boundary cues, retains words and returns review warnings', () => {
  const cues = [
    { start: 8, end: 9, text: 'before' }, { start: 9.5, end: 10.5, text: 'whole leading cue' },
    { start: 10.5, end: 11, text: 'middle' }, { start: 11.2, end: 12.4, text: 'whole trailing cue' },
    { start: 12.4, end: 13, text: 'after' },
  ];
  const original = structuredClone(cues), mapped = mapCaptionCues(cues, sourceOptions);
  assert.deepEqual(mapped.cues, [
    { startFrame: 0, endFrame: 15, text: 'whole leading cue' }, { startFrame: 15, endFrame: 30, text: 'middle' },
    { startFrame: 36, endFrame: 60, text: 'whole trailing cue' },
  ]);
  assert.equal(mapped.warnings.length, 2);
  assert.match(mapped.warnings[0], /clip start.*review.*no word timing/);
  assert.match(mapped.warnings[1], /clip end.*review/);
  assert.deepEqual(cues, original);
  const both = mapCaptionCues([{ start: 9, end: 13, text: 'unchanged words' }], sourceOptions);
  assert.match(both.warnings[0], /start and end/);
  assert.equal(both.cues[0].text, 'unchanged words');
});

test('clip timebase starts at zero regardless of selected source start', () => {
  const result = mapCaptionCues([{ start: 0, end: 2, text: '  explicit\nspacing  ' }], { ...sourceOptions, timebase: 'clip' });
  assert.deepEqual(result, { cues: [{ startFrame: 0, endFrame: 60, text: '  explicit\nspacing  ' }], warnings: [] });
});

test('half-open intersections, ceil quantization, floating epsilon and exact end frames', () => {
  const result = mapCaptionCues([
    { start: 9, end: 10, text: 'excluded before' }, { start: 10.1, end: 10.3, text: 'included' }, { start: 12, end: 13, text: 'excluded after' },
  ], sourceOptions);
  assert.deepEqual(result, { cues: [{ startFrame: 3, endFrame: 9, text: 'included' }], warnings: [] });
  const exact = mapCaptionCues([{ start: 10, end: 10.3, text: 'exact' }], { ...sourceOptions, end: 10.3 });
  assert.equal(exact.cues[0].endFrame, 9);
  const last = mapCaptionCues([{ start: 3599 / 30, end: 120, text: 'last frame' }], { start: 0, end: 120, fps: 30, timebase: 'clip' });
  assert.deepEqual(last.cues, [{ startFrame: 3599, endFrame: 3600, text: 'last frame' }]);
  const drop = mapCaptionCues([{ start: 0.001, end: 0.02, text: 'no frame' }, { start: 1 / 30, end: 0.1, text: 'kept' }], { start: 0, end: 1, fps: 30, timebase: 'clip' });
  assert.deepEqual(drop.cues, [{ startFrame: 1, endFrame: 3, text: 'kept' }]);
  assert.match(drop.warnings[0], /Cue 1.*dropped.*no output frames/);
});

test('map rejects invalid ranges/cues, absent intersections and excessive output work', () => {
  const cue = { start: 10, end: 11, text: 'x' };
  for (const options of [
    { ...sourceOptions, start: -1 }, { ...sourceOptions, end: 10 }, { ...sourceOptions, end: Infinity },
    { ...sourceOptions, start: NaN }, { ...sourceOptions, end: 131 }, { ...sourceOptions, fps: 24 },
    { ...sourceOptions, timebase: 'unknown' },
  ]) assert.throws(() => mapCaptionCues([cue], options as typeof sourceOptions));
  for (const cues of [[], [{ ...cue, start: -1 }], [{ ...cue, end: 9 }], [{ ...cue, end: NaN }], [{ ...cue, text: '' }], [cue, cue], [{ start: 12, end: 13, text: 'later' }, cue]]) {
    assert.throws(() => mapCaptionCues(cues, sourceOptions));
  }
  for (const text of ['x'.repeat(501), `${' '.repeat(500)}x`]) {
    assert.throws(() => mapCaptionCues([{ ...cue, end: 10.5, text }], sourceOptions), /500 characters/);
  }
  assert.throws(() => mapCaptionCues([{ start: 12, end: 13, text: 'out' }], sourceOptions), /No caption cues intersect/);
  assert.throws(() => mapCaptionCues([{ start: 0.001, end: 0.02, text: 'too brief' }], { start: 0, end: 1, fps: 30, timebase: 'clip' }), /No caption cues have output frames/);
  assert.equal(mapCaptionCues([{ start: 0, end: 1, text: 'x'.repeat(501) }, cue], sourceOptions).cues.length, 1);
});

test('validation checks output containment, ordering, explicit line count and geometry', () => {
  assert.deepEqual(validateMobileOutput(fixture(), geometry), []);
  const mutations: Array<[(m: MobileOutput) => void, RegExp]> = [
    [m => { m.captions!.cues[0].endFrame = 121; }, /inside.*120-frame/],
    [m => { m.captions!.cues[0].startFrame = 30; }, /endFrame must exceed/],
    [m => { m.captions!.cues.push({ startFrame: 15, endFrame: 60, text: 'overlap' }); }, /nonoverlapping/],
    [m => { m.captions!.cues = [{ startFrame: 30, endFrame: 60, text: 'later' }, { startFrame: 0, endFrame: 30, text: 'earlier' }]; }, /sorted/],
    [m => { m.captions!.cues[0].text = 'one\ntwo\nthree'; }, /maxLines=2/],
    [m => { m.profile.safeArea.left = 0.5; }, /safeArea/],
  ];
  for (const [mutate, pattern] of mutations) {
    const mobile = fixture(); mutate(mobile);
    assert.match(validateMobileOutput(mobile, geometry).join('; '), pattern);
  }
  for (const value of [{ ...geometry, frames: 0 }, { ...geometry, frames: 3601 }, { ...geometry, width: NaN }, { ...geometry, height: 0 }, { ...geometry, width: 16385 }, { ...geometry, width: 1080.5 }]) {
    assert.match(validateMobileOutput(fixture(), value).join('; '), /Geometry/);
  }
});

test('validation accepts structural portrait geometry with extra fields without weakening dimension checks', () => {
  const recipe = {
    ...geometry, sourceWidth: 1920, sourceHeight: 1080, fps: 30,
    shots: [{ startFrame: 0, endFrame: 120, mode: 'contain', keyframes: [], reason: 'fixture', evidenceIds: [] }],
  };
  const original = structuredClone(recipe);
  assert.deepEqual(validateMobileOutput(fixture(), recipe), []);
  assert.deepEqual(recipe, original);
  assert.match(validateMobileOutput(fixture(), { ...recipe, width: 0 }).join('; '), /Geometry width/);
  assert.match(validateMobileOutput(fixture(), { ...recipe, frames: 3601 }).join('; '), /Geometry frames/);
});

test('line-box estimates bound font/placement without claiming glyph readability', () => {
  const mobile = fixture();
  mobile.profile.safeArea = { left: 0.44, right: 0.44, top: 0.44, bottom: 0.44 };
  mobile.captions!.style.fontSize = 200;
  mobile.captions!.style.maxLines = 3;
  const errors = validateMobileOutput(mobile, geometry).join('; ');
  assert.match(errors, /safe-area width/);
  assert.match(errors, /line box.*safe-area height/);
  assert.throws(() => renderCaptionAss(mobile, 1080, 1920), /safe.area/);
  const long = fixture(); long.captions!.cues[0].text = 'W'.repeat(100);
  assert.match(validateMobileOutput(long, geometry).join('; '), /estimated text width.*review the render/);
  const combining = fixture(); combining.captions!.cues[0].text = 'e\u0301'.repeat(10);
  assert.deepEqual(validateMobileOutput(combining, geometry), []);
});

test('ASS is deterministic, bounded, explicitly styled and positioned from the editable profile', () => {
  const mobile = fixture(), ass = renderCaptionAss(mobile, 1080, 1920);
  assert.equal(ass, renderCaptionAss(mobile, 1080, 1920));
  assert.match(ass, /ScriptType: v4\.00\+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2/);
  assert(!ass.includes('\r'));
  const style = styleFields(ass);
  assert.equal(style.Fontname, 'Example Sans'); assert.equal(style.Fontsize, '42');
  assert.equal(style.PrimaryColour, '&H00FFFFFF'); assert.equal(style.OutlineColour, '&H00000000'); assert.equal(style.BackColour, '&H00000000');
  assert.equal(style.BorderStyle, '3'); assert.equal(style.Outline, '3'); assert.equal(style.Alignment, '2');
  assert.equal(style.MarginL, '90'); assert.equal(style.MarginR, '198'); assert.equal(style.MarginV, '426');
  assert.match(ass, /Hello, world!\\N你好 مرحبًا/);
  assert(!ass.includes(mobile.captions!.source.path)); assert(!ass.includes(mobile.captions!.font.path));
  mobile.captions!.style.position = 'top';
  const top = styleFields(renderCaptionAss(mobile, 1080, 1920));
  assert.equal(top.Alignment, '8'); assert.equal(top.MarginV, '195');
});

test('ASS rejects injection and literal reserved characters without rewriting stored text', () => {
  const reserved = ['\\', '{', '}', '{\\p1}m 0 0 l 9 9{\\p0}', '\\N \\n \\h \\k100 {x}', 'C:\\folder\\file', 'set {value}', 'unmatched }'];
  const message = /ASCII backslashes and braces are unsupported by this burn-in renderer; no text was rewritten\. Edit the caption explicitly or disable caption burn-in/;
  for (const text of reserved) {
    const mobile = fixture(); mobile.captions!.style.fontSize = 24; mobile.captions!.cues[0].text = text;
    const original = JSON.stringify(mobile);
    assert.equal(mobileOutputSchema.parse(mobile).captions!.cues[0].text, text);
    assert.match(validateMobileOutput(mobile, geometry).join('; '), message);
    assert.throws(() => renderCaptionAss(mobile, 1080, 1920), message);
    assert.equal(JSON.stringify(mobile), original);
  }
});

test('ASS preserves safe Unicode and punctuation; explicit newlines are the only generated text controls', () => {
  for (const text of ['👩‍💻 中文 مرحبًا cafe\u0301', 'A & B; 2 < 3; A --> B', 'x = (a + b) / 2; [0, 1]!', 'Hello\nDialogue: injected', '<b>literal</b>', '｛literal｝ ＼ fullwidth']) {
    const mobile = fixture(); mobile.captions!.style.fontSize = 24; mobile.captions!.cues[0].text = text;
    assert.deepEqual(validateMobileOutput(mobile, geometry), []);
    const ass = renderCaptionAss(mobile, 1080, 1920), rows = eventRows(ass);
    assert.equal(rows.length, 1);
    const outputText = rows[0].slice(9).join(',');
    assert.equal(outputText, text.replace(/\n/g, '\\N'));
    assert.equal((outputText.match(/\\N/g) ?? []).length, text.split('\n').length - 1);
    assert(!outputText.replace(/\\N/g, '').includes('\\'));
    assert.equal(mobile.captions!.cues[0].text, text);
  }
});

test('ASS centisecond intervals select precisely the 30 fps frame timestamps and never extend ends', () => {
  const mobile = fixture();
  mobile.captions!.cues = Array.from({ length: 120 }, (_, frame) => ({ startFrame: frame, endFrame: frame + 1, text: 'x' }));
  const rows = eventRows(renderCaptionAss(mobile, 1080, 1920));
  assert.equal(rows.length, 120);
  for (const [frame, row] of rows.entries()) {
    const start = seconds(row[1]), end = seconds(row[2]);
    assert(start <= frame / 30 + 1e-12);
    assert(start > (frame - 1) / 30);
    assert(end > frame / 30);
    assert(end <= (frame + 1) / 30 + 1e-12);
  }
  mobile.captions!.cues = [{ startFrame: 3599, endFrame: 3600, text: 'last frame' }];
  assert.deepEqual(eventRows(renderCaptionAss(mobile, 1080, 1920))[0].slice(1, 3), ['0:01:59.96', '0:02:00.00']);
});
