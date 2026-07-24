namespace Loupedeck.VizhiPlugin
{
    using System;
    using System.Diagnostics;
    using System.IO;
    using System.Threading;

    // On-demand answer summarization through a headless, ephemeral `codex exec` run.
    // --ignore-user-config keeps hooks and MCP servers out of the call; --ephemeral
    // keeps it off the resume list; the isolated VIZHI_IPC_ROOT is belt and braces.
    internal static class VizhiCodexSummarizer
    {
        private const Int32 TimeoutMilliseconds = 25_000;
        private static readonly String[] CodexCandidates =
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "bin", "codex"),
            "/opt/homebrew/bin/codex",
            "/usr/local/bin/codex",
        };
        private static Int32 _running;

        internal static void Summarize(String text, Action<String> onResult)
        {
            var finished = onResult ?? (_ => { });
            var trimmed = text?.Trim() ?? String.Empty;
            if (trimmed.Length == 0 || Interlocked.CompareExchange(ref _running, 1, 0) != 0)
            {
                finished(null);
                return;
            }
            new Thread(() =>
            {
                try
                {
                    finished(Run(trimmed));
                }
                catch (Exception ex)
                {
                    PluginLog.Warning(ex, "Vizhi could not summarize with Codex");
                    finished(null);
                }
                finally
                {
                    Interlocked.Exchange(ref _running, 0);
                }
            }) { IsBackground = true, Name = "vizhi-summarizer" }.Start();
        }

        private static String Run(String text)
        {
            var codexPath = Array.Find(CodexCandidates, File.Exists);
            if (codexPath == null)
            {
                PluginLog.Warning("Vizhi could not find the codex binary for summarization");
                return null;
            }
            var outputPath = Path.Combine(Path.GetTempPath(), $"vizhi-summary-{Guid.NewGuid():N}.txt");
            try
            {
                var startInfo = new ProcessStartInfo(codexPath) { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
                foreach (var argument in new[]
                {
                    "exec", "--ephemeral", "--ignore-user-config", "--skip-git-repo-check",
                    "-s", "read-only", "-c", "model_reasoning_effort=low", "-C", Path.GetTempPath(),
                    "-o", outputPath,
                    $"Summarize the following coding-assistant answer in at most two short spoken sentences for text-to-speech. Reply with only the summary. ANSWER: {text}",
                }) startInfo.ArgumentList.Add(argument);
                startInfo.Environment["VIZHI_IPC_ROOT"] = Path.Combine(Path.GetTempPath(), "vizhi-summarizer");
                using var process = Process.Start(startInfo);
                if (process == null) return null;
                process.StandardOutput.ReadToEndAsync();
                process.StandardError.ReadToEndAsync();
                if (!process.WaitForExit(TimeoutMilliseconds))
                {
                    try
                    {
                        process.Kill(true);
                    }
                    catch
                    {
                    }
                    PluginLog.Warning("Vizhi summarization timed out");
                    return null;
                }
                if (!File.Exists(outputPath)) return null;
                var summary = File.ReadAllText(outputPath).Trim();
                return summary.Length > 0 ? summary : null;
            }
            finally
            {
                try
                {
                    if (File.Exists(outputPath)) File.Delete(outputPath);
                }
                catch
                {
                }
            }
        }
    }
}
