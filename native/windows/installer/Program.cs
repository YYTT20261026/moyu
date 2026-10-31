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
                "摸鱼", MessageBoxButtons.OK, MessageBoxIcon.Warning);
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
    private const string AppName = "摸鱼";
    private const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\摸鱼";

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
        Text = mode == InstallerMode.Uninstall ? "摸鱼 - 卸载" : "摸鱼 - 安装";
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
        launchCheckBox.Text = "安装完成后启动摸鱼";
        launchCheckBox.Checked = true;
        launchCheckBox.Visible = mode == InstallerMode.Install;

        progress.Location = new System.Drawing.Point(20, 70);
        progress.Size = new System.Drawing.Size(500, 20);
        progress.Visible = false;

        statusLabel.Location = new System.Drawing.Point(20, 185);
        statusLabel.Size = new System.Drawing.Size(500, 40);
        statusLabel.Text = mode == InstallerMode.Uninstall
            ? "准备卸载摸鱼。"
            : "准备把摸鱼安装到上面的文件夹。";
    }

    private static string DefaultInstallPath()
    {
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrEmpty(local)) return @"C:\Program Files\摸鱼";
        return Path.Combine(local, @"Programs\摸鱼");
    }

    private void Browse()
    {
        using FolderBrowserDialog dialog = new();
        if (Directory.Exists(pathBox.Text)) dialog.SelectedPath = pathBox.Text;
        if (dialog.ShowDialog(this) == DialogResult.OK) pathBox.Text = dialog.SelectedPath;
    }

    private static string GetInstallPath()
    {
        if (ReadInstallPath(Registry.CurrentUser) is string mine) return mine;
        if (ReadInstallPath(Registry.LocalMachine) is string legacy) return legacy;
        return DefaultInstallPath();
    }

    private static string ReadInstallPath(RegistryKey root)
    {
        try
        {
            using RegistryKey key = root.OpenSubKey(UninstallKey);
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
            MessageBox.Show(this, $"摸鱼已安装到 {pathBox.Text.Trim()}，但启动失败：{ex.Message}", "摸鱼");
        }
    }

    private async Task InstallAsync()
    {
        string destination = pathBox.Text.Trim();
        if (destination.Length == 0) throw new InvalidOperationException("请填写安装位置。");

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
        key.SetValue("DisplayVersion", "1.2.5");
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

        foreach (string link in new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), AppName + ".lnk"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), AppName + ".lnk"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu), "Programs", AppName + ".lnk")
        })
        {
            try { if (File.Exists(link)) File.Delete(link); } catch { }
        }

        try { Registry.CurrentUser.DeleteSubKey(UninstallKey, false); } catch { }
        try { Registry.LocalMachine.DeleteSubKey(UninstallKey, false); } catch { }

        if (!Directory.Exists(destination)) return;

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
            return;
        }

        await Task.Run(() => Directory.Delete(destination, true));
    }
}
