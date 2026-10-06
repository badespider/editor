import { z } from 'zod';
import { adaptScene, motionDigest, sceneInputSchema, sceneRecipeSchema, type SceneLayer, type ScenePose, type SceneRecipe } from './scene-motion.ts';

import {channelRequestSchema,channelSceneSchema,channelMediaBoxes,type ChannelRequest} from './channel-contract.ts';
export {channelRequestSchema,type ChannelRequest} from './channel-contract.ts';
type Box = { x: number; y: number; width: number; height: number };
export const channelDesign = Object.freeze({ id: 'channel-explainer', version: 2, font: 'Arial',
  colors: { navy: '#071426', panel: '#10243B', muted: '#BED0E1', white: '#F8FBFF', cyan: '#43DBF5' },
  weights: [400, 700], entranceSeconds: .23, exitSeconds: .17,
  paper: { kind: 'paper' as const, seed: 37, strength: .85 },
  portraitSafeArea: { x: .08, y: .07, width: .8, height: .69 },
  portraitCaptionArea: { x: .08, y: .79, width: .8, height: .105 },
});

/** One content contract, two independently authored layouts, no source extraction or AI calls. */
export function buildChannelTemplate(raw: unknown) {
  const request = channelRequestSchema.parse(raw), vertical = request.layout === 'portrait', paper = request.visualStyle === 'paper';
  const width = vertical ? 1080 : 1920, height = vertical ? 1920 : 1080;
  const C = channelDesign.colors, templates: SceneRecipe['templates'] = [], sections: {
    id: string; templateId: string; start: number; end: number; purpose: string; slots: string[];
  }[] = [];
  let start = 0;
  for (const [index, section] of request.sections.entries()) {
    const layers: SceneLayer[] = [], D = section.duration;
    const pose = (b: Box): ScenePose => ({ x: b.x + b.width / 2, y: b.y + b.height / 2,
      width: b.width, height: b.height, rotation: 0, opacity: 0, blur: 0, skewX: 0, reveal: 1 });
    const keys = (p: ScenePose, at = 0, slide = false): SceneLayer['keys'] => [
      { at: at / D, pose: { opacity: 0, y: p.y + (slide ? .012 : 0) }, easing: 'easeOut' },
      { at: (at + .23) / D, pose: { opacity: 1, y: p.y }, easing: 'linear' },
      { at: (D - .17) / D, pose: { opacity: 1 }, easing: 'easeIn' }, { at: 1, pose: { opacity: 0 }, easing: 'linear' },
    ];
    const shape = (id: string, b: Box, fill = C.panel, kind: 'rect' | 'ellipse' = 'rect', at = 0) => {
      const panel = paper && kind === 'rect' && b.width > .1 && b.height > .035;
      const p = pose(b); layers.push({ id, kind, pose: p, keys: keys(p, at, panel), fill,
        stroke: panel ? '#24435D' : fill, strokeWidth: panel ? 1 : 0, shadow: panel ? 10 : 0,
        ...(panel ? { cornerRadius: .08 } : {}) });
    };
    const text = (id: string, value: string, b: Box, size = .047, bold = false, color = C.white, maxLines = 2, at = 0) => {
      const p = pose(b); layers.push({ id, kind: 'text', text: value, pose: p, keys: keys(p, at, true),
        fill: color, stroke: color, strokeWidth: 0, shadow: 0,
        font: { family: channelDesign.font, weight: bold ? 700 : 400, size, color, italic: false },
        textLayout: { maxLines, minFontSize: Math.min(size, vertical ? .031 : .028), lineGap: 1.13 } });
    };
    const line = (id: string, b: Box, at: number, direction: 'horizontal' | 'vertical' = 'horizontal') => {
      const p = pose(b); const initial = direction === 'horizontal' ? { reveal: 0 } : { height: .0001, y: b.y };
      layers.push({ id, kind: 'rect', pose: p, fill: C.cyan, stroke: C.cyan, strokeWidth: 0, shadow: 0,
        keys: [{ at: at / D, pose: { ...initial, opacity: 0 }, easing: 'easeOut' },
          { at: (at + .30) / D, pose: { reveal: 1, height: p.height, y: p.y, opacity: 1 }, easing: 'linear' },
          { at: (D - .17) / D, pose: { opacity: 1 }, easing: 'easeIn' }, { at: 1, pose: { opacity: 0 }, easing: 'linear' }] });
    };
    const border = (id: string, b: Box, at = 0) => {
      const tx = 3 / width, ty = 3 / height;
      shape(id + '-top', { ...b, height: ty }, C.cyan, 'rect', at);
      shape(id + '-bottom', { ...b, y: b.y + b.height - ty, height: ty }, C.cyan, 'rect', at);
      shape(id + '-left', { ...b, width: tx }, C.cyan, 'rect', at);
      shape(id + '-right', { ...b, x: b.x + b.width - tx, width: tx }, C.cyan, 'rect', at);
    };
    const media = (slot: 'camera' | 'screen', b: Box) => {
      shape(slot + '-frame', b);
      if (request.mode === 'footage') {
        const aspect = slot === 'camera' ? request.cameraAspectRatio : request.screenAspectRatio;
        const w = Math.min(b.width * width, b.height * height * aspect), h = w / aspect;
        const p = pose({ x: b.x + (b.width - w / width) / 2, y: b.y + (b.height - h / height) / 2, width: w / width, height: h / height });
        layers.push({ id: slot, kind: 'video', slot, pose: p, keys: keys(p), fill: C.navy, stroke: C.navy, strokeWidth: 0, shadow: 0 });
      } else if (slot === 'camera') {
        // Schematic human, not a fake video or a likeness of the channel owner.
        const radius = Math.min(b.width * width * .16, b.height * height * .17);
        shape('camera-head', { x: b.x + b.width / 2 - radius / width, y: b.y + b.height * .27 - radius / height,
          width: radius * 2 / width, height: radius * 2 / height }, C.muted, 'ellipse');
        shape('camera-body', { x: b.x + b.width * .21, y: b.y + b.height * .40, width: b.width * .58, height: b.height * .37 }, '#24435D', 'ellipse');
        if (b.width > .25) {
          text('camera-label', 'YOUR CAMERA', { x: b.x + b.width * .1, y: b.y + b.height * .78, width: b.width * .8, height: b.height * .09 }, .035, true, C.white, 1);
          text('camera-placeholder', 'PLACEHOLDER', { x: b.x + b.width * .1, y: b.y + b.height * .89, width: b.width * .8, height: b.height * .075 }, .025, false, C.muted, 1);
        } else text('camera-label', 'CAMERA', { x: b.x + .005, y: b.y + b.height * .78, width: b.width - .01, height: b.height * .18 }, .025, true, C.white, 1);
      } else {
        text('screen-label', 'SCREEN DEMO / REPLACE WITH CAPTURE', { x: b.x + .02, y: b.y + .02, width: b.width - .04, height: .04 }, .025, false, C.muted, 1);
        shape('screen-toolbar', { x: b.x + b.width * .05, y: b.y + b.height * .16, width: b.width * .9, height: b.height * .09 }, '#18334D');
        text('screen-task', 'Plan one useful task', { x: b.x + b.width * .09, y: b.y + b.height * .28, width: b.width * .8, height: b.height * .10 }, .042, true);
        for (const [i, value] of ['01   Choose a task', '02   Add your context', '03   Review the answer'].entries())
          text('screen-row-' + i, value, { x: b.x + b.width * .12, y: b.y + b.height * (.42 + i * .12), width: b.width * .73, height: b.height * .10 }, .037, false, i === 1 ? C.cyan : C.white, 1);
      }
    };
    text('brand', request.brand.toUpperCase(), { x: vertical ? .08 : .06, y: vertical ? .044 : .042, width: vertical ? .55 : .45, height: .026 }, vertical ? .028 : .024, true, C.cyan, 1);
    text('section-number', String(index + 1).padStart(2, '0') + ' / ' + String(request.sections.length).padStart(2, '0'),
      { x: vertical ? .73 : .85, y: vertical ? .044 : .042, width: .15, height: .026 }, .025, false, C.muted, 1);
    if (request.mode === 'layout-demo') text('demo-label', 'LAYOUT DEMO / NO FOOTAGE',
      { x: vertical ? .08 : .06, y: vertical ? .92 : .95, width: vertical ? .8 : .55, height: .022 }, .021, false, C.muted, 1);
    const heading = (value: string) => {
      text('headline', value, { x: .08, y: vertical ? .10 : .12, width: .8, height: vertical ? .10 : .08 }, vertical ? .059 : .064, true);
      if (paper) line('heading-marker', { x: .08, y: vertical ? .205 : .21, width: vertical ? .10 : .045, height: 3 / height }, .16);
    };
    if (section.kind === 'hook') {
      media('camera', vertical ? { x: .08, y: .16, width: .8, height: .34 } : { x: .06, y: .16, width: .43, height: .68 });
      text('headline', section.headline, vertical ? { x: .08, y: .545, width: .8, height: .17 } : { x: .55, y: .30, width: .38, height: .31 }, .09, true, C.white, 3);
      line('hook-accent', vertical ? { x: .08, y: .52, width: .13, height: .003 } : { x: .55, y: .25, width: .07, height: .004 }, .1);
    } else if (section.kind === 'roadmap') {
      heading(section.headline);
      for (const [i, s] of section.steps.entries()) {
        const x = vertical ? .14 : .20 + i * .30, y = vertical ? .28 + i * .155 : .40;
        if (i < 2) {
          const connector = vertical ? { x: x - .0014, y: y + .027, width: .003, height: .115 }
            : { x: x + .026, y: y - .002, width: .248, height: .004 };
          shape('connector-base-' + i, connector, '#24435D');
          line('connector-' + i, connector, section.steps[i + 1].activateAt, vertical ? 'vertical' : 'horizontal');
        }
        const size = 56; const circle = { x: x - size / width / 2, y: y - size / height / 2, width: size / width, height: size / height };
        if (paper) {
          shape('stop-halo-' + i, { x: circle.x - 7 / width, y: circle.y - 7 / height, width: circle.width + 14 / width, height: circle.height + 14 / height }, '#183A50', 'ellipse', s.activateAt);
        }
        shape('stop-' + i, circle, '#24435D', 'ellipse'); shape('active-' + i, circle, C.cyan, 'ellipse', s.activateAt);
        text('number-' + i, String(i + 1), circle, .033, true, C.navy, 1, s.activateAt);
        text('step-title-' + i, s.title, vertical ? { x: .23, y: y - .028, width: .62, height: .040 }
          : { x: x - .13, y: .49, width: .26, height: .07 }, .05, true, C.white, 1);
        text('step-detail-' + i, s.detail, vertical ? { x: .23, y: y + .024, width: .62, height: .05 }
          : { x: x - .13, y: .58, width: .26, height: .10 }, .036, false, C.muted);
      }
    } else if (section.kind === 'explanation') {
      heading(section.headline);
      media('camera', vertical ? { x: .08, y: .225, width: .8, height: .22 } : { x: .06, y: .27, width: .31, height: .55 });
      const b = vertical ? { x: .08, y: .49, width: .8, height: .19 } : { x: .43, y: .38, width: .51, height: .25 };
      for (const [i, node] of section.nodes.entries()) {
        const w = b.width / 3 - .025, x = b.x + i * b.width / 3;
        const at = paper ? .12 * i : 0;
        shape('node-' + i, { x, y: b.y, width: w, height: b.height }, C.panel, 'rect', at);
        text('node-label-' + i, node, { x: x + .012, y: b.y + b.height * .23, width: w - .024, height: b.height * .54 }, vertical ? .041 : .052, true, C.white, 2, at);
        if (i < 2) line('node-link-' + i, { x: x + w, y: b.y + b.height / 2, width: .025, height: 3 / height }, .5 + i * .45);
      }
    } else if (section.kind === 'demonstration') {
      heading(section.headline);
      const b = vertical ? { x: .08, y: .23, width: .8, height: .47 } : { x: .06, y: .24, width: .88, height: .60 };
      media('screen', b);
      // Map the focus into the actual aspect-preserving screen picture, not its padded container.
      const aspect = request.mode === 'layout-demo' ? b.width * width / (b.height * height) : request.screenAspectRatio;
      const w = Math.min(b.width * width, b.height * height * aspect), h = w / aspect;
      const actual = { x: b.x + (b.width - w / width) / 2, y: b.y + (b.height - h / height) / 2, width: w / width, height: h / height };
      const f = section.highlight;
      border('focus', { x: actual.x + f.x * actual.width, y: actual.y + f.y * actual.height, width: f.width * actual.width, height: f.height * actual.height }, section.highlightAt);
      text('focus-label', section.focusLabel, vertical ? { x: .08, y: .71, width: .8, height: .035 }
        : { x: .08, y: .86, width: .56, height: .045 }, .032, false, C.cyan, 1, section.highlightAt);
      media('camera', vertical ? { x: .67, y: .60, width: .18, height: .085 } : { x: .74, y: .65, width: .17, height: .16 });
    } else if (section.kind === 'comparison') {
      heading(section.headline);
      for (const [i, option] of section.options.entries()) {
        const n = section.options.length, b = vertical ? { x: .08, y: (paper ? .225 : .235) + i * (paper ? .16 : .17), width: .8, height: paper ? .145 : .15 }
          : { x: .06 + i * (.9 / n), y: .26, width: .9 / n - .025, height: .56 };
        const at = paper ? .12 * i : 0;
        shape('card-' + i, b, C.panel, 'rect', at);
        // Inset accents avoid painting a straight cyan bar across rounded corners.
        shape('card-accent-' + i, { ...b, x: b.x + (paper ? .02 : 0), y: b.y + (paper ? .006 : 0), width: b.width - (paper ? .04 : 0), height: 3 / height }, C.cyan, 'rect', at);
        text('card-name-' + i, option.name, { x: b.x + .02, y: b.y + (vertical ? .008 : .027), width: b.width - .04, height: vertical ? .031 : .06 }, vertical ? .041 : .048, true, C.cyan, 1, at);
        for (const [j, [name, value]] of [['Skills', option.skills], ['Work involved', option.work], ['First project', option.firstProject]].entries()) {
          if (vertical) {
            text(`card-${i}-field-${j}`, name, { x: b.x + .025, y: b.y + .048 + j * .029, width: .25, height: .026 }, .028, false, C.muted, 1, at);
            text(`card-${i}-value-${j}`, value, { x: b.x + .28, y: b.y + .048 + j * .029, width: b.width - .305, height: .026 }, .032, false, C.white, 1, at);
          } else {
            text(`card-${i}-field-${j}`, name.toUpperCase(), { x: b.x + .025, y: b.y + .14 + j * .123, width: b.width - .05, height: .034 }, .025, false, C.muted, 1, at);
            text(`card-${i}-value-${j}`, value, { x: b.x + .025, y: b.y + .183 + j * .123, width: b.width - .05, height: .069 }, .035, false, C.white, 2, at);
          }
        }
      }
    } else {
      text('next-eyebrow', 'YOUR NEXT STEP', { x: .08, y: vertical ? .19 : .24, width: vertical ? .8 : .52, height: .05 }, .039, true, C.cyan, 1);
      text('action', section.action, { x: .08, y: vertical ? .29 : .34, width: vertical ? .8 : .55, height: vertical ? .19 : .26 }, .082, true, C.white, 3);
      const c = vertical ? { x: .39, y: .555, width: .18, height: .10125 } : { x: .71, y: .36, width: .15, height: .266667 };
      shape('action-disc', c, C.cyan, 'ellipse');
      text('action-mark', '1', { ...c, x: c.x + c.width * .15, width: c.width * .7 }, .105, true, C.navy, 1);
      if (section.pdf) text('pdf-invitation', 'Download: ' + section.pdf.label, { x: .08, y: vertical ? .70 : .68, width: .8, height: .055 }, .035, true, C.cyan, 2);
    }
    if (section.keyPhrase && section.kind !== 'demonstration') {
      if (paper) shape('key-phrase-panel', { x: .08, y: vertical ? .715 : .86, width: .8, height: vertical ? .045 : .06 }, '#102B3F', 'rect', .25);
      text('key-phrase', section.keyPhrase,
        { x: paper ? .10 : .08, y: vertical ? .72 : .87, width: paper ? .76 : .8, height: vertical ? .035 : .04 }, .031, false, C.cyan, 1, paper ? .25 : 0);
    }
    if (vertical && request.mode === 'layout-demo' && section.demoCaption) {
      const b = channelDesign.portraitCaptionArea; shape('caption-band', b, C.navy);
      for (const [i, value] of section.demoCaption.entries()) text('demo-caption-' + i, value,
        { x: b.x + .012, y: b.y + .01 + i * .039, width: b.width - .024, height: .035 }, .05, true, C.white, 1);
    }
    const templateId = `channel-${section.id}`;
    const channel = request.visualStyle === 'editorial' ? channelSceneSchema.parse({version:1,brand:request.brand,
      layout:request.layout,mode:request.mode,cameraAspectRatio:request.cameraAspectRatio,screenAspectRatio:request.screenAspectRatio,
      section,index,count:request.sections.length}) : undefined;
    if (channel) {
      // Native scenes own their graphics. Keep only explicit media slots in the normal source/evidence gate.
      layers.length = 0;
      if(request.mode === 'footage') for(const [slot,b] of Object.entries(channelMediaBoxes(request.layout,section.kind))) {
        const aspect=slot==='camera'?request.cameraAspectRatio:request.screenAspectRatio;
        const w=Math.min(b.width,b.height*aspect),h=w/aspect;
        layers.push({id:slot,slot,kind:'video',pose:{...pose({x:(b.x+(b.width-w)/2)/width,y:(b.y+(b.height-h)/2)/height,
          width:w/width,height:h/height}),opacity:1},keys:[],fill:C.navy,stroke:C.navy,strokeWidth:0,shadow:0});
      }
    }
    templates.push({ id: templateId, background: C.navy, ...(paper ? { surface: channelDesign.paper } : {}), ...(channel?{channel}:{}), layers });
    sections.push({ id: section.id, templateId, start, end: start + D, purpose: section.kind,
      slots: layers.flatMap(l => l.slot ? [l.slot] : []) }); start += D;
  }
  const criteria: SceneRecipe['style']['criteria'] = [
    { id: 'channel-framing', dimension: 'framing', requirement: 'Use the authored layout. Keep text inside safe areas; contain source pictures without stretching. Presenter, diagrams and highlights must stay legible and not collide.' + (paper ? ' Keep the seeded navy paper material behind content, with soft framed cards; never texture over source footage or captions.' : '') },
    { id: 'channel-type', dimension: 'typography', requirement: 'Use Arial regular/bold, navy/white/cyan, short readable headings. Long form has key phrases; Shorts captions have at most two rows.' },
    { id: 'channel-motion', dimension: 'motion', requirement: 'Short fades and gentle slides. Three roadmap stops activate in order, connectors draw, and the demo highlight appears at its supplied cue.' + (paper ? ' Diagram and comparison cards enter in a restrained stagger; the material stays stable, not flickering.' : '') },
    { id: 'channel-rhythm', dimension: 'rhythm', requirement: 'Open directly into the hook. Preserve supplied section timing and source speech; end with one action. Advertise a PDF only when a ready resource was supplied.' },
  ].map(c => ({ ...c, dimension: c.dimension as 'framing' | 'typography' | 'motion' | 'rhythm', essential: true, evidence: [] }));
  const recipe = sceneRecipeSchema.parse({ schemaVersion: 1, kind: 'scene-motion-recipe', compositor: 'layered-v2',
    style: { name: 'Channel explainer / ' + request.layout + ' / ' + request.visualStyle, basis: 'brief',
      brief: { id: channelDesign.id, version: channelDesign.version, sha256: motionDigest({ design: channelDesign, request }), description: 'User-authored channel brief, not a recovered reference or inferred preference for other channels.' },
      references: [], criteria, avoid: ['No bouncy entrances, long intros, cropped captions or unready download promises.'],
      uncertainties: ['Layout demos use schematic placeholders and authored caption examples, not speech alignment. Real footage requires evidence, actual word times and a fresh review.'] },
    templates, caption: { font: { family: 'Arial', weight: 700, size: .05, color: C.white, italic: false },
      box: vertical ? channelDesign.portraitCaptionArea : { x: .08, y: .86, width: .84, height: .09 }, minFontSize: .04,
      visible: vertical && request.mode === 'footage', lineGap: 1.13, entrySeconds: .13, lift: .003, blur: 0, uppercase: false, shadow: 2 },
  });
  return { request, design: channelDesign, width, height, fps: 30 as const, duration: start, recipe, sections,
    status: 'draft_requires_render_review' as const, safeToAutoPublish: false as const, externalModelCalls: 0 };
}

/** Bind genuine evidence/transcript via the existing scene gate; never synthesize word times. */
export function adaptChannelTemplate(raw: unknown, input: unknown) {
  const built = buildChannelTemplate(raw);
  if (built.request.mode !== 'footage') throw Error('Use footage mode to bind a real source; a layout demo is not speech evidence');
  const data = sceneInputSchema.parse(input);
  if (data.width !== built.width || data.height !== built.height) throw Error('Choose the authored landscape/portrait dimensions, not a cropped layout');
  if (!Array.isArray(data.shots) || data.shots.length !== built.sections.length) throw Error('Match the requested section IDs/times');
  for (const s of built.sections) {
    const shot = data.shots.find(p => p.id === s.id);
    if (!shot || Math.abs(shot.start - s.start) > .0001 || Math.abs(shot.end - s.end) > .0001) throw Error('Source shots must match the requested section IDs/times');
    shot.templateId = s.templateId; shot.criteria = built.recipe.style.criteria.map(c => c.id);
  }
  if (built.request.layout === 'portrait' && data.captions.some(c => c.words.some(w => w.row > 1) || (c.box && (Object.keys(channelDesign.portraitCaptionArea) as (keyof Box)[]).some(k => c.box![k] !== channelDesign.portraitCaptionArea[k]))))
    throw Error('Shorts captions require at most two rows in the reserved caption area');
  if (built.request.layout === 'landscape' && data.captions.some(c => c.box)) throw Error('Long-form template uses key phrases, not overlay captions');
  return adaptScene(built.recipe, data);
}

/** Shared starter content is explicitly fictional demonstration copy, not an AI course claim. */
export function channelDemoRequest(layout: ChannelRequest['layout'] = 'landscape'): ChannelRequest {
  return channelRequestSchema.parse({ schemaVersion: 1, template: 'channel-explainer@1', layout, mode: 'layout-demo', brand: 'YOUR CHANNEL', sections: [
    { id: 'hook', kind: 'hook', duration: 6, headline: 'Where do you start with AI?', keyPhrase: 'Start with one useful task.', demoCaption: ['Where do you start', 'with AI?'] },
    { id: 'roadmap', kind: 'roadmap', duration: 9, headline: 'Your starting roadmap', keyPhrase: 'Small steps. A real result.', steps: [
      { title: 'Choose', detail: 'One task you do often', activateAt: .3 }, { title: 'Try', detail: 'Add context and examples', activateAt: 3 }, { title: 'Review', detail: 'Check. Improve. Repeat.', activateAt: 6 } ], demoCaption: ['Choose a task. Try it.', 'Then review the result.'] },
    { id: 'explain', kind: 'explanation', duration: 7, headline: 'Make the request clearer', nodes: ['Your task', 'Your context', 'Useful result'], keyPhrase: 'Context makes the request specific.', demoCaption: ['Give it your task', 'and the context it needs.'] },
    { id: 'demo', kind: 'demonstration', duration: 8, headline: 'Here is the workflow', highlight: { x: .08, y: .52, width: .75, height: .115 }, highlightAt: 1.2, focusLabel: 'Notice the context step.', demoCaption: ['Watch this step:', 'add your own context.'] },
    { id: 'compare', kind: 'comparison', duration: 9, headline: 'Pick your first path', options: [
      { name: 'Use AI daily', skills: 'Clear questions', work: 'Test and review', firstProject: 'A weekly plan' },
      { name: 'Build workflows', skills: 'Connect steps', work: 'Set up and test', firstProject: 'A task checklist' },
      { name: 'Build tools', skills: 'Basic coding', work: 'Build and debug', firstProject: 'A small helper' } ], keyPhrase: 'Pick the path that fits your task.', demoCaption: ['Same questions.', 'Three different paths.'] },
    { id: 'next', kind: 'next-step', duration: 6, action: 'Choose one task. Try it today.', demoCaption: ['Choose one useful task.', 'Try it today.'] },
  ] });
}

export function channelWorkflow() {
  return { template: 'channel-explainer@1', design: channelDesign, requestSchema: z.toJSONSchema(channelRequestSchema),
    actions: ['channel example --layout landscape|portrait', 'channel build REQUEST.json -o NEW_BUNDLE', 'channel demo REQUEST.json -o NEW_JOB', 'channel adapt REQUEST.json INPUT.json -o NEW_BUNDLE'],
    notes: ['No camera or screen footage exists in a layout demo. It is silent, uses authored sample copy, and never fabricates ASR/word alignment.',
      'For footage, obtain evidence and genuine transcript timing first. Derive roadmap/highlight section-relative times from those cues.',
      'Use explicit source crops and matching aspect ratios for tight framing. In portrait, select a legible screen focus, not a blanket widescreen crop.',
      'Choose visualStyle:editorial for the rebuilt native React/SVG scenes, folded navy paper, large left-aligned type, progressive diagrams and independent vertical layout. Requires Remotion. paper/clean preserve earlier designs.',
      'Each bundle is bounded to 60 seconds; longer episodes assemble reviewed sections with continuous audio via the existing delivery workflow.',
      'Follow normal scene render/inspect/review for footage. No previous demo verdict is inherited. This is a channel-specific template, not a global default.',
      'A PDF invitation requires ready:true and an HTTPS resource. It is not uploaded/published or proved available by this builder.'],
    externalModelCalls: 0, safeToAutoPublish: false };
}
