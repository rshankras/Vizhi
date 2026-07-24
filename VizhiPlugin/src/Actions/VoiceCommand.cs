namespace Loupedeck.VizhiPlugin
{
    using System;
    using System.Threading;

    public sealed class VoiceCommand : PluginDynamicCommand
    {
        private const Int32 HoldThresholdMilliseconds = 600;
        private readonly ListeningFace _face;
        private Timer _conversationAnimator;
        private DateTime _pressStartedAt = DateTime.MinValue;

        public VoiceCommand()
            : base(displayName: "Voice", description: "Tap to record and send to the focused session; hold to start or end a spoken conversation with every session.", groupName: "Vizhi Operate")
        {
            this._face = new ListeningFace(() => this.ActionImageChanged());
        }

        protected override Boolean OnLoad()
        {
            VizhiConversationRuntime.FaceChanged += this.OnConversationFaceChanged;
            return base.OnLoad();
        }

        protected override Boolean OnUnload()
        {
            VizhiConversationRuntime.FaceChanged -= this.OnConversationFaceChanged;
            this._conversationAnimator?.Dispose();
            this._conversationAnimator = null;
            return base.OnUnload();
        }

        protected override void RunCommand(String actionParameter) => this.HandleTapAction();

        private void HandleTapAction()
        {
            if (VizhiConversationRuntime.IsActive)
            {
                VizhiConversationRuntime.TapWhileActive();
                this.ActionImageChanged();
                return;
            }
            var slot = VizhiRuntime.ResolveFocusedSlot();
            if (!this._face.IsActive)
            {
                if (slot > 0 && VizhiVoiceRuntime.Start(slot)) this._face.Start();
            }
            else
            {
                VizhiVoiceRuntime.Stop();
                this._face.Stop();
            }
            this.ActionImageChanged();
        }

        // The MX Creative Keypad delivers only Press/Release pairs here (PressDuration is
        // always 0 and the SDK LongPress event fires at most once), so hold detection
        // times the press ourselves and never forwards Press/Release to the base class,
        // which would otherwise also dispatch RunCommand.
        protected override Boolean ProcessButtonEvent2(String actionParameter, DeviceButtonEvent2 buttonEvent)
        {
            PluginLog.Verbose($"Vizhi voice key button event {buttonEvent.EventType} after {buttonEvent.PressDuration}ms");
            switch (buttonEvent.EventType)
            {
                case DeviceButtonEventType.Press:
                    this._pressStartedAt = DateTime.UtcNow;
                    return true;
                case DeviceButtonEventType.LongPress:
                    this._pressStartedAt = DateTime.MinValue;
                    this.ToggleConversation();
                    return true;
                case DeviceButtonEventType.RepeatPress:
                    return true;
                case DeviceButtonEventType.Release:
                {
                    var pressStartedAt = this._pressStartedAt;
                    this._pressStartedAt = DateTime.MinValue;
                    if (pressStartedAt == DateTime.MinValue) return true;
                    if (DateTime.UtcNow - pressStartedAt >= TimeSpan.FromMilliseconds(HoldThresholdMilliseconds)) this.ToggleConversation();
                    else this.HandleTapAction();
                    return true;
                }
                default:
                    return base.ProcessButtonEvent2(actionParameter, buttonEvent);
            }
        }

        protected override Boolean ProcessTouchEvent(String actionParameter, DeviceTouchEvent touchEvent)
        {
            PluginLog.Verbose($"Vizhi voice key touch event {touchEvent.EventType}");
            if (touchEvent.EventType == DeviceTouchEventType.LongPress || touchEvent.EventType == DeviceTouchEventType.DoubleTap)
            {
                this.ToggleConversation();
                return true;
            }
            return base.ProcessTouchEvent(actionParameter, touchEvent);
        }

        private void ToggleConversation()
        {
            if (this._face.IsActive)
            {
                VizhiVoiceRuntime.CancelTurn();
                this._face.Stop();
            }
            VizhiConversationRuntime.Toggle();
            this.ActionImageChanged();
        }

        private void OnConversationFaceChanged()
        {
            var face = VizhiConversationRuntime.Face;
            var animated = face == ConversationFace.Listening || face == ConversationFace.Transcribing || face == ConversationFace.Speaking;
            if (animated && this._conversationAnimator == null)
            {
                this._conversationAnimator = new Timer(_ => this.ActionImageChanged(), null, 250, 250);
            }
            else if (!animated)
            {
                this._conversationAnimator?.Dispose();
                this._conversationAnimator = null;
            }
            this.ActionImageChanged();
        }

        protected override String GetCommandDisplayName(String actionParameter, PluginImageSize imageSize)
        {
            if (VizhiConversationRuntime.IsActive)
            {
                return VizhiConversationRuntime.Face switch
                {
                    ConversationFace.Listening => "Listening",
                    ConversationFace.Transcribing => "Thinking",
                    ConversationFace.Speaking => "Speaking",
                    ConversationFace.Muted => "Muted",
                    _ => "Converse",
                };
            }
            return this._face.IsActive ? "Listening" : "Voice";
        }

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize)
        {
            if (VizhiConversationRuntime.IsActive)
            {
                return VizhiConversationRuntime.Face switch
                {
                    ConversationFace.Listening => KeyImage.Render(imageSize, "Listening", AnimatedIcon("wave")),
                    ConversationFace.Transcribing => KeyImage.Render(imageSize, "Thinking", AnimatedIcon("busy")),
                    ConversationFace.Speaking => KeyImage.Render(imageSize, "Speaking", AnimatedIcon("speak")),
                    ConversationFace.Muted => KeyImage.Render(imageSize, "Muted", "mute"),
                    _ => KeyImage.Render(imageSize, "Converse", "converse"),
                };
            }
            return this._face.IsActive
                ? KeyImage.Render(imageSize, "Listening", this._face.Icon)
                : KeyImage.Render(imageSize, "Voice", "voice");
        }

        private static String AnimatedIcon(String prefix)
            => $"{prefix}{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 500 % 4}";
    }
}
