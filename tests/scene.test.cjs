const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const core = require('../core.js');
const context = { window: { PondCore: core }, ImageData: class { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } } };
vm.runInNewContext(fs.readFileSync(require.resolve('../art.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(require.resolve('../scene.js'), 'utf8'), context);
const { PondScene, lookFor } = context.window.PondScene;

test('四季花树前景提取保留花、叶、枝，水面空隙透明且不附加荷叶湿边',()=>{
  const colors=[[240,215,225],[215,220,175],[180,80,25],[180,200,220],[92,120,134],[80,120,45],[105,70,40],[25,140,125],[85,180,100],[20,48,65]];
  const canvases=[];
  const document={createElement(){
    const calls=[],ctx={drawImage(...args){calls.push(['drawImage',...args]);},getImageData(){return {data:new Uint8ClampedArray(colors.flatMap(c=>[...c,255]))};},putImageData(p){this.pixels=p.data;},
      beginPath(){},lineTo(){},moveTo(){},closePath(){},fillRect(){},fill(){},ellipse(){},clip(){calls.push(['clip']);},save(){},restore(){}};
    const canvas={width:1,height:1,calls,getContext(){return ctx;}};canvases.push(canvas);return canvas;
  }};
  const context={window:{PondCore:core,PondArt:{halfWidth(){},girthOf(){}}},document};
  vm.runInNewContext(fs.readFileSync(require.resolve('../scene.js'),'utf8'),context);
  for(const season of ['spring','summer','autumn','winter']){
    canvases.length=0;
    const water=JSON.stringify(core.POND_MAPS[season].water);
    const mask=context.window.PondScene.floatMask(7680,4320,season,{width:7680,height:4320});
    assert.deepEqual([mask.width,mask.height],[2560,1440],'按设计尺度缓存，不分配 8K 遮罩');
    const extracted=canvases[1].getContext().pixels;
    const alpha=i=>extracted[i*4+3];
    assert.equal(alpha(0),255,'粉色花瓣');assert.equal(alpha(1),255,'浅黄色夏花');assert.equal(alpha(2),255,'秋叶');
    if(season==='winter')assert.equal(alpha(3),255,'偏蓝的白色冬花');
    if(season==='spring'||season==='summer')assert.ok(alpha(4)>180,'阴影中的花瓣');
    assert.equal(alpha(5),255,'绿色树叶');assert.equal(alpha(6),255,'暖色树枝');
    for(const i of [7,8,9])assert.equal(alpha(i),0,'水色、焦散与深水透明');
    for(let i=0;i<extracted.length;i+=4)assert.deepEqual(Array.from(extracted.slice(i,i+3)),[255,0,0],'树冠不附加湿边与水面接触阴影');
    assert.ok(mask.calls.some(c=>c[0]==='clip'),'色彩提取仅限树冠轮廓，池心水面不被遮挡');
    assert.equal(JSON.stringify(core.POND_MAPS[season].water),water,'鱼仍可游进树冠下方，水域边界不变');
  }
});

test('底图像素回读被宿主拒绝时保留岸线遮罩，不中断换季',()=>{
  let warnings=0;
  const ctx={drawImage(){},getImageData(){throw new Error('SecurityError');},beginPath(){},lineTo(){},moveTo(){},closePath(){},fillRect(){},fill(){},ellipse(){}};
  const context={window:{PondCore:core,PondArt:{}},console:{warn(){warnings++;}},document:{createElement(){return {width:1,height:1,getContext(){return ctx;}};}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../scene.js'),'utf8'),context);
  for(const season of ['spring','summer','autumn','winter']){
    const mask=context.window.PondScene.floatMask(7680,4320,season,{});
    assert.deepEqual([mask.width,mask.height],[2560,1440]);
  }
  assert.equal(warnings,4);
});

for(const season of ['spring','summer','autumn','winter'])test(`${season}：水层只使用共用岸线和石头多边形，不叠加石头椭圆`,()=>{
  for(const [w,h] of [[2560,1440],[7680,4320]]){
    const fills=[],ellipses=[];let points=[];
    const ctx={beginPath(){points=[];},moveTo(x,y){points.push([x,y]);},lineTo(x,y){points.push([x,y]);},closePath(){},fillRect(){},
      fill(){fills.push({op:this.globalCompositeOperation,points:points.map(p=>[...p])});},ellipse(...args){ellipses.push(args);}};
    const context={window:{PondCore:core,PondArt:{}},document:{createElement(){return {width:1,height:1,getContext(){return ctx;}};}}};
    vm.runInNewContext(fs.readFileSync(require.resolve('../scene.js'),'utf8'),context);
    const mask=context.window.PondScene.floatMask(w,h,season),map=core.POND_MAPS[season];
    assert.equal(fills[0].op,'destination-out','沿真实水线挖出水层');
    for(const [index,poly]of [map.water,...map.rocks].entries()){
      assert.equal(fills[index].points.length,poly.length);
      fills[index].points.forEach(([x,y],i)=>{
        assert.ok(Math.abs(x/mask.width-poly[i][0])<1e-12);
        assert.ok(Math.abs(y/mask.height-poly[i][1])<1e-12);
      });
    }
    assert.equal(ellipses.length,season==='spring'?8:0,'石头天气效果的椭圆不能成为新的水域边界');
  }
});

// A stand-in renderer: the painting maps 1:1 onto a 1672×941 screen.
function pond(seed = 7) {
  let s = seed; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const R = { drops: [], imageToScreen: (x, y) => [x, y], drop(...a) { this.drops.push(a); } };
  const sim = new core.PondSimulation([core.createFish(0, rnd)], 1672, 941, rnd, [], false);
  const scene = new PondScene(R, sim, rnd); scene.layout(1672, 941);
  return scene;
}
const base = { turtles: false, butterflies: false, night: false, rainAmount: .9, snowAmount: .5 };

test('月下观鱼：月亮倒影沿池塘横向移动，真实夜晚按夜程、手动夜晚缓慢往返', () => {
  const scene = pond();
  const w = 1672, y0 = scene.moonAt[1];
  scene.look.moon = 1;
  // A real night (sunset → sunrise): the reflection walks east → west, clamped at both banks.
  scene.setNightWindow(1000, 1000 + 12 * 3600e3);
  scene.updateMoonPath(1000); const a = scene.moonAt[0];
  scene.updateMoonPath(1000 + 6 * 3600e3); const b = scene.moonAt[0];
  scene.updateMoonPath(1000 + 12 * 3600e3); const c = scene.moonAt[0];
  assert.ok(a < b && b < c, '倒影随时间从东向西横穿');
  assert.ok(Math.abs(a - w * .2) < 1e-6 && Math.abs(c - w * .8) < 1e-6, '夜程两端贴住两岸');
  assert.equal(scene.moonAt[1], y0, '只横向移动，不漂离原来的倒影高度');
  scene.updateMoonPath(0); assert.ok(Math.abs(scene.moonAt[0] - w * .2) < 1e-6, '日落前停在东岸');
  scene.updateMoonPath(1e12); assert.ok(Math.abs(scene.moonAt[0] - w * .8) < 1e-6, '日出后停在西岸');
  assert.ok(scene.moonLanternSpot(scene.moonAt[0], scene.moonAt[1]), '放河灯的位置跟着倒影走');
  // Manual 月下观鱼 (no sunrise data): a slow 24-minute round trip, easing at the banks.
  scene.setNightWindow(null);
  scene.updateMoonPath(0); const p = scene.moonAt[0];
  scene.updateMoonPath(12 * 60 * 1000); const q = scene.moonAt[0];
  assert.ok(q > p && Math.abs(q - p - w * .6) < 1e-6, '没有夜程时仍横穿整片池塘');
  assert.ok(scene.moonLanternSpot(scene.moonAt[0], scene.moonAt[1]));
});

test('每种天气与夜色的画面参数键一致，天气切换可平滑过渡', () => {
  const keys = Object.keys(lookFor('sunny', false)).sort();
  for (const w of ['sunny', 'cloudy', 'rain', 'snow']) for (const night of [false, true]) assert.deepEqual(Object.keys(lookFor(w, night)).sort(), keys);
});

test('云量：晴天偶有云影，多云约半池云影，雨天满天阴云', () => {
  const cover = w => lookFor(w, false).cloudCover;
  assert.ok(cover('sunny') < .3 && cover('cloudy') > .4 && cover('cloudy') < .7 && cover('rain') === 1);
  assert.ok(lookFor('cloudy', false).caustic > lookFor('rain', false).caustic * 3, '多云时云隙阳光仍有焦散');
});

test('雨点打在荷叶、花苞上会溅起水花并让它们颤动，雨停后回稳', () => {
  const scene = pond();
  // Hit a movable flower explicitly: changing the shore changes rain's RNG
  // consumption; a three-second area-weighted sample can legitimately hit only rocks.
  const flower=scene.floaters.find(fl=>fl.f[3]!=='r');
  scene.hit(flower,.9);scene.update(1/30,{...base,weather:'rain'});
  assert.ok(scene.splashes.some(p=>p.leaf),'直接雨滴命中生成水花');
  assert.ok(Math.abs(flower.ja)+Math.abs(flower.ox)+Math.abs(flower.oy)>0,'雨滴冲量确实传到花叶');
  for (let i = 0; i < 90; i++) scene.update(1 / 30, { ...base, weather: 'rain' });
  assert.ok(scene.splashes.some(p => p.leaf), '持续降雨中仍有落在物体上的水花');
  for (let i = 0; i < 600; i++) scene.update(1 / 30, { ...base, weather: 'sunny' });
  assert.ok(scene.floaters.every(f => Math.abs(f.ja) < .01 && Math.abs(f.ox) < .05 && Math.abs(f.oy) < .05));
  assert.equal(scene.splashes.length, 0);
});

test('大雨偶有闪电，闪光后发出雷声事件；小雨与晴天没有', () => {
  const scene = pond(3); let flashes = 0;
  for (let i = 0; i < 30 * 200; i++) { scene.update(1 / 30, { ...base, weather: 'rain' }); if (scene.look.flash > .05) flashes++; }
  const thunder = scene.events.filter(e => e.type === 'thunder');
  assert.ok(thunder.length >= 2 && thunder.length <= 12, `200 秒内雷声 ${thunder.length} 次`);
  assert.ok(flashes > 0 && thunder.every(e => e.delay >= 1 && e.delay <= 3.5));
  const calm = pond(4); calm.events.length = 0;
  for (let i = 0; i < 30 * 120; i++) calm.update(1 / 30, { ...base, weather: 'rain', rainAmount: .3 });
  assert.equal(calm.events.length, 0);
});
