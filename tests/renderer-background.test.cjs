const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const core=require('../core.js');

function renderer(kind='webgl2',bed,design){
  const calls=[],constants=new Map();let id=0;
  const gl=new Proxy({}, {get(_,name){
    if(typeof name==='string'&&name===name.toUpperCase()){
      if(!constants.has(name))constants.set(name,++id);return constants.get(name);
    }
    return (...args)=>{
      calls.push([name,...args]);
      if(name.startsWith('create'))return {id:++id};
      if(name==='getExtension'||name==='getShaderParameter'||name==='getProgramParameter')return true;
      if(name==='checkFramebufferStatus')return gl.FRAMEBUFFER_COMPLETE;
      if(name==='getUniformLocation')return args[1];
    };
  }});
  const canvasContext=()=>new Proxy({globalCompositeOperation:'source-over',globalAlpha:1},{get(target,name){
    if(name in target)return target[name];
    return (...args)=>{
      calls.push(['2d',name,target.globalCompositeOperation,...args]);
      if(name==='getImageData')return {data:new Uint8ClampedArray([255,0,0,255,0,255,255,255,128,0,0,128])};
    };
  }});
  const ctx=canvasContext();
  const canvas={width:1,height:1,addEventListener(){},getContext(type){return type==='webgl2'?(kind==='webgl2'?gl:null):ctx;}};
  const context={window:{PondCore:core},console,document:{createElement(){const context=canvasContext();return {width:1,height:1,getContext(){return context;}};}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../gl.js'),'utf8'),context);
  const image=bed||{width:2560,height:1440},mask={width:image.width/2,height:image.height/2};
  const r=context.window.PondGL.createRenderer(canvas,image,{},null,mask,design);
  assert.equal(r.kind,kind);
  return {r,calls,image,mask,canvas};
}

test('季节预热只上传一次纹理，反复切换不分配帧缓冲、不重传图片、不改变画布大小',()=>{
  const {r,calls,image,mask,canvas}=renderer();r.resize(1280,720,2,'high');
  const summer={width:2560,height:1440},summerMask={width:1280,height:720};
  calls.length=0;r.prepareBackground(summer,summerMask);
  assert.equal(calls.filter(c=>c[0]==='texImage2D').length,2);
  calls.length=0;
  const size=[canvas.width,canvas.height];
  for(let i=0;i<30;i++){
    r.prepareBackground(summer,summerMask);
    r.setBackground(i%2?image:summer,i%2?mask:summerMask);
    r.resize(1280,720,2,'high');
  }
  assert.equal(calls.length,0,'缓存切换与相同尺寸 resize 应不发出 GPU 分配或上传命令');
  assert.deepEqual([canvas.width,canvas.height],size);
  r.resize(390,844,2,'high');
  assert.ok(calls.some(c=>c[0]==='createFramebuffer'),'真实窗口变化仍须重建渲染尺寸');
  assert.ok(calls.some(c=>c[0]==='deleteFramebuffer'),'释放旧尺寸缓冲');
});

test('阴雨雪切回晴天清空已有云影贴图，晴天不生成云影，多云可恢复',()=>{
  const {r,calls}=renderer();r.resize(1280,720,1,'high');
  const context={window:{PondCore:core}};
  for(const file of ['art.js','scene.js'])vm.runInNewContext(fs.readFileSync(require.resolve(`../${file}`),'utf8'),context);
  const env=(weather,night=false)=>Object.assign(context.window.PondScene.lookFor(weather,night),{sun:[-.45,.45,.77],shadowDir:[.7,.72],cloudWind:[20,-7],moonDisc:[0,0,1,0],causticCell:90});
  for(const night of [false,true])for(const weather of ['cloudy','rain','snow']){
    calls.length=0;r.render(0,1/60,env(weather,night));
    const coverAt=calls.findIndex(c=>c[0]==='uniform1f'&&c[1]==='uCover'&&c[2]>0);
    assert.ok(coverAt>=0,`${weather} 生成云影`);
    const cloudTarget=calls.slice(0,coverAt).findLast(c=>c[0]==='bindFramebuffer')[2];
    for(let frame=0;frame<2;frame++){
      calls.length=0;r.render(frame+1,1/60,env('sunny',night));
      const cloudAt=calls.findIndex(c=>c[0]==='bindFramebuffer'&&c[2]===cloudTarget);
      assert.ok(cloudAt>=0,'使用同一云影缓冲');
      const end=calls.findIndex((c,i)=>i>cloudAt&&c[0]==='bindFramebuffer');
      const cloudPass=calls.slice(cloudAt+1,end);
      assert.ok(cloudPass.some(c=>c[0]==='clearColor'&&c.slice(1).join(',')==='0,0,0,1'),'云影贴图清为全亮水面的零遮影值');
      assert.ok(cloudPass.some(c=>c[0]==='clear'));
      assert.ok(!cloudPass.some(c=>c[0]==='drawArrays'||c[0]==='drawElements'),'晴天直接清空，不运行云噪声生成');
      assert.ok(!calls.some(c=>c[0]==='uniform1f'&&c[1]==='uCover'));
    }
    calls.length=0;r.render(3,1/60,env('cloudy',night));
    assert.ok(calls.some(c=>c[0]==='uniform1f'&&c[1]==='uCover'&&c[2]>0),'切回多云恢复动态云影');
  }
});

for(const kind of ['webgl2','2d'])test(`${kind}：8K 底图仍按 2560×1440 标注尺度映射，切换底图不移动荷叶与鱼`,()=>{
  const small=renderer(kind);small.r.resize(1280,720,1,'high');
  const big=renderer(kind,{width:7680,height:4320},{width:2560,height:1440});big.r.resize(1280,720,1,'high');
  for(const [x,y] of [[0,0],[110,365],[690,930],[2560,1440]])assert.deepEqual(
    Array.from(big.r.imageToScreen(x,y)),Array.from(small.r.imageToScreen(x,y)),'8K 底图与设计尺度的屏幕位置一致'
  );
  big.r.setBackground({width:7680,height:4320},{width:2560,height:1440});
  for(const [x,y] of [[0,0],[110,365],[2560,1440]])assert.deepEqual(
    Array.from(big.r.imageToScreen(x,y)),Array.from(small.r.imageToScreen(x,y)),'换底图后无需 resize'
  );
});

test('8K 底图切换四季：荷叶、鱼食与锦鲤都留在鱼塘水域',()=>{
  const {r}=renderer('webgl2',{width:7680,height:4320},{width:2560,height:1440});r.resize(1280,720,1,'high');
  const context={window:{PondCore:core},ImageData:class{constructor(w,h){this.width=w;this.height=h;this.data=new Uint8ClampedArray(w*h*4);}}};
  for(const file of ['art.js','scene.js'])vm.runInNewContext(fs.readFileSync(require.resolve(`../${file}`),'utf8'),context);
  const random=core.randomSeed(41),fish=Array.from({length:8},(_,i)=>core.createFish(i,random));
  const sim=new core.PondSimulation(fish,1280,720,random);
  const scene=new context.window.PondScene.PondScene(r,sim);
  for(const season of ['summer','autumn','winter','spring']){
    r.setBackground({width:7680,height:4320},{width:2560,height:1440});
    scene.setSeason(season);scene.layout(1280,720);
    assert.ok(scene.lotusPlants.length>0,`${season} 有荷叶`);
    for(const p of scene.lotusPlants)assert.ok(sim.isWater(p.x,p.y,p.r),`${season} 荷叶完整轮廓留在水面`);
    for(const f of sim.fish)assert.ok(sim.isWater(f.x*1280,f.y*720,sim.fishMargin(f)),`${season} 锦鲤留在水面`);
    const feed=sim.habitat.project(640,360,5);
    assert.ok(feed&&sim.isWater(...feed,4),`${season} 池心可投喂`);
  }
});

for(const kind of ['webgl2','2d'])test(`${kind}：更换图片后无需 resize，坐标映射立即匹配新图`,()=>{
  const {r}=renderer(kind);r.resize(390,844,1,'high');
  const image={width:1440,height:2560};r.setBackground(image,{width:720,height:1280});
  const context={window:{PondCore:core}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../gl.js'),'utf8'),context);
  const {fitBed,bedToScreen}=context.window.PondGL;
  const bed=fitBed(image.width,image.height,390,844,true);
  for(const [x,y] of [[0,0],[720,1280],[1440,2560]])assert.deepEqual(
    Array.from(r.imageToScreen(x,y)),Array.from(bedToScreen(bed,x/1440,y/2560,390,844))
  );
});

test('Canvas：仅红通道遮挡水下层，荷花与空中层不被擦除，季节遮罩只提取一次',()=>{
  const {r,calls,image,mask}=renderer('2d');r.resize(1280,720,1,'high');
  calls.length=0;r.prepareBackground(image,mask);
  const pixels=calls.find(c=>c[0]==='2d'&&c[1]==='putImageData')[3].data;
  assert.deepEqual([pixels[3],pixels[7],pixels[11]],[255,0,64],'阴影与湿边不是前景，边缘 alpha 保留');
  const sprite=(name)=>({canvas:{name,width:10,height:10},ppu:1,px:.5,py:.5});
  const under=sprite('under'),lotus=sprite('lotus'),air=sprite('air');
  calls.length=0;
  for(let frame=0;frame<2;frame++){
    r.sprite('under',under,500,100,0,1,1);
    r.plant('plants',lotus,500,100,0,1,1,0,true,1);
    r.sprite('air',air,500,100,0,1,1);
    r.render(frame/60,1/60);
  }
  const draws=calls.filter(c=>c[0]==='2d'&&c[1]==='drawImage');
  const cut=draws.findIndex(c=>c[2]==='destination-out');
  assert.ok(cut>0&&draws[cut-1][3]===under.canvas,'先画水下鱼，再擦除前景区域');
  assert.ok(draws[cut+1][3]===lotus.canvas,'荷花在前景遮挡之后绘制');
  assert.ok(draws.some(c=>c[3]===air.canvas&&c[2]==='source-over'),'空中层仍在上方');
  assert.equal(calls.filter(c=>c[1]==='getImageData').length,0,'连续渲染复用遮罩');
  const nextMask={width:1280,height:720};r.setBackground(image,nextMask);r.render(1,1/60);
  assert.equal(calls.filter(c=>c[1]==='getImageData').length,1,'换季更新遮挡');
});

for(const [w,h,mode] of [[1280,720,'auto'],[390,844,'auto'],[2560,720,'dual']])test(`Canvas 前景遮罩与底图坐标一致：${w}×${h} ${mode}`,()=>{
  const {r,calls,mask}=renderer('2d',{width:7680,height:4320},{width:2560,height:1440});
  r.resize(w,h,2,'high',mode);calls.length=0;r.render(0,1/60);
  const matrix=calls.find(c=>c[0]==='2d'&&c[1]==='transform').slice(3);
  const [a,b,c,d,e,f]=matrix;
  for(const [u,v] of [[0,0],[.8,.2],[1,1]]){
    const actual=[a*u*mask.width+c*v*mask.height+e,b*u*mask.width+d*v*mask.height+f];
    const expected=r.imageToScreen(u*2560,v*1440);
    actual.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<1e-8));
  }
});

test('Canvas CSS 底图同步前景遮罩的旋转裁切，切回 WebGL 清除后备样式',()=>{
  const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
  const sync=source.slice(source.indexOf('function syncBackdrop(){'),source.indexOf('function resize(){'));
  for(const [w,h,mode] of [[1280,720,'auto'],[390,844,'auto'],[2560,720,'dual']]){
    const {r}=renderer('2d',{width:7680,height:4320},{width:2560,height:1440});r.resize(w,h,1,'high',mode);
    const bed={style:{}},context={renderer:r,POND_MAP:core.POND_MAP,$(){return bed;}};
    vm.runInNewContext(`${sync}\nsyncBackdrop();`,context);
    assert.equal(bed.style.backgroundSize,'100% 100%');
    const [a,b,c,d,e,f]=bed.style.transform.slice(7,-1).split(',').map(Number);
    for(const [x,y] of [[0,0],[2100,300],[2560,1440]]){
      const expected=r.imageToScreen(x,y),actual=[a*x+c*y+e,b*x+d*y+f];
      actual.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<1e-8,'CSS 底图与鱼、前景遮罩一致'));
    }
    context.renderer={kind:'webgl2'};vm.runInNewContext('syncBackdrop();',context);
    for(const key of ['width','height','transform','transformOrigin','backgroundSize'])assert.equal(bed.style[key],'');
  }
});

test('植物网格弯曲保留根部，绑定水面斜率且连续动画不重新上传贴图',()=>{
  const {r,calls}=renderer();r.resize(1280,720,1,'high');
  const context={window:{PondCore:core}};
  for(const file of ['art.js','scene.js'])vm.runInNewContext(fs.readFileSync(require.resolve(`../${file}`),'utf8'),context);
  const env=context.window.PondScene.lookFor('sunny',false);
  Object.assign(env,{sun:[-.45,.45,.77],shadowDir:[.7,.72],cloudWind:[20,-7],moonDisc:[0,0,1,0],causticCell:90});
  const def={w:120,h:172,ppu:2,px:.5,py:1,u0:.1,v0:.2,u1:.2,v1:.3};
  calls.length=0;
  for(let frame=0;frame<3;frame++){
    r.plant('plants',def,400,600,0,1,1,5,false,1);
    r.render(frame/60,1/60,env);
    const mesh=calls.filter(c=>c[0]==='bufferData'&&c[2]?.length===63*16).at(-1)[2];
    assert.ok(Array.from(mesh).every(Number.isFinite));
    assert.equal(mesh[0],375,'顶端向风弯曲 5 像素');
    assert.equal(mesh[54*16],370,'底端保留原来的根部位置');
    assert.equal(mesh[15],-2,'植物标记与锦鲤的光泽数据分开');
  }
  assert.ok(calls.some(c=>c[0]==='uniform1i'&&c[1]==='uPlantSurface'&&c[2]===3));
  assert.equal(calls.filter(c=>c[0]==='texImage2D'||c[0]==='texSubImage2D'||c[0]==='createTexture').length,0);
});
