const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../core.js');
const drifters = require('../assets/drifting-flora.json');

// Minimal canvas stand-in: the procedural sprites only need their sizes and a no-op 2D context.
function makeContext() {
  const grad = { addColorStop() {} };
  let cv;
  const cx = new Proxy({}, {
    get(t, p) {
      if (p === 'canvas') return cv;
      if (p === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      if (String(p).startsWith('create')) return () => grad;
      if (p === 'getImageData') return (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      if (p === 'measureText') return () => ({ width: 0 });
      return () => {};
    },
    set() { return true; }
  });
  const Path2D = new Proxy(class {}, { construct() { return new Proxy({}, { get: () => () => {} }); } });
  const context = {
    PondCore: core, POND_DRIFTERS: drifters,
    document: { createElement() { cv = { width: 1, height: 1, getContext: () => cx }; return cv; } },
    Path2D,
    ImageData: class { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } },
    console
  };
  context.window = context;
  for (const file of ['gl.js', 'art.js', 'scene.js']) vm.runInNewContext(fs.readFileSync(require.resolve(`../${file}`), 'utf8'), context);
  return context;
}
const context = makeContext();
const art = context.window.PondArt, { PondScene } = context.window.PondScene, { fitBed, bedToScreen } = context.window.PondGL;
const settings = { weather: 'sunny', night: false, turtles: false, crabs: false, butterflies: false, rainAmount: .5, snowAmount: .5 };

function pond(season, w = 1280, h = 720, turn = true) {
  const map = core.POND_MAPS[season], bed = fitBed(map.width, map.height, w, h, turn);
  const imageToScreen = (x, y) => bedToScreen(bed, x / map.width, y / map.height, w, h);
  const drops = [], calls = [];
  const R = {
    sprites: art.miscSprites(), imageToScreen, ripples: true,
    drop(...a) { drops.push(a); }, floater() {}, fish() {}, plant() {}, setFish() {},
    sprite(layer, def, x, y, angle, sx, sy, color) { calls.push({ layer, def, x, y, angle, sx, sy, color }); }
  };
  const rnd = core.randomSeed(913);
  const sim = new core.PondSimulation([], w, h, rnd, [], false);
  const scene = new PondScene(R, sim, rnd);
  scene.setSeason(season); scene.layout(w, h);
  return { scene, sim, R, drops, calls };
}

test('青蛙已从池塘移除，四季都不再露面或绘制', () => {
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    const { scene, R, calls } = pond(season);
    assert.equal(scene.frogCount, 0, `${season} 不安排青蛙`);
    assert.equal(scene.activeFrogs.length, 0);
    for (let i = 0; i < 600; i++) scene.update(1 / 30, settings);
    assert.ok(scene.frogs.every(f => f.alpha === 0 && f.state === 'hidden'), `${season} 青蛙始终隐藏`);
    scene.draw(settings);
    const frogSprites = new Set();
    for (let v = 0; v < art.FROG_COUNT; v++) for (const part of ['body', 'hind', 'front', 'throat']) {
      const def = R.sprites[`frog${v}_${part}`];
      if (def) frogSprites.add(def);
    }
    assert.ok(!calls.some(c => frogSprites.has(c.def)), `${season} 不提交青蛙贴图`);
  }
});
