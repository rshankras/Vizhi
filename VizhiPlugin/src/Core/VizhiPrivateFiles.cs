namespace Loupedeck.VizhiPlugin
{
    using System;
    using System.IO;

    internal static class VizhiPrivateFiles
    {
        private const UnixFileMode PrivateDirectoryMode = UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute;
        private const UnixFileMode PrivateFileMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;

        public static void EnsurePrivateDirectory(String path)
        {
            var directory = Directory.CreateDirectory(path);
            if (directory.LinkTarget != null) throw new IOException($"Vizhi refuses to use symlinked directory {path}.");
            if (OperatingSystem.IsMacOS() || OperatingSystem.IsLinux()) File.SetUnixFileMode(path, PrivateDirectoryMode);
        }

        public static void EnsurePrivateFile(String path)
        {
            var file = new FileInfo(path);
            if (!file.Exists) throw new FileNotFoundException("Vizhi private file is missing.", path);
            if (file.LinkTarget != null) throw new IOException($"Vizhi refuses to use symlinked file {path}.");
            if (OperatingSystem.IsMacOS() || OperatingSystem.IsLinux()) File.SetUnixFileMode(path, PrivateFileMode);
        }
    }
}
