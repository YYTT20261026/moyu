// MoYu · the Windows app: the pond as the desktop wallpaper on every screen, a tray icon to control it, and an
// interactive window. Every save one pond page makes is passed to the others, so they stay in step.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace BichiPond
{
    internal sealed class PondApp : ApplicationContext
    {
        private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run", RunName = "BichiKoiPond";
        // Legacy: pages used to ask the host to open the interactive window at a panel; the wallpaper's card
        // now opens its panel in place, so this only serves a page left open from an older build.
        private const string PanelRequest = "panel:";
        private readonly List<WallpaperForm> walls = new List<WallpaperForm>();
        private readonly NotifyIcon tray = new NotifyIcon();
        private ToolStripMenuItem soundItem;
        // Checked often, so a screen that comes back starts drawing again right away instead of up to a
        // second later (the pond would look frozen for a moment after a full-screen app closed).
        private readonly Timer watch = new Timer { Interval = 300 };
        private readonly ShellWatcher shell;
        private CoreWebView2Environment env;
        private InteractiveForm window;
        private PanelForm panelWindow;
        private bool userPaused, locked, rebuilding, quitting, soundOn, opening, rebuildPending;
        private int rebuildDelay;
        private WallpaperForm buildingWall;
        private readonly System.Threading.CancellationTokenSource lifetime = new System.Threading.CancellationTokenSource();
        private System.Threading.SynchronizationContext uiContext;
        private string screenSignature = "";
        // "single" keeps the pond on the primary screen, "multi" gives every screen its own, "shared" spans
        // the whole virtual desktop with one pond. Stored beside the WebView2 data so the first build after
        // boot already uses the last choice instead of waiting for a page to save it.
        private string screenMode = LoadScreenMode();
        private string season = "spring";
        private string weather = "sunny";
        private bool night;
        // Taps on the desktop, seen through a low-level mouse hook (the desktop icons layer takes the real clicks).
        private IntPtr hook;
        private Native.LowLevelMouseProc hookProc;
        // Esc on the desktop leaves the immersive view: the wallpaper page never has the keyboard.
        private IntPtr keyHook;
        private Native.LowLevelKeyboardProc keyProc;
        private Native.POINT downAt;
        private uint downTime;
        // Holding the button still scatters food; two quick taps frighten the koi.
        private readonly Timer hold = new Timer { Interval = 520 };
        private bool pressed, moved;
        private Native.POINT lastUpAt;
        private uint lastUpTime;

        public PondApp()
        {
            shell = new ShellWatcher(() => Rebuild(1500));
            hold.Tick += HoldTick;
            BuildTray();
            watch.Tick += (s, e) =>
            {
                if (AnyWallpaperLost()) { Rebuild(200); return; }
                UpdateVisibility();
            };
            SystemEvents.DisplaySettingsChanged += (s, e) => Rebuild(800);
            SystemEvents.SessionSwitch += (s, e) =>
            {
                if (e.Reason == SessionSwitchReason.SessionLock || e.Reason == SessionSwitchReason.ConsoleDisconnect || e.Reason == SessionSwitchReason.RemoteDisconnect) locked = true;
                if (e.Reason == SessionSwitchReason.SessionUnlock || e.Reason == SessionSwitchReason.ConsoleConnect || e.Reason == SessionSwitchReason.RemoteConnect) locked = false;
                UpdateVisibility();
            };
            // Start once the message loop runs, on the UI thread: every await below must come back to this thread,
            // where the windows are created (there is no WinForms synchronization context until a loop is running).
            var kickoff = new Timer { Interval = 1 };
            kickoff.Tick += async (s, e) =>
            {
                kickoff.Stop(); kickoff.Dispose();
                try { await Start(); }
                catch (Exception ex) { if (!quitting) { Report("启动失败", ex); Quit(); } }
            };
            kickoff.Start();
        }

        private async Task Start()
        {
            if (quitting) return;
            uiContext = System.Threading.SynchronizationContext.Current;
            string runtime = null;
            try { runtime = CoreWebView2Environment.GetAvailableBrowserVersionString(); } catch (WebView2RuntimeNotFoundException) { }
            if (string.IsNullOrEmpty(runtime))
            {
                if (MessageBox.Show("MoYu 需要 Microsoft Edge WebView2 运行时（Windows 11 自带，Windows 10 多数已通过更新安装）。\n\n现在打开下载页面吗？", "MoYu", MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                    PondPage.OpenInBrowser("https://developer.microsoft.com/microsoft-edge/webview2/");
                Quit();
                return;
            }
            string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BichiPond", "WebView2");
            // A wallpaper page is clicked through to the desktop's icon layer (see TapIfDesktop), so it never sees a real
            // user gesture; Chromium's autoplay policy would then keep its AudioContext suspended forever and the desktop
            // pond would stay silent however the sound setting is switched. The interactive window gets gestures itself,
            // which is why sound only ever worked there.
            var options = new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required");
            env = await CoreWebView2Environment.CreateAsync(null, data, options);
            if (quitting) return;
            screenSignature = CurrentScreenSignature();
            // 首次构建也占用同一串行锁；其间到达的重建请求留在 pending 中。
            rebuilding = true;
            try { await BuildWallpapers(); }
            finally { rebuilding = false; }
            if (quitting) return;
            if (rebuildPending) Rebuild(rebuildDelay);
            hookProc = OnMouse;
            hook = Native.SetWindowsHookEx(Native.WH_MOUSE_LL, hookProc, Native.GetModuleHandle(null), 0);
            keyProc = OnKey;
            keyHook = Native.SetWindowsHookEx(Native.WH_KEYBOARD_LL, keyProc, Native.GetModuleHandle(null), 0);
            watch.Start();
            PrewarmPanel();
        }

        private async Task BuildWallpapers()
        {
            if (quitting) return;
            // After an Explorer restart these windows are already gone with the old desktop; just let them go.
            foreach (var w in walls) { try { w.Close(); w.Dispose(); } catch (Exception) { } }
            walls.Clear();
            if (!Desktop.Find()) return;
            var targets = new List<Tuple<string, Rectangle, Rectangle>>();
            if (screenMode == "shared")
            {
                // One window over the whole virtual desktop, so the painting is continuous and a koi can
                // swim from one monitor to the next. Work area == bounds: the card keeps to the edge of the
                // combined desktop rather than to one screen's taskbar.
                Rectangle all = SystemInformation.VirtualScreen;
                targets.Add(Tuple.Create("shared", all, all));
            }
            else
            {
                var monitors = Native.Monitors();
                if (screenMode == "single")
                {
                    string primary = Screen.PrimaryScreen?.DeviceName;
                    var only = monitors.FirstOrDefault(m => m.Item1 == primary) ?? monitors.FirstOrDefault();
                    if (only != null) monitors = new List<Tuple<string, Rectangle, Rectangle>> { only };
                }
                targets.AddRange(monitors);
            }
            Exception first = null;
            foreach (var m in targets)
            {
                if (quitting) return;
                var wall = new WallpaperForm(m.Item1, m.Item2, m.Item3);
                buildingWall = wall;
                try
                {
                    await wall.Start(env, OnSave, OnProcessFailed);
                    if (quitting)
                    {
                        try { wall.Close(); wall.Dispose(); } catch (Exception) { }
                        return;
                    }
                    walls.Add(wall);
                }
                catch (Exception ex)
                {
                    try { wall.Close(); wall.Dispose(); } catch (Exception) { }
                    if (quitting) return;
                    // A screen whose WebView2 cannot be built must not stay in the list: AnyWallpaperLost would
                    // read it as a lost pond every 300 ms, rebuild, fail again — an endless rebuild (and dialog).
                    first = first ?? ex;
                    Note($"screen {m.Item1}: pond window failed — {ex.Message}");
                }
                finally { buildingWall = null; }
            }
            // If every screen failed there is nothing left to watch; report it once instead of looping.
            if (walls.Count == 0 && first != null) throw first;
            UpdateVisibility();
        }

        // Screens changed, or Explorer restarted and took the desktop layers (and our wallpapers) with it.
        private void Rebuild(int delay)
        {
            if (quitting || env == null) return;
            // SystemEvents 可能来自非 UI 线程，所有 pending 和窗口操作都回到同一消息循环。
            if (System.Threading.SynchronizationContext.Current != uiContext)
            {
                uiContext.Post(_ => Rebuild(delay), null);
                return;
            }
            rebuildDelay = rebuildPending ? Math.Min(rebuildDelay, delay) : delay;
            rebuildPending = true;
            if (!rebuilding) _ = RebuildPending();
        }

        private async Task RebuildPending()
        {
            rebuilding = true;
            try
            {
                while (rebuildPending && !quitting)
                {
                    int delay = rebuildDelay;
                    rebuildPending = false;
                    await Task.Delay(delay, lifetime.Token);
                    if (quitting) return;
                    try { await BuildWallpapers(); }
                    catch (Exception ex) { if (!quitting) Report("桌面壁纸重建失败", ex); }
                }
            }
            catch (OperationCanceledException) { }
            finally { rebuilding = false; }
        }

        // A WebView2 process went away. A renderer that crashed (GPU reset, out of memory) can be reloaded in place, but a
        // browser process terminated from outside cannot: something else killed it and there is nothing left to reload.
        // Installing or uninstalling any Edge-family product does exactly that — its installer replaces the WebView2
        // runtime and stops every msedgewebview2 process to release the DLL locks, so the pond would vanish silently and
        // never come back. Rebuilding every screen covers both kinds, and any number of lost views at once.
        private void OnProcessFailed(WebView2 view, CoreWebView2ProcessFailedKind kind)
        {
            if (quitting) return;
            Note($"WebView2 进程失败：{kind}");
            if (kind != CoreWebView2ProcessFailedKind.BrowserProcessExited)
            {
                try { view.Reload(); } catch (Exception) { }
                return;
            }
            Rebuild(200);
        }

        // Nothing fails loudly once a WebView2 process is gone: the windows stay on screen showing an empty pond. The watch
        // timer already ticks every few hundred milliseconds, so a peek at the wallpapers costs nothing and covers the case
        // where the host was killed outright and ProcessFailed never arrived. Opening the interactive window is one-shot:
        // while it is filling a view in, CoreWebView2 is still null, which would otherwise read as a lost pond and rebuild
        // the desktop for nothing.
        private bool AnyWallpaperLost()
        {
            if (quitting || rebuilding || opening || walls.Count == 0) return false;
            foreach (var w in walls) if (w.View?.CoreWebView2 == null) return true;
            return window != null && !window.IsDisposed && window.View?.CoreWebView2 == null;
        }

        private IEnumerable<WebView2> Views => walls.Select(w => w.View).Concat(new[] { window?.View, panelWindow?.View }).Where(v => v?.CoreWebView2 != null);

        // A page saved the pond: hand the same save to every other page, and note the weather for the menu.
        private void OnSave(WebView2 from, string json)
        {
            if (quitting) return;
            // The wallpaper's corner card asks for a panel: open the interactive window straight into it.
            if (json?.StartsWith(PanelRequest) == true)
            {
                string name = json.Substring(PanelRequest.Length);
                if (name == "fish" || name == "weather" || name == "settings") MainThread(() => ShowPanel(name));
                return;
            }
            string call = "window.__pondSync&&__pondSync(" + PondPage.JsString(json) + ")";
            foreach (var v in Views) if (v != from) _ = v.CoreWebView2.ExecuteScriptAsync(call);
            var se = Regex.Match(json, "\"season\":\"(\\w+)\"");
            if (se.Success) season = se.Groups[1].Value;
            var w = Regex.Match(json, "\"weather\":\"(\\w+)\"");
            if (w.Success) weather = w.Groups[1].Value;
            var n = Regex.Match(json, "\"night\":(true|false)");
            if (n.Success) night = n.Groups[1].Value == "true";
            var s = Regex.Match(json, "\"soundOn\":(true|false)");
            if (s.Success) soundOn = s.Groups[1].Value == "true";
            var mode = Regex.Match(json, "\"screenMode\":\"(single|multi|shared)\"");
            if (mode.Success && mode.Groups[1].Value != screenMode)
            {
                screenMode = mode.Groups[1].Value;
                SaveScreenMode(screenMode);
                Note($"screen mode: {screenMode}");
                // Leave the WebView2 message callback before its own window is closed by the rebuild.
                Rebuild(150);
            }
        }

        // A menu command goes to one page (the interactive window if open); its save carries the change to the others.
        private void Command(string options)
        {
            var target = window?.View?.CoreWebView2 != null ? window.View : walls.Select(w => w.View).FirstOrDefault(v => v?.CoreWebView2 != null);
            if (target != null) _ = target.CoreWebView2.ExecuteScriptAsync($"window.pondControl&&pondControl.set({options})");
        }

        private static void SetPaused(WallpaperForm wall, bool paused)
        {
            // 即使页面未就绪或上次发送失败，也保留期望并让 watch 再次触发同步。
            wall.SetPaused(paused);
        }

        // Each screen's pond rests while nobody can see it: a maximised or full-screen app over it, or the session locked.
        private void UpdateVisibility()
        {
            if (quitting) return;
            if (uiContext != null && System.Threading.SynchronizationContext.Current != uiContext)
            {
                uiContext.Post(_ => UpdateVisibility(), null);
                return;
            }
            // The desktop's geometry can change without DisplaySettingsChanged firing — a remote session
            // resizing its virtual display, say — which would leave the pond sized for the old screen (its
            // controls hanging off the edge). Compare the screens once a second and re-attach when they move.
            string screens = CurrentScreenSignature();
            if (screens != screenSignature)
            {
                screenSignature = screens;
                Rebuild(350);
            }
            IntPtr fg = Native.GetForegroundWindow();
            IntPtr covering = IntPtr.Zero;
            if (fg != IntPtr.Zero && Native.IsWindowVisible(fg) && !IsShell(fg) && Native.GetWindowRect(fg, out var r))
            {
                var mi = new Native.MONITORINFO { cbSize = System.Runtime.InteropServices.Marshal.SizeOf(typeof(Native.MONITORINFO)) };
                Native.GetMonitorInfo(Native.MonitorFromWindow(fg, Native.MONITOR_DEFAULTTONEAREST), ref mi);
                bool full = r.Left <= mi.rcMonitor.Left && r.Top <= mi.rcMonitor.Top && r.Right >= mi.rcMonitor.Right && r.Bottom >= mi.rcMonitor.Bottom;
                if (full || Native.IsZoomed(fg)) covering = fg;
            }
            foreach (var w in walls)
            {
                bool coveredHere = covering != IntPtr.Zero && (w.DeviceName == "shared" || Screen.FromHandle(covering).DeviceName == w.DeviceName);
                w.SetHidden(locked || coveredHere);
                // Paused is the only thing that stops the page drawing: a covered or locked screen keeps its
                // last frame on the desktop, so nothing flashes when the app in front goes away.
                SetPaused(w, userPaused || locked || coveredHere);
            }
        }

        /// <summary>Every screen's bounds and work area, so a change in either is noticed.</summary>
        private static string CurrentScreenSignature()
        {
            return string.Join("|", Native.Monitors().Select(m => $"{m.Item2.X},{m.Item2.Y},{m.Item2.Width},{m.Item2.Height}").OrderBy(s => s));
        }

        /// <summary>Next to the WebView2 data: the last screen mode survives a restart, so boot does not
        /// build the wrong layout first and rebuild a moment later.</summary>
        private static string ScreenModeFile => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BichiPond", "screen-mode.txt");

        private static string LoadScreenMode()
        {
            try
            {
                string saved = File.ReadAllText(ScreenModeFile).Trim();
                if (saved == "single" || saved == "multi" || saved == "shared") return saved;
            }
            catch (Exception) { }
            return "single";
        }

        private static void SaveScreenMode(string mode)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(ScreenModeFile));
                File.WriteAllText(ScreenModeFile, mode);
            }
            catch (Exception) { }
        }

        private static bool IsShell(IntPtr hwnd)
        {
            string c = Native.ClassOf(hwnd);
            return c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd" || c == "SysListView32";
        }

        // A click on the desktop itself (not on an app window) that did not move: the koi come for food there.
        // The desktop's icon layer gets the real click; the hook only watches and never swallows anything.
        private IntPtr OnMouse(int code, IntPtr wParam, IntPtr lParam)
        {
            if (code >= 0)
            {
                var m = (Native.MSLLHOOKSTRUCT)System.Runtime.InteropServices.Marshal.PtrToStructure(lParam, typeof(Native.MSLLHOOKSTRUCT));
                int msg = wParam.ToInt32();
                if (msg == Native.WM_LBUTTONDOWN)
                {
                    downAt = m.pt; downTime = m.time; pressed = true; moved = false;
                    // A panel floating over the desktop goes away as soon as a click lands outside it, the way
                    // a menu does. It never gets the deactivate event reliably, being topmost.
                    if (panelWindow != null && !panelWindow.IsDisposed)
                    {
                        var pt = m.pt;
                        MainThread(() => DismissPanel(pt));
                    }
                    hold.Stop(); hold.Start();
                }
                else if (msg == Native.WM_MOUSEMOVE)
                {
                    // Moving means it is a drag on the desktop (icon selection), not a hold.
                    if (pressed && (Math.Abs(m.pt.X - downAt.X) > 6 || Math.Abs(m.pt.Y - downAt.Y) > 6)) { moved = true; hold.Stop(); }
                }
                else if (msg == Native.WM_LBUTTONUP)
                {
                    pressed = false; hold.Stop();
                    if (m.time - downTime < 350 && Math.Abs(m.pt.X - downAt.X) < 6 && Math.Abs(m.pt.Y - downAt.Y) < 6)
                    {
                        var pt = m.pt;
                        bool twice = m.time - lastUpTime < 350 && Math.Abs(pt.X - lastUpAt.X) < 8 && Math.Abs(pt.Y - lastUpAt.Y) < 8;
                        lastUpTime = twice ? 0 : m.time; lastUpAt = pt;
                        if (twice) MainThread(() => DoubleTapAt(pt));
                        else MainThread(() => TapIfDesktop(pt));
                    }
                }
            }
            return Native.CallNextHookEx(hook, code, wParam, lParam);
        }

        // Esc while the desktop is in front leaves the immersive view on every screen. The pond pages never
        // hold the keyboard (the desktop does), so the key is repeated to them from here.
        private IntPtr OnKey(int code, IntPtr wParam, IntPtr lParam)
        {
            if (code >= 0)
            {
                var k = (Native.KBDLLHOOKSTRUCT)System.Runtime.InteropServices.Marshal.PtrToStructure(lParam, typeof(Native.KBDLLHOOKSTRUCT));
                int msg = wParam.ToInt32();
                if ((msg == Native.WM_KEYDOWN || msg == Native.WM_SYSKEYDOWN) && k.vkCode == Native.VK_ESCAPE)
                {
                    IntPtr fg = Native.GetForegroundWindow();
                    if (fg == IntPtr.Zero || IsShell(fg) || IsOurs(fg)) MainThread(() => Broadcast("{zen:false}"));
                }
            }
            return Native.CallNextHookEx(keyHook, code, wParam, lParam);
        }

        private static bool IsOurs(IntPtr hwnd)
        {
            Native.GetWindowThreadProcessId(hwnd, out uint pid);
            return pid == (uint)Process.GetCurrentProcess().Id;
        }

        /// <summary>One command to every pond on the desktop (the tray's own commands go to a single page).</summary>
        private void Broadcast(string options)
        {
            foreach (var w in walls)
            {
                var core = w.View?.CoreWebView2;
                if (core != null) _ = core.ExecuteScriptAsync($"window.pondControl&&pondControl.set({options})");
            }
        }

    private void TapIfDesktop(Native.POINT pt)
    {
        IntPtr under = Native.WindowFromPoint(pt);
        string underClass = Native.ClassOf(under);
        // A tap on the desktop's icon layer reaches the whole pond. One that landed through a see-through window
        // lying over it (a desktop clock, a date widget) reaches the card's controls only.
        bool desktop = IsDesktopLayer(under, underClass), overlay = !desktop && IsOverlay(under);
        if (!desktop && !overlay) return;
        var p = new Point(pt.X, pt.Y);
        walls.FirstOrDefault(w => w.ScreenBounds.Contains(p))?.Tap(p, !desktop);
    }

        // Held still on the desktop: scatter a handful of food.
        private void HoldTick(object sender, EventArgs e)
        {
            hold.Stop();
            if (!pressed || moved) return;
            var pt = downAt;
            MainThread(() => SendToDesktop(pt, (w, p) => w.Hold(p)));
        }

        private void DoubleTapAt(Native.POINT pt)
        {
            SendToDesktop(pt, (w, p) => w.DoubleTap(p));
        }

        private void SendToDesktop(Native.POINT pt, Action<WallpaperForm, Point> send)
        {
            if (!IsDesktopPoint(pt)) return;
            var p = new Point(pt.X, pt.Y);
            var wall = walls.FirstOrDefault(w => w.ScreenBounds.Contains(p));
            if (wall != null) send(wall, p);
        }

        // What is under the pointer when the desktop itself is in front. A drag or a right click never reaches
        // here on purpose: those belong to Explorer (icon selection, its context menu) and taking them would
        // break the desktop.
    private static bool IsDesktopPoint(Native.POINT pt)
    {
        IntPtr under = Native.WindowFromPoint(pt);
        return IsDesktopLayer(under, Native.ClassOf(under));
    }

    private static bool IsDesktopLayer(IntPtr under, string c)
    {
        return c == "SHELLDLL_DefView" || c == "WorkerW" || c == "Progman"
            || c == "SysListView32" && Native.ClassOf(Native.GetParent(under)) == "SHELLDLL_DefView";
    }

    /// <summary>True when <paramref name="under"/> (the window a tap landed on) is a see-through window drawn over
    /// the desktop: a desktop clock, a date widget, anything floated over the wallpaper. Such a window takes the
    /// click itself, so the tap is not one on the icon layer, yet the card's buttons are in plain sight beneath
    /// it and that is what was aimed at. Only a window made to overlay others counts — a layered window that is
    /// not one uniform, fully opaque sheet. A plain application window never does: it hides the card, and a tap
    /// on it belongs to it alone. Our own windows are left out too, or a click inside the open panel would land
    /// on the card it covers.</summary>
    private static bool IsOverlay(IntPtr under)
    {
        if (under == IntPtr.Zero) return false;
        IntPtr root = Native.GetAncestor(under, Native.GA_ROOT);
        if (root == IntPtr.Zero) root = under;
        if (IsOurs(root)) return false;
        for (IntPtr w = under; w != IntPtr.Zero; w = Native.GetParent(w))
        {
            long ex = Native.GetWindowLongPtr(w, Native.GWL_EXSTYLE).ToInt64();
            if ((ex & Native.WS_EX_LAYERED) != 0 && !FullyOpaque(w)) return true;
            if (w == root) break;
        }
        return false;
    }

    /// <summary>A layered window with one uniform alpha of 100% and no colour key hides everything under it.</summary>
    private static bool FullyOpaque(IntPtr w)
    {
        return Native.GetLayeredWindowAttributes(w, out uint key, out byte alpha, out uint flags)
            && (flags & Native.LWA_ALPHA) != 0 && (flags & Native.LWA_COLORKEY) == 0 && alpha == 255;
    }

        private void DismissPanel(Native.POINT pt)
        {
            if (panelWindow == null || panelWindow.IsDisposed || !panelWindow.IsOpen) return;
            var r = panelWindow.Bounds;
            if (pt.X < r.Left || pt.X >= r.Right || pt.Y < r.Top || pt.Y >= r.Bottom) panelWindow.Dismiss();
        }

        private void MainThread(Action a)
        {
            if (walls.Count > 0 && walls[0].IsHandleCreated) walls[0].BeginInvoke(a);
            else if (panelWindow != null && !panelWindow.IsDisposed && panelWindow.IsHandleCreated) panelWindow.BeginInvoke(a);
        }

        // Something went wrong: keep the details in %LOCALAPPDATA%\BichiPond\error.log and say where they are.
        private static void Report(string what, Exception ex)
        {
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BichiPond"), log = Path.Combine(dir, "error.log");
            try { Directory.CreateDirectory(dir); File.AppendAllText(log, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {what} (Windows {Environment.OSVersion.Version})\r\n{ex}\r\n\r\n"); } catch (Exception) { }
            MessageBox.Show($"{what}：{ex.Message}\n\n详细信息已记录在：\n{log}", "MoYu", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        /// <summary>Records something worth knowing without interrupting anyone: a lost WebView2 process is recovered on its
        /// own, so a dialog for it would be noise, but it still belongs in the log — a pond that silently stopped drawing once
        /// would otherwise leave nothing behind to diagnose.</summary>
        private static void Note(string what)
        {
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BichiPond"), log = Path.Combine(dir, "error.log");
            try { Directory.CreateDirectory(dir); File.AppendAllText(log, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {what} (Windows {Environment.OSVersion.Version})\r\n\r\n"); } catch (Exception) { }
        }

        // ---------- tray ----------
        private void BuildTray()
        {
            tray.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            tray.Text = "MoYu";
            var menu = new ContextMenuStrip();
            menu.Items.Add(new ToolStripMenuItem("MoYu") { Enabled = false });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("打开交互窗口", null, (s, e) => OpenWindow());
            // Four seasons first, then the weather that can be layered on top of each.
            var seasonMenu = new ToolStripMenuItem("四季");
            foreach (var (name, value) in new[] { ("春 · 春暖花开", "spring"), ("夏 · 绿荫盛夏", "summer"), ("秋 · 枫染清池", "autumn"), ("冬 · 白雪映池", "winter") })
                seasonMenu.DropDownItems.Add(new ToolStripMenuItem(name, null, (s, e) => { season = value; Command($"{{season:'{value}'}}"); }) { Tag = value });
            menu.Items.Add(seasonMenu);
            var weatherMenu = new ToolStripMenuItem("天气");
            foreach (var (name, value) in new[] { ("晴日", "sunny"), ("多云", "cloudy"), ("下雨", "rain"), ("落雪", "snow") })
                weatherMenu.DropDownItems.Add(new ToolStripMenuItem(name, null, (s, e) => { weather = value; Command($"{{weather:'{value}'}}"); }) { Tag = value });
            weatherMenu.DropDownItems.Add(new ToolStripSeparator());
            var nightItem = new ToolStripMenuItem("月下观鱼", null, (s, e) => { night = !night; Command(night ? "{night:true}" : "{night:false}"); });
            weatherMenu.DropDownItems.Add(nightItem);
            menu.Items.Add(weatherMenu);
            var pause = new ToolStripMenuItem("暂停壁纸动画", null, (s, e) => { userPaused = !userPaused; UpdateVisibility(); });
            menu.Items.Add(pause);
            // The wallpaper pages have no controls of their own, so sound is switched from here (or the window's bottom bar).
            soundItem = new ToolStripMenuItem("声音", null, (s, e) => { soundOn = !soundOn; Command(soundOn ? "{soundOn:true}" : "{soundOn:false}"); });
            menu.Items.Add(soundItem);
            menu.Items.Add("重载桌面壁纸", null, (s, e) => Rebuild(0));
            var startup = new ToolStripMenuItem("开机时启动", null, (s, e) => SetStartup(!IsStartup()));
            menu.Items.Add(startup);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("退出 MoYu", null, (s, e) => Quit());
            menu.Opening += (s, e) =>
            {
                foreach (ToolStripItem i in seasonMenu.DropDownItems) if (i is ToolStripMenuItem mi && mi.Tag is string v) mi.Checked = v == season;
                foreach (ToolStripItem i in weatherMenu.DropDownItems) if (i is ToolStripMenuItem mi && mi.Tag is string v) mi.Checked = v == weather;
                nightItem.Checked = night; pause.Checked = userPaused; startup.Checked = IsStartup(); soundItem.Checked = soundOn;
            };
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += (s, e) => OpenWindow();
            tray.Visible = true;
        }

        /// <summary>One panel in its own small window, floating above the desktop icons — what the wallpaper's
        /// card opens. The window is prepared in the background (see <see cref="PrewarmPanel"/>), so opening a
        /// panel only moves it into place and tells the page which one to show.</summary>
        private async void ShowPanel(string panel)
        {
            if (quitting || env == null) return;
            var form = panelWindow;
            if (form == null || form.IsDisposed)
            {
                // Never Close() a disposed form: the window is gone already, so only the stale field is cleared.
                if (panelWindow == form) panelWindow = null;
                form = NewPanelWindow();
            }
            // A first tap can arrive while the background prewarm is still loading: wait for that same load.
            try { await form.EnsurePrepared(env, PanelSaved); }
            catch (Exception ex) { if (!quitting) Note("panel prepare failed: " + ex.Message); return; }
            if (quitting || form.IsDisposed) return;
            try { await form.Open(panel); }
            catch (Exception ex) { Note("panel open failed: " + ex.Message); }
        }

        // Panel pages save the pond like any other; closing one asks for the window to go away.
        private void PanelSaved(WebView2 view, string json)
        {
            if (json == "panel-close") { panelWindow?.Dismiss(); return; }
            if (json == "panel-expand") { panelWindow?.ToggleSize(); return; }
            // "point this koi out": close the panel and let every pond ripple around her for a few seconds.
            if (json.StartsWith("panel-find:"))
            {
                panelWindow?.Dismiss();
                Broadcast("{\"find\":\"" + json.Substring("panel-find:".Length) + "\"}");
                return;
            }
            OnSave(view, json);
        }

        private PanelForm NewPanelWindow()
        {
            var form = new PanelForm();
            panelWindow = form;
            form.FormClosed += (s, e) => { if (panelWindow == form) panelWindow = null; };
            return form;
        }

        /// <summary>Builds the panel window and loads its page while nothing is on screen, then leaves it
        /// hidden. The first tap on the card then opens instantly instead of waiting for a page to load.</summary>
        private async void PrewarmPanel()
        {
            if (quitting || env == null || panelWindow != null) return;
            try { await Task.Delay(200, lifetime.Token); }
            catch (OperationCanceledException) { return; }
            if (quitting || panelWindow != null) return;
            var form = NewPanelWindow();
            try { await form.EnsurePrepared(env, PanelSaved); }
            catch (Exception ex)
            {
                if (!quitting) Note("panel prewarm failed: " + ex.Message);
                if (panelWindow == form) panelWindow = null;
                form.Dispose();
            }
        }

        public async void OpenWindow(string panel = null)
        {
            if (quitting || env == null) return;
            if (window != null && !window.IsDisposed)
            {
                window.WindowState = window.WindowState == FormWindowState.Minimized ? FormWindowState.Normal : window.WindowState;
                window.Activate();
                var core = window.View?.CoreWebView2;
                if (panel != null)
                    if (core != null) _ = core.ExecuteScriptAsync($"openPanel('{panel}')");
                return;
            }
            window = new InteractiveForm();
            window.FormClosed += (s, e) => { window = null; };
            opening = true;
            try { await window.Start(env, OnSave, panel, OnProcessFailed); }
            finally { opening = false; }
        }

        private static bool IsStartup()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(RunKey)) return key?.GetValue(RunName) != null;
        }

        private static void SetStartup(bool on)
        {
            using (var key = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (on) key.SetValue(RunName, $"\"{Application.ExecutablePath}\"");
                else key.DeleteValue(RunName, false);
            }
        }

        private void Quit()
        {
            if (quitting) return;
            quitting = true;
            rebuildPending = false;
            lifetime.Cancel();
            watch.Stop();
            hold.Stop();
            if (buildingWall != null) { try { buildingWall.Close(); buildingWall.Dispose(); } catch (Exception) { } }
            if (hook != IntPtr.Zero) Native.UnhookWindowsHookEx(hook);
            if (keyHook != IntPtr.Zero) Native.UnhookWindowsHookEx(keyHook);
            tray.Visible = false;
            panelWindow?.Close();
            window?.Close();
            foreach (var w in walls) { try { w.Close(); } catch (Exception) { } }
            Desktop.Refresh();
            shell.DestroyHandle();
            ExitThread();
        }
    }

    /// <summary>A hidden window that hears Explorer restarting (TaskbarCreated), after which the desktop layers are new.</summary>
    internal sealed class ShellWatcher : NativeWindow
    {
        private readonly uint taskbarCreated = Native.RegisterWindowMessage("TaskbarCreated");
        private readonly Action onRestart;
        public ShellWatcher(Action onRestart) { this.onRestart = onRestart; CreateHandle(new CreateParams()); }
        protected override void WndProc(ref Message m)
        {
            if (taskbarCreated != 0 && (uint)m.Msg == taskbarCreated) onRestart();
            base.WndProc(ref m);
        }
    }
}
