namespace Loupedeck.VizhiPlugin
{
    using System;
    using System.Threading;

    internal sealed class ListeningFace : IDisposable
    {
        private static readonly String[] Frames = { "wave0", "wave1", "wave2", "wave3" };
        private readonly Action _onFrame;
        private Timer _timer;
        private Int32 _frame;

        public ListeningFace(Action onFrame) => this._onFrame = onFrame;

        public Boolean IsActive => this._timer != null;

        public String Icon => Frames[this._frame];

        public void Start()
        {
            this._frame = 0;
            this._timer?.Dispose();
            this._timer = new Timer(_ =>
            {
                this._frame = (this._frame + 1) % Frames.Length;
                this._onFrame();
            }, null, 150, 150);
        }

        public void Stop()
        {
            this._timer?.Dispose();
            this._timer = null;
        }

        public void Dispose() => this.Stop();
    }
}
