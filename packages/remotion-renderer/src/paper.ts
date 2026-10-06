/** Original, deterministic dyed-paper material inspired by Remotion Elements.
 * No external texture, shader package, per-frame random seed or footage overlay.
 * The small interface hides folds, mottling, fibers and tonal shading. */
export function paperPixels(width:number,height:number,options:{color:string;seed:number;strength:number}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1920||height>1920||
    !/^#[0-9a-fA-F]{6}$/.test(options.color)||!Number.isInteger(options.seed)||options.seed<0||options.seed>2147483647||
    !Number.isFinite(options.strength)||options.strength<0||options.strength>1)throw Error('Invalid bounded paper material');
  const {seed,strength}=options;
  const rgb=[1,3,5].map(i=>parseInt(options.color.slice(i,i+2),16));
  const hash=(x:number,y:number)=>{let n=(seed^Math.imul(x+1,374761393)^Math.imul(y+1,668265263))>>>0;
    n=Math.imul(n^(n>>>13),1274126177)>>>0;return ((n^(n>>>16))>>>0)/4294967295;};
  const smooth=(t:number)=>t*t*(3-2*t);
  const noise=(x:number,y:number)=>{const a=Math.floor(x),b=Math.floor(y),u=smooth(x-a),v=smooth(y-b);
    const p=hash(a,b)*(1-u)+hash(a+1,b)*u,q=hash(a,b+1)*(1-u)+hash(a+1,b+1)*u;return p*(1-v)+q*v;};
  const pixels=new Uint8ClampedArray(width*height*4),short=Math.min(width,height);
  const centers=[.23+hash(2,9)*.09,.58+hash(3,9)*.08,.87+hash(4,9)*.05];
  const slopes=[.28,-.19,.48];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=x/short,v=y/short;
    let folds=0;
    for(let i=0;i<3;i++){
      const d=u+slopes[i]*v-centers[i];
      // A softly lit fold ridge and adjacent shadow, not thin digital stripes.
      folds+=17*Math.exp(-((d/.060)**2))-10*Math.exp(-(((d+.075)/.115)**2));
    }
    const mottle=(noise(u*8,v*8)-.5)*10+(noise(u*25,v*25)-.5)*4;
    const fiber=(hash(x,y)-.5)*7+(noise(x*.16,y*1.4)-.5)*3;
    const shade=strength*(folds+mottle+fiber);
    const at=(y*width+x)*4;
    pixels[at]=rgb[0]+shade*.70;pixels[at+1]=rgb[1]+shade*.90;pixels[at+2]=rgb[2]+shade;
    pixels[at+3]=255;
  }
  return pixels;
}
