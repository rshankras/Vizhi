namespace Loupedeck.VizhiPlugin
{
    using System;

    public interface IRefreshableCommand
    {
        void RefreshFace();
        void RefreshAnimatedFaces();
        Boolean RequiresAnimation { get; }
    }

    public sealed class GridCommand : PluginDynamicCommand, IRefreshableCommand
    {
        private const Int32 SlotCount = 6;
        private const String SlotDescription = "Live session capacity. Active Codex sessions fill the earliest keys; press to select and open its assigned session.";

        public GridCommand()
            : base()
        {
            for (var slot = 1; slot <= SlotCount; slot++)
            {
                this.AddParameter(slot.ToString(), $"Session {slot}", "Vizhi Sessions").SetDescription(SlotDescription);
            }
            VizhiRuntime.Register(this);
        }

        protected override void RunCommand(String actionParameter)
        {
            if (TryGetSlot(actionParameter, out var slot) && VizhiRuntime.GetSlot(slot).IsOccupied)
            {
                VizhiRuntime.SetFocusedSlot(slot);
                VizhiRuntime.WriteFocusAction(slot);
            }
        }

        protected override String GetCommandDisplayName(String actionParameter, PluginImageSize imageSize)
            => TryGetSlot(actionParameter, out var slot) ? VizhiRuntime.RenderSlotLabel(slot) : null;

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize)
            => TryGetSlot(actionParameter, out var slot) ? VizhiRuntime.RenderSlotImage(slot, imageSize) : null;

        public void RefreshFace()
        {
            for (var slot = 1; slot <= SlotCount; slot++) this.ActionImageChanged(slot.ToString());
        }

        public void RefreshAnimatedFaces()
        {
            for (var slot = 1; slot <= SlotCount; slot++)
            {
                if (VizhiRuntime.RequiresSlotAnimation(slot)) this.ActionImageChanged(slot.ToString());
            }
        }

        public Boolean RequiresAnimation
        {
            get
            {
                for (var slot = 1; slot <= SlotCount; slot++)
                {
                    if (VizhiRuntime.RequiresSlotAnimation(slot)) return true;
                }
                return false;
            }
        }

        private static Boolean TryGetSlot(String actionParameter, out Int32 slot)
            => Int32.TryParse(actionParameter, out slot) && slot >= 1 && slot <= SlotCount;
    }

    public abstract class FocusedSessionCommand : PluginDynamicCommand, IRefreshableCommand
    {
        private readonly String _actionType;
        private readonly String _label;

        protected FocusedSessionCommand(String label, String description, String actionType)
            : base(displayName: label, description: description, groupName: "Vizhi Operate")
        {
            this._actionType = actionType;
            this._label = label;
            VizhiRuntime.Register(this);
        }

        protected override void RunCommand(String actionParameter)
        {
            var slot = VizhiRuntime.ResolveFocusedSlot();
            if (slot > 0 && VizhiRuntime.GetSlot(slot).IsOccupied
                && String.Equals(VizhiRuntime.GetSlot(slot).State, "waiting", StringComparison.OrdinalIgnoreCase))
            {
                VizhiRuntime.WriteAction(this._actionType, slot);
            }
        }

        protected override String GetCommandDisplayName(String actionParameter, PluginImageSize imageSize)
            => VizhiRuntime.RenderFocusedAction(this._actionType);

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize)
        {
            var isWaiting = VizhiRuntime.IsFocusedApprovalWaiting(out var isHighRisk);
            return KeyImage.RenderApprovalAction(imageSize, this._label, this._actionType == "approve" ? "approve" : "deny", isWaiting, isHighRisk);
        }

        public void RefreshFace() => this.ActionImageChanged();

        public void RefreshAnimatedFaces() => this.ActionImageChanged();

        public Boolean RequiresAnimation => false;
    }

    public sealed class ApproveFocusedCommand : FocusedSessionCommand { public ApproveFocusedCommand() : base("Yes", "Approve the pending request in the focused Codex session.", "approve") { } }
    public sealed class DenyFocusedCommand : FocusedSessionCommand { public DenyFocusedCommand() : base("No", "Deny the pending request in the focused Codex session.", "deny") { } }

    public abstract class SessionShortcutCommand : PluginDynamicCommand
    {
        private readonly String _actionType;
        private readonly String _icon;
        private readonly String _label;

        protected SessionShortcutCommand(String label, String description, String actionType, String icon)
            : base(displayName: label, description: description, groupName: "Vizhi Commands")
        {
            this._actionType = actionType;
            this._icon = icon;
            this._label = label;
        }

        protected override void RunCommand(String actionParameter)
        {
            var slot = VizhiRuntime.ResolveFocusedSlot();
            if (slot > 0 && VizhiRuntime.GetSlot(slot).IsOccupied)
            {
                VizhiRuntime.WriteAction(this._actionType, slot);
            }
        }

        protected override String GetCommandDisplayName(String actionParameter, PluginImageSize imageSize) => this._label;

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize)
            => KeyImage.Render(imageSize, this._label, this._icon);
    }

    public sealed class InterruptSessionCommand : SessionShortcutCommand { public InterruptSessionCommand() : base("Esc", "Interrupt the focused Codex task.", "interrupt", "interrupt") { } }
    public sealed class CompactSessionCommand : SessionShortcutCommand { public CompactSessionCommand() : base("Compact", "Compact context in the focused Codex session.", "compact", "compact") { } }
    public sealed class NewSessionCommand : SessionShortcutCommand { public NewSessionCommand() : base("New", "Start a fresh Codex conversation in the focused Terminal tab.", "new_session", "newsession") { } }
    public sealed class ExitSessionCommand : SessionShortcutCommand { public ExitSessionCommand() : base("Exit", "Exit Codex in the focused Terminal tab and release its session key.", "exit", "exit") { } }
    public sealed class ModelSessionCommand : SessionShortcutCommand { public ModelSessionCommand() : base("Model", "Open Codex's live model and reasoning picker for the focused session.", "model", "model") { } }
    public sealed class ModeSessionCommand : SessionShortcutCommand { public ModeSessionCommand() : base("Mode", "Open Codex's mode and approval picker for the focused session.", "mode", "mode") { } }
    public sealed class AgentSessionCommand : SessionShortcutCommand { public AgentSessionCommand() : base("Agent", "Open Codex's subagent thread picker for the focused session.", "agent", "agent") { } }
    public sealed class ForkSessionCommand : SessionShortcutCommand { public ForkSessionCommand() : base("Fork", "Open a branched copy of the focused Codex session in a new Terminal tab.", "fork", "fork") { } }

    public sealed class FavoritePromptCommand : PluginDynamicCommand, IRefreshableCommand
    {
        public FavoritePromptCommand()
            : base(displayName: "Favorite", description: "Run the prompt currently configured as Favorite.", groupName: "Vizhi Commands")
        {
            VizhiRuntime.Register(this);
        }

        protected override void RunCommand(String actionParameter)
        {
            var slot = VizhiRuntime.ResolveFocusedSlot();
            if (slot > 0 && VizhiRuntime.GetSlot(slot).IsOccupied) VizhiRuntime.WriteAction("favorite", slot);
        }

        protected override String GetCommandDisplayName(String actionParameter, PluginImageSize imageSize)
            => "Favorite";

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize)
            => KeyImage.Render(imageSize, "Favorite", "favorite");

        public void RefreshFace() => this.ActionImageChanged();

        public void RefreshAnimatedFaces() { }

        public Boolean RequiresAnimation => false;
    }

    public sealed class TemplateCommand : PluginDynamicCommand, IRefreshableCommand
    {
        public TemplateCommand()
            : base()
        {
            foreach (var template in TemplateCatalog.All)
            {
                this.AddParameter(template.Id, template.Label, template.Group).SetDescription(template.Description);
            }
            VizhiRuntime.Register(this);
        }

        protected override void RunCommand(String actionParameter)
        {
            var slot = VizhiRuntime.ResolveFocusedSlot();
            if (slot > 0 && VizhiRuntime.GetSlot(slot).IsOccupied && TemplateCatalog.TryGet(actionParameter, out var template))
            {
                VizhiRuntime.WritePromptTemplateAction(slot, template.Id);
            }
            this.ActionImageChanged();
        }

        protected override String GetCommandDisplayName(String actionParameter, PluginImageSize imageSize) => TemplateCatalog.GetLabel(actionParameter);

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize)
            => TemplateCatalog.TryGet(actionParameter, out var template)
                ? KeyImage.Render(imageSize, TemplateCatalog.GetLabel(template.Id), template.Icon)
                : null;

        public void RefreshFace()
        {
            foreach (var template in TemplateCatalog.All) this.ActionImageChanged(template.Id);
        }

        public void RefreshAnimatedFaces() { }

        public Boolean RequiresAnimation => false;
    }

    public sealed class NavigationCommand : PluginDynamicCommand
    {
        private static readonly NavigationDefinition[] Definitions = new[]
        {
            new NavigationDefinition("tab", "Tab", "tabkey", "Cycle a visible Codex completion or menu option in the focused session."),
            new NavigationDefinition("up", "Up", "up", "Move up through the focused session's active Codex menu."),
            new NavigationDefinition("down", "Down", "down", "Move down through the focused session's active Codex menu."),
            new NavigationDefinition("enter", "Enter", "enter", "Confirm the focused Codex choice or submit its prompt."),
            new NavigationDefinition("page_up", "Page Up", "pageup", "Scroll up through the focused Terminal session transcript."),
            new NavigationDefinition("page_down", "Page Down", "pagedown", "Scroll down through the focused Terminal session transcript."),
        };

        public NavigationCommand()
            : base()
        {
            foreach (var definition in Definitions)
            {
                this.AddParameter(definition.Key, definition.Label, "Vizhi Navigate").SetDescription(definition.Description);
            }
        }

        protected override void RunCommand(String actionParameter)
        {
            var slot = VizhiRuntime.ResolveFocusedSlot();
            if (slot > 0 && VizhiRuntime.GetSlot(slot).IsOccupied && TryGet(actionParameter, out var definition))
            {
                VizhiRuntime.WriteKeyAction(slot, definition.Key);
            }
        }

        protected override String GetCommandDisplayName(String actionParameter, PluginImageSize imageSize)
            => TryGet(actionParameter, out var definition) ? definition.Label : null;

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize)
            => TryGet(actionParameter, out var definition) ? KeyImage.Render(imageSize, definition.Label, definition.Icon) : null;

        private static Boolean TryGet(String key, out NavigationDefinition definition)
        {
            foreach (var candidate in Definitions)
            {
                if (String.Equals(candidate.Key, key, StringComparison.Ordinal))
                {
                    definition = candidate;
                    return true;
                }
            }
            definition = null;
            return false;
        }
    }

    public sealed class ContextCommand : PluginDynamicCommand, IRefreshableCommand
    {
        private static readonly NavigationDefinition[] Definitions = new[]
        {
            new NavigationDefinition("clipboard", "Clipboard", "clipboard", "Paste the current macOS text clipboard into the focused Codex session."),
            new NavigationDefinition("screenshot", "Screenshot", "capture", "Capture a screen area and stage the image in the focused Codex prompt; send it with Voice or Enter."),
        };

        public ContextCommand()
            : base()
        {
            foreach (var definition in Definitions)
            {
                this.AddParameter(definition.Key, definition.Label, "Vizhi Context").SetDescription(definition.Description);
            }
            VizhiRuntime.Register(this);
        }

        protected override void RunCommand(String actionParameter)
        {
            var slot = VizhiRuntime.ResolveFocusedSlot();
            if (slot > 0 && VizhiRuntime.GetSlot(slot).IsOccupied && TryGet(actionParameter, out var definition))
            {
                VizhiRuntime.WriteAction(definition.Key, slot);
            }
        }

        protected override String GetCommandDisplayName(String actionParameter, PluginImageSize imageSize)
        {
            if (!TryGet(actionParameter, out var definition)) return null;
            var slot = VizhiRuntime.FocusedSlot;
            return definition.Key == "screenshot" && slot > 0 && VizhiRuntime.HasPendingScreenshotDraft(slot)
                ? "Draft"
                : definition.Label;
        }

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize)
            => TryGet(actionParameter, out var definition)
                ? KeyImage.Render(imageSize, this.GetCommandDisplayName(actionParameter, imageSize), definition.Icon)
                : null;

        public void RefreshFace() => this.ActionImageChanged("screenshot");

        public void RefreshAnimatedFaces() { }

        public Boolean RequiresAnimation => false;

        private static Boolean TryGet(String key, out NavigationDefinition definition)
        {
            foreach (var candidate in Definitions)
            {
                if (String.Equals(candidate.Key, key, StringComparison.Ordinal))
                {
                    definition = candidate;
                    return true;
                }
            }
            definition = null;
            return false;
        }
    }

    public sealed class UsageCommand : PluginDynamicCommand, IRefreshableCommand
    {
        public UsageCommand()
            : base(displayName: "Usage", description: "Show focused-session context and live cost or model detail; tap to focus it.", groupName: "Vizhi Status")
        {
            VizhiRuntime.Register(this);
        }

        protected override void RunCommand(String actionParameter)
        {
            var slot = VizhiRuntime.ResolveFocusedSlot();
            if (slot > 0 && VizhiRuntime.GetSlot(slot).IsOccupied) VizhiRuntime.WriteFocusAction(slot);
        }

        protected override String GetCommandDisplayName(String actionParameter, PluginImageSize imageSize) => VizhiRuntime.RenderFocusedUsage();

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize)
            => KeyImage.Render(imageSize, "Usage", "usage", 0.62f);

        public void RefreshFace() => this.ActionImageChanged();

        public void RefreshAnimatedFaces() { }

        public Boolean RequiresAnimation => false;
    }

    internal sealed class NavigationDefinition
    {
        public NavigationDefinition(String key, String label, String icon, String description)
        {
            this.Key = key;
            this.Label = label;
            this.Icon = icon;
            this.Description = description;
        }

        public String Key { get; }
        public String Label { get; }
        public String Icon { get; }
        public String Description { get; }
    }
}
