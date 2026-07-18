namespace Loupedeck.VizhiPlugin
{
    using System;
    using System.Collections.Generic;
    using System.IO;
    using System.Text.Json;

    internal sealed class TemplateDefinition
    {
        public TemplateDefinition(String id, String label, String group, String icon, String description)
        {
            this.Id = id;
            this.Label = label;
            this.Group = group;
            this.Icon = icon;
            this.Description = description;
        }

        public String Id { get; }
        public String Label { get; }
        public String Group { get; }
        public String Icon { get; }
        public String Description { get; }
    }

    internal static class TemplateCatalog
    {
        private static readonly Object Sync = new Object();
        private static readonly TemplateDefinition[] Definitions = new[]
        {
            new TemplateDefinition("fix_bug", "Fix Bug", "Vizhi Prompts", "fixbug", "Ask Codex to diagnose and safely fix the current or described bug."),
            new TemplateDefinition("write_tests", "Write Tests", "Vizhi Prompts", "tests", "Ask Codex to add focused test coverage for the current code or change."),
            new TemplateDefinition("explain", "Explain", "Vizhi Prompts", "explain", "Ask Codex to explain the current work, important decisions, risks, and next step."),
            new TemplateDefinition("refactor", "Refactor", "Vizhi Prompts", "refactor", "Ask Codex to improve code structure while preserving behavior."),
            new TemplateDefinition("review", "Review", "Vizhi Prompts", "review", "Ask Codex to review current changes for defects, risks, and missing tests."),
            new TemplateDefinition("security", "Security", "Vizhi Prompts", "security", "Ask Codex to identify security risks and recommend concrete fixes."),
            new TemplateDefinition("plan", "Plan", "Vizhi Prompts", "plan", "Ask Codex to explore the task and propose a plan before editing files."),
            new TemplateDefinition("handoff", "Handoff", "Vizhi Prompts", "handoff", "Ask Codex to summarize progress and exact next steps for a new session."),
            new TemplateDefinition("safe_revert", "Safe Revert", "Vizhi Prompts", "revert", "Ask Codex to explain a safe rollback before changing any files."),
            new TemplateDefinition("commit", "Commit", "Vizhi Git", "commit", "Ask Codex to validate the changes and create a conventional commit when ready."),
            new TemplateDefinition("diff", "Diff", "Vizhi Git", "diff", "Ask Codex to summarize the current Git diff, risks, and missing validation."),
            new TemplateDefinition("push", "Push", "Vizhi Git", "push", "Ask Codex to safely push the current branch without rewriting remote history."),
            new TemplateDefinition("create_pr", "Create PR", "Vizhi Git", "createpr", "Ask Codex to prepare the branch and create a pull request when supported."),
            new TemplateDefinition("status", "Status", "Vizhi Git", "status", "Ask Codex to summarize Git status and recommend the best next action."),
            new TemplateDefinition("log", "Git Log", "Vizhi Git", "gitlog", "Ask Codex to inspect recent Git history relevant to the current work."),
        };
        private static Dictionary<String, String> _cachedLabels = new Dictionary<String, String>(StringComparer.Ordinal);
        private static String _cachedPath;
        private static DateTime _cachedModifiedAt;
        private static String _cachedFavoriteId = "review";

        internal static IEnumerable<TemplateDefinition> All => Definitions;

        internal static Boolean TryGet(String id, out TemplateDefinition definition)
        {
            foreach (var candidate in Definitions)
            {
                if (String.Equals(candidate.Id, id, StringComparison.Ordinal))
                {
                    definition = candidate;
                    return true;
                }
            }

            definition = null;
            return false;
        }

        internal static String GetLabel(String id)
        {
            if (!TryGet(id, out var definition)) return "Prompt";
            var labels = GetLabels();
            return labels.TryGetValue(id, out var label) ? label : definition.Label;
        }

        internal static TemplateDefinition Favorite
        {
            get
            {
                GetLabels();
                return TryGet(_cachedFavoriteId, out var definition)
                    ? definition
                    : Definitions[4];
            }
        }

        internal static String GetFavoriteLabel()
        {
            var favorite = Favorite;
            return GetLabel(favorite.Id);
        }

        private static Dictionary<String, String> GetLabels()
        {
            var path = Environment.GetEnvironmentVariable("VIZHI_PROMPT_TEMPLATE_PATH")
                ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".vizhi", "prompt-templates.json");
            var modifiedAt = File.Exists(path) ? File.GetLastWriteTimeUtc(path) : DateTime.MinValue;
            lock (Sync)
            {
                if (String.Equals(path, _cachedPath, StringComparison.Ordinal) && modifiedAt == _cachedModifiedAt) return _cachedLabels;
                _cachedPath = path;
                _cachedModifiedAt = modifiedAt;
                _cachedLabels = ReadLabels(path, out _cachedFavoriteId);
                return _cachedLabels;
            }
        }

        private static Dictionary<String, String> ReadLabels(String path, out String favoriteId)
        {
            var labels = new Dictionary<String, String>(StringComparer.Ordinal);
            favoriteId = "review";
            try
            {
                using var document = JsonDocument.Parse(File.ReadAllText(path));
                if (document.RootElement.TryGetProperty("templates", out var templates) && templates.ValueKind == JsonValueKind.Object)
                {
                    foreach (var definition in Definitions)
                    {
                        if (templates.TryGetProperty(definition.Id, out var template)
                            && template.ValueKind == JsonValueKind.Object
                            && template.TryGetProperty("label", out var label)
                            && label.ValueKind == JsonValueKind.String)
                        {
                            AddLabel(labels, definition.Id, label.GetString());
                        }
                    }
                    if (document.RootElement.TryGetProperty("favorite_template_id", out var favorite)
                        && favorite.ValueKind == JsonValueKind.String
                        && TryGet(favorite.GetString(), out var favoriteDefinition))
                    {
                        favoriteId = favoriteDefinition.Id;
                    }
                    return labels;
                }
                AddLabel(labels, "review", GetString(document.RootElement, "label"));
            }
            catch
            {
                if (String.Equals(path, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".vizhi", "prompt-templates.json"), StringComparison.Ordinal))
                {
                    ReadLegacyReviewLabel(labels);
                }
            }
            return labels;
        }

        private static void ReadLegacyReviewLabel(Dictionary<String, String> labels)
        {
            try
            {
                var legacyPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".vizhi", "prompt-template.json");
                using var document = JsonDocument.Parse(File.ReadAllText(legacyPath));
                AddLabel(labels, "review", GetString(document.RootElement, "label"));
            }
            catch
            {
            }
        }

        private static String GetString(JsonElement element, String property)
            => element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

        private static void AddLabel(Dictionary<String, String> labels, String id, String label)
        {
            var value = label?.Trim();
            if (String.IsNullOrEmpty(value)) return;
            labels[id] = value.Length <= 12 ? value : value.Substring(0, 12);
        }
    }
}
