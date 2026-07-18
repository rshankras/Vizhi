import { createSession, StateStore } from "./state-store.js";

const DEMO_FRAMES = [
  [
    createSession("demo-aurora", { project: "Aurora", cwd: "/demo/Aurora", tty: "/dev/ttys001", state: "busy", model: "gpt-5.6" }),
    createSession("demo-vizhi", { project: "Vizhi", cwd: "/demo/Vizhi", tty: "/dev/ttys002", state: "idle", model: "gpt-5.6" }),
    createSession("demo-lumen", { project: "Lumen", cwd: "/demo/Lumen", tty: "/dev/ttys003", state: "busy", model: "gpt-5.6" }),
  ],
  [
    createSession("demo-aurora", {
      project: "Aurora", cwd: "/demo/Aurora", tty: "/dev/ttys001", state: "waiting", waiting_kind: "permission",
      question: "Run the test suite?", pending_tool: "shell", pending_command: "npm test", model: "gpt-5.6",
    }),
    createSession("demo-vizhi", { project: "Vizhi", cwd: "/demo/Vizhi", tty: "/dev/ttys002", state: "busy", model: "gpt-5.6" }),
    createSession("demo-lumen", { project: "Lumen", cwd: "/demo/Lumen", tty: "/dev/ttys003", state: "idle", model: "gpt-5.6" }),
  ],
  [
    createSession("demo-aurora", { project: "Aurora", cwd: "/demo/Aurora", tty: "/dev/ttys001", state: "busy", model: "gpt-5.6" }),
    createSession("demo-vizhi", {
      project: "Vizhi", cwd: "/demo/Vizhi", tty: "/dev/ttys002", state: "waiting", waiting_kind: "permission",
      question: "Push the release branch?", pending_tool: "shell", pending_command: "git push origin main", model: "gpt-5.6",
    }),
    createSession("demo-lumen", { project: "Lumen", cwd: "/demo/Lumen", tty: "/dev/ttys003", state: "busy", model: "gpt-5.6" }),
  ],
];

export class DemoPlayer {
  private frame = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly store: StateStore) {}

  async start(): Promise<void> {
    await this.writeFrame();
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % DEMO_FRAMES.length;
      void this.writeFrame();
    }, 3000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async writeFrame(): Promise<void> {
    for (const session of DEMO_FRAMES[this.frame]) {
      await this.store.upsertSession({ ...session, updated_at: new Date().toISOString() });
    }
  }
}
