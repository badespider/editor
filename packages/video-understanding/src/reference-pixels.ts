import {z} from 'zod';
export const pixelComparisonSchema=z.object({
  referenceFrame:z.number().int().min(0).max(1799),candidateFrame:z.number().int().min(0).max(1799),
  rationale:z.string().trim().min(1).max(2000),
  region:z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative(),width:z.number().int().positive(),height:z.number().int().positive()}).strict().optional(),
}).strict();
/** Display-RGB differences, not perceptual quality or semantic/style similarity. */
export function compareRGB(a:Uint8Array,b:Uint8Array){
  if(a.length!==b.length||!a.length||a.length%3)throw Error('Expected equal RGB24 buffers');
  let total=0,squared=0,changed=0,max=0;
  for(let i=0;i<a.length;i+=3){let peak=0;for(let j=0;j<3;j++){const d=Math.abs(a[i+j]-b[i+j]);total+=d;squared+=d*d;peak=Math.max(peak,d);max=Math.max(max,d);}if(peak>10)changed++;}
  return {meanAbsoluteChannelError:total/a.length,rootMeanSquareChannelError:Math.sqrt(squared/a.length),maxChannelError:max,
    fractionPixelsWithAnyChannelErrorAbove10:changed/(a.length/3),channelRange:[0,255],pixels:a.length/3};
}
