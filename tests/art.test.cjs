const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const core = require('../core.js');
const context = { window: { PondCore: core }, ImageData: class {
  constructor(width, height) { this.width = width; this.height = height; this.data = new Uint8ClampedArray(width * height * 4); }
} };
vm.runInNewContext(fs.readFileSync(require.resolve('../art.js'), 'utf8'), context);
const art = context.window.PondArt;
test('锦鲤头部是圆钝的吻部、明显窄于身体最宽处，最宽处在身体前部约五分之二', () => {
  for (const seed of [1, 42, 9831]) {
    const g = art.girthOf(seed), w = x => art.halfWidth(x, g);
    const xs = Array.from({ length: 641 }, (_, i) => 34 - i / 10), widest = xs.reduce((a, x) => w(x) > w(a) ? x : a, 34);
    assert.ok(widest < 12 && widest > 2, `最宽处在 x=${widest}`);
    assert.ok(w(25.8) < w(widest) * .78, '眼部（头宽）明显窄于身体最宽处');
    assert.ok(w(33) > w(widest) * .22, '吻部圆钝，不是尖的');
    assert.ok(w(widest) * 2 / 64 < .34, '身体不过胖');
  }
});
test('纯色锦鲤有可见的鳞片纹理', () => {
  for (const palette of [2, 5, 6]) {
    const L = art.fishLayers(palette, 42, 6), d = L.albedo.data;
    // Along the back from the dorsal fin to the tail stalk, brightness must vary scale by scale, not stay flat.
    const lum = []; for (let x = -20; x < 10; x += .25) { const i = Math.floor((core.BODY.half + 2.5) * 6) * L.W + Math.floor((x - core.BODY.left) * 6); lum.push(d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11); }
    const mean = lum.reduce((a, b) => a + b) / lum.length, sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
    assert.ok(sd / mean > .04, `${core.PALETTES[palette].name} 鳞片纹理太弱（${(sd / mean).toFixed(3)}）`);
  }
});
test('纯红鱼身和尾鳍在不同随机种子下均无白斑黑斑', () => {
  const red = core.PALETTES.findIndex(p => p.kind === 'benigoi');
  for (const seed of [1, 42, 9831]) {
    const layers = art.fishLayers(red, seed, 2);
    for (const layer of [layers.albedo, layers.fin]) {
      let pixels = 0;
      for (let i = 0; i < layer.data.length; i += 4) {
        const [r, g, b, a] = layer.data.subarray(i, i + 4);
        if (a < 20) continue;
        pixels++; assert.ok(r > g * 2 && r > b * 2 && r > 100);
      }
      assert.ok(pixels > 100);
    }
  }
});
