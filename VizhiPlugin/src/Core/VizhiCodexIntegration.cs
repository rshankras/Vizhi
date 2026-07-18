namespace Loupedeck.VizhiPlugin
{
    using System;
    using System.IO;
    using System.Reflection;

    internal static class VizhiCodexIntegration
    {
        private const String BeginMarker = "# >>> Vizhi hooks >>>";
        private const String EndMarker = "# <<< Vizhi hooks <<<";
        private static readonly String[] Events = new[] { "SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "Stop" };

        public static void EnsureInstalled()
        {
            try
            {
                var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                var scriptsPath = Path.Combine(home, ".vizhi", "scripts");
                var hookSource = Path.Combine(PackageRoot(), "scripts", "vizhi-codex-hook.js");
                if (!File.Exists(hookSource))
                {
                    PluginLog.Warning($"Vizhi could not find its bundled Codex hook at {hookSource}.");
                    return;
                }

                VizhiPrivateFiles.EnsurePrivateDirectory(Path.Combine(home, ".vizhi"));
                VizhiPrivateFiles.EnsurePrivateDirectory(scriptsPath);
                var hookPath = Path.Combine(scriptsPath, "vizhi-codex-hook.js");
                var wrapperPath = Path.Combine(scriptsPath, "vizhi-codex-hook.sh");
                var changed = CopyPrivateFileIfChanged(hookSource, hookPath);
                changed |= WriteExecutableIfChanged(wrapperPath, "#!/bin/sh\nexec /usr/bin/osascript -l JavaScript \"$HOME/.vizhi/scripts/vizhi-codex-hook.js\" \"$1\"\n");
                changed |= InstallHookConfig(home, wrapperPath);
                if (changed)
                {
                    PluginLog.Info("Vizhi installed its Codex hooks. Restart Codex and approve its one-time hook trust prompt.");
                }
            }
            catch (Exception ex)
            {
                PluginLog.Warning(ex, "Vizhi could not automatically install Codex hooks");
            }
        }

        internal static String PackageRoot()
        {
            var assemblyPath = typeof(VizhiPlugin).GetTypeInfo().Assembly.Location;
            if (!String.IsNullOrWhiteSpace(assemblyPath))
            {
                var binaryDirectory = Path.GetDirectoryName(assemblyPath);
                if (!String.IsNullOrWhiteSpace(binaryDirectory))
                {
                    var packageRoot = Directory.GetParent(binaryDirectory)?.FullName;
                    if (!String.IsNullOrWhiteSpace(packageRoot)) return packageRoot;
                }
            }

            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            var installedPackageRoot = Path.Combine(home, "Library", "Application Support", "Logi", "LogiPluginService", "Plugins", "Vizhi");
            if (Directory.Exists(installedPackageRoot)) return installedPackageRoot;
            throw new DirectoryNotFoundException("Vizhi could not locate its installed plugin package.");
        }

        private static Boolean CopyPrivateFileIfChanged(String sourcePath, String destinationPath)
        {
            var source = File.ReadAllText(sourcePath);
            if (File.Exists(destinationPath) && String.Equals(File.ReadAllText(destinationPath), source, StringComparison.Ordinal))
            {
                VizhiPrivateFiles.EnsurePrivateFile(destinationPath);
                return false;
            }
            EnsureNotSymlink(destinationPath);
            File.WriteAllText(destinationPath, source);
            VizhiPrivateFiles.EnsurePrivateFile(destinationPath);
            return true;
        }

        private static Boolean WriteExecutableIfChanged(String path, String content)
        {
            var changed = !File.Exists(path) || !String.Equals(File.ReadAllText(path), content, StringComparison.Ordinal);
            if (changed)
            {
                EnsureNotSymlink(path);
                File.WriteAllText(path, content);
            }
            if (OperatingSystem.IsMacOS() || OperatingSystem.IsLinux())
            {
                File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            }
            return changed;
        }

        private static Boolean InstallHookConfig(String home, String wrapperPath)
        {
            var codexPath = Path.Combine(home, ".codex");
            EnsureDirectoryIsNotSymlink(codexPath);
            Directory.CreateDirectory(codexPath);
            var configPath = Path.Combine(codexPath, "config.toml");
            EnsureNotSymlink(configPath);
            var current = File.Exists(configPath) ? File.ReadAllText(configPath) : String.Empty;
            var next = ReplaceMarkedBlock(current, HookConfig(wrapperPath));
            if (String.Equals(current, next, StringComparison.Ordinal)) return false;
            var backupPath = $"{configPath}.vizhi.bak";
            if (!File.Exists(backupPath) && !String.IsNullOrWhiteSpace(current)) File.Copy(configPath, backupPath);
            var temporaryPath = $"{configPath}.{Guid.NewGuid():N}.tmp";
            File.WriteAllText(temporaryPath, next);
            File.Move(temporaryPath, configPath, true);
            return true;
        }

        private static String HookConfig(String wrapperPath)
        {
            var tables = String.Join("\n\n", Array.ConvertAll(Events, eventName =>
            {
                var command = $"/bin/sh {ShellQuote(wrapperPath)} {eventName}";
                return $"[[hooks.{eventName}]]\nmatcher = \"*\"\n\n[[hooks.{eventName}.hooks]]\ntype = \"command\"\ncommand = \"{EscapeToml(command)}\"\ntimeout = 5";
            }));
            return $"{BeginMarker}\n# Vizhi receives Codex lifecycle payloads locally and updates keypad state.\n# Codex will request trust for these hooks on the next launch; approve normally.\n# Never use --dangerously-bypass-hook-trust.\n{tables}\n{EndMarker}\n";
        }

        private static String ReplaceMarkedBlock(String config, String block)
        {
            var start = config.IndexOf(BeginMarker, StringComparison.Ordinal);
            if (start < 0) return $"{config.TrimEnd()}\n\n{block}";
            var end = config.IndexOf(EndMarker, start, StringComparison.Ordinal);
            if (end < 0) throw new InvalidOperationException("Existing Vizhi hook block is incomplete; restore the backup before retrying.");
            var remaining = config.Substring(end + EndMarker.Length).TrimStart('\r', '\n');
            return $"{config.Substring(0, start)}{block}{remaining}";
        }

        private static String EscapeToml(String value) => value.Replace("\\", "\\\\").Replace("\"", "\\\"");

        private static String ShellQuote(String value) => $"'{value.Replace("'", "'\"'\"'")}'";

        private static void EnsureNotSymlink(String path)
        {
            if (new FileInfo(path).LinkTarget != null)
            {
                throw new IOException($"Vizhi refuses to replace symlinked file {path}.");
            }
        }

        private static void EnsureDirectoryIsNotSymlink(String path)
        {
            if (new DirectoryInfo(path).LinkTarget != null)
            {
                throw new IOException($"Vizhi refuses to use symlinked directory {path}.");
            }
        }
    }
}
