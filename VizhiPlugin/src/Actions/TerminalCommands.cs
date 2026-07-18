namespace Loupedeck.VizhiPlugin
{
    using System;

    public sealed class NewTerminalTabCommand : PluginDynamicCommand
    {
        public NewTerminalTabCommand()
            : base(displayName: "New Tab", description: "Open a plain Terminal tab in the focused project's folder, or your home folder when none is selected.", groupName: "Vizhi Terminal")
        {
        }

        protected override void RunCommand(String actionParameter) => VizhiRuntime.WriteNewTerminalAction(false);

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize)
            => KeyImage.Render(imageSize, "New Tab", "terminaltab");
    }

    public sealed class NewTerminalWindowCommand : PluginDynamicCommand
    {
        public NewTerminalWindowCommand()
            : base(displayName: "New Window", description: "Open a plain Terminal window in the focused project's folder, or your home folder when none is selected.", groupName: "Vizhi Terminal")
        {
        }

        protected override void RunCommand(String actionParameter) => VizhiRuntime.WriteNewTerminalAction(true);

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize)
            => KeyImage.Render(imageSize, "New Window", "terminalwindow");
    }

}
