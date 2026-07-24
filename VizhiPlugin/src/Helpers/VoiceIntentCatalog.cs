namespace Loupedeck.VizhiPlugin
{
    using System;
    using System.Collections.Generic;
    using System.Text;

    internal sealed class VoiceIntentDefinition
    {
        public VoiceIntentDefinition(String id, params String[] phrases)
        {
            this.Id = id;
            this.Phrases = phrases;
        }

        public String Id { get; }
        public String[] Phrases { get; }
    }

    internal sealed class VoiceIntent
    {
        public VoiceIntent(String id, Int32 slot, String promptText)
        {
            this.Id = id;
            this.Slot = slot;
            this.PromptText = promptText;
        }

        public String Id { get; }
        public Int32 Slot { get; }
        public String PromptText { get; }
    }

    internal static class VoiceIntentCatalog
    {
        internal const String FocusSessionIntentId = "focus_session";
        internal const String PromptIntentId = "prompt";

        private static readonly VoiceIntentDefinition[] Definitions = new[]
        {
            new VoiceIntentDefinition("approve", "yes", "yeah", "yep", "approve", "approved", "go ahead", "do it"),
            new VoiceIntentDefinition("deny", "no", "nope", "deny", "denied", "don't", "stop that"),
            new VoiceIntentDefinition("confirm_approve", "confirm approve", "confirm"),
            new VoiceIntentDefinition("status", "status", "status report", "what's happening", "what needs me"),
            new VoiceIntentDefinition("focus_session", "switch to session", "focus session", "go to session", "session"),
            new VoiceIntentDefinition("screenshot", "take a screenshot", "screenshot"),
            new VoiceIntentDefinition("mute", "mute"),
            new VoiceIntentDefinition("end_conversation", "end conversation", "stop listening", "goodbye"),
        };

        private static readonly Dictionary<String, Int32> SessionNumberWords = new Dictionary<String, Int32>(StringComparer.Ordinal)
        {
            { "one", 1 },
            { "two", 2 },
            { "three", 3 },
            { "four", 4 },
            { "five", 5 },
            { "six", 6 },
        };

        internal const String ConfirmPhrase = "confirm approve";
        internal const Int32 MaxEmptyTurns = 2;
        internal const Double SilenceSeconds = 1.5;
        internal const Int32 TurnMaxSeconds = 60;
        internal const Int32 IdleTimeoutMinutes = 10;

        internal static VoiceIntent Parse(String text)
        {
            var utterance = Normalize(text);
            if (utterance.Length == 0) return new VoiceIntent(PromptIntentId, 0, String.Empty);

            foreach (var definition in Definitions)
            {
                if (String.Equals(definition.Id, FocusSessionIntentId, StringComparison.Ordinal)) continue;
                foreach (var phrase in definition.Phrases)
                {
                    if (String.Equals(Normalize(phrase), utterance, StringComparison.Ordinal))
                    {
                        return new VoiceIntent(definition.Id, 0, String.Empty);
                    }
                }
            }

            foreach (var definition in Definitions)
            {
                if (!String.Equals(definition.Id, FocusSessionIntentId, StringComparison.Ordinal)) continue;
                foreach (var prefix in definition.Phrases)
                {
                    var normalizedPrefix = Normalize(prefix) + " ";
                    if (!utterance.StartsWith(normalizedPrefix, StringComparison.Ordinal)) continue;
                    var slot = ParseSessionNumber(utterance.Substring(normalizedPrefix.Length));
                    if (slot > 0) return new VoiceIntent(FocusSessionIntentId, slot, String.Empty);
                }
            }

            return new VoiceIntent(PromptIntentId, 0, (text ?? String.Empty).Trim());
        }

        internal static Boolean ApprovalRequiresConfirmation(String intentId, Boolean isHighRisk)
            => String.Equals(intentId, "approve", StringComparison.Ordinal) && isHighRisk;

        internal static String Normalize(String text)
        {
            if (String.IsNullOrEmpty(text)) return String.Empty;
            var builder = new StringBuilder(text.Length);
            var pendingSpace = false;
            foreach (var rawCharacter in text.ToLowerInvariant())
            {
                if (rawCharacter == '\'' || rawCharacter == '’') continue;
                var isWordCharacter = (rawCharacter >= 'a' && rawCharacter <= 'z') || (rawCharacter >= '0' && rawCharacter <= '9');
                if (!isWordCharacter)
                {
                    pendingSpace = builder.Length > 0;
                    continue;
                }
                if (pendingSpace)
                {
                    builder.Append(' ');
                    pendingSpace = false;
                }
                builder.Append(rawCharacter);
            }
            return builder.ToString();
        }

        private static Int32 ParseSessionNumber(String value)
        {
            if (SessionNumberWords.TryGetValue(value, out var fromWord)) return fromWord;
            return value.Length == 1 && value[0] >= '1' && value[0] <= '6' ? value[0] - '0' : 0;
        }
    }
}
