using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace MoYu.Installer;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        if (Array.Exists(args, a => string.Equals(a, "/uninstall", StringComparison.OrdinalIgnoreCase)))
        {
            Application.Run(new InstallerForm(InstallerMode.Uninstall));
            return;
        }
        if (!CanWriteToDisk())
        {
            MessageBox.Show(
                "这个位置限制了程序写入磁盘，安装无法进行。\n\n请把安装包复制到桌面或「下载」文件夹，再双击运行；\n装好之后可以再把它删掉。",
                "MoYu", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        Application.Run(new InstallerForm(InstallerMode.Install));
    }

    // Some folders — a sandboxed workspace, or one watched by security software — let a program start but
    // refuse every write. Checking once up front explains that, instead of failing halfway through a copy.
    private static bool CanWriteToDisk()
    {
        try
        {
            string probe = Path.Combine(Path.GetTempPath(), "moyu-probe-" + Guid.NewGuid().ToString("N") + ".tmp");
            File.WriteAllText(probe, "ok");
            File.Delete(probe);
            return true;
        }
        catch
        {
            return false;
        }
    }
}

internal enum InstallerMode
{
    Install,
    Uninstall
}

internal sealed class InstallerForm : Form
{
    private const string AppName = "MoYu";
    private const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\MoYu";
    // Releases up to 1.2.7 called the app 摸鱼. An upgrade has to take that copy, its shortcuts and its
    // uninstall entry away (and carry 「开机时启动」 over), or the machine ends up with two ponds.
    private const string LegacyAppName = "摸鱼";
    private const string LegacyUninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\摸鱼";
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run", RunName = "BichiKoiPond";

    private readonly InstallerMode mode;
    private readonly TextBox pathBox = new();
    private readonly Button browseButton = new();
    private readonly Button actionButton = new();
    private readonly CheckBox launchCheckBox = new();
    private readonly ProgressBar progress = new();
    private readonly Label statusLabel = new();

    public InstallerForm(InstallerMode mode)
    {
        this.mode = mode;
        Text = mode == InstallerMode.Uninstall ? "MoYu - 卸载" : "MoYu - 安装";
        StartPosition = FormStartPosition.CenterScreen;
        Width = 560;
        Height = 250;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        MinimizeBox = false;
        using Stream iconStream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("MoYu.Installer.AppIcon.ico");
        if (iconStream != null) Icon = new System.Drawing.Icon(iconStream);

        Controls.Add(pathBox);
        Controls.Add(browseButton);
        Controls.Add(actionButton);
        Controls.Add(launchCheckBox);
        Controls.Add(progress);
        Controls.Add(statusLabel);

        pathBox.Location = new System.Drawing.Point(20, 30);
        pathBox.Size = new System.Drawing.Size(390, 24);
        pathBox.Text = mode == InstallerMode.Uninstall ? GetInstallPath() : DefaultInstallPath();

        browseButton.Location = new System.Drawing.Point(420, 28);
        browseButton.Size = new System.Drawing.Size(100, 28);
        browseButton.Text = "浏览...";
        browseButton.Click += (s, e) => Browse();

        actionButton.Location = new System.Drawing.Point(20, 140);
        actionButton.Size = new System.Drawing.Size(120, 34);
        actionButton.Text = mode == InstallerMode.Uninstall ? "卸载" : "安装";
        actionButton.Click += async (s, e) => await RunAsync();

        launchCheckBox.Location = new System.Drawing.Point(20, 100);
        launchCheckBox.Size = new System.Drawing.Size(200, 24);
        launchCheckBox.Text = "安装完成后启动 MoYu";
        launchCheckBox.Checked = true;
        launchCheckBox.Visible = mode == InstallerMode.Install;

        progress.Location = new System.Drawing.Point(20, 70);
        progress.Size = new System.Drawing.Size(500, 20);
        progress.Visible = false;

        statusLabel.Location = new System.Drawing.Point(20, 185);
        statusLabel.Size = new System.Drawing.Size(500, 40);
        statusLabel.Text = mode == InstallerMode.Uninstall
            ? "准备卸载 MoYu。"
            : "准备把 MoYu 安装到上面的文件夹。";
    }

    private static string DefaultInstallPath()
    {
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrEmpty(local)) return @"C:\Program Files\MoYu";
        return Path.Combine(local, @"Programs\MoYu");
    }

    private void Browse()
    {
        using FolderBrowserDialog dialog = new();
        if (Directory.Exists(pathBox.Text)) dialog.SelectedPath = pathBox.Text;
        if (dialog.ShowDialog(this) == DialogResult.OK) pathBox.Text = dialog.SelectedPath;
    }

    private static string GetInstallPath()
    {
        if (ReadInstallPath(Registry.CurrentUser, UninstallKey) is string mine) return mine;
        if (ReadInstallPath(Registry.LocalMachine, UninstallKey) is string machine) return machine;
        // An install from 1.2.7 or earlier still lives under the old name: uninstalling it must work too.
        if (ReadInstallPath(Registry.CurrentUser, LegacyUninstallKey) is string legacy) return legacy;
        if (ReadInstallPath(Registry.LocalMachine, LegacyUninstallKey) is string oldMachine) return oldMachine;
        return DefaultInstallPath();
    }

    private static string ReadInstallPath(RegistryKey root, string keyName)
    {
        try
        {
            using RegistryKey key = root.OpenSubKey(keyName);
            return key?.GetValue("InstallLocation") as string;
        }
        catch
        {
            return null;
        }
    }

    private async Task RunAsync()
    {
        actionButton.Enabled = false;
        browseButton.Enabled = false;
        pathBox.Enabled = false;
        progress.Visible = true;
        statusLabel.Text = mode == InstallerMode.Uninstall ? "正在卸载..." : "正在安装...";
        try
        {
            if (mode == InstallerMode.Uninstall)
                await UninstallAsync();
            else
                await InstallAsync();

            progress.Value = progress.Maximum;
            statusLabel.Text = mode == InstallerMode.Uninstall ? "卸载完成。" : "安装完成。";
            if (mode == InstallerMode.Install && launchCheckBox.Checked)
                Launch();
            Close();
        }
        catch (Exception ex)
        {
            statusLabel.Text = mode == InstallerMode.Uninstall ? $"卸载失败：{ex.Message}" : $"安装失败：{ex.Message}";
            actionButton.Enabled = true;
            browseButton.Enabled = true;
            pathBox.Enabled = true;
            progress.Visible = false;
        }
    }

    private void Launch()
    {
        string exe = Path.Combine(pathBox.Text.Trim(), "BichiPond.exe");
        try
        {
            Process.Start(new ProcessStartInfo { FileName = exe, WorkingDirectory = pathBox.Text.Trim(), UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, $"MoYu 已安装到 {pathBox.Text.Trim()}，但启动失败：{ex.Message}", "MoYu");
        }
    }

    private async Task InstallAsync()
    {
        string destination = pathBox.Text.Trim();
        if (destination.Length == 0) throw new InvalidOperationException("请填写安装位置。");

        // The running pond holds BichiPond.exe and the WebView2 DLLs open; overwriting them fails halfway.
        if (!StopRunningApp())
            throw new InvalidOperationException("MoYu 仍在运行，无法结束它。请从任务栏通知区域的锦鲤图标退出 MoYu 后重试。");

        try
        {
            Directory.CreateDirectory(destination);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"无法创建文件夹 {destination}：{ex.Message}");
        }

        using Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("MoYu.Installer.payload.zip")
            ?? throw new InvalidOperationException("安装包资源缺失。");
        using ZipArchive archive = new(resource, ZipArchiveMode.Read);
        progress.Maximum = archive.Entries.Count;
        progress.Value = 0;

        foreach (ZipArchiveEntry entry in archive.Entries)
        {
            string path = Path.Combine(destination, entry.FullName);
            if (string.IsNullOrEmpty(entry.Name)) Directory.CreateDirectory(path);
            else
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                ExtractEntry(entry, path, destination);
            }

            progress.Value = Math.Min(progress.Value + 1, progress.Maximum);
            statusLabel.Text = $"正在复制 {entry.FullName}";
            await Task.Yield();
        }

        CopySelfTo(destination);
        CreateShortcuts(destination);
        WriteUninstallInfo(destination);
        MigrateLegacyInstall(destination);
    }

    private static void ExtractEntry(ZipArchiveEntry entry, string path, string destination)
    {
        try
        {
            using Stream input = entry.Open();
            using Stream output = File.Create(path);
            input.CopyTo(output);
        }
        catch (UnauthorizedAccessException)
        {
            throw new InvalidOperationException(
                $"没有权限写入 {destination}。请改用默认位置（我的文档所在盘的用户目录），或换一个有写入权限的文件夹。");
        }
        catch (IOException)
        {
            // 目标文件可能正被占用：删掉再写一次。
            try { File.Delete(path); } catch { }
            using Stream input = entry.Open();
            using Stream output = File.Create(path);
            input.CopyTo(output);
        }
    }

    /// <summary>把安装程序自己复制进安装目录，卸载入口就不再依赖下载的安装包。</summary>
    private static void CopySelfTo(string destination)
    {
        try
        {
            string self = Application.ExecutablePath;
            string target = Path.Combine(destination, "uninstall.exe");
            if (string.Equals(Path.GetFullPath(self), Path.GetFullPath(target), StringComparison.OrdinalIgnoreCase)) return;
            File.Copy(self, target, true);
        }
        catch
        {
            // 复制失败不影响使用，卸载仍可从安装包执行。
        }
    }

    private static void CreateShortcuts(string destination)
    {
        string targetExe = Path.Combine(destination, "BichiPond.exe");
        string desktop = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), AppName + ".lnk");
        string startMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), AppName + ".lnk");

        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType == null) return;
        dynamic shell = Activator.CreateInstance(shellType);

        foreach (string link in new[] { desktop, startMenu })
        {
            try
            {
                dynamic shortcut = shell.CreateShortcut(link);
                shortcut.TargetPath = targetExe;
                shortcut.WorkingDirectory = destination;
                shortcut.IconLocation = targetExe;
                shortcut.Save();
            }
            catch
            {
                // 快捷方式失败不影响安装本身。
            }
        }
    }

    private static void WriteUninstallInfo(string destination)
    {
        using RegistryKey key = Registry.CurrentUser.CreateSubKey(UninstallKey);
        if (key == null) return;
        key.SetValue("DisplayName", AppName);
        // The assembly version is the product version (1.2.8 today); a literal here went stale once already.
        key.SetValue("DisplayVersion", Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "1.0.0");
        key.SetValue("Publisher", "MoYu");
        key.SetValue("InstallLocation", destination);
        key.SetValue("DisplayIcon", Path.Combine(destination, "BichiPond.exe"));
        key.SetValue("UninstallString", $"\"{Path.Combine(destination, "uninstall.exe")}\" /uninstall");
        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
    }

    private async Task UninstallAsync()
    {
        string destination = pathBox.Text.Trim();

        // A running pond keeps its exe open, which would make the folder delete fail halfway.
        if (!StopRunningApp())
            throw new InvalidOperationException("MoYu 仍在运行，无法结束它。请从任务栏通知区域的锦鲤图标退出 MoYu 后重试。");

        // The folder goes first: if a file is still locked, the uninstall entry stays behind so that
        // 「应用和功能」 can simply try again instead of leaving an unreachable half-install on disk.
        if (Directory.Exists(destination) && LooksLikeInstall(destination))
        {
            string self = Path.GetFullPath(Application.ExecutablePath);
            string folder = Path.GetFullPath(destination).TrimEnd('\\') + "\\";
            if (self.StartsWith(folder, StringComparison.OrdinalIgnoreCase))
            {
                // 卸载程序就在要删除的文件夹里：交给 cmd 在进程退出后再删。
                Process.Start(new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = $"/c ping -n 3 127.0.0.1 >nul & rmdir /s /q \"{destination.TrimEnd('\\')}\"",
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                });
            }
            else
            {
                await Task.Run(() => Directory.Delete(destination, true));
            }
        }

        // The old 摸鱼 install (if any) goes with it, so no orphaned copy is left without an entry.
        DeleteLegacyFolder(LegacyInstallPath(), destination);

        foreach (string name in new[] { AppName, LegacyAppName })
            foreach (string link in Shortcuts(name))
            {
                try { if (File.Exists(link)) File.Delete(link); } catch { }
            }

        try { Registry.CurrentUser.DeleteSubKey(UninstallKey, false); } catch { }
        try { Registry.LocalMachine.DeleteSubKey(UninstallKey, false); } catch { }
        try { Registry.CurrentUser.DeleteSubKey(LegacyUninstallKey, false); } catch { }
        try { Registry.LocalMachine.DeleteSubKey(LegacyUninstallKey, false); } catch { }
    }

    /// <summary>Up to 1.2.7 the app installed as 摸鱼. After a successful install, take that copy, its
    /// shortcuts and its uninstall entry away and point an enabled 「开机时启动」 at the new folder, so the
    /// rename upgrades in place instead of leaving two ponds side by side.</summary>
    private static void MigrateLegacyInstall(string destination)
    {
        // 「开机时启动」 is ours (BichiKoiPond) but still names the old exe: keep the choice, fix the path.
        try
        {
            using RegistryKey run = Registry.CurrentUser.OpenSubKey(RunKey, true);
            if (run?.GetValue(RunName) != null)
                run.SetValue(RunName, $"\"{Path.Combine(destination, "BichiPond.exe")}\"");
        }
        catch { }

        foreach (string link in Shortcuts(LegacyAppName))
        {
            try { if (File.Exists(link)) File.Delete(link); } catch { }
        }
        try { Registry.CurrentUser.DeleteSubKey(LegacyUninstallKey, false); } catch { }
        try { Registry.LocalMachine.DeleteSubKey(LegacyUninstallKey, false); } catch { }

        DeleteLegacyFolder(LegacyInstallPath(), destination);
    }

    /// <summary>The folder an install from 1.2.7 or earlier lives in (its uninstall entry, else the old default).</summary>
    private static string LegacyInstallPath() =>
        ReadInstallPath(Registry.CurrentUser, LegacyUninstallKey)
        ?? ReadInstallPath(Registry.LocalMachine, LegacyUninstallKey)
        ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\" + LegacyAppName);

    /// <summary>Removes the old copy only when it really is one and is not the folder the new copy uses
    /// (or a parent of it), so a stale registry value can never delete something else.</summary>
    private static void DeleteLegacyFolder(string legacy, string destination)
    {
        if (string.IsNullOrWhiteSpace(legacy) || !Directory.Exists(legacy) || !LooksLikeInstall(legacy)) return;
        if (SamePath(legacy, destination) || IsInside(destination, legacy)) return;
        try { Directory.Delete(legacy, true); } catch { }
    }

    /// <summary>Ends a running pond: its exe and WebView2 files stay locked otherwise. A tray app has no main
    /// window to close politely, so it is terminated; it saves continuously, so nothing is lost.</summary>
    private static bool StopRunningApp()
    {
        int self = Process.GetCurrentProcess().Id;
        bool stopped = true;
        foreach (Process running in Process.GetProcessesByName("BichiPond"))
        {
            try
            {
                if (running.Id == self || running.HasExited) continue;
                if (!running.CloseMainWindow()) running.Kill();
                if (!running.WaitForExit(5000))
                {
                    running.Kill();
                    if (!running.WaitForExit(3000)) stopped = false;
                }
            }
            catch
            {
                stopped = false;
            }
            finally
            {
                running.Dispose();
            }
        }
        return stopped;
    }

    /// <summary>A folder only counts as the install folder when the pond or the uninstaller is still in it;
    /// a stale registry value must never aim the delete at something else.</summary>
    private static bool LooksLikeInstall(string destination)
    {
        try
        {
            string folder = Path.GetFullPath(destination).TrimEnd('\\');
            if (folder.Length <= 3) return false;
            return File.Exists(Path.Combine(folder, "BichiPond.exe"))
                || File.Exists(Path.Combine(folder, "uninstall.exe"))
                || string.Equals(Path.GetFileName(folder), AppName, StringComparison.OrdinalIgnoreCase)
                || string.Equals(Path.GetFileName(folder), LegacyAppName, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    /// <summary>The three places a shortcut may live: the user's desktop and Start menu, plus the machine-wide
    /// Start menu an older administrator install may have written.</summary>
    private static string[] Shortcuts(string name) => new[]
    {
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), name + ".lnk"),
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), name + ".lnk"),
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu), "Programs", name + ".lnk"),
    };

    private static bool SamePath(string a, string b)
    {
        try { return string.Equals(Path.GetFullPath(a).TrimEnd('\\'), Path.GetFullPath(b).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase); }
        catch { return false; }
    }

    /// <summary>True when <paramref name="child"/> is the same folder as, or inside, <paramref name="parent"/>.</summary>
    private static bool IsInside(string child, string parent)
    {
        try
        {
            string c = Path.GetFullPath(child).TrimEnd('\\') + "\\";
            string p = Path.GetFullPath(parent).TrimEnd('\\') + "\\";
            return c.StartsWith(p, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return true; // unsure: treat it as inside, so nothing is deleted
        }
    }
}
