namespace Loupedeck.VizhiPlugin
{
    using System;

    // This class can be used to connect the Loupedeck plugin to an application.

    public class VizhiApplication : ClientApplication
    {
        public VizhiApplication()
        {
        }

        // This method can be used to link the plugin to a Windows application.
        protected override String GetProcessName() => "Terminal";

        // This method can be used to link the plugin to a macOS application.
        protected override String GetBundleName() => "com.apple.Terminal";

        // This method can be used to check whether the application is installed or not.
        public override ClientApplicationStatus GetApplicationStatus() => ClientApplicationStatus.Unknown;
    }
}
