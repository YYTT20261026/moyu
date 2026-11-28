const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../core.js');
const { PondSimulation, PondHabitat, BODY, createFish, randomSeed, fishPose, clamp } = core;

function rectangle(width = 1000, height = 700, rocks = [], left = 0) {
  const map = { width, height, water: [[left, 0], [1, 0], [1, 1], [left, 1]], rocks };
  return new PondHabitat(width, height, (x, y) => [x, y], map);
}

// 独立保留优化前的精确算法，覆盖凹岸、石头、边界法线和裁剪优先级。
function originalPolygonSample(points, x, y) {
  let inside = false, best = Infinity, qx = 0, qy = 0, ex = 0, ey = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[j], [bx, by] = points[i], dx = bx - ax, dy = by - ay;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    const px = ax + t * dx, py = ay + t * dy, d = (x - px) ** 2 + (y - py) ** 2;
    if (d < best) { best = d; qx = px; qy = py; ex = dx; ey = dy; }
  }
  const d = Math.sqrt(best), sign = inside ? 1 : -1;
  if (d > 1e-7) return { distance: d * sign, nx: (x - qx) / d * sign, ny: (y - qy) / d * sign };
  const len = Math.hypot(ex, ey) || 1, nx = -ey / len, ny = ex / len;
  let side = false;
  const px = x + nx * .1, py = y + ny * .1;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[j], [bx, by] = points[i];
    if ((ay > py) !== (by > py) && px < (bx - ax) * (py - ay) / (by - ay) + ax) side = !side;
  }
  return { distance: 0, nx: nx * (side ? 1 : -1), ny: ny * (side ? 1 : -1) };
}
function originalSample(habitat, x, y) {
  let best = originalPolygonSample(habitat.water, x, y);
  for (const rock of habitat.rocks) {
    const p = originalPolygonSample(rock, x, y);
    p.distance = -p.distance; p.nx = -p.nx; p.ny = -p.ny;
    if (p.distance < best.distance) best = p;
  }
  for (const p of [{ distance: x, nx: 1, ny: 0 }, { distance: habitat.width - x, nx: -1, ny: 0 },
    { distance: y, nx: 0, ny: 1 }, { distance: habitat.height - y, nx: 0, ny: -1 }]) {
    if (p.distance < best.distance) best = p;
  }
  return best;
}

test('复用采样对象仍逐值等于原精确多边形算法，公开返回对象互不污染', () => {
  const rnd = randomSeed(101), out = {};
  for (const map of Object.values(core.POND_MAPS)) {
    const habitat = new PondHabitat(1000, 700, (x, y) => [x * .5 - 30, y * .5 - 10], map);
    const points = [[0, 0], [1000, 700], [-5, 200], [300, 705], ...habitat.water, ...habitat.rocks.flat()];
    for (let i = 0; i < 300; i++) points.push([rnd() * 1100 - 50, rnd() * 800 - 50]);
    for (const [x, y] of points) {
      for (const offset of [0, 1e-8, -1e-8]) {
        const expected = originalSample(habitat, x + offset, y);
        assert.deepEqual(habitat.sample(x + offset, y), expected);
        assert.equal(habitat.sample(x + offset, y, out), out);
        assert.deepEqual(out, expected);
      }
    }
    const first = habitat.sample(350, 260), saved = { ...first }, second = habitat.sample(650, 380);
    assert.notEqual(first, second);
    habitat.contains(400, 300, 8); habitat.sample(900, 600, out);
    assert.deepEqual(first, saved);
  }
});

test('食物精确距离在鱼群和子步间只算一次，直接 swim 与 step 漂移后均正确', () => {
  const rnd = randomSeed(22), fish = Array.from({ length: 4 }, (_, i) => createFish(i, rnd));
  fish.forEach((f, i) => Object.assign(f, { x: .3 + i * .08, y: .4, angle: .1, size: .7 }));
  const pond = new PondSimulation(fish, 1000, 700, rnd), habitat = rectangle();
  pond.setHabitat(habitat); pond.step(0);
  pond.food = [{ x: 700.25, y: 410.75, age: 0, life: 25, drift: .3, vx: 3, vy: 2, eaten: false },
    { x: 620.75, y: 520.25, age: 0, life: 25, drift: .5, vx: 2, vy: 3, eaten: false }];
  let calls = 0;
  const sample = habitat.sample;
  habitat.sample = function (x, y, out) { if (out === pond.foodSample) calls++; return sample.call(this, x, y, out); };
  for (let step = 0; step < 5; step++) for (const f of fish) pond.swim(f, .01);
  assert.equal(calls, 2, '每颗食物一次精确采样，不随鱼数量或子步重复');
  const positions = pond.food.map(p => [p.x, p.y]);
  pond.step(.05, 3);
  assert.equal(calls, 4, 'step 先漂移食物，随后所有加速子步复用新坐标的距离');
  pond.food.forEach((p, i) => assert.notDeepEqual([p.x, p.y], positions[i]));
  for (const f of fish) pond.swim(f, .01);
  assert.equal(calls, 4);
  assert.ok(pond.foodDistances instanceof WeakMap);
});

test('食物距离缓存保留有限数和 1e-6 容差，移动、换水域和改变宽高均失效且不污染存档', () => {
  const pond = new PondSimulation([], 1000, 700), habitat = rectangle(), p = { x: 20.5, y: 240.5, eaten: false };
  pond.setHabitat(habitat);
  let calls = 0;
  const sample = habitat.sample;
  habitat.sample = function (...args) { calls++; return sample.apply(this, args); };
  const saved = JSON.stringify(p);
  assert.equal(pond.foodIsWater(p, 20.5 + .5e-6), true);
  assert.equal(pond.foodIsWater(p, 20.5 + 1.5e-6), false);
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(p), saved);
  p.x++; pond.foodIsWater(p, 0); assert.equal(calls, 2);
  p.y++; pond.foodIsWater(p, 0); assert.equal(calls, 3);
  pond.width--; pond.foodIsWater(p, 0); assert.equal(calls, 4);
  pond.height--; pond.foodIsWater(p, 0); assert.equal(calls, 5);
  habitat.width = 18; assert.equal(pond.foodIsWater(p, 0), false); assert.equal(calls, 6);
  habitat.width = 1000; habitat.height = 230;
  assert.equal(pond.foodIsWater(p, 0), false); assert.equal(calls, 7);
  pond.setHabitat(rectangle(1000, 700, [], .03));
  assert.equal(pond.foodIsWater(p, 0), false, '换水域后不能沿用旧岸线距离');
  pond.habitat = rectangle();
  assert.equal(pond.foodIsWater(p, 0), true, '直接替换 habitat 也须失效');
  const alternate = pond.habitat, alternateSample = alternate.sample;
  let invalidCalls = 0;
  alternate.sample = function (...args) { invalidCalls++; return alternateSample.apply(this, args); };
  for (const [x, y] of [[NaN, 20], [Infinity, 20], [20, -Infinity], [20, NaN]]) {
    assert.equal(pond.foodIsWater({ x, y }, -Infinity), false);
  }
  assert.equal(invalidCalls, 0, '非有限数与 contains 一样直接拒绝，不进入几何计算');
});

test('复用距离与非缓存游动逐帧一致，鱼体姿态和吃食结果不变', () => {
  function make(cached) {
    const rnd = randomSeed(47), fish = Array.from({ length: 6 }, (_, i) => createFish(i, rnd));
    const pond = new PondSimulation(fish, 1000, 700, rnd);
    pond.setHabitat(rectangle(1000, 700, [[[.45, .35], [.55, .35], [.55, .65], [.45, .65]]]));
    pond.feed(750, 480, 8);
    if (!cached) pond.foodIsWater = (p, margin) => pond.isWater(p.x, p.y, margin);
    return pond;
  }
  const cached = make(true), original = make(false);
  const state = pond => pond.fish.map(f => Object.fromEntries(['x', 'y', 'angle', 'phase', 'v', 'turn', 'thrust', 'amp', 'depth', 'size', 'eaten', 'goal', 'bankHold', 'bankSide'].map(k => [k, f[k]])));
  for (let i = 0; i < 180; i++) {
    cached.step(.03, 2); original.step(.03, 2);
    assert.deepEqual(state(cached), state(original));
    cached.fish.forEach((f, j) => assert.deepEqual(f.spine, original.fish[j].spine));
    assert.deepEqual(cached.food, original.food);
    assert.equal(cached.totalEaten, original.totalEaten);
  }
});

test('模拟姿态检查仅复用一个 Float32Array，与默认 fishPose 一致且不修改 spine', () => {
  const sizes = [], context = { module: { exports: {} }, Float32Array: class extends Float32Array {
    constructor(length) { super(length); sizes.push(length); }
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../core.js'), 'utf8'), context);
  const api = context.module.exports, rnd = api.randomSeed(91);
  const fish = Array.from({ length: 3 }, (_, i) => api.createFish(i, rnd));
  fish.forEach((f, i) => Object.assign(f, { x: .35 + i * .13, y: .5, angle: .1 }));
  const pond = new api.PondSimulation(fish, 1000, 700, rnd);
  pond.setHabitat(rectangle()); pond.step(0);
  const scratch = pond.poseScratch, poseLength = (BODY.segments + 1) * 4;
  assert.equal(sizes.filter(n => n === poseLength).length, 1);
  for (let i = 0; i < 80; i++) pond.step(.01);
  assert.equal(pond.poseScratch, scratch);
  assert.equal(sizes.filter(n => n === poseLength).length, 1, '每尾鱼每步检查没有新增姿态数组');
  for (const f of pond.fish) {
    const spine = Array.from(f.spine), expected = api.fishPose(f, f.size * pond.scale);
    assert.equal(api.fishPose(f, f.size * pond.scale, scratch), scratch);
    assert.deepEqual(Array.from(scratch), Array.from(expected));
    assert.deepEqual(Array.from(f.spine), spine);
  }
});

test('定期社交采样清除已放生鱼的 bonds，保留仍在池中的配对计数', () => {
  const fish = ['a', 'b', 'c'].map(id => ({ id, x: .5, y: .5, depth: .5 }));
  const pond = new PondSimulation(fish, 1000, 700);
  for (let i = 0; i < 6; i++) pond.trackBonds();
  assert.equal(pond.bestFriend(fish[0]).id, 'b');
  pond.fish = fish.slice(0, 2); pond.trackBonds();
  assert.deepEqual(Array.from(pond.bonds), [['a|b', 7]]);
  pond.fish = []; pond.tick = 29; pond.step(0);
  assert.equal(pond.bonds.size, 0, '放生所有鱼后也会删除历史配对');
});

function loadScene(overrideCore = core) {
  const context = { window: { PondCore: overrideCore, PondArt: { halfWidth: () => 5, girthOf: () => 1 } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../scene.js'), 'utf8'), context);
  return { ...context.window.PondScene, window: context.window };
}
function makeScene(PondScene) {
  const rnd = randomSeed(4), sim = new PondSimulation([], 1000, 700, rnd);
  const scene = new PondScene({ sprites: {}, sprite() {}, floater() {} }, sim, rnd);
  scene.w = 1000; scene.h = 700;
  return scene;
}
const plain = value => JSON.parse(JSON.stringify(value));
function blend(a, b, t) {
  const out = plain(a);
  for (const k of Object.keys(b)) {
    if (Array.isArray(b[k])) for (let i = 0; i < b[k].length; i++) out[k][i] += (b[k][i] - out[k][i]) * t;
    else out[k] += (b[k] - out[k]) * t;
  }
  return out;
}
function paletteOf(look, keys) { return Object.fromEntries(keys.map(k => [k, plain(look[k])])); }

test('setLook 保留昼夜混色和指数插值公式、晴天清云以及立即设置语义', () => {
  const { PondScene, lookFor } = loadScene(), scene = makeScene(PondScene);
  const keys = Object.keys(lookFor('sunny', false)), direction = scene.look.shadowDir;
  for (const weather of ['sunny', 'cloudy', 'rain', 'snow', 'unknown']) {
    for (const nightK of [-1, 0, .45, 1, 2]) {
      const amounts = { rainAmount: .8, snowAmount: .3 };
      let target = plain(lookFor(weather, false, .8, .3));
      if (nightK > 0) target = blend(target, lookFor(weather, true, .8, .3), clamp(nightK, 0, 1));
      const before = paletteOf(scene.look, keys), previous = scene.look, dt = .031;
      const expected = blend(before, target, 1 - Math.exp(-dt * 1.1));
      if (target.cloudCover === 0) { expected.cloudCover = 0; expected.cloudShade = 0; }
      scene.setLook(weather, nightK > 0, dt, amounts, nightK);
      assert.equal(scene.look, previous);
      assert.deepEqual(paletteOf(scene.look, keys), expected);
      assert.equal(scene.look.shadowDir, direction);
      scene.setLook(weather, nightK > 0, undefined, amounts, nightK);
      assert.notEqual(scene.look, previous, '无 dt 的公开立即设置仍返回独立画面对象');
      assert.deepEqual(paletteOf(scene.look, keys), target);
      assert.equal(scene.look.shadowDir, direction);
    }
  }
});

test('天气目标按实例和 weather/rain/snow 缓存，昼夜切换复用目标且不改模板', () => {
  const { PondScene, lookFor } = loadScene(), a = makeScene(PondScene), b = makeScene(PondScene);
  const before = ['sunny', 'cloudy', 'rain', 'snow'].map(w => [plain(lookFor(w, false)), plain(lookFor(w, true))]);
  a.setLook('rain', false, undefined, { rainAmount: .7, snowAmount: .2 });
  b.setLook('rain', false, undefined, { rainAmount: .7, snowAmount: .2 });
  const targets = a.lookTargets, day = targets.day, night = targets.night, target = a.lookTarget;
  const dayBefore = plain(day), nightBefore = plain(night), bBefore = plain(b.look);
  const arrayRefs = Object.keys(target).filter(k => Array.isArray(target[k])).map(k => [k, target[k]]);
  for (let i = 0; i < 100; i++) a.setLook('rain', true, .016, { rainAmount: .7, snowAmount: .2 }, (i % 10) / 10);
  assert.equal(a.lookTargets, targets); assert.equal(a.lookTarget, target);
  assert.equal(a.lookTargets.day, day); assert.equal(a.lookTargets.night, night);
  arrayRefs.forEach(([k, ref]) => {
    assert.equal(a.lookTarget[k], ref);
    assert.notEqual(a.lookTarget[k], day[k]); assert.notEqual(a.look[k], day[k]);
    assert.notEqual(day[k], night[k]); assert.notEqual(day[k], b.lookTargets.day[k]);
  });
  assert.deepEqual(plain(day), dayBefore); assert.deepEqual(plain(night), nightBefore);
  assert.notEqual(a.lookTargets, b.lookTargets); assert.notEqual(a.lookTarget, b.lookTarget);
  a.look.tint[0] = 100; a.look.bright = 100;
  assert.deepEqual(plain(b.look), bBefore, '当前画面可变对象不在实例间共享');
  const external = lookFor('rain', false); external.tint[0] = 200; external.water[0] = 200; external.bright = 200;
  ['sunny', 'cloudy', 'rain', 'snow'].forEach((w, i) => {
    assert.deepEqual(plain(lookFor(w, false)), before[i][0]);
    assert.deepEqual(plain(lookFor(w, true)), before[i][1]);
  });
  a.setLook('rain', false, undefined, { rainAmount: .7, snowAmount: .2 });
  assert.deepEqual(paletteOf(a.look, Object.keys(day)), dayBefore);
  assert.deepEqual(plain(day), dayBefore, '立即设置后也不把缓存挂成可变画面');
  a.look.tint[0] = 300; assert.deepEqual(plain(day), dayBefore);
  for (const [weather, rainAmount, snowAmount] of [['rain', .8, .2], ['rain', .8, .3], ['snow', .8, .3]]) {
    const previous = a.lookTargets;
    a.setLook(weather, false, .016, { rainAmount, snowAmount });
    assert.notEqual(a.lookTargets, previous, '天气或任一强度变化均重建对应昼夜目标');
  }
  a.setLook('rain', false, undefined);
  const defaults = a.lookTargets;
  a.setLook('rain', true, .016, { rainAmount: .5, snowAmount: .5 });
  assert.equal(a.lookTargets, defaults, '省略强度和显式默认值使用同一缓存');
  a.setLook('rain', false, undefined, { rainAmount: null });
  assert.equal(a.look.bright, .86, 'null 仍保留原公式的数值语义，不能误替换为默认 .5');
});

test('深度排序复用临时数组和记录，稳定同深度顺序且不会留存已移除鱼或关闭的龟', () => {
  const { PondScene } = loadScene(), scene = makeScene(PondScene), drawn = [];
  scene.floaters = []; scene.crabs = [];
  scene.sim.fish = [{ id: 'a', depth: .6 }, { id: 'b', depth: .2 }, { id: 'c', depth: .6 }];
  scene.sim.fish.forEach(f => Object.assign(f, { spriteReady: true, spine: new Float32Array(2) }));
  scene.koi = (f, i) => drawn.push([f.id, i]);
  scene.turtles = [{ depth: .58, draw() { drawn.push(['t1']); } }, { depth: .1, draw() { drawn.push(['t2']); } }];
  const settings = { turtles: true, butterflies: false, night: false, weather: 'sunny' };
  const expected = [['a', 0], ['c', 2], ['t1'], ['b', 1], ['t2']];
  scene.draw(settings); assert.deepEqual(drawn, expected);
  const items = scene.depthItems, records = new Set(items);
  drawn.length = 0; scene.draw(settings);
  assert.equal(scene.depthItems, items); assert.deepEqual(drawn, expected);
  assert.ok(items.every(item => records.has(item)));
  const remaining = scene.sim.fish[1]; scene.sim.fish = [remaining];
  drawn.length = 0; scene.draw({ ...settings, turtles: false });
  assert.deepEqual(drawn, [['b', 0]]); assert.equal(items.length, 1); assert.equal(items[0].t, null);
  assert.equal(items[0].f, remaining);
  drawn.length = 0; scene.draw(settings);
  assert.deepEqual(drawn, [['t1'], ['b', 0], ['t2']]);
});

test('2D 预览复用 spine/pose，逐点结果不变且不修改传入鱼的模拟脊柱', () => {
  const calls = [], api = loadScene({ ...core, fishPose(f, s, out) {
    const result = fishPose(f, s, out); calls.push({ spine: f.spine, pose: result, values: Array.from(result) }); return result;
  } });
  const drawn = []; api.window.PondGL = { drawStrip2D(ctx, sprite, pose) { drawn.push(Array.from(pose)); } };
  const ctx = { save() {}, translate() {}, rotate() {}, scale() {}, drawImage() {}, restore() {} };
  const fin = { canvas: { width: 96, height: 28 }, ppu: 1, px: .5, py: .5 }, sprites = { finMoto: fin };
  const f = { palette: 3, seed: 12, phase: 0, spine: new Float32Array([1, 2, 3, 4]) }, spineBefore = Array.from(f.spine);
  for (const [x, y, angle, s, amp, phase] of [[100, 200, .3, .7, .2, 1], [340, 160, -1, 1.2, .5, 3], [20, 30, 0, .45, 0, 0]]) {
    f.phase = phase;
    const spine = new Float32Array((BODY.segments + 1) * 2), c = Math.cos(angle), si = Math.sin(angle), seg = BODY.length / BODY.segments;
    for (let i = 0; i <= BODY.segments; i++) {
      spine[i * 2] = x + c * (BODY.nose - i * seg) * s;
      spine[i * 2 + 1] = y + si * (BODY.nose - i * seg) * s;
    }
    const expected = Array.from(fishPose({ spine, phase, amp }, s));
    api.drawKoi2D(ctx, f, {}, sprites, x, y, angle, s, amp);
    assert.deepEqual(calls.at(-1).values, expected); assert.deepEqual(drawn.at(-1), expected);
    assert.deepEqual(Array.from(f.spine), spineBefore);
  }
  assert.ok(calls.every(call => call.spine === calls[0].spine && call.pose === calls[0].pose));
});
