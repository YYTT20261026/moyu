# 摸鱼 v1.2.6

## 新增
- **8K 底图**：四季底图换成 7680×4320 高清原画（手机端打包 2560×1440），岸线、石头、荷叶、漂浮花叶与鱼食全部仍按 2560×1440 标注尺度映射，换任何分辨率的底图都不会移位。
- **底图按需加载**：8K 内嵌数据只供 `file:` 页面（双击打开、Android、macOS、Wallpaper Engine）使用，Windows 版与网站直接读取 PNG，启动更快。

## 调整
- Windows 安装包 265 MB → 134 MB，便携版同步缩小。
- Android APK 260 MB → 36 MB：手机改用 2560×1440 底图（多数手机纹理上限为 4096，8K 也会被降采样）。
- 设备纹理上限不足时渲染器自动缩小上传，采样保持归一化，画面与元素位置不变。
- Android 壁纸状态更易诊断：WebView 的控制台错误与资源大小会写进 logcat，「设置 › 手机动态壁纸」也会显示「底图 xxMB · 静图 xxKB」。
- Windows、macOS 与 Web 共用「自动适配 / 双屏独立 / 竖屏适配」显示布局设置；macOS 继续使用四季 8K 原图级底图。
- 四季天气画面整体降低饱和度，使池塘色彩更柔和。

## 修复
- 修复切换底图后荷叶与锦鲤跑到鱼塘之外（坐标此前绑定底图像素分辨率）。
- 修复 Android 打包后一片空白：Windows 上 `aapt2` 写出反斜杠路径导致页面与资源找不到；以及 8K 内嵌脚本与位图让手机 WebView 内存溢出。
- 修复静态兜底画面在 8K 底图上解码失败（现按屏幕尺寸降采样）。
- 合并上游修复：WebView2 进程被外部结束（如卸载 Copilot 时停掉所有 `msedgewebview2`）后自动重建壁纸并记录日志。

## 下载（Release 附件，ASCII 命名）
- Windows：`MoYu-1.2.6-Windows-Setup.exe`（安装器） / `MoYu-1.2.6-Windows.zip`（便携版）
- Android：`MoYu-1.2.6-Android.apk`
- macOS：`MoYu-1.2.6-macOS-arm64-8K.dmg`（Apple Silicon，8K 原图级底图）
- Web：`MoYu-1.2.6-Web.zip`（在线部署直接使用 8K PNG；本地双击打开时使用包内 2560×1440 的内嵌底图，169MB 的 8K 内嵌版未打包进去）

> 版本号：Windows / macOS 1.2.6，Android 1.2.6（versionCode 6）。
> Android 若装过不同签名的旧版，需要先卸载再安装；安装器未签名，Windows 首次运行会有 SmartScreen 提示。
