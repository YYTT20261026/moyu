const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('设置提供单屏 / 多屏 / 共用三档，宿主按模式重建壁纸', () => {
  const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  assert.match(app, /screenMode:'single',screenModeSet:false/, '默认单屏（只在主屏显示）');
  assert.match(app, /if\(src\.screenModeSet===true\)/, '旧存档没有“人选过”的标记时回到默认');
  assert.match(app, /\['single','multi','shared'\]\.includes\(src\.screenMode\)/, '旧存档要校验');
  assert.ok(app.includes('screenRow=desktopHost?'), '只在桌面宿主里显示这一行');
  for (const label of ['单屏幕显示', '多屏幕显示', '多屏共用显示']) assert.ok(app.includes(label), `${label} 出现在设置里`);
  assert.ok(app.includes("$('#screen-mode')?.addEventListener"), '切换后保存设置');

  const win = fs.readFileSync(require.resolve('../native/windows/PondApp.cs'), 'utf8');
  assert.ok(win.includes('SystemInformation.VirtualScreen'), 'Windows 共用模式用整个虚拟桌面');
  assert.ok(win.includes('Screen.PrimaryScreen'), 'Windows 单屏模式只建主屏窗口');
  assert.ok(win.includes('LoadScreenMode()') && win.includes('SaveScreenMode('), '屏幕模式在重启后保留');
  assert.ok(win.includes('screenMode == "shared"'), 'Windows 共用模式分支');

  const mac = fs.readFileSync(require.resolve('../native/macos/main.swift'), 'utf8');
  assert.ok(mac.includes('screenMode'), 'macOS 也读取屏幕模式');
  assert.ok(mac.includes('case "shared"') && mac.includes('case "single"'), 'macOS 单屏 / 共用分支');
  assert.ok(mac.includes('MoYuScreenMode'), 'macOS 用 UserDefaults 记住选择');
});
