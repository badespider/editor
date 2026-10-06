import {z} from 'zod';
const label = (max: number) => z.string().trim().min(1).max(max).refine(s => !/[\r\n]/.test(s), 'Use separate lines, not embedded newlines');
const box = z.object({ x: z.number().min(0), y: z.number().min(0), width: z.number().positive(), height: z.number().positive() }).strict()
  .refine(b => b.x + b.width <= 1 && b.y + b.height <= 1, 'Highlight must fit the screen');
const base = { id: z.string().regex(/^[a-z][a-z0-9-]{0,59}$/), duration: z.number().min(3).max(30)
  .refine(n => Math.abs(n * 30 - Math.round(n * 30)) < .001, 'Use frame-aligned seconds'),
  keyPhrase: label(70).optional(), demoCaption: z.tuple([label(42), label(42)]).optional() };
const step = z.object({ title: label(24), detail: label(42), activateAt: z.number().nonnegative() }).strict();
export const channelRequestSchema = z.object({ schemaVersion: z.literal(1), template: z.literal('channel-explainer@1'),
  layout: z.enum(['landscape', 'portrait']), mode: z.enum(['layout-demo', 'footage']), brand: label(28),
  visualStyle: z.enum(['clean', 'paper', 'editorial']).default('paper'),
  cameraAspectRatio: z.number().min(.4).max(3).default(16 / 9), screenAspectRatio: z.number().min(.4).max(3).default(16 / 9),
  sections: z.array(z.discriminatedUnion('kind', [
    z.object({ ...base, kind: z.literal('hook'), headline: label(70) }).strict(),
    z.object({ ...base, kind: z.literal('roadmap'), headline: label(60), steps: z.tuple([step, step, step]) }).strict(),
    z.object({ ...base, kind: z.literal('explanation'), headline: label(60), nodes: z.tuple([label(24), label(24), label(24)]) }).strict(),
    z.object({ ...base, kind: z.literal('demonstration'), headline: label(60), highlight: box,
      focusLabel: label(38), highlightAt: z.number().nonnegative() }).strict(),
    z.object({ ...base, kind: z.literal('comparison'), headline: label(60), options: z.array(z.object({
      name: label(24), skills: label(38), work: label(38), firstProject: label(38),
    }).strict()).min(2).max(3) }).strict(),
    z.object({ ...base, kind: z.literal('next-step'), action: label(70), pdf: z.object({
      ready: z.literal(true), label: label(38), url: z.string().url().refine(s => s.startsWith('https://'), 'Use an HTTPS download page'),
    }).strict().optional() }).strict(),
  ])).min(1).max(16),
}).strict().superRefine((r, ctx) => {
  if (new Set(r.sections.map(s => s.id)).size !== r.sections.length) ctx.addIssue({ code: 'custom', message: 'Unique section IDs required' });
  if (r.sections.reduce((n, s) => n + s.duration, 0) > 60) ctx.addIssue({ code: 'custom', message: 'Render at most 60 seconds per scene bundle; compose longer episodes from bundles' });
  for (const s of r.sections) {
    if (r.mode === 'footage' && s.demoCaption) ctx.addIssue({ code: 'custom', message: 'Demo captions are not source-aligned speech; supply real captions in SceneInput' });
    if (s.kind === 'roadmap' && (s.steps.some(p => p.activateAt > s.duration - .5) || s.steps.some((p, i) => i > 0 && p.activateAt <= s.steps[i - 1].activateAt)))
      ctx.addIssue({ code: 'custom', message: 'Roadmap activation times must increase and leave half a second to settle' });
    if (s.kind === 'demonstration' && s.highlightAt > s.duration - .5) ctx.addIssue({ code: 'custom', message: 'Highlight needs half a second to settle' });
    if (s.kind === 'next-step' && s.pdf && s.keyPhrase) ctx.addIssue({ code: 'custom', message: 'Keep the PDF invitation clear: omit the extra next-step key phrase' });
  }
});
export type ChannelRequest = z.infer<typeof channelRequestSchema>;

/** Native editorial scene data, never arbitrary JSX or a path to executable code. */
export const channelSceneSchema = z.object({
  version: z.literal(1),
  brand: channelRequestSchema.shape.brand,
  layout: channelRequestSchema.shape.layout,
  mode: channelRequestSchema.shape.mode,
  cameraAspectRatio: channelRequestSchema.shape.cameraAspectRatio,
  screenAspectRatio: channelRequestSchema.shape.screenAspectRatio,
  section: channelRequestSchema.shape.sections.element,
  index: z.number().int().min(0).max(15),
  count: z.number().int().min(1).max(16),
}).strict().superRefine((value, ctx) => {
  if (value.index >= value.count) ctx.addIssue({code: 'custom', message: 'Scene index must fit the section count'});
  // Validate the original cue/speech rules without passing native metadata to a strict request.
  const request = {schemaVersion:1,template:'channel-explainer@1',layout:value.layout,mode:value.mode,
    brand:value.brand,visualStyle:'editorial',cameraAspectRatio:value.cameraAspectRatio,
    screenAspectRatio:value.screenAspectRatio,sections:[value.section]};
  const result = channelRequestSchema.safeParse(request);
  if (!result.success) for (const issue of result.error.issues) ctx.addIssue({code:'custom',message:issue.message});
});
export type ChannelScene = z.infer<typeof channelSceneSchema>;
export type ChannelSection = ChannelScene['section'];
export type ChannelBox = {x:number;y:number;width:number;height:number};

/** Exact pixel slots shared by the recipe validator and the React composition. */
export function channelMediaBoxes(layout: ChannelScene['layout'], kind: ChannelSection['kind']): Partial<Record<'camera'|'screen',ChannelBox>> {
  const portrait=layout==='portrait';
  if(kind==='hook')return {camera:portrait?{x:86,y:210,width:864,height:610}:{x:1054,y:172,width:770,height:712}};
  if(kind==='explanation')return {camera:portrait?{x:86,y:352,width:864,height:410}:{x:96,y:342,width:542,height:518}};
  if(kind==='demonstration')return {
    screen:portrait?{x:86,y:354,width:864,height:850}:{x:96,y:272,width:1728,height:616},
    camera:portrait?{x:680,y:1250,width:270,height:176}:{x:1480,y:734,width:310,height:184}};
  return {};
}
