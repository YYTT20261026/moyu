const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const core = require('../core.js');
const { PondSimulation, PondHabitat, POND_MAP, createFish, createSilverCarpShoal, randomSeed, fishPose, BODY } = core;
const context = { window: { PondCore: core } };
vm.runInNewContext(fs.readFileSync(require.resolve('../gl.js'), 'utf8'), context);
const { fitBed, bedToScreen } = context.window.PondGL;
function layout(w,h,allowTurn=true) {
  const bed=fitBed(POND_MAP.width,POND_MAP.height,w,h,allowTurn);
  const transform=(x,y)=>bedToScreen(bed,x/POND_MAP.width,y/POND_MAP.height,w,h);
  return {habitat:new PondHabitat(w,h,transform),transform};
}
const at=([x,y])=>[x,y];

test('新底图的岸边、露出水面的石头不可投喂，水下卵石仍属于水域',()=>{
  const {habitat,transform}=layout(2560,1440);
  for(const p of [[110,365],[980,95],[1259,106],[1638,812],[1009,1041],[1500,980],[310,1080]]){
    assert.equal(habitat.contains(...transform(...at(p))),false,`石头或岸边 ${p}`);
  }
  for(const p of [[760,420],[1260,590],[1575,460],[365,670],[700,900]]){
    assert.equal(habitat.contains(...transform(...at(p))),true,`水面 ${p}`);
  }
  const pond=new PondSimulation([],2560,1440,randomSeed(8));pond.setHabitat(habitat);
  assert.equal(pond.feed(...at([110,365])),false);assert.equal(pond.food.length,0);
  assert.equal(pond.feed(...at([1009,1041])),false);assert.equal(pond.food.length,0);
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
      const rocks=[[110,365],[1128,225],[1638,812],[1009,1041]];
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
            for(const f of pond.allFish){
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
    const pond=new PondSimulation(fish,w,h,random,createSilverCarpShoal(random));
    pond.scale=Math.max(.66,Math.min(1.25,Math.min(w,h)/720));
    pond.setHabitat(layout(w,h,allowTurn).habitat);
    for(let frame=0;frame<900;frame++){
      if(frame%150===0){
        const p=pond.habitat.project(random()*w,random()*h,5);pond.feed(...p);
        pond.scare(...p,Math.max(w,h));
      }
      pond.step(1/30,2);
      for(const f of pond.allFish){
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
    for(const f of pond.allFish)assert.ok(pond.isWater(f.x*720,f.y*1280,pond.fishMargin(f)));
    for(const p of pond.food)assert.ok(pond.isWater(p.x,p.y,4));
  });
}
