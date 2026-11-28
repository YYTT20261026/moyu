const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const core = require('../core.js');
const source = fs.readFileSync(require.resolve('../gl.js'), 'utf8');
const kinds = ['Shader', 'Program', 'Texture', 'Framebuffer', 'Buffer', 'VertexArray'];

function setup(kind = 'webgl2', faults = {}) {
  const calls = [], warnings = [], constants = new Map(), counts = new Map();
  const created = new Map(kinds.map(k => [k, []])), deleted = new Map(kinds.map(k => [k, []]));
  const uniformUploads = [], bufferUploads = [];
  let id = 0, canvas, currentProgram = null;
  const gl = new Proxy({}, { get(_, name) {
    if (typeof name === 'string' && name === name.toUpperCase()) {
      if (!constants.has(name)) constants.set(name, ++id);
      return constants.get(name);
    }
    return (...args) => {
      calls.push([name, ...args]);
      const count = (counts.get(name) || 0) + 1; counts.set(name, count);
      if (faults.throwAt?.[name] === count) throw Error(`模拟 ${name} 失败`);
      if (name.startsWith('create')) {
        if (faults.nullAt?.[name] === count) return null;
        const resource = { id: ++id, kind: name.slice(6) };
        created.get(resource.kind).push(resource); return resource;
      }
      if (name === 'useProgram') currentProgram = args[0];
      if (name === 'deleteProgram') assert.notEqual(args[0], currentProgram, '当前 program 必须先解绑才能实际释放');
      if (name.startsWith('delete')) {
        const resources = deleted.get(name.slice(6));
        assert.ok(!resources.includes(args[0]), '同一 GPU 对象不能重复删除');
        resources.push(args[0]);
        if (faults.emitOnDelete) canvas.emit('webglcontextlost');
      }
      if (name === 'getExtension') return true;
      if (name === 'getShaderParameter') return count !== faults.compileAt;
      if (name === 'getProgramParameter') return count !== faults.linkAt;
      if (name === 'getShaderInfoLog' || name === 'getProgramInfoLog') return '模拟着色器失败';
      if (name === 'getParameter') return 4096;
      if (name === 'checkFramebufferStatus') return count === faults.framebufferAt ? gl.FRAMEBUFFER_UNSUPPORTED : gl.FRAMEBUFFER_COMPLETE;
      if (name === 'getError') return faults.uploadError ? gl.OUT_OF_MEMORY : gl.NO_ERROR;
      if (name === 'isContextLost') return !!faults.lost;
      if (name === 'getUniformLocation') return args[1];
      if (name === 'uniform4fv') uniformUploads.push({ name: args[0], ref: args[1], values: Array.from(args[1]) });
      if (name === 'bufferData') bufferUploads.push({ target: args[0], values: Array.from(args[1]) });
    };
  }});
  function canvas2D() {
    return new Proxy({ globalAlpha: 1, globalCompositeOperation: 'source-over' }, { get(target, name) {
      if (name in target) return target[name];
      return (...args) => {
        calls.push(['2d', name, ...args]);
        if (name === 'getImageData') return { data: new Uint8ClampedArray([255, 0, 0, 255]) };
      };
    }});
  }
  function makeCanvas(allowGL = false) {
    const listeners = new Map(), ctx = canvas2D();
    let grabbed = false;
    return {
      width: 1, height: 1, listeners,
      addEventListener(name, callback, options) { listeners.set(name, { callback, once: options?.once }); },
      removeEventListener(name, callback) {
        calls.push(['removeEventListener', name, callback]);
        if (listeners.get(name)?.callback === callback) listeners.delete(name);
      },
      emit(name) {
        const listener = listeners.get(name);
        if (!listener) return;
        if (listener.once) listeners.delete(name);
        listener.callback({ type: name });
      },
      getContext(type) {
        if (type === 'webgl2') { if (!allowGL) return null; grabbed = true; return gl; }
        return grabbed ? null : ctx;
      },
      cloneNode() { const clone = makeCanvas(); calls.push(['cloneNode', clone]); return clone; },
      replaceWith(replacement) { calls.push(['replaceWith', replacement]); }
    };
  }
  canvas = makeCanvas(kind === 'webgl2');
  const context = { window: { PondCore: core }, console: { warn(...args) { warnings.push(args); } }, document: { createElement() { calls.push(['createCanvas']); return makeCanvas(); } } };
  vm.runInNewContext(source, context);
  const image = { width: 2560, height: 1440 }, mask = { width: 1, height: 1 };
  return { gl, calls, warnings, counts, created, deleted, faults, uniformUploads, bufferUploads, canvas, image, mask,
    create(onLost, sprites = {}) { return context.window.PondGL.createRenderer(canvas, image, sprites, onLost, mask); } };
}

function assertReleased(mock) {
  for (const kind of kinds) {
    assert.equal(mock.deleted.get(kind).length, mock.created.get(kind).length, `${kind} 应全部释放`);
    for (const resource of mock.created.get(kind)) assert.equal(mock.deleted.get(kind).filter(r => r === resource).length, 1, `${kind} 每个对象只删除一次`);
  }
  assert.equal(mock.canvas.listeners.size, 0, '上下文事件监听应解绑');
  assert.ok(!mock.calls.some(c => c[0] === 'getExtension' && c[1] === 'WEBGL_lose_context'), '不强制失去上下文');
}

const env = { sun: [-.45, .45, .77], shadowDir: [.7, .72], cloudWind: [20, -7], moonDisc: [0, 0, 1, 0], cloudCover: 0 };
const sprite = { w: 20, h: 30, ppu: 2, px: .25, py: .75, u0: .1, v0: .2, u1: .3, v1: .4, canvas: { width: 20, height: 30 } };

function exerciseDisposed(renderer, mock) {
  const count = mock.calls.length, dimensions = [renderer.canvas.width, renderer.canvas.height];
  renderer.dispose();
  renderer.resize(20, 30, 1, 'eco'); renderer.prepareBackground({}, {}); renderer.setBackground({}, {}, true);
  renderer.setFish(0, sprite.canvas); renderer.drop(1, 2, 3, 1);
  renderer.sprite('under', sprite, 1, 2, 0, 1, 1);
  renderer.plant('plants', sprite, 1, 2, 0, 1, 1, 0, true, 1);
  renderer.fish('under', 0, [], 1, 1, 2, 1); renderer.floater(1, 2, 3, 4, 0, 0, 0, 0, 0);
  assert.equal(renderer.render(0, 1 / 60, env), false, '销毁后不报告成功出帧');
  assert.equal(mock.calls.length, count, '销毁后不再绘制、分配或删除');
  assert.deepEqual([renderer.canvas.width, renderer.canvas.height], dimensions, '销毁后不重设画布');
}

test('WebGL dispose 完整释放所有类型、四季纹理和改尺寸后的目标，重复调用不重复删除', () => {
  const mock = setup(), renderer = mock.create();
  assert.equal(mock.created.get('Shader').length, 18);
  assert.equal(mock.deleted.get('Shader').length, 18, '链接完成立即删除 shader');
  assert.equal(mock.calls.filter(c => c[0] === 'detachShader').length, 18, '删除前脱离 program，及时释放 shader');
  assert.equal(mock.created.get('Program').length, 9);
  assert.equal(mock.created.get('Buffer').length, 3);
  assert.equal(mock.created.get('VertexArray').length, 2);
  renderer.resize(1280, 720, 1, 'high');
  for (let i = 0; i < 3; i++) renderer.prepareBackground({ width: 2560, height: 1440 }, mock.mask);
  assert.equal(mock.created.get('Texture').length, 18);
  renderer.resize(390, 844, 2, 'high');
  assert.equal(mock.created.get('Framebuffer').length, 14);
  assert.equal(mock.deleted.get('Framebuffer').length, 7, '改尺寸时先释放旧目标');
  renderer.render(0, 1 / 60, env);
  renderer.dispose(); assertReleased(mock); exerciseDisposed(renderer, mock);
});

test('keepOnly 淘汰纹理不会在 dispose 时重复删除，未缓存的纹理重新上传仍受登记管理', () => {
  const mock = setup(), renderer = mock.create(), next = { width: 2560, height: 1440 };
  renderer.prepareBackground(next, mock.mask);
  renderer.setBackground(next, mock.mask, true);
  assert.equal(mock.deleted.get('Texture').length, 2);
  renderer.prepareBackground(mock.image, mock.mask);
  renderer.setBackground(mock.image, mock.mask, true);
  assert.equal(mock.deleted.get('Texture').length, 4);
  renderer.dispose(); assertReleased(mock);
});

for (const [label, faults] of [
  ['首个 shader 编译', { compileAt: 1 }],
  ['第二个 shader 编译', { compileAt: 2 }],
  ['第二个 program 链接', { linkAt: 2 }],
  ['shader 创建返回 null', { nullAt: { createShader: 2 } }],
  ['program 创建返回 null', { nullAt: { createProgram: 2 } }],
  ['VAO 创建返回 null', { nullAt: { createVertexArray: 2 } }],
  ['buffer 创建返回 null', { nullAt: { createBuffer: 3 } }],
  ['texture 创建返回 null', { nullAt: { createTexture: 4 } }],
  ['底图上传', { throwAt: { texImage2D: 3 } }],
  ['遮罩 mipmap', { throwAt: { generateMipmap: 2 } }],
  ['精灵 atlas 上传', { throwAt: { texSubImage2D: 1 } }]
]) test(`初始化部分失败：${label}，释放已有对象并沿原策略替换为 2D canvas`, () => {
  const mock = setup('webgl2', faults);
  let lost = 0;
  const renderer = mock.create(() => lost++, { small: { ...sprite } });
  assert.equal(renderer.kind, '2d'); assert.notEqual(renderer.canvas, mock.canvas);
  assert.equal(mock.warnings.length, 1); assert.equal(lost, 0, '初始化回收不调用 onLost');
  assertReleased(mock);
  assert.ok(mock.calls.some(c => c[0] === 'replaceWith' && c[1] === renderer.canvas));
  renderer.resize(390, 844, 1, 'high'); renderer.render(0, 1 / 60, env);
  renderer.dispose(); exerciseDisposed(renderer, mock);
});

for (const fault of ['framebuffer', 'upload', 'framebuffer-create']) test(`resize 部分失败仍可 dispose 全部对象且不重复删除：${fault}`, () => {
  const mock = setup(), renderer = mock.create();
  renderer.resize(1280, 720, 1, 'high');
  if (fault === 'framebuffer') mock.faults.framebufferAt = mock.counts.get('checkFramebufferStatus') + 3;
  if (fault === 'upload') mock.faults.throwAt = { texImage2D: mock.counts.get('texImage2D') + 3 };
  if (fault === 'framebuffer-create') mock.faults.nullAt = { createFramebuffer: mock.counts.get('createFramebuffer') + 3 };
  assert.throws(() => renderer.resize(390, 844, 1, 'eco'));
  renderer.dispose(); assertReleased(mock); exerciseDisposed(renderer, mock);
});

test('可选浮点波纹目标创建失败时回收两侧目标，其余 renderer 与 dispose 仍可用', () => {
  const mock = setup('webgl2', { framebufferAt: 6 }), renderer = mock.create();
  renderer.resize(1280, 720, 1, 'high');
  assert.equal(mock.deleted.get('Framebuffer').length, 2);
  assert.equal(renderer.render(0, 1 / 60, env), true);
  renderer.dispose(); assertReleased(mock);
});

test('预热季节第二张纹理上传失败立即回收本次对象，不伤害已有背景且允许重新准备', () => {
  const mock = setup(), renderer = mock.create(), next = { width: 2560, height: 1440 };
  renderer.resize(1280, 720, 1, 'high');
  mock.faults.throwAt = { texImage2D: mock.counts.get('texImage2D') + 2 };
  assert.throws(() => renderer.prepareBackground(next, mock.mask), /texImage2D/);
  assert.equal(mock.deleted.get('Texture').length, 2);
  assert.equal(renderer.render(0, 1 / 60, env), true);
  mock.faults.throwAt = {};
  const before = mock.counts.get('texImage2D');
  renderer.prepareBackground(next, mock.mask); renderer.setBackground(next, mock.mask);
  assert.equal(mock.counts.get('texImage2D') - before, 2, '失败背景没有留下不完整缓存');
  renderer.dispose(); assertReleased(mock);
});

test('丢失上下文后 dispose 安全，删除过程中即使重入 contextlost 也不递归 onLost', () => {
  const mock = setup(), renderer = mock.create(() => { lost++; renderer.dispose(); });
  let lost = 0;
  renderer.resize(1280, 720, 1, 'high');
  mock.faults.lost = true; mock.faults.emitOnDelete = true;
  mock.canvas.emit('webglcontextlost');
  assert.equal(lost, 1); assertReleased(mock);
  mock.canvas.emit('webglcontextlost');
  assert.equal(lost, 1); exerciseDisposed(renderer, mock);
});

test('主动 dispose 先解绑 contextlost，不触发 onLost，GL 已丢失时仍逐项删除', () => {
  const mock = setup(); let lost = 0;
  const renderer = mock.create(() => lost++);
  renderer.resize(1280, 720, 1, 'high');
  mock.faults.lost = true; mock.faults.emitOnDelete = true;
  renderer.dispose(); assertReleased(mock); assert.equal(lost, 0);
});

test('2D 与 WebGL 暴露一致接口，2D dispose 清空未渲染队列并停止后续绘制与分配', () => {
  const glMock = setup(), glRenderer = glMock.create(), mock = setup('2d'), renderer = mock.create();
  assert.deepEqual(Object.keys(renderer).sort(), Object.keys(glRenderer).sort());
  renderer.resize(390, 844, 1, 'high'); renderer.prepareBackground(mock.image, mock.mask);
  renderer.setFish(0, sprite.canvas); renderer.sprite('under', sprite, 1, 2, 0, 1, 1);
  renderer.plant('plants', sprite, 1, 2, 0, 1, 1, 0, true, 1);
  renderer.fish('under', 0, new Float32Array(64), 1, 1, 2, 1); renderer.drop(1, 2, 3, 1);
  renderer.dispose(); exerciseDisposed(renderer, mock);
  glRenderer.dispose(); assertReleased(glMock);
});

test('波纹复用同一 Float32Array，超过 24 个扰动保持批次、顺序和原有公式', () => {
  const mock = setup(), renderer = mock.create(); renderer.resize(1280, 720, 1, 'high');
  const drops = Array.from({ length: 25 }, (_, i) => [100 + i, 200 + i, i === 0 ? 1 : 10 + i, .1 + i * .01]);
  for (const d of drops) renderer.drop(...d);
  renderer.render(0, 1 / 60, env);
  const uploads = mock.uniformUploads.filter(u => u.name === 'uDrops');
  assert.equal(uploads.length, 2); assert.equal(uploads[0].ref, uploads[1].ref);
  assert.deepEqual(mock.calls.filter(c => c[0] === 'uniform1i' && c[1] === 'uCount').map(c => c[2]), [24, 1]);
  const minR = 2.6 * 720 / Math.ceil(720 / 3);
  for (let batch = 0; batch < 2; batch++) {
    const expected = new Float32Array(96);
    drops.slice(batch * 24, batch * 24 + 24).forEach((d, i) => {
      const r = Math.max(d[2], minR);
      expected.set([d[0] / 1280, 1 - d[1] / 720, r / 720, d[3] * Math.min(1, d[2] / r + .25)], i * 4);
    });
    assert.deepEqual(uploads[batch].values, Array.from(expected));
  }
  renderer.drop(1, 2, 10, .2); renderer.render(1, 1 / 60, env);
  assert.equal(mock.uniformUploads.filter(u => u.name === 'uDrops').at(-1).ref, uploads[0].ref, '跨帧仍复用');
  renderer.dispose(); assertReleased(mock);
});

test('sprite 四角临时数组复用仍保留原坐标、UV 和三角形索引顺序', () => {
  const mock = setup(), renderer = mock.create(); renderer.resize(1280, 720, 1, 'high');
  const instances = [[400, 500, .7, 1.2, .8], [300, 600, -.4, .7, 1.3]];
  for (const args of instances) renderer.sprite('under', sprite, ...args);
  renderer.render(0, 1 / 60, env);
  const actual = mock.bufferUploads.find(u => u.target === mock.gl.ARRAY_BUFFER && u.values.length === 128).values;
  const expected = [];
  for (const [x, y, angle, sx, sy] of instances) {
    const w = sprite.w / sprite.ppu * sx, h = sprite.h / sprite.ppu * sy, ox = -sprite.px * w, oy = -sprite.py * h, c = Math.cos(angle), s = Math.sin(angle);
    const points = [[ox, oy], [ox + w, oy], [ox + w, oy + h], [ox, oy + h]];
    const uvs = [[sprite.u0, sprite.v0], [sprite.u1, sprite.v0], [sprite.u1, sprite.v1], [sprite.u0, sprite.v1]];
    for (let i = 0; i < 4; i++) {
      const [a, b] = points[i];
      expected.push(x + a * c - b * s, y + a * s + b * c, ...uvs[i], 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0);
    }
  }
  assert.deepEqual(actual, Array.from(new Float32Array(expected)));
  assert.deepEqual(mock.bufferUploads.find(u => u.target === mock.gl.ELEMENT_ARRAY_BUFFER).values, [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  renderer.dispose(); assertReleased(mock);
});
