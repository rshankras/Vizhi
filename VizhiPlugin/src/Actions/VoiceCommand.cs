namespace Loupedeck.VizhiPlugin
{
    using System;

    public sealed class VoiceCommand : PluginDynamicCommand
    {
        private readonly ListeningFace _face;

        public VoiceCommand()
            : base(displayName: "Voice", description: "Press once to record, then again to transcribe and send to the focused session; includes any staged screenshot.", groupName: "Vizhi Operate")
        {
            this._face = new ListeningFace(() => this.ActionImageChanged());
        }

        protected override void RunCommand(String actionParameter)
        {
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

        protected override String GetCommandDisplayName(String actionParameter, PluginImageSize imageSize)
            => this._face.IsActive ? "Listening" : "Voice";

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize)
            => this._face.IsActive
                ? KeyImage.Render(imageSize, "Listening", this._face.Icon)
                : KeyImage.Render(imageSize, "Voice", "voice");
    }
}
