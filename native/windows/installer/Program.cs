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
            Application.Run(new InstallerForm(InstallerMode.Uninstall));
        else
            Application.Run(new InstallerForm(InstallerMode.Install));
    }
}

internal enum InstallerMode
{
    Install,
    Uninstall
}

internal sealed class InstallerForm : Form
{
    private readonly InstallerMode mode;
    private readonly TextBox pathBox = new();
    private readonly Button browseButton = new();
    private readonly Button actionButton = new();
    private readonly CheckBox launchCheckBox = new();
    private readonly ProgressBar progress = new();
    private readonly Label statusLabel = new();
    private readonly LinkLabel uninstallLink = new();

    public InstallerForm(InstallerMode mode)
    {
        this.mode = mode;
        Text = mode == InstallerMode.Uninstall ? "摸鱼 - 卸载" : "摸鱼 - 安装";
        StartPosition = FormStartPosition.CenterScreen;
        Width = 560;
        Height = 300;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        MinimizeBox = false;
        Icon = new System.Drawing.Icon(@"..\AppIcon.ico");

        Controls.Add(pathBox);
        Controls.Add(browseButton);
        Controls.Add(actionButton);
        Controls.Add(launchCheckBox);
        Controls.Add(progress);
        Controls.Add(statusLabel);
        Controls.Add(uninstallLink);

        pathBox.Location = new System.Drawing.Point(20, 70);
        pathBox.Size = new System.Drawing.Size(390, 24);
        pathBox.Text = mode == InstallerMode.Uninstall ? GetInstallPathFromRegistry() : @"C:\Program Files\摸鱼";

        browseButton.Location = new System.Drawing.Point(420, 68);
        browseButton.Size = new System.Drawing.Size(100, 28);
        browseButton.Text = "浏览...";
        browseButton.Click += (s, e) => Browse();

        actionButton.Location = new System.Drawing.Point(20, 180);
        actionButton.Size = new System.Drawing.Size(120, 34);
        actionButton.Text = mode == InstallerMode.Uninstall ? "卸载" : "安装";
        actionButton.Click += async (s, e) => await RunAsync();

        launchCheckBox.Location = new System.Drawing.Point(20, 140);
        launchCheckBox.Size = new System.Drawing.Size(200, 24);
        launchCheckBox.Text = "安装完成后启动摸鱼";
        launchCheckBox.Checked = true;
        launchCheckBox.Visible = mode == InstallerMode.Install;

        progress.Location = new System.Drawing.Point(20, 110);
        progress.Size = new System.Drawing.Size(500, 20);
        progress.Visible = false;

        statusLabel.Location = new System.Drawing.Point(20, 230);
        statusLabel.Size = new System.Drawing.Size(500, 24);
        statusLabel.Text = mode == InstallerMode.Uninstall ? "准备卸载摸鱼。" : "准备安装摸鱼。";

        uninstallLink.Location = new System.Drawing.Point(20, 255);
        uninstallLink.Size = new System.Drawing.Size(200, 20);
        uninstallLink.Text = "卸载摸鱼";
        uninstallLink.Visible = mode == InstallerMode.Uninstall;
        uninstallLink.Click += async (s, e) => await RunAsync();
    }

    private void Browse()
    {
        using FolderBrowserDialog dialog = new();
        if (Directory.Exists(pathBox.Text)) dialog.SelectedPath = pathBox.Text;
        if (dialog.ShowDialog(this) == DialogResult.OK) pathBox.Text = dialog.SelectedPath;
    }

    private static string GetInstallPathFromRegistry()
    {
        using RegistryKey? key = Registry.LocalMachine.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\摸鱼");
        return key?.GetValue("InstallLocation") as string ?? @"C:\Program Files\摸鱼";
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

            statusLabel.Text = mode == InstallerMode.Uninstall ? "卸载完成。" : "安装完成。";
            progress.Value = progress.Maximum;
            if (mode == InstallerMode.Install && launchCheckBox.Checked)
                Process.Start(new ProcessStartInfo { FileName = Path.Combine(pathBox.Text, "BichiPond.exe"), UseShellExecute = true });
            Close();
        }
        catch (Exception ex)
        {
            statusLabel.Text = mode == InstallerMode.Uninstall ? $"卸载失败：{ex.Message}" : $"安装失败：{ex.Message}";
            actionButton.Enabled = true;
            browseButton.Enabled = true;
            pathBox.Enabled = true;
        }
    }

    private async Task InstallAsync()
    {
        string destination = pathBox.Text;
        Directory.CreateDirectory(destination);

        using Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("MoYu.Installer.payload.zip")
            ?? throw new InvalidOperationException("安装包资源缺失");
        using ZipArchive archive = new(resource, ZipArchiveMode.Read);
        progress.Maximum = archive.Entries.Count;
        progress.Value = 0;

        foreach (ZipArchiveEntry entry in archive.Entries)
        {
            string path = Path.Combine(destination, entry.FullName);
            if (string.IsNullOrEmpty(entry.Name)) Directory.CreateDirectory(path);
            else
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                using Stream input = entry.Open();
                using Stream output = File.Create(path);
                await input.CopyToAsync(output);
            }

            progress.Value = Math.Min(progress.Value + 1, progress.Maximum);
            statusLabel.Text = $"正在复制 {entry.FullName}";
        }

        CreateShortcuts(destination);
        WriteUninstallInfo(destination);
    }

    private static void CreateShortcuts(string destination)
    {
        string targetExe = Path.Combine(destination, "BichiPond.exe");
        string desktop = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "摸鱼.lnk");
        string startMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu), "Programs", "摸鱼.lnk");

        Type shellType = Type.GetTypeFromProgID("WScript.Shell")!;
        dynamic shell = Activator.CreateInstance(shellType)!;
        dynamic desktopShortcut = shell.CreateShortcut(desktop);
        desktopShortcut.TargetPath = targetExe;
        desktopShortcut.WorkingDirectory = destination;
        desktopShortcut.IconLocation = targetExe;
        desktopShortcut.Save();

        dynamic startShortcut = shell.CreateShortcut(startMenu);
        startShortcut.TargetPath = targetExe;
        startShortcut.WorkingDirectory = destination;
        startShortcut.IconLocation = targetExe;
        startShortcut.Save();
    }

    private static void WriteUninstallInfo(string destination)
    {
        using RegistryKey key = Registry.LocalMachine.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\摸鱼");
        key.SetValue("DisplayName", "摸鱼");
        key.SetValue("DisplayVersion", "1.2.1");
        key.SetValue("Publisher", "MoYu");
        key.SetValue("InstallLocation", destination);
        key.SetValue("DisplayIcon", Path.Combine(destination, "BichiPond.exe"));
        key.SetValue("UninstallString", $"\"{Environment.ProcessPath}\" /uninstall");
        key.SetValue("EstimatedSize", 15000);
    }

    private async Task UninstallAsync()
    {
        string destination = pathBox.Text;
        if (Directory.Exists(destination))
        {
            progress.Maximum = 100;
            progress.Value = 50;
            await Task.Run(() => Directory.Delete(destination, true));
        }

        string desktop = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "摸鱼.lnk");
        string startMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu), "Programs", "摸鱼.lnk");
        if (File.Exists(desktop)) File.Delete(desktop);
        if (File.Exists(startMenu)) File.Delete(startMenu);

        Registry.LocalMachine.DeleteSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\摸鱼", false);
    }
}
