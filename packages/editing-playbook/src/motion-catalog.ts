/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { resolveMotionContent, validateMotionContentTiming } from "./motion-content.ts";
import type { MotionContent } from "./motion-content.ts";
import { libraryRecipeCode } from "./motion-recipes.ts";
export { getMotionContentExample } from "./motion-content.ts";
export type { MotionContent } from "./motion-content.ts";

/** Browser-safe, authored native moments. External references never enter this registry automatically. */
export const motionCategories = ["backgrounds","captions","charts","data","effects","layouts","maps","overlays","storytelling","text-effects","education"] as const;
export type MotionCategory = typeof motionCategories[number];
export type MotionMomentFormat = "landscape" | "portrait";
export type MotionMomentMode = "template" | "sequence" | "inspiration";
export type MotionMoment = Readonly<{
  id: string; title: string; purpose: string; role: string;
  movementTags: readonly string[]; formats: readonly MotionMomentFormat[];
  defaultDuration: number; guidePath: string; examplePath: string; version: string; category:MotionCategory;
  /** Has a bounded native component adapter without the full template scene wrapper. */
  mixable: boolean;
  origin: Readonly<{ kind: "editor-native"; license: "MPL-2.0" }>;
}>;
export type MotionBuildOptions = {
  momentIds: readonly string[]; mode: MotionMomentMode; format: MotionMomentFormat;
  title?: string; body?: string; source?: string; sceneKey?: string;
  content?: MotionContent; theme?: "paper"|"dark"; motion?: "full"|"reduced";
};
const origin = Object.freeze({ kind: "editor-native", license: "MPL-2.0" } as const);
const formats = Object.freeze(["landscape", "portrait"] as const);
function moment(id: string, title: string, purpose: string, role: string, tags: string[], duration: number, guidePath: string, examplePath: string, category:MotionCategory="storytelling",version="1.0.0",mixable=false): MotionMoment {
  return Object.freeze({ id, title, purpose, role, movementTags: Object.freeze(tags), formats, defaultDuration: duration, guidePath, examplePath, version, origin, category, mixable });
}
export const motionMoments: readonly MotionMoment[] = Object.freeze([
  moment("question-reveal", "Question, then answer", "Hold a question before revealing an authored answer.", "hook", ["fade", "reveal", "reading-hold"], 6, "reference/jsx/animations.md", "examples/10-native-motion.tsx"),
  moment("evidence-focus", "Source, then focus", "Show source context before marking the relevant passage.", "proof", ["callout", "context", "reading-hold"], 8, "reference/jsx/documentary.md", "examples/11-documentary-story.tsx", "overlays"),
  moment("worked-solution", "Work through a solution", "Reveal given information, transformation and check in order.", "explanation", ["staged-reveal", "highlight", "reading-hold"], 9, "reference/jsx/education.md", "examples/15-editor-guided-lesson.tsx", "education"),
  moment("code-reveal", "Read, call, check", "Reveal literal code before its explicitly authored expected result.", "action", ["staged-reveal", "highlight", "reading-hold"], 8, "reference/jsx/education.md", "examples/15-editor-guided-lesson.tsx", "education"),
  moment("stat-proof", "Count, then hold", "Demonstrate a seekable illustrative counter with a settled reading hold.", "proof", ["counter", "settle", "reading-hold"], 6, "reference/jsx/animations.md", "examples/03-ticker.tsx", "data"),
  moment("counter-reveal", "Counter, echo and reveal", "Roll supplied values through clipped native text cells with an optional oversized echo.", "emphasis", ["counter", "echo", "clipped", "reveal", "reading-hold", "mix"], 6, "reference/jsx/counter-reveal.md", "examples/20-motion-recipes.tsx", "text-effects", "1.0.0", true),
  moment("milestone-badge", "A milestone, then its context", "Pop an authored value into a native circle before revealing its short explanation.", "emphasis", ["milestone", "badge", "pop", "label", "mix"], 6, "reference/jsx/milestone-badge.md", "examples/21-reference-motion-mix.tsx", "data", "1.0.0", true),
  moment("assemble-title", "Gather a title into focus", "Assemble separate editable glyphs, resolve their blur, then reveal an authored subtitle.", "orientation", ["title", "glyph", "assembly", "blur", "mix"], 6, "reference/jsx/assemble-title.md", "examples/21-reference-motion-mix.tsx", "text-effects", "1.0.0", true),
  moment("concept-link", "Connect a term to its meaning", "Reveal a term circle, grow its connector, then open its supplied definition card.", "explanation", ["concept", "definition", "connector", "circle", "mix"], 6, "reference/jsx/concept-link.md", "examples/21-reference-motion-mix.tsx", "education", "1.0.0", true),
  moment("route-reveal", "Orient with a route", "Reveal an illustrative regional route, then hold the geography.", "orientation", ["route", "draw", "reading-hold"], 7, "reference/jsx/documentary.md", "examples/11-documentary-story.tsx", "maps"),
  moment("background-grid","Quiet grid","A deterministic low-contrast grid behind your content.","setting",["grid","pattern","static"],6,"reference/jsx/creative-primitives.md","examples/17-creative-primitives.tsx","backgrounds","1.0.0",true),
  moment("background-dots","Quiet dots","Seeded dots give a scene structure without competing with text.","setting",["dots","pattern","static"],6,"reference/jsx/creative-primitives.md","examples/17-creative-primitives.tsx","backgrounds","1.0.0",true),
  moment("background-gradient","Soft gradient","A native gradient field with clear foreground contrast.","setting",["gradient","color","static"],6,"reference/jsx/creative-primitives.md","examples/17-creative-primitives.tsx","backgrounds","1.0.0",true),
  moment("caption-clean","Clean captions","Display caller-timed lines with comfortable reading holds.","accessibility",["captions","subtitles","timed"],8,"reference/jsx/caption-presets.md","examples/19-caption-presets.tsx","captions"),
  moment("caption-highlight","Word emphasis captions","Highlight only words with supplied timings; no invented transcript.","accessibility",["captions","karaoke","highlight"],8,"reference/jsx/caption-presets.md","examples/19-caption-presets.tsx","captions"),
  moment("chart-bars","Honest bar comparison","Compare signed values on an explicit shared zero baseline.","comparison",["bars","axis","values"],8,"reference/jsx/data-graphics.md","examples/18-data-graphics.tsx","charts","1.0.0",true),
  moment("chart-trend","Trace the supplied data","Connect authored samples, retain explicit gaps and show units.","explanation",["line","trend","axis"],8,"reference/jsx/data-graphics.md","examples/18-data-graphics.tsx","charts"),
  moment("metric-card","A number with context","Show a supplied value, reference, unit and disclosure together.","proof",["metric","data","comparison"],7,"reference/jsx/data-graphics.md","examples/18-data-graphics.tsx","data","1.0.0",true),
  moment("effect-film","Restrained film treatment","Apply the native documentary look to artwork while keeping labels clear.","atmosphere",["film","grain","grade"],6,"reference/jsx/effects.md","examples/16-editor-looks.tsx","effects"),
  moment("effect-duotone","Graphic duotone","A controlled two-color artwork treatment with untreated text.","atmosphere",["duotone","color","shader"],6,"reference/jsx/effects.md","examples/16-editor-looks.tsx","effects"),
  moment("layout-compare","Context and focus","Compare two editable panels; stack them for mobile.","comparison",["split","panels","responsive"],8,"reference/jsx/creative-primitives.md","examples/17-creative-primitives.tsx","layouts"),
  moment("map-compare","Two routes, one map scale","Compare illustrative routes with shared geographic bounds.","orientation",["map","routes","comparison"],8,"reference/jsx/documentary.md","examples/11-documentary-story.tsx","maps"),
  moment("overlay-name","Speaker lower third","Introduce a supplied name and role outside the demonstration area.","orientation",["lower-third","name","overlay"],7,"reference/jsx/documentary.md","examples/11-documentary-story.tsx","overlays"),
  moment("overlay-source","Source context card","Keep a reference and its context attached to a claim.","provenance",["source","credit","overlay"],8,"reference/jsx/documentary.md","examples/11-documentary-story.tsx","overlays","1.0.0",true),
  moment("story-quote","Attributed quotation","Hold an authored quote with its speaker and source.","perspective",["quote","attribution","reading-hold"],8,"reference/jsx/documentary.md","examples/11-documentary-story.tsx","storytelling"),
  moment("story-chapters","Question to answer","Track the question, evidence and answer without implying real chronology.","structure",["timeline","chapters","progress"],9,"reference/jsx/documentary.md","examples/11-documentary-story.tsx","storytelling"),
  moment("story-turn","Context, turn, payoff","Three authored beats explain one deliberate story turn.","structure",["story","turn","payoff"],12,"reference/jsx/creative-primitives.md","examples/17-creative-primitives.tsx","storytelling"),
  moment("text-reveal","Words with a reading hold","Reveal fixed-position words, then let the complete line settle.","emphasis",["words","reveal","reading-hold"],7,"reference/jsx/creative-primitives.md","examples/17-creative-primitives.tsx","text-effects"),
  moment("text-emphasis","Emphasize the key words","Keep the whole thought visible and mark authored keywords.","emphasis",["words","highlight","static"],7,"reference/jsx/creative-primitives.md","examples/17-creative-primitives.tsx","text-effects"),
]);
function formatValue(value: unknown): MotionMomentFormat {
  if (value !== "landscape" && value !== "portrait") throw new TypeError("format must be landscape or portrait");
  return value;
}
export function getMotionMoment(id: string): MotionMoment {
  if (typeof id !== "string") throw new TypeError("moment id must be a string");
  const found = motionMoments.find(item => item.id === id.replace(/^@/, ""));
  if (!found) throw new RangeError(`Unknown native motion moment: ${id}`);
  return found;
}
export function searchMotionMoments(query: string, format?: MotionMomentFormat, category?:MotionCategory): readonly MotionMoment[] {
  if (typeof query !== "string" || query.length > 300) throw new TypeError("query must be text of at most 300 characters");
  if (format !== undefined) formatValue(format);
  if(category!==undefined && !motionCategories.includes(category)) throw new TypeError("Unknown motion category");
  const tokens = query.toLowerCase().replace(/@/g, "").trim().split(/\s+/).filter(Boolean);
  return Object.freeze(motionMoments.filter(item => (!format || item.formats.includes(format)) && (!category || item.category===category) && tokens.every(token => `${item.id} ${item.category} ${item.title} ${item.purpose} ${item.role} ${item.movementTags.join(" ")}`.toLowerCase().includes(token))));
}
function text(value: unknown, label: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u0008\u000B-\u001F\u007F]/.test(value)) throw new TypeError(`${label} must be nonempty text of at most ${max} characters`);
  return value.trim().replace(/\r\n?/g, "\n");
}
function normalize(options: MotionBuildOptions) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("motion options must be an object");
  const allowed = new Set(["momentIds", "mode", "format", "title", "body", "source", "sceneKey","content","theme","motion"]);
  for (const key of Object.keys(options)) if (!allowed.has(key)) throw new TypeError(`Unknown motion option: ${key}`);
  const { momentIds, mode } = options;
  if (mode !== "template" && mode !== "sequence" && mode !== "inspiration") throw new TypeError("mode must be template, sequence or inspiration");
  const format = formatValue(options.format);
  if (!Array.isArray(momentIds) || momentIds.length < 1 || momentIds.length > 6 || Array.from({length: momentIds.length}, (_, i) => i).some(i => !Object.hasOwn(momentIds, i))) throw new RangeError("momentIds requires 1..6 complete indexed entries");
  if (mode === "template" && momentIds.length !== 1) throw new RangeError("template mode requires exactly one moment");
  const selected = momentIds.map(getMotionMoment);
  const content = resolveMotionContent(selected.map(item=>item.id),options.content);
  if(options.theme!==undefined && options.theme!=="paper" && options.theme!=="dark") throw new TypeError("theme must be paper or dark");
  if(options.motion!==undefined && options.motion!=="full" && options.motion!=="reduced") throw new TypeError("motion must be full or reduced");
  for(const item of selected)validateMotionContentTiming(item.id,content[item.id],item.defaultDuration,options.motion!=="reduced");
  if (new Set(selected.map(item => item.id)).size !== selected.length) throw new RangeError("momentIds must be unique");
  for (const item of selected) if (!item.formats.includes(format)) throw new RangeError(`${item.id} does not support ${format}`);
  const sceneKey = options.sceneKey ?? `native-motion-${selected.map(item => item.id).join("-")}`;
  if (typeof sceneKey !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(sceneKey)) throw new TypeError("sceneKey must contain 1..160 ASCII letters, digits, underscores or hyphens");
  return { selected, content, theme:options.theme??"paper",motion:options.motion??"full",mode, format, sceneKey, title: text(options.title, "title", 72), body: text(options.body, "body", 160), source: text(options.source, "source", 96) };
}
/** Conservative prose wrapping, without font-dependent measurements or silent truncation. */
function fit(value: string, width: number, height: number, font: number, label: string): string {
  const columns = Math.floor(width / (font * 1.1)), maxLines = Math.floor(height / (font * 1.35));
  const lines: string[] = [];
  for (const paragraph of value.split("\n")) {
    let line = "";
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const letters = Array.from(word);
      if (letters.length > columns) throw new RangeError(`${label} contains a word too wide for this layout; shorten it`);
      if (Array.from(line).length + (line ? 1 : 0) + letters.length > columns) { lines.push(line); line = word; }
      else line += `${line ? " " : ""}${word}`;
    }
    lines.push(line);
  }
  if (columns < 1 || lines.length > maxLines) throw new RangeError(`${label} does not fit ${maxLines} readable lines in this layout; shorten it`);
  return lines.join("\n");
}
const defaults: Record<string, {title: string; body: string}> = {
  "question-reveal": {title: "Why does this matter?", body: "Your answer goes here."},
  "evidence-focus": {title: "Keep the evidence in context.", body: "Your relevant passage goes here."},
  "worked-solution": {title: "Solve, then check.", body: "Keep both sides of the equation equal."},
  "code-reveal": {title: "Read, call, check.", body: "Read the function before its expected result."},
  "stat-proof": {title: "Let the number settle.", body: "Illustrative count only. Replace with source-backed data."},
  "counter-reveal": {title: "Let the change become clear.", body: "Supplied values, editable cells, a final reading hold."},
  "milestone-badge": {title: "Give the number its context.", body: "An authored illustrative value and its explanation."},
  "assemble-title": {title: "Let the idea come together.", body: "Separate native glyphs form one readable thought."},
  "concept-link": {title: "Show the connection.", body: "One supplied term and its authored meaning."},
  "route-reveal": {title: "Orient the viewer.", body: "An illustrative route, not a recorded journey."},
  "background-grid":{title:"A quiet foundation.",body:"Keep the pattern behind the idea."},
  "background-dots":{title:"Structure without clutter.",body:"Seeded native shapes, with room for your words."},
  "background-gradient":{title:"Let the content lead.",body:"A soft native gradient, with readable foreground text."},
  "caption-clean":{title:"Give words room.",body:"Supplied cue timings. No transcription or audio generation."},
  "caption-highlight":{title:"Follow the spoken word.",body:"Authored timing demo; verify words against real source audio."},
  "chart-bars":{title:"Compare fairly.",body:"A shared baseline, explicit units and visible source."},
  "chart-trend":{title:"Respect the data.",body:"Exact samples, explicit gaps and honest axes."},
  "metric-card":{title:"Numbers need context.",body:"A value and its supplied reference."},
  "effect-film":{title:"A restrained finish.",body:"The treatment belongs on artwork; labels stay clear."},
  "effect-duotone":{title:"Two colors, one idea.",body:"Keep decorative processing away from essential text."},
  "layout-compare":{title:"Show the relationship.",body:"Side by side for landscape; stacked for mobile."},
  "map-compare":{title:"Keep the scale fixed.",body:"Authored routes on the same geographic bounds."},
  "overlay-name":{title:"Introduce, then step back.",body:"Keep the meaningful action unobscured."},
  "overlay-source":{title:"Keep the reference attached.",body:"A source label supplies context, not verification."},
  "story-quote":{title:"A voice with context.",body:"Authored quotation example."},
  "story-chapters":{title:"Build a clear thread.",body:"Question, evidence, answer."},
  "story-turn":{title:"Make the turn clear.",body:"A three-beat authored structure."},
  "text-reveal":{title:"Reveal, then hold.",body:"Keep every word's position stable."},
  "text-emphasis":{title:"One clear emphasis.",body:"The complete thought stays visible."},
};
export function buildMotionBrief(options: MotionBuildOptions) {
  const normalized = normalize(options);
  let cursor = 0;
  const moments = normalized.selected.map(descriptor => {
    const start = cursor; cursor += descriptor.defaultDuration;
    return Object.freeze({ ...descriptor, start, end: cursor });
  });
  return Object.freeze({ schemaVersion: 1 as const, kind: "editor-motion-brief" as const, mode: normalized.mode,
    format: normalized.format, canvas: Object.freeze(normalized.format === "portrait" ? {width: 1080, height: 1920, fps: 30} : {width: 1920, height: 1080, fps: 30}),
    sceneKey: normalized.sceneKey, title: normalized.title, body: normalized.body, source: normalized.source ?? "Authored example / source not supplied.",
    content:normalized.content,theme:normalized.theme,motion:normalized.motion,
    moments: Object.freeze(moments), duration: cursor, referenceOnly: normalized.mode === "inspiration", mountable: normalized.mode !== "inspiration",
    intent: normalized.mode === "inspiration" ? "Use these native moments as references; adapt the structure and timing to the evidence." : "Editable native scene; review its wording, timing and framing before delivery.",
  });
}
export type MotionBrief = ReturnType<typeof buildMotionBrief>;

/** Returns plain ESM for the existing native SCRIPT mounting/persistence path. No execution occurs here. */
export function buildMotionModule(options: MotionBuildOptions): string {
  const n = normalize(options);
  if (n.mode === "inspiration") throw new TypeError("inspiration is a reference brief; use buildMotionBrief instead of mounting a template");
  const brief = buildMotionBrief(options), portrait = n.format === "portrait";
  const width = brief.canvas.width, height = brief.canvas.height, margin = portrait ? 72 : 96, inner = width - margin * 2;
  const beats = brief.moments.map(item => {
    const copy = defaults[item.id];
    const bodyBox = item.id === "evidence-focus" ? (portrait ? {width: 796, height: 200, font: 40} : {width: 660, height: 210, font: 28}) : {width: inner, height: portrait ? 270 : 150, font: portrait ? 44 : 30};
    return {id: item.id, category:item.category,start: item.start, end: item.end,settings:brief.content[item.id],
      title: fit(n.title ?? copy.title, inner, portrait ? 300 : 200, portrait ? 64 : 72, `${item.id} title`),
      body: fit(n.body ?? copy.body, bodyBox.width, bodyBox.height, bodyBox.font, `${item.id} body`),
      source: fit(brief.source, inner, portrait ? 120 : 70, portrait ? 28 : 20, `${item.id} source`)};
  });
  // JSON is the only interpolation boundary: caller wording can never become module syntax.
  const data = JSON.stringify({width, height, portrait, margin, inner, sceneKey: brief.sceneKey, duration: brief.duration, beats,theme:brief.theme,motion:brief.motion});
  return `import { Rect, Text, Image, Effects, WorkedExample, CodeWalkthrough, EvidenceCallout, MapRoute, motion, useTicker, PRESENTATION_THEMES, Backdrop, PanelLayout, StoryBeatCard, KineticText, CounterReveal, MilestoneBadge, AssembleTitle, ConceptLink, CaptionTrack, DataBars, TrendLine, MetricCard, LowerThird, SourceCard, QuoteCard, Timeline, createLook, duotone, grain } from "dapi-host:@diffusionstudio/jsx";
import { createMemo } from "dapi-host:solid-js";
const data = ${data};
export const motionMomentManifest = data;
export default function Project() {
  const ticker = useTicker();
  const p = data.portrait, w = data.width, h = data.height, m = data.margin, inner = data.inner;
  const theme = data.theme==="dark"?PRESENTATION_THEMES.education.technical:PRESENTATION_THEMES.education.classroom;
  const nodes = [];
  const clamp = value => Math.max(0, Math.min(1, value));
  function label(name, value, box, font, start, end, extra = {}) {
    const props = {name, ...box, start, end, fontSize:font, fontFamily:theme.fontFamily, fill:theme.text, children:value};
    Object.defineProperties(props, Object.getOwnPropertyDescriptors(extra));
    return Text(props);
  }
  ${libraryRecipeCode}
  for (const b of data.beats) {
    const duration = b.end - b.start;
    nodes.push(Rect({name:b.id + "/background", x:0,y:0,width:w,height:h,fill:theme.background,start:b.start,end:b.end}));
    if(b.category==="backgrounds") nodes.push(Backdrop({x:0,y:0,width:w,height:h,start:b.start,end:b.end,theme,kind:b.id.slice("background-".length),...b.settings}));
    nodes.push(label(b.id + "/role", b.id==="code-reveal"?"CODE / NOT EXECUTED":b.id.toUpperCase().replaceAll("-", " "), {x:m,y:p?100:60,width:inner,height:50}, p?24:22,b.start,b.end,{fill:theme.accent,fontWeight:700}));
    nodes.push(label(b.id + "/title", b.title, {x:m,y:p?190:130,width:inner,height:p?300:200},p?64:72,b.start,b.end,{fontWeight:700,...(data.motion==="reduced"?{}:motion.reveal({duration,minHold:3,direction:"none"}))}));
    nodes.push(label(b.id + "/source", b.source, {x:m,y:p?1760:990,width:inner,height:p?120:70},p?28:20,b.start,b.end,{fill:theme.muted}));
    if (b.id === "question-reveal") {
      const answerVisible = createMemo(() => ticker.time() >= b.start + 2.5);
      nodes.push(label(b.id + "/answer-label", "AUTHORED ANSWER", {x:m,y:p?930:560,width:inner,height:50},p?32:24,b.start,b.end,{fill:theme.accent,get opacity(){return answerVisible()?1:0;}}));
      nodes.push(label(b.id + "/answer", b.body,{x:m,y:p?1020:650,width:inner,height:p?270:150},p?44:30,b.start,b.end,{get opacity(){return answerVisible()?1:0;}}));
    } else if (b.id === "evidence-focus") {
      nodes.push(Rect({name:b.id+"/source-panel",x:m,y:p?550:380,width:inner,height:p?1030:570,fill:theme.surface,start:b.start,end:b.end}));
      nodes.push(label(b.id+"/context", "SOURCE MATERIAL / AUTHORED PLACEHOLDER",{x:m+24,y:p?580:410,width:inner-48,height:100},p?24:22,b.start,b.end,{fill:theme.muted}));
      const target = p?{x:122,y:790,width:836,height:240}:{x:146,y:550,width:700,height:250};
      nodes.push(label(b.id+"/passage",b.body,{x:target.x+20,y:target.y+20,width:target.width-40,height:target.height-40},p?40:28,b.start,b.end));
      nodes.push(EvidenceCallout({x:0,y:0,width:w,height:h,start:b.start+1,end:b.end,target,label:"FOCUS",detail:p?"Keep context.":"Context stays visible.",labelPosition:p?"below":"right",fontSize:p?40:28,theme:PRESENTATION_THEMES.documentary.paper,protectedAreas:[{x:m,y:p?550:380,width:inner,height:120}]}));
    } else if (b.id === "worked-solution") {
      nodes.push(label(b.id+"/context",b.body,{x:m,y:p?490:330,width:inner,height:p?270:150},p?44:30,b.start,b.end));
      const step = createMemo(() => ticker.time()<b.start+3?0:ticker.time()<b.start+6?1:2);
      nodes.push(WorkedExample({title:p?"Solve + check":"Given → transform → check",x:m,y:p?780:480,width:inner,height:p?920:480,fontSize:p?40:22,start:b.start,end:b.end,theme,revealThroughActive:true,get activeStep(){return step();},steps:[
        {label:"Given",expression:"2x + 4 = 10"},
        {label:"Subtract 4 each side",expression:"2x = 6"},
        {label:"Divide by 2; check",expression:"x = 3",explanation:"2 × 3 + 4 = 10"}
      ]}));
    } else if (b.id === "code-reveal") {
      nodes.push(label(b.id+"/context",b.body,{x:m,y:p?490:330,width:inner,height:p?270:150},p?44:30,b.start,b.end));
      const phase = createMemo(() => ticker.time()<b.start+2.5?0:ticker.time()<b.start+5?1:2);
      const highlights = [[1,2],[4,5],[6]];
      nodes.push(CodeWalkthrough({title:p?"Read / call":"Literal code / not executed",x:m,y:p?780:480,width:inner,height:p?920:480,fontSize:p?44:22,start:b.start,end:b.end,theme,
        lines:["def double(x):","    return 2 * x","",p?"y = double(3)":"result = double(3)",p?"print(y)":"print(result)","# EXPECTED: 6"],get visibleThroughLine(){return [2,5,6][phase()];},get highlightedLines(){return highlights[phase()];}}));
    } else if (b.id === "stat-proof") {
      const count = createMemo(() => data.motion==="reduced"?100:Math.round(100 * clamp((ticker.time()-b.start-0.5)/2.5)));
      nodes.push(label(b.id+"/disclosure",p?"ILLUSTRATIVE COUNT\\nNOT A MEASUREMENT":"ILLUSTRATIVE COUNT / NOT A MEASUREMENT",{x:m,y:p?550:350,width:inner,height:100},p?32:22,b.start,b.end,{fill:theme.accent}));
      nodes.push(label(b.id+"/value","",{x:m,y:p?740:450,width:inner,height:320},p?220:200,b.start,b.end,{fontFamily:theme.monoFamily,get children(){return String(count());}}));
      nodes.push(label(b.id+"/context",b.body,{x:m,y:p?1250:810,width:inner,height:p?270:150},p?44:30,b.start,b.end));
    } else if (b.id === "route-reveal") {
      nodes.push(label(b.id+"/context",b.body,{x:m,y:p?490:330,width:inner,height:p?270:150},p?44:30,b.start,b.end));
      nodes.push(MapRoute({x:m,y:p?800:490,width:inner,height:p?900:470,start:b.start,duration,revealDuration:data.motion==="reduced"?"1f":4,title:"Illustrative route",credits:"Authored route example",bounds:{west:-6,east:12,south:40,north:52},points:[{longitude:2.3522,latitude:48.8566,label:"Paris"},{longitude:4.8357,latitude:45.764,label:"Lyon"},{longitude:5.3698,latitude:43.2965,label:"Marseille"}]}));
    } else appendLibraryMoment(b);
  }
  return Rect({name:"Native motion moments",scene:data.sceneKey,width:w,height:h,start:0,end:data.duration,fill:theme.background,children:nodes});
}
`;
}
