'use strict';
const {PALETTES,KOI_SIZE,SEASONS,POND_MAP,weatherFromCode,seasonFromMonth,clamp,createFish,PondSimulation,sanitizeSave,randomSeed,koiAge}=PondCore;
const $=s=>document.querySelector(s);
// Object.hasOwn is Chrome 93; the pond still runs on WebViews older than that, so ownership is asked
// the long way round.
const has=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
// A koi's temperament, shown next to its name on the appetite board (see TEMPER_TRAITS in core.js).
const TEMPER_LABEL={greedy:'贪',timid:'怯',loner:'独',tame:'亲'};
const TEMPER_NAME={greedy:'贪吃 · 总第一个冲到食',timid:'胆小 · 一点动静就躲开',loner:'独行 · 喜欢自己待着',tame:'亲人 · 爱凑在鱼群里'};
const AGE_NAME={young:'幼鱼 · 刚来不久，还在熟悉水草',adult:'成鱼 · 正是自在的时候',old:'老鱼 · 陪你很久了，游得比从前慢一点'};
const ICONS={
  fish:'M3 12c4-7 11-8 16-3l3-4v14l-3-4C14 20 7 19 3 12Z M8 11h.01 M13 6l-2-3 M13 18l-2 3',
  feed:'M5 13c0 5 3 8 7 8s7-3 7-8H5Z M3 13h18 M9 3v2 M15 5v2 M12 8v1',
  trophy:'M8 3h8v7a4 4 0 0 1-8 0V3Z M8 5H4v3a4 4 0 0 0 4 4 M16 5h4v3a4 4 0 0 1-4 4 M12 14v6 M8 21h8',
  sun:'M12 3V1 M12 23v-2 M3 12H1 M23 12h-2 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2 M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  cloudy:'M7 18a5 5 0 1 1 1-10 6 6 0 0 1 11 3 3.5 3.5 0 0 1 0 7H7Z',
  rain:'M5 15a4 4 0 0 1 1-8 6 6 0 0 1 11 1 4 4 0 0 1 2 7 M7 18l-1 3 M12 17l-1 3 M17 18l-1 3',
  snow:'M12 2v20 M3 7l18 10 M3 17 21 7 M9 4l3 3 3-3 M9 20l3-3 3 3 M3 10l4-1 1-4 M16 19l1-4 4-1 M3 14l4 1 1 4 M16 5l1 4 4 1',
  moon:'M20 14a8.5 8.5 0 1 1-10-11 7 7 0 0 0 10 11Z',
  sliders:'M5 3v4 M5 11v10 M12 3v10 M12 17v4 M19 3v3 M19 10v11 M2 7h6v4H2V7Z M9 13h6v4H9v-4Z M16 6h6v4h-6V6Z',
  'sound-off':'M11 4 5 9H2v6h3l6 5V4Z M16 9l6 6 M22 9l-6 6',
  sound:'M11 4 5 9H2v6h3l6 5V4Z M15 8a6 6 0 0 1 0 8 M18 5a10 10 0 0 1 0 14',
  expand:'M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5',
  collapse:'M3 8h5V3 M21 8h-5V3 M16 21v-5h5 M8 21v-5H3',
  // The folded card's way back out: it points the way the card unfolds, down and to the left.
  'chevron-down':'M5 9l7 7 7-7',
  // Immersive: a frame with a ripple in it — the pond, with everything else put away.
  zen:'M3 5h18v14H3z M6.6 12.5c2.3-2.3 4.8 2.3 7.1 0s3.9-2.3 5.6-.7',
  close:'M6 6l12 12 M18 6 6 18'
};
const icon=n=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n]||ICONS.sun}"/></svg>`;
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));}
icons();
let saved=null;try{saved=sanitizeSave(JSON.parse(localStorage.getItem('bichi-pond-v1')??localStorage.getItem('xitan-pond-v1')??localStorage.getItem('bitan-pond-v1')));}catch{}
const defaults={season:'spring',weather:'sunny',speed:1,turtles:true,crabs:true,butterflies:true,names:false,chat:false,quality:'high',displayMode:'auto',screenMode:'single',screenModeSet:false,autoWeather:false,location:null,night:false,feedMode:true,...PondAudio.NATURE_DEFAULTS,rainAmount:.5,snowAmount:.5,soundOn:false,cardCollapsed:false};
const settings={...defaults};
// Copy valid values from a stored settings object (this page's save, or one written by another window).
function readSettings(src){for(const key of ['turtles','crabs','butterflies','names','chat','autoWeather','night','feedMode','sfx','water','weatherSound','soundOn'])if(typeof src[key]==='boolean')settings[key]=src[key];
  if(typeof src.cardCollapsed==='boolean')settings.cardCollapsed=src.cardCollapsed;
  if(PondAudio.MUSIC.includes(src.music))settings.music=src.music;if(PondAudio.WATERS.includes(src.waterType))settings.waterType=src.waterType;for(const key of ['volume','waterVol','weatherVol','musicVol','rainAmount','snowAmount'])if(Number.isFinite(src[key]))settings[key]=clamp(src[key],0,1);
  if(['sunny','cloudy','rain','snow'].includes(src.weather))settings.weather=src.weather;
  if(has(SEASONS,src.season))settings.season=src.season;
  settings.speed=clamp(Number(src.speed)||1,.3,2);
  if(['high','eco'].includes(src.quality))settings.quality=src.quality;
  if(['auto','dual','portrait'].includes(src.displayMode))settings.displayMode=src.displayMode;
  // Only a person's own pick beats the default: older saves carry the previous default ("multi")
  // without this marker, and should start on the new default instead of staying multi-screen.
  if(src.screenModeSet===true){settings.screenModeSet=true;if(['single','multi','shared'].includes(src.screenMode))settings.screenMode=src.screenMode;}
  const l=src.location;if(l&&typeof l.name==='string'&&Number.isFinite(l.latitude)&&Number.isFinite(l.longitude))settings.location={name:l.name.slice(0,80),latitude:clamp(l.latitude,-90,90),longitude:clamp(l.longitude,-180,180)};
  PondAudio.applyNaturePreset(settings,src);
}
if(saved)readSettings(saved.settings);
// Local sunrise and sunset for the chosen city, so the pond can follow the real evening.
let sunTimes = null, autoNightState = null;
const TWILIGHT = 40 * 60 * 1000; // the whole dusk (or dawn) blend, centred on the event
function twilightNightK(now = Date.now()) {
  if (!settings.autoWeather || !sunTimes) return settings.night ? 1 : 0;
  const half = TWILIGHT / 2, { rise, set } = sunTimes;
  if (now < rise + half) return clamp((rise + half - now) / TWILIGHT, 0, 1);
  if (now < set - half) return 0;
  if (now < set + half) return clamp((now - (set - half)) / TWILIGHT, 0, 1);
  return 1;
}
// The manual 月下观鱼 switch keeps working; only a real sunset or sunrise overrides it, so following
// a city does not fight the person tapping the checkbox in between.
function syncAutoNight(now = Date.now()) {
  if (!settings.autoWeather || !settings.location || !sunTimes) { autoNightState = null; return; }
  const state = now < sunTimes.rise || now >= sunTimes.set;
  if (state === autoNightState) return;
  autoNightState = state;
  if (settings.night === state) return;
  settings.night = state;
  applyWeather();
  // Tick the checkbox in place instead of redrawing the panel, so a half-typed city name survives.
  if (activePanel === 'weather') { const box = $('#night'); if (box) box.checked = state; updateWeatherInfo(); }
  persist();
}
function dayKey(){return new Date().toLocaleDateString('en-CA');}
let daily=saved?.daily?.date===dayKey()?{date:dayKey(),count:clamp(Number(saved.daily.count)||0,0,999999)}:{date:dayKey(),count:0};
// Resolve the page role before allocating artwork, audio or canvases.
const pageMode=new URLSearchParams(location.search).get('mode');
const wallpaperMode=pageMode==='wallpaper';
const cornerMode=pageMode==='corner';
const panelMode=pageMode==='panel';
const desktopHost=!!window.chrome?.webview||!!window.webkit?.messageHandlers?.pond;
const lightBackdrops=wallpaperMode||cornerMode||matchMedia('(pointer: coarse)').matches;
// Only the desktop corner page gets a CPU cache budget; Android's existing policy is unchanged.
const budgetBackdrops=cornerMode&&!!window.chrome?.webview;
const BACKGROUND_BUDGET=64*1024*1024;
if(wallpaperMode)document.body.classList.add('wallpaper');
if(panelMode)document.body.classList.add('panel-only');
const prefersReduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
if(prefersReduced&&!saved){settings.speed=.4;settings.quality='eco';document.body.classList.add('reduced-motion');}
// A first visit gets the same 24 koi in every window that opens at once (each desktop screen, say), so they agree from the start.
const fish=saved?.fish||Array.from({length:24},(_,i)=>({...createFish(i,randomSeed(i*7+3)),id:`koi-${i+1}`}));
const sound=new PondAudio.PondAudio();sound.configure(settings);
let canvas=$('#world');const labels=$('#labels');let labelCtx=null;
const simulation=new PondSimulation(fish,innerWidth,innerHeight,Math.random);
let width=innerWidth,height=innerHeight,dpr=1,feedMode=settings.feedMode,zen=false,paused=!!window.__pondDesiredPaused,activePanel='',last=0,time=0,lastFrame=0,hostFps=60;
let previewFish=null,previewCanvas=null,previewSprite=null,previewKey='',weatherData=null,toastTimer=0,persistTimer=0,weatherRequest=0,citySearchController=null,compareWith=null;
let renderer=null,scene=null,bedImage=null,force2D=false,pondFrameReady=false;
const sprites=PondArt.miscSprites(panelMode),spriteCache=new Map(),PREVIEW_K=4.6;
let backgroundSeason=null,pendingSeason=null,seasonRequest=0,lotusArtworkReady=false;
const backgroundCache=new Map();
const backgroundMasks=new Map();
const backgroundSizes=new Map();
function trimBackgroundCache(){
  if(!budgetBackdrops)return;
  let bytes=0;
  for(const [season,size] of backgroundSizes){const mask=backgroundMasks.get(season);bytes+=size+(mask?mask.width*mask.height*4:0);}
  // Current and in-flight selected seasons are pinned. The temporary two-season switch peak is intentional.
  for(const season of backgroundCache.keys()){
    if(season===backgroundSeason||season===pendingSeason)continue;
    if(bytes<=BACKGROUND_BUDGET&&backgroundSizes.has(season))continue;
    const mask=backgroundMasks.get(season);
    bytes-=(backgroundSizes.get(season)||0)+(mask?mask.width*mask.height*4:0);
    backgroundCache.delete(season);backgroundSizes.delete(season);backgroundMasks.delete(season);
    if(mask){mask.width=mask.height=1;}
  }
}
let backgroundWarmGeneration=0;
function backgroundMask(season,image){
  if(!backgroundMasks.has(season))backgroundMasks.set(season,PondScene.floatMask(image.naturalWidth,image.naturalHeight,season,image));
  return backgroundMasks.get(season);
}
const inIdle=job=>window.requestIdleCallback?requestIdleCallback(job,{timeout:1500}):setTimeout(job,120);
function warmBackgrounds(){
  if(lightBackdrops||panelMode)return;
  const generation=++backgroundWarmGeneration;
  const remaining=Object.keys(SEASONS).filter(s=>s!==backgroundSeason);
  const next=()=>inIdle(async()=>{
    if(generation!==backgroundWarmGeneration||!remaining.length)return;
    if(document.hidden||paused){next();return;}
    const season=remaining.shift();
    try{
      const image=await loadBackground(season);
      inIdle(()=>{
        if(generation!==backgroundWarmGeneration)return;
        if(document.hidden||paused){remaining.unshift(season);next();return;}
        renderer?.prepareBackground(image,backgroundMask(season,image));next();
      });
    }catch{next();}
  });
  next();
}
// Several pages can share one pond (the desktop wallpaper on each screen plus its interactive window, the Android
// wallpaper and its app, or browser tabs); each host passes a page's saves to the others (see __pondSync).
// rev stamps the last change a person made (settings, names, fish added or let go); eating only bumps counts, which merge.
const editSignature=()=>JSON.stringify([settings,simulation.fish.map(f=>[f.id,f.name,f.palette,f.size,f.seed,marksHash(f.marks)])]);
let rev=Number(saved?.rev)||0,editSig=editSignature();
function persist(){const sig=editSignature();if(sig!==editSig)rev=Date.now();editSig=sig;
  // Who each koi swims beside is only known to a running pond; record it so a panel can show it too.
  if(simulation.bonds&&simulation.bonds.size)for(const f of simulation.fish){const b=simulation.bestFriend(f);f.friend=b?b.id:null;}
  // Pellets eaten since the last save go into today's tally; only the last seven days are kept.
  if(simulation.dayEaten){
    if(!daily.eaten)daily.eaten={};
    const today=dayKey();
    daily.eaten[today]=(daily.eaten[today]||0)+simulation.dayEaten;
    simulation.dayEaten=0;
    const keys=Object.keys(daily.eaten).sort().slice(-7),trim={};
    for(const k of keys)trim[k]=daily.eaten[k];
    daily.eaten=trim;
  }
  const data=JSON.stringify({rev,fish:simulation.fish.map(({id,name,palette,temper,size,baseSize,growthBase,born,lastMeal,friend,seed,eaten,marks})=>({id,name,palette,temper,size,baseSize,growthBase,born,lastMeal,friend,seed,eaten,marks})),settings,daily});
  try{localStorage.setItem('bichi-pond-v1',data);}catch{toast('浏览器暂时无法保存，下次打开可能无法恢复记录');}
  try{window.webkit?.messageHandlers?.pond?.postMessage(data);}catch{}try{window.PondHost?.postMessage(data);}catch{}try{window.chrome?.webview?.postMessage(data);}catch{}}
// Take in a save written by another page: its settings and collection if its edit is newer, and the larger meal counts either way.
function applyExternalSave(raw){let data;try{data=JSON.parse(raw);}catch{return;}const s=sanitizeSave(data);if(!s)return;
  const newer=(Number(data.rev)||0)>rev,byId=new Map(simulation.fish.map(f=>[f.id,f]));
  if(s.daily?.date===daily.date)daily.count=Math.max(daily.count,clamp(Number(s.daily.count)||0,0,999999));
  if(newer){rev=Number(data.rev);const quality=settings.quality,auto=settings.autoWeather;readSettings(s.settings);setFeedMode(settings.feedMode);
    const next=s.fish.map(src=>{const f=byId.get(src.id);if(!f)return src;const look=f.palette!==src.palette||f.seed!==src.seed||f.size!==src.size||marksHash(f.marks)!==marksHash(src.marks);
      Object.assign(f,{name:src.name,palette:src.palette,size:src.size,baseSize:src.baseSize,growthBase:src.growthBase||0,seed:src.seed,marks:src.marks,friend:src.friend,eaten:Math.max(f.eaten,src.eaten)});if(look)f.spriteReady=false;return f;});
    for(const f of simulation.fish)if(!next.includes(f)&&scene){scene.drop(f.x*width,f.y*height,12*scene.scale,.8);scene.wakes.delete(f);}
    simulation.fish.splice(0,simulation.fish.length,...next);simulation.fish.forEach((f,i)=>{if(f.spriteCell!==i)f.spriteReady=false;});uploadSprites();
    if(settings.quality!==quality)resize();applyWeather();if(settings.autoWeather&&!auto)fetchWeather();syncSound();
  }else for(const src of s.fish){const f=byId.get(src.id);if(f)f.eaten=Math.max(f.eaten,src.eaten);}
  editSig=editSignature();updateMeta();if(panelMode&&activePanel==='fish'&&$('#fish-grid'))renderCollection();}
window.__pondSync=applyExternalSave;
addEventListener('storage',e=>{if(e.key==='bichi-pond-v1'&&e.newValue)applyExternalSave(e.newValue);});
function scheduleSave(){clearTimeout(persistTimer);persistTimer=setTimeout(persist,500);}
function toast(message){
  // A toast from inside the panel belongs in the panel: in the Windows panel window the pond (and its
  // #toast) is hidden, which made "restored" or "nothing to restore" look like a dead button.
  const panelOpen=!!document.querySelector('#panel')?.open;
  const el=document.querySelector(panelOpen?'#panel-toast':'#toast')||document.querySelector('#toast');
  const other=document.querySelector(panelOpen?'#toast':'#panel-toast');
  if(other)other.classList.remove('visible');
  if(!el)return;
  el.textContent=message;el.classList.add('visible');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3200);
}
// Draw at the screen's full pixel density (phones are 2.5–3.5×; the canvas size cap in the renderer keeps big
// desktop screens in check). A device that cannot keep up steps down in two stages, never below 1×, for this session.
const perf={t:0,n:0,level:0,scales:[1,.72,.5]};
const targetFps=()=>Math.min(hostFps,settings.quality==='eco'?30:60);
function syncBackdrop(){
  const bed=$('.pond-bed');
  if(!renderer){
    for(const key of ['width','height','transform','transformOrigin','backgroundSize'])bed.style[key]='';
    return;
  }
  // Match the CSS painting to the renderer, including its portrait turn/crop.
  const W=POND_MAP.width,H=POND_MAP.height,o=renderer.imageToScreen(0,0);
  const x=renderer.imageToScreen(W,0),y=renderer.imageToScreen(0,H);
  Object.assign(bed.style,{width:`${W}px`,height:`${H}px`,backgroundSize:'100% 100%',transformOrigin:'0 0',
    transform:`matrix(${(x[0]-o[0])/W},${(x[1]-o[1])/W},${(y[0]-o[0])/H},${(y[1]-o[1])/H},${o[0]},${o[1]})`});
}
let resizeHandle=0,layoutKey='',layoutRenderer=null;
function syncLabelCanvas(active=!panelMode&&(settings.names||!!scene?.chats?.length)){
  const w=active?Math.max(1,Math.round(width*dpr)):1,h=active?Math.max(1,Math.round(height*dpr)):1;
  if(labels.width!==w)labels.width=w;
  if(labels.height!==h)labels.height=h;
  if(active&&!labelCtx)labelCtx=labels.getContext('2d');
  if(!active)labels.dataset.on='';
  return active;
}
function resize(){
  width=innerWidth;height=innerHeight;dpr=settings.quality==='eco'?1:Math.max(1,Math.min(devicePixelRatio||1,3)*perf.scales[perf.level]);
  simulation.width=width;simulation.height=height;simulation.scale=clamp(Math.min(width,height)/720,.66,1.25);
  syncLabelCanvas();
  if(renderer){
    try{renderer.resize(width,height,dpr,settings.quality,settings.displayMode);}
    catch(error){recoverRenderer(error);return;}
    const key=`${width}:${height}:${settings.displayMode}`;
    if(layoutKey!==key||layoutRenderer!==renderer){layoutKey=key;layoutRenderer=renderer;syncBackdrop();scene.layout(width,height);}
  }
}
function requestResize(){if(resizeHandle)return;resizeHandle=requestAnimationFrame(()=>{resizeHandle=0;resize();});}
addEventListener('resize',requestResize);resize();
// Sprites are keyed by what they depict; pond fish never change after creation, the preview does.
function marksHash(marks){let h=marks?marks.length:0;if(marks)for(const m of marks)h=(h*31+Math.round(m.x*10)*7+Math.round(m.y*10)*13+m.r*17+parseInt(m.color.slice(1),16))|0;return h;}
const spriteKey=f=>`${f.palette}:${f.seed}:${marksHash(f.marks)}`;
function fishCanvas(f){const key=spriteKey(f);let c=spriteCache.get(key);if(!c){c=PondArt.fishSprite(f,PondGL.FISH_PPU);spriteCache.set(key,c);if(spriteCache.size>120)spriteCache.delete(spriteCache.keys().next().value);}return c;}
function uploadSprites(){if(!renderer)return;simulation.fish.forEach((f,i)=>{if(!f.spriteReady||f.spriteCell!==i){renderer.setFish(i,fishCanvas(f));f.spriteReady=true;f.spriteCell=i;}});}
// A few gestures share the water: a tap feeds (or ripples), holding still scatters a handful, dragging a hand
// across the surface leaves a wake and nudges the koi aside, and a right click frightens them off.
function bindCanvas(){
  let press=null,longTimer=0;
  const clearLong=()=>{if(longTimer){clearTimeout(longTimer);longTimer=0;}};
  canvas.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    press={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,drag:false,burst:false};
    try{canvas.setPointerCapture(e.pointerId);}catch{}
    clearLong();
    longTimer=setTimeout(()=>{
      longTimer=0;
      if(!press||press.drag)return;
      press.burst=true;
      // On a firefly night the steady hand lights a lamp instead; every other night it scatters food.
      if(!summonLureAt(press.x,press.y))scatterFeed(press.x,press.y);
    },520);
  });
  canvas.addEventListener('pointermove',e=>{
    if(!press)return;
    if(!press.drag&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>12){press.drag=true;clearLong();}
    if(!press.drag||press.burst)return;
    if(Math.hypot(e.clientX-press.lastX,e.clientY-press.lastY)<26)return;
    press.lastX=e.clientX;press.lastY=e.clientY;
    stirWater(e.clientX,e.clientY);
  });
  const finish=()=>{clearLong();press=null;};
  canvas.addEventListener('pointerup',e=>{
    const p=press;
    clearLong();press=null;
    if(!p||p.burst||p.drag)return;
    feedAt(e.clientX,e.clientY);
  });
  canvas.addEventListener('pointercancel',finish);
  canvas.addEventListener('contextmenu',e=>{e.preventDefault();scareBurst(e.clientX,e.clientY);});
  canvas.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();feedAt(width*.5,height*.5);}});
}
// Holding a finger (or the button) still: scatter food around the spot, or stir up a big ring in watching mode.
function scatterFeed(x,y){
  if(!scene)return;
  scene.glimmer(x,y,1.3);
  if(scene.touchSeasons(x,y)){if(sound.active)sound.tap();return;}
  if(!simulation.isWater(x,y,4))return;
  if(!feedMode){scene.startle(x,y);scene.drop(x,y,16*scene.scale,.9);simulation.scare(x,y,220*scene.scale);sound.tap();return;}
  let fed=0;
  for(let i=0;i<4;i++){
    const a=Math.random()*TAU,r=14+Math.random()*30;
    let px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;
    const q=simulation.habitat&&simulation.habitat.project(px,py,24*scene.scale);
    if(q){px=q[0];py=q[1];}
    if(simulation.feed(px,py,4)){scene.drop(px,py,6*scene.scale,.45);fed++;}
  }
  if(!fed){toast('鱼食还没吃完，让小鱼慢慢享用吧');return;}
  if(daily.date!==dayKey())daily={date:dayKey(),count:0};
  daily.count++;updateMeta();scheduleSave();
  if(sound.active)sound.plop();
  toast('撒了一把鱼食');
}
// A hand dragged through the water: a small wake, and the koi just ahead of it move aside.
function stirWater(x,y){
  if(!scene)return;
  scene.drop(x,y,7*scene.scale,.3);
  scene.glimmer(x,y,.55);
  scene.disturbFlies(x,y,90*scene.scale);
  simulation.scare(x,y,88*scene.scale,.28);
}
// A right click: a wide fright, the fish scatter and drop into deeper water.
function scareBurst(x,y){
  if(!scene)return;
  scene.glimmer(x,y,1.6);
  scene.startle(x,y);
  scene.disturbFlies(x,y,160*scene.scale);
  scene.drop(x,y,14*scene.scale,.8);
  simulation.scare(x,y,240*scene.scale,1.15);
  sound.tap();
}
bindCanvas();
function recoverRenderer(error){
  console.warn('Pond renderer failed',error);
  const old=renderer,wasGL=old?.kind==='webgl2';
  renderer=null;old?.dispose?.();document.body.classList.remove('gl');
  if(wasGL){document.body.classList.add('gl-pending');force2D=true;createPond();}
}
function createPond(){
  if(panelMode)return;
  // 底图统一为 4K，但岸线、荷叶、鱼食和锦鲤都标注在 POND_MAP 的 2560×1440 设计尺度上。
  const source=canvas;
  const next=PondGL.createRenderer(source,bedImage,sprites,()=>{
    if(renderer?.canvas===source)recoverRenderer('WebGL context lost');
  },backgroundMask(backgroundSeason,bedImage),{width:POND_MAP.width,height:POND_MAP.height},force2D);
  renderer=next;
  if(!next){toast('当前浏览器无法绘制池塘');return;}
  if(next.canvas!==canvas){canvas=next.canvas;bindCanvas();}
  document.body.classList.toggle('gl-pending',next.kind==='webgl2');
  if(scene)scene.R=next;else scene=new PondScene.PondScene(next,simulation);
  scene.setNightWindow?.(...(moonWindow()||[]));
  scene.setSeason(backgroundSeason);
  resize();if(renderer!==next)return;
  scene.update(0,settings);scene.setLook(settings.weather,settings.night,undefined,settings,twilightNightK());
  simulation.fish.forEach(f=>f.spriteReady=false);uploadSprites();
  warmBackgrounds();
}
function drawLabels(){
  const chats=scene&&scene.chats&&scene.chats.length?scene.chats:null;
  if(!syncLabelCanvas(!panelMode&&(settings.names||!!chats)))return;
  labels.dataset.on='1';labelCtx.setTransform(dpr,0,0,dpr,0,0);labelCtx.clearRect(0,0,width,height);
  if(settings.names){
    labelCtx.font='11px "PingFang SC","Microsoft YaHei",sans-serif';labelCtx.textAlign='center';labelCtx.textBaseline='alphabetic';labelCtx.lineJoin='round';labelCtx.lineWidth=3;labelCtx.strokeStyle='rgba(34,52,45,.55)';labelCtx.fillStyle='#fbf9ec';
    for(const f of simulation.fish){const x=f.x*width,y=f.y*height-16*f.size*simulation.scale;labelCtx.strokeText(f.name,x,y);labelCtx.fillText(f.name,x,y);}
  }
  if(chats)drawChats(chats);
}
// A small paper bubble above the two koi that happen to be talking.
function drawChats(chats){
  labelCtx.font='10px "PingFang SC","Microsoft YaHei",sans-serif';
  labelCtx.textAlign='center';labelCtx.textBaseline='middle';labelCtx.lineJoin='round';
  for(const c of chats){
    const a=c.a,b=c.b;
    if(!a||!b)continue;
    const x=(a.x+b.x)*.5*width,y=(a.y+b.y)*.5*height-34*simulation.scale;
    const tw=labelCtx.measureText(c.text).width,w=tw+18,h=20;
    labelCtx.beginPath();
    if(labelCtx.roundRect)labelCtx.roundRect(x-w/2,y-h/2,w,h,10);
    else labelCtx.rect(x-w/2,y-h/2,w,h);
    labelCtx.fillStyle='rgba(250,248,236,.9)';labelCtx.fill();
    labelCtx.strokeStyle='rgba(88,110,88,.22)';labelCtx.lineWidth=1;labelCtx.stroke();
    labelCtx.fillStyle='#455840';labelCtx.fillText(c.text,x,y);
  }
}
function drawPreview(dt){
  if(!previewCanvas||!previewFish||!dialog.open)return;
  const c=previewCanvas.getContext('2d'),key=spriteKey(previewFish);c.clearRect(0,0,previewCanvas.width,previewCanvas.height);
  if(key!==previewKey){previewSprite=PondArt.fishSprite(previewFish,5,previewSprite);previewKey=key;}
  if(!previewFish.painting)previewFish.phase+=dt*4.2;
  PondScene.drawKoi2D(c,previewFish,previewSprite,sprites,previewCanvas.width*.53,previewCanvas.height*.5,0,previewFish.size*PREVIEW_K,previewFish.painting?0:.5);
}
// One animation loop for the page. It is started separately from start(), which waits on the season's
// artwork and weather: a panel can be open before that finishes, and its preview still needs to move.
let frameStarted=false,frameHandle=0,nextFrameAt=0,lastFrameInterval=0,appDisposed=false;
let lastAutoSave=Date.now();
function frameDue(now,interval){
  if(interval!==lastFrameInterval){lastFrameInterval=interval;nextFrameAt=now;}
  if(now+.05<nextFrameAt)return false;
  nextFrameAt+=interval*Math.max(1,Math.floor((now-nextFrameAt)/interval)+1);
  return true;
}
// Draw one frame right away, then let rAF carry on: a host can load the page while it is hidden
// (Wallpaper Engine starting with Windows), where the first rAF may not arrive for a while.
function ensureFrame(){if(frameStarted||appDisposed)return;frameStarted=true;last=0;nextFrameAt=0;frame(performance.now());}
function frame(now){
  frameHandle=0;if(appDisposed){frameStarted=false;return;}
  if(panelMode&&(!previewCanvas||!previewFish||!dialog.open||document.hidden||paused)){frameStarted=false;last=0;return;}
  if(!panelMode&&(paused||(document.hidden&&pondFrameReady))){frameStarted=false;last=0;return;}
  frameHandle=requestAnimationFrame(frame);
  const frameInterval=1000/(panelMode?30:targetFps());
  if(!frameDue(now,frameInterval))return;
  lastFrame=now;const elapsed=last?(now-last)/1000:.016,dt=Math.min(elapsed,.05);last=now;
  if(panelMode){drawPreview(dt);return;}
  drawPreview(dt);
  if(paused||!renderer)return;
  // Still draw the first frame while hidden: a wallpaper started at boot would otherwise keep showing
  // the static CSS painting until the host reports the page visible again (which some hosts never do).
  if(document.hidden&&pondFrameReady)return;time+=dt;
  // Judge smoothness against the frame rate this pond aims for, not a fixed number (a 30 fps host is not "slow").
  if(time>4&&perf.level<2&&dpr>1){perf.t+=elapsed;perf.n++;if(perf.t>5){const fps=perf.n/perf.t;if(fps<targetFps()*.75){perf.level++;resize();if(!wallpaperMode)toast('已自动调低画面精度，让池塘保持流畅');}perf.log=fps;perf.t=perf.n=0;}}
  // A status line in the host's log now and then (Android logcat, WebView2 dev tools) for checking a device.
  if(time>=(perf.next??8)){perf.next=time+60;console.info(`[pond] ${Math.round(perf.log||0)} fps · ${dpr.toFixed(2)}x · ${renderer.canvas.width}×${renderer.canvas.height} · level ${perf.level}`);}
  const eaten=simulation.totalEaten;simulation.step(dt,settings.speed);if(eaten!==simulation.totalEaten)scheduleSave();
  const simEvents=simulation.events;
  for(let i=0;i<simEvents.length;i++){const e=simEvents[i];if(e.type==='eat'){scene.drop(e.x,e.y,5*scene.scale,.3);if(sound.active)sound.gulp();}}
  simEvents.length=0;
  scene.setLook(settings.weather,settings.night,dt,settings,twilightNightK());scene.update(dt,settings);
  const sceneEvents=scene.events;
  for(let i=0;i<sceneEvents.length;i++){const e=sceneEvents[i];if(e.type==='thunder'){simulation.dive();sound.thunderAfter(e.delay,e.strength);}}
  sceneEvents.length=0;
  let rendered;
  try{scene.draw(settings);rendered=renderer.render(time,dt,scene.look);}
  catch(error){recoverRenderer(error);return;}
  if(rendered!==false){
    if(document.body.classList.contains('gl-pending')){document.body.classList.remove('gl-pending');document.body.classList.add('gl');}
    if(!pondFrameReady){pondFrameReady=true;window.PondHost?.pondFrameReady?.();}
  }
  drawLabels();
  // Once a minute the pond saves itself, so who has been swimming beside whom reaches the stored koi.
  if(Date.now()-lastAutoSave>60000){lastAutoSave=Date.now();scheduleSave();}
}
function loadBackground(season){
  if(!backgroundCache.has(season)){
    const path=SEASONS[season].image;
    const embedded=window.POND_IMAGES?.[season]||(season==='spring'?window.POND_IMAGE:null);
    const load=src=>new Promise((resolve,reject)=>{
      const image=new Image();image.decoding='async';
      image.onload=async()=>{try{if(image.decode)await image.decode();resolve(image);}catch(error){reject(error);}};
      image.onerror=()=>reject(Error('background'));
      image.src=src;
    });
    const request=(embedded?load(embedded).catch(()=>load(path)):load(path)).then(image=>{
      image.onload=image.onerror=null;
      if(backgroundCache.get(season)===request)backgroundSizes.set(season,(image.naturalWidth||image.width)*(image.naturalHeight||image.height)*4);
      return image;
    }).catch(error=>{
      if(backgroundCache.get(season)===request){backgroundCache.delete(season);backgroundSizes.delete(season);}
      throw error;
    });
    backgroundCache.set(season,request);
  }
  return backgroundCache.get(season);
}
async function syncSeason(){
  if(panelMode){backgroundSeason=settings.season;pendingSeason=null;$('#season-label').textContent=SEASONS[settings.season].title;return;}
  if(!lotusArtworkReady)return;
  const season=settings.season;
  if(pendingSeason===season||(backgroundSeason===season&&!pendingSeason))return;
  const request=++seasonRequest;pendingSeason=season;
  try{
    const image=await loadBackground(season);
    if(appDisposed||request!==seasonRequest){trimBackgroundCache();return;}
    bedImage=image;backgroundSeason=season;pendingSeason=null;
    $('.pond-bed').style.backgroundImage=`url("${SEASONS[season].image}")`;
    document.body.dataset.season=season;$('#season-label').textContent=SEASONS[season].title;
    if(renderer){
      try{renderer.setBackground(image,backgroundMask(season,image),lightBackdrops);}
      catch(error){recoverRenderer(error);}
      if(renderer){syncBackdrop();scene.setSeason(season);scene.layout(width,height);syncShelters();}
    }else createPond();
    trimBackgroundCache();
    if(activePanel==='weather')updateSeasonOptions();
  }catch{
    if(request!==seasonRequest)return;
    pendingSeason=null;trimBackgroundCache();settings.season=backgroundSeason||'spring';
    if(!renderer&&season!=='spring')await syncSeason();
    applyWeather(false);persist();if(activePanel==='weather')renderWeather();toast('景色加载失败，已保留原鱼池');
  }
}
function selectSeason(season){
  if(!has(SEASONS,season))return;
  settings.season=season;settings.weather=SEASONS[season].weather;settings.autoWeather=false;weatherRequest++;
  applyWeather();scheduleSave();if(activePanel==='weather')updateSeasonOptions();
}
function updateSeasonOptions(){
  for(const [attribute,value] of [['season',settings.season],['weather',settings.weather]]){
    $('#panel-content').querySelectorAll(`[data-${attribute}]`).forEach(b=>{
      const selected=b.dataset[attribute]===value;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);
    });
  }
  $('#season-note').textContent=pendingSeason?'正在切换景色…':'切换季节会换上对应景色与天气，晴雨仍可单独调整。';
  $('#auto-weather').checked=settings.autoWeather;updateWeatherInfo();
}
async function start(){
  if(panelMode)return;
  // Decode the original lotus cutouts once before the renderer uploads its sprite atlas.
  try{
    const image=new Image();image.decoding='async';
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=window.POND_LOTUS_IMAGE||'assets/lotus-original.png';});
    if(image.decode)await image.decode();Object.assign(sprites,PondArt.originalLotusSprites(image));
  }catch{console.warn('Original lotus artwork unavailable; using painted fallback plants');}
  try{
    const image=new Image();image.decoding='async';
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=window.POND_DRIFT_IMAGE||'assets/drifting-flora.png';});
    if(image.decode)await image.decode();Object.assign(sprites,PondArt.driftingSprites(image,window.POND_DRIFTERS||{}));
  }catch{console.warn('Drifting flowers and leaves unavailable');}
  if(appDisposed)return;
  lotusArtworkReady=true;await syncSeason();if(appDisposed)return;ensureFrame();
  // Tell a desktop host the saved screen mode: its first build used the last one it remembered, which can
  // differ after the settings are restored elsewhere. The host rebuilds once only when they differ.
  if(desktopHost)persist();
}
start();
function updateMeta(){if(daily.date!==dayKey())daily={date:dayKey(),count:0};$('#fish-count').textContent=`${simulation.fish.length} 尾锦鲤`;$('#fed-count').textContent=`今日投喂 ${daily.count} 次`;const pillFish=$('#pill-fish-text');if(pillFish)pillFish.textContent=`${simulation.fish.length} 尾`;}
// The koi whose body is under the finger, if any: a tap on her is a fright, not a pellet of food.
function fishAt(x,y){
  let best=null,bd=Infinity;
  for(const f of simulation.fish){
    const s=(f.size||.8)*simulation.scale,d=Math.hypot(f.x*width-x,f.y*height-y);
    if(d<40*s&&d<bd){bd=d;best=f;}
  }
  return best;
}
function feedAt(x,y){
  if(!scene)return;
  // A tap on the lotus patch is a hand on the plant, not a pellet: it dips, sheds rain water, knocks
  // snow off, or scatters fireflies instead of feeding the koi.
  if(scene.touchSeasons(x,y)){if(sound.active)sound.tap();return;}
  if(lanternAt(x,y))return;
  // Pull the pellet a little way in from the bank. Dropped right on the water line, the koi have to press
  // into the shore to reach it, and every frame the boundary shoves them back — which reads as trembling.
  if(simulation.habitat){
    const p=simulation.habitat.project(x,y,26*scene.scale);
    if(p){x=p[0];y=p[1];}
  }
  if(!simulation.isWater(x,y,4))return;
  // Moonlit water scatters the reflection into glints from the same spot the ripple starts.
  scene.glimmer(x,y);
  // A tap that lands on a koi frightens her instead of becoming food there.
  if(fishAt(x,y)){scene.startle(x,y);scene.drop(x,y,9*scene.scale,.9);simulation.scare(x,y,170*scene.scale);if(sound.active)sound.tap();return;}
  scene.startle(x,y);if(!feedMode){scene.drop(x,y,9*scene.scale,.9);simulation.scare(x,y,170*scene.scale);sound.tap();return;}const before=simulation.food.length;if(simulation.feed(x,y)){scene.drop(x,y,7*scene.scale,.5);for(const p of simulation.food.slice(before))scene.drop(p.x,p.y,3*scene.scale,.22);if(daily.date!==dayKey())daily={date:dayKey(),count:0};daily.count++;updateMeta();scheduleSave();if(sound.active)sound.plop();}else{scene.drop(x,y,10*scene.scale,.55);toast('鱼食还没吃完，让小鱼慢慢享用吧');}}
// On a moonlit night the hint points at the reflection: a tap there sets a lantern adrift instead.
function updatePondHint(){
  const hint=$('#pond-hint');if(!hint)return;
  const fireflies=settings.night&&settings.season==='summer'&&settings.butterflies&&(settings.weather==='sunny'||settings.weather==='cloudy');
  hint.textContent=settings.night?(fireflies?'轻点月亮倒影放河灯 · 长按水面点亮萤灯':'轻点月亮倒影，放一盏河灯'):feedMode?'轻点水面，投下一点欢喜':'轻点水面，泛起一圈涟漪';
}
// Summer night only: holding still on the pond lights a small lamp that the fireflies drift toward.
// Scattering food moves to single taps and the 投喂 switch while the lamp is the long press.
function summonLureAt(x,y){
  if(!scene||!scene.fireflyWeather(settings))return false;
  const first=!scene.lures.length;
  scene.summonLure(x,y);
  if(first)toast('点亮一盏萤灯，萤火虫会循光聚来');
  if(sound.active)sound.tap();
  return true;
}
function setFeedMode(on){feedMode=on;settings.feedMode=on;$('#feed-button')?.classList.toggle('active',on);$('#feed-button')?.setAttribute('aria-pressed',on);updatePondHint();}
setFeedMode(feedMode);
// A lantern is released on the moon's reflection rather than fed to the koi.
function lanternAt(x,y){
  if(!settings.night||!scene?.moonLanternSpot(x,y))return false;
  if(!scene.releaseLantern(x,y))return false;
  if(scene.lanterns.length===1)toast('放下一盏河灯，随水漂走');
  if(sound.active)sound.tap();
  return true;
}
// The corner card is one box with two faces — the capsule at rest, the full card when opened — and the
// fold is remembered, so a tidy desktop keeps the small size across visits.
const card=$('.weather-card');
const cardBody=$('.card-body');
const cardTip=$('#card-tip');
// A box cannot animate to "auto", so the open face is measured and handed to the stylesheet as
// --card-h. --card-h-limit is the room the window leaves; a card taller than that scrolls in its box.
function measureCard(){
  if(!card||!cardBody)return;
  const limit=Math.max(160,Math.round(innerHeight-card.offsetTop-24));
  card.style.setProperty('--card-h-limit',`${limit}px`);
  const open=Math.min(limit,cardBody.getBoundingClientRect().height);
  if(open>0)card.style.setProperty('--card-h',`${Math.ceil(open)+2}px`);
}
// Half a minute without a tap, key or scroll folds the card down to the capsule. That idle fold lives
// only on screen: it never overwrites the remembered choice, so the button brings back the size the
// person picked. An open panel counts as use, not idleness.
const CARD_IDLE=30000;
let cardIdleTimer=0,cardFolded=false,tipTimer=0,arriveTimer=0;
function armCardIdle(){
  clearTimeout(cardIdleTimer);cardIdleTimer=0;
  if(cardFolded||zen||activePanel||panelMode||document.hidden)return;
  cardIdleTimer=setTimeout(()=>{
    cardIdleTimer=0;
    if(!cardFolded&&!zen&&!activePanel&&!panelMode&&!document.hidden){setCardCollapsed(true,false,true);showCardTip();}
  },CARD_IDLE);
}
const cardAwake=()=>{if(!cardFolded&&!zen&&!activePanel)armCardIdle();};
for(const type of ['pointerdown','pointermove','keydown','wheel','touchstart'])addEventListener(type,cardAwake,{passive:true});
// After an idle fold the capsule says how to come back, then the line steps aside on its own.
function showCardTip(){
  if(!cardTip)return;
  cardTip.classList.add('visible');
  clearTimeout(tipTimer);
  tipTimer=setTimeout(()=>cardTip.classList.remove('visible'),2800);
}
function hideCardTip(){clearTimeout(tipTimer);tipTimer=0;cardTip?.classList.remove('visible');}
function setCardCollapsed(value,remember=true,auto=false){
  const folded=!!value,changed=folded!==cardFolded;
  cardFolded=folded;
  if(remember)settings.cardCollapsed=cardFolded;
  card.classList.toggle('collapsed',cardFolded);
  // The capsule already carries the koi count, and on a phone the meta line sits right on its top
  // edge, so the line steps aside while the card is folded.
  document.body.classList.toggle('card-folded',cardFolded);
  // The pill's chevron and the card's own corner button are one switch, seen from two sides.
  const button=$('#card-toggle');
  if(button){
    const name=cardFolded?'chevron-down':'collapse',label=cardFolded?'展开卡片':'收起卡片';
    button.dataset.icon=name;
    button.innerHTML=icon(name);
    button.setAttribute('aria-label',label);
    button.setAttribute('title',label);
    button.setAttribute('aria-expanded',String(!cardFolded));
  }
  // An idle fold arrives on a breath; a tap on a button simply folds.
  clearTimeout(arriveTimer);
  card.classList.toggle('auto-fold',cardFolded&&auto);
  if(cardFolded&&auto)arriveTimer=setTimeout(()=>card.classList.remove('auto-fold'),900);
  if(!cardFolded)hideCardTip();
  if(changed)measureCard();
  armCardIdle();
}
$('#card-toggle').addEventListener('click',()=>{setCardCollapsed(!cardFolded);persist();});
// Opening is the same move from either door: the chevron, or the clock, which has no panel of its own.
$('#pill-expand').addEventListener('click',()=>{setCardCollapsed(false);persist();});
$('#pill-clock').addEventListener('click',()=>{setCardCollapsed(false);persist();});
// The card is as tall as its content, and the content can change: a longer hint, a city name.
if('ResizeObserver' in window&&cardBody)new ResizeObserver(measureCard).observe(cardBody);
addEventListener('resize',measureCard,{passive:true});
setCardCollapsed(settings.cardCollapsed);
if(document.fonts?.ready)document.fonts.ready.then(measureCard).catch(()=>{});
$('#feed-button')?.addEventListener('click',()=>{setFeedMode(!feedMode);persist();toast(feedMode?'投喂已开启，轻点水面试试':'观鱼模式 · 轻点水面，鱼儿会受惊游开');});
// The folded card carries the same reading as the open one, in the shortest form that still reads:
// the temperature when a city is followed, the word for the weather when it is not.
function syncPillWeather(glyph,label,temperature){
  const box=$('#pill-weather-icon'),text=$('#pill-weather-text');
  if(box){box.dataset.icon=glyph;box.innerHTML=icon(glyph);}
  if(text)text.textContent=temperature.endsWith('°C')?temperature.replace('°C','°'):label;
}
function applyWeather(syncBackground=true){updatePondHint();document.body.classList.remove('sunny','cloudy','rain','snow','night');document.body.classList.add(settings.weather);document.body.classList.toggle('night',settings.night);const labels={sunny:'晴日',cloudy:'多云',rain:rainLabel(),snow:snowLabel()};const notes={sunny:'风轻水暖，正宜观鱼',cloudy:'云影悠悠，偷得浮生闲',rain:settings.rainAmount>.67?'骤雨打荷，满池飞珠':'一池细雨，满塘清欢',snow:settings.snowAmount>.67?'大雪纷飞，一池素白':'落雪无声，岁月安然'};const weatherGlyph=settings.night?'moon':settings.weather==='sunny'?'sun':settings.weather,temperatureText=settings.autoWeather&&weatherData?`${Math.round(weatherData.temperature_2m)}°C`:'随心天气';$('#weather-symbol').innerHTML=icon(weatherGlyph);$('#weather-label').textContent=labels[settings.weather];$('#temperature').textContent=temperatureText;syncPillWeather(weatherGlyph,labels[settings.weather],temperatureText);$('#weather-location').textContent=settings.autoWeather&&settings.location?settings.location.name:'池畔时光';$('#weather-note').textContent=settings.night&&settings.weather!=='rain'?`月色如水 · 今夜${PondScene.moonPhase().name}`:notes[settings.weather];sound.configure(settings);if(syncBackground)syncSeason();syncShelters();if(scene)scene.setNightWindow?.(...(moonWindow()||[]));}
// Rain sends the fish under the lotus leaves; any other weather lets them wander again.
function syncShelters(){if(!scene)return;simulation.setShelters(settings.weather==='rain'?scene.shelterPoints():null);}
function rainLabel(){return settings.rainAmount<.34?'小雨':settings.rainAmount<.67?'中雨':'大雨';}
function snowLabel(){return settings.snowAmount<.34?'小雪':settings.snowAmount<.67?'中雪':'大雪';}
function clockTick(){const date=new Date();$('#clock').textContent=date.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});$('#clock').dateTime=date.toISOString();$('#calendar').textContent=date.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});updateMeta();const pillTime=$('#pill-time');if(pillTime)pillTime.textContent=$('#clock').textContent;syncAutoNight();}clockTick();const clockTimer=setInterval(clockTick,1000);applyWeather();
const dialog=$('#panel');
// The Windows host opens the interactive window straight into a panel the wallpaper's card asked for.
const requestedPanel=new URLSearchParams(location.search).get('panel');
// Wait for the first frame: the panel renders with the pond's sprites and canvases, which start() prepares.
if(['fish','weather','settings'].includes(requestedPanel))requestAnimationFrame(()=>openPanel(requestedPanel));
document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>openPanel(b.dataset.panel)));
$('.close-panel').addEventListener('click',()=>{if(panelMode){try{window.chrome?.webview?.postMessage('panel-close');}catch{}return;}dialog.close();});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>{activePanel='';previewCanvas=null;previewFish=null;previewSprite=null;previewKey='';compareWith=null;citySearchController?.abort();$('#panel-toast')?.classList.remove('visible');armCardIdle();});
function openPanel(type){activePanel=type;previewCanvas=null;previewFish=null;const names={fish:['我的锦鲤','MEET YOUR LITTLE FRIENDS'],weather:['池塘天气','EVERY WEATHER HAS ITS POETRY'],settings:['池塘设置','MAKE YOURSELF AT HOME']};$('#panel-title').textContent=names[type][0];$('#panel-eyebrow').textContent=names[type][1];if(!dialog.open){if(panelMode)dialog.show();else dialog.showModal();}({fish:renderFish,weather:renderWeather,settings:renderSettings})[type]();if(type==='fish')ensureFrame();}
function thumbnail(f,width=120,height=60){const c=document.createElement('canvas');c.width=width*2;c.height=height*2;c.style.width=`${width}px`;c.style.height=`${height}px`;const context=c.getContext('2d');context.scale(2,2);const s=Math.min(f.size*.95,width*.86/96);PondScene.drawKoi2D(context,{...f,phase:1},fishCanvas(f),sprites,width*.5+12*s,height*.5-1.4*s,-.12,s,.35);return c;}
function renderFish(){const content=$('#panel-content');content.innerHTML=`<p class="description">为你的池塘添一尾锦鲤。选一种花色，取一个好名字。</p><div class="fish-preview"><canvas id="preview" width="880" height="290" aria-label="锦鲤外观预览"></canvas><span class="preview-label">一鱼一色 · 各有欢喜</span><span class="preview-temper" id="preview-temper"></span></div><div class="form-row"><label>锦鲤花色</label><div class="palette">${PALETTES.map((p,i)=>`<button type="button" class="swatch ${i===0?'selected':''}" style="background:${p.spot}" data-palette="${i}" aria-label="${p.name}" aria-pressed="${i===0}"></button>`).join('')}</div><span id="palette-name" class="small-note">红白</span></div><div class="form-row"><label for="fish-size">锦鲤大小</label><input id="fish-size" type="range" min="${KOI_SIZE.min}" max="${KOI_SIZE.max}" step="0.05" value="${KOI_SIZE.initial}"/><button id="new-pattern" class="edit-fish">换个花纹 ↻</button></div><p class="small-note">默认展示为最大尺寸，可向左调小。</p><div class="form-row paint-tools"><label for="paint-toggle">手绘花纹</label><input id="paint-toggle" type="checkbox" aria-label="手绘花纹"/><span class="small-note">开启后在鱼身涂画</span><input id="paint-color" type="color" value="#bc5036" aria-label="画笔颜色"/><button id="clear-paint" type="button" class="edit-fish">清除</button></div><form id="add-fish-form"><div class="form-row"><label for="fish-name">给它起名</label><input id="fish-name" type="text" maxlength="12" placeholder="例如：小满、如意、听雨" autocomplete="off"/></div><div class="form-actions"><span class="small-note">它会记住你投下的每一粒鱼食</span><button class="primary" type="submit">放入池塘 ＋</button></div></form><div class="collection-head"><h3>我的小伙伴 <span id="collection-count" class="small-note"></span></h3><button class="edit-fish" id="restore-all" title="锦鲤回到刚来时的体型">全部还原体型</button></div><p class="temper-legend"><span><b>贪</b>贪吃 · 总第一个冲到食</span><span><b>怯</b>胆小 · 一点动静就躲开</span><span><b>独</b>独行 · 喜欢自己待着</span><span><b>亲</b>亲人 · 爱凑在鱼群里</span></p><div class="fish-grid" id="fish-grid"></div><div class="collection-foot"><span class="small-note" id="week-eaten"></span><button class="edit-fish" id="open-memorial">曾经的伙伴</button></div>`;
  previewFish={...createFish(0),temper:createFish(simulation.fish.length).temper,palette:0,angle:0,size:KOI_SIZE.initial,marks:[]};previewCanvas=$('#preview');
  content.querySelectorAll('[data-palette]').forEach(b=>b.addEventListener('click',()=>{previewFish.palette=Number(b.dataset.palette);content.querySelectorAll('[data-palette]').forEach(s=>{s.classList.toggle('selected',s===b);s.setAttribute('aria-pressed',s===b);});$('#palette-name').textContent=PALETTES[previewFish.palette].name;}));
  let painting=false;
  $('#paint-toggle').addEventListener('change',e=>{previewFish.painting=e.target.checked;previewCanvas.style.cursor=previewFish.painting?'crosshair':'default';});
  $('#clear-paint').addEventListener('click',()=>{previewFish.marks=[];});
  function brush(e){if(!previewFish?.painting||!painting)return;const box=previewCanvas.getBoundingClientRect(),scale=previewFish.size*PREVIEW_K;const x=((e.clientX-box.left)*previewCanvas.width/box.width-previewCanvas.width*.53)/scale,y=((e.clientY-box.top)*previewCanvas.height/box.height-previewCanvas.height*.5)/scale;if(x < -32 || x > 32 || Math.abs(y)>12)return;const mark={x,y,r:3,color:$('#paint-color').value};if(previewFish.marks.length<400)previewFish.marks.push(mark);}
  previewCanvas.addEventListener('pointerdown',e=>{painting=true;previewCanvas.setPointerCapture(e.pointerId);brush(e);});previewCanvas.addEventListener('pointermove',brush);previewCanvas.addEventListener('pointerup',()=>painting=false);previewCanvas.addEventListener('pointercancel',()=>painting=false);
  $('#fish-size').addEventListener('input',e=>previewFish.size=clamp(Number(e.target.value),KOI_SIZE.min,KOI_SIZE.max));$('#new-pattern').addEventListener('click',()=>previewFish.seed=Math.floor(Math.random()*100000));
  $('#open-memorial')?.addEventListener('click',()=>renderMemorial());
  // One click restores every koi to her arrival build. The reset only changes the body size;
  // meal records stay, so there is nothing destructive to confirm.
  $('#restore-all')?.addEventListener('click',()=>{
    const off=f=>Math.abs(f.size-restoreTarget(f))>.005,grown=simulation.fish.filter(off);
    if(!grown.length)return toast('所有鱼都已回到还原后的体型');
    for(const f of grown)restoreBuild(f);
    persist();renderCollection();
    toast(`已还原 ${grown.length} 尾锦鲤的体型，吃食记录都还在`);
  });
  $('#add-fish-form').addEventListener('submit',e=>{e.preventDefault();if(simulation.fish.length>=60)return toast('池塘最多容纳 60 尾锦鲤');const f={...createFish(simulation.fish.length),palette:previewFish.palette,size:clamp(previewFish.size,KOI_SIZE.min,KOI_SIZE.max),seed:previewFish.seed,marks:previewFish.marks.map(m=>({...m}))};f.name=$('#fish-name').value.trim().slice(0,12)||f.name;simulation.fish.push(f);simulation.confineFish(f);uploadSprites();$('#fish-name').value='';updateMeta();persist();renderCollection();toast(`${f.name} 已游入池塘`);});renderCollection();ensureFrame();}
// The preview shows the koi that is about to be added, so it also names the temperament she will get.
function syncPreviewTemper(){
  const el=$('#preview-temper');
  if(!el||!previewFish)return;
  el.textContent=`性子：${TEMPER_NAME[previewFish.temper]||'随缘'}`;
}
function renderCollection(){  const grid=$('#fish-grid');if(!grid)return; // a koi's own page has no grid
  const week=$('#week-eaten');if(week)week.textContent=`本周池中共吃了 ${weeklyEaten()} 粒`;
  $('#collection-count').textContent=`/ ${simulation.fish.length} 尾`;if(previewFish)previewFish.temper=createFish(simulation.fish.length).temper;syncPreviewTemper();while(grid.firstChild)grid.removeChild(grid.firstChild);for(const f of simulation.fish){const tile=document.createElement('div');tile.className='fish-tile';const thumb=document.createElement('div');thumb.className='fish-thumb';thumb.append(thumbnail(f));
const since=f.lastMeal?Date.now()-f.lastMeal:Infinity;
const dot=document.createElement('b');dot.className='state-dot';
dot.dataset.state=since<300000?'fed':since<1800000?'ok':'hungry';
dot.title=since<300000?'刚吃过':since<1800000?'还不太饿':'有点饿了，去喂一口吧';
thumb.append(dot);
thumb.title='看看这尾鱼的小传';
thumb.addEventListener('click',()=>{if(compareWith&&compareWith!==f)renderCompare(compareWith,f);else renderFishDetail(f);});
const grow=document.createElement('div');grow.className='grow-bar';
// The bar tracks the current build, not lifetime meals, so restoring a koi empties it even though
// the appetite record keeps counting.
grow.innerHTML=`<i style="width:${(Math.min(1,Math.log1p(Math.max(0,f.eaten-(f.growthBase||0)))*.055/.42)*100).toFixed(1)}%"></i>`;
grow.title=`吃过 ${f.eaten} 粒`;
const foot=document.createElement('div');foot.className='fish-tile-foot';const name=document.createElement('span');name.textContent=f.name;const edit=document.createElement('button');edit.className='edit-fish';edit.textContent='改名';edit.setAttribute('aria-label',`给${f.name}改名`);edit.addEventListener('click',()=>{const input=document.createElement('input');input.type='text';input.value=f.name;input.maxLength=12;input.setAttribute('aria-label','锦鲤新名字');input.style.cssText='padding:5px;min-width:0;font-size:10px';name.replaceWith(input);edit.textContent='保存';edit.setAttribute('aria-label',`保存${f.name}的新名字`);let done=false;const commit=()=>{if(done)return;done=true;f.name=input.value.trim().slice(0,12)||f.name;persist();renderCollection();toast('名字已保存');};edit.onclick=commit;input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commit();}if(e.key==='Escape'){e.stopPropagation();renderCollection();}});input.focus();input.select();},{once:true});const release=document.createElement('button');release.className='edit-fish release-fish';release.textContent='放生';release.setAttribute('aria-label',`放生${f.name}`);let armed=0;release.addEventListener('click',()=>{if(simulation.fish.length<=1)return toast('池塘里至少留一尾锦鲤');if(!armed){release.textContent='确认放生';release.classList.add('armed');armed=setTimeout(()=>{armed=0;release.textContent='放生';release.classList.remove('armed');},3000);return;}clearTimeout(armed);releaseFish(f);});const temper=document.createElement('b');temper.className='temper';temper.textContent=TEMPER_LABEL[f.temper]||'';temper.title=TEMPER_NAME[f.temper]||'';
const label=document.createElement('span');label.className='fish-tile-name';label.append(name,temper);
const actions=document.createElement('span');actions.className='fish-actions';actions.append(edit,release);foot.append(label,actions);tile.append(thumb,grow,foot);grid.append(tile);}}
// A koi's own page: how long she has been here, what she has eaten, who she swims beside.
// How much the whole pond has eaten over the last seven days.
function weeklyEaten(){if(!daily||!daily.eaten)return 0;return Object.keys(daily.eaten).reduce((n,k)=>n+(daily.eaten[k]||0),0);}
// The koi let go, kept as a small memorial rather than deleted without trace.
function readMemorial(){try{const v=JSON.parse(localStorage.getItem('bichi-pond-memorial'));return Array.isArray(v)?v:[];}catch{return[];}}
function addMemorial(entry){const list=readMemorial();list.unshift(entry);try{localStorage.setItem('bichi-pond-memorial',JSON.stringify(list.slice(0,50)));}catch{}}
function renderFishDetail(f){
  previewCanvas=null;previewFish=null;previewSprite=null;previewKey='';
  const born=f.born||null;
  const days=born?Math.max(1,Math.ceil((Date.now()-born)/864e5)):null;
  const grew=f.baseSize>0?Math.max(0,(f.size/f.baseSize-1)*100):0;
  const friend=f.friend?simulation.fish.find(o=>o.id===f.friend):null;
  const age=koiAge(f);
  $('#panel-title').textContent=f.name;
  $('#panel-eyebrow').textContent='A KOI YOU RAISED';
  $('#panel-content').innerHTML=`<div class="koi-profile"><div class="profile-fish" id="profile-fish"></div><p class="profile-line">${PALETTES[f.palette].name} · ${TEMPER_NAME[f.temper]||'随缘'}</p><ul class="profile-stats">${days?`<li><span>陪伴</span><strong>${days} 天</strong></li>`:''}${age?`<li><span>年纪</span><strong>${AGE_NAME[age.stage]}</strong></li>`:''}<li><span>吃下</span><strong>${f.eaten} 粒</strong></li><li><span>体型</span><strong>${grew>=1?`比来时大 ${grew.toFixed(0)}%`:'刚来时的样子'}</strong></li>${friend?`<li><span>常和</span><strong>${friend.name} 一起游</strong></li>`:'<li><span>常和</span><strong class="muted">还没看出来，多陪它们游一会儿</strong></li>'}${f.marks&&f.marks.length?'<li><span>身上</span><strong>有你画的纹</strong></li>':''}</ul><div class="profile-actions"><button class="edit-fish" id="profile-back">← 回到小伙伴</button><button class="edit-fish" id="profile-find">在池中找它</button><button class="edit-fish" id="profile-compare">和一尾比一比</button><button class="edit-fish" id="profile-restore">还原体型</button><button class="edit-fish release-fish" id="profile-release">放生</button></div></div>`;
  $('#profile-fish').append(thumbnail(f,300,168));
  $('#profile-back').addEventListener('click',()=>{$('#panel-title').textContent='我的锦鲤';$('#panel-eyebrow').textContent='MEET YOUR LITTLE FRIENDS';renderFish();});
  $('#profile-find').addEventListener('click',()=>{
    // On the desktop, ask the wallpapers to ripple around her; in a plain window, mark her here.
    if(panelMode&&window.chrome?.webview){try{window.chrome.webview.postMessage('panel-find:'+f.id);}catch{}}
    else if(scene){scene.highlight={id:f.id,until:scene.time+5};}
    if(panelMode){try{window.chrome?.webview?.postMessage('panel-close');}catch{}}else dialog.close();
  });
  $('#profile-compare').addEventListener('click',()=>{compareWith=f;renderFish();toast(`再点一尾鱼，和「${f.name}」比一比`);});
  $('#profile-restore').addEventListener('click',()=>{
    if(f.size<=f.baseSize+.005)return toast(`「${f.name}」已经是刚来时的体型`);
    restoreBuild(f);persist();renderFishDetail(f);
    toast(`「${f.name}」回到了刚来时的样子，之后吃食会重新让它长大`);
  });
  $('#profile-release').addEventListener('click',()=>{if(simulation.fish.length<=1)return toast('池塘里至少留一尾锦鲤');releaseFish(f);});
}
// A koi goes back to the build she arrived with.
// Meals already eaten stay on record, so a koi grows again only with what it eats from now on.
function restoreTarget(f){return f.baseSize;}
function restoreBuild(f){f.size=restoreTarget(f);f.growthBase=f.eaten;}
// Two koi side by side: colour, temperament, appetite, build, age.
function renderCompare(a,b){
  previewCanvas=null;previewFish=null;previewSprite=null;previewKey='';
  const grew=f=>{const g=f.baseSize>0?(f.size/f.baseSize-1)*100:0;return g>=1?'+'+g.toFixed(0)+'%':'刚来';};
  const ageOf=f=>{const g=koiAge(f);return g?g.days+' 天':null;};
  $('#panel-title').textContent='比一比';
  $('#panel-eyebrow').textContent='SIDE BY SIDE';
  $('#panel-content').innerHTML=`<div class="koi-compare"><div class="cmp-head"><span>${a.name}</span><span>${b.name}</span></div><div class="cmp-fish"><span id="cmp-a"></span><span id="cmp-b"></span></div><ul class="cmp-stats"><li><span>${PALETTES[a.palette].name}</span><em>花色</em><span>${PALETTES[b.palette].name}</span></li><li><span>${TEMPER_LABEL[a.temper]||'—'}</span><em>性子</em><span>${TEMPER_LABEL[b.temper]||'—'}</span></li><li><span>${a.eaten} 粒</span><em>吃下</em><span>${b.eaten} 粒</span></li><li><span>${grew(a)}</span><em>体型</em><span>${grew(b)}</span></li><li><span>${ageOf(a)||'—'}</span><em>年纪</em><span>${ageOf(b)||'—'}</span></li></ul><div class="profile-actions"><button class="edit-fish" id="cmp-back">← 回到小伙伴</button></div></div>`;
  $('#cmp-a').append(thumbnail(a,150,84));
  $('#cmp-b').append(thumbnail(b,150,84));
  $('#cmp-back').addEventListener('click',()=>{compareWith=null;$('#panel-title').textContent='我的锦鲤';$('#panel-eyebrow').textContent='MEET YOUR LITTLE FRIENDS';renderFish();});
}
// The koi that have been let go, kept as a short list of names.
function renderMemorial(){
  previewCanvas=null;previewFish=null;previewSprite=null;previewKey='';
  const list=readMemorial();
  $('#panel-title').textContent='曾经的伙伴';
  $('#panel-eyebrow').textContent='THOSE WHO SWAM ON';
  const back='<div class="profile-actions"><button class="edit-fish" id="mem-back">← 回到小伙伴</button></div>';
  $('#panel-content').innerHTML=list.length
    ?`<p class="description">从这里游走的鱼，都留了个名字。</p><ul class="memorial-list">${list.map(m=>`<li><span class="mem-name">${m.name}</span><span class="mem-meta">${m.palette!==undefined&&PALETTES[m.palette]?PALETTES[m.palette].name+' · ':''}${m.days?`陪伴 ${m.days} 天 · `:''}吃了 ${m.eaten||0} 粒${m.marks?' · 身上有你的纹':''}</span></li>`).join('')}</ul>${back}`
    :`<p class="description">还没有鱼离开过。</p>${back}`;
  $('#mem-back').addEventListener('click',()=>{$('#panel-title').textContent='我的锦鲤';$('#panel-eyebrow').textContent='MEET YOUR LITTLE FRIENDS';renderFish();});
}
// Letting a koi go: it slips away with a ripple; later fish move up one atlas cell, so their sprites are re-uploaded.
function releaseFish(f){const i=simulation.fish.indexOf(f);if(i<0||simulation.fish.length<=1)return;if(scene){scene.drop(f.x*width,f.y*height,26*scene.scale,.85);scene.wakes.delete(f);}addMemorial({name:f.name,palette:f.palette,temper:f.temper,days:(()=>{const a=koiAge(f);return a?a.days:null;})(),eaten:f.eaten,marks:!!(f.marks&&f.marks.length),at:Date.now()});
simulation.fish.splice(i,1);simulation.fish.forEach((g,j)=>{if(j>=i)g.spriteReady=false;});uploadSprites();updateMeta();persist();
  // Letting go from a koi's own page has to return to the list; from the list, redraw it.
  if($('#fish-grid'))renderCollection();
  else{$('#panel-title').textContent='我的锦鲤';$('#panel-eyebrow').textContent='MEET YOUR LITTLE FRIENDS';renderFish();}
  toast(`「${f.name}」游向了更远的水面`);}
// The four season thumbnails are the page's only <img> elements, and they are decoded synchronously.
// With decoding="async" WebKit repaints a picture it has not decoded yet as an empty box and fills it
// in later; a panel opened or re-rendered while the pond was preparing its artwork sometimes kept
// four empty boxes. A 320×180 JPEG decodes in place in about a millisecond, so nothing is gained by waiting.
function renderWeather(){$('#panel-content').innerHTML=`<p class="description">春看繁花，夏听蝉鸣，秋赏红叶，冬候落雪。</p><h3 class="season-heading">池塘四季</h3><div class="season-options" role="group" aria-label="池塘季节">${Object.entries(SEASONS).map(([v,s])=>`<button type="button" class="season-option ${settings.season===v?'selected':''}" data-season="${v}" aria-label="${s.name}季" aria-pressed="${settings.season===v}"><img src="${s.thumbnail}" alt="" decoding="sync"/><span>${s.name}</span><small>${s.title}</small></button>`).join('')}</div><p class="small-note season-note" id="season-note" role="status">${pendingSeason?'正在切换景色…':'切换季节会换上对应景色与天气，晴雨仍可单独调整。'}</p><h3>此刻天气</h3><div class="weather-options">${[['sunny','晴日','sun'],['cloudy','多云','cloudy'],['rain','下雨','rain'],['snow','落雪','snow']].map(([v,n,i])=>`<button class="weather-option ${settings.weather===v?'selected':''}" data-weather="${v}" aria-pressed="${settings.weather===v}">${icon(i)}<span>${n}</span></button>`).join('')}</div><div class="setting-row"><div>雨量<small id="rain-note">${rainLabel()} · 下雨时生效，跟随城市天气时自动调整</small></div><input id="rain-amount" type="range" aria-label="雨量" min="0" max="1" step="0.05" value="${settings.rainAmount}"/></div><div class="setting-row"><div>雪量<small id="snow-note">${snowLabel()} · 落雪时生效，岸边会渐渐积雪</small></div><input id="snow-amount" type="range" aria-label="雪量" min="0" max="1" step="0.05" value="${settings.snowAmount}"/></div><div class="setting-row"><div>月下观鱼<small>夜色里，池中倒映今夜的月亮；跟随城市天气时，按当地日落慢慢入夜</small></div><input id="night" type="checkbox" aria-label="月下观鱼" ${settings.night?'checked':''}/></div><div class="setting-row"><div>跟随城市天气<small>每 15 分钟同步当地季节、晴雨雪与日出日落</small></div><input id="auto-weather" type="checkbox" aria-label="跟随城市天气" ${settings.autoWeather?'checked':''}/></div><h3>城市天气</h3><form id="city-form" class="form-row"><input id="city-input" aria-label="城市名称" type="text" maxlength="80" placeholder="输入城市，如北京、杭州、Shanghai" required/><button class="secondary" type="submit">查询</button></form><div id="city-results" class="city-results" aria-live="polite"></div><div class="weather-info" id="weather-info"></div><div class="weather-retry-row"><button type="button" class="edit-fish" id="weather-retry" hidden>重新获取天气</button></div><p class="dialog-footer">城市查询仅发送城市名称，天气查询使用所选城市坐标。<br>天气数据由 <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> 提供，无需 API 密钥。</p>`;
  updateWeatherInfo();$('#panel-content').querySelectorAll('[data-season]').forEach(b=>b.addEventListener('click',()=>selectSeason(b.dataset.season)));$('#panel-content').querySelectorAll('[data-weather]').forEach(b=>b.addEventListener('click',()=>{settings.weather=b.dataset.weather;settings.autoWeather=false;weatherRequest++;persist();applyWeather();renderWeather();}));$('#night').addEventListener('change',e=>{settings.night=e.target.checked;applyWeather();persist();if(settings.autoWeather&&sunTimes)toast(e.target.checked?'已手动进入月下观鱼；下一次日出后会自动回到白天':'已手动回到白天；下一次日落时会自动入夜');});$('#rain-amount').addEventListener('input',e=>{settings.rainAmount=Number(e.target.value);$('#rain-note').firstChild.textContent=`${rainLabel()} · 下雨时生效，跟随城市天气时自动调整`;applyWeather();scheduleSave();});$('#snow-amount').addEventListener('input',e=>{settings.snowAmount=Number(e.target.value);$('#snow-note').firstChild.textContent=`${snowLabel()} · 落雪时生效，岸边会渐渐积雪`;applyWeather();scheduleSave();});$('#auto-weather').addEventListener('change',e=>{if(e.target.checked&&!settings.location){e.target.checked=false;toast('先查询并选择一个城市');$('#city-input').focus();return;}settings.autoWeather=e.target.checked;if(!settings.autoWeather)weatherRequest++;else{weatherFailures=0;weatherError=null;clearTimeout(weatherRetryTimer);weatherRetryTimer=0;}persist();applyWeather();if(settings.autoWeather)fetchWeather(true);updateWeatherInfo();});$('#city-form').addEventListener('submit',searchCity);
  // The sync can always be re-asked by hand: a network that fails once tends to fail again, and waiting
  // for the quarter-hour poll is a poor answer to "it did not work just now".
  $('#weather-retry').addEventListener('click',()=>{clearTimeout(weatherRetryTimer);weatherRetryTimer=0;weatherFailures=0;fetchWeather(true);});}
// Weather is decoration, and the network is the unreliable part: a cold TLS handshake to a host on the
// far side of the world measured 18 seconds here, one request in ten comes back after two, and a whole
// office behind one address can hit the service's quota. So the call gets room to breathe, three tries
// with a growing pause, and a shorter wait before the next poll — never a quarter hour of stale sky.
const WEATHER_TIMEOUT=20000,CITY_TIMEOUT=20000,WEATHER_RETRY=[60e3,150e3,600e3];
// Fifteen minutes is the heartbeat; past that a cached sky is worth refreshing the moment the window
// is looked at again — a laptop that slept for a night should not wake up showing last night's weather.
const WEATHER_FRESH=15*60e3,WEATHER_CACHE='bichi-pond-sky-v1';
const WEATHER_REASON={timeout:'天气服务没应答',busy:'天气服务此刻请求太多',data:'天气数据不完整',bad:'这次查询被回绝了',http:'天气服务暂时出错',network:'网络没连上'};
let weatherError=null,weatherUpdatedAt=0,weatherLoading=false,weatherAttempt=0,weatherFailures=0,weatherRetryTimer=0,weatherInFlight=false;
function timeLabel(stamp){return stamp?new Date(stamp).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}):'';}
// AbortSignal.timeout is Chrome 103 and AbortController itself is 66; an older WebView simply gets no
// signal, which turns a timeout into "wait for the network" instead of a crash.
function timeoutSignal(ms){
  if(typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function')return AbortSignal.timeout(ms);
  if(typeof AbortController==='undefined')return undefined;
  const controller=new AbortController();
  setTimeout(()=>controller.abort(),ms);
  return controller.signal;
}
// The same question answered once for the city search, where the controller is also the cancellation
// handle rather than just a timeout: a stand-in keeps the rest of the code unchanged.
function cancellable(){
  return typeof AbortController!=='undefined'?new AbortController():{signal:undefined,abort(){}};
}
// "It failed" is several very different things to the person reading it: wait a moment, wait longer,
// change the city, or the service is having a bad day. A refused request (400/422) is the one case
// where trying again is pure waste, so it is told apart from a dropped connection.
function weatherKind(error){
  const status=Number(error?.status)||0;
  if(status===429)return 'busy';
  if(status>=500)return 'http';
  if(status>=400)return 'bad';
  if(error?.name==='TimeoutError'||error?.name==='AbortError')return 'timeout';
  if(error?.message==='shape')return 'data';
  return 'network';
}
// The last sky we saw is worth keeping: a cold start then opens on the temperature it had at 16:05
// instead of the word "随心天气", and the panel can say how old it is. localStorage can be full or
// blocked (private windows, some embedded webviews), which is a reason to skip the cache, not to fail.
function readSky(){
  try{
    const sky=JSON.parse(localStorage.getItem(WEATHER_CACHE));
    if(!sky||!Number.isFinite(sky.at)||!sky.current||!Number.isFinite(sky.current.temperature_2m))return null;
    // A half-day-old temperature is worse than none: it would be shown as if it were the weather now.
    if(Date.now()-sky.at>12*3600e3)return null;
    return sky;
  }catch{return null;}
}
function writeSky(data,location,at){
  try{localStorage.setItem(WEATHER_CACHE,JSON.stringify({at,name:location.name,latitude:location.latitude,longitude:location.longitude,current:data.current,daily:data.daily,utc_offset_seconds:data.utc_offset_seconds}));}catch{}
}
// Borrowed only for the same coordinates: a different city is a different sky.
function hydrateSky(){
  if(!settings.autoWeather||!settings.location)return false;
  const sky=readSky();
  if(!sky||Math.abs(sky.latitude-settings.location.latitude)>1e-4||Math.abs(sky.longitude-settings.location.longitude)>1e-4)return false;
  weatherData=sky.current;weatherUpdatedAt=sky.at;weatherError=null;
  sunTimes=sunStamps(sky.daily,sky.utc_offset_seconds);
  // No background reload: the season artwork already matches what the save file asked for.
  syncAutoNight();applyWeather(false);
  return true;
}
function updateWeatherInfo(){
  const box=$('#weather-info');if(!box)return;
  const retry=$('#weather-retry');
  if(retry)retry.hidden=!(settings.location&&settings.autoWeather);
  if(!settings.location){box.textContent='当前为手动天气。查询城市后，选择搜索结果即可开启实时联动。';return;}
  const name=settings.location.name,temperature=weatherData?`${Math.round(weatherData.temperature_2m)}°C`:'';
  if(!settings.autoWeather){box.textContent=weatherData?`${name} · ${temperature} · 未开启天气联动`:`已选择 ${name} · 天气联动未开启`;return;}
  if(weatherLoading){box.textContent=`${name} · ${temperature?`${temperature} · `:''}正在获取实时天气${weatherAttempt>1?`（第 ${weatherAttempt} 次尝试）`:''}…`;return;}
  if(weatherError){
    const kept=weatherData?` · 先留着 ${timeLabel(weatherUpdatedAt)} 的天气`:'';
    box.textContent=`${name} · ${WEATHER_REASON[weatherError]||'同步失败'}${kept} · 稍后自动重试`;
    return;
  }
  if(!weatherData){box.textContent=`已选择 ${name} · 正在获取实时天气…`;return;}
  const sun=sunTimes?.label?.set?` · 日出 ${sunTimes.label.rise} · 日落 ${sunTimes.label.set}`:'';
  box.textContent=`${name} · ${temperature} · 风速 ${weatherData.wind_speed_10m} km/h${sun} · ${timeLabel(weatherUpdatedAt)} 同步`;
}
// Turning the answer into the pond's weather, kept apart so the fetch loop stays about the network.
function sunStamps(daily,offsetSeconds){
  const offset=(Number(offsetSeconds)||0)*1000,toTime=value=>{const stamp=Date.parse(value+'Z');return Number.isFinite(stamp)?stamp-offset:null;};
  const rises=(daily?.sunrise||[]).map(toTime).filter(Number.isFinite),sets=(daily?.sunset||[]).map(toTime).filter(Number.isFinite);
  return rises.length&&sets.length?{rise:rises[0],set:sets[0],nextRise:rises[1]??null,label:{rise:(daily?.sunrise?.[0]||'').slice(11,16),set:(daily?.sunset?.[0]||'').slice(11,16)}}:null;
}
// The moon's reflection crosses the pond as the night runs. It follows the real sunset → sunrise only
// while the clock is actually inside that night; manual 月下观鱼 (or daytime) uses the scene's slow drift.
function moonWindow(){
  if(!sunTimes)return null;
  const now=Date.now(),set=sunTimes.set,rise=sunTimes.rise,next=sunTimes.nextRise;
  if(!Number.isFinite(set)||!Number.isFinite(rise))return null;
  if(now>=set)return Number.isFinite(next)&&next>set?[set,next]:null;
  if(now<rise)return [set-864e5,rise];
  return null;
}
function applyWeatherData(data,location,at=Date.now()){
  // Stored before the scene is touched: if a render step throws, the sky we just paid for is not lost,
  // and the next cold start still has something to show.
  writeSky(data,location,at);
  sunTimes=sunStamps(data.daily,data.utc_offset_seconds);
  weatherData=data.current;
  weatherError=null;weatherUpdatedAt=at;weatherFailures=0;
  clearTimeout(weatherRetryTimer);weatherRetryTimer=0;
  settings.weather=weatherFromCode(weatherData.weather_code);
  const localTime=new Date(weatherData.time),season=seasonFromMonth(localTime.getMonth(),location.latitude<0);
  if(Object.prototype.hasOwnProperty.call(SEASONS,season)&&settings.season!==season){settings.season=season;settings.weather=SEASONS[season].weather;}
  if(settings.weather==='rain'&&Number.isFinite(weatherData.precipitation))settings.rainAmount=clamp(.15+weatherData.precipitation/8,.15,1);
  if(settings.weather==='snow'&&Number.isFinite(weatherData.snowfall))settings.snowAmount=clamp(.2+weatherData.snowfall/1.5,.2,1);
  syncAutoNight();applyWeather();persist();
}
async function searchCity(e){
  e.preventDefault();
  const query=$('#city-input').value.trim();if(!query)return;
  const results=$('#city-results'),button=$('#city-form button');
  // Only the newest search may write into the list or re-arm the button: an older request still
  // unwinding must not print its failure over the newer one, or hand back a button mid-flight.
  citySearchController?.abort();
  const controller=cancellable();citySearchController=controller;
  const current=()=>citySearchController===controller;
  let timedOut=false;
  const timeout=setTimeout(()=>{timedOut=true;controller.abort();},CITY_TIMEOUT);
  button.disabled=true;button.textContent='查询中';
  results.textContent='正在寻找城市…';
  try{
    const response=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=zh&format=json`,{signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw Object.assign(Error(`http ${response.status}`),{status:response.status});
    const data=await response.json();
    if(!current()||!results.isConnected)return;
    while(results.firstChild)results.removeChild(results.firstChild);
    if(!data.results?.length){results.textContent='没有找到这个城市，试试城市拼音或英文名称。';return;}
    for(const place of data.results){
      const b=document.createElement('button');
      b.className='city-result';
      b.textContent=`${place.name} · ${place.admin1||''} ${place.country||''}`;
      b.addEventListener('click',()=>{settings.location={name:place.name,latitude:place.latitude,longitude:place.longitude};settings.autoWeather=true;weatherData=null;sunTimes=null;autoNightState=null;weatherError=null;weatherFailures=0;clearTimeout(weatherRetryTimer);weatherRetryTimer=0;weatherRequest++;persist();applyWeather();renderWeather();fetchWeather(true);});
      results.append(b);
    }
  }catch(error){
    if(!current()||!results.isConnected)return;
    results.textContent=timedOut?'查询超时了，网络似乎不太通畅，稍后再试一次。':error?.status===429?'查询太频繁了，等一会儿再试。':'城市查询失败，请检查网络后重试。仍可使用上方的手动天气。';
  }finally{
    clearTimeout(timeout);
    if(current()&&button.isConnected){button.disabled=false;button.textContent='查询';}
  }
}
// One call to the service, with the things that can go wrong told apart: no answer, a refused request,
// a full quota, or a body that arrives without the fields we need.
async function weatherCall(location){
  const response=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,weather_code,wind_speed_10m,precipitation,snowfall&daily=sunrise,sunset&forecast_days=2&timezone=auto`,{signal:timeoutSignal(WEATHER_TIMEOUT),cache:'no-store'});
  if(!response.ok){
    // The service explains itself in the body ("Latitude must be in range of -90 to 90"); keeping the
    // first line turns a mystery failure into something the panel can name.
    let reason='';
    try{reason=(await response.text()).slice(0,120);}catch{}
    throw Object.assign(Error(`http ${response.status}`),{status:response.status,reason});
  }
  const data=await response.json();
  if(!Number.isFinite(data?.current?.temperature_2m)||!Number.isFinite(data?.current?.weather_code)||!data?.current?.time)throw Error('shape');
  return data;
}
async function fetchWeather(force=false){
  if(!settings.autoWeather||!settings.location)return false;
  // The quarter-hour beat, a failure timer and a window waking up can land in the same second; asking
  // twice spends quota and invites the service's rate limit. A forced call (the retry button) may cut in.
  if(weatherInFlight&&!force)return false;
  const request=++weatherRequest,location={...settings.location};
  weatherLoading=true;weatherInFlight=true;updateWeatherInfo();
  let kind='network';
  try{
    for(let attempt=0;attempt<3;attempt++){
      if(request!==weatherRequest||!settings.autoWeather)return false;
      // A second and third try can take half a minute between them; saying which one is running is the
      // difference between "still working" and "stuck".
      weatherAttempt=attempt+1;
      if(attempt>0)updateWeatherInfo();
      try{
        const data=await weatherCall(location);
        if(request!==weatherRequest||!settings.autoWeather)return false;
        weatherLoading=false;weatherAttempt=0;
        // Data in hand is a success even if drawing it goes wrong: a throwing renderer must not be
        // reported as a network failure, or the pond retries a call that already worked.
        try{applyWeatherData(data,location);if(activePanel==='weather')renderWeather();}
        catch(error){console.warn('天气已取回，界面更新时出错',error);}
        return true;
      }catch(error){
        if(request!==weatherRequest||!settings.autoWeather)return false;
        kind=weatherKind(error);
        if(error?.reason)console.info('天气服务回绝了这次请求：',error.reason);
        // A full quota or a refused request only gets worse for asking again; a cold socket, a cropped
        // answer or a dropped packet all deserve the next try.
        if(kind==='busy'||kind==='bad'||kind==='data')break;
        if(attempt<2)await new Promise(resolve=>setTimeout(resolve,700*(attempt+1)));
      }
    }
    if(request!==weatherRequest)return false;
    weatherLoading=false;weatherAttempt=0;
    weatherError=kind;weatherFailures++;
    const note=$('#weather-note');
    if(note)note.textContent='天气同步失败 · 保留当前天气';
    updateWeatherInfo();
    if(weatherFailures===1)toast(kind==='timeout'?'天气服务没应答，先留着当前天气，稍后自动重试':kind==='bad'?'这次天气查询没被接受，换一个城市再试试':'实时天气暂不可用，已保留当前天气，稍后自动重试');
    // The quarter-hour poll stays as the heartbeat; this only brings the next beat forward while the
    // network is sulking, and the wait stretches so a long outage is not hammered. A refused query is
    // the exception: asking the same question again cannot change the answer.
    clearTimeout(weatherRetryTimer);
    weatherRetryTimer=kind==='bad'?0:setTimeout(()=>{weatherRetryTimer=0;fetchWeather();},WEATHER_RETRY[Math.min(weatherFailures-1,WEATHER_RETRY.length-1)]);
    return false;
  }finally{
    weatherInFlight=false;
    // Turning the switch off aborts the loop without going through the failure path.
    if(!settings.autoWeather){weatherLoading=false;weatherAttempt=0;}
  }
}
// A failed sync should not wait for the next timer: the moment the network comes back, or the window
// is looked at again after a sleep, the sky is worth one more try. The freshness gate keeps a busy
// alt-tab from turning into a request per focus.
function weatherWake(minGap=0){
  if(!settings.autoWeather||!settings.location||document.hidden)return false;
  if(minGap&&weatherUpdatedAt&&Date.now()-weatherUpdatedAt<minGap)return false;
  weatherFailures=0;weatherError=null;
  clearTimeout(weatherRetryTimer);weatherRetryTimer=0;
  fetchWeather();
  return true;
}
hydrateSky();
const weatherTimer=setInterval(fetchWeather,15*60*1000);if(settings.autoWeather)fetchWeather();
addEventListener('online',()=>weatherWake(0));
addEventListener('focus',()=>weatherWake(WEATHER_FRESH));
addEventListener('pageshow',event=>{if(event.persisted)weatherWake(WEATHER_FRESH);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)weatherWake(WEATHER_FRESH);});
function renderSettings(){$('#panel-content').innerHTML=`<p class="description">把这方小天地，调成你喜欢的模样。</p><div class="setting-row"><div>游动速度<small>慢一点，也是一种生活</small></div><input id="swim-speed" type="range" aria-label="游动速度" min="0.3" max="2" step="0.1" value="${settings.speed}"/></div>${[['turtles','小乌龟','两位慢悠悠的池塘住客'],['crabs','小螃蟹','在池边石头上横着走，一有动静就钻进水里'],['butterflies','蝴蝶与蜻蜓','春夏秋随季节出现，冬季隐藏；夏夜萤火点点'],['names','显示锦鲤名字','在水面认出你的每一位朋友'],['chat','好友对话','两尾常在一处的鱼靠近时，会小声聊上一句']].map(([k,n,d])=>`<div class="setting-row"><div>${n}<small>${d}</small></div><input data-setting="${k}" type="checkbox" aria-label="${n}" ${settings[k]?'checked':''}/></div>`).join('')}<div class="setting-row"><div>画面品质<small>节能模式限制至 30 帧</small></div><select id="quality" aria-label="画面品质"><option value="high" ${settings.quality==='high'?'selected':''}>细腻 · 60 帧</option><option value="eco" ${settings.quality==='eco'?'selected':''}>节能 · 30 帧</option></select></div><h3>声音</h3><div class="setting-row"><div>总音量<small>卡片顶部的声音图标可随时开关全部声音</small></div><input id="volume" type="range" aria-label="总音量" min="0" max="1" step="0.05" value="${settings.volume}"/></div>${[['water','waterVol','池水轻漾','轻柔池水作背景，音量可以单独调整'],['weatherSound','weatherVol','四季环境音','春听鸟鸣，夏听蝉鸣，秋听叶响，冬听轻风；雨雪随天气变化']].map(([k,v,n,d])=>`<div class="setting-row"><div>${n}<small>${d}</small></div><div class="sound-ctl"><input data-vol="${v}" type="range" aria-label="${n}音量" min="0" max="1" step="0.05" value="${settings[v]}"/><input data-sound="${k}" type="checkbox" aria-label="${n}" ${settings[k]?'checked':''}/></div></div>`).join('')}<div class="setting-row"><div>互动水声<small>投喂、吞食与轻点水面的声音</small></div><input data-sound="sfx" type="checkbox" aria-label="互动水声" ${settings.sfx?'checked':''}/></div>${window.PondHost?`<div class="setting-row"><div>手机动态壁纸<small id="wallpaper-note">${PondHost.isWallpaperActive()?'池塘已在桌面上 · 轻点桌面空白处投喂':'把池塘设为手机桌面背景'}${PondHost.wallpaperStatus?.()?`<br>壁纸状态：${PondHost.wallpaperStatus().replace(/[<>&]/g,'')}`:''}</small></div><button id="set-wallpaper" class="secondary">设为壁纸</button></div>`:''}`;const layoutRow=`<div class="setting-row"><div>显示布局<small>底图方向：自动适配在竖屏窗口里旋转，双屏独立保持横向</small></div><select id="display-mode" aria-label="显示布局"><option value="auto" ${settings.displayMode==='auto'?'selected':''}>自动适配</option><option value="dual" ${settings.displayMode==='dual'?'selected':''}>双屏独立</option><option value="portrait" ${settings.displayMode==='portrait'?'selected':''}>竖屏适配</option></select></div>`;
const screenRow=desktopHost?`<div class="setting-row"><div>屏幕显示<small>单屏只在主屏显示池塘；多屏每块屏幕各自一个池塘；共用把所有屏幕拼成一个池塘</small></div><select id="screen-mode" aria-label="屏幕显示"><option value="single" ${settings.screenMode==='single'?'selected':''}>单屏幕显示</option><option value="multi" ${settings.screenMode==='multi'?'selected':''}>多屏幕显示</option><option value="shared" ${settings.screenMode==='shared'?'selected':''}>多屏共用显示</option></select></div>`:'';
$('#panel-content').insertAdjacentHTML('afterbegin',screenRow+layoutRow);
$('#display-mode').addEventListener('change',e=>{settings.displayMode=e.target.value;resize();persist();toast(e.target.value==='dual'?'已切换为双屏独立布局':e.target.value==='portrait'?'已切换为竖屏适配':'已切换为自动适配');});
$('#screen-mode')?.addEventListener('change',e=>{settings.screenMode=e.target.value;settings.screenModeSet=true;persist();toast(e.target.value==='single'?'只在主屏幕显示池塘':e.target.value==='shared'?'所有屏幕拼成一个池塘':'每块屏幕各自显示池塘');});
;$('#set-wallpaper')?.addEventListener('click',()=>PondHost.setWallpaper());$('#swim-speed').addEventListener('input',e=>{settings.speed=Number(e.target.value);scheduleSave();});document.querySelectorAll('[data-setting]').forEach(input=>input.addEventListener('change',()=>{settings[input.dataset.setting]=input.checked;persist();}));$('#quality').addEventListener('change',e=>{settings.quality=e.target.value;resize();persist();});const hint=()=>{if(!sound.active)toast('点击右上角声音按钮即可试听');};document.querySelectorAll('[data-sound]').forEach(input=>input.addEventListener('change',()=>{settings[input.dataset.sound]=input.checked;sound.configure(settings);persist();hint();}));document.querySelectorAll('[data-vol]').forEach(input=>input.addEventListener('input',()=>{settings[input.dataset.vol]=Number(input.value);sound.configure(settings);scheduleSave();}));$('#volume').addEventListener('input',e=>{settings.volume=Number(e.target.value);sound.configure(settings);scheduleSave();});}
function setZen(value){zen=value;document.body.classList.toggle('zen',zen);document.querySelectorAll('.ui').forEach(el=>el.inert=zen);$('#exit-zen').hidden=!zen;$('#zen-button')?.setAttribute('aria-label',zen?'退出沉浸模式':'进入沉浸模式');armCardIdle();}
$('#zen-button').addEventListener('click',()=>setZen(true));
// Esc leaves the immersive view here too. On the desktop wallpaper the page has no keyboard focus, so the
// host repeats the key through the same control hook below.
addEventListener('keydown',e=>{if(e.key==='Escape'&&zen&&!dialog.open)setZen(false);});$('#exit-zen').addEventListener('click',()=>{setZen(false);if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});});
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.key==='Escape'&&!dialog.open)setZen(false);if(e.key.toLowerCase()==='h'&&!dialog.open)setZen(!zen);});
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)setZen(false);});
// Sound and immersive are small icons along the card's top edge, next to the fold button.
function updateSoundButton(on){
  const b=$('#sound-button');
  if(!b)return;
  b.dataset.icon=on?'sound':'sound-off';
  b.innerHTML=icon(on?'sound':'sound-off');
  b.setAttribute('aria-pressed',on);
  b.setAttribute('aria-label',on?'关闭声音':'开启声音');
  b.classList.toggle('active',on);
}
let soundSyncing=false;
// Follow the saved sound setting. The desktop wallpaper's pages carry no controls of their own (the corner card is
// hidden in wallpaper mode and taps on the desktop become food), so this is the only way they can ever play sound.
function syncAudioVisibility(){if(sound.context&&sound.active){if(panelMode||paused||document.hidden)sound.context.suspend().catch(()=>{});else sound.context.resume().catch(()=>{});}}
async function syncSound(){
  if(panelMode){updateSoundButton(settings.soundOn);return false;}
  if(soundSyncing)return sound.active;soundSyncing=true;
  try{const on=await sound.setActive(settings.soundOn);syncAudioVisibility();updateSoundButton(on);return on;}catch{return false;}finally{soundSyncing=false;}
}
async function toggleSound(){try{settings.soundOn=!settings.soundOn;const on=panelMode?settings.soundOn:await sound.setActive(settings.soundOn);syncAudioVisibility();updateSoundButton(on);toast(on?'声音已开启，可在设置里分别调节池水和四季环境音':'声音已关闭');persist();}catch{toast('当前浏览器无法播放声音');}}
$('#sound-button').addEventListener('click',toggleSound);
// The panel window's size button asks the host to grow or shrink the window.
$('#panel-expand')?.addEventListener('click',e=>{
  const b=e.currentTarget,big=b.dataset.big!=='1';
  b.dataset.big=big?'1':'0';
  b.dataset.icon=big?'collapse':'expand';
  b.innerHTML=icon(big?'collapse':'expand');
  b.setAttribute('aria-label',big?'还原面板':'缩放面板');
  try{window.chrome?.webview?.postMessage('panel-expand');}catch{}
});
if(settings.soundOn)syncSound();
document.addEventListener('visibilitychange',()=>{last=0;nextFrameAt=0;syncAudioVisibility();if(document.hidden)persist();else if(renderer||panelMode&&previewCanvas)ensureFrame();armCardIdle();});
addEventListener('pagehide',event=>{persist();if(!event.persisted)disposePage();});
function disposePage(){
  if(appDisposed)return;appDisposed=true;seasonRequest++;backgroundWarmGeneration++;
  cancelAnimationFrame(frameHandle);cancelAnimationFrame(resizeHandle);frameStarted=false;
  renderer?.dispose?.();renderer=null;scene=null;bedImage=null;
  backgroundCache.clear();backgroundSizes.clear();for(const mask of backgroundMasks.values())mask.width=mask.height=1;backgroundMasks.clear();
  spriteCache.clear();previewSprite=null;previewCanvas=null;previewFish=null;labels.width=labels.height=1;
  clearInterval(clockTimer);clearInterval(weatherTimer);clearTimeout(weatherRetryTimer);clearTimeout(persistTimer);clearTimeout(cardIdleTimer);clearTimeout(tipTimer);clearTimeout(arriveTimer);clearTimeout(toastTimer);
  citySearchController?.abort();sound.context?.close?.().catch(()=>{});
}
function setPausedState(value){paused=!!value;last=0;nextFrameAt=0;syncAudioVisibility();if(!paused&&(renderer||panelMode&&previewCanvas))ensureFrame();}
// For a host app (the macOS menu-bar item, the Windows tray): switch weather, night or sound, pause the pond, read the current state.
window.pondControl={
  set(o={}){if(has(SEASONS,o.season))selectSeason(o.season);if(['sunny','cloudy','rain','snow'].includes(o.weather)){settings.weather=o.weather;settings.autoWeather=false;weatherRequest++;}if(typeof o.night==='boolean')settings.night=o.night;if(typeof o.feedMode==='boolean')setFeedMode(o.feedMode);if(typeof o.soundOn==='boolean'){settings.soundOn=o.soundOn;syncSound();}if(typeof o.zen==='boolean')setZen(o.zen);if(typeof o.find==='string'&&scene)scene.highlight={id:o.find,until:scene.time+5};applyWeather();persist();if(activePanel==='weather')renderWeather();return this.state();},
  pause(value){setPausedState(value);return this.state();},
  state(){return{season:settings.season,weather:settings.weather,night:settings.night,autoWeather:settings.autoWeather,feedMode,soundOn:panelMode?settings.soundOn:sound.active,paused};}
};
window.__pondReady=true;
window.dispatchEvent(new Event('pond-ready'));
// The Windows host reports a tap in raw device px: once the wallpaper window lives inside the desktop,
// its own DPI reading no longer matches what the page renders at, so the page converts with the real one.
window.pondTapDevice=(x,y,controlsOnly)=>{const d=devicePixelRatio||1;window.pondTap(x/d,y/d,controlsOnly);};
window.pondHoldDevice=(x,y)=>{const d=devicePixelRatio||1;window.pondHold(x/d,y/d);};
window.pondDoubleTapDevice=(x,y)=>{const d=devicePixelRatio||1;window.pondDoubleTap(x/d,y/d);};
// The desktop wallpaper only passes a press and a release, so holding still and double-tapping are
// recognised by the host and forwarded here. (Dragging and right-clicking belong to the desktop itself:
// they select icons and open its own menu, and taking them would break that.)
window.pondHold=(x,y)=>{if(!summonLureAt(x,y))scatterFeed(x,y);};
window.pondDoubleTap=(x,y)=>{
  // While feeding, a quick second tap is just another handful — people tap the water over and over on
  // purpose, and that must not read as "frighten the fish". Watching mode keeps the double-tap fright.
  if(feedMode)feedAt(x,y);else scareBurst(x,y);
};
// A tap on the live wallpaper (CSS px): the interactive window's 投喂 switch decides between
// dropping food and startling the koi, matching a tap on the pond itself. When food is already
// piling up, a tap in 投喂 mode also falls back to a ripple rather than adding more.
// On the Windows corner wallpaper the tap is first offered to the card's controls: a plain button
// (投喂/声音/沉浸) acts on the spot, and a panel button opens its panel right here on the desktop,
// the same panel the interactive window shows — no second window.
// The Windows host also passes on a tap that landed through a see-through window lying over the card (a
// desktop clock or date widget). That one is meant for the controls it can still be seen under, so it stops
// there: it never reads as food dropped through somebody else's window.
window.pondTap=(x,y,controlsOnly)=>{
  if(!scene)return;
  // A tap on the desktop is a sign of use too: it keeps the corner card from folding while someone plays.
  cardAwake();
  if(cornerMode){
    const hit=document.elementFromPoint(x,y),control=hit?.closest('button');
    if(control){
      // The host opens the panel in its own small window, above the desktop icons. In a plain browser
      // there is no host, so the panel opens in the page instead.
      if(control.dataset.panel){
        if(window.chrome?.webview){try{window.chrome.webview.postMessage('panel:'+control.dataset.panel);}catch{}}
        else openPanel(control.dataset.panel);
      }
      else control.click();
      return;
    }
    if(controlsOnly)return;
  }
  if(scene.touchSeasons(x,y)){if(sound.active)sound.tap();return;}
  if(lanternAt(x,y))return;
  if(!simulation.isWater(x,y,4))return;
  if(feedMode&&simulation.food.length<=160)feedAt(x,y);else{scene.startle(x,y);scene.drop(x,y,9*scene.scale,.9);simulation.scare(x,y,170*scene.scale);if(sound.active)sound.tap();}
};

// Wallpaper Engine web wallpaper lifecycle and editable properties.
window.wallpaperPropertyListener={applyGeneralProperties(properties){if(properties.fps)hostFps=clamp(Number(properties.fps)||60,1,144);},applyUserProperties(properties){if(properties.weather&&['sunny','cloudy','rain','snow'].includes(properties.weather.value)){settings.weather=properties.weather.value;settings.autoWeather=false;weatherRequest++;}if(properties.speed)settings.speed=clamp(Number(properties.speed.value)||1,.3,2);if(properties.showui)setZen(!properties.showui.value);for(const [p,k] of [['water','water'],['weathersound','weatherSound']])if(properties[p])settings[k]=!!properties[p].value;if(properties.rainamount)settings.rainAmount=clamp(Number(properties.rainamount.value)||0,0,1);if(properties.snowamount)settings.snowAmount=clamp(Number(properties.snowamount.value)||0,0,1);for(const [p,k] of [['watervolume','waterVol'],['weathervolume','weatherVol']])if(properties[p])settings[k]=clamp(Number(properties[p].value)||0,0,1);if(properties.volume)settings.volume=clamp(Number(properties.volume.value)||0,0,1);applyWeather();if(properties.sound&&!!properties.sound.value!==sound.active)toggleSound();},setPaused:setPausedState};
