const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const windows = fs.readFileSync(path.join(__dirname, '../native/windows/PondWindows.cs'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../native/windows/PondApp.cs'), 'utf8');
const body = (source, name) => {
  const match = source.match(new RegExp('(?:private|public) (?:static |async )?(?:void|bool|Task) ' + name + '\\([^\\n]*\\)\\r?\\n        \\{([\\s\\S]*?)\\r?\\n        \\}'));
  assert.ok(match, name + ' 方法应存在');
  return match[1];
};
const documentScript = windows.match(/PauseDocumentScript = @"([\s\S]*?)";/)[1];
const applyExpression = windows.match(/string script = ([\s\S]*?);\r?\n                    string applied/)[1];
const applyScript = new Function('documentTokenJson', 'paused', 'return ' + applyExpression);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// 只转换语法，不复制暂停/重建算法：这些测试实际执行 C# 方法体里的分支和 await 顺序。
function convert(source) {
  return source
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\b(?:string|bool|long|int|var) (\w+) =/g, 'let $1 =')
    .replace(/_ = /g, '')
    .replace(/\.StartsWith\(/g, '.startsWith(')
    .replace(/\.Replace\(/g, '.replace(')
    .replace(/Math\.Min\(/g, 'Math.min(')
    .replace(/catch \(Exception(?: ex)?\)/g, 'catch (ex)')
    .replace(/catch \(OperationCanceledException\) \{ \}/g, 'catch (ex) { if (ex.name !== "AbortError") throw ex; }')
    .replace(/Task\.Delay\(/g, 'wait(')
    .replace(/lifetime\.Token/g, 'signal');
}
const compile = (source, name, args = [], async = false) => new (async ? AsyncFunction : Function)(...args, 'with(this){' + convert(body(source, name)) + '}');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function pauseHost() {
  const host = {
    DesiredPaused: true, Paused: null, pauseLifecycleInstalled: true, pauseSending: false,
    pauseSyncPending: false, navigationReady: false, navigationGeneration: 0, navigationId: 0,
    documentScriptPaused: true, pauseDocumentScriptId: 'initial', documentTokenJson: null,
    IsDisposed: false, Disposing: false, PauseDocumentScript: documentScript,
    bootstrap: documentScript.replace('DESIRED_PAUSED', 'true'), calls: [], active: 0, maxActive: 0, posts: [],
  };
  host.UpdatePauseDocumentScript = compile(windows, 'UpdatePauseDocumentScript', ['core', 'paused'], true);
  host.IsCurrentDocument = compile(windows, 'IsCurrentDocument', ['generation']);
  host.SetPaused = compile(windows, 'SetPaused', ['paused']);
  host.RequestPauseSync = compile(windows, 'RequestPauseSync');
  const synchronize = compile(windows, 'SynchronizePause', [], true);
  host.SynchronizePause = function () { return this.done = synchronize.call(this); };
  host.View = { CoreWebView2: {
    async AddScriptToExecuteOnDocumentCreatedAsync(script) { host.bootstrap = script; return 'updated'; },
    RemoveScriptToExecuteOnDocumentCreated() {},
    async ExecuteScriptAsync(script) {
      host.calls.push(script);
      host.maxActive = Math.max(host.maxActive, ++host.active);
      try {
        const applying = script.startsWith('(()=>{if(window.__pondHostDocument');
        if (applying && host.nextResponse) {
          const response = host.nextResponse; host.nextResponse = null;
          if (response === 'throw') throw new Error('模拟渲染进程暂不可用');
          return response;
        }
        if (applying && host.holdApply) {
          const gate = host.holdApply; host.holdApply = null;
          const oldResult = gate.afterExecution ? vm.runInContext(script, host.context) : undefined;
          gate.entered.resolve();
          await gate.release.promise;
          if (gate.afterExecution) return JSON.stringify(oldResult);
        }
        return JSON.stringify(vm.runInContext(script, host.context)) ?? 'null';
      } finally { host.active--; }
    },
  } };
  host.newDocument = function () {
    const events = new EventTarget();
    this.window = {
      addEventListener: events.addEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events),
      chrome: { webview: { postMessage: message => {
        this.posts.push(JSON.stringify(message));
        if (JSON.stringify(message) === '{"pondLifecycle":"ready"}') this.RequestPauseSync();
      } } },
    };
    this.window.top = this.window;
    this.context = vm.createContext({ window: this.window });
    vm.runInContext(this.bootstrap, this.context);
    this.applied = [];
  };
  host.navigate = function (id, canceled = false) {
    if (canceled) return;
    this.navigationId = id; this.navigationGeneration++;
    this.navigationReady = false; this.Paused = null; this.documentTokenJson = null;
    this.RequestPauseSync(); this.newDocument();
  };
  host.complete = function (id, success = true) {
    if (id !== this.navigationId) return;
    this.navigationReady = success;
    if (success) this.RequestPauseSync();
  };
  host.ready = function () {
    this.window.pondControl = { pause: value => this.applied.push(value) };
    this.window.__pondReady = true;
    this.window.dispatchEvent(new Event('pond-ready'));
  };
  host.dispose = function () {
    this.IsDisposed = true; this.pauseLifecycleInstalled = false;
    this.navigationGeneration++; this.navigationReady = false;
    this.pauseSyncPending = false; this.Paused = null;
  };
  return host;
}
const holdApply = (host, afterExecution = false) => host.holdApply = { entered: deferred(), release: deferred(), afterExecution };
const loaded = async host => {
  host.navigate(1); host.complete(1); host.ready(); await host.done;
};

test('生命周期在首次 Navigate 之前安装，导航取消不失效，旧 NavigationCompleted 不污染新代次', () => {
  assert.match(windows, /Func<WebView2, Task> beforeNavigate = null/);
  const callback = windows.indexOf('if (beforeNavigate != null) await beforeNavigate(view);');
  const navigate = windows.indexOf('core.Navigate(');
  assert.ok(callback > 0 && callback < navigate);
  assert.match(windows.slice(callback, navigate), /parent\.IsDisposed \|\| parent\.Disposing \|\| view\.IsDisposed/);
  assert.match(windows, /beforeNavigate: InstallPauseLifecycle/);
  const install = body(windows, 'InstallPauseLifecycle');
  assert.ok(install.indexOf('NavigationStarting +=') < install.indexOf('await UpdatePauseDocumentScript'));
  assert.match(install, /if \(e\.Cancel \|\| .*uri\.Host != PondPage\.Host\) return;/);
  assert.match(install, /navigationGeneration\+\+;[\s\S]*Paused = null;[\s\S]*documentTokenJson = null;/);
  assert.match(install, /if \(e\.NavigationId != navigationId\) return;/);
  assert.match(app, /wall\.SetPaused\(paused\);/);
  assert.doesNotMatch(body(app, 'SetPaused'), /wall\.Paused\s*=/);
});

test('ready 早于导航完成：启动读取期望暂停，完成后才确认，ready 对象不走存档通道', async () => {
  const host = pauseHost();
  host.navigate(1);
  assert.equal(host.window.__pondDesiredPaused, true);
  host.ready(); await host.done;
  assert.equal(host.Paused, null); assert.deepEqual(host.applied, []);
  host.complete(1); await host.done;
  assert.equal(host.Paused, true); assert.deepEqual(host.applied, [true]);
  assert.deepEqual(host.posts, ['{"pondLifecycle":"ready"}']);
  assert.match(windows, /TryGetWebMessageAsString\(\)/);
  assert.match(windows, /if\(window\.top!==window\)return;/);
});

test('导航完成早于 pondControl：未就绪不确认，ready 后补发且确认', async () => {
  const host = pauseHost();
  host.navigate(1); host.complete(1); await host.done;
  assert.equal(host.Paused, null);
  host.ready(); await host.done;
  assert.equal(host.Paused, true);
  host.SetPaused(false); await host.done;
  assert.equal(host.Paused, false);
  assert.match(host.bootstrap, /window\.__pondDesiredPaused=false/);
  const count = host.calls.length;
  host.SetPaused(false); await host.done;
  assert.equal(host.calls.length, count, '已确认且未改变的状态不重复发送');
});

test('null/异常响应均不乐观确认、不自旋，下一次 watch 触发重试', async () => {
  for (const response of ['null', 'throw']) {
    const host = pauseHost(); host.nextResponse = response;
    await loaded(host);
    assert.equal(host.Paused, null);
    const count = host.calls.length;
    await Promise.resolve();
    assert.equal(host.calls.length, count, '没有外部触发时不再发送');
    host.SetPaused(true); await host.done;
    assert.equal(host.Paused, true);
  }
});

test('发送期间改变期望：串行发送并收敛到最新暂停状态', async () => {
  const host = pauseHost();
  host.navigate(1); host.complete(1); await host.done;
  const gate = holdApply(host);
  host.ready(); await gate.entered.promise;
  host.SetPaused(false); gate.release.resolve(); await host.done;
  assert.equal(host.maxActive, 1);
  assert.equal(host.Paused, false); assert.equal(host.DesiredPaused, false);
  assert.deepEqual(host.applied, [true, false]);
});

test('重载时旧脚本不能修改新文档，旧成功响应不能确认新代次', async () => {
  for (const afterExecution of [false, true]) {
    const host = pauseHost();
    host.navigate(1); host.complete(1); await host.done;
    const gate = holdApply(host, afterExecution);
    host.ready(); await gate.entered.promise;
    const oldToken = host.documentTokenJson;
    host.navigate(2); host.complete(1);
    assert.equal(host.navigationReady, false, '旧完成事件无效');
    assert.equal(vm.runInContext(applyScript(oldToken, false), host.context), false);
    assert.equal(host.window.__pondDesiredPaused, true);
    gate.release.resolve(); await host.done;
    assert.equal(host.Paused, null, '旧 true 响应不能确认新页面');
    assert.deepEqual(host.applied, []);
    host.complete(2); host.ready(); await host.done;
    assert.equal(host.Paused, true); assert.deepEqual(host.applied, [true]);
  }
});

test('取消外部导航保留确认状态；窗口释放后在途响应不能重新确认', async () => {
  const host = pauseHost(); await loaded(host);
  const generation = host.navigationGeneration;
  host.navigate(2, true);
  assert.equal(host.Paused, true); assert.equal(host.navigationGeneration, generation);
  const gate = holdApply(host, true);
  host.SetPaused(false); await gate.entered.promise;
  host.dispose(); gate.release.resolve(); await host.done;
  assert.equal(host.Paused, null); assert.equal(host.pauseSending, false);
});

class Queue {
  constructor() { this.values = []; this.receivers = []; }
  push(value) { const receiver = this.receivers.shift(); if (receiver) receiver(value); else this.values.push(value); }
  next() { return this.values.length ? Promise.resolve(this.values.shift()) : new Promise(resolve => this.receivers.push(resolve)); }
}
function rebuildHost() {
  const controller = new AbortController();
  const host = {
    env: {}, quitting: false, rebuilding: false, rebuildPending: false, rebuildDelay: 0,
    signal: controller.signal, waits: new Queue(), builds: new Queue(), active: 0, maxActive: 0,
    created: 0, errors: [], Report: (_, ex) => host.errors.push(ex),
    async wait(delay, signal) {
      const gate = deferred();
      const abort = () => gate.reject(new DOMException('已退出', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      host.waits.push({ delay, finish: gate.resolve });
      try { await gate.promise; } finally { signal.removeEventListener('abort', abort); }
    },
    async BuildWallpapers() {
      host.maxActive = Math.max(host.maxActive, ++host.active);
      const gate = deferred(); host.builds.push({ finish: gate.resolve });
      try { await gate.promise; if (!host.quitting) host.created++; }
      finally { host.active--; }
    },
    quit() { this.quitting = true; this.rebuildPending = false; controller.abort(); },
  };
  // UI 调度由独立源码契约检查；模型只执行同一 UI 线程上的 pending/取消算法。
  const request = body(app, 'Rebuild').replace(/if \(System\.Threading\.SynchronizationContext\.Current != uiContext\)\s*\{[\s\S]*?\n            \}/, '');
  host.Rebuild = new Function('delay', 'with(this){' + convert(request) + '}');
  const drain = compile(app, 'RebuildPending', [], true);
  host.RebuildPending = function () { return this.done = drain.call(this); };
  return host;
}

test('重建请求在等待/构建期间合并但不丢失，后续构建串行执行', async () => {
  const host = rebuildHost();
  host.Rebuild(100);
  const firstWait = await host.waits.next();
  host.Rebuild(30); host.Rebuild(10); firstWait.finish();
  const firstBuild = await host.builds.next();
  host.Rebuild(2); firstBuild.finish();
  const secondWait = await host.waits.next();
  assert.equal(secondWait.delay, 2);
  secondWait.finish(); (await host.builds.next()).finish(); await host.done;
  assert.equal(host.maxActive, 1); assert.equal(host.created, 2);
  assert.equal(host.rebuilding, false); assert.equal(host.rebuildPending, false);
});

test('首次 Build 占用串行锁，其间请求在首次完成后继续处理', async () => {
  assert.match(body(app, 'Start'), /rebuilding = true;\s*try \{ await BuildWallpapers\(\); \}\s*finally \{ rebuilding = false; \}/);
  assert.match(body(app, 'Start'), /if \(rebuildPending\) Rebuild\(rebuildDelay\);/);
  const host = rebuildHost(); host.rebuilding = true;
  const first = host.BuildWallpapers();
  host.Rebuild(50); host.Rebuild(5);
  assert.equal(host.waits.values.length, 0);
  (await host.builds.next()).finish(); await first;
  host.rebuilding = false; host.Rebuild(host.rebuildDelay);
  const wait = await host.waits.next(); assert.equal(wait.delay, 5);
  wait.finish(); (await host.builds.next()).finish(); await host.done;
  assert.equal(host.maxActive, 1); assert.equal(host.created, 2);
});

test('等待重建或正在 Build 时退出：取消延迟，续体不得创建壁纸或重新排队', async () => {
  for (const building of [false, true]) {
    const host = rebuildHost(); host.Rebuild(100);
    const wait = await host.waits.next();
    let build;
    if (building) { wait.finish(); build = await host.builds.next(); }
    host.Rebuild(0); host.quit();
    if (build) build.finish();
    await host.done; host.Rebuild(0);
    assert.equal(host.created, 0); assert.equal(host.rebuildPending, false);
    assert.equal(host.rebuilding, false); assert.deepEqual(host.errors, []);
  }
});

test('退出守卫覆盖环境创建、初始化中的窗口和面板预热；面板加入存档广播', () => {
  assert.match(body(app, 'Start'), /env = await CoreWebView2Environment\.CreateAsync[^;]*;\s*if \(quitting\) return;/);
  const build = body(app, 'BuildWallpapers');
  assert.match(build, /buildingWall = wall;/);
  assert.match(build, /await wall\.Start[^;]*;\s*if \(quitting\)[\s\S]*?return;\s*\}\s*walls\.Add\(wall\);/);
  assert.match(build, /finally \{ buildingWall = null; \}/);
  assert.match(body(app, 'Quit'), /quitting = true;[\s\S]*lifetime\.Cancel\(\);[\s\S]*buildingWall\.Close\(\); buildingWall\.Dispose\(\);/);
  assert.match(body(app, 'PrewarmPanel'), /Task\.Delay\(200, lifetime\.Token\)/);
  assert.match(body(app, 'PrewarmPanel'), /if \(quitting \|\| panelWindow != null\) return;/);
  assert.match(body(app, 'ShowPanel'), /if \(quitting \|\| form\.IsDisposed\) return;/);
  assert.match(app, /Concat\(new\[\] \{ window\?\.View, panelWindow\?\.View \}\)/);
  assert.match(body(app, 'Rebuild'), /uiContext\.Post\(_ => Rebuild\(delay\), null\)/);
  assert.match(body(app, 'UpdateVisibility'), /uiContext\.Post\(_ => UpdateVisibility\(\), null\)/);
});
