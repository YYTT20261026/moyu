const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const core=require('../core.js');

function renderer(kind='webgl2'){
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
  const canvas={width:1,height:1,addEventListener(){},getContext(type){return type==='webgl2'?(kind==='webgl2'?gl:null):{};}};
  const context={window:{PondCore:core},console};
  vm.runInNewContext(fs.readFileSync(require.resolve('../gl.js'),'utf8'),context);
  const image={width:2560,height:1440},mask={width:1280,height:720};
  const r=context.window.PondGL.createRenderer(canvas,image,{},null,mask);
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

for(const kind of ['webgl2','2d'])test(`${kind}：更换图片后无需 resize，坐标映射立即匹配新图`,()=>{
  const {r}=renderer(kind);r.resize(390,844,1,'high');
  const image={width:1440,height:2560};r.setBackground(image,{width:720,height:1280});
  const context={window:{PondCore:core}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../gl.js'),'utf8'),context);
  const {fitBed,bedToScreen}=context.window.PondGL;
  const bed=fitBed(image.width,image.height,390,844,kind==='webgl2');
  for(const [x,y] of [[0,0],[720,1280],[1440,2560]])assert.deepEqual(
    Array.from(r.imageToScreen(x,y)),Array.from(bedToScreen(bed,x/1440,y/2560,390,844))
  );
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
