// Windows 桌面壁纸收不到真实点击：全局鼠标钩子旁听轻点，再判断点下去的是不是桌面图标层。浮在桌面上的
// 系统时钟、日期小组件会截走这一下，卡片右上角的“设置”等按钮就点不开。这种轻点现在照样转给页面，但只
// 给卡片上的控件，绝不当成往别人窗口后面投食。
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const read=p=>fs.readFileSync(require.resolve(p),'utf8');
// 注释里也会提到这些名字，先去掉注释再断言。
const code=p=>read(p).split('\n').filter(l=>!l.trimStart().startsWith('//')).join('\n');

function pondTap(env){
  const m=code('../app.js').match(/window\.pondTap=\(x,y,controlsOnly\)=>\{[\s\S]*?\n\};/);
  assert.ok(m,'pondTap(x, y, controlsOnly) 还在');
  return new Function('scene','cardAwake','cornerMode','document','simulation','sound','feedAt','window',
    'return '+m[0].replace('window.pondTap=',''))(env.scene,()=>{env.awake++;},true,env.document,env.simulation,{active:false},()=>env.fed++,env.window);
}

test('透过浮层的轻点落在卡片按钮上：照常请求面板',()=>{
  const posted=[],old=global.window;
  const env={awake:0,fed:0,scene:{touchSeasons(){assert.fail('不该落到池塘上')}},simulation:{isWater(){return true},food:[]},
    document:{elementFromPoint:()=>({tagName:'BUTTON',dataset:{panel:'settings'},closest(){return {dataset:{panel:'settings'}};}})},window:{chrome:{webview:{postMessage:m=>posted.push(m)}}}};
  global.window=env.window;
  try{pondTap(env)(900,40,true);}finally{global.window=old;}
  assert.deepEqual(posted,['panel:settings']);
  assert.equal(env.awake,1);assert.equal(env.fed,0);
});

test('透过浮层的轻点没落在控件上：到此为止，不投食、不惊鱼',()=>{
  const env={awake:0,fed:0,touched:0,scene:{touchSeasons(){env.touched++;return true;}},simulation:{isWater(){return true},food:[]},
    document:{elementFromPoint:()=>null},window:{}};
  const tap=pondTap(env);
  tap(500,500,true);
  assert.equal(env.touched,0,'不碰季节交互');assert.equal(env.fed,0,'不投食');
  // 同一位置若是桌面图标层上的轻点，仍然照旧到得了池塘。
  tap(500,500,false);
  assert.ok(env.touched+env.fed>0,'桌面上的轻点还是到得了池塘');
});

test('Windows 宿主：非桌面图标层的轻点只在“透明浮层”时才转交，且只给卡片控件',()=>{
  const app=code('../native/windows/PondApp.cs'),win=code('../native/windows/PondWindows.cs');
  assert.match(app,/bool desktop = IsDesktopLayer\(under, underClass\), overlay = !desktop && IsOverlay\(under\)/);
  assert.match(app,/if \(!desktop && !overlay\) return;/,'其它窗口上的点击一律不碰');
  assert.match(app,/\?\.Tap\(p, !desktop\);/,'透过浮层的那一下只给卡片控件');
  // 只有“分层且不是完全不透明”的窗口才算浮层；应用自己的窗口永远不算。
  const overlay=app.match(/private static bool IsOverlay\(IntPtr under\)\s*\{([\s\S]*?)\n    \}/);
  assert.ok(overlay,'IsOverlay 还在');
  assert.match(overlay[1],/if \(IsOurs\(root\)\) return false;/);
  assert.match(overlay[1],/\(ex & Native\.WS_EX_LAYERED\) != 0 && !FullyOpaque\(w\)\) return true;/);
  assert.doesNotMatch(overlay[1],/WS_EX_TOOLWINDOW|WS_EX_NOACTIVATE/,'普通工具窗口不算浮层');
  // 宿主把“只给控件”作为第三个参数交给页面。
  assert.match(win,/Send\("pondTapDevice", screenPoint, controlsOnly\)/);
  assert.match(win,/string only = controlsOnly \? ",true" : "";/);
  assert.match(win,/\{method\}\(\{x:0\.#\},\{y:0\.#\}\)\{only\}/);
  assert.match(code('../native/windows/Native.cs'),/GetLayeredWindowAttributes\(IntPtr hwnd, out uint key, out byte alpha, out uint flags\)/);
  assert.match(code('../native/windows/Native.cs'),/GetAncestor\(IntPtr hwnd, uint flags\)/);
});
