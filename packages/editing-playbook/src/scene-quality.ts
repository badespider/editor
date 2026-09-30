import { resolveSceneTemplate, scenePoseAt, type SceneAdaptation, type SceneLayer, type ScenePose } from './scene-motion.ts';

type Box = { x: number; y: number; width: number; height: number };
export type SceneQualityFinding = { code: string; shotId: string; layerId: string; firstFrame: number; lastFrame: number; affectedFrames: number; note: string };
export type ScenePreflight = { version: 1; frames: number; findings: SceneQualityFinding[]; boundaryFrames: number[]; expectedMotionFrames: number[]; limitation: string };

/** Same center-relative, aspect-aware group transform as the compositor. */
export function sceneWorldPose(layer: SceneLayer, t: number, groups: ReturnType<typeof resolveSceneTemplate>['groups'], width: number, height: number): ScenePose {
  const p = scenePoseAt(layer, t);
  if (!layer.group) return p;
  const g = scenePoseAt(groups!.find(g => g.id === layer.group)!, t), r = g.rotation * Math.PI / 180;
  const dx = (p.x - .5) * width * g.width, dy = (p.y - .5) * height * g.width;
  return { ...p, x: (g.x * width + dx * Math.cos(r) - dy * Math.sin(r)) / width,
    y: (g.y * height + dx * Math.sin(r) + dy * Math.cos(r)) / height,
    width: p.width * g.width, height: p.height * g.width, rotation: p.rotation + g.rotation, opacity: p.opacity * g.opacity };
}

// Conservative axis-aligned envelope, including shear/rotation. Masks, glyph
// shapes and transparency are unknown here: warnings require visual judgment.
function envelope(p: ScenePose, W: number, H: number): Box {
  const r = p.rotation * Math.PI / 180, points = [-.5, .5].flatMap(y => [-.5, .5].map(x => {
    const dx = x * p.width * W + p.skewX * y * p.height * H, dy = y * p.height * H;
    return { x: p.x + (dx * Math.cos(r) - dy * Math.sin(r)) / W, y: p.y + (dx * Math.sin(r) + dy * Math.cos(r)) / H };
  }));
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  return { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y };
}
const intersection = (a: Box, b: Box) => Math.max(0, Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)) * Math.max(0, Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
const visible = (p: ScenePose, b: Box) => p.opacity > .05 && p.reveal > .05 && intersection(b, { x:0,y:0,width:1,height:1 }) > 0;
function moved(a: ScenePose, b: ScenePose, W: number, H: number) {
  return Math.max(Math.abs(a.x-b.x)*W, Math.abs(a.y-b.y)*H, Math.abs(a.width-b.width)*W,
    Math.abs(a.height-b.height)*H, Math.abs(a.rotation-b.rotation)*Math.max(a.width*W,a.height*H)*Math.PI/180,
    Math.abs(a.skewX-b.skewX)*a.height*H, Math.abs(a.blur-b.blur), Math.abs(a.reveal-b.reveal)*a.width*W,
    Math.abs(a.opacity-b.opacity)*255) >= 1;
}

/** Bounded frame-by-frame geometric checks, not inferred semantic approval. */
export function preflightScene(a: SceneAdaptation): ScenePreflight {
  const { width: W, height: H } = a.input, frames = Math.round(a.duration * 30);
  const findings = new Map<string, SceneQualityFinding>(), expected = new Set<number>(), boundaries = new Set<number>();
  const flag = (code: string, shotId: string, layerId: string, frame: number, note: string) => {
    const key = `${code}/${shotId}/${layerId}`, prior = findings.get(key);
    if (prior) { prior.lastFrame = frame; prior.affectedFrames++; }
    else findings.set(key, { code, shotId, layerId, firstFrame: frame, lastFrame: frame, affectedFrames: 1, note });
  };
  for (const shot of a.input.shots) {
    const start = Math.round(shot.start*30), end = Math.round(shot.end*30);
    for (const edge of [start, end]) for (let f = edge-2; f <= edge+2; f++) if (f >= 0 && f < frames) boundaries.add(f);
    const template = resolveSceneTemplate(a.recipe.templates.find(t => t.id === shot.templateId)!, shot, a.input);
    let previous: ScenePose[] | undefined;
    for (let frame = start; frame < end; frame++) {
      const poses = template.layers.map(l => sceneWorldPose(l, (frame-start)/(end-start), template.groups, W, H));
      const boxes = poses.map(p => envelope(p,W,H));
      template.layers.forEach((layer,i) => {
        const p = poses[i], box = boxes[i];
        if (!visible(p,box)) return;
        if (previous && moved(previous[i],p,W,H)) expected.add(frame);
        if (layer.kind === 'text') {
          if (box.x < -.001 || box.y < -.001 || box.x+box.width > 1.001 || box.y+box.height > 1.001)
            flag('text_outside_picture',shot.id,layer.id,frame,'Text envelope crosses the picture edge; inspect intentional entrances/exits.');
          const covers = template.layers.slice(i+1).some((_l,j) => poses[i+j+1].opacity >= .5 && poses[i+j+1].reveal > .1 && intersection(box,boxes[i+j+1]) > box.width*box.height*.15);
          if (covers) flag('text_occlusion_risk',shot.id,layer.id,frame,'A later layer overlaps more than 15% of this text envelope. Masks/transparent pixels may make this intentional.');
          if (shot.framing.protectedRegions.some(b => intersection(b,box) > .0001))
            flag('text_over_protected_picture',shot.id,layer.id,frame,'Animated text enters a caller-declared protected picture region.');
        }
      });
      previous = poses;
      for (const c of a.input.captions) if (frame/30 >= c.start && frame/30 < c.end) {
        const b = c.box ?? a.recipe.caption.box;
        if (template.layers.some((l,i) => l.kind === 'text' && visible(poses[i],boxes[i]) && intersection(b,boxes[i]) > .001))
          flag('caption_over_text',shot.id,c.id,frame,'Caption box overlaps a visible authored heading; inspect readability.');
      }
    }
  }
  return { version: 1, frames, findings: [...findings.values()], boundaryFrames: [...boundaries].sort((a,b)=>a-b), expectedMotionFrames: [...expected].sort((a,b)=>a-b),
    limitation: 'Geometric warnings, not pixel visibility, font measurement, subject tracking, source-cut detection or style approval. Static holds are valid. Review flagged ranges and both sides of every cut.' };
}

/** Compare small decoded luma frames only where the recipe expected movement.
 * Other moving content can hide a stuck layer; tiny motion/compression can also
 * create false positives. Never use this diagnostic as an approval gate. */
export function scanSceneFrames(pixels: Uint8Array, pixelsPerFrame: number, preflight: ScenePreflight) {
  if (!Number.isInteger(pixelsPerFrame) || pixelsPerFrame <= 0 || pixels.length !== preflight.frames*pixelsPerFrame) throw Error('Diagnostic frame count mismatch');
  const expected = new Set(preflight.expectedMotionFrames), suspected: { firstFrame: number; lastFrame: number }[] = [];
  let first = -1;
  const flush = (last: number) => { if (first >= 0 && last-first+1 >= 2) suspected.push({ firstFrame:first,lastFrame:last }); first=-1; };
  for (let f=1; f<preflight.frames; f++) {
    let difference=0;
    for (let p=0; p<pixelsPerFrame; p++) difference += Math.abs(pixels[f*pixelsPerFrame+p]-pixels[(f-1)*pixelsPerFrame+p]);
    if (expected.has(f) && difference/pixelsPerFrame < .01) { if(first<0)first=f; }
    else flush(f-1);
  }
  flush(preflight.frames-1);
  return { suspectedStalls:suspected, framesChecked:preflight.frames, expectedMotionFrames:expected.size,
    status:suspected.length?'inspect_flagged_ranges':'no_stall_detected',
    limitation:'Low-resolution whole-frame heuristic. Not proof of smoothness, missing-layer detection, audiovisual quality or approval.' };
}
