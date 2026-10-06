import {z} from 'zod';
import {adaptScene, resolveSceneTemplate, type SceneAdaptation} from '../../editing-playbook/src/scene-motion.ts';

export const remotionOptionsSchema=z.object({
  captionEntrance:z.enum(['recipe','spring']).default('recipe'),
  concurrency:z.number().int().min(1).max(4).default(2),
}).strict();
export type RemotionOptions=z.output<typeof remotionOptionsSchema>;
export type RemotionPayload=ReturnType<typeof buildPayload>;

/** Compile only validated data. Browser URLs are generated local asset names, never source text. */
export function buildPayload(adaptation:SceneAdaptation,media:Record<string,string>,rawOptions:unknown={}) {
  const a=adaptScene(adaptation.recipe,adaptation.input),options=remotionOptionsSchema.parse(rawOptions);
  if(a.recipe.compositor!=='layered-v2')throw Error('Remotion supports layered-v2 recipes only; use the editor renderer for legacy recipes');
  const shots=a.input.shots.map(shot=>{
    const template=resolveSceneTemplate(a.recipe.templates.find(t=>t.id===shot.templateId)!,shot,a.input);
    const paths=Object.fromEntries(template.layers.filter(l=>l.kind==='video'||l.kind==='image').map(l=>{
      const key=`${shot.id}/${l.slot}`,path=media[key];
      if(!path||!/^asset-[a-f0-9]{64}\.(mp4|png|jpe?g|webp)$/.test(path))throw Error('Missing or unsafe staged media name');
      return [l.id,path];
    }));
    return {id:shot.id,start:shot.start,end:shot.end,template,paths};
  });
  // Private source/reference paths, permission declarations and observations stay in the Node job.
  return {width:a.input.width,height:a.input.height,fps:a.input.fps,duration:a.duration,
    recipe:{caption:a.recipe.caption},input:{width:a.input.width,height:a.input.height,audio:{start:a.input.audio.start},
      captions:a.input.captions,transcript:{words:a.input.transcript.words}},shots,remotion:{captionEntrance:options.captionEntrance}};
}
