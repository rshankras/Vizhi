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
            var value = text;
            value = Regex.Replace(value, "```[\\s\\S]*?(```|$)", " ");
            value = Regex.Replace(value, "`([^`]*)`", "$1");
            value = Regex.Replace(value, "\\[([^\\]]*)\\]\\([^)]*\\)", "$1");
            value = Regex.Replace(value, "https?://\\S+", "a link");
            value = Regex.Replace(value, "^[\\s#>|*+-]+", " ", RegexOptions.Multiline);
            value = Regex.Replace(value, "[*_~#|]+", " ");
            value = Regex.Replace(value, "\\s+", " ").Trim();
            if (value.Length == 0) return hadCode ? "The answer is code; it's on screen." : String.Empty;
            if (value.Length > maxChars)
            {
                var slice = value.Substring(0, maxChars);
                var sentenceEnd = Math.Max(slice.LastIndexOf(". ", StringComparison.Ordinal), Math.Max(slice.LastIndexOf("! ", StringComparison.Ordinal), slice.LastIndexOf("? ", StringComparison.Ordinal)));
                var wordEnd = slice.LastIndexOf(' ');
                value = sentenceEnd > maxChars * 0.4
                    ? slice.Substring(0, sentenceEnd + 1)
                    : $"{slice.Substring(0, wordEnd > 0 ? wordEnd : maxChars).TrimEnd()}…";
                return $"{value} More on screen.";
            }
            return hadCode ? $"{value} Code is on screen." : value;
        }
    }
}
