/** Plain executable native recipe bodies, inserted inside the generated Project closure. */
export const libraryRecipeCode = `
  function appendLibraryMoment(b) {
    const c=b.settings, duration=b.end-b.start, animated=data.motion!=="reduced";
    const box={x:m,y:p?550:350,width:inner,height:p?1120:600,start:b.start,end:b.end};
    const common={...box,theme,animate:animated,fontSize:p?40:32};
    const docTheme={background:theme.background,surface:theme.surface,text:theme.text,muted:theme.muted,accent:theme.accent,fontFamily:theme.fontFamily};
    if(b.id==="counter-reveal") {
      nodes.push(CounterReveal({...box,...c,key:b.id+"/counter",name:"Editable counter reveal",fontFamily:theme.fontFamily,animate:animated}));
    } else if(b.id==="milestone-badge") {
      nodes.push(MilestoneBadge({...box,...c,key:b.id+"/badge",name:"Editable milestone badge",fontFamily:c.fontFamily??theme.fontFamily,animate:animated}));
    } else if(b.id==="assemble-title") {
      const assembly={...c};if(assembly.subtitle===null)delete assembly.subtitle;
      nodes.push(AssembleTitle({...box,y:p?650:430,height:p?650:420,color:theme.text,subtitleColor:theme.muted,...assembly,key:b.id+"/assembly",name:"Editable assembled title",fontFamily:c.fontFamily??theme.fontFamily,animate:animated}));
    } else if(b.id==="concept-link") {
      nodes.push(ConceptLink({...box,...c,key:b.id+"/concept",name:"Editable concept link",fontFamily:c.fontFamily??theme.fontFamily,animate:animated}));
    } else if(b.id.startsWith("background-")) {
      nodes.push(label(b.id+"/context",b.body,{x:m,y:p?1050:600,width:inner,height:p?300:190},p?44:38,b.start,b.end));
    } else if(b.id.startsWith("caption-")) {
      nodes.push(Rect({name:"Caption demonstration area",x:m,y:p?600:360,width:inner,height:p?720:300,fill:theme.surface,start:b.start,end:b.end}));
      nodes.push(label("Caption demonstration notice","AUTHORED CAPTION DEMO / NO AUDIO",{x:m+30,y:p?700:430,width:inner-60,height:160},p?32:28,b.start,b.end));
      nodes.push(label("Caption guidance",b.body,{x:m+30,y:p?900:540,width:inner-60,height:p?220:100},p?40:30,b.start,b.end));
      nodes.push(CaptionTrack({cues:c.cues,start:b.start,duration,preset:b.id==="caption-highlight"?"karaoke":"boxed",canvasWidth:w,canvasHeight:h,fontSize:p?48:40,maxLines:2,textColor:"#FFFFFF",highlightColor:"#FDD568",backgroundColor:"#101C2B",backgroundOpacity:.94}));
    } else if(b.id==="chart-bars") {
      nodes.push(DataBars({...common,...c}));
    } else if(b.id==="chart-trend") {
      nodes.push(TrendLine({...common,...c,animate:false}));
    } else if(b.id==="metric-card") {
      nodes.push(MetricCard({...common,...c,fontSize:32}));
    } else if(b.id.startsWith("effect-")) {
      const effects=b.id==="effect-film"?createLook("documentary",{strength:c.strength,seed:c.seed}).map(effect=>!animated&&effect.kind==="grain"?grain({...effect.params,speed:0}):effect):[duotone({dark:"#10394B",light:"#F8D58A",amount:c.strength})];
      const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#356F85"/><rect x="130" y="110" width="670" height="520" rx="16" fill="#D58A5B" transform="rotate(8 465 370)"/><rect x="650" y="310" width="380" height="400" rx="16" fill="#EBCC85" transform="rotate(-8 840 510)"/></svg>';
      nodes.push(Image({name:"Treated original artwork",...box,src:"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg),objectFit:"cover",children:Effects({effects})}));
    } else if(b.id==="layout-compare") {
      nodes.push(PanelLayout({...common,direction:p?"stack":"columns",gap:p?40:48,padding:0,
        first:slot=>StoryBeatCard({...slot,theme,animate:animated,fontSize:p?36:34,title:c.firstTitle,body:c.firstBody,minHold:3}),
        second:slot=>StoryBeatCard({...slot,theme,animate:animated,fontSize:p?36:34,title:c.secondTitle,body:c.secondBody,minHold:3})}));
    } else if(b.id==="map-compare") {
      if(p) {
        [c.first,c.second].forEach((points,index)=>nodes.push(MapRoute({...box,start:b.start+index*duration/2,end:undefined,duration:duration/2,revealDuration:animated?2:"1f",points,bounds:c.bounds,title:index?c.secondLabel:c.firstLabel,credits:"Authored route comparison"})));
      } else {
        [c.first,c.second].forEach((points,index)=>nodes.push(MapRoute({x:m+index*(inner/2+24),y:350,width:inner/2-24,height:600,start:b.start,duration,revealDuration:animated?3:"1f",points,bounds:c.bounds,title:index?c.secondLabel:c.firstLabel,credits:"Authored route comparison"})));
      }
    } else if(b.id==="overlay-name") {
      nodes.push(Rect({name:"Unobscured demonstration area",x:m,y:p?560:360,width:inner,height:p?650:280,fill:theme.surface,start:b.start,end:b.end}));
      nodes.push(label("Overlay protected context","YOUR FOOTAGE / KEEP THE ACTION VISIBLE",{x:m+28,y:p?680:430,width:inner-56,height:180},p?32:28,b.start,b.end));
      nodes.push(LowerThird({x:m,y:p?1280:700,width:inner,height:p?340:230,start:b.start,end:b.end,fontSize:p?40:40,theme:docTheme,name:c.name,role:c.role}));
    } else if(b.id==="overlay-source") {
      nodes.push(SourceCard({...box,height:p?900:590,fontSize:p?40:34,theme:docTheme,...c}));
    } else if(b.id==="story-quote") {
      nodes.push(QuoteCard({...box,height:p?1000:590,fontSize:p?40:38,theme:docTheme,...c}));
    } else if(b.id==="story-chapters") {
      if(p) c.events.forEach((event,index)=>nodes.push(StoryBeatCard({...box,start:b.start+index*duration/c.events.length,end:b.start+(index+1)*duration/c.events.length,fontSize:44,theme,animate:false,eyebrow:event.date+" / "+c.events.length,title:event.title,body:event.detail||"Follow the authored structure.",minHold:1})));
      else {
        const active=createMemo(()=>Math.min(c.events.length-1,Math.max(0,Math.floor((ticker.time()-b.start)/duration*c.events.length))));
        nodes.push(Timeline({...box,fontSize:36,theme:docTheme,events:c.events,title:"Authored story structure",get activeIndex(){return active();}}));
      }
    } else if(b.id==="story-turn") {
      c.beats.forEach((beat,index)=>nodes.push(StoryBeatCard({...box,start:b.start+index*duration/3,end:b.start+(index+1)*duration/3,fontSize:p?44:40,theme,animate:animated,title:beat.title,body:beat.body,eyebrow:String(index+1)+" / 3",minHold:2.5})));
    } else if(b.id==="text-reveal" || b.id==="text-emphasis") {
      nodes.push(KineticText({...box,y:p?740:430,height:p?800:480,fontSize:p?64:78,theme,text:c.text,emphasisWords:c.emphasisWords,revealDuration:2,minHold:3,animate:animated&&b.id==="text-reveal"}));
    } else throw new Error("Unsupported native moment: "+b.id);
  }
`;
