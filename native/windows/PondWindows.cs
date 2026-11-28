// MoYu · the windows that show the pond: one wallpaper per screen (inside the desktop, no controls) and the
// interactive window with all of the pond's controls. Both are the same web page in WebView2, served from the web\
// folder beside the exe under https://pond.local, so storage, weather lookups and WebGL work as in a browser.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace BichiPond
{
    internal static class PondPage
    {
        public const string Host = "pond.local";
        public static readonly Color Backdrop = Color.FromArgb(0x74, 0x8d, 0x79);
        /// <summary>The panels' paper — also the background of a panel's own small window.</summary>
        public static readonly Color Paper = Color.FromArgb(0xf6, 0xf4, 0xea);
        public static string WebFolder => Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web");

        /// <summary>A WebView2 showing the pond; <paramref name="mode"/> "wallpaper" hides the page's controls and
        /// "corner" keeps its corner card on the desktop. <paramref name="panel"/> opens that panel directly (the
        /// interactive window, reached from the wallpaper's card). <paramref name="safe"/> is the screen's work-area
        /// inset as top/right/bottom/left in CSS px, keeping the card clear of a taskbar docked at a side.</summary>
        public static async Task<WebView2> Create(Control parent, CoreWebView2Environment env, string mode, Action<WebView2, string> onSave, string panel = null, int[] safe = null, bool waitForPanel = false, bool waitForLoad = false, Action<WebView2, CoreWebView2ProcessFailedKind> onProcessFailed = null, Func<WebView2, Task> beforeNavigate = null)
        {
            var view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = mode == "panel" ? Paper : Backdrop };
            parent.Controls.Add(view);
            await view.EnsureCoreWebView2Async(env);
            if (parent.IsDisposed || parent.Disposing || view.IsDisposed) throw new OperationCanceledException();
            var core = view.CoreWebView2;
            core.SetVirtualHostNameToFolderMapping(Host, WebFolder, CoreWebView2HostResourceAccessKind.Allow);
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = mode == null;
            core.Settings.AreDevToolsEnabled = true; // F12 in the interactive window, for checking a machine
            // The pond hands every save to the host, which passes it on to the other pages.
            core.WebMessageReceived += (s, e) => { string json = null; try { json = e.TryGetWebMessageAsString(); } catch (ArgumentException) { } if (json != null) onSave(view, json); };
            // Links out of the pond (the weather service credit) open in the default browser.
            core.NewWindowRequested += (s, e) => { e.Handled = true; OpenInBrowser(e.Uri); };
            core.NavigationStarting += (s, e) =>
            {
                if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) || uri.Host == Host) return;
                e.Cancel = true; OpenInBrowser(e.Uri);
            };
            // If the page's renderer dies (GPU reset, low memory), load the pond again rather than leave a blank desktop.
            // A browser process killed from outside (an Edge-family installer stops every msedgewebview2 to replace the
            // runtime) cannot be reloaded at all — it needs a fresh view, which the host rebuilds (see PondApp.OnProcessFailed).
            core.ProcessFailed += (s, e) =>
            {
                if (onProcessFailed != null) onProcessFailed(view, e.ProcessFailedKind);
                else try { core.Reload(); } catch (Exception) { }
            };
            if (safe != null)
            {
                // The card clears a taskbar docked at the top or a side through the page's safe-area variables.
                // The script runs before the document element exists, so it waits for the DOM to be ready.
                var inset = new System.Text.StringBuilder("(function(){function s(){try{var d=document.documentElement.style;");
                string[] side = { "top", "right", "bottom", "left" };
                for (int i = 0; i < side.Length; i++)
                    if (safe[i] > 0) inset.Append("d.setProperty('--safe-").Append(side[i]).Append("','").Append(safe[i]).Append("px');");
                inset.Append("}catch(e){}}if(document.documentElement)s();else document.addEventListener('DOMContentLoaded',s);})();");
                await core.AddScriptToExecuteOnDocumentCreatedAsync(inset.ToString());
            }
            string query = mode == null ? "" : "?mode=" + mode;
            if (panel != null) query += (query.Length == 0 ? "?" : "&") + "panel=" + panel;
            TaskCompletionSource<bool> loaded = null;
            if (waitForLoad)
            {
                loaded = new TaskCompletionSource<bool>();
                core.NavigationCompleted += (s, e) => loaded.TrySetResult(e.IsSuccess);
            }
            // 生命周期订阅和初始文档脚本必须先于第一次导航，不能等 Create 返回才安装。
            if (beforeNavigate != null) await beforeNavigate(view);
            if (parent.IsDisposed || parent.Disposing || view.IsDisposed) throw new OperationCanceledException();
            core.Navigate($"https://{Host}/index.html" + query);
            if (loaded != null) await Task.WhenAny(loaded.Task, Task.Delay(8000));
            if (waitForPanel)
            {
                // The page opens its panel a frame after loading; wait for that, so a window shown afterwards is
                // already filled in and nothing flashes while it loads.
                for (int i = 0; i < 75; i++)
                {
                    try
                    {
                        string open = await core.ExecuteScriptAsync("(()=>{const d=document.querySelector('#panel');return d&&d.open?'1':'0';})()");
                        if (open == "\"1\"") break;
                    }
                    catch (Exception) { }
                    await Task.Delay(40);
                }
                await Task.Delay(80);
            }
            return view;
        }

        public static void OpenInBrowser(string url)
        {
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch (Exception) { }
        }

        /// <summary>A JavaScript string literal for any text (JSON saves included).</summary>
        public static string JsString(string s)
        {
            var sb = new System.Text.StringBuilder(s.Length + 16).Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\u2028': sb.Append("\\u2028"); break;
                    case '\u2029': sb.Append("\\u2029"); break;
                    default: if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4")); else sb.Append(c); break;
                }
            }
            return sb.Append('"').ToString();
        }
    }

    /// <summary>The pond as one screen's wallpaper, living in the desktop behind the icons.</summary>
    internal sealed class WallpaperForm : Form
    {
        public string DeviceName { get; }
        public Rectangle ScreenBounds { get; }
        public Rectangle WorkArea { get; }
        public WebView2 View { get; private set; }
        public bool Hidden { get; private set; }

        public WallpaperForm(string deviceName, Rectangle screen, Rectangle workArea)
        {
            DeviceName = deviceName;
            ScreenBounds = screen;
            WorkArea = workArea;
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            Bounds = screen;
            BackColor = PondPage.Backdrop;
            AutoScaleMode = AutoScaleMode.None; // sizes are the screen's real pixels, never rescaled
            Text = "MoYu Wallpaper";
        }

        /// <summary>宿主期望的暂停状态，独立于当前文档是否已经确认应用。</summary>
        public bool DesiredPaused { get; private set; } = true;
        public bool? Paused { get; private set; }
        private bool pauseLifecycleInstalled, pauseSending, pauseSyncPending, navigationReady;
        private long navigationGeneration;
        private ulong navigationId;
        private bool? documentScriptPaused;
        private string pauseDocumentScriptId, documentTokenJson;

        private const string PauseDocumentScript = @"(()=>{
            if(window.top!==window)return;
            window.__pondDesiredPaused=DESIRED_PAUSED;
            window.__pondHostDocument=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
            window.addEventListener('pond-ready',()=>{
                window.chrome.webview.postMessage({pondLifecycle:'ready'});
            });
        })();";

        private async Task InstallPauseLifecycle(WebView2 view)
        {
            View = view;
            var core = view.CoreWebView2;
            core.NavigationStarting += (s, e) =>
            {
                // 外部链接已由 PondPage 取消，不应让仍在显示的文档失去确认状态。
                if (e.Cancel || !Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) || uri.Host != PondPage.Host) return;
                navigationId = e.NavigationId;
                navigationGeneration++;
                navigationReady = false;
                Paused = null;
                documentTokenJson = null;
                RequestPauseSync();
            };
            core.NavigationCompleted += (s, e) =>
            {
                if (e.NavigationId != navigationId) return;
                navigationReady = e.IsSuccess;
                if (navigationReady) RequestPauseSync();
            };
            core.WebMessageReceived += (s, e) =>
            {
                // 对象消息不会走存档字符串通道；ready 只唤醒同步，脚本仍检查当前文档。
                if (e.WebMessageAsJson == "{\"pondLifecycle\":\"ready\"}") RequestPauseSync();
            };
            await UpdatePauseDocumentScript(core, DesiredPaused);
            pauseLifecycleInstalled = true;
        }

        private async Task UpdatePauseDocumentScript(CoreWebView2 core, bool paused)
        {
            string id = await core.AddScriptToExecuteOnDocumentCreatedAsync(PauseDocumentScript.Replace("DESIRED_PAUSED", paused ? "true" : "false"));
            // 先安装新脚本再删除旧脚本，失败时保留至少一份；此注册属于宿主而非某次导航。
            if (pauseDocumentScriptId != null) core.RemoveScriptToExecuteOnDocumentCreated(pauseDocumentScriptId);
            pauseDocumentScriptId = id;
            documentScriptPaused = paused;
        }

        public void SetPaused(bool paused)
        {
            DesiredPaused = paused;
            RequestPauseSync();
        }

        private void RequestPauseSync()
        {
            if (!pauseLifecycleInstalled || IsDisposed || Disposing) return;
            pauseSyncPending = true;
            if (!pauseSending) _ = SynchronizePause();
        }

        private bool IsCurrentDocument(long generation)
        {
            return !IsDisposed && !Disposing && navigationReady && generation == navigationGeneration;
        }

        private async Task SynchronizePause()
        {
            pauseSending = true;
            try
            {
                do
                {
                    pauseSyncPending = false;
                    if (IsDisposed || Disposing || View?.CoreWebView2 == null) return;
                    var core = View.CoreWebView2;
                    bool paused = DesiredPaused;
                    if (documentScriptPaused != paused) await UpdatePauseDocumentScript(core, paused);
                    long generation = navigationGeneration;
                    if (!IsCurrentDocument(generation) || Paused == paused) continue;
                    if (documentTokenJson == null)
                    {
                        string token = await core.ExecuteScriptAsync("window.__pondHostDocument||null");
                        if (!IsCurrentDocument(generation)) continue;
                        if (token == null || !token.StartsWith("\"")) continue;
                        documentTokenJson = token;
                    }
                    // 文档身份防止旧 ExecuteScript 请求落到重载后的新文档；只有 pause 真正执行才确认。
                    string script = "(()=>{if(window.__pondHostDocument!==" + documentTokenJson + ")return false;" +
                        "window.__pondDesiredPaused=" + (paused ? "true" : "false") + ";" +
                        "if(window.__pondReady!==true||!window.pondControl||typeof window.pondControl.pause!=='function')return false;" +
                        "window.pondControl.pause(window.__pondDesiredPaused);return true;})()";
                    string applied = await core.ExecuteScriptAsync(script);
                    if (IsCurrentDocument(generation) && applied == "true") Paused = paused;
                    else
                    {
                        // A null/异常 answer does not confirm the state and must not spin: leave it to the
                        // next watch (or the next ready/navigation event) instead of retrying in this loop.
                        pauseSyncPending = false;
                        break;
                    }
                }
                while (pauseSyncPending && !IsDisposed && !Disposing);
            }
            catch (Exception)
            {
                // 不在错误响应后自旋：保留期望状态，由下一次 watch / ready / 导航事件触发重试。
                pauseSyncPending = false;
            }
            finally { pauseSending = false; }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                pauseLifecycleInstalled = false;
                navigationGeneration++;
                navigationReady = false;
                pauseSyncPending = false;
                Paused = null;
            }
            base.Dispose(disposing);
        }

        // Never take focus from whatever the person is using.
        protected override bool ShowWithoutActivation => true;

        public async Task Start(CoreWebView2Environment env, Action<WebView2, string> onSave, Action<WebView2, CoreWebView2ProcessFailedKind> onProcessFailed = null)
        {
            CreateHandle();
            // Once inside the desktop the window's position is relative to its new parent; keep WinForms in agreement.
            Bounds = Desktop.Attach(Handle, ScreenBounds);
            Show();
            // The pond keeps its corner card (clock, weather, dock) on the desktop; the screen's work-area
            // inset, in CSS px, keeps the card clear of a taskbar docked at the top or a side.
            double k = Native.ScaleOf(Handle);
            var bounds = ScreenBounds;
            var work = WorkArea;
            int[] safe =
            {
                Math.Max(0, (int)Math.Round((work.Top - bounds.Top) / k)),
                Math.Max(0, (int)Math.Round((bounds.Right - work.Right) / k)),
                Math.Max(0, (int)Math.Round((bounds.Bottom - work.Bottom) / k)),
                Math.Max(0, (int)Math.Round((work.Left - bounds.Left) / k)),
            };
            View = await PondPage.Create(this, env, "corner", onSave, null, safe, onProcessFailed: onProcessFailed, beforeNavigate: InstallPauseLifecycle);
        }

        /// <summary>Notes that nobody can see this screen for now. The view is deliberately left visible: hiding
        /// a WebView2 makes Windows paint whatever is behind it, so coming back would flash the plain desktop
        /// before the pond. Drawing is stopped by pausing the page instead (see <see cref="PondApp"/>).</summary>
        public void SetHidden(bool hidden)
        {
            Hidden = hidden;
        }

        /// <summary>A tap at a screen point (device px) on this screen's desktop. The point goes to the page
        /// unconverted: the page knows its own pixel ratio, while this window's DPI reading is unreliable
        /// once the window has been parented into the desktop. <paramref name="controlsOnly"/> is a tap that
        /// landed through a window lying over the card: the page offers it to the card's controls and nothing else.</summary>
        public void Tap(Point screenPoint, bool controlsOnly = false)
        {
            Send("pondTapDevice", screenPoint, controlsOnly);
        }

        /// <summary>Held still: scatter a handful of food (or stir a big ring, in watching mode).</summary>
        public void Hold(Point screenPoint) => Send("pondHoldDevice", screenPoint);

        /// <summary>Two quick taps: frighten the koi away.</summary>
        public void DoubleTap(Point screenPoint) => Send("pondDoubleTapDevice", screenPoint);

        private void Send(string method, Point screenPoint, bool controlsOnly = false)
        {
            if (View?.CoreWebView2 == null) return;
            double x = screenPoint.X - ScreenBounds.Left, y = screenPoint.Y - ScreenBounds.Top;
            string only = controlsOnly ? ",true" : "";
            _ = View.CoreWebView2.ExecuteScriptAsync(FormattableString.Invariant($"window.{method}&&{method}({x:0.#},{y:0.#}){only}"));
        }
    }

    /// <summary>The pond with all its controls: feeding, naming koi, weather, sound and settings.</summary>
    internal sealed class InteractiveForm : Form
    {
        public WebView2 View { get; private set; }

        public InteractiveForm()
        {
            Text = "MoYu";
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            BackColor = PondPage.Backdrop;
            StartPosition = FormStartPosition.CenterScreen;
            AutoScaleMode = AutoScaleMode.None;
            ClientSize = new Size(LogicalToDeviceUnits(1180), LogicalToDeviceUnits(760));
            MinimumSize = new Size(LogicalToDeviceUnits(440), LogicalToDeviceUnits(600));
        }

        public async Task Start(CoreWebView2Environment env, Action<WebView2, string> onSave, string panel = null, Action<WebView2, CoreWebView2ProcessFailedKind> onProcessFailed = null)
        {
            Show();
            View = await PondPage.Create(this, env, null, onSave, panel, onProcessFailed: onProcessFailed);
        }
    }
}
