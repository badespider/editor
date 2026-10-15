import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const D=121.4;
await mkdir('compositions',{recursive:true});
await mkdir('evidence',{recursive:true});
const headers=[
 [0,14.19,'THE SYMPTOM','Fast drive. Slow copy.','The plug fits. That does not identify the fault.'],
 [14.19,40,'TRACE THE CONNECTION','What does each link support?','Port, cable, hub, drive. Read the whole path.'],
 [40,57.39,'A TESTABLE THEORY','Test this limit first.','The hub is a suspect—not a verdict on the drive.'],
 [57.39,72.17,'PROTECT THE FILES','Stop. Eject. Then disconnect.','Do not pull a drive while a program is writing to it.'],
 [72.17,96.21,'SIMPLIFY THE PATH','Take the hub out of the equation.','Use the verified port and the verified cable.'],
 [96.21,111.35,'CONTROL THE TEST','Same drive. Same files.','Repeat the copy and compare the result.'],
 [111.35,D,'INTERPRET THE RESULT','An improvement is evidence.','It does not prove the drive’s maximum speed.'],
];
const notes=[
 [0,14.19,'A physical fit is only the first check.'],
 [14.19,32.13,'Required connection: 10 Gb/s'],
 [32.13,40,'USB 2.0 hub path: up to 480 Mb/s signaling'],
 [40,57.39,'Investigate the limit before replacing the drive.'],
 [57.39,64.87,'01   Stop the copy. Close anything writing to the drive.'],
 [64.87,72.17,'02   Use the operating system’s safe-eject process.'],
 [72.17,85.69,'03   Connect directly with a suitable cable.'],
 [85.69,96.21,'Keep the drive and test files unchanged.'],
 [96.21,111.35,'If it improves, the original path was restricting the task.'],
 [111.35,D,'One change. Same task. A useful comparison.'],
];
const htmlHeaders=headers.map((h,i)=>`<header id="conn-title-${i}" class="conn-title"><p class="conn-kicker">USB / ${h[2]}</p><h1>${h[3]}</h1><p class="conn-dek">${h[4]}</p></header>`).join('\n');
const htmlNotes=notes.map((h,i)=>`<p id="conn-note-${i}" class="conn-note">${h[2]}</p>`).join('\n');
const fileGlyph=(x,y)=>`<g transform="translate(${x} ${y})"><path d="M0 0H35L51 16V69H0Z" fill="#EFEBDD"/><path d="M35 0V16H51M10 37H40M10 48H32" fill="none" stroke="#0B1728" stroke-width="3"/></g>`;
const proofTimes=[0,6,13,18,25,34,43,53,61,68,75,81,90,100,110,119,121.39];
const graphic=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Follow the connection</title></head><body><template>
<style>
@font-face{font-family:Geist;src:url('../assets/Geist-Variable.woff2') format('woff2');font-weight:100 900;font-style:normal}
#root{position:absolute;inset:0;width:100%;height:100%;font-family:Geist,sans-serif;color:#F7F5EF;overflow:hidden}
#conn-board{position:absolute;inset:0;background:#0B1728;isolation:isolate}
#conn-board *{box-sizing:border-box}
#conn-board .conn-title{position:absolute;left:192px;top:112px;width:1536px;opacity:0}
#conn-board .conn-kicker{font-size:24px;font-weight:700;letter-spacing:3px;margin:0 0 28px;color:#66DBEC}
#conn-board h1{font-size:72px;line-height:1.08;letter-spacing:-2.5px;font-weight:700;margin:0 0 22px;max-width:1536px}
#conn-board .conn-dek{font-size:32px;line-height:1.25;margin:0;color:#A9BBC9;max-width:1536px}
#conn-world{position:absolute;inset:0;transform-origin:960px 580px}
#conn-art{position:absolute;inset:0;width:100%;height:100%}
#conn-art .body{fill:#EFEBDD;stroke:#A9BBC9;stroke-width:3;stroke-linejoin:round}
#conn-art .dark{fill:#0B1728}
#conn-art .outline{fill:none;stroke:#A9BBC9;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
#conn-art .wire{fill:none;stroke:#A9BBC9;stroke-width:13;stroke-linecap:round}
#conn-art .trace{fill:none;stroke:#66DBEC;stroke-width:7;stroke-linecap:round}
#conn-art .signal{fill:none;stroke:#66DBEC;stroke-width:10;stroke-linecap:round;opacity:0}
#conn-art .part{opacity:0}
#conn-art .draw{fill:none;stroke:#66DBEC;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}
#conn-board .conn-spec{position:absolute;top:350px;width:300px;text-align:left;opacity:0;transform-origin:left bottom}
#conn-board .conn-spec p{font-size:27px;line-height:1.2;margin:0 0 8px;color:#A9BBC9}
#conn-board .conn-spec strong{display:block;font-size:54px;line-height:1.1;letter-spacing:-1.5px;font-weight:700}
#conn-spec-port{left:245px}#conn-spec-drive{left:1440px;width:280px!important}
#conn-spec-cable{left:650px;top:474px!important;width:280px!important}
#conn-spec-cable strong{font-size:42px!important}
#conn-spec-hub{left:990px;width:340px!important}
#conn-spec-hub strong{color:#66DBEC}
#conn-label-hub,#conn-label-drive,#conn-label-port{position:absolute;top:783px;font-size:30px;font-weight:700;margin:0;opacity:0}
#conn-label-port{left:245px}#conn-label-hub{left:1005px}#conn-label-drive{left:1450px}
#conn-board .conn-note{position:absolute;left:192px;top:862px;width:1536px;margin:0;line-height:1.25;font-size:36px;font-weight:700;opacity:0}
#conn-truth{position:absolute;left:192px;top:935px;margin:0;font-size:24px;line-height:1.3;color:#A9BBC9;width:1536px}
#conn-safety{position:absolute;left:650px;top:760px;width:270px;display:flex;align-items:center;justify-content:center;gap:18px;opacity:0}
#conn-safety span{font-size:28px;font-weight:700;color:#66DBEC}
#conn-safety svg{width:58px;height:58px;flex:none}
#conn-before{position:absolute;left:650px;top:345px;width:700px;opacity:0}
#conn-before p{font-size:26px;line-height:1.2;margin:0 0 12px;color:#A9BBC9}
#conn-before svg{width:640px;height:90px}
#conn-control{position:absolute;left:650px;top:710px;opacity:0;display:flex;gap:40px;align-items:center;font-size:28px}
#conn-control p{margin:0;line-height:1.2;color:#A9BBC9}
#conn-control strong{color:#F7F5EF;font-weight:700}
</style>
<div id="root" data-composition-id="usb-connection" data-width="1920" data-height="1080" data-duration="${D}">
 <div id="conn-board">
 ${htmlHeaders}
 <div id="conn-world">
  <svg id="conn-art" viewBox="0 -40 1920 1080" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Schematic laptop, rated cable, hub and external SSD connection">
   <g id="conn-old-wires" class="part">
    <path id="conn-route-left" class="wire" d="M590 610H1000"/>
    <path id="conn-route-right" class="wire" d="M1220 610H1450"/>
    <path id="conn-draw-left" class="trace" d="M590 610H1000"/>
    <path id="conn-draw-right" class="trace" d="M1220 610H1450"/>
    <rect x="585" y="592" width="34" height="36" rx="6" fill="#A9BBC9"/>
    <rect x="971" y="592" width="34" height="36" rx="6" fill="#A9BBC9"/>
    <rect x="1215" y="592" width="34" height="36" rx="6" fill="#A9BBC9"/>
    <rect x="1421" y="592" width="34" height="36" rx="6" fill="#A9BBC9"/>
   </g>
   <g id="conn-direct" class="part">
    <path id="conn-direct-wire" class="wire" d="M590 610C650 610 630 790 710 790H1330C1410 790 1390 610 1450 610"/>
    <path id="conn-direct-draw" class="trace" d="M590 610C650 610 630 790 710 790H1330C1410 790 1390 610 1450 610"/>
    <rect x="585" y="592" width="34" height="36" rx="6" fill="#A9BBC9"/>
    <rect x="1421" y="592" width="34" height="36" rx="6" fill="#A9BBC9"/>
   </g>
   <g id="conn-laptop" class="part">
    <rect class="body" x="240" y="430" width="350" height="228" rx="8"/>
    <rect class="dark" x="254" y="444" width="322" height="197" rx="3"/>
    <path class="body" d="M240 658H590L625 696H205Z"/>
    <path d="M370 658H460L475 672H355Z" fill="#A9BBC9"/>
    <rect x="582" y="592" width="12" height="36" rx="3" fill="#66DBEC"/>
    <path class="outline" d="M272 682H558"/>
    <g id="conn-received" opacity="0"><rect x="281" y="477" width="83" height="65" rx="4" fill="none" stroke="#66DBEC" stroke-width="3"/><path d="M281 488H307L315 477" class="outline"/><path d="M300 513L313 526L343 495" class="draw"/></g>
    <g id="conn-screen-files" opacity="0">${fileGlyph(391,480)}${fileGlyph(461,480)}</g>
   </g>
   <g id="conn-hub" class="part">
    <rect class="body" x="1000" y="535" width="220" height="146" rx="8"/>
    <path d="M1016 551H1204V665H1016Z" fill="#0B1728"/>
    <rect x="997" y="592" width="10" height="36" rx="2" fill="#66DBEC"/>
    <rect x="1213" y="592" width="10" height="36" rx="2" fill="#66DBEC"/>
    <rect x="1036" y="568" width="42" height="19" rx="2" fill="none" stroke="#A9BBC9" stroke-width="3"/>
    <rect x="1090" y="568" width="42" height="19" rx="2" fill="none" stroke="#A9BBC9" stroke-width="3"/>
    <rect x="1144" y="568" width="42" height="19" rx="2" fill="none" stroke="#A9BBC9" stroke-width="3"/>
    <path d="M1038 625H1180" stroke="#66DBEC" stroke-width="3" stroke-dasharray="5 8"/>
   </g>
   <g id="conn-hub-focus" opacity="0"><rect x="980" y="515" width="260" height="186" rx="8" fill="none" stroke="#66DBEC" stroke-width="4"/><path d="M1110 508V460" class="draw"/></g>
   <g id="conn-drive" class="part">
    <path class="body" d="M1450 438L1467 420H1673L1690 438V698L1673 716H1467L1450 698Z"/>
    <rect x="1465" y="436" width="210" height="264" rx="8" fill="#0B1728"/>
    <path d="M1478 448H1661M1478 686H1661" class="outline" data-layout-ignore="chassis seam, not a connector"/>
    <rect x="1446" y="592" width="11" height="36" rx="4" fill="#66DBEC"/>
    <rect x="1515" y="469" width="110" height="74" rx="8" fill="#EFEBDD"/>
    <path d="M1535 490H1605M1535 508H1580" fill="none" stroke="#0B1728" stroke-width="5" stroke-linecap="round"/>
    <circle id="conn-drive-led" cx="1570" cy="657" r="6" fill="#66DBEC"/>
    <g id="conn-drive-files">${fileGlyph(1507,559)}${fileGlyph(1579,559)}</g>
   </g>
   <g id="conn-traffic-old">
    <path id="conn-beam-in" class="signal" d="M1450 610H1220"/>
    <path id="conn-beam-out" class="signal" d="M1000 610H590"/>
    <g id="conn-queue" opacity="0">${[0,1,2,3,4].map(i=>`<rect x="${1255+i*29}" y="600" width="18" height="20" rx="3" fill="#66DBEC"/>`).join('')}</g>
   </g>
   <path id="conn-beam-direct" class="signal" d="M1450 610C1390 610 1410 790 1330 790H710C630 790 650 610 590 610"/>
  </svg>
  <div id="conn-spec-port" class="conn-spec"><p>Laptop port</p><strong>10 Gb/s</strong></div>
  <div id="conn-spec-cable" class="conn-spec"><p>Rated cable</p><strong>10 Gb/s</strong></div>
  <div id="conn-spec-hub" class="conn-spec"><p>USB 2.0 hub</p><strong>480 Mb/s</strong></div>
  <div id="conn-spec-drive" class="conn-spec"><p>External SSD</p><strong>10 Gb/s</strong></div>
  <p id="conn-label-port">Computer</p><p id="conn-label-hub">Hub</p><p id="conn-label-drive">External SSD</p>
  <div id="conn-safety"><svg viewBox="0 0 64 64" aria-hidden="true"><path id="conn-eject-triangle" d="M12 38L32 13L52 38Z" fill="none" stroke="#66DBEC" stroke-width="4" stroke-linejoin="round"/><path id="conn-eject-base" d="M12 48H52" fill="none" stroke="#66DBEC" stroke-width="4" stroke-linecap="round"/></svg><span>Eject safely</span></div>
  <div id="conn-before"><p>Original path · hub included</p><svg viewBox="0 0 640 90" aria-hidden="true"><rect x="0" y="20" width="110" height="48" rx="8" fill="none" stroke="#A9BBC9" stroke-width="3"/><path d="M110 44H270M380 44H525" fill="none" stroke="#A9BBC9" stroke-width="5"/><rect x="270" y="19" width="110" height="50" rx="8" fill="none" stroke="#A9BBC9" stroke-width="3"/><rect x="525" y="8" width="68" height="72" rx="8" fill="none" stroke="#A9BBC9" stroke-width="3"/></svg></div>
  <div id="conn-control"><p><strong>Hub removed</strong></p><p>Everything else unchanged</p></div>
 </div>
 ${htmlNotes}
 <p id="conn-truth">Schematic illustration · supported signaling rates, not measured file-copy speeds</p>
 </div>
</div>
<script>
(()=>{
 const tl=gsap.timeline({paused:true});
 const show=(s,t,d=.5,from={y:12})=>tl.fromTo(s,{opacity:0,...from},{opacity:1,y:0,x:0,scale:1,duration:d,ease:'power3.out'},t);
 const hide=(s,t,d=.25)=>tl.to(s,{opacity:0,duration:d,ease:'power1.in'},t);
 const titles=${JSON.stringify(headers.map((h,i)=>({s:h[0],e:h[1],id:'#conn-title-'+i})))};
 titles.forEach((h,i)=>{if(i===0)tl.set(h.id,{opacity:1,y:0},0);else show(h.id,h.s,.45,{y:9});if(i<titles.length-1)hide(h.id,h.e-.25,.2)});
 const notes=${JSON.stringify(notes.map((h,i)=>({s:h[0],e:h[1],id:'#conn-note-'+i})))};
 notes.forEach((h,i)=>{show(h.id,h.s+.22,.35,{y:7});if(i<notes.length-1)hide(h.id,h.e-.18,.16)});
 show('#conn-truth',.8,.7,{y:0});
 tl.fromTo('#conn-drive',{opacity:0,x:-535},{opacity:1,x:-500,duration:.65,ease:'power3.out'},.2);
 tl.to('#conn-drive',{x:0,duration:1.1,ease:'power2.inOut'},14.19);
 show('#conn-laptop',3.0,.65,{x:-35,y:0});
 show('#conn-label-port',3.4,.35,{y:0});show('#conn-label-drive',14.7,.45,{y:0});
 show('#conn-hub',27.9,.65,{y:25});show('#conn-label-hub',28.2,.4,{y:0});
 show('#conn-old-wires',27.8,.5,{y:0});
 const draw=(id,t,d)=>{const p=document.querySelector(id),n=p.getTotalLength();p.style.strokeDasharray=String(n);p.style.strokeDashoffset=String(n);tl.to(p,{strokeDashoffset:0,duration:d,ease:'none'},t)};
 draw('#conn-draw-left',28.1,1.2);draw('#conn-draw-right',29.05,.8);
 show('#conn-spec-drive',20.39,.55,{y:16});show('#conn-spec-port',23.0,.45,{y:12});show('#conn-spec-cable',25.3,.55,{y:10});show('#conn-spec-hub',32.13,.7,{y:15});
 // Registry tracing-beam's measured dash travel, adapted to a hardware route;
 // omit its generic UI, glow and ambient lift. The actual path owns the dash.
 const trace=(id,at,travel,repeat=0,gap=.5)=>{const p=document.querySelector(id),n=p.getTotalLength(),dash=Math.min(76,n*.23);p.style.strokeDasharray=dash+' '+n;tl.fromTo(p,{opacity:0,strokeDashoffset:dash},{opacity:1,strokeDashoffset:-n,duration:travel,ease:'none',repeat,repeatDelay:gap,immediateRender:false},at);hide(id,at+(repeat+1)*travel+repeat*gap,.15)};
 trace('#conn-beam-in',33.3,1.6,10,.5);trace('#conn-beam-out',34.9,3.0,5,.8);
 show('#conn-queue',43.15,.6,{x:16,y:0});
 show('#conn-hub-focus',40.2,.5,{y:0});
 tl.fromTo('#conn-hub-focus',{scale:1},{scale:1.025,transformOrigin:'1110px 608px',duration:1.2,yoyo:true,repeat:1,ease:'sine.inOut',immediateRender:false},43.15);
 hide('#conn-traffic-old',57.39,.2);hide('#conn-queue',57.39,.2);hide('#conn-hub-focus',57.39,.25);
 tl.to('#conn-drive-led',{opacity:.3,duration:.25,ease:'power1.out'},57.39);
 show('#conn-safety',64.87,.5,{y:15});draw('#conn-eject-triangle',65.0,.75);draw('#conn-eject-base',65.65,.4);
 hide('#conn-safety',72.17,.3);
 tl.to('#conn-hub',{y:-78,opacity:0,duration:.8,ease:'power2.inOut'},72.4);
 hide('#conn-spec-hub',72.17,.4);hide('#conn-label-hub',72.17,.4);hide('#conn-old-wires',72.4,.55);
 show('#conn-direct',76.87,.35,{y:0});draw('#conn-direct-wire',76.87,1.9);draw('#conn-direct-draw',77.07,1.9);
 tl.to('#conn-spec-cable',{x:65,y:200,duration:.9,ease:'power2.inOut'},77.1);
 hide('#conn-spec-cable',84.9,.35);
 show('#conn-control',85.69,.6,{y:10});
 trace('#conn-beam-direct',96.21,2.5,6,.35);
 show('#conn-received',99,.5,{y:0});show('#conn-screen-files',100.6,.6,{x:14,y:0});
 tl.to('#conn-drive-led',{opacity:1,duration:.3,ease:'power1.out'},96.21);
 show('#conn-before',96.21,.6,{y:-12});
 // Intentional final hold: keep the finished direct connection on screen.
 window.__timelines=window.__timelines||{};window.__timelines['usb-connection']=tl;
})();
</script>
</template></body></html>`;

await writeFile('compositions/connection.html',graphic);
await writeFile('index.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>USB — Follow the Connection</title><script src="assets/gsap.min.js"></script><style>@font-face{font-family:Geist;src:url('assets/Geist-Variable.woff2') format('woff2');font-weight:100 900}html,body{margin:0;width:100%;height:100%;background:#0B1728}#root{position:relative;width:100%;height:100%;overflow:hidden;background:#0B1728}.clip{position:absolute;inset:0;width:100%;height:100%}</style></head><body><div id="root" data-composition-id="usb-motion-sample" data-width="1920" data-height="1080" data-fps="30" data-duration="${D}"><div id="connection" class="clip" data-composition-id="usb-connection" data-composition-src="compositions/connection.html" data-start="0" data-duration="${D}" data-width="1920" data-height="1080" data-track-kind="graphics" data-track-index="1"></div><audio id="lesson-voice" src="assets/usb-lesson-voice.wav" data-start="0" data-duration="${D}" data-volume="1" data-track-index="10"></audio></div><script>window.__timelines=window.__timelines||{};window.__timelines['usb-motion-sample']=gsap.timeline({paused:true});</script></body></html>`);
await writeFile('compositions/connection.motion.json',JSON.stringify({duration:D,assertions:[
 {kind:'appearsBy',selector:'#conn-drive',bySec:1},
 {kind:'appearsBy',selector:'#conn-spec-hub',bySec:33},
 {kind:'appearsBy',selector:'#conn-hub-focus',bySec:41},
 {kind:'appearsBy',selector:'#conn-safety',bySec:66},
 {kind:'appearsBy',selector:'#conn-direct',bySec:79},
 {kind:'appearsBy',selector:'#conn-before',bySec:98},
 {kind:'appearsBy',selector:'#conn-title-6',bySec:113},
 {kind:'staysInFrame',selector:'.conn-title'},
 {kind:'staysInFrame',selector:'.conn-note'},
]},null,2));
await writeFile('evidence/sample-timing.json',JSON.stringify({duration:D,editedMasterStart:790.6,editedMasterEnd:912,proxySourceStart:803.8,proxySourceEnd:925.2,headers,notes,proofTimes,originalVoice:true,syntheticVoice:false,externalModelCalls:0,graphics:'illustrative schematics, not measured traffic',directListening:false,voiceSha256:createHash('sha256').update(await readFile('assets/usb-lesson-voice.wav')).digest('hex')},null,2));
console.log(JSON.stringify({duration:D,phases:headers.length,proofTimes}));
