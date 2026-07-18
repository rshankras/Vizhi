namespace Loupedeck.VizhiPlugin
{
    using System;
    using System.Collections.Generic;
    using System.IO;
    using System.Text.Json;

    internal sealed class TemplateDefinition
    {
        public TemplateDefinition(String id, String label, String group, String icon, String description, String prompt)
        {
            this.Id = id;
            this.Label = label;
            this.Group = group;
            this.Icon = icon;
            this.Description = description;
            this.Prompt = prompt;
        }

        public String Id { get; }
        public String Label { get; }
        public String Group { get; }
        public String Icon { get; }
        public String Description { get; }
        public String Prompt { get; }
    }

    internal static class TemplateCatalog
    {
        private static readonly Object Sync = new Object();
        private static readonly TemplateDefinition[] Definitions = new[]
        {
            new TemplateDefinition("fix_bug", "Fix Bug", "Vizhi Prompts", "fixbug", "Ask Codex to diagnose and safely fix the current or described bug.", "Investigate the current or described bug. Identify the root cause, implement the smallest safe fix, add focused regression coverage when appropriate, and run the most relevant validation."),
            new TemplateDefinition("write_tests", "Write Tests", "Vizhi Prompts", "tests", "Ask Codex to add focused test coverage for the current code or change.", "Identify the highest-value missing test coverage for the current code or change. Add focused tests that protect the behavior, then run the relevant test command and summarize the result."),
            new TemplateDefinition("explain", "Explain", "Vizhi Prompts", "explain", "Ask Codex to explain the current work, important decisions, risks, and next step.", "Explain the current code, task, or recent changes clearly: describe the main flow, important decisions, risks, and the most useful next step. Keep the explanation concise and grounded in the repository."),
            new TemplateDefinition("refactor", "Refactor", "Vizhi Prompts", "refactor", "Ask Codex to improve code structure while preserving behavior.", "Identify a safe, high-value refactoring opportunity in the current code. Preserve behavior, keep the change focused, update or add tests where needed, and run the relevant validation."),
            new TemplateDefinition("review", "Review", "Vizhi Prompts", "review", "Ask Codex to review current changes for defects, risks, and missing tests.", "Review the current changes for correctness, regressions, security concerns, and missing tests. Summarize findings in priority order, then recommend the highest-priority next step."),
            new TemplateDefinition("security", "Security", "Vizhi Prompts", "security", "Ask Codex to identify security risks and recommend concrete fixes.", "Review the relevant code and current changes for security issues, including secrets exposure, unsafe input handling, authorization gaps, dangerous commands, and data loss risks. Prioritize concrete findings with evidence and recommend fixes."),
            new TemplateDefinition("plan", "Plan", "Vizhi Prompts", "plan", "Ask Codex to explore the task and propose a plan before editing files.", "Explore the relevant repository and task first. Propose a concise, numbered implementation plan with risks, affected files, and focused validation. Do not modify files or run destructive commands until I approve the plan."),
            new TemplateDefinition("handoff", "Handoff", "Vizhi Prompts", "handoff", "Ask Codex to summarize progress and exact next steps for a new session.", "Create a concise handoff for another Codex session: goal, current state, files changed, important decisions, commands or tests run, blockers, and the exact next steps. Do not modify product files. Make it ready to paste into a new session."),
            new TemplateDefinition("safe_revert", "Safe Revert", "Vizhi Prompts", "revert", "Ask Codex to explain a safe rollback before changing any files.", "Inspect git status and the current diff. Do not modify files yet. Explain exactly what would be reverted, including any staged or untracked work at risk, and wait for my explicit confirmation before using restore, reset, checkout, clean, or any other destructive command."),
            new TemplateDefinition("commit", "Commit", "Vizhi Git", "commit", "Ask Codex to validate the changes and create a conventional commit when ready.", "Review the current git diff and test status. If the changes are coherent and ready, create a concise conventional commit with an accurate message; otherwise explain what must be resolved first. Report the resulting commit hash if one is created."),
            new TemplateDefinition("diff", "Diff", "Vizhi Git", "diff", "Ask Codex to summarize the current Git diff, risks, and missing validation.", "Inspect the current git diff and summarize the behavioral changes, likely risks, and any missing pieces or validation. Keep the summary concise and actionable."),
            new TemplateDefinition("push", "Push", "Vizhi Git", "push", "Ask Codex to safely push the current branch without rewriting remote history.", "Check the current branch, remote, git status, and recent commits. Push the current branch only when it is safe to do so; never force-push or alter remote history without explicit confirmation. Summarize the result."),
            new TemplateDefinition("create_pr", "Create PR", "Vizhi Git", "createpr", "Ask Codex to prepare the branch and create a pull request when supported.", "Prepare the current branch for a pull request: review the diff and test status, identify the appropriate base branch, then create a concise PR title and body if the repository tooling and state support it. Summarize the PR link or the blocker."),
            new TemplateDefinition("status", "Status", "Vizhi Git", "status", "Ask Codex to summarize Git status and recommend the best next action.", "Inspect git status, staged and untracked files, and the current branch. Summarize what has changed and recommend the most useful next action."),
            new TemplateDefinition("log", "Git Log", "Vizhi Git", "gitlog", "Ask Codex to inspect recent Git history relevant to the current work.", "Inspect recent git history and summarize the commits most relevant to the current work, including notable changes, context, and anything that may affect the next step."),
        };
        private static Dictionary<String, String> _cachedLabels = new Dictionary<String, String>(StringComparer.Ordinal);
        private static Dictionary<String, String> _cachedPrompts = new Dictionary<String, String>(StringComparer.Ordinal);
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

        internal static String GetPrompt(String id)
        {
            if (!TryGet(id, out var definition)) definition = Definitions[4];
            GetLabels();
            return _cachedPrompts.TryGetValue(definition.Id, out var prompt) ? prompt : definition.Prompt;
        }

        internal static String GetFavoritePrompt() => GetPrompt(Favorite.Id);

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
                _cachedLabels = ReadLabels(path, out _cachedFavoriteId, out _cachedPrompts);
                return _cachedLabels;
            }
        }

        private static Dictionary<String, String> ReadLabels(String path, out String favoriteId, out Dictionary<String, String> prompts)
        {
            var labels = new Dictionary<String, String>(StringComparer.Ordinal);
            prompts = new Dictionary<String, String>(StringComparer.Ordinal);
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
                        if (templates.TryGetProperty(definition.Id, out template)
                            && template.ValueKind == JsonValueKind.Object
                            && template.TryGetProperty("prompt", out var prompt)
                            && prompt.ValueKind == JsonValueKind.String)
                        {
                            AddPrompt(prompts, definition.Id, prompt.GetString());
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
                AddPrompt(prompts, "review", GetString(document.RootElement, "prompt"));
            }
            catch
            {
                if (String.Equals(path, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".vizhi", "prompt-templates.json"), StringComparison.Ordinal))
                {
                    ReadLegacyReviewOverride(labels, prompts);
                }
            }
            return labels;
        }

        private static void ReadLegacyReviewOverride(Dictionary<String, String> labels, Dictionary<String, String> prompts)
        {
            try
            {
                var legacyPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".vizhi", "prompt-template.json");
                using var document = JsonDocument.Parse(File.ReadAllText(legacyPath));
                AddLabel(labels, "review", GetString(document.RootElement, "label"));
                AddPrompt(prompts, "review", GetString(document.RootElement, "prompt"));
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

        private static void AddPrompt(Dictionary<String, String> prompts, String id, String prompt)
        {
            var value = prompt?.Trim();
            if (String.IsNullOrEmpty(value)) return;
            prompts[id] = value;
        }
    }
}
