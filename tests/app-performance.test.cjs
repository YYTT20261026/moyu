const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../core.js');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
function section(from,to){return app.slice(app.indexOf(from),app.indexOf(to,app.indexOf(from)));}
function page(mode='panel'){
  const counts={images:0,renderers:0,audio:0,fullSprites:0,previewSprites:0,layouts:0,frames:0};
  const raf=new Map(),events=new Map(),nodes=new Map();let id=0;
  const ctx=new Proxy({}, {get(o,k){return o[k]||(o[k]=()=>{});}});
  function node(key){if(nodes.has(key))return nodes.get(key);const n={style:{setProperty(){}},classList:{add(){},remove(){},toggle(){},contains(){return false;}},dataset:{},width:300,height:150,offsetTop:0,open:false,innerHTML:'',textContent:'',dateTime:'',getContext(){return ctx;},addEventListener(type,fn){this.listeners??={};this.listeners[type]=fn;},setAttribute(){},querySelectorAll(){return[];},getBoundingClientRect(){return{height:100,width:100};},show(){this.open=true;},showModal(){this.open=true;},close(){this.open=false;this.listeners?.close?.();},append(){}};nodes.set(key,n);return n;}
  const document={hidden:false,body:node('body'),querySelector:node,querySelectorAll(){return[];},addEventListener(type,fn){events.set(type,fn);},createElement(){return node(`new${++id}`);}};
  class Image{constructor(){counts.images++;this.naturalWidth=this.width=3840;this.naturalHeight=this.height=2160;}set src(v){queueMicrotask(()=>this.onload?.());}decode(){return Promise.resolve();}}
  class Audio{constructor(){this.active=false;}configure(){}async setActive(v){counts.audio++;this.active=v;return v;}tap(){}}
  const window={chrome:{webview:{postMessage(){}}},dispatchEvent(){},PondCore:core};
  const global={window,document,console:{warn(){},info(){}},Event:class{},Image,URLSearchParams,innerWidth:1280,innerHeight:720,devicePixelRatio:2,location:{search:`?mode=${mode}`,protocol:'https:'},localStorage:{getItem(){return null;},setItem(){}},matchMedia(){return{matches:false};},setTimeout(){return ++id;},clearTimeout(){},setInterval(){return ++id;},clearInterval(){},requestAnimationFrame(fn){raf.set(++id,fn);return id;},cancelAnimationFrame(n){raf.delete(n);},addEventListener(type,fn){events.set(type,fn);},performance:{now(){return 100;}},PondCore:core,PondAudio:{PondAudio:Audio,NATURE_DEFAULTS:{},MUSIC:[],WATERS:[],applyNaturePreset(){}},PondArt:{miscSprites(preview){counts[preview?'previewSprites':'fullSprites']++;return{};},fishSprite(){return{};}},PondGL:{FISH_PPU:3.5,createRenderer(canvas){counts.renderers++;return {canvas,kind:'webgl2',resize(){},imageToScreen(x,y){return[x/2,y/2];},setFish(){},prepareBackground(){},setBackground(){},render(){counts.frames++;return true;},dispose(){}};}},PondScene:{floatMask(){return{width:1920,height:1080};},moonPhase(){return{name:'新月'};},drawKoi2D(){},PondScene:class{constructor(R){this.R=R;this.chats=[];this.events=[];}setSeason(){}layout(){counts.layouts++;}update(){}setLook(){}draw(){}shelterPoints(){return[];}}}};
  const context=vm.createContext(global);vm.runInContext(app,context);
  return{context,counts,raf,events,nodes,run(code){return vm.runInContext(code,context);}};
}
test('面板启动不解码底图、不创建渲染器或完整精灵，设置与存档同步仍可调用',async()=>{
  const p=page();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(p.counts.images,0);assert.equal(p.counts.renderers,0);assert.equal(p.counts.fullSprites,0);assert.equal(p.counts.previewSprites,1);
  p.run("pondControl=window.pondControl;pondControl.set({season:'winter',soundOn:true});");
  assert.equal(p.run('settings.season'),'winter');assert.equal(p.counts.audio,0);assert.equal(p.run('window.pondControl.state().soundOn'),true);
  const save={rev:Date.now()+100,fish:[{...core.createFish(0),name:'同步鱼',eaten:7}],settings:{season:'summer'},daily:{date:p.run('dayKey()'),count:3}};
  p.context.raw=JSON.stringify(save);p.run('window.__pondSync(raw)');assert.equal(p.run('simulation.fish[0].name'),'同步鱼');assert.equal(p.run('settings.season'),'summer');assert.equal(p.counts.renderers,0);
  assert.deepEqual([p.nodes.get('#labels').width,p.nodes.get('#labels').height],[1,1]);
});
test('面板鱼预览只在可见且开启时调度，使用30fps真实时间步，关闭后停止',()=>{
  const p=page();const dt=[];p.context.steps=dt;p.run("previewFish={};previewCanvas={};dialog.open=true;drawPreview=value=>steps.push(value);ensureFrame();");
  assert.equal(dt.length,1);let callback=p.raf.values().next().value;p.raf.clear();callback(110);assert.equal(dt.length,1);
  callback=p.raf.values().next().value;p.raf.clear();callback(135);assert.equal(dt.length,2);assert.ok(Math.abs(dt[1]-.035)<1e-8);
  p.run('dialog.open=false');callback=p.raf.values().next().value;p.raf.clear();callback(170);assert.equal(p.raf.size,0);assert.equal(p.run('frameStarted'),false);
});
test('帧率deadline在60/120/144/240Hz输入下不超过60或30fps，晚帧不追帧爆发',()=>{
  for(const target of [30,60])for(const hz of [60,120,144,240]){
    const c={lastFrameInterval:0,nextFrameAt:0};vm.runInNewContext(section('function frameDue(', '// Draw one frame'),c);
    let frames=0;for(let i=0;i<hz*10;i++)if(c.frameDue(i*1000/hz,1000/target))frames++;
    assert.ok(Math.abs(frames-target*10)<=1,`${hz}Hz ${target}fps: ${frames}`);
    assert.equal(c.frameDue(100000,1000/target),true);assert.equal(c.frameDue(100000,1000/target),false);
  }
});
test('标签画布按需保留原DPR，同尺寸resize不重设尺寸，关闭标签释放大画布',()=>{
  const p=page('corner');p.run('settings.names=true;syncLabelCanvas()');assert.deepEqual([p.nodes.get('#labels').width,p.nodes.get('#labels').height],[2560,1440]);
  p.run('settings.names=false;syncLabelCanvas()');assert.deepEqual([p.nodes.get('#labels').width,p.nodes.get('#labels').height],[1,1]);
});
test('Windows季节CPU预算淘汰旧季并保护当前/在途季，未启用预算的平台不受影响',()=>{
  const c={budgetBackdrops:true,BACKGROUND_BUDGET:64*1024*1024,backgroundCache:new Map(),backgroundSizes:new Map(),backgroundMasks:new Map(),backgroundSeason:'summer',pendingSeason:null};
  for(const s of ['spring','summer','autumn']){c.backgroundCache.set(s,Promise.resolve());c.backgroundSizes.set(s,3840*2160*4);c.backgroundMasks.set(s,{width:1920,height:1080});}
  vm.runInNewContext(section('function trimBackgroundCache(', 'let backgroundWarmGeneration'),c);c.trimBackgroundCache();
  assert.deepEqual([...c.backgroundCache.keys()],['summer']);assert.deepEqual([...c.backgroundMasks.keys()],['summer']);
  c.backgroundCache.set('winter',Promise.resolve());c.backgroundSizes.set('winter',3840*2160*4);c.pendingSeason='winter';c.trimBackgroundCache();assert.equal(c.backgroundCache.size,2);
  c.budgetBackdrops=false;c.backgroundCache.set('spring',Promise.resolve());c.trimBackgroundCache();assert.equal(c.backgroundCache.size,3);
});
test('壁纸首帧保留，暂停停止帧调度，恢复可靠唤醒且不追补暂停时间',async()=>{
  const p=page('corner');await new Promise(resolve=>setImmediate(resolve));assert.equal(p.counts.frames,1);
  p.run('setPausedState(true)');let callback=p.raf.values().next().value;p.raf.clear();callback(140);
  assert.equal(p.counts.frames,1);assert.equal(p.raf.size,0);assert.equal(p.run('frameStarted'),false);
  p.run('setPausedState(false)');assert.equal(p.counts.frames,2);assert.equal(p.raf.size,1);
  p.run('disposePage()');
});
test('resize事件合并到一帧，相同布局不重复重置场景，销毁取消调度',async()=>{
  const p=page('corner');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(p.counts.renderers,1);const layouts=p.counts.layouts;p.run('resize();resize()');assert.equal(p.counts.layouts,layouts);
  const before=p.raf.size;p.run('requestResize();requestResize();requestResize()');assert.equal(p.raf.size,before+1);
  p.run('disposePage();disposePage()');assert.equal(p.raf.size,0);assert.equal(p.run('appDisposed'),true);
});
