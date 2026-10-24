// 碧池观鱼 · the small window above the desktop icons that shows one panel (我的锦鲤 / 天气 / 设置).
// The wallpaper itself lives behind the icons, so a panel opened there would be covered by them; this window
// floats on top instead, takes the keyboard while it is open, and closes as soon as it loses focus.
//
// The window and its WebView2 are built once, in the background, and then reused: opening a panel only moves
// the window and tells the page which panel to show, so it appears at once instead of loading a page first.
using System;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace BichiPond
{
    internal sealed class PanelForm : Form
    {
        private const int Wide = 620;
        private const int Tall = 790;
        // The size button switches the window between these two.
        private const int WideBig = 900;
        private const int TallBig = 1010;
        private bool wide;
        private const int CornerPreference = 33; // DWMWA_WINDOW_CORNER_PREFERENCE
        private const int CornerRound = 2;       // DWMWCP_ROUND

        private readonly Timer arm = new Timer { Interval = 400 };

        private static readonly Rectangle Parked = new Rectangle(-40000, -40000, 1200, 900);

        public WebView2 View { get; private set; }
        /// <summary>True once the page inside is loaded and can be told to show a panel.</summary>
        public bool Prepared { get; private set; }
        /// <summary>True while a panel is showing on screen (as opposed to parked off-screen).</summary>
        public bool IsOpen { get; private set; }

        public PanelForm()
        {
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            BackColor = PondPage.Paper;
            TopMost = true;
            KeyPreview = true;
            AutoScaleMode = AutoScaleMode.None;
            arm.Tick += (s, e) => { arm.Stop(); };
            // Off-screen until the first panel is opened; the window is never shown during preparation.
            Bounds = new Rectangle(-40000, -40000, 1200, 900);
        }

        /// <summary>The window must never take the focus by simply being shown; opening a panel asks for it
        /// explicitly, so a parked window stays out of the way.</summary>
        protected override bool ShowWithoutActivation => true;

        private Task preparing;

        /// <summary>Builds the window's page once, even when asked twice — the background prewarm and a first
        /// tap can race, and both must wait for the same load instead of starting another one.</summary>
        public Task EnsurePrepared(CoreWebView2Environment env, Action<WebView2, string> onSave)
        {
            if (Prepared) return Task.CompletedTask;
            return preparing ?? (preparing = PrepareCore(env, onSave));
        }

        /// <summary>Parked off-screen but visible: a hidden WebView2 stops painting, and showing it again
        /// would flash an empty window. The page is waited for, so the first panel appears filled in.</summary>
        private async Task PrepareCore(CoreWebView2Environment env, Action<WebView2, string> onSave)
        {
            Bounds = Parked;
            Show();
            int round = CornerRound;
            Native.DwmSetWindowAttribute(Handle, CornerPreference, ref round, sizeof(int));
            View = await PondPage.Create(this, env, "panel", onSave, null, null, false, true);
            Prepared = true;
        }

        /// <summary>Moves the window to the screen with the pointer and shows the asked-for panel.</summary>
        public async Task Open(string panel)
        {
            var area = Screen.FromPoint(Cursor.Position).WorkingArea;
            double k = DeviceDpi / 96.0;
            int width = Math.Min((int)Math.Round((wide ? WideBig : Wide) * k), area.Width - 40);
            int height = Math.Min((int)Math.Round((wide ? TallBig : Tall) * k), area.Height - 40);
            var target = new Rectangle(area.Left + (area.Width - width) / 2, area.Top + (area.Height - height) / 2, width, height);

            // Draw the panel first, while the window is still parked off-screen, and only then move it into
            // view: otherwise the first frame the person sees is an empty sheet of paper.
            if (View?.CoreWebView2 != null)
            {
                try
                {
                    await View.CoreWebView2.ExecuteScriptAsync($"openPanel('{panel}')");
                    await View.CoreWebView2.ExecuteScriptAsync("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(1))))");
                }
                catch (Exception) { }
            }

            Bounds = target;
            IsOpen = true;
            if (!Visible) Show();
            Native.SetForegroundWindow(Handle);
            arm.Stop();
            arm.Start();
        }

        /// <summary>Grow or shrink the window, kept on the same screen; the next open remembers the choice.</summary>
        public void ToggleSize()
        {
            wide = !wide;
            if (!IsOpen) return;
            var area = Screen.FromPoint(Cursor.Position).WorkingArea;
            double k = DeviceDpi / 96.0;
            int w = Math.Min((int)Math.Round((wide ? WideBig : Wide) * k), area.Width - 40);
            int h = Math.Min((int)Math.Round((wide ? TallBig : Tall) * k), area.Height - 40);
            Bounds = new Rectangle(area.Left + (area.Width - w) / 2, area.Top + (area.Height - h) / 2, w, h);
        }

        /// <summary>Puts the panel away but keeps the window and its page ready for the next time.</summary>
        public void Dismiss()
        {
            if (!IsOpen) return;
            IsOpen = false;
            arm.Stop();
            try { View?.CoreWebView2?.ExecuteScriptAsync("(()=>{const d=document.querySelector('#panel');if(d&&d.open)d.close();})()"); }
            catch (Exception) { }
            Bounds = Parked; // parked, not hidden: the page keeps painting, so the next open is instant
        }

        // Clicking anywhere else — the desktop, an icon, another window — puts the panel away, like a menu.
        protected override void OnDeactivate(EventArgs e)
        {
            base.OnDeactivate(e);
            if (IsOpen && !arm.Enabled) Dismiss();
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            if (keyData == Keys.Escape) { Dismiss(); return true; }
            return base.ProcessCmdKey(ref msg, keyData);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) arm.Dispose();
            base.Dispose(disposing);
        }
    }
}
