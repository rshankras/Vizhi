import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import { StateStore } from "./state-store.js";

const executeFile = promisify(execFile);
const MACOS_PS = "/bin/ps";

export interface CodexTerminalProcess {
  pid: string;
  tty: string;
}

export interface CodexProcessSource {
  list(): Promise<CodexTerminalProcess[]>;
}

export class MacCodexProcessSource implements CodexProcessSource {
  async list(): Promise<CodexTerminalProcess[]> {
    const { stdout } = await executeFile(MACOS_PS, ["-axo", "pid=,ppid=,tty=,command="]);
    return parseCodexTerminalProcesses(stdout);
  }
}

export function parseCodexTerminalProcesses(output: string): CodexTerminalProcess[] {
  const processes: Array<CodexTerminalProcess & { parentPid: string | null }> = [];
  for (const line of output.split("\n")) {
    const match = line.trim().match(/^(\d+)(?:\s+(\d+))?\s+(\S+)\s+(.+)$/);
    if (!match) continue;
    const [, pid, parentPid, tty, command] = match;
    const executable = basename(command.trim().split(/\s+/, 1)[0]!);
    if (tty === "??" || executable !== "codex") continue;
    processes.push({ pid, parentPid: parentPid ?? null, tty: `/dev/${tty}` });
  }
  const codexProcessIds = new Set(processes.map((process) => process.pid));
  return processes
    .filter((process) => !process.parentPid || !codexProcessIds.has(process.parentPid))
    .map(({ pid, tty }) => ({ pid, tty }));
}

export class CodexProcessWatcher {
  private timer: NodeJS.Timeout | null = null;
  private scanning = false;

  constructor(
    private readonly store: StateStore,
    private readonly source: CodexProcessSource = new MacCodexProcessSource(),
  ) {}

  start(): void {
    if (this.timer) return;
    void this.scan();
    this.timer = setInterval(() => void this.scan(), 2_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async scan(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
      await this.store.reconcileCodexSessions(await this.source.list());
    } catch (error: unknown) {
      console.error(`Vizhi Codex watcher failed: ${(error as Error).message}`);
    } finally {
      this.scanning = false;
    }
  }
}
