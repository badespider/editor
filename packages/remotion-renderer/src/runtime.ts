import {sceneDrawingRuntime,condensedTitles,roundedPanels} from '../../editing-playbook/src/scene-composition.ts';
import {layeredRuntime} from '../../editing-playbook/src/scene-layered.ts';
import {precisionMotionRuntime} from '../../editing-playbook/src/scene-dynamics.ts';
import {measuredTextRuntime} from '../../editing-playbook/src/scene-text-layout.ts';

/** Fixed repository-owned drawing code; no input, reference, or catalog text is executable. */
export function drawingModule() {
  const captions=sceneDrawingRuntime
    .replace('ctx.font=font;', "ctx.font=font;ctx.letterSpacing=(size*(s.font.tracking||0))+'px';")
    .replace('ctx.save();ctx.font=w.font;', `ctx.save();ctx.font=w.font;ctx.letterSpacing=(w.size*(s.font.tracking||0))+'px';if(w.size<Math.min(W,H)*s.minFontSize)throw Error('Caption word below minimum readable size: '+c.id);
      if(data.remotion.captionEntrance==='spring'){const k=captionScale(since),ax=x+w.width/2,ay=y+row.height/2;ctx.translate(ax,ay);ctx.scale(k,k);ctx.translate(-ax,-ay);}`)
    .replace('ctx.fillText(w.label,x,y+row.height/2+s.lift*H*(1-f));', "if(s.strokeWidth){ctx.lineWidth=s.strokeWidth;ctx.strokeStyle=s.stroke||'#000000';ctx.lineJoin='round';ctx.strokeText(w.label,x,y+row.height/2+s.lift*H*(1-f));}ctx.fillText(w.label,x,y+row.height/2+s.lift*H*(1-f));")
    .replace(/function easeScene[^\n]+\nfunction poseScene[^\n]+/,precisionMotionRuntime);
  return `import {spring} from 'remotion';
export function captionScale(seconds){return .84+.16*Math.min(1.12,Math.max(0,spring({frame:Math.max(0,seconds*30),fps:30,config:{damping:16,stiffness:240,mass:.65}})));}
${captions}
${measuredTextRuntime}
${roundedPanels(condensedTitles(layeredRuntime))}
export {worldScene,exposureTimes,drawBlockV2,drawSceneCaptions};
`;
}
