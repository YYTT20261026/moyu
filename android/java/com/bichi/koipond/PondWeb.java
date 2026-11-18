// 碧池观鱼 · the pond page in a WebView, shared by the app window and the live wallpaper.
// Every pond page in the process is registered here: when one saves, the save is handed to the others,
// so a koi named in the app is named on the home screen a moment later.
package com.bichi.koipond;

import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

final class PondWeb {
    static final String INDEX = "file:///android_asset/index.html";
    static final String TAG = "BichiPond";
    // The pond's own backdrop colour, shown instead of a white flash while the page loads.
    static final int POND = Color.rgb(0x74, 0x8d, 0x79);
    private static final List<WebView> LIVE = new ArrayList<>();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private PondWeb() { }

    /** A WebView showing the pond. mode "wallpaper" hides the page's controls and runs it at a battery-friendly pace. */
    static WebView create(Context context, String mode, WebViewClient client) {
        WebView web = new WebView(context);
        web.setBackgroundColor(POND);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setTextZoom(100); // the layout is designed in px; a large system font size would break the dock
        logAssets(context);
        // A page that cannot start the pond leaves no visible trace on a home screen, so keep its console and
        // script errors in logcat: adb logcat -s BichiPond shows exactly what the page reported.
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                Log.i(TAG, "console " + m.messageLevel() + ": " + m.message() + " @ " + m.sourceId() + ":" + m.lineNumber());
                return true;
            }
        });
        web.setWebViewClient(client);
        web.addJavascriptInterface(new Host(context.getApplicationContext(), web), "PondHost");
        web.loadUrl(mode == null ? INDEX : INDEX + "?mode=" + mode);
        LIVE.add(web);
        return web;
    }

    static void destroy(WebView web) {
        if (web == null) return;
        LIVE.remove(web);
        web.destroy();
    }

    // The pond is asset-driven, so log what actually shipped: a stale APK (the 169 MB 8K bed still inside) or
    // a missing mobile bed then shows up in `adb logcat -s BichiPond` instead of a blank home screen.
    private static void logAssets(Context context) {
        for (String name : new String[]{"assets/pond-bed.js", "assets/pond-data.js", PondWallpaperService.STILL}) {
            long size = assetSize(context, name);
            if (size < 0) Log.w(TAG, "asset missing: " + name);
            else Log.i(TAG, "asset " + name + " " + size + " bytes");
        }
        Log.i(TAG, "assets: " + assetSummary(context));
    }

    private static long assetSize(Context context, String name) {
        try (java.io.InputStream in = context.getAssets().open(name)) { return in.available(); }
        catch (Exception e) { return -1; }
    }

    /** Shown in the app's settings next to the wallpaper status, so a wrong or stale APK is obvious. */
    static String assetSummary(Context context) {
        long bed = assetSize(context, "assets/pond-bed.js"), still = assetSize(context, PondWallpaperService.STILL);
        return "底图 " + (bed < 0 ? "缺失" : bed / 1024 / 1024 + "MB") + " · 静图 " + (still < 0 ? "缺失" : still / 1024 + "KB");
    }

    static boolean isOurWallpaper(Context context) {
        android.app.WallpaperInfo info = WallpaperManager.getInstance(context).getWallpaperInfo();
        return info != null && context.getPackageName().equals(info.getPackageName());
    }

    /** Opens the system preview for the pond wallpaper, where one tap sets it (falls back to the wallpaper chooser). */
    static void openWallpaperPicker(Context context) {
        Intent pick = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER)
                .putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, new ComponentName(context, PondWallpaperService.class))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { context.startActivity(pick); return; } catch (Exception ignored) { }
        try { context.startActivity(new Intent(WallpaperManager.ACTION_LIVE_WALLPAPER_CHOOSER).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return; } catch (Exception ignored) { }
        Toast.makeText(context, "请在系统「壁纸」设置中选择动态壁纸「摸鱼」", Toast.LENGTH_LONG).show();
    }

    /** window.PondHost in the page. Calls arrive on a WebView thread; everything is done on the main thread. */
    static final class Host {
        private final Context context;
        private final WebView owner;

        Host(Context context, WebView owner) { this.context = context; this.owner = owner; }

        @JavascriptInterface
        public void postMessage(String json) {
            final String call = "window.__pondSync&&__pondSync(" + JSONObject.quote(json) + ")";
            MAIN.post(() -> { for (WebView other : new ArrayList<>(LIVE)) if (other != owner) other.evaluateJavascript(call, null); });
        }

        @JavascriptInterface
        public boolean isWallpaperActive() { return isOurWallpaper(context); }

        /** What the live wallpaper last reported (running, or why it shows the still painting). */
        @JavascriptInterface
        public String wallpaperStatus() { return context.getSharedPreferences("pond", Context.MODE_PRIVATE).getString("wallpaperStatus", ""); }

        @JavascriptInterface
        public void setWallpaper() { MAIN.post(() -> openWallpaperPicker(context)); }
    }
}
