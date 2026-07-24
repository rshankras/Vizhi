namespace Loupedeck.VizhiPlugin
{
    using System;
    using System.Text.RegularExpressions;

    // Mirrors summarizeForSpeech in src/voice-intents.ts: bounded, code-free spoken
    // renditions of an assistant message for local text-to-speech.
    internal static class SpokenSummary
    {
        internal static String Summarize(String text, Int32 maxChars)
        {
            if (String.IsNullOrWhiteSpace(text)) return String.Empty;
            var hadCode = text.Contains("```", StringComparison.Ordinal);
            var cleaned = text;
            cleaned = Regex.Replace(cleaned, "```[\\s\\S]*?(```|$)", " ");
            cleaned = Regex.Replace(cleaned, "`([^`]*)`", "$1");
            cleaned = Regex.Replace(cleaned, "\\[([^\\]]*)\\]\\([^)]*\\)", "$1");
            cleaned = Regex.Replace(cleaned, "https?://\\S+", "a link");
            cleaned = Regex.Replace(cleaned, "^[\\s#>|*+-]+", " ", RegexOptions.Multiline);
            cleaned = Regex.Replace(cleaned, "[*_~#|]+", " ");
            cleaned = Regex.Replace(cleaned, "\\s+", " ").Trim();
            if (cleaned.Length == 0) return hadCode ? "The answer is code; it's on screen." : String.Empty;

            var summary = String.Empty;
            foreach (Match sentence in Regex.Matches(cleaned, "[^.!?]+[.!?]+(\\s+|$)|[^.!?]+$"))
            {
                var candidate = summary.Length == 0 ? sentence.Value.Trim() : $"{summary} {sentence.Value.Trim()}";
                if (summary.Length > 0 && candidate.Length > maxChars) break;
                summary = candidate;
                if (summary.Length > maxChars) break;
            }
            if (summary.Length > maxChars)
            {
                var slice = summary.Substring(0, maxChars);
                var wordEnd = slice.LastIndexOf(' ');
                summary = $"{slice.Substring(0, wordEnd > 0 ? wordEnd : maxChars).TrimEnd()}…";
            }
            if (summary.Length < cleaned.Length) return $"{EndSentence(summary)} There's more on screen.";
            return hadCode ? $"{EndSentence(summary)} Code is on screen." : summary;
        }

        private static String EndSentence(String value)
            => Regex.IsMatch(value, "[.!?…]$") ? value : $"{value}.";
    }
}
