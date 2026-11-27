const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../core.js');
const drifters=require('../assets/drifting-flora.json');
const context={window:{PondCore:core,POND_DRIFTERS:drifters},ImageData:class{constructor(w,h){this.width=w;this.height=h;this.data=new Uint8ClampedArray(w*h*4);}}};
for(const file of ['gl.js','art.js','scene.js'])vm.runInNewContext(fs.readFileSync(require.resolve(`../${file}`),'utf8'),context);
const {fitBed,bedToScreen}=context.window.PondGL;
const {PondScene}=context.window.PondScene;
function layout(season,w,h,turn=true){
  const map=core.POND_MAPS[season],bed=fitBed(map.width,map.height,w,h,turn);
  const imageToScreen=(x,y)=>bedToScreen(bed,x/map.width,y/map.height,w,h);
  return {imageToScreen,habitat:new core.PondHabitat(w,h,imageToScreen,map)};
}
const settings={weather:'sunny',night:false,turtles:false,butterflies:false,crabs:false,rainAmount:.5,snowAmount:.5};

test('8K 底图只在 file:// 页面内嵌，http(s) 直接加载 PNG，静态构建包含缩略图',()=>{
  // 底图单独放在 pond-bed.js：只有 file://（双击打开、Android、macOS、Wallpaper Engine）才需要这份
  // base64，http(s) 页面（Windows 壁纸的虚拟域名、开发服务器、网站）直接读 assets 里的 PNG。
  const bed={window:{}},context={window:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/pond-bed.js'),'utf8'),bed);
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/pond-data.js'),'utf8'),context);
  assert.equal(bed.window.POND_IMAGES && Object.keys(bed.window.POND_IMAGES).length,4);
  assert.ok(!('POND_IMAGES' in context.window),'启动即解析的 pond-data.js 不再夹杂底图');
  assert.ok(fs.statSync(require.resolve('../assets/pond-data.js')).size<4e6,'pond-data.js 只保留荷花与花叶');
  const index=fs.readFileSync(require.resolve('../index.html'),'utf8');
  assert.ok(index.includes("location.protocol==='file:'")&&index.includes('assets/pond-bed.js'),'内嵌底图按协议按需加载');
  for(const [season,info] of Object.entries(core.SEASONS)){
    const data=Buffer.from(bed.window.POND_IMAGES[season].split(',')[1],'base64');
    assert.equal(data.subarray(1,4).toString(),'PNG');
    // 岸线、石头、荷叶与鱼标注在 POND_MAPS 的 2560×1440 设计尺度上；底图可以是 8K，
    // 只要宽高比与设计尺度一致，渲染器就会把同一份标注映射到同一处水面。
    const map=core.POND_MAPS[season],w=data.readUInt32BE(16),h=data.readUInt32BE(20);
    assert.equal(w*map.height,h*map.width,`${season} 运行底图宽高比应与标注尺度一致`);
    assert.ok(w>=map.width&&h>=map.height,`${season} 运行底图不应低于标注尺度`);
    assert.deepEqual(data,fs.readFileSync(require.resolve(`../${info.image}`)));
    assert.deepEqual(data,fs.readFileSync(require.resolve(`../dist/${info.image}`)));
    const thumbnail=fs.readFileSync(require.resolve(`../${info.thumbnail}`));
    assert.ok(thumbnail.length<data.length*.05,'季节预览使用小图，避免再次解码完整底图');
    assert.deepEqual(thumbnail,fs.readFileSync(require.resolve(`../dist/${info.thumbnail}`)));
  }
  assert.equal(bed.window.POND_IMAGE,bed.window.POND_IMAGES.spring);
  assert.deepEqual(fs.readFileSync(require.resolve('../dist/assets/pond-bed.js')),fs.readFileSync(require.resolve('../assets/pond-bed.js')),'双击 dist/index.html 仍可离线加载 8K 底图');
  const lotus=Buffer.from(context.window.POND_LOTUS_IMAGE.split(',')[1],'base64');
  assert.equal(lotus.subarray(1,4).toString(),'PNG');
  assert.deepEqual(lotus,fs.readFileSync(require.resolve('../assets/lotus-original.png')));
  assert.deepEqual(lotus,fs.readFileSync(require.resolve('../dist/assets/lotus-original.png')));
  const driftImage=Buffer.from(context.window.POND_DRIFT_IMAGE.split(',')[1],'base64');
  assert.equal(driftImage.subarray(1,4).toString(),'PNG');
  assert.deepEqual(driftImage,fs.readFileSync(require.resolve('../assets/drifting-flora.png')));
  assert.deepEqual(driftImage,fs.readFileSync(require.resolve('../dist/assets/drifting-flora.png')));
  assert.equal(JSON.stringify(context.window.POND_DRIFTERS),JSON.stringify(drifters));
  assert.deepEqual(fs.readFileSync(require.resolve('../assets/drifting-flora.json')),fs.readFileSync(require.resolve('../dist/assets/drifting-flora.json')));
});

test('Android 打包使用手机尺寸底图，不把 8K 底图与 169MB 内嵌脚本塞进 APK',()=>{
  const script=fs.readFileSync(require.resolve('../scripts/build-android.sh'),'utf8');
  assert.ok(script.includes('scripts/prepare-mobile.py'),'APK 应先按手机尺寸生成底图');
  assert.ok(script.includes('build/mobile/pond-bed.js'),'内嵌底图来自手机版本');
  assert.ok(script.includes('build/mobile/stills/pond*.png'),'静态兜底画面与 CSS 背景用手机尺寸 PNG');
  assert.ok(!script.includes('$ROOT/assets/pond-bed.js'),'不能打包 169MB 的 8K 内嵌脚本');
  assert.ok(!/assets\/pond\*runtime\.png/.test(script),'不能把 8K PNG 打进 APK');
  const mobile=fs.readFileSync(require.resolve('../scripts/prepare-mobile.py'),'utf8');
  assert.ok(/SIZE\s*=\s*\(2560,\s*1440\)/.test(mobile),'手机底图保持 2560×1440 标注尺度');
});

for(const [w,h,turn] of [[1280,720,true],[390,844,true],[390,844,false]])test(`${w}×${h} ${turn?'WebGL':'Canvas'}：四季散落花叶持续漂移旋转，受到水波推动也不越过岸边和石头`,()=>{
  const rnd=core.randomSeed(292),sim=new core.PondSimulation([],w,h,rnd,[],false);
  const R={imageToScreen:(x,y)=>[x,y],drop(){}};
  const scene=new PondScene(R,sim,rnd);
  for(const season of Object.keys(core.SEASONS)){
    R.imageToScreen=layout(season,w,h,turn).imageToScreen;
    scene.setSeason(season);scene.layout(w,h);
    const visible=scene.drifters.filter(p=>p.visible),starts=visible.map(p=>[p.x,p.y,p.a]);
    assert.ok(visible.length>3,`${season} 有可见的原画花叶`);
    for(let frame=0;frame<600;frame++){
      if(frame%120===0)for(const p of visible)scene.drop(p.x-12*scene.scale,p.y,6*scene.scale,.9);
      scene.update(1/30,settings);
      for(const p of visible)assert.ok(sim.isWater(p.x,p.y,p.r),`${season} 完整花叶轮廓保持在水中`);
      for(const p of scene.petals)assert.ok(sim.isWater(p.x,p.y,p.r),`${season} 新落下的花瓣也不越界`);
    }
    assert.ok(visible.filter((p,i)=>Math.hypot(p.x-starts[i][0],p.y-starts[i][1])>10*scene.scale).length>visible.length*.5,`${season} 应发生可见的漂移`);
    assert.ok(visible.some((p,i)=>Math.abs(p.a-starts[i][2])>.2),`${season} 花叶轻微旋转`);
    assert.equal(scene.drifters.length,drifters[season].length,'持续漂移不复制或增殖花叶');
  }
});

test('漂浮花叶保留移动后的图片坐标，窗口旋转和换季不残留旧对象或漂上石头',()=>{
  const rnd=core.randomSeed(613),sim=new core.PondSimulation([],1280,720,rnd,[],false);
  const R={imageToScreen:layout('summer',1280,720).imageToScreen,drop(){}};
  const scene=new PondScene(R,sim,rnd);scene.setSeason('summer');scene.layout(1280,720);
  const p=scene.drifters.find(p=>p.visible);
  const initial=[p.ix,p.iy];
  scene.drop(p.x-5,p.y,10,1);
  assert.ok(p.vx>0,'水波能推动提取的花叶');
  for(let frame=0;frame<90;frame++)scene.update(1/30,settings);
  assert.ok(Math.hypot(p.ix-initial[0],p.iy-initial[1])>1);
  const before=[p.x,p.y,p.ix,p.iy];scene.layout(1280,720);
  assert.ok(Math.hypot(p.x-before[0],p.y-before[1])<1e-6,'相同布局不会把花叶放回原图位置');
  R.imageToScreen=layout('summer',390,844).imageToScreen;scene.layout(390,844);
  for(const p of scene.drifters.filter(p=>p.visible))assert.ok(sim.isWater(p.x,p.y,p.r));
  const old=scene.drifters;
  R.imageToScreen=layout('winter',390,844).imageToScreen;scene.setSeason('winter');scene.layout(390,844);
  assert.ok(scene.drifters.every(p=>p.sprite.startsWith('driftWinter')&&!old.includes(p)));
  assert.equal(scene.petals.length,0,'换季清除上一季落下的花瓣');
});

test('各季节独立标注石头，夏秋冬旧春季石头位置成为可游水域',()=>{
  const rockCenter=season=>{
    const rock=core.POND_MAPS[season].rocks[0];
    return rock.reduce((p,[u,v])=>[p[0]+u/rock.length,p[1]+v/rock.length],[0,0]).map((v,i)=>v*(i?1440:2560));
  };
  for(const season of Object.keys(core.SEASONS)){
    const {habitat}=layout(season,2560,1440);
    assert.equal(habitat.contains(...rockCenter(season)),false);
    assert.equal(habitat.contains(1280,720,40),true);
    assert.equal(habitat.contains(300,150),false);
    if(season!=='spring')assert.equal(habitat.contains(...rockCenter('spring'),10),true);
  }
});

test('四季上方露出水面的石头不属于水域，周围仍是可游水面',()=>{
for(const season of Object.keys(core.SEASONS)){
    const {habitat}=layout(season,2560,1440);
    for(const rock of core.POND_MAPS[season].rocks){
      const [u,v]=rock.reduce((s,p)=>[s[0]+p[0]/rock.length,s[1]+p[1]/rock.length],[0,0]);
      assert.equal(habitat.contains(u*2560,v*1440),false,`${season} 标注石头中心 (${u*2560},${v*1440})`);
    }
    assert.equal(habitat.contains(1200,760,20),true,`${season} 石头下方应保留水面`);
    assert.ok(core.POND_MAPS[season].rocks.length>=1,`${season} 应标注露出水面的石头`);
  }
  const {habitat}=layout('spring',2560,1440);
  const water=(x,y)=>habitat.sample(x/2048*2560,y/1152*1440);
  for(const [u,v] of core.POND_MAPS.spring.rocks[0].slice(4,9)){
    const x=u*2560,y=v*1440;
    assert.ok(Math.abs(habitat.sample(x,y).distance)<1e-6,`春图石头黄边 (${x},${y}) 应成为水位线`);
  }
  const rock=core.POND_MAPS.spring.rocks[0];
  const [ru,rv]=rock.reduce((s,p)=>[s[0]+p[0]/rock.length,s[1]+p[1]/rock.length],[0,0]);
  assert.ok(habitat.sample(ru*2560,rv*1440).distance<0,'标注石头内部应属于障碍');
  assert.ok(habitat.contains(ru*2560-320,rv*1440-60,20),'标注石头旁仍保留可游水面');
});

test('切换季节保留水中的鱼食，清除新石头位置的鱼食并立即移回鱼群',()=>{
  const sim=new core.PondSimulation([core.createFish(0,core.randomSeed(17))],2560,1440);
  sim.setHabitat(layout('spring',2560,1440).habitat);
  const rock=[1975,880],open=[1280,720];
  assert.equal(sim.isWater(...rock,4),true);
  assert.equal(sim.feed(...rock,1),true);assert.equal(sim.feed(...open,1),true);
  sim.fish[0].x=rock[0]/2560;sim.fish[0].y=rock[1]/1440;
  sim.setHabitat(layout('winter',2560,1440).habitat);
  assert.equal(sim.food.length,1);
  assert.ok(sim.isWater(sim.fish[0].x*2560,sim.fish[0].y*1440,sim.fishMargin(sim.fish[0])));
});

for(const [w,h,turn] of [[1280,720,true],[390,844,true],[390,844,false]]){
  test(`${w}×${h} ${turn?'WebGL':'Canvas'}：四季植物在风雨与连续水波中摆动，完整摆幅不越过岸线`,()=>{
    const rnd=core.randomSeed(73),sim=new core.PondSimulation([],w,h,rnd,[],false);
    const R={imageToScreen:(x,y)=>[x,y],drop(){}};
    const scene=new PondScene(R,sim,rnd);
    for(const season of Object.keys(core.SEASONS)){
      R.imageToScreen=layout(season,w,h,turn).imageToScreen;
      scene.setSeason(season);scene.layout(w,h);scene.setLook('rain',false,undefined,{rainAmount:1});scene.look.rainK=1;
      const xs=[];
      for(let frame=0;frame<360;frame++){
        if(frame%12===0)for(const p of scene.lotusPlants)scene.drop(p.x+15*scene.scale,p.y,9*scene.scale,1);
        scene.time+=1/30;scene.updatePlants(1/30);
        for(const p of scene.lotusPlants){
          const pose=scene.plantPose(p);
          assert.ok(sim.isWater(pose.x,pose.y-p.rootOffset,p.r+Math.abs(pose.bend)+4*scene.scale),`${season} 晃动和水面变形仍应留在水域`);
        }
        xs.push(scene.plantPose(scene.lotusPlants[0]).x);
      }
      assert.ok(Math.max(...xs)-Math.min(...xs)>4*scene.scale,`${season} 应有可见摆动`);
      assert.ok(scene.plantRipples.length<=96,'连续波纹的待处理事件有数量上限');
    }
  });
  test(`${w}×${h} ${turn?'WebGL':'Canvas'}：带鱼群与鱼食切换四季，鱼身保持在水域并能吃到石边食物`,()=>{
    const rnd=core.randomSeed(174),fish=Array.from({length:24},(_,i)=>core.createFish(i,rnd));
    fish[0].size=1.5;
    const sim=new core.PondSimulation(fish,w,h,rnd);
    sim.scale=core.clamp(Math.min(w,h)/720,.66,1.25);
    const R={imageToScreen:(x,y)=>[x,y],drop(){}};
    const scene=new PondScene(R,sim,rnd);
    for(const season of ['summer','autumn','winter','spring']){
      R.imageToScreen=layout(season,w,h,turn).imageToScreen;
      scene.setSeason(season);scene.layout(w,h);scene.update(0,settings);
      for(const p of scene.lotusPlants){
        assert.ok(sim.isWater(p.x,p.y,p.r),`${season} 荷花植物的完整轮廓应落在水中`);
        assert.ok(p.x>0&&p.x<w&&p.y>0&&p.y<h,`${season} 荷花应留在可见画面内`);
      }
      for(const c of scene.crabs)assert.equal(c.homes,scene.crabHomeDefs);
      const rock=core.POND_MAPS[season].rocks[0];
      const center=rock.reduce((p,[u,v])=>[p[0]+u/rock.length,p[1]+v/rock.length],[0,0]);
      const at=R.imageToScreen(center[0]*2560,center[1]*1440);
      assert.equal(sim.feed(...at),false,'石头上不能投食');
      const feed=sim.habitat.project(...at,5),eaten=sim.totalEaten;
      assert.equal(sim.feed(...feed),true);
      for(let frame=0;frame<1490&&sim.food.length;frame++){
        sim.step(1/60);
        if(frame%30===0)for(const f of sim.fish){
          const pose=core.fishPose(f,f.size*sim.scale);
          for(let i=0;i<pose.length;i+=4)assert.ok(sim.isWater(pose[i],pose[i+1],core.BODY.half*f.size*sim.scale),`${season} 鱼身越界`);
        }
        for(const p of sim.food)assert.ok(sim.isWater(p.x,p.y,4));
      }
      assert.equal(sim.totalEaten-eaten,9,`${season} 石边鱼食应被吃完`);
    }
  });
}

test('投食水波传播到荷叶后产生弹性起伏、逐渐回稳，换季不残留旧水波',()=>{
  const rnd=core.randomSeed(11),sim=new core.PondSimulation([],1280,720,rnd,[],false);
  const R={imageToScreen:layout('summer',1280,720).imageToScreen,drop(){}};
  const scene=new PondScene(R,sim,rnd);scene.setSeason('summer');scene.layout(1280,720);
  const p=scene.lotusPlants[0];
  scene.drop(p.x+120*scene.scale,p.y,9*scene.scale,.9);
  assert.equal(p.vx,0);assert.ok(scene.plantRipples.some(hit=>hit.p===p&&hit.at>scene.time));
  let movement=0;
  for(let i=0;i<120;i++){scene.time+=1/60;scene.updatePlants(1/60);movement=Math.max(movement,Math.abs(p.ox),Math.abs(p.bend));}
  assert.ok(movement>.2,'水波会推动叶片，而非只有固定周期摆动');
  for(let i=0;i<600;i++){scene.time+=1/60;scene.updatePlants(1/60);}
  assert.ok(Math.abs(p.ox)<.005&&Math.abs(p.bend)<.005&&Math.abs(p.ja)<.005,'停止扰动后回稳');
  scene.time=3;
  scene.setLook('sunny',false);const calm=scene.plantPose(p);
  scene.setLook('rain',false,undefined,{rainAmount:1});scene.look.rainK=1;const storm=scene.plantPose(p);
  assert.ok(Math.abs(storm.angle-p.angle)>Math.abs(calm.angle-p.angle)*1.3,'风雨天摆动比晴天大');
  scene.drop(p.x,p.y,9*scene.scale,1);
  scene.setSeason('winter');R.imageToScreen=layout('winter',1280,720).imageToScreen;scene.layout(1280,720);
  assert.equal(scene.plantRipples.length,0);assert.ok(scene.lotusPlants.every(p=>p.bend===0&&p.ox===0));
});

test('季节缩略图同步解码，面板打开或重绘时不留空框',()=>{
  // 页面里仅有的 <img> 就是这四张预览图。异步解码会先把尚未解码的图画成空框、稍后再补画；
  // 面板在池塘准备 8K 底图时打开或重渲染，补画偶尔丢失，四个季节按钮就一直是空白。
  const app=fs.readFileSync(require.resolve('../app.js'),'utf8').replace(/^\s*\/\/.*$/gm,'');
  const tags=app.match(/<img\s[^>]*>/g)||[];
  assert.ok(tags.length>0,'四季预览仍是 <img>');
  assert.ok(tags.every(tag=>tag.includes('${s.thumbnail}')),'只有季节预览用到 <img>');
  assert.ok(tags.every(tag=>tag.includes('decoding="sync"')),'页面里的 <img> 一律同步解码');
  assert.ok(!app.includes('decoding="async"'));
});
