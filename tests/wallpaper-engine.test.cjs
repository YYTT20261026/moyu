const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Wallpaper Engine 的属性面板每一项都有处理器，暂停接口也已接上', () => {
  const project = JSON.parse(fs.readFileSync(require.resolve('../project.json'), 'utf8'));
  const names = Object.keys(project.general.properties);
  assert.ok(names.length >= 10, 'project.json 仍提供可编辑属性');
  const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  const start = app.indexOf('window.wallpaperPropertyListener=');
  assert.ok(start >= 0, '页面导出 wallpaperPropertyListener');
  const end = app.indexOf('\n', start);
  const listener = app.slice(start, end < 0 ? undefined : end);
  assert.ok(listener.includes('applyGeneralProperties'), '接收 WE 的 fps 设置');
  assert.ok(listener.includes('applyUserProperties'), '接收 WE 的用户属性');
  assert.ok(listener.includes('setPaused'), '接收 WE 的暂停/恢复');
  for (const name of names) {
    // Some properties are mapped through a [property, setting] table, so accept the quoted key too.
    assert.ok(listener.includes(`properties.${name}`) || listener.includes(`'${name}'`), `属性 ${name} 需要被 applyUserProperties 处理`);
  }
});

test('启动时页面即使被宿主按隐藏处理，也会先画出首帧而不是停在 CSS 静图', () => {
  const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  assert.match(app, /function ensureFrame\(\)\{if\(frameStarted\|\|appDisposed\)return;frameStarted=true;last=0;nextFrameAt=0;frame\(performance\.now\(\)\);\}/,
    'ensureFrame 应同步画出首帧，不能只等 rAF');
  assert.match(app, /if\(document\.hidden&&pondFrameReady\)return;time\+=dt;/,
    '隐藏只应暂停首帧之后的重绘，否则壁纸启动时会一直停在静图');
  assert.ok(!/if\(paused\|\|document\.hidden\|\|!renderer\)return/.test(app), '不要在首帧前因隐藏直接返回');
});
