namespace Loupedeck.VizhiPlugin
{
    using System;
    using System.Collections.Generic;
    using System.Diagnostics;
    using System.Globalization;
    using System.IO;
    using System.Linq;
    using System.Text;
    using System.Text.Json;
    using System.Text.Json.Serialization;
    using System.Text.RegularExpressions;
    using System.Threading;
    using System.Threading.Tasks;

    internal sealed class VizhiSessionRecord
    {
        [JsonPropertyName("schema")]
        public Int32 Schema { get; set; } = 1;

        [JsonPropertyName("session_id")]
        public String SessionId { get; set; }

        [JsonPropertyName("agent")]
        public String Agent { get; set; } = "codex";

        [JsonPropertyName("project")]
        public String Project { get; set; } = "Codex";

        [JsonPropertyName("cwd")]
        public String Cwd { get; set; }

        [JsonPropertyName("tty")]
        public String Tty { get; set; }

        [JsonPropertyName("state")]
        public String State { get; set; } = "idle";

        [JsonPropertyName("waiting_kind")]
        public String WaitingKind { get; set; }

        [JsonPropertyName("question")]
        public String Question { get; set; }

        [JsonPropertyName("pending_tool")]
        public String PendingTool { get; set; }

        [JsonPropertyName("pending_command")]
        public String PendingCommand { get; set; }

        [JsonPropertyName("model")]
        public String Model { get; set; }

        [JsonPropertyName("reasoning")]
        public String Reasoning { get; set; }

        [JsonPropertyName("ctx_pct")]
        public Int32? ContextPercent { get; set; }

        [JsonPropertyName("cost_usd")]
        public Double? CostUsd { get; set; }

        [JsonPropertyName("updated_at")]
        public String UpdatedAt { get; set; }

        [JsonPropertyName("capabilities")]
        public String[] Capabilities { get; set; } = new[] { "approve", "skills", "model", "mode" };

        public String Identity => String.IsNullOrWhiteSpace(this.Tty) ? this.SessionId : this.Tty;

        public Boolean IsProvisional => this.SessionId?.StartsWith("provisional-", StringComparison.Ordinal) == true;
    }

    internal sealed class VizhiRegistryRecord
    {
        [JsonPropertyName("schema")]
        public Int32 Schema { get; set; } = 1;

        [JsonPropertyName("slots")]
        public Dictionary<String, String> Slots { get; set; } = new Dictionary<String, String>(StringComparer.Ordinal);

        [JsonPropertyName("focused_session")]
        public String FocusedSession { get; set; }
    }

    internal sealed class VizhiActionRecord
    {
        [JsonPropertyName("id")]
        public String Id { get; set; }

        [JsonPropertyName("type")]
        public String Type { get; set; }

        [JsonPropertyName("slot")]
        public Int32 Slot { get; set; }

        [JsonPropertyName("created_at")]
        public String CreatedAt { get; set; }

        [JsonPropertyName("text")]
        public String Text { get; set; }

        [JsonPropertyName("key")]
        public String Key { get; set; }

        [JsonPropertyName("template_id")]
        public String TemplateId { get; set; }

        [JsonPropertyName("session_id")]
        public String SessionId { get; set; }

        [JsonPropertyName("cwd")]
        public String Cwd { get; set; }

        [JsonPropertyName("open_in_new_window")]
        public Boolean OpenInNewWindow { get; set; }

        [JsonPropertyName("return_to_browser")]
        public Boolean ReturnToBrowser { get; set; }
    }

    internal sealed class VizhiScreenshotDraft
    {
        [JsonPropertyName("schema")]
        public Int32 Schema { get; set; } = 1;

        [JsonPropertyName("session_id")]
        public String SessionId { get; set; }

        [JsonPropertyName("image_path")]
        public String ImagePath { get; set; }

        [JsonPropertyName("created_at")]
        public String CreatedAt { get; set; }
    }

    internal sealed class VizhiTerminalProcess
    {
        public String Pid { get; set; }
        public String Tty { get; set; }
    }

    internal sealed class VizhiActionRouter : IDisposable
    {
        private const Int32 SlotCount = 6;
        private const Int32 ActionMaxAgeMilliseconds = 30_000;
        private const Int32 StaleSessionMilliseconds = 10 * 60 * 1000;
        private const Int32 BusyWithoutActivityMilliseconds = 45_000;
        private const Int32 LiveSessionHeartbeatMilliseconds = 60_000;
        private const Int32 CompletedActionRetentionMilliseconds = 60 * 60 * 1000;
        private const Int32 CaptureRetentionMilliseconds = 15 * 60 * 1000;
        private const Int32 ScreenshotDraftMilliseconds = 2 * 60 * 1000;
        private static readonly String[] ValidActionTypes = new[]
        {
            "focus", "approve", "deny", "voice", "interrupt", "compact", "new_session", "new_terminal", "exit",
            "model", "mode", "agent", "fork", "favorite", "clipboard", "screenshot", "key", "prompt_template", "resume",
        };
        private static readonly String[] ValidTerminalKeys = new[] { "tab", "up", "down", "enter", "page_up", "page_down" };
        private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            WriteIndented = true,
            DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        };

        private readonly Object _sync = new Object();
        private readonly String _rootPath;
        private readonly String _sessionsPath;
        private readonly String _actionsPath;
        private readonly String _doneActionsPath;
        private readonly String _failedActionsPath;
        private readonly String _draftsPath;
        private readonly String _capturesPath;
        private readonly String _registryPath;
        private Timer _timer;
        private Int32 _processing;
        private Int64 _lastProcessScanAt;
        private Int64 _lastCleanupAt;
        private String _previousApplication;

        public VizhiActionRouter()
        {
            this._rootPath = Environment.GetEnvironmentVariable("VIZHI_IPC_ROOT") ?? "/tmp/vizhi";
            this._sessionsPath = Path.Combine(this._rootPath, "sessions");
            this._actionsPath = Path.Combine(this._rootPath, "actions");
            this._doneActionsPath = Path.Combine(this._actionsPath, "done");
            this._failedActionsPath = Path.Combine(this._actionsPath, "failed");
            this._draftsPath = Path.Combine(this._rootPath, "drafts");
            this._capturesPath = Path.Combine(this._rootPath, "captures");
            this._registryPath = Path.Combine(this._rootPath, "registry.json");
        }

        public void Start()
        {
            if (!OperatingSystem.IsMacOS()) return;
            lock (this._sync)
            {
                if (this._timer != null) return;
                this._timer = new Timer(this.Tick, null, TimeSpan.Zero, TimeSpan.FromMilliseconds(250));
            }
        }

        public void Stop()
        {
            lock (this._sync)
            {
                this._timer?.Dispose();
                this._timer = null;
            }
        }

        public void Dispose() => this.Stop();

        private void Tick(Object state)
        {
            if (Interlocked.Exchange(ref this._processing, 1) != 0) return;
            try
            {
                this.EnsurePaths();
                var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                if (now - this._lastProcessScanAt >= 2_000)
                {
                    this.ReconcileCodexProcesses(now);
                    this._lastProcessScanAt = now;
                }
                else
                {
                    this.NormalizeRegistry();
                }
                if (now - this._lastCleanupAt >= 60_000)
                {
                    this.PruneLocalArtifacts(now);
                    this._lastCleanupAt = now;
                }
                this.ProcessActions(now);
            }
            catch (Exception ex)
            {
                PluginLog.Warning(ex, "Vizhi automatic action router failed");
            }
            finally
            {
                Interlocked.Exchange(ref this._processing, 0);
            }
        }

        private void EnsurePaths()
        {
            VizhiPrivateFiles.EnsurePrivateDirectory(this._rootPath);
            VizhiPrivateFiles.EnsurePrivateDirectory(this._sessionsPath);
            VizhiPrivateFiles.EnsurePrivateDirectory(this._actionsPath);
            VizhiPrivateFiles.EnsurePrivateDirectory(this._doneActionsPath);
            VizhiPrivateFiles.EnsurePrivateDirectory(this._failedActionsPath);
            VizhiPrivateFiles.EnsurePrivateDirectory(this._draftsPath);
            VizhiPrivateFiles.EnsurePrivateDirectory(this._capturesPath);
        }

        private void ProcessActions(Int64 now)
        {
            var actions = new List<Tuple<String, VizhiActionRecord>>();
            foreach (var filePath in Directory.EnumerateFiles(this._actionsPath, "*.json", SearchOption.TopDirectoryOnly))
            {
                try
                {
                    var action = JsonSerializer.Deserialize<VizhiActionRecord>(File.ReadAllText(filePath), JsonOptions);
                    if (!this.IsValidAction(action))
                    {
                        PluginLog.Warning($"Vizhi quarantined invalid action file {Path.GetFileName(filePath)}");
                        this.QuarantineAction(filePath);
                        continue;
                    }
                    actions.Add(Tuple.Create(filePath, action));
                }
                catch (Exception ex)
                {
                    PluginLog.Warning(ex, $"Vizhi quarantined unreadable action file {Path.GetFileName(filePath)}");
                    this.QuarantineAction(filePath);
                }
            }

            foreach (var entry in actions.OrderBy(item => ParseTimestamp(item.Item2.CreatedAt) ?? DateTimeOffset.MinValue))
            {
                var fileName = Path.GetFileName(entry.Item1);
                var claimedPath = Path.Combine(this._doneActionsPath, fileName);
                try
                {
                    File.Move(entry.Item1, claimedPath);
                }
                catch (FileNotFoundException)
                {
                    continue;
                }
                catch (IOException)
                {
                    continue;
                }

                var createdAt = ParseTimestamp(entry.Item2.CreatedAt);
                if (!createdAt.HasValue || now - createdAt.Value.ToUnixTimeMilliseconds() > ActionMaxAgeMilliseconds)
                {
                    PluginLog.Warning($"Vizhi ignored expired action {entry.Item2.Id}");
                    continue;
                }

                try
                {
                    this.Execute(entry.Item2);
                }
                catch (Exception ex)
                {
                    PluginLog.Warning(ex, $"Vizhi action {entry.Item2.Id} failed");
                }
            }
        }

        private Boolean IsValidAction(VizhiActionRecord action)
        {
            if (action == null || String.IsNullOrWhiteSpace(action.Id) || String.IsNullOrWhiteSpace(action.Type)
                || !ValidActionTypes.Contains(action.Type, StringComparer.Ordinal) || !ParseTimestamp(action.CreatedAt).HasValue) return false;
            if (String.Equals(action.Type, "resume", StringComparison.Ordinal))
            {
                return action.Slot == 0 && !String.IsNullOrWhiteSpace(action.SessionId);
            }
            if (String.Equals(action.Type, "new_terminal", StringComparison.Ordinal)) return action.Slot == 0;
            if (action.Slot < 1 || action.Slot > SlotCount) return false;
            if (String.Equals(action.Type, "voice", StringComparison.Ordinal) && String.IsNullOrWhiteSpace(action.Text)) return false;
            if (String.Equals(action.Type, "key", StringComparison.Ordinal)
                && !ValidTerminalKeys.Contains(action.Key ?? String.Empty, StringComparer.Ordinal)) return false;
            return true;
        }

        private void QuarantineAction(String sourcePath)
        {
            try
            {
                var name = $"{Path.GetFileName(sourcePath)}.{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.{Guid.NewGuid():N}.invalid";
                File.Move(sourcePath, Path.Combine(this._failedActionsPath, name));
            }
            catch (FileNotFoundException)
            {
            }
            catch (Exception ex)
            {
                PluginLog.Warning(ex, $"Vizhi could not quarantine {Path.GetFileName(sourcePath)}");
            }
        }

        private void Execute(VizhiActionRecord action)
        {
            try
            {
                if (String.Equals(action.Type, "resume", StringComparison.Ordinal))
                {
                    this.OpenCodexSession($"codex resume {ShellQuote(action.SessionId)}", action.Cwd, action.ReturnToBrowser, false);
                    return;
                }
                if (String.Equals(action.Type, "new_terminal", StringComparison.Ordinal))
                {
                    this.OpenTerminalSession(action.Cwd, action.ReturnToBrowser, action.OpenInNewWindow, null);
                    return;
                }

                var target = this.FindTarget(action);
                if (target == null) throw new InvalidOperationException($"No active session is available for slot {action.Slot}.");
                var session = target.Item1;
                var slot = target.Item2;

                if (String.Equals(action.Type, "fork", StringComparison.Ordinal))
                {
                    this.OpenCodexSession($"codex fork {ShellQuote(session.SessionId)}", session.Cwd, action.ReturnToBrowser, false);
                    return;
                }
                if ((String.Equals(action.Type, "approve", StringComparison.Ordinal) || String.Equals(action.Type, "deny", StringComparison.Ordinal))
                    && !String.Equals(session.State, "waiting", StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException("No Codex approval or input request is waiting in this session.");
                }

                this.FocusTerminal(session.Tty, action.ReturnToBrowser);
                this.SetFocusedSession(session.SessionId);

                if (String.Equals(action.Type, "focus", StringComparison.Ordinal)) return;
                if (String.Equals(action.Type, "approve", StringComparison.Ordinal) || String.Equals(action.Type, "deny", StringComparison.Ordinal))
                {
                    var approve = String.Equals(action.Type, "approve", StringComparison.Ordinal);
                    this.Respond(approve ? "yes" : "no", String.Equals(session.WaitingKind, "input", StringComparison.OrdinalIgnoreCase));
                    this.MarkSessionResponded(session, approve || String.Equals(session.WaitingKind, "input", StringComparison.OrdinalIgnoreCase));
                    return;
                }
                if (String.Equals(action.Type, "voice", StringComparison.Ordinal))
                {
                    this.TypeText(action.Text, true);
                    this.ClearScreenshotDraft(session.SessionId);
                    return;
                }
                if (String.Equals(action.Type, "interrupt", StringComparison.Ordinal))
                {
                    this.Interrupt();
                    this.MarkSessionInterrupted(session);
                    this.ClearScreenshotDraft(session.SessionId);
                    return;
                }
                if (String.Equals(action.Type, "compact", StringComparison.Ordinal))
                {
                    this.TypeText("/compact", true);
                    return;
                }
                if (String.Equals(action.Type, "new_session", StringComparison.Ordinal))
                {
                    this.TypeText("/new", true);
                    return;
                }
                if (String.Equals(action.Type, "exit", StringComparison.Ordinal))
                {
                    this.TypeText("/exit", true);
                    this.RemoveSession(session.SessionId);
                    return;
                }
                if (String.Equals(action.Type, "model", StringComparison.Ordinal))
                {
                    this.TypeText("/model", true);
                    return;
                }
                if (String.Equals(action.Type, "mode", StringComparison.Ordinal))
                {
                    this.TypeText("/mode", true);
                    return;
                }
                if (String.Equals(action.Type, "agent", StringComparison.Ordinal))
                {
                    this.TypeText("/agent", true);
                    return;
                }
                if (String.Equals(action.Type, "favorite", StringComparison.Ordinal))
                {
                    this.TypeText(TemplateCatalog.GetFavoritePrompt(), true);
                    return;
                }
                if (String.Equals(action.Type, "clipboard", StringComparison.Ordinal))
                {
                    this.PasteClipboard();
                    return;
                }
                if (String.Equals(action.Type, "screenshot", StringComparison.Ordinal))
                {
                    var imagePath = this.CaptureScreenshot();
                    this.TypeText($"A screenshot was captured at {imagePath}. Inspect this image with your available image-viewing tools before continuing. ", false);
                    this.StageScreenshotDraft(session.SessionId, imagePath);
                    return;
                }
                if (String.Equals(action.Type, "key", StringComparison.Ordinal))
                {
                    this.PressKey(action.Key);
                    if (String.Equals(action.Key, "enter", StringComparison.Ordinal)) this.ClearScreenshotDraft(session.SessionId);
                    return;
                }
                if (String.Equals(action.Type, "prompt_template", StringComparison.Ordinal))
                {
                    this.TypeText(TemplateCatalog.GetPrompt(action.TemplateId), true);
                }
            }
            finally
            {
                if (action.ReturnToBrowser) this.RestorePreviousApplication();
            }
        }

        private Tuple<VizhiSessionRecord, Int32> FindTarget(VizhiActionRecord action)
        {
            var registry = this.NormalizeRegistry();
            var sessions = this.ReadCurrentSessions();
            VizhiSessionRecord session = null;
            if (!String.IsNullOrWhiteSpace(action.SessionId)) session = sessions.FirstOrDefault(candidate => String.Equals(candidate.SessionId, action.SessionId, StringComparison.Ordinal));
            if (session == null && action.Slot >= 1 && action.Slot <= SlotCount
                && registry.Slots.TryGetValue(action.Slot.ToString(CultureInfo.InvariantCulture), out var identity))
            {
                session = sessions.FirstOrDefault(candidate => String.Equals(candidate.Identity, identity, StringComparison.Ordinal));
            }
            if (session == null) return null;
            var assignedSlot = registry.Slots
                .Where(entry => String.Equals(entry.Value, session.Identity, StringComparison.Ordinal))
                .Select(entry => Int32.TryParse(entry.Key, out var value) ? value : 0)
                .FirstOrDefault();
            return assignedSlot >= 1 && assignedSlot <= SlotCount ? Tuple.Create(session, assignedSlot) : null;
        }

        private void ReconcileCodexProcesses(Int64 now)
        {
            var processes = this.ListCodexProcesses();
            var liveTtys = new HashSet<String>(processes.Select(process => process.Tty), StringComparer.Ordinal);
            foreach (var session in this.ReadSessions().Where(session => String.Equals(session.Agent, "codex", StringComparison.OrdinalIgnoreCase)
                && !String.IsNullOrWhiteSpace(session.Tty) && !liveTtys.Contains(session.Tty)).ToArray())
            {
                this.RemoveSession(session.SessionId);
            }

            var currentSessions = this.ReadSessions();
            foreach (var process in processes)
            {
                var matching = currentSessions.Where(session => String.Equals(session.Tty, process.Tty, StringComparison.Ordinal)).ToArray();
                var liveSessions = matching.Where(session => !session.IsProvisional).ToArray();
                if (liveSessions.Length > 0)
                {
                    foreach (var session in liveSessions)
                    {
                        if (this.IsStalledBusySession(session, now))
                        {
                            session.State = "idle";
                            session.WaitingKind = null;
                            session.Question = null;
                            session.PendingTool = null;
                            session.PendingCommand = null;
                            session.UpdatedAt = UtcNow();
                            this.WriteSession(session);
                        }
                        else if (this.NeedsHeartbeat(session, now))
                        {
                            session.UpdatedAt = UtcNow();
                            this.WriteSession(session);
                        }
                    }
                    continue;
                }

                var provisional = matching.FirstOrDefault(session => session.IsProvisional);
                if (provisional == null)
                {
                    provisional = new VizhiSessionRecord
                    {
                        SessionId = $"provisional-{process.Pid}",
                        Agent = "codex",
                        Project = "Codex",
                        Tty = process.Tty,
                        State = "idle",
                        UpdatedAt = UtcNow(),
                    };
                }
                else
                {
                    provisional.State = "idle";
                    provisional.UpdatedAt = UtcNow();
                }
                this.WriteSession(provisional);
            }
            this.NormalizeRegistry();
        }

        private IEnumerable<VizhiTerminalProcess> ListCodexProcesses()
        {
            var output = this.RunProcess("/bin/ps", new[] { "-axo", "pid=,ppid=,tty=,command=" }, 10_000).StandardOutput;
            var candidates = new List<Tuple<String, String, String>>();
            foreach (var line in output.Split('\n'))
            {
                var match = Regex.Match(line.Trim(), "^(\\d+)\\s+(\\d+)\\s+(\\S+)\\s+(.+)$");
                if (!match.Success) continue;
                var pid = match.Groups[1].Value;
                var parentPid = match.Groups[2].Value;
                var tty = match.Groups[3].Value;
                var command = match.Groups[4].Value;
                var executable = Path.GetFileName(command.Trim().Split((Char[])null, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? String.Empty);
                if (String.Equals(tty, "??", StringComparison.Ordinal) || !String.Equals(executable, "codex", StringComparison.Ordinal)) continue;
                candidates.Add(Tuple.Create(pid, parentPid, $"/dev/{tty}"));
            }
            var codexProcessIds = new HashSet<String>(candidates.Select(candidate => candidate.Item1), StringComparer.Ordinal);
            return candidates
                .Where(candidate => !codexProcessIds.Contains(candidate.Item2))
                .Select(candidate => new VizhiTerminalProcess { Pid = candidate.Item1, Tty = candidate.Item3 })
                .ToArray();
        }

        private VizhiRegistryRecord NormalizeRegistry()
        {
            var sessions = this.ReadCurrentSessions();
            var activeByTty = sessions.Where(session => !session.IsProvisional && !String.IsNullOrWhiteSpace(session.Tty))
                .Select(session => session.Tty)
                .ToHashSet(StringComparer.Ordinal);
            foreach (var provisional in sessions.Where(session => session.IsProvisional && activeByTty.Contains(session.Tty)).ToArray())
            {
                this.DeleteSessionFile(provisional.SessionId);
                sessions.Remove(provisional);
            }

            var sessionsByIdentity = sessions
                .GroupBy(session => session.Identity, StringComparer.Ordinal)
                .ToDictionary(group => group.Key, group => group.OrderByDescending(session => !session.IsProvisional)
                    .ThenByDescending(session => ParseTimestamp(session.UpdatedAt) ?? DateTimeOffset.MinValue).First(), StringComparer.Ordinal);
            var registry = this.ReadRegistry();
            var assigned = new HashSet<String>(StringComparer.Ordinal);
            var identities = new List<String>();
            foreach (var entry in registry.Slots
                .Select(pair => new { Slot = Int32.TryParse(pair.Key, out var slot) ? slot : 0, pair.Value })
                .Where(entry => entry.Slot >= 1 && entry.Slot <= SlotCount && sessionsByIdentity.ContainsKey(entry.Value))
                .OrderBy(entry => entry.Slot))
            {
                if (assigned.Add(entry.Value)) identities.Add(entry.Value);
            }
            foreach (var entry in sessionsByIdentity
                .Where(pair => !assigned.Contains(pair.Key))
                .OrderBy(pair => ParseTimestamp(pair.Value.UpdatedAt) ?? DateTimeOffset.MinValue)
                .ThenBy(pair => pair.Key, StringComparer.Ordinal))
            {
                assigned.Add(entry.Key);
                identities.Add(entry.Key);
            }
            var slots = identities.Take(SlotCount).Select((identity, index) => new KeyValuePair<String, String>((index + 1).ToString(CultureInfo.InvariantCulture), identity))
                .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);
            var activeSessionIds = new HashSet<String>(sessionsByIdentity.Values.Select(session => session.SessionId), StringComparer.Ordinal);
            var focused = activeSessionIds.Contains(registry.FocusedSession ?? String.Empty) ? registry.FocusedSession : null;
            if (!SameSlots(registry.Slots, slots) || !String.Equals(registry.FocusedSession, focused, StringComparison.Ordinal))
            {
                registry.Slots = slots;
                registry.FocusedSession = focused;
                this.WriteRegistry(registry);
            }
            return registry;
        }

        private List<VizhiSessionRecord> ReadCurrentSessions()
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            return this.ReadSessions().Where(session => this.IsCurrentSession(session, now)).ToList();
        }

        private List<VizhiSessionRecord> ReadSessions()
        {
            var sessions = new List<VizhiSessionRecord>();
            if (!Directory.Exists(this._sessionsPath)) return sessions;
            foreach (var filePath in Directory.EnumerateFiles(this._sessionsPath, "*.json", SearchOption.TopDirectoryOnly))
            {
                try
                {
                    var session = JsonSerializer.Deserialize<VizhiSessionRecord>(File.ReadAllText(filePath), JsonOptions);
                    if (session?.Schema == 1 && !String.IsNullOrWhiteSpace(session.SessionId)) sessions.Add(session);
                }
                catch
                {
                }
            }
            return sessions;
        }

        private VizhiRegistryRecord ReadRegistry()
        {
            try
            {
                var registry = JsonSerializer.Deserialize<VizhiRegistryRecord>(File.ReadAllText(this._registryPath), JsonOptions);
                if (registry?.Schema == 1 && registry.Slots != null) return registry;
            }
            catch
            {
            }
            return new VizhiRegistryRecord();
        }

        private void WriteSession(VizhiSessionRecord session)
        {
            session.Schema = 1;
            session.Agent ??= "codex";
            session.Project ??= String.IsNullOrWhiteSpace(session.Cwd) ? "Codex" : Path.GetFileName(session.Cwd);
            session.State ??= "idle";
            session.UpdatedAt ??= UtcNow();
            session.Capabilities ??= new[] { "approve", "skills", "model", "mode" };
            this.WriteJsonAtomically(Path.Combine(this._sessionsPath, SessionFilename(session.SessionId)), session);
        }

        private void WriteRegistry(VizhiRegistryRecord registry)
        {
            registry.Schema = 1;
            registry.Slots ??= new Dictionary<String, String>(StringComparer.Ordinal);
            this.WriteJsonAtomically(this._registryPath, registry);
        }

        private void WriteJsonAtomically(String path, Object value)
        {
            var temporaryPath = $"{path}.{Guid.NewGuid():N}.tmp";
            File.WriteAllText(temporaryPath, $"{JsonSerializer.Serialize(value, JsonOptions)}{Environment.NewLine}");
            VizhiPrivateFiles.EnsurePrivateFile(temporaryPath);
            File.Move(temporaryPath, path, true);
            VizhiPrivateFiles.EnsurePrivateFile(path);
        }

        private void SetFocusedSession(String sessionId)
        {
            var registry = this.NormalizeRegistry();
            registry.FocusedSession = sessionId;
            this.WriteRegistry(registry);
        }

        private void MarkSessionInterrupted(VizhiSessionRecord session)
        {
            session.State = "idle";
            session.WaitingKind = null;
            session.Question = null;
            session.PendingTool = null;
            session.PendingCommand = null;
            session.UpdatedAt = UtcNow();
            this.WriteSession(session);
        }

        private void MarkSessionResponded(VizhiSessionRecord session, Boolean continuesWorking)
        {
            session.State = continuesWorking ? "busy" : "idle";
            session.WaitingKind = null;
            session.Question = null;
            if (!continuesWorking)
            {
                session.PendingTool = null;
                session.PendingCommand = null;
            }
            session.UpdatedAt = UtcNow();
            this.WriteSession(session);
        }

        private void RemoveSession(String sessionId)
        {
            this.DeleteSessionFile(sessionId);
            this.ClearScreenshotDraft(sessionId);
            this.NormalizeRegistry();
        }

        private void DeleteSessionFile(String sessionId)
        {
            try { File.Delete(Path.Combine(this._sessionsPath, SessionFilename(sessionId))); }
            catch { }
        }

        private void StageScreenshotDraft(String sessionId, String imagePath)
        {
            this.WriteJsonAtomically(Path.Combine(this._draftsPath, ScreenshotDraftFilename(sessionId)), new VizhiScreenshotDraft
            {
                SessionId = sessionId,
                ImagePath = imagePath,
                CreatedAt = UtcNow(),
            });
        }

        private void ClearScreenshotDraft(String sessionId)
        {
            try { File.Delete(Path.Combine(this._draftsPath, ScreenshotDraftFilename(sessionId))); }
            catch { }
        }

        private void PruneLocalArtifacts(Int64 now)
        {
            this.PruneFilesOlderThan(this._capturesPath, CaptureRetentionMilliseconds, now);
            this.PruneFilesOlderThan(this._doneActionsPath, CompletedActionRetentionMilliseconds, now);
            this.PruneFilesOlderThan(this._failedActionsPath, CompletedActionRetentionMilliseconds, now);
            this.PruneFilesOlderThan(this._draftsPath, ScreenshotDraftMilliseconds, now);
        }

        private void PruneFilesOlderThan(String path, Int32 retentionMilliseconds, Int64 now)
        {
            if (!Directory.Exists(path)) return;
            foreach (var filePath in Directory.EnumerateFiles(path, "*", SearchOption.TopDirectoryOnly))
            {
                try
                {
                    var age = now - new DateTimeOffset(File.GetLastWriteTimeUtc(filePath)).ToUnixTimeMilliseconds();
                    if (age > retentionMilliseconds) File.Delete(filePath);
                }
                catch
                {
                }
            }
        }

        private void FocusTerminal(String tty, Boolean capturePreviousApplication)
        {
            if (String.IsNullOrWhiteSpace(tty)) throw new InvalidOperationException("Vizhi cannot find a terminal TTY for this session.");
            this._previousApplication = capturePreviousApplication ? this.FrontmostApplication() : null;
            const String script = """
on run argv
set targetTty to item 1 of argv
tell application "Terminal"
activate
repeat with terminalWindow in windows
repeat with terminalTab in tabs of terminalWindow
set tabTty to (tty of terminalTab as text)
if tabTty is targetTty then
set selected tab of terminalWindow to terminalTab
set index of terminalWindow to 1
return
end if
end repeat
end repeat
end tell
error "Vizhi could not find terminal tab for " & targetTty
end run
""";
            this.RunAppleScript(script, new[] { tty });
        }

        private void RestorePreviousApplication()
        {
            var application = this._previousApplication;
            this._previousApplication = null;
            if (String.IsNullOrWhiteSpace(application)) return;
            const String script = """
on run argv
tell application (item 1 of argv) to activate
end run
""";
            try { this.RunAppleScript(script, new[] { application }); }
            catch { }
        }

        private String FrontmostApplication()
        {
            const String script = "tell application \"System Events\" to get name of first application process whose frontmost is true";
            try { return this.RunAppleScript(script, Array.Empty<String>()).StandardOutput.Trim(); }
            catch { return null; }
        }

        private void Respond(String answer, Boolean asTextInput)
        {
            if (asTextInput)
            {
                this.TypeText(answer, true);
                return;
            }
            var shortcut = String.Equals(answer, "yes", StringComparison.Ordinal) ? "y" : "n";
            this.RunAppleScript($"tell application \"System Events\"{Environment.NewLine}keystroke \"{shortcut}\"{Environment.NewLine}end tell", Array.Empty<String>());
        }

        private void TypeText(String text, Boolean submit)
        {
            if (String.IsNullOrWhiteSpace(text)) throw new InvalidOperationException("Vizhi cannot send an empty prompt.");
            var script = new StringBuilder();
            script.AppendLine("on run argv");
            script.AppendLine("set the clipboard to item 1 of argv");
            script.AppendLine("tell application \"System Events\"");
            script.AppendLine("keystroke \"v\" using command down");
            if (submit) script.AppendLine("key code 36");
            script.AppendLine("end tell");
            script.AppendLine("end run");
            this.RunAppleScript(script.ToString(), new[] { text });
        }

        private void Interrupt()
        {
            this.RunAppleScript("tell application \"System Events\"\nkey code 53\nend tell", Array.Empty<String>());
        }

        private void PressKey(String key)
        {
            var keyCodes = new Dictionary<String, Int32>(StringComparer.Ordinal)
            {
                ["tab"] = 48,
                ["up"] = 126,
                ["down"] = 125,
                ["enter"] = 36,
                ["page_up"] = 116,
                ["page_down"] = 121,
            };
            if (!keyCodes.TryGetValue(key ?? String.Empty, out var code)) throw new InvalidOperationException("Unknown terminal key.");
            this.RunAppleScript($"tell application \"System Events\"{Environment.NewLine}key code {code}{Environment.NewLine}end tell", Array.Empty<String>());
        }

        private void PasteClipboard()
        {
            var text = this.RunProcess("/usr/bin/pbpaste", Array.Empty<String>(), 10_000).StandardOutput;
            if (String.IsNullOrWhiteSpace(text)) throw new InvalidOperationException("Clipboard does not contain text.");
            if (text.Length > 100 * 1024) throw new InvalidOperationException("Clipboard text is too large to paste safely.");
            this.TypeText(text, true);
        }

        private String CaptureScreenshot()
        {
            var path = Path.Combine(this._capturesPath, $"capture-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.png");
            this.RunProcess("/usr/sbin/screencapture", new[] { "-i", path }, 120_000);
            if (!File.Exists(path)) throw new InvalidOperationException("Screenshot capture was cancelled.");
            VizhiPrivateFiles.EnsurePrivateFile(path);
            return path;
        }

        private void OpenCodexSession(String command, String cwd, Boolean capturePreviousApplication, Boolean openInNewWindow)
        {
            this.OpenTerminalSession(cwd, capturePreviousApplication, openInNewWindow, command);
        }

        private void OpenTerminalSession(String cwd, Boolean capturePreviousApplication, Boolean openInNewWindow, String command)
        {
            this._previousApplication = capturePreviousApplication ? this.FrontmostApplication() : null;
            var shellCommand = !String.IsNullOrWhiteSpace(command)
                ? String.IsNullOrWhiteSpace(cwd) ? $"exec {command}" : $"cd {ShellQuote(cwd)} && exec {command}"
                : String.IsNullOrWhiteSpace(cwd) ? String.Empty : $"cd {ShellQuote(cwd)}";
            var shortcut = openInNewWindow ? "n" : "t";
            var script = $"""
on run argv
set commandText to item 1 of argv
tell application "Terminal" to activate
tell application "System Events"
tell process "Terminal" to keystroke "{shortcut}" using command down
end tell
delay 0.2
if commandText is not "" then
tell application "Terminal" to do script commandText in selected tab of front window
end if
end run
""";
            this.RunAppleScript(script, new[] { shellCommand });
        }

        private ProcessResult RunAppleScript(String script, IEnumerable<String> arguments)
        {
            var values = new List<String> { "-e", script };
            values.AddRange(arguments);
            return this.RunProcess("/usr/bin/osascript", values, 15_000);
        }

        private ProcessResult RunProcess(String path, IEnumerable<String> arguments, Int32 timeoutMilliseconds)
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
            var result = new ProcessResult(standardOutputTask.GetAwaiter().GetResult(), standardErrorTask.GetAwaiter().GetResult(), process.ExitCode);
            if (result.ExitCode != 0) throw new InvalidOperationException($"{Path.GetFileName(path)} failed: {result.StandardError.Trim()}");
            return result;
        }

        private Boolean IsCurrentSession(VizhiSessionRecord session, Int64 now)
        {
            var updatedAt = ParseTimestamp(session.UpdatedAt);
            return !String.Equals(session.State, "dead", StringComparison.OrdinalIgnoreCase)
                && updatedAt.HasValue
                && now - updatedAt.Value.ToUnixTimeMilliseconds() <= StaleSessionMilliseconds;
        }

        private Boolean NeedsHeartbeat(VizhiSessionRecord session, Int64 now)
        {
            var updatedAt = ParseTimestamp(session.UpdatedAt);
            return !String.Equals(session.State, "dead", StringComparison.OrdinalIgnoreCase)
                && (!updatedAt.HasValue || now - updatedAt.Value.ToUnixTimeMilliseconds() >= LiveSessionHeartbeatMilliseconds);
        }

        private Boolean IsStalledBusySession(VizhiSessionRecord session, Int64 now)
        {
            var updatedAt = ParseTimestamp(session.UpdatedAt);
            return String.Equals(session.State, "busy", StringComparison.OrdinalIgnoreCase)
                && String.IsNullOrWhiteSpace(session.PendingTool)
                && String.IsNullOrWhiteSpace(session.PendingCommand)
                && updatedAt.HasValue
                && now - updatedAt.Value.ToUnixTimeMilliseconds() >= BusyWithoutActivityMilliseconds;
        }

        private static Boolean SameSlots(Dictionary<String, String> first, Dictionary<String, String> second)
        {
            if (first.Count != second.Count) return false;
            return first.All(entry => second.TryGetValue(entry.Key, out var value) && String.Equals(entry.Value, value, StringComparison.Ordinal));
        }

        private static DateTimeOffset? ParseTimestamp(String value)
            => DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var result) ? result : null;

        private static String UtcNow() => DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture);

        private static String SessionFilename(String sessionId)
            => $"{Regex.Replace(sessionId ?? String.Empty, "[^a-zA-Z0-9._-]", "_")}.json";

        private static String ScreenshotDraftFilename(String sessionId)
            => $"{Convert.ToBase64String(Encoding.UTF8.GetBytes(sessionId ?? String.Empty)).TrimEnd('=').Replace('+', '-').Replace('/', '_')}.json";

        private static String ShellQuote(String value)
            => $"'{(value ?? String.Empty).Replace("'", "'\"'\"'")}'";

        private sealed class ProcessResult
        {
            public ProcessResult(String standardOutput, String standardError, Int32 exitCode)
            {
                this.StandardOutput = standardOutput;
                this.StandardError = standardError;
                this.ExitCode = exitCode;
            }

            public String StandardOutput { get; }
            public String StandardError { get; }
            public Int32 ExitCode { get; }
        }
    }
}
