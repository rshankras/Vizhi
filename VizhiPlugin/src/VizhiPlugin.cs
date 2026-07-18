namespace Loupedeck.VizhiPlugin
{
    using System;

    public class VizhiPlugin : Plugin
    {
        public override Boolean UsesApplicationApiOnly => true;

        public override Boolean HasNoApplication => true;

        public VizhiPlugin()
        {
            PluginLog.Init(this.Log);
            PluginResources.Init(this.Assembly);
        }

        public override void Load()
        {
            VizhiRuntime.Start();
        }

        public override void Unload()
        {
            VizhiRuntime.Stop();
        }
    }
}
