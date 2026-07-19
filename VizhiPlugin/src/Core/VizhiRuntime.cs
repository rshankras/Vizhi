namespace Loupedeck.VizhiPlugin
{
    using System;
    using System.Collections.Generic;
    using System.IO;
    using System.Text;
    using System.Text.Json;
    using System.Threading;

    internal sealed class GridSlotState
    {
        public GridSlotState(Int32 slot, String sessionId, String project, String cwd, String state, String waitingKind, String question, String pendingTool, String pendingCommand, String model, String reasoning, Int32? contextPercent, Double? costUsd, DateTimeOffset? updatedAt)
        {
            this.Slot = slot;
            this.SessionId = sessionId;
            this.Project = project;
            this.Cwd = cwd;
            this.State = state;
            this.WaitingKind = waitingKind;
            this.Question = question;
            this.PendingTool = pendingTool;
            this.PendingCommand = pendingCommand;
            this.Model = model;
            this.Reasoning = reasoning;
            this.ContextPercent = contextPercent;
            this.CostUsd = costUsd;
            this.UpdatedAt = updatedAt;
        }

        public Int32 Slot { get; }
        public String SessionId { get; }
        public String Project { get; }
        public String Cwd { get; }
        public String State { get; }
        public String WaitingKind { get; }
        public String Question { get; }
        public String PendingTool { get; }
        public String PendingCommand { get; }
        public String Model { get; }
        public String Reasoning { get; }
        public Int32? ContextPercent { get; }
        public Double? CostUsd { get; }
        public DateTimeOffset? UpdatedAt { get; }
        public Boolean IsOccupied => !String.IsNullOrEmpty(this.SessionId);

        public static GridSlotState Empty(Int32 slot) => new GridSlotState(slot, null, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    internal sealed class VizhiStateReader
    {
        private readonly String _rootPath;

        public VizhiStateReader()
        {
            this._rootPath = Environment.GetEnvironmentVariable("VIZHI_IPC_ROOT")
                ?? "/tmp/vizhi";
        }

        public GridSlotState ReadSlot(Int32 slot)
        {
            try
            {
                var tty = this.GetSlotTty(slot);
                if (String.IsNullOrEmpty(tty)) return GridSlotState.Empty(slot);

                var sessionsPath = Path.Combine(this._rootPath, "sessions");
                if (!Directory.Exists(sessionsPath)) return GridSlotState.Empty(slot);

                foreach (var filePath in Directory.EnumerateFiles(sessionsPath, "*.json"))
                {
                    try
                    {
                        using var document = JsonDocument.Parse(File.ReadAllText(filePath));
                        var session = document.RootElement;
                        if (GetInt(session, "schema") != 1) continue;

                        var sessionId = GetString(session, "session_id");
                        var sessionTty = GetString(session, "tty") ?? sessionId;
                        if (!String.Equals(tty, sessionTty, StringComparison.Ordinal)) continue;

                        return new GridSlotState(slot, sessionId, GetString(session, "project") ?? "Codex", GetString(session, "cwd"), GetString(session, "state") ?? "idle", GetString(session, "waiting_kind"), GetString(session, "question"), GetString(session, "pending_tool"), GetString(session, "pending_command"), GetString(session, "model"), GetString(session, "reasoning"), GetOptionalInt(session, "ctx_pct"), GetOptionalDouble(session, "cost_usd"), GetDateTimeOffset(session, "updated_at"));
                    }
                    catch (Exception ex)
                    {
                        PluginLog.Warning(ex, $"Unable to read Vizhi session state {Path.GetFileName(filePath)}");
                    }
                }
            }
            catch (Exception ex)
            {
                PluginLog.Warning(ex, $"Unable to read Vizhi state for slot {slot}");
            }

            return GridSlotState.Empty(slot);
        }

        public void WriteAction(String type, Int32 slot, String sessionId)
        {
            var id = Guid.NewGuid().ToString("N");
            this.WriteActionFile(id, new { id, type, slot, session_id = sessionId, created_at = DateTimeOffset.Now.ToString("O") });
        }

        public void WriteVoiceAction(Int32 slot, String text, String sessionId)
        {
            var id = Guid.NewGuid().ToString("N");
            this.WriteActionFile(id, new { id, type = "voice", slot, text, session_id = sessionId, created_at = DateTimeOffset.Now.ToString("O") });
        }

        public void WriteNewTerminalAction(String cwd, Boolean openInNewWindow)
        {
            var id = Guid.NewGuid().ToString("N");
            this.WriteActionFile(id, new { id, type = "new_terminal", slot = 0, cwd, open_in_new_window = openInNewWindow, created_at = DateTimeOffset.Now.ToString("O") });
        }

        public void WriteKeyAction(Int32 slot, String key, String sessionId)
        {
            var id = Guid.NewGuid().ToString("N");
            this.WriteActionFile(id, new { id, type = "key", slot, key, session_id = sessionId, created_at = DateTimeOffset.Now.ToString("O") });
        }

        public void WritePromptTemplateAction(Int32 slot, String templateId, String sessionId)
        {
            var id = Guid.NewGuid().ToString("N");
            this.WriteActionFile(id, new { id, type = "prompt_template", slot, template_id = templateId, session_id = sessionId, created_at = DateTimeOffset.Now.ToString("O") });
        }

        public Boolean HasPendingScreenshotDraft(String sessionId)
        {
            if (String.IsNullOrWhiteSpace(sessionId)) return false;
            var path = Path.Combine(this._rootPath, "drafts", ScreenshotDraftFilename(sessionId));
            if (!File.Exists(path)) return false;
            try
            {
                using var document = JsonDocument.Parse(File.ReadAllText(path));
                if (IsCurrentScreenshotDraft(document.RootElement, sessionId, out _)) return true;
            }
            catch
            {
            }
            TryDeleteFile(path);
            return false;
        }

        public IEnumerable<String> ReadPendingScreenshotDraftSessionIds()
        {
            var draftsPath = Path.Combine(this._rootPath, "drafts");
            if (!Directory.Exists(draftsPath)) return Array.Empty<String>();
            var sessionIds = new List<String>();
            foreach (var path in Directory.EnumerateFiles(draftsPath, "*.json"))
            {
                try
                {
                    using var document = JsonDocument.Parse(File.ReadAllText(path));
                    if (IsCurrentScreenshotDraft(document.RootElement, null, out var sessionId)) sessionIds.Add(sessionId);
                    else TryDeleteFile(path);
                }
                catch
                {
                    TryDeleteFile(path);
                }
            }
            return sessionIds;
        }

        private void WriteActionFile(String id, Object action)
        {
            var actionsPath = Path.Combine(this._rootPath, "actions");
            VizhiPrivateFiles.EnsurePrivateDirectory(this._rootPath);
            VizhiPrivateFiles.EnsurePrivateDirectory(actionsPath);
            var path = Path.Combine(actionsPath, $"{id}.json");
            var temporaryPath = $"{path}.{Guid.NewGuid():N}.tmp";
            File.WriteAllText(temporaryPath, JsonSerializer.Serialize(action));
            VizhiPrivateFiles.EnsurePrivateFile(temporaryPath);
            File.Move(temporaryPath, path);
        }

        public String GetSlotTty(Int32 slot)
        {
            try
            {
                var registryPath = Path.Combine(this._rootPath, "registry.json");
                if (!File.Exists(registryPath)) return null;
                using var document = JsonDocument.Parse(File.ReadAllText(registryPath));
                if (!document.RootElement.TryGetProperty("slots", out var slots)) return null;
                return slots.TryGetProperty(slot.ToString(), out var tty) ? tty.GetString() : null;
            }
            catch (Exception ex)
            {
                PluginLog.Warning(ex, $"Unable to read Vizhi slot registry for slot {slot}");
                return null;
            }
        }

        public String GetFocusedSessionId()
        {
            try
            {
                var registryPath = Path.Combine(this._rootPath, "registry.json");
                if (!File.Exists(registryPath)) return null;
                using var document = JsonDocument.Parse(File.ReadAllText(registryPath));
                var registry = document.RootElement;
                return GetInt(registry, "schema") == 1 ? GetString(registry, "focused_session") : null;
            }
            catch (Exception ex)
            {
                PluginLog.Warning(ex, "Unable to read Vizhi focused session");
                return null;
            }
        }

        private static String GetString(JsonElement element, String name)
            => element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

        private static Int32 GetInt(JsonElement element, String name)
            => element.TryGetProperty(name, out var value) && value.TryGetInt32(out var result) ? result : 0;

        private static Int32? GetOptionalInt(JsonElement element, String name)
            => element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var result) ? result : null;

        private static Double? GetOptionalDouble(JsonElement element, String name)
            => element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var result) ? result : null;

        private static DateTimeOffset? GetDateTimeOffset(JsonElement element, String name)
            => DateTimeOffset.TryParse(GetString(element, name), out var result) ? result : null;

        private static Boolean IsCurrentScreenshotDraft(JsonElement draft, String expectedSessionId, out String sessionId)
        {
            sessionId = GetString(draft, "session_id");
            var createdAt = GetDateTimeOffset(draft, "created_at");
            return GetInt(draft, "schema") == 1
                && !String.IsNullOrWhiteSpace(sessionId)
                && (String.IsNullOrEmpty(expectedSessionId) || String.Equals(sessionId, expectedSessionId, StringComparison.Ordinal))
                && createdAt.HasValue
                && DateTimeOffset.UtcNow - createdAt.Value.ToUniversalTime() <= TimeSpan.FromMinutes(2);
        }

        private static String ScreenshotDraftFilename(String sessionId)
            => $"{Convert.ToBase64String(Encoding.UTF8.GetBytes(sessionId)).TrimEnd('=').Replace('+', '-').Replace('/', '_')}.json";

        private static void TryDeleteFile(String path)
        {
            try { File.Delete(path); }
            catch { }
        }
    }

    internal static class VizhiRuntime
    {
        private const Int32 SlotCount = 6;
        private static readonly Object Sync = new Object();
        private static readonly List<IRefreshableCommand> Commands = new List<IRefreshableCommand>();
        private static readonly VizhiStateReader StateReader = new VizhiStateReader();
        private static readonly VizhiActionRouter ActionRouter = new VizhiActionRouter();
        private static readonly Dictionary<Int32, GridSlotState> Slots = new Dictionary<Int32, GridSlotState>();
        private static readonly HashSet<String> PendingScreenshotDrafts = new HashSet<String>(StringComparer.Ordinal);
        private static Timer _refreshTimer;
        private static Int32 _focusedSlot;
        private static String _focusedSessionId;
        private static Int64 _lastAnimationFrame = -1;

        public static void Start()
        {
            lock (Sync)
            {
                if (_refreshTimer != null) return;
                Refresh(null);
                _refreshTimer = new Timer(Refresh, null, 500, 500);
                ActionRouter.Start();
            }
        }

        public static void Stop()
        {
            lock (Sync)
            {
                _refreshTimer?.Dispose();
                _refreshTimer = null;
                ActionRouter.Stop();
                Commands.Clear();
                Slots.Clear();
                PendingScreenshotDrafts.Clear();
                _focusedSlot = 0;
                _focusedSessionId = null;
                _lastAnimationFrame = -1;
            }
        }

        public static void Register(IRefreshableCommand command)
        {
            lock (Sync)
            {
                if (!Commands.Contains(command)) Commands.Add(command);
            }
        }

        public static void Unregister(IRefreshableCommand command)
        {
            lock (Sync)
            {
                Commands.Remove(command);
            }
        }

        public static GridSlotState GetSlot(Int32 slot)
        {
            lock (Sync)
            {
                return Slots.TryGetValue(slot, out var state) ? state : StateReader.ReadSlot(slot);
            }
        }

        public static Int32 FocusedSlot
        {
            get
            {
                lock (Sync) return _focusedSlot;
            }
        }

        public static Int32 ResolveFocusedSlot()
        {
            lock (Sync)
            {
                if (ReconcileFocusedSlot())
                {
                    foreach (var command in Commands) command.RefreshFace();
                }
                if (_focusedSlot > 0) return _focusedSlot;

                var waitingSlot = 0;
                var occupiedSlot = 0;
                for (var slot = 1; slot <= SlotCount; slot++)
                {
                    var state = GetSlot(slot);
                    if (!state.IsOccupied) continue;
                    if (occupiedSlot > 0) occupiedSlot = -1;
                    else occupiedSlot = slot;
                    if (String.Equals(state.State, "waiting", StringComparison.OrdinalIgnoreCase))
                    {
                        if (waitingSlot > 0) waitingSlot = -1;
                        else waitingSlot = slot;
                    }
                }

                var resolved = waitingSlot > 0 ? waitingSlot : occupiedSlot > 0 ? occupiedSlot : 0;
                if (resolved > 0) SetFocusedSlot(resolved);
                return resolved;
            }
        }

        public static void SetFocusedSlot(Int32 slot)
        {
            lock (Sync)
            {
                var state = slot > 0 ? GetSlot(slot) : null;
                var sessionId = state?.IsOccupied == true ? state.SessionId : null;
                if (String.Equals(_focusedSessionId, sessionId, StringComparison.Ordinal) && _focusedSlot == slot) return;
                _focusedSlot = slot;
                _focusedSessionId = sessionId;
                foreach (var command in Commands) command.RefreshFace();
            }
        }

        public static Boolean RequiresSlotAnimation(Int32 slot)
        {
            lock (Sync)
            {
                var state = GetSlot(slot).State;
                return String.Equals(state, "busy", StringComparison.OrdinalIgnoreCase)
                    || String.Equals(state, "waiting", StringComparison.OrdinalIgnoreCase);
            }
        }

        public static void WriteFocusAction(Int32 slot)
        {
            if (TryGetActionTarget(slot, out var state)) StateReader.WriteAction("focus", slot, state.SessionId);
        }

        public static void WriteAction(String type, Int32 slot)
        {
            if (TryGetActionTarget(slot, out var state)) StateReader.WriteAction(type, slot, state.SessionId);
        }

        public static void WriteKeyAction(Int32 slot, String key)
        {
            if (TryGetActionTarget(slot, out var state)) StateReader.WriteKeyAction(slot, key, state.SessionId);
        }

        public static void WritePromptTemplateAction(Int32 slot, String templateId)
        {
            if (TryGetActionTarget(slot, out var state)) StateReader.WritePromptTemplateAction(slot, templateId, state.SessionId);
        }

        public static void WriteVoiceAction(Int32 slot, String text)
        {
            if (TryGetActionTarget(slot, out var state)) StateReader.WriteVoiceAction(slot, text, state.SessionId);
        }

        public static void WritePinnedVoiceAction(Int32 slot, String sessionId, String text)
        {
            if (!String.IsNullOrWhiteSpace(sessionId)) StateReader.WriteVoiceAction(slot, text, sessionId);
        }

        public static void WriteNewTerminalAction(Boolean openInNewWindow)
        {
            var slot = ResolveFocusedSlot();
            var cwd = slot > 0 ? GetSlot(slot).Cwd : null;
            StateReader.WriteNewTerminalAction(cwd, openInNewWindow);
        }

        public static Boolean HasPendingScreenshotDraft(Int32 slot)
        {
            lock (Sync)
            {
                var state = GetSlot(slot);
                return state.IsOccupied && PendingScreenshotDrafts.Contains(state.SessionId);
            }
        }

        public static Boolean HasPendingScreenshotDraft(String sessionId)
            => !String.IsNullOrWhiteSpace(sessionId) && StateReader.HasPendingScreenshotDraft(sessionId);

        public static String GetSlotTty(Int32 slot) => StateReader.GetSlotTty(slot);

        public static String RenderSlot(Int32 slot)
        {
            var state = GetSlot(slot);
            if (!state.IsOccupied) return $"+ New{Environment.NewLine}Slot {slot}";

            var context = state.ContextPercent.HasValue ? $"CTX {state.ContextPercent.Value}%" : "CTX --";
            return $"CX {Truncate(state.Project, 14)}{Environment.NewLine}{GetStatusLabel(state)} · {context}{Environment.NewLine}{Truncate(DescribeActivity(state), 23)}";
        }

        public static BitmapImage RenderSlotImage(Int32 slot, PluginImageSize imageSize)
        {
            var state = GetSlot(slot);
            if (!state.IsOccupied) return KeyImage.RenderBlank(imageSize);

            return KeyImage.RenderSessionSlot(
                imageSize,
                GetStatusLabel(state),
                IsHighRisk(state),
                slot == FocusedSlot
            );
        }

        public static String RenderSlotLabel(Int32 slot)
        {
            var state = GetSlot(slot);
            if (!state.IsOccupied) return String.Empty;
            var context = state.ContextPercent.HasValue ? $"CTX {state.ContextPercent.Value}%" : "CTX --";
            return $"{Truncate(state.Project, 12)}{Environment.NewLine}\u200B{Environment.NewLine}{context}";
        }

        public static String RenderFocusedAction(String actionType)
        {
            return actionType == "approve" ? "Yes" : "No";
        }

        public static Boolean IsFocusedApprovalWaiting(out Boolean isHighRisk)
        {
            lock (Sync)
            {
                isHighRisk = false;
                var slot = ResolveFocusedSlot();
                if (slot <= 0) return false;
                var state = GetSlot(slot);
                if (!state.IsOccupied || !String.Equals(state.State, "waiting", StringComparison.OrdinalIgnoreCase)) return false;
                isHighRisk = IsHighRisk(state);
                return true;
            }
        }

        public static String RenderFocusedUsage()
        {
            var slot = ResolveFocusedSlot();
            if (slot <= 0) return $"No{Environment.NewLine}session";
            var state = GetSlot(slot);
            if (!state.IsOccupied) return $"No{Environment.NewLine}session";
            var context = state.ContextPercent.HasValue ? $"CTX {state.ContextPercent.Value}%" : "CTX --";
            var detail = state.CostUsd.HasValue
                ? $"${state.CostUsd.Value:0.00}"
                : String.IsNullOrEmpty(state.Reasoning)
                    ? state.Model ?? "Codex"
                    : $"{state.Model ?? "Codex"} · {state.Reasoning}";
            return $"{context}{Environment.NewLine}{Truncate(detail, 18)}";
        }

        private static void Refresh(Object state)
        {
            lock (Sync)
            {
                var changed = false;
                for (var slot = 1; slot <= SlotCount; slot++)
                {
                    var next = StateReader.ReadSlot(slot);
                    if (!Slots.TryGetValue(slot, out var current) || !HasSameVisualState(current, next)) changed = true;
                    Slots[slot] = next;
                }
                if (RefreshPendingScreenshotDrafts()) changed = true;
                if (ReconcileFocusedSlot()) changed = true;

                var animationFrame = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 500;
                var advanceAnimation = animationFrame != _lastAnimationFrame;
                _lastAnimationFrame = animationFrame;
                foreach (var command in Commands)
                {
                    if (changed) command.RefreshFace();
                    else if (advanceAnimation && command.RequiresAnimation) command.RefreshAnimatedFaces();
                }
            }
        }

        private static Boolean HasSameVisualState(GridSlotState first, GridSlotState second)
        {
            return first.Slot == second.Slot
                && String.Equals(first.SessionId, second.SessionId, StringComparison.Ordinal)
                && String.Equals(first.Project, second.Project, StringComparison.Ordinal)
                && String.Equals(first.State, second.State, StringComparison.Ordinal)
                && String.Equals(first.WaitingKind, second.WaitingKind, StringComparison.Ordinal)
                && String.Equals(first.PendingTool, second.PendingTool, StringComparison.Ordinal)
                && String.Equals(first.PendingCommand, second.PendingCommand, StringComparison.Ordinal)
                && String.Equals(first.Model, second.Model, StringComparison.Ordinal)
                && String.Equals(first.Reasoning, second.Reasoning, StringComparison.Ordinal)
                && first.ContextPercent == second.ContextPercent
                && first.CostUsd == second.CostUsd;
        }

        private static Boolean ReconcileFocusedSlot()
        {
            if (String.IsNullOrEmpty(_focusedSessionId))
            {
                var persistedSessionId = StateReader.GetFocusedSessionId();
                if (!String.IsNullOrEmpty(persistedSessionId))
                {
                    for (var slot = 1; slot <= SlotCount; slot++)
                    {
                        if (Slots.TryGetValue(slot, out var state)
                            && String.Equals(state.SessionId, persistedSessionId, StringComparison.Ordinal))
                        {
                            _focusedSlot = slot;
                            _focusedSessionId = state.SessionId;
                            return true;
                        }
                    }
                }
                if (_focusedSlot == 0) return false;
                _focusedSlot = 0;
                return true;
            }

            for (var slot = 1; slot <= SlotCount; slot++)
            {
                if (Slots.TryGetValue(slot, out var state)
                    && String.Equals(state.SessionId, _focusedSessionId, StringComparison.Ordinal))
                {
                    if (_focusedSlot == slot) return false;
                    _focusedSlot = slot;
                    return true;
                }
            }

            _focusedSlot = 0;
            _focusedSessionId = null;
            return true;
        }

        private static Boolean RefreshPendingScreenshotDrafts()
        {
            var next = new HashSet<String>(StateReader.ReadPendingScreenshotDraftSessionIds(), StringComparer.Ordinal);
            if (PendingScreenshotDrafts.SetEquals(next)) return false;
            PendingScreenshotDrafts.Clear();
            PendingScreenshotDrafts.UnionWith(next);
            return true;
        }

        private static Boolean TryGetActionTarget(Int32 slot, out GridSlotState state)
        {
            state = GetSlot(slot);
            return state.IsOccupied && !String.IsNullOrEmpty(state.SessionId);
        }

        private static Boolean IsHighRisk(GridSlotState state)
        {
            if (!String.Equals(state.State, "waiting", StringComparison.OrdinalIgnoreCase)
                || !String.Equals(state.WaitingKind, "permission", StringComparison.OrdinalIgnoreCase)) return false;
            var source = $"{state.PendingTool} {state.PendingCommand}".ToLowerInvariant();
            foreach (var pattern in new[] { "git push", "rm ", "sudo ", "curl ", "publish", "deploy", "force", "reset --hard", "drop ", "delete from" })
            {
                if (source.Contains(pattern)) return true;
            }
            return false;
        }

        private static String GetStatusLabel(GridSlotState state)
        {
            if (IsHighRisk(state)) return "RISK";
            return state.State?.ToUpperInvariant() switch
            {
                "BUSY" => "BUSY",
                "WAITING" => "WAIT",
                _ => "IDLE",
            };
        }

        private static String DescribeActivity(GridSlotState state)
        {
            if (String.Equals(state.State, "waiting", StringComparison.OrdinalIgnoreCase))
            {
                return state.Question ?? "Approval requested";
            }

            if (String.Equals(state.State, "busy", StringComparison.OrdinalIgnoreCase))
            {
                if (!String.IsNullOrEmpty(state.PendingTool) && !String.IsNullOrEmpty(state.PendingCommand))
                {
                    return $"{state.PendingTool}: {state.PendingCommand}";
                }
                return state.PendingTool ?? state.PendingCommand ?? "Working";
            }

            var model = String.IsNullOrEmpty(state.Model) ? "Codex" : state.Model;
            return $"{model} · {FormatAge(state.UpdatedAt)}";
        }

        private static String FormatAge(DateTimeOffset? updatedAt)
        {
            if (!updatedAt.HasValue) return "now";
            var age = DateTimeOffset.UtcNow - updatedAt.Value.ToUniversalTime();
            if (age < TimeSpan.FromMinutes(1)) return "now";
            if (age < TimeSpan.FromHours(1)) return $"{Math.Floor(age.TotalMinutes)}m";
            if (age < TimeSpan.FromDays(1)) return $"{Math.Floor(age.TotalHours)}h";
            return $"{Math.Floor(age.TotalDays)}d";
        }

        private static String Truncate(String value, Int32 length)
            => value != null && value.Length > length ? $"{value.Substring(0, length - 1)}…" : value;
    }
}
