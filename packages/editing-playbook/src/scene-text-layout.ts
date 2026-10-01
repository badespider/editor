/** Actual Canvas font measurements; used by the renderer, not a character-count estimate. */
export function measuredTextLayout(ctx: { font:string;letterSpacing:string;textBaseline:string;textAlign:string;measureText:(s:string)=>{width:number;actualBoundingBoxAscent?:number;actualBoundingBoxDescent?:number} },
  text:string, font:{family:string;weight:number;size:number;color:string;italic:boolean;tracking?:number},
  width:number,height:number,preferred:number,minimum:number,maxLines:number,lineGap:number) {
  const words=text.trim().split(/\s+/);
  const attempt=(size:number)=>{
    ctx.font=(font.italic?'italic ':'')+font.weight+' '+size+'px "'+font.family+'"';ctx.letterSpacing=(size*(font.tracking||0))+'px';ctx.textBaseline='alphabetic';ctx.textAlign='left';
    const lines:string[]=[];let line='';
    for(const word of words){if(ctx.measureText(word).width>width)return null;const next=line?line+' '+word:word;
      if(line&&ctx.measureText(next).width>width){lines.push(line);line=word;}else line=next;}
    if(line)lines.push(line);if(lines.length>maxLines)return null;
    const metrics=lines.map(s=>{const m=ctx.measureText(s);return {text:s,width:m.width,ascent:m.actualBoundingBoxAscent??size*.8,descent:m.actualBoundingBoxDescent??size*.2};});
    const advance=size*lineGap,total=(metrics.length-1)*advance+metrics[0].ascent+metrics.at(-1)!.descent;
    if(total>height)return null;let baseline=-total/2+metrics[0].ascent;
    return {size,font:ctx.font,tracking:ctx.letterSpacing,lines:metrics.map(m=>{const y=baseline;baseline+=advance;return {...m,x:-m.width/2,y};}),height:total};
  };
  if(minimum>preferred)throw Error('Text layout minimum exceeds requested font size');
  const atMin=attempt(minimum);if(!atMin)throw Error('Text cannot fit at minimum readable size; enlarge/reflow the box or shorten approved title');
  let result=attempt(preferred);if(result)return result;
  let lo=minimum,hi=preferred;result=atMin;
  for(let i=0;i<14;i++){const mid=(lo+hi)/2,next=attempt(mid);if(next){lo=mid;result=next;}else hi=mid;}
  return result;
}
export { measuredTextRuntime } from './scene-precision-runtime.ts';
