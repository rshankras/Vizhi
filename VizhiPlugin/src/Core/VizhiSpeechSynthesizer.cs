namespace Loupedeck.VizhiPlugin
{
    using System;
    using System.Diagnostics;
    using System.IO;
    using System.Text;

    internal static class VizhiSpeechSynthesizer
    {
        private const String SayPath = "/usr/bin/say";
        private const Int32 MaxUtteranceLength = 400;
        private static readonly Object Sync = new Object();
        private static Process _current;

        internal static Boolean IsAvailable => OperatingSystem.IsMacOS() && File.Exists(SayPath);

        internal static void Speak(String text, Action onFinished)
        {
            var utterance = Sanitize(text);
            var finished = onFinished ?? (() => { });
            if (utterance.Length == 0)
            {
                finished();
                return;
            }

            var started = false;
            lock (Sync)
            {
                CancelLocked();
                if (IsAvailable)
                {
                    try
                    {
                        var startInfo = new ProcessStartInfo(SayPath) { UseShellExecute = false };
                        startInfo.ArgumentList.Add(utterance);
                        var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
                        process.Exited += (_, _) =>
                        {
                            lock (Sync)
                            {
                                if (ReferenceEquals(_current, process)) _current = null;
                            }
                            try
                            {
                                if (process.ExitCode != 0) PluginLog.Verbose($"Vizhi speech ended with exit code {process.ExitCode}");
                                process.Dispose();
                            }
                            catch
                            {
                            }
                            finished();
                        };
                        process.Start();
                        _current = process;
                        started = true;
                    }
                    catch (Exception ex)
                    {
                        PluginLog.Warning(ex, "Vizhi could not speak an announcement");
                        _current = null;
                    }
                }
            }

            if (started) return;
            VizhiVoiceRuntime.Notify(utterance);
            finished();
        }

        internal static void Cancel()
        {
            lock (Sync)
            {
                CancelLocked();
            }
        }

        internal static void PlayCue()
        {
            const String cueSoundPath = "/System/Library/Sounds/Pop.aiff";
            if (!OperatingSystem.IsMacOS() || !File.Exists(cueSoundPath)) return;
            try
            {
                var startInfo = new ProcessStartInfo("/usr/bin/afplay") { UseShellExecute = false };
                startInfo.ArgumentList.Add(cueSoundPath);
                using var process = Process.Start(startInfo);
            }
            catch (Exception ex)
            {
                PluginLog.Verbose(ex, "Vizhi could not play a confirmation cue");
            }
        }

        private static void CancelLocked()
        {
            var process = _current;
            _current = null;
            if (process == null) return;
            try
            {
                if (!process.HasExited) process.Kill(true);
            }
            catch (Exception ex)
            {
                PluginLog.Verbose(ex, "Vizhi could not cancel an in-flight announcement");
            }
        }

        private static String Sanitize(String text)
        {
            if (String.IsNullOrWhiteSpace(text)) return String.Empty;
            var builder = new StringBuilder(Math.Min(text.Length, MaxUtteranceLength));
            var pendingSpace = false;
            foreach (var character in text.Trim())
            {
                if (builder.Length >= MaxUtteranceLength) break;
                if (Char.IsControl(character) || character == '\r' || character == '\n')
                {
                    pendingSpace = builder.Length > 0;
                    continue;
                }
                if (pendingSpace)
                {
                    builder.Append(' ');
                    pendingSpace = false;
                }
                builder.Append(character);
            }
            return builder.ToString();
        }
    }
}
