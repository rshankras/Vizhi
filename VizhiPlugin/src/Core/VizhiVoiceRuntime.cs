namespace Loupedeck.VizhiPlugin
{
    using System;
    using System.Collections.Generic;
    using System.Diagnostics;
    using System.Globalization;
    using System.IO;
    using System.Security.Cryptography;
    using System.Threading;
    using System.Threading.Tasks;

    internal sealed class VoiceTurnOptions
    {
        public Boolean Vad { get; set; }
        public Double SilenceSeconds { get; set; } = 1.5;
        public Int32 MaxSeconds { get; set; } = 60;
        public Int32 TranscriptWaitSeconds { get; set; } = 30;
    }

    internal static class VizhiVoiceRuntime
    {
        private const String WhisperModelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";
        private const String WhisperModelSha256 = "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002";
        private const Int64 WhisperModelSizeBytes = 147_964_211;
        private const Int32 SetupTimeoutMilliseconds = 15 * 60 * 1000;
        private static readonly String RuntimePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".vizhi", "voice");
        private static readonly String HelperPath = Path.Combine(RuntimePath, "VizhiVoiceHelper.app");
        private static readonly String HelperExecutablePath = Path.Combine(HelperPath, "Contents", "MacOS", "VizhiVoiceHelper");
        private static readonly String ModelPath = Path.Combine(RuntimePath, "models", "ggml-base.en.bin");
        private static readonly String TemporaryPath = Path.Combine(RuntimePath, "tmp");
        private static readonly String RecordingPath = Path.Combine(TemporaryPath, "recording.wav");
        private static readonly String StopPath = Path.Combine(TemporaryPath, "recording.stop");
        private static readonly String TranscriptPath = Path.Combine(TemporaryPath, "transcript.txt");
        private static readonly String LegacyRecordingPath = Path.Combine(Path.GetTempPath(), "vizhi-voice.wav");
        private static readonly String LegacyStopPath = Path.Combine(Path.GetTempPath(), "vizhi-voice.stop");
        private static readonly String LegacyTranscriptPath = Path.Combine(Path.GetTempPath(), "vizhi-voice-transcript.txt");
        private static readonly Object Sync = new Object();
        private static readonly String[] WhisperCliPaths = new[] { "/opt/homebrew/bin/whisper-cli", "/usr/local/bin/whisper-cli" };
        private static Boolean _recording;
        private static Boolean _transcribing;
        private static Int32 _modelDownloadInProgress;
        private static Int32 _slot;
        private static String _sessionId;
        private static String _tty;
        private static VoiceTurnOptions _options;
        private static Action<String> _onTranscript;

        public static Boolean Start(Int32 slot) => StartTurn(slot, new VoiceTurnOptions(), null);

        public static Boolean StartTurn(Int32 slot, VoiceTurnOptions options, Action<String> onTranscript)
        {
            if (!OperatingSystem.IsMacOS()) return false;
            lock (Sync)
            {
                if (_recording || _transcribing) return false;
                var session = VizhiRuntime.GetSlot(slot);
                var tty = VizhiRuntime.GetSlotTty(slot);
                if (!session.IsOccupied || String.IsNullOrWhiteSpace(tty)) return false;
                if (!EnsureRuntimeRequirements()) return false;
                if (!BeginRecording(slot, session.SessionId, tty, options ?? new VoiceTurnOptions(), onTranscript)) return false;
                if (_options.Vad) BeginTranscriptWatchLocked();
                return true;
            }
        }

        public static void CancelTurn()
        {
            lock (Sync)
            {
                if (!_recording) return;
                _recording = false;
                try
                {
                    File.WriteAllText(StopPath, String.Empty);
                    VizhiPrivateFiles.EnsurePrivateFile(StopPath);
                }
                catch (Exception ex)
                {
                    PluginLog.Warning(ex, "Vizhi could not cancel voice capture");
                }
                if (!_transcribing)
                {
                    _onTranscript = _ => { };
                    BeginTranscriptWatchLocked();
                }
            }
        }

        private static Boolean EnsureRuntimeRequirements()
        {
            if (!EnsureBundledHelper()) return false;
            if (!HasWhisperCli())
            {
                ShowWhisperCliAlert();
                return false;
            }
            if (HasUsableModel()) return true;
            RequestModelDownload();
            return false;
        }

        private static Boolean EnsureBundledHelper()
        {
            if (HasUsableHelper()) return true;

            String stagingPath = null;
            try
            {
                VizhiPrivateFiles.EnsurePrivateDirectory(RuntimePath);
                var sourcePath = Path.Combine(VizhiCodexIntegration.PackageRoot(), "voice", "VizhiVoiceHelper.app");
                var sourceExecutablePath = Path.Combine(sourcePath, "Contents", "MacOS", "VizhiVoiceHelper");
                if (!Directory.Exists(sourcePath) || !File.Exists(sourceExecutablePath))
                {
                    PluginLog.Warning($"Vizhi could not find its bundled Voice helper at {sourcePath}.");
                    Notify("Vizhi Voice setup is unavailable. Reinstall the latest Vizhi plugin.");
                    return false;
                }

                EnsureNotSymlinkedDirectory(sourcePath);
                EnsureNotSymlinkedFile(sourceExecutablePath);
                if (Directory.Exists(HelperPath))
                {
                    EnsureNotSymlinkedDirectory(HelperPath);
                    Directory.Delete(HelperPath, true);
                }

                stagingPath = Path.Combine(RuntimePath, $".VizhiVoiceHelper-{Guid.NewGuid():N}.app");
                RunTool("/usr/bin/ditto", new[] { sourcePath, stagingPath }, 30_000);
                var stagingExecutablePath = Path.Combine(stagingPath, "Contents", "MacOS", "VizhiVoiceHelper");
                if (!File.Exists(stagingExecutablePath)) throw new FileNotFoundException("Vizhi copied an incomplete Voice helper.", stagingExecutablePath);
                EnsureNotSymlinkedDirectory(stagingPath);
                EnsureNotSymlinkedFile(stagingExecutablePath);
                if (OperatingSystem.IsMacOS())
                {
                    File.SetUnixFileMode(stagingExecutablePath, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
                }
                Directory.Move(stagingPath, HelperPath);
                stagingPath = null;
                PluginLog.Info("Vizhi installed its bundled Voice helper for this user.");
                return true;
            }
            catch (Exception ex)
            {
                PluginLog.Warning(ex, "Vizhi could not install its bundled Voice helper");
                Notify("Vizhi could not set up Voice. Reinstall the latest Vizhi plugin and try again.");
                return false;
            }
            finally
            {
                if (!String.IsNullOrWhiteSpace(stagingPath) && Directory.Exists(stagingPath))
                {
                    try { Directory.Delete(stagingPath, true); } catch { }
                }
            }
        }

        private static Boolean HasUsableHelper()
        {
            try
            {
                if (!Directory.Exists(HelperPath) || !File.Exists(HelperExecutablePath)) return false;
                if (new DirectoryInfo(HelperPath).LinkTarget != null || new FileInfo(HelperExecutablePath).LinkTarget != null) return false;
                if (!OperatingSystem.IsMacOS()) return true;
                return (File.GetUnixFileMode(HelperExecutablePath) & UnixFileMode.UserExecute) != 0;
            }
            catch
            {
                return false;
            }
        }

        private static Boolean HasWhisperCli()
            => Array.Exists(WhisperCliPaths, path => File.Exists(path));

        private static Boolean HasUsableModel()
        {
            try
            {
                return IsVerifiedModel(ModelPath);
            }
            catch
            {
                return false;
            }
        }

        private static Boolean IsVerifiedModel(String path)
        {
            var model = new FileInfo(path);
            if (!model.Exists || model.LinkTarget != null || model.Length != WhisperModelSizeBytes) return false;
            using var stream = File.OpenRead(path);
            using var sha256 = SHA256.Create();
            return String.Equals(Convert.ToHexString(sha256.ComputeHash(stream)), WhisperModelSha256, StringComparison.OrdinalIgnoreCase);
        }

        private static void RequestModelDownload()
        {
            if (Interlocked.CompareExchange(ref _modelDownloadInProgress, 1, 0) != 0)
            {
                Notify("Vizhi Voice setup is already in progress.");
                return;
            }

            new Thread(() =>
            {
                try
                {
                    if (!ConfirmModelDownload()) return;
                    Notify("Vizhi Voice is downloading its one-time offline model.");
                    DownloadModel();
                }
                finally
                {
                    Interlocked.Exchange(ref _modelDownloadInProgress, 0);
                }
            }) { IsBackground = true, Name = "vizhi-voice-setup" }.Start();
        }

        private static Boolean ConfirmModelDownload()
        {
            const String script = """
try
set reply to display dialog "Vizhi Voice needs a one-time local Whisper model download (about 142 MB). Audio stays on this Mac. Download it now?" with title "Set Up Vizhi Voice" buttons {"Not Now", "Download"} default button "Download" cancel button "Not Now" giving up after 120
if gave up of reply then return "Not Now"
return button returned of reply
on error number -128
return "Not Now"
end try
""";
            try
            {
                return String.Equals(RunTool("/usr/bin/osascript", new[] { "-e", script }, 130_000).StandardOutput.Trim(), "Download", StringComparison.Ordinal);
            }
            catch (Exception ex)
            {
                PluginLog.Warning(ex, "Vizhi could not ask to download the Whisper model");
                return false;
            }
        }

        private static void DownloadModel()
        {
            try
            {
                if (HasUsableModel()) return;
                var modelsPath = Path.GetDirectoryName(ModelPath);
                if (String.IsNullOrWhiteSpace(modelsPath)) throw new InvalidOperationException("Vizhi could not determine its Voice model directory.");
                VizhiPrivateFiles.EnsurePrivateDirectory(RuntimePath);
                VizhiPrivateFiles.EnsurePrivateDirectory(modelsPath);
                EnsureNotSymlinkedFile(ModelPath);

                var downloadPath = $"{ModelPath}.download";
                EnsureNotSymlinkedFile(downloadPath);
                if (!File.Exists(downloadPath))
                {
                    using (File.Create(downloadPath)) { }
                }
                VizhiPrivateFiles.EnsurePrivateFile(downloadPath);
                RunTool("/usr/bin/curl", new[]
                {
                    "--fail", "--location", "--proto", "=https", "--proto-redir", "=https",
                    "--retry", "2", "--connect-timeout", "30", "--continue-at", "-",
                    "--output", downloadPath, WhisperModelUrl,
                }, SetupTimeoutMilliseconds);

                if (!IsVerifiedModel(downloadPath))
                {
                    EnsureNotSymlinkedFile(downloadPath);
                    File.Delete(downloadPath);
                    throw new InvalidDataException("The Whisper model download failed integrity verification.");
                }
                EnsureNotSymlinkedFile(ModelPath);
                File.Move(downloadPath, ModelPath, true);
                VizhiPrivateFiles.EnsurePrivateFile(ModelPath);
                Notify("Voice setup is complete. Approve microphone access, then tap Voice again.");
                RequestMicrophonePermission();
            }
            catch (Exception ex)
            {
                PluginLog.Warning(ex, "Vizhi could not download the Whisper model");
                Notify("Vizhi could not download the Voice model. Check your connection and tap Voice again.");
            }
        }

        private static void RequestMicrophonePermission()
        {
            try
            {
                var startInfo = new ProcessStartInfo("/usr/bin/open") { UseShellExecute = false };
                foreach (var argument in new[] { HelperPath, "--args", "--request-microphone-permission" }) startInfo.ArgumentList.Add(argument);
                Process.Start(startInfo);
            }
            catch (Exception ex)
            {
                PluginLog.Warning(ex, "Vizhi could not request microphone permission after Voice setup");
            }
        }

        private static void ShowWhisperCliAlert()
        {
            new Thread(() =>
            {
                const String script = """
on run argv
display dialog (item 1 of argv) with title "Set Up Vizhi Voice" buttons {"OK"} default button "OK"
end run
""";
                try
                {
                    RunTool("/usr/bin/osascript", new[]
                    {
                        "-e", script,
                        "To use offline Voice, install whisper.cpp once:\n\nbrew install whisper-cpp\n\nThen tap Voice again.",
                    }, 30_000);
                }
                catch (Exception ex)
                {
                    PluginLog.Warning(ex, "Vizhi could not explain the missing whisper.cpp requirement");
                }
            }) { IsBackground = true, Name = "vizhi-voice-requirement" }.Start();
        }

        internal static void Notify(String message)
        {
            const String script = """
on run argv
display notification (item 1 of argv) with title "Vizhi"
end run
""";
            try
            {
                RunTool("/usr/bin/osascript", new[] { "-e", script, message }, 10_000);
            }
            catch (Exception ex)
            {
                PluginLog.Warning(ex, "Vizhi could not show a Voice setup notification");
            }
        }

        private static void EnsureNotSymlinkedDirectory(String path)
        {
            if (new DirectoryInfo(path).LinkTarget != null) throw new IOException($"Vizhi refuses to use symlinked directory {path}.");
        }

        private static void EnsureNotSymlinkedFile(String path)
        {
            if (new FileInfo(path).LinkTarget != null) throw new IOException($"Vizhi refuses to use symlinked file {path}.");
        }

        private static Boolean BeginRecording(Int32 slot, String sessionId, String tty, VoiceTurnOptions options, Action<String> onTranscript)
        {
                try
                {
                    VizhiPrivateFiles.EnsurePrivateDirectory(RuntimePath);
                    VizhiPrivateFiles.EnsurePrivateDirectory(TemporaryPath);
                }
                catch (Exception ex)
                {
                    PluginLog.Warning(ex, "Vizhi could not prepare private voice storage");
                    return false;
                }

                TryDelete(LegacyRecordingPath);
                TryDelete(LegacyStopPath);
                TryDelete(LegacyTranscriptPath);
                TryDelete(RecordingPath);
                TryDelete(StopPath);
                TryDelete(TranscriptPath);
                var startInfo = new ProcessStartInfo("/usr/bin/open") { UseShellExecute = false };
                var arguments = new List<String>
                {
                    HelperPath, "--args", "--out", RecordingPath, "--stopflag", StopPath,
                    "--transcript", TranscriptPath, "--model", ModelPath,
                    "--maxsec", options.MaxSeconds.ToString(CultureInfo.InvariantCulture),
                };
                if (options.Vad)
                {
                    arguments.Add("--vad");
                    arguments.Add("--silence");
                    arguments.Add(options.SilenceSeconds.ToString(CultureInfo.InvariantCulture));
                }
                foreach (var argument in arguments) startInfo.ArgumentList.Add(argument);
                try
                {
                    Process.Start(startInfo);
                    _recording = true;
                    _slot = slot;
                    _sessionId = sessionId;
                    _tty = tty;
                    _options = options;
                    _onTranscript = onTranscript;
                    return true;
                }
                catch (Exception ex)
                {
                    PluginLog.Warning(ex, "Vizhi could not launch the voice helper");
                    return false;
                }
        }

        public static void Stop()
        {
            lock (Sync)
            {
                if (!_recording || _transcribing) return;
                _recording = false;
                try
                {
                    File.WriteAllText(StopPath, String.Empty);
                    VizhiPrivateFiles.EnsurePrivateFile(StopPath);
                }
                catch (Exception ex)
                {
                    PluginLog.Warning(ex, "Vizhi could not stop voice capture");
                    ResetTurnLocked();
                    return;
                }
                BeginTranscriptWatchLocked();
            }
        }

        private static void BeginTranscriptWatchLocked()
        {
            var slot = _slot;
            var sessionId = _sessionId;
            var tty = _tty;
            var waitSeconds = _options?.TranscriptWaitSeconds ?? 30;
            var onTranscript = _onTranscript;
            _transcribing = true;
            new Thread(() => ReadTranscript(slot, sessionId, tty, waitSeconds, onTranscript))
            {
                IsBackground = true,
                Name = "vizhi-voice-transcript",
            }.Start();
        }

        private static void ResetTurnLocked()
        {
            _recording = false;
            _transcribing = false;
            _slot = 0;
            _sessionId = null;
            _tty = null;
            _options = null;
            _onTranscript = null;
        }

        private static void FinishTurn()
        {
            lock (Sync)
            {
                ResetTurnLocked();
            }
        }

        private static void ReadTranscript(Int32 slot, String sessionId, String tty, Int32 waitSeconds, Action<String> onTranscript)
        {
            var deadline = DateTime.UtcNow.AddSeconds(waitSeconds);
            while (DateTime.UtcNow < deadline)
            {
                Thread.Sleep(150);
                if (!File.Exists(TranscriptPath)) continue;
                try
                {
                    var transcript = File.ReadAllText(TranscriptPath).Trim();
                    TryDelete(TranscriptPath);
                    TryDelete(RecordingPath);
                    TryDelete(StopPath);
                    FinishTurn();
                    if (onTranscript != null) onTranscript(transcript);
                    else if (!String.IsNullOrWhiteSpace(transcript)) DeliverOneShot(slot, sessionId, tty, transcript);
                    return;
                }
                catch (IOException)
                {
                }
                catch (Exception ex)
                {
                    PluginLog.Warning(ex, "Vizhi could not read the voice transcript");
                    FinishTurn();
                    onTranscript?.Invoke(null);
                    return;
                }
            }
            PluginLog.Warning("Vizhi voice transcription timed out");
            FinishTurn();
            onTranscript?.Invoke(null);
        }

        private static void DeliverOneShot(Int32 slot, String sessionId, String tty, String transcript)
        {
            if (VizhiRuntime.HasPendingScreenshotDraft(sessionId)) VizhiRuntime.WritePinnedVoiceAction(slot, sessionId, transcript);
            else PasteTranscript(tty, transcript);
        }

        private static ToolResult RunTool(String path, IEnumerable<String> arguments, Int32 timeoutMilliseconds)
        {
            var startInfo = new ProcessStartInfo(path)
            {
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            foreach (var argument in arguments) startInfo.ArgumentList.Add(argument);
            using var process = Process.Start(startInfo);
            if (process == null) throw new InvalidOperationException($"Vizhi could not start {Path.GetFileName(path)}.");

            var standardOutputTask = process.StandardOutput.ReadToEndAsync();
            var standardErrorTask = process.StandardError.ReadToEndAsync();
            if (!process.WaitForExit(timeoutMilliseconds))
            {
                try
                {
                    process.Kill(true);
                    process.WaitForExit();
                }
                catch { }
                throw new TimeoutException($"Vizhi timed out while running {Path.GetFileName(path)}.");
            }
            if (!Task.WaitAll(new Task[] { standardOutputTask, standardErrorTask }, timeoutMilliseconds))
            {
                throw new TimeoutException($"Vizhi timed out while reading {Path.GetFileName(path)} output.");
            }

            var result = new ToolResult(standardOutputTask.GetAwaiter().GetResult(), standardErrorTask.GetAwaiter().GetResult(), process.ExitCode);
            if (result.ExitCode != 0)
            {
                var error = result.StandardError.Trim();
                if (String.IsNullOrWhiteSpace(error)) error = result.StandardOutput.Trim();
                throw new InvalidOperationException($"{Path.GetFileName(path)} failed: {error}");
            }
            return result;
        }

        private static void TryDelete(String path)
        {
            try
            {
                if (File.Exists(path)) File.Delete(path);
            }
            catch (Exception ex)
            {
                PluginLog.Warning(ex, $"Vizhi could not clear {path}");
            }
        }

        private static void PasteTranscript(String tty, String transcript)
        {
            if (String.IsNullOrWhiteSpace(tty))
            {
                PluginLog.Warning("Vizhi cannot deliver voice text because the selected session has no terminal TTY");
                return;
            }
            var script = """
on run argv
set targetTty to item 1 of argv
set transcriptText to item 2 of argv
tell application "Terminal"
activate
repeat with terminalWindow in windows
repeat with terminalTab in tabs of terminalWindow
set tabTty to (tty of terminalTab as text)
if tabTty is targetTty then
set selected tab of terminalWindow to terminalTab
set index of terminalWindow to 1
set the clipboard to transcriptText
tell application "System Events"
keystroke "v" using command down
key code 36
end tell
return
end if
end repeat
end repeat
end tell
error "Vizhi could not find terminal tab for " & targetTty
end run
""";
            try
            {
                var startInfo = new ProcessStartInfo("/usr/bin/osascript") { UseShellExecute = false, RedirectStandardError = true };
                startInfo.ArgumentList.Add("-e");
                startInfo.ArgumentList.Add(script);
                startInfo.ArgumentList.Add(tty);
                startInfo.ArgumentList.Add(transcript.Replace("\r", " ").Replace("\n", " "));
                using var process = Process.Start(startInfo);
                if (process == null || !process.WaitForExit(15000))
                {
                    try { process?.Kill(); } catch { }
                    PluginLog.Warning("Vizhi voice delivery timed out");
                    return;
                }
                var error = process.StandardError.ReadToEnd().Trim();
                if (process.ExitCode != 0) PluginLog.Warning($"Vizhi voice delivery failed: {error}");
            }
            catch (Exception ex)
            {
                PluginLog.Warning(ex, "Vizhi could not deliver the voice transcript");
            }
        }

        private sealed class ToolResult
        {
            public ToolResult(String standardOutput, String standardError, Int32 exitCode)
            {
                this.StandardOutput = standardOutput ?? String.Empty;
                this.StandardError = standardError ?? String.Empty;
                this.ExitCode = exitCode;
            }

            public String StandardOutput { get; }
            public String StandardError { get; }
            public Int32 ExitCode { get; }
        }
    }
}
