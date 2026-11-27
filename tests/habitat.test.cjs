const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const core = require('../core.js');
const { PondSimulation, PondHabitat, POND_MAP, createFish, randomSeed, fishPose, BODY } = core;
const context = { window: { PondCore: core } };
vm.runInNewContext(fs.readFileSync(require.resolve('../gl.js'), 'utf8'), context);
const { fitBed, bedToScreen } = context.window.PondGL;
function layout(w,h,allowTurn=true) {
  const bed=fitBed(POND_MAP.width,POND_MAP.height,w,h,allowTurn);
  const transform=(x,y)=>bedToScreen(bed,x/POND_MAP.width,y/POND_MAP.height,w,h);
  return {habitat:new PondHabitat(w,h,transform),transform};
}
const at=([x,y])=>[x,y];

// Reference points on the 2048×1152 paintings: solid protruding lower-right
// boulder, neighbouring clear water, and water previously covered by a rock ellipse.
const shoreReferences={
  spring:{dry:[1350,940],water:[[1280,920],[1008,990],[100,510]]},
  summer:{dry:[1360,900],water:[[1250,910],[1008,1095],[100,530]]},
  autumn:{dry:[1270,1010],water:[[1190,990],[1450,775],[100,470]]},
  winter:{dry:[1270,950],water:[[1200,930],[1590,800],[100,445]]}
};
for(const [season,ref] of Object.entries(shoreReferences))test(`${season}：凸出的岸石与清水参考点在横屏、竖屏、双屏保持同一岸线`,()=>{
  const map=core.POND_MAPS[season];
  for(const [w,h,mode]of [[1280,720,'auto'],[390,844,'auto'],[2560,720,'dual']]){
    const bed=fitBed(7680,4320,w,h,true,mode),transform=(x,y)=>bedToScreen(bed,x/map.width,y/map.height,w,h);
    const screen=([x,y])=>transform(x*1.25,y*1.25);
    const signed=p=>{
      const [x,y]=screen(p);
      // Move the reference and all contours into a padded viewport: a dual-screen
      // crop may hide a point, but must not change the artwork's water classification.
      const padded=new PondHabitat(10000,10000,(ix,iy)=>{const [px,py]=transform(ix,iy);return [px+4000,py+4000];},map);
      return padded.sample(x+4000,y+4000).distance;
    };
    assert.ok(signed(ref.dry)<0,'出水岸石不能再接受水层或投喂');
    for(const p of ref.water)assert.ok(signed(p)>0,`清水 ${p} 不应被粗略椭圆遮住`);
  }
});

function bankEncounter({fps=60,speed=1,angle=0,corner=false,rock=false,seconds=1}={}) {
  const w=1000,h=700,f=createFish(0,()=>.5);
  Object.assign(f,{size:1,baseSize:1,x:rock?.36599:.91599,y:corner?.87999:.5,angle});
  const pond=new PondSimulation([f],w,h,()=>.5);
  const map={width:w,height:h,water:[[0,0],[1,0],[1,1],[0,1]],rocks:rock?[[[.45,.35],[.55,.35],[.55,.65],[.45,.65]]]:[]};
  pond.setHabitat(new PondHabitat(w,h,(x,y)=>[x,y],map));pond.step(0);
  Object.assign(f,{v:46,turn:0,cruise:.4,bankHold:0,goal:{x:rock?.8:.2,y:corner?.2:.5},goalTime:10});
  const start=[f.x*w,f.y*h],initialSpine=f.spine;
  let minSpeed=f.v,longestStop=0,stop=0,travel=0,maxAngleStep=0,maxNoseStep=0,resets=0;
  for(let i=0;i<fps*seconds;i++){
    const x=f.x*w,y=f.y*h,angle=f.angle,spine=f.spine,nose=[spine[0],spine[1]];
    pond.step(1/fps,speed);
    const distance=Math.hypot(f.x*w-x,f.y*h-y);
    travel+=distance;stop=distance<.001?stop+1:0;longestStop=Math.max(longestStop,stop/fps);
    minSpeed=Math.min(minSpeed,f.v);resets+=f.spine!==spine?1:0;
    maxAngleStep=Math.max(maxAngleStep,Math.abs(core.wrap(f.angle-angle)));
    maxNoseStep=Math.max(maxNoseStep,Math.hypot(f.spine[0]-nose[0],f.spine[1]-nose[1]));
    assert.ok(pond.isWater(f.x*w,f.y*h,pond.fishMargin(f)),'触边滑行仍保留全鱼体安全距离');
    const pose=fishPose(f,1);
    assert.ok(pose.every(Number.isFinite));
    for(let j=0;j<pose.length;j+=4)assert.ok(pond.isWater(pose[j],pose[j+1],BODY.half),'转身尾摆仍在水域');
    let length=0;
    for(let j=1;j<=BODY.segments;j++)length+=Math.hypot(f.spine[j*2]-f.spine[j*2-2],f.spine[j*2+1]-f.spine[j*2-1]);
    assert.ok(Math.abs(length/BODY.length-1)<1e-5,'急转时鱼身不拉伸');
  }
  return {pond,f,start,initialSpine,minSpeed,longestStop,travel,maxAngleStep,maxNoseStep,resets};
}

for(const fps of [30,60,120])for(const speed of [1,2])test(`${fps} FPS ${speed}倍速：正面触岸保持滑行，不骤停或拉直鱼身`,()=>{
  const r=bankEncounter({fps,speed});
  assert.ok(r.minSpeed>10,`触岸后游速塌陷：${r.minSpeed}`);
  assert.ok(r.longestStop<.07,`触岸连续停滞 ${r.longestStop}s`);
  assert.ok(r.travel>12,'一秒内保持有效游动，而不是原地摆尾');
  assert.ok(r.f.x*1000<r.start[0]-5,'一秒内主动离岸');
  assert.equal(r.resets,0,'正常触边转头不能被当作瞬移而重建脊柱');
  assert.equal(r.f.spine,r.initialSpine);
  assert.ok(r.maxAngleStep<=4.5*speed/fps+.001,'转身由连续角速度驱动，无额外角度跳变');
});

test('触边脱离轨迹与速度基本不依赖帧率，低帧率加速不出现姿态抽动',()=>{
  for(const speed of [1,2]){
    const a=bankEncounter({fps:30,speed}),b=bankEncounter({fps:120,speed});
    assert.ok(Math.hypot((a.f.x-b.f.x)*1000,(a.f.y-b.f.y)*700)<2,'30/120 FPS 离岸轨迹应接近');
    assert.ok(Math.abs(a.minSpeed-b.minSpeed)<2,'不按碰撞帧数反复乘降速倍率');
    assert.ok(a.maxNoseStep<15,'鼻尖在加速转向中平滑移动');
  }
});

for(const options of [{angle:.55},{angle:Math.PI/4,corner:true},{rock:true}])test(`斜撞、角点或石边：${JSON.stringify(options)}，滑行脱离而非反复卡住`,()=>{
  const r=bankEncounter({...options,seconds:2});
  assert.ok(r.travel>25,'两秒内沿边转弯离开');
  assert.ok(r.longestStop<.1,'不能在角点反复吞掉移动');
  assert.ok(r.minSpeed>8,'保持可见的游动速度');
});

test('新底图的岸边、露出水面的石头不可投喂，水下卵石仍属于水域',()=>{
  const {habitat,transform}=layout(2560,1440);
  const rock=POND_MAP.rocks[0];
  const rc=[rock.reduce((s,p)=>s+p[0]/rock.length,0)*2560,rock.reduce((s,p)=>s+p[1]/rock.length,0)*1440];
  for(const p of [[110,365],[980,95],[1259,106],[1940,1070],rc]){
    assert.equal(habitat.contains(...transform(...at(p))),false,`石头或岸边 ${p}`);
  }
  for(const p of [[760,420],[1260,590],[1575,460],[365,670],[700,900]]){
    assert.equal(habitat.contains(...transform(...at(p))),true,`水面 ${p}`);
  }
  const pond=new PondSimulation([],2560,1440,randomSeed(8));pond.setHabitat(habitat);
  assert.equal(pond.feed(...at([110,365])),false);assert.equal(pond.food.length,0);
  assert.equal(pond.feed(...at(rc)),false);assert.equal(pond.food.length,0);
  assert.equal(pond.feed(...at([1260,590])),true);assert.equal(pond.food.length,9);
});

test('贴近岸边投喂：散落和漂移的每一颗鱼食都留在水面',()=>{
  const {habitat}=layout(2560,1440);
  const pond=new PondSimulation([],2560,1440,randomSeed(19));pond.setHabitat(habitat);
  for(const p of [[1018,260],[1009,1041],[1638,812],[240,350]]){
    const [x,y]=habitat.project(...at(p),5);
    assert.equal(pond.feed(x,y,30),true);
  }
  for(let frame=0;frame<720;frame++){
    pond.step(1/60);
    for(const p of pond.food)assert.ok(habitat.contains(p.x,p.y,4));
  }
});

test('水域限制下锦鲤继续游动，并能吃完池中投下的鱼食',()=>{
  const random=randomSeed(29),fish=Array.from({length:12},(_,i)=>createFish(i,random));
  const pond=new PondSimulation(fish,1280,720,random);pond.setHabitat(layout(1280,720).habitat);
  const start=fish.map(f=>[f.x,f.y]);pond.feed(640,360,9);
  for(let frame=0;frame<1440;frame++)pond.step(1/60);
  assert.equal(pond.totalEaten,9);assert.equal(pond.food.length,0);
  assert.ok(fish.every((f,i)=>Math.hypot((f.x-start[i][0])*1280,(f.y-start[i][1])*720)>10));
});

for(const [w,h,allowTurn] of [[1280,720,true],[390,844,true],[1069,864,true],[390,844,false]]){
  for(const largeOnly of [false,true]){
    test(`${w}×${h} ${allowTurn?'WebGL':'Canvas'}：${largeOnly?'仅一尾最大锦鲤':'普通鱼群'}能吃完紧贴石头和岸边的鱼食`,()=>{
      const {habitat,transform}=layout(w,h,allowTurn);
      const rock=POND_MAP.rocks[0];
      const rc=[rock.reduce((s,p)=>s+p[0]/rock.length,0)*2560,rock.reduce((s,p)=>s+p[1]/rock.length,0)*1440];
      const rocks=[[110,365],[980,95],[1940,1070],rc];
      for(let index=0;index<rocks.length;index++){
        const random=randomSeed(107+index),fish=Array.from({length:largeOnly?1:24},(_,i)=>createFish(i,random));
        if(largeOnly)fish[0].size=1.5;
        const pond=new PondSimulation(fish,w,h,random);
        pond.scale=Math.max(.66,Math.min(1.25,Math.min(w,h)/720));pond.setHabitat(habitat);
        const p=habitat.project(...transform(...at(rocks[index])),5);
        assert.equal(pond.feed(...p,9),true);
        assert.ok(pond.food.some(p=>!habitat.contains(p.x,p.y,pond.feedingMargin())), '鱼食最初确实在贴岸位置');
        for(let frame=0;frame<1490&&pond.food.length;frame++){
          pond.step(1/60);
          if(frame%30===0){
            for(const p of pond.food)assert.ok(habitat.contains(p.x,p.y,4));
            for(const f of pond.fish){
              const pose=fishPose(f,f.size*pond.scale);
              for(let i=0;i<pose.length;i+=4)assert.ok(habitat.contains(pose[i],pose[i+1],BODY.half*f.size*pond.scale));
            }
          }
        }
        // Count actual eating before the 25-second lifetime expires; disappearing
        // pellets alone would also pass if all the food simply timed out.
        assert.equal(pond.totalEaten,9,`第 ${index+1} 处石头边的投喂没有吃完`);
        assert.equal(pond.food.length,0);
      }
    });
  }
}

for(const [w,h,allowTurn] of [[1280,720,true],[390,844,true],[1069,864,true],[390,844,false]]){
  test(`${w}×${h} ${allowTurn?'WebGL':'Canvas'}：追食、受惊和最大鱼体均不能越过水域`,()=>{
    const random=randomSeed(72),fish=Array.from({length:8},(_,i)=>createFish(i,random));
    fish[0].size=1.5;fish[0].x=.1;fish[0].y=.1;
    const pond=new PondSimulation(fish,w,h,random);
    pond.scale=Math.max(.66,Math.min(1.25,Math.min(w,h)/720));
    pond.setHabitat(layout(w,h,allowTurn).habitat);
    for(let frame=0;frame<900;frame++){
      if(frame%150===0){
        const p=pond.habitat.project(random()*w,random()*h,5);pond.feed(...p);
        pond.scare(...p,Math.max(w,h));
      }
      pond.step(1/30,2);
      for(const f of pond.fish){
        assert.ok(pond.habitat.contains(f.x*w,f.y*h,pond.fishMargin(f)-.01));
        const pose=fishPose(f,f.size*pond.scale);
        for(let i=0;i<pose.length;i+=4){
          assert.ok(pond.habitat.contains(pose[i],pose[i+1],BODY.half*f.size*pond.scale),`鱼身越界 frame ${frame}`);
        }
      }
    }
    // Resizing must immediately move old positions into the newly visible water.
    pond.width=720;pond.height=1280;pond.scale=1;
    pond.setHabitat(layout(720,1280).habitat);pond.step(0);
    for(const f of pond.fish)assert.ok(pond.isWater(f.x*720,f.y*1280,pond.fishMargin(f)));
    for(const p of pond.food)assert.ok(pond.isWater(p.x,p.y,4));
  });
}
