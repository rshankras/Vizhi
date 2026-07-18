namespace Loupedeck.VizhiPlugin
{
    using System;
    using System.Diagnostics;
    using System.IO;
    using System.Threading;

    internal static class VizhiVoiceRuntime
    {
        private static readonly String RuntimePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".vizhi", "voice");
        private static readonly String HelperPath = Path.Combine(RuntimePath, "VizhiVoiceHelper.app");
        private static readonly String ModelPath = Path.Combine(RuntimePath, "models", "ggml-base.en.bin");
        private static readonly String TemporaryPath = Path.Combine(RuntimePath, "tmp");
        private static readonly String RecordingPath = Path.Combine(TemporaryPath, "recording.wav");
        private static readonly String StopPath = Path.Combine(TemporaryPath, "recording.stop");
        private static readonly String TranscriptPath = Path.Combine(TemporaryPath, "transcript.txt");
        private static readonly String LegacyRecordingPath = Path.Combine(Path.GetTempPath(), "vizhi-voice.wav");
        private static readonly String LegacyStopPath = Path.Combine(Path.GetTempPath(), "vizhi-voice.stop");
        private static readonly String LegacyTranscriptPath = Path.Combine(Path.GetTempPath(), "vizhi-voice-transcript.txt");
        private static readonly Object Sync = new Object();
        private static Boolean _recording;
        private static Int32 _slot;
        private static String _sessionId;
        private static String _tty;

        public static Boolean Start(Int32 slot)
        {
            if (!OperatingSystem.IsMacOS()) return false;
            lock (Sync)
            {
                if (_recording) return false;
                var session = VizhiRuntime.GetSlot(slot);
                var tty = VizhiRuntime.GetSlotTty(slot);
                if (!session.IsOccupied || String.IsNullOrWhiteSpace(tty)) return false;
                return BeginRecording(slot, session.SessionId, tty);
            }
        }

        private static Boolean BeginRecording(Int32 slot, String sessionId, String tty)
        {
                if (!Directory.Exists(HelperPath))
                {
                    PluginLog.Warning($"Vizhi voice helper is missing at {HelperPath}. Run tools/voice/build.sh.");
                    return false;
                }
                if (!File.Exists(ModelPath))
                {
                    PluginLog.Warning($"Vizhi Whisper model is missing at {ModelPath}. Run tools/voice/download-model.sh.");
                    return false;
                }

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
                foreach (var argument in new[]
                {
                    HelperPath, "--args", "--out", RecordingPath, "--stopflag", StopPath,
                    "--transcript", TranscriptPath, "--model", ModelPath, "--maxsec", "60",
                }) startInfo.ArgumentList.Add(argument);
                try
                {
                    Process.Start(startInfo);
                    _recording = true;
                    _slot = slot;
                    _sessionId = sessionId;
                    _tty = tty;
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
            Int32 slot;
            String sessionId;
            String tty;
            lock (Sync)
            {
                if (!_recording) return;
                _recording = false;
                slot = _slot;
                sessionId = _sessionId;
                tty = _tty;
                _slot = 0;
                _sessionId = null;
                _tty = null;
            }
            try
            {
                File.WriteAllText(StopPath, String.Empty);
                VizhiPrivateFiles.EnsurePrivateFile(StopPath);
            }
            catch (Exception ex)
            {
                PluginLog.Warning(ex, "Vizhi could not stop voice capture");
                return;
            }
            new Thread(() => ReadTranscript(slot, sessionId, tty)) { IsBackground = true, Name = "vizhi-voice-transcript" }.Start();
        }

        private static void ReadTranscript(Int32 slot, String sessionId, String tty)
        {
            var deadline = DateTime.UtcNow.AddSeconds(30);
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
                    if (!String.IsNullOrWhiteSpace(transcript))
                    {
                        if (VizhiRuntime.HasPendingScreenshotDraft(sessionId)) VizhiRuntime.WritePinnedVoiceAction(slot, sessionId, transcript);
                        else PasteTranscript(tty, transcript);
                    }
                    return;
                }
                catch (IOException)
                {
                }
                catch (Exception ex)
                {
                    PluginLog.Warning(ex, "Vizhi could not read the voice transcript");
                    return;
                }
            }
            PluginLog.Warning("Vizhi voice transcription timed out");
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
    }
}
