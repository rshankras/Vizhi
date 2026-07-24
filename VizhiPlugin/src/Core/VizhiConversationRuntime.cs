namespace Loupedeck.VizhiPlugin
{
    using System;
    using System.Collections.Concurrent;
    using System.Collections.Generic;
    using System.Text;
    using System.Threading;

    internal enum ConversationFace
    {
        Off,
        Monitoring,
        Listening,
        Transcribing,
        Speaking,
        Muted,
    }

    // Voice conversation orchestrator. All state lives on one worker thread; UI events,
    // the 500ms slot refresh, transcript watchers, and speech completions only enqueue
    // signals. Stale async completions are discarded by monotonic turn/utterance ids.
    // Every session action goes through VizhiRuntime action writers so the router's
    // waiting-state gate and TTY verification stay in the path.
    internal static class VizhiConversationRuntime
    {
        private enum SignalKind
        {
            Start,
            End,
            Tap,
            StateChanged,
            RecordingStopped,
            TranscriptReady,
            SpeechFinished,
            SummaryReady,
        }

        private sealed class Signal
        {
            public SignalKind Kind;
            public GridSlotState[] Slots;
            public Int64 TurnId;
            public Int64 UtteranceId;
            public String Transcript;
        }

        private sealed class Announcement
        {
            public String Text;
            public Boolean ListenAfter;
        }

        private static readonly Object Sync = new Object();
        private static BlockingCollection<Signal> _signals;
        private static Thread _worker;
        private static Int32 _active;
        private static Int32 _faceValue;

        // Worker-thread state.
        private static Int64 _turnId;
        private static Int64 _utteranceId;
        private static Int64 _summaryId;
        private static Int32 _turnSlot;
        private static String _turnSessionId;
        private static Boolean _muted;
        private static Boolean _listenAfterSpeech;
        private static Int32 _emptyTurns;
        private static DateTime _lastInteractionAt;
        private static GridSlotState[] _previousSlots;
        private static readonly Dictionary<String, String> AnnouncedQuestions = new Dictionary<String, String>(StringComparer.Ordinal);
        private static readonly Queue<Announcement> PendingAnnouncements = new Queue<Announcement>();

        public static Boolean IsActive => Volatile.Read(ref _active) == 1;

        public static ConversationFace Face => (ConversationFace)Volatile.Read(ref _faceValue);

        public static event Action FaceChanged;

        public static void Toggle() => Enqueue(new Signal { Kind = IsActive ? SignalKind.End : SignalKind.Start });

        public static void TapWhileActive() => Enqueue(new Signal { Kind = SignalKind.Tap });

        public static void Shutdown()
        {
            BlockingCollection<Signal> signals;
            Thread worker;
            lock (Sync)
            {
                signals = _signals;
                worker = _worker;
                _signals = null;
                _worker = null;
            }
            if (signals == null) return;
            try
            {
                signals.CompleteAdding();
                worker?.Join(TimeSpan.FromSeconds(2));
            }
            catch (Exception ex)
            {
                PluginLog.Warning(ex, "Vizhi could not shut down the voice conversation cleanly");
            }
        }

        private static void Enqueue(Signal signal)
        {
            BlockingCollection<Signal> signals;
            lock (Sync)
            {
                if (_signals == null)
                {
                    if (signal.Kind != SignalKind.Start) return;
                    _signals = new BlockingCollection<Signal>();
                    _worker = new Thread(WorkerLoop) { IsBackground = true, Name = "vizhi-conversation" };
                    _worker.Start();
                }
                signals = _signals;
            }
            try
            {
                signals.Add(signal);
            }
            catch (InvalidOperationException)
            {
            }
        }

        private static void WorkerLoop()
        {
            var signals = _signals;
            while (signals != null && !signals.IsAddingCompleted)
            {
                Signal signal = null;
                try
                {
                    signals.TryTake(out signal, 1000);
                }
                catch (Exception)
                {
                    break;
                }
                try
                {
                    if (signal == null) HandleTick();
                    else HandleSignal(signal);
                }
                catch (Exception ex)
                {
                    PluginLog.Warning(ex, "Vizhi voice conversation error");
                }
            }
            if (IsActive) Deactivate();
        }

        private static void HandleSignal(Signal signal)
        {
            switch (signal.Kind)
            {
                case SignalKind.Start:
                    HandleStart();
                    break;
                case SignalKind.End:
                    if (!IsActive) return;
                    Deactivate();
                    VizhiSpeechSynthesizer.Speak("Ending voice conversation.", null);
                    break;
                case SignalKind.Tap:
                    if (IsActive) HandleTap();
                    break;
                case SignalKind.StateChanged:
                    if (IsActive) HandleStateChanged(signal.Slots);
                    break;
                case SignalKind.RecordingStopped:
                    if (IsActive && signal.TurnId == _turnId && Face == ConversationFace.Listening) SetFace(ConversationFace.Transcribing);
                    break;
                case SignalKind.TranscriptReady:
                    if (IsActive && signal.TurnId == _turnId) HandleTranscript(signal.Transcript);
                    break;
                case SignalKind.SpeechFinished:
                    if (IsActive && signal.UtteranceId == _utteranceId) HandleSpeechFinished();
                    break;
                case SignalKind.SummaryReady:
                    if (IsActive && signal.TurnId == _summaryId) HandleSummaryReady(signal.Transcript);
                    break;
            }
        }

        private static void HandleStart()
        {
            if (IsActive) return;
            PluginLog.Info("Vizhi voice conversation started");
            Volatile.Write(ref _active, 1);
            _muted = false;
            _emptyTurns = 0;
            _turnSlot = 0;
            _turnSessionId = null;
            _listenAfterSpeech = false;
            _lastInteractionAt = DateTime.UtcNow;
            AnnouncedQuestions.Clear();
            PendingAnnouncements.Clear();
            _previousSlots = ReadSlots();
            VizhiRuntime.SetSlotsObserver(OnSlotsRefreshed);
            RecordCurrentQuestions(_previousSlots);
            Speak($"Voice conversation on. {BuildDigest(_previousSlots)}", listenAfter: true);
        }

        private static void Deactivate()
        {
            PluginLog.Info("Vizhi voice conversation ended");
            Volatile.Write(ref _active, 0);
            VizhiRuntime.SetSlotsObserver(null);
            _turnId++;
            _utteranceId++;
            _summaryId++;
            _muted = false;
            _listenAfterSpeech = false;
            AnnouncedQuestions.Clear();
            PendingAnnouncements.Clear();
            VizhiVoiceRuntime.CancelTurn();
            VizhiSpeechSynthesizer.Cancel();
            SetFace(ConversationFace.Off);
        }

        // Tap means "I want to talk" (or "stop talking/listening"), not mute: the microphone
        // can always be opened by hand, while spoken "mute" keeps it closed after announcements.
        private static void HandleTap()
        {
            _lastInteractionAt = DateTime.UtcNow;
            switch (Face)
            {
                case ConversationFace.Speaking:
                    _utteranceId++;
                    _listenAfterSpeech = false;
                    VizhiSpeechSynthesizer.Cancel();
                    StartListenTurn();
                    return;
                case ConversationFace.Listening:
                    _turnId++;
                    VizhiVoiceRuntime.CancelTurn();
                    SetFace(ConversationFace.Monitoring);
                    DrainAnnouncements();
                    return;
                case ConversationFace.Transcribing:
                    return;
                case ConversationFace.Muted:
                    _muted = false;
                    StartListenTurn();
                    return;
                default:
                    StartListenTurn();
                    return;
            }
        }

        private static void HandleStateChanged(GridSlotState[] slots)
        {
            var previous = _previousSlots ?? Array.Empty<GridSlotState>();
            _previousSlots = slots;

            var currentSessions = new Dictionary<String, GridSlotState>(StringComparer.Ordinal);
            foreach (var state in slots)
            {
                if (state?.IsOccupied == true && !String.IsNullOrEmpty(state.SessionId)) currentSessions[state.SessionId] = state;
            }

            foreach (var state in previous)
            {
                if (state?.IsOccupied != true || String.IsNullOrEmpty(state.SessionId)) continue;
                if (currentSessions.TryGetValue(state.SessionId, out var current) && !String.Equals(current.State, "dead", StringComparison.OrdinalIgnoreCase))
                {
                    if (String.Equals(state.State, "busy", StringComparison.OrdinalIgnoreCase)
                        && String.Equals(current.State, "idle", StringComparison.OrdinalIgnoreCase))
                    {
                        var summary = SpokenSummary.Summarize(current.LastMessage, 240);
                        var multipleSessions = currentSessions.Count > 1;
                        var announcement = summary.Length == 0
                            ? multipleSessions ? $"{SpokenName(current, slots)} finished." : "Finished."
                            : multipleSessions ? $"{SpokenName(current, slots)}: {summary}" : summary;
                        QueueAnnouncement(announcement, listenAfter: false);
                    }
                    continue;
                }
                AnnouncedQuestions.Remove(state.SessionId);
                QueueAnnouncement($"{SpokenName(state, previous)} session ended.", listenAfter: false);
                if (String.Equals(state.SessionId, _turnSessionId, StringComparison.Ordinal))
                {
                    _turnId++;
                    VizhiVoiceRuntime.CancelTurn();
                    if (Face == ConversationFace.Listening || Face == ConversationFace.Transcribing) SetFace(ConversationFace.Monitoring);
                }
            }

            foreach (var state in slots)
            {
                if (state?.IsOccupied != true || !IsWaiting(state)) continue;
                var key = QuestionKey(state);
                if (AnnouncedQuestions.TryGetValue(state.SessionId, out var announced) && String.Equals(announced, key, StringComparison.Ordinal)) continue;
                AnnouncedQuestions[state.SessionId] = key;
                QueueAnnouncement(BuildQuestionAnnouncement(state, slots), listenAfter: true);
            }

            if (currentSessions.Count == 0 && previous.Length > 0 && HasOccupied(previous))
            {
                Deactivate();
                VizhiSpeechSynthesizer.Speak("All sessions ended. Ending voice conversation.", null);
                return;
            }

            DrainAnnouncements();
        }

        private static void HandleTranscript(String transcript)
        {
            _turnSlot = 0;
            var sessionId = _turnSessionId;
            _turnSessionId = null;

            if (transcript == null)
            {
                Speak("Transcription timed out.", listenAfter: false);
                return;
            }

            var intent = VoiceIntentCatalog.Parse(transcript);
            PluginLog.Info($"Vizhi voice intent '{intent.Id}' from a {transcript.Length}-char transcript");
            if (String.Equals(intent.Id, VoiceIntentCatalog.PromptIntentId, StringComparison.Ordinal) && intent.PromptText.Length == 0)
            {
                _emptyTurns++;
                if (_emptyTurns < VoiceIntentCatalog.MaxEmptyTurns)
                {
                    Speak("I didn't catch that.", listenAfter: true);
                }
                else
                {
                    _emptyTurns = 0;
                    SetFace(ConversationFace.Monitoring);
                    DrainAnnouncements();
                }
                return;
            }

            _emptyTurns = 0;
            _lastInteractionAt = DateTime.UtcNow;
            HandleIntent(intent, sessionId);
        }

        private static void HandleIntent(VoiceIntent intent, String turnSessionId)
        {
            switch (intent.Id)
            {
                case "approve":
                case "confirm_approve":
                    HandleApproval(intent.Id, turnSessionId);
                    return;
                case "deny":
                    HandleDeny(turnSessionId);
                    return;
                case "status":
                    Speak(BuildDigest(ReadSlots()), listenAfter: false);
                    return;
                case "read_more":
                    HandleReadMore();
                    return;
                case "summarize":
                    HandleSummarize();
                    return;
                case VoiceIntentCatalog.FocusSessionIntentId:
                    HandleFocus(intent.Slot);
                    return;
                case "screenshot":
                    HandleScreenshot();
                    return;
                case "mute":
                    _muted = true;
                    SetFace(ConversationFace.Muted);
                    return;
                case "end_conversation":
                    Deactivate();
                    VizhiSpeechSynthesizer.Speak("Goodbye.", null);
                    return;
                default:
                    HandlePrompt(intent.PromptText, turnSessionId);
                    return;
            }
        }

        private static Boolean TryGetTurnTarget(String turnSessionId, out Int32 slot, out GridSlotState state)
        {
            slot = 0;
            state = null;
            for (var candidate = 1; candidate <= 6; candidate++)
            {
                var candidateState = VizhiRuntime.GetSlot(candidate);
                if (candidateState.IsOccupied && String.Equals(candidateState.SessionId, turnSessionId, StringComparison.Ordinal))
                {
                    slot = candidate;
                    state = candidateState;
                    return true;
                }
            }
            return false;
        }

        private static void HandleApproval(String intentId, String turnSessionId)
        {
            if (!TryGetTurnTarget(turnSessionId, out var slot, out var state))
            {
                Speak("That session is no longer available.", listenAfter: false);
                return;
            }
            if (!IsWaiting(state))
            {
                Speak("That request is no longer pending.", listenAfter: false);
                return;
            }
            if (VoiceIntentCatalog.ApprovalRequiresConfirmation(intentId, VizhiRuntime.IsHighRiskSlot(slot)))
            {
                Speak($"High risk: {DescribePending(state)}. Say {VoiceIntentCatalog.ConfirmPhrase} to allow, or no to deny.", listenAfter: true);
                return;
            }
            VizhiRuntime.WriteAction("approve", slot);
            Speak("Approved.", listenAfter: false);
        }

        private static void HandleDeny(String turnSessionId)
        {
            if (!TryGetTurnTarget(turnSessionId, out var slot, out var state))
            {
                Speak("That session is no longer available.", listenAfter: false);
                return;
            }
            if (!IsWaiting(state))
            {
                Speak("That request is no longer pending.", listenAfter: false);
                return;
            }
            VizhiRuntime.WriteAction("deny", slot);
            Speak("Denied.", listenAfter: false);
        }

        private static void HandleFocus(Int32 slot)
        {
            var state = VizhiRuntime.GetSlot(slot);
            if (!state.IsOccupied)
            {
                Speak($"Session {slot} is empty.", listenAfter: false);
                return;
            }
            VizhiRuntime.WriteFocusAction(slot);
            VizhiRuntime.SetFocusedSlot(slot);
            var slots = ReadSlots();
            if (IsWaiting(state))
            {
                AnnouncedQuestions[state.SessionId] = QuestionKey(state);
                Speak($"Switched to {SpokenName(state, slots)}. {BuildQuestionAnnouncement(state, slots)}", listenAfter: true);
                return;
            }
            Speak($"Switched to {SpokenName(state, slots)}.", listenAfter: false);
        }

        private static void HandleReadMore()
        {
            var slot = VizhiRuntime.ResolveFocusedSlot();
            var state = slot > 0 ? VizhiRuntime.GetSlot(slot) : null;
            var summary = state?.IsOccupied == true ? SpokenSummary.Summarize(state.LastMessage, 700) : String.Empty;
            Speak(summary.Length == 0 ? "There is nothing to read right now." : summary, listenAfter: false);
        }

        private static void HandleSummarize()
        {
            var slot = VizhiRuntime.ResolveFocusedSlot();
            var state = slot > 0 ? VizhiRuntime.GetSlot(slot) : null;
            var message = state?.IsOccupied == true ? state.LastMessage : null;
            if (String.IsNullOrWhiteSpace(message))
            {
                Speak("There is nothing to summarize.", listenAfter: false);
                return;
            }
            var summaryId = ++_summaryId;
            VizhiCodexSummarizer.Summarize(message, summary => Enqueue(new Signal
            {
                Kind = SignalKind.SummaryReady,
                TurnId = summaryId,
                Transcript = summary,
            }));
            Speak("Summarizing.", listenAfter: false);
        }

        private static void HandleSummaryReady(String summary)
        {
            if (String.IsNullOrWhiteSpace(summary))
            {
                Speak("The summarizer is unavailable. There's more on screen.", listenAfter: false);
                return;
            }
            Speak(SpokenSummary.Summarize(summary, 700), listenAfter: false);
        }

        private static void HandleScreenshot()
        {
            var slot = VizhiRuntime.ResolveFocusedSlot();
            if (slot <= 0)
            {
                Speak("No session is selected.", listenAfter: false);
                return;
            }
            VizhiRuntime.WriteAction("screenshot", slot);
            Speak("Screenshot started. Select an area, then speak your context.", listenAfter: false);
        }

        private static void HandlePrompt(String text, String turnSessionId)
        {
            if (!TryGetTurnTarget(turnSessionId, out var slot, out var state))
            {
                Speak("That session is no longer available.", listenAfter: false);
                return;
            }
            if (VizhiRuntime.HasPendingScreenshotDraft(state.SessionId)) VizhiRuntime.WritePinnedVoiceAction(slot, state.SessionId, text);
            else VizhiRuntime.WriteVoiceAction(slot, text);
            if (OccupiedSessionCount() > 1)
            {
                Speak($"Sent to {SpokenName(state, ReadSlots())}.", listenAfter: false);
                return;
            }
            VizhiSpeechSynthesizer.PlayCue();
            SetFace(ConversationFace.Monitoring);
            DrainAnnouncements();
        }

        private static Int32 OccupiedSessionCount()
        {
            var count = 0;
            for (var slot = 1; slot <= 6; slot++)
            {
                if (VizhiRuntime.GetSlot(slot).IsOccupied) count++;
            }
            return count;
        }

        private static void HandleSpeechFinished()
        {
            if (_muted)
            {
                SetFace(ConversationFace.Muted);
                return;
            }
            if (_listenAfterSpeech)
            {
                _listenAfterSpeech = false;
                StartListenTurn();
                return;
            }
            SetFace(ConversationFace.Monitoring);
            DrainAnnouncements();
        }

        private static void HandleTick()
        {
            if (!IsActive) return;
            if (Face == ConversationFace.Monitoring) DrainAnnouncements();
            if (DateTime.UtcNow - _lastInteractionAt > TimeSpan.FromMinutes(VoiceIntentCatalog.IdleTimeoutMinutes))
            {
                Deactivate();
                VizhiVoiceRuntime.Notify("Vizhi ended the voice conversation after inactivity.");
            }
        }

        private static void StartListenTurn()
        {
            var slot = VizhiRuntime.ResolveFocusedSlot();
            var state = slot > 0 ? VizhiRuntime.GetSlot(slot) : null;
            if (state?.IsOccupied != true)
            {
                SetFace(ConversationFace.Monitoring);
                return;
            }
            var turnId = ++_turnId;
            var options = new VoiceTurnOptions
            {
                Vad = true,
                SilenceSeconds = VoiceIntentCatalog.SilenceSeconds,
                MaxSeconds = VoiceIntentCatalog.TurnMaxSeconds,
                TranscriptWaitSeconds = VoiceIntentCatalog.TurnMaxSeconds + 15,
            };
            var started = VizhiVoiceRuntime.StartTurn(
                slot,
                options,
                transcript => Enqueue(new Signal { Kind = SignalKind.TranscriptReady, TurnId = turnId, Transcript = transcript }),
                () => Enqueue(new Signal { Kind = SignalKind.RecordingStopped, TurnId = turnId }));
            if (!started)
            {
                SetFace(ConversationFace.Monitoring);
                return;
            }
            _turnSlot = slot;
            _turnSessionId = state.SessionId;
            SetFace(ConversationFace.Listening);
        }

        private static void Speak(String text, Boolean listenAfter)
        {
            _listenAfterSpeech = listenAfter && !_muted;
            var utteranceId = ++_utteranceId;
            SetFace(ConversationFace.Speaking);
            VizhiSpeechSynthesizer.Speak(text, () => Enqueue(new Signal { Kind = SignalKind.SpeechFinished, UtteranceId = utteranceId }));
        }

        private static void QueueAnnouncement(String text, Boolean listenAfter)
        {
            _lastInteractionAt = DateTime.UtcNow;
            PendingAnnouncements.Enqueue(new Announcement { Text = text, ListenAfter = listenAfter });
        }

        private static void DrainAnnouncements()
        {
            if (PendingAnnouncements.Count == 0) return;
            if (Face != ConversationFace.Monitoring && Face != ConversationFace.Muted && Face != ConversationFace.Off) return;
            var announcement = PendingAnnouncements.Dequeue();
            Speak(announcement.Text, announcement.ListenAfter);
        }

        private static void RecordCurrentQuestions(GridSlotState[] slots)
        {
            foreach (var state in slots)
            {
                if (state?.IsOccupied == true && IsWaiting(state)) QueueAnnouncement(BuildQuestionAnnouncement(state, slots), listenAfter: true);
            }
        }

        private static void OnSlotsRefreshed(GridSlotState[] slots, Int32 focusedSlot)
            => Enqueue(new Signal { Kind = SignalKind.StateChanged, Slots = slots });

        private static String BuildQuestionAnnouncement(GridSlotState state, GridSlotState[] slots)
        {
            var question = String.IsNullOrWhiteSpace(state.Question) ? "Approval requested" : state.Question;
            var announcement = new StringBuilder($"{SpokenName(state, slots)} is asking: {question}");
            if (!announcement.ToString().EndsWith(".", StringComparison.Ordinal)) announcement.Append('.');
            var slot = FindSlot(state.SessionId);
            if (slot > 0 && VizhiRuntime.IsHighRiskSlot(slot))
            {
                announcement.Append($" High risk: {DescribePending(state)}. Say {VoiceIntentCatalog.ConfirmPhrase} to allow, or no to deny.");
            }
            else
            {
                announcement.Append(" Say yes to approve, or no to deny.");
            }
            return announcement.ToString();
        }

        private static String BuildDigest(GridSlotState[] slots)
        {
            var parts = new List<String>();
            var waiting = 0;
            foreach (var state in slots)
            {
                if (state?.IsOccupied != true) continue;
                String status;
                if (IsWaiting(state))
                {
                    status = "waiting for approval";
                    waiting++;
                }
                else if (String.Equals(state.State, "busy", StringComparison.OrdinalIgnoreCase)) status = "working";
                else status = "ready";
                parts.Add($"{SpokenName(state, slots)} is {status}");
            }
            if (parts.Count == 0) return "No sessions are running.";
            var summary = parts.Count == 1 ? "One session" : $"{parts.Count} sessions";
            if (waiting > 0) summary += waiting == 1 ? ", one needs you" : $", {waiting} need you";
            return $"{summary}. {String.Join(". ", parts)}.";
        }

        private static Int32 FindSlot(String sessionId)
        {
            for (var slot = 1; slot <= 6; slot++)
            {
                var state = VizhiRuntime.GetSlot(slot);
                if (state.IsOccupied && String.Equals(state.SessionId, sessionId, StringComparison.Ordinal)) return slot;
            }
            return 0;
        }

        private static GridSlotState[] ReadSlots()
        {
            var slots = new GridSlotState[6];
            for (var slot = 1; slot <= 6; slot++) slots[slot - 1] = VizhiRuntime.GetSlot(slot);
            return slots;
        }

        private static Boolean HasOccupied(GridSlotState[] slots)
        {
            foreach (var state in slots)
            {
                if (state?.IsOccupied == true) return true;
            }
            return false;
        }

        private static Boolean IsWaiting(GridSlotState state)
            => String.Equals(state.State, "waiting", StringComparison.OrdinalIgnoreCase);

        private static String QuestionKey(GridSlotState state)
            => $"{state.State}|{state.WaitingKind}|{state.Question}";

        private static String ProjectName(GridSlotState state)
            => String.IsNullOrWhiteSpace(state.Project) ? "Codex" : state.Project;

        // Project names only disambiguate when unique; same-named sessions are
        // addressed by slot, matching the "switch to session N" vocabulary.
        private static String SpokenName(GridSlotState state, GridSlotState[] slots)
        {
            var name = ProjectName(state);
            var occurrences = 0;
            foreach (var other in slots ?? Array.Empty<GridSlotState>())
            {
                if (other?.IsOccupied == true && String.Equals(ProjectName(other), name, StringComparison.OrdinalIgnoreCase)) occurrences++;
            }
            return occurrences > 1 ? $"Session {state.Slot}" : name;
        }

        private static String DescribePending(GridSlotState state)
        {
            var tool = state.PendingTool ?? String.Empty;
            var command = state.PendingCommand ?? String.Empty;
            var pending = $"{tool} {command}".Trim();
            return pending.Length == 0 ? "a pending command" : pending;
        }

        private static void SetFace(ConversationFace face)
        {
            Volatile.Write(ref _faceValue, (Int32)face);
            FaceChanged?.Invoke();
        }
    }
}
