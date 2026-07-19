namespace Loupedeck.VizhiPlugin
{
    using System;

    internal static class KeyImage
    {
        internal static readonly BitmapColor Purple = new BitmapColor(0xA7, 0x8B, 0xFA);
        private static readonly BitmapColor Background = new BitmapColor(0x00, 0x00, 0x00);
        private static readonly BitmapColor FocusBorder = new BitmapColor(0x60, 0xA5, 0xFA);
        private static readonly BitmapColor ApprovalWaiting = new BitmapColor(0xF5, 0xB9, 0x42);
        private static readonly BitmapColor ApprovalRisk = new BitmapColor(0xFB, 0x71, 0x85);
        private static readonly BitmapColor White = new BitmapColor(0xFF, 0xFF, 0xFF);
        private static readonly BitmapColor Surface = new BitmapColor(0x1F, 0x29, 0x37);
        private static readonly BitmapColor MutedText = new BitmapColor(0x9C, 0xA3, 0xAF);

        public static BitmapImage Render(PluginImageSize imageSize, String label, String icon, Single iconScale = 0.82f)
        {
            using var bitmap = new BitmapBuilder(imageSize);
            bitmap.Clear(Background);
            try
            {
                var image = PluginResources.ReadImage($"icons.{icon}.png");
                var size = (Int32)(Math.Min(bitmap.Width, bitmap.Height) * iconScale);
                bitmap.DrawImage(image, (bitmap.Width - size) / 2, (bitmap.Height - size) / 2, size, size);
            }
            catch (Exception ex)
            {
                PluginLog.Warning(ex, $"Unable to render Vizhi icon '{icon}'");
                bitmap.DrawText(label);
            }
            return bitmap.ToImage();
        }

        public static BitmapImage RenderApprovalAction(PluginImageSize imageSize, String label, String icon, Boolean isWaiting, Boolean isHighRisk)
        {
            using var bitmap = new BitmapBuilder(imageSize);
            bitmap.Clear(Background);
            try
            {
                var image = PluginResources.ReadImage($"icons.{icon}.png");
                var size = (Int32)(Math.Min(bitmap.Width, bitmap.Height) * 0.82f);
                bitmap.DrawImage(image, (bitmap.Width - size) / 2, (bitmap.Height - size) / 2, size, size);
            }
            catch (Exception ex)
            {
                PluginLog.Warning(ex, $"Unable to render Vizhi icon '{icon}'");
                bitmap.DrawText(label);
            }
            if (isWaiting) DrawApprovalBadge(bitmap, isHighRisk);
            return bitmap.ToImage();
        }

        public static BitmapImage RenderEmptySlot(PluginImageSize imageSize)
        {
            using var bitmap = new BitmapBuilder(imageSize);
            bitmap.Clear(Background);
            var scale = Scale(bitmap);
            var centerX = bitmap.Width / 2f;
            var centerY = 37 * scale;
            bitmap.DrawCircle(centerX, centerY, 18 * scale, Surface);
            bitmap.DrawLine(centerX - (8 * scale), centerY, centerX + (8 * scale), centerY, MutedText, 3 * scale);
            bitmap.DrawLine(centerX, centerY - (8 * scale), centerX, centerY + (8 * scale), MutedText, 3 * scale);
            return bitmap.ToImage();
        }

        public static BitmapImage RenderBlank(PluginImageSize imageSize)
        {
            using var bitmap = new BitmapBuilder(imageSize);
            bitmap.Clear(Background);
            return bitmap.ToImage();
        }

        public static BitmapImage RenderSessionSlot(PluginImageSize imageSize, String status, Boolean isHighRisk, Boolean isFocused)
        {
            using var bitmap = new BitmapBuilder(imageSize);
            bitmap.Clear(Background);
            try
            {
                var icon = PluginResources.ReadImage($"icons.{IconName(status, isHighRisk)}.png");
                var size = (Int32)(Math.Min(bitmap.Width, bitmap.Height) * 0.60);
                bitmap.DrawImage(icon, (bitmap.Width - size) / 2, (Int32)(bitmap.Height * 0.02), size, size);
            }
            catch (Exception ex)
            {
                PluginLog.Warning(ex, $"Unable to render Vizhi status icon '{status}'");
            }
            if (isFocused) DrawFocusCorners(bitmap);
            return bitmap.ToImage();
        }

        private static void DrawFocusCorners(BitmapBuilder bitmap)
        {
            var scale = Scale(bitmap);
            var inset = 4 * scale;
            var cornerLength = 14 * scale;
            var left = inset;
            var top = inset;
            var right = bitmap.Width - inset;
            var lineWidth = 2 * scale;
            bitmap.DrawLine(left, top, left + cornerLength, top, FocusBorder, lineWidth);
            bitmap.DrawLine(left, top, left, top + cornerLength, FocusBorder, lineWidth);
            bitmap.DrawLine(right, top, right - cornerLength, top, FocusBorder, lineWidth);
            bitmap.DrawLine(right, top, right, top + cornerLength, FocusBorder, lineWidth);
        }

        private static void DrawApprovalBadge(BitmapBuilder bitmap, Boolean isHighRisk)
        {
            var scale = Scale(bitmap);
            var centerX = bitmap.Width - (14 * scale);
            var centerY = 14 * scale;
            bitmap.DrawCircle(centerX, centerY, 9 * scale, isHighRisk ? ApprovalRisk : ApprovalWaiting);
            bitmap.DrawLine(centerX, centerY - (4 * scale), centerX, centerY + scale, White, 2 * scale);
            bitmap.DrawCircle(centerX, centerY + (5 * scale), 1.4f * scale, White);
        }

        private static String IconName(String status, Boolean isHighRisk)
        {
            var frame = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 500 % 4;
            if (isHighRisk || String.Equals(status, "RISK", StringComparison.Ordinal)) return $"risk{frame}";
            if (String.Equals(status, "BUSY", StringComparison.Ordinal))
            {
                return $"busy{frame}";
            }
            if (String.Equals(status, "WAIT", StringComparison.Ordinal)) return $"waiting{frame}";
            return "ready";
        }

        private static Single Scale(BitmapBuilder bitmap) => Math.Min(bitmap.Width, bitmap.Height) / 96f;
    }
}
