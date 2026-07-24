namespace Loupedeck.VizhiPlugin
{
    using System;

    public class VizhiPlugin : Plugin
    {
        public override Boolean UsesApplicationApiOnly => false;

        public override Boolean HasNoApplication => false;

        public VizhiPlugin()
        {
            PluginLog.Init(this.Log);
            PluginResources.Init(this.Assembly);
        }

        public override void Load()
        {
            VizhiCodexIntegration.EnsureInstalled();
            VizhiRuntime.Start();
        }

        public override void Unload()
        {
            VizhiConversationRuntime.Shutdown();
            VizhiRuntime.Stop();
        }
    }
}
