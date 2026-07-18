import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, readdir, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { CodexProcessWatcher } from "./codex-process-watcher.js";
import { defaultPromptTemplatePath, getFavoriteTemplate, getPromptTemplate, isPromptTemplateId } from "./prompt-template.js";
import { ensurePrivateDirectory, PRIVATE_FILE_MODE } from "./private-files.js";
import { StateStore } from "./state-store.js";
import { GRID_SLOT_COUNT, TERMINAL_KEYS, type Action, type Session, type TerminalKey } from "./types.js";

const executeFile = promisify(execFile);
const MAX_ACTION_AGE_MS = 30_000;

export interface ActionExecutor {
  focusTerminal(tty: string | null, capturePreviousApplication?: boolean): Promise<void>;
  respond(answer: "yes" | "no", asTextInput?: boolean): Promise<void>;
  typeText(text: string, submit?: boolean): Promise<void>;
  interrupt(): Promise<void>;
  pressKey(key: TerminalKey): Promise<void>;
  forkSession?(session: Session, capturePreviousApplication?: boolean): Promise<void>;
  resumeSession?(sessionId: string, cwd: string | null, capturePreviousApplication?: boolean): Promise<void>;
  newTerminalSession?(cwd: string | null, openInNewWindow: boolean, capturePreviousApplication?: boolean): Promise<void>;
  pasteClipboard?(): Promise<void>;
  captureScreenshot?(): Promise<string>;
  restorePreviousApplication?(): Promise<void>;
}

export class MacTerminalExecutor implements ActionExecutor {
  private previousApplication: string | null = null;

  constructor(private readonly ipcRoot = process.env.VIZHI_IPC_ROOT ?? "/tmp/vizhi") {
  }

  async focusTerminal(tty: string | null, capturePreviousApplication = false): Promise<void> {
    if (!tty) {
      return;
    }
    this.previousApplication = capturePreviousApplication ? await this.frontmostApplication() : null;
    const script = `on run argv
set targetTty to item 1 of argv
tell application "Terminal"
activate
repeat with terminalWindow in windows
repeat with terminalTab in tabs of terminalWindow
set tabTty to (tty of terminalTab as text)
if tabTty is targetTty then
set selected tab of terminalWindow to terminalTab
set index of terminalWindow to 1
return
end if
end repeat
end repeat
end tell
error "Vizhi could not find terminal tab for " & targetTty
end run`;
    await executeFile("osascript", ["-e", script, tty]);
  }

  async restorePreviousApplication(): Promise<void> {
    const application = this.previousApplication;
    this.previousApplication = null;
    if (!application) return;
    const script = `on run argv
tell application (item 1 of argv) to activate
end run`;
    try {
      await executeFile("osascript", ["-e", script, application]);
    } catch {
    }
  }

  async respond(answer: "yes" | "no", asTextInput = false): Promise<void> {
    if (asTextInput) {
      await this.typeText(answer);
      return;
    }
    const shortcut = answer === "yes" ? "y" : "n";
    const script = `tell application "System Events"
keystroke "${shortcut}"
end tell`;
    await executeFile("osascript", ["-e", script]);
  }

  async typeText(text: string, submit = true): Promise<void> {
    const script = [
      "on run argv",
      "set the clipboard to item 1 of argv",
      "tell application \"System Events\"",
      "keystroke \"v\" using command down",
      ...(submit ? ["key code 36"] : []),
      "end tell",
      "end run",
    ].join("\n");
    await executeFile("osascript", ["-e", script, text]);
  }

  async interrupt(): Promise<void> {
    const script = `tell application "System Events"
key code 53
end tell`;
    await executeFile("osascript", ["-e", script]);
  }

  async forkSession(session: Session, capturePreviousApplication = false): Promise<void> {
    await this.openCodexSession(`codex fork ${shellQuote(session.session_id)}`, session.cwd, capturePreviousApplication);
  }

  async resumeSession(sessionId: string, cwd: string | null, capturePreviousApplication = false): Promise<void> {
    await this.openCodexSession(`codex resume ${shellQuote(sessionId)}`, cwd, capturePreviousApplication);
  }

  async newTerminalSession(cwd: string | null, openInNewWindow: boolean, capturePreviousApplication = false): Promise<void> {
    await this.openTerminalSession(cwd, capturePreviousApplication, openInNewWindow);
  }

  async pasteClipboard(): Promise<void> {
    const { stdout } = await executeFile("pbpaste", [], { maxBuffer: 100 * 1024 });
    if (!stdout.trim()) throw new Error("Clipboard does not contain text.");
    await this.typeText(stdout);
  }

  async captureScreenshot(): Promise<string> {
    const capturesPath = join(this.ipcRoot, "captures");
    await ensurePrivateDirectory(capturesPath);
    const filePath = join(capturesPath, `capture-${Date.now()}.png`);
    await executeFile("screencapture", ["-i", filePath]);
    await chmod(filePath, PRIVATE_FILE_MODE);
    return filePath;
  }

  async pressKey(key: TerminalKey): Promise<void> {
    const keyCodes: Record<TerminalKey, number> = {
      tab: 48,
      up: 126,
      down: 125,
      enter: 36,
      page_up: 116,
      page_down: 121,
    };
    const script = `tell application "System Events"
key code ${keyCodes[key]}
end tell`;
    await executeFile("osascript", ["-e", script]);
  }

  private async frontmostApplication(): Promise<string | null> {
    try {
      const script = `tell application "System Events" to get name of first application process whose frontmost is true`;
      const { stdout } = await executeFile("osascript", ["-e", script]);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  private async openCodexSession(command: string, cwd: string | null, capturePreviousApplication: boolean, openInNewWindow = false): Promise<void> {
    await this.openTerminalSession(cwd, capturePreviousApplication, openInNewWindow, command);
  }

  private async openTerminalSession(cwd: string | null, capturePreviousApplication: boolean, openInNewWindow: boolean, command: string | null = null): Promise<void> {
    this.previousApplication = capturePreviousApplication ? await this.frontmostApplication() : null;
    const shellCommand = command
      ? cwd ? `cd ${shellQuote(cwd)} && exec ${command}` : `exec ${command}`
      : cwd ? `cd ${shellQuote(cwd)}` : "";
    const shortcut = openInNewWindow ? "n" : "t";
    const script = [
      "on run argv",
      "set commandText to item 1 of argv",
      'tell application "Terminal" to activate',
      'tell application "System Events"',
      `tell process "Terminal" to keystroke "${shortcut}" using command down`,
      "end tell",
      "delay 0.2",
      'if commandText is not "" then',
      'tell application "Terminal" to do script commandText in selected tab of front window',
      "end if",
      "end run",
    ].join("\n");
    await executeFile("osascript", ["-e", script, shellCommand]);
  }
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function isAction(value: unknown): value is Action {
  if (!value || typeof value !== "object") return false;
  const action = value as Partial<Action>;
  const slot = action.slot;
  return typeof action.id === "string"
    && (action.type === "focus"
      || action.type === "approve"
      || action.type === "deny"
      || action.type === "voice"
      || action.type === "interrupt"
      || action.type === "compact"
      || action.type === "new_session"
      || action.type === "new_terminal"
      || action.type === "exit"
      || action.type === "model"
      || action.type === "mode"
      || action.type === "agent"
      || action.type === "fork"
      || action.type === "favorite"
      || action.type === "clipboard"
      || action.type === "screenshot"
      || action.type === "key"
      || action.type === "prompt_template"
      || action.type === "resume")
    && (action.type === "resume"
      ? slot === 0 && typeof action.session_id === "string" && (action.cwd === null || typeof action.cwd === "string")
      : action.type === "new_terminal"
        ? slot === 0 && (action.cwd === undefined || action.cwd === null || typeof action.cwd === "string")
        : typeof slot === "number" && Number.isInteger(slot) && slot >= 1 && slot <= GRID_SLOT_COUNT)
    && typeof action.created_at === "string"
    && Number.isFinite(Date.parse(action.created_at))
    && (action.session_id === undefined || typeof action.session_id === "string")
    && (action.open_in_new_window === undefined || typeof action.open_in_new_window === "boolean")
    && (action.return_to_browser === undefined || typeof action.return_to_browser === "boolean")
    && (action.type !== "voice" || (typeof action.text === "string" && action.text.trim().length > 0))
    && (action.type !== "key" || (typeof action.key === "string" && (TERMINAL_KEYS as readonly string[]).includes(action.key)))
    && (action.type !== "prompt_template" || action.template_id === undefined || isPromptTemplateId(action.template_id));
}

export class ActionRouter {
  private timer: NodeJS.Timeout | null = null;
  private processing = false;
  private lastCleanupAt = 0;
  private lastArtifactCleanupAt = 0;
  private readonly watcher: CodexProcessWatcher;

  constructor(
    private readonly store: StateStore,
    private readonly executor: ActionExecutor,
    private readonly cleanupTerminalSlots = true,
    private readonly promptTemplatePath = defaultPromptTemplatePath(),
  ) {
    this.watcher = new CodexProcessWatcher(store);
  }

  start(): void {
    if (this.timer) return;
    this.watcher.start();
    void this.processPending().catch((error: unknown) => console.error(`Vizhi router failed: ${(error as Error).message}`));
    this.timer = setInterval(() => {
      void this.processPending().catch((error: unknown) => console.error(`Vizhi router failed: ${(error as Error).message}`));
    }, 250);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.watcher.stop();
  }

  async processPending(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.store.ensure();
      if (this.cleanupTerminalSlots && Date.now() - this.lastCleanupAt >= 2_000) {
        await this.store.pruneClosedTerminalSlots();
        this.lastCleanupAt = Date.now();
      }
      if (Date.now() - this.lastArtifactCleanupAt >= 60_000) {
        await this.store.pruneLocalArtifacts();
        this.lastArtifactCleanupAt = Date.now();
      }
      const donePath = join(this.store.actionsPath, "done");
      const failedPath = join(this.store.actionsPath, "failed");
      await Promise.all([ensurePrivateDirectory(donePath), ensurePrivateDirectory(failedPath)]);
      const validActions: Array<{ entry: string; action: Action }> = [];
      const entries = await readdir(this.store.actionsPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const source = join(this.store.actionsPath, entry.name);
        try {
          const action = JSON.parse(await readFile(source, "utf8")) as unknown;
          if (!isAction(action)) {
            console.warn(`Vizhi quarantined invalid action file ${entry.name}`);
            await this.quarantineAction(source, failedPath, entry.name);
            continue;
          }
          validActions.push({ entry: entry.name, action });
        } catch (error: unknown) {
          console.warn(`Vizhi quarantined unreadable action file ${entry.name}: ${(error as Error).message}`);
          await this.quarantineAction(source, failedPath, entry.name);
        }
      }
      for (const { entry, action } of validActions.sort((first, second) => first.action.created_at.localeCompare(second.action.created_at))) {
        const source = join(this.store.actionsPath, entry);
        const destination = join(donePath, entry);
        try {
          await rename(source, destination);
        } catch (error: unknown) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw error;
        }
        if (Date.now() - Date.parse(action.created_at) > MAX_ACTION_AGE_MS) {
          console.warn(`Vizhi ignored expired action ${action.id}`);
          continue;
        }
        try {
          await this.execute(action);
        } catch (error: unknown) {
          console.error(`Vizhi action ${action.id} failed: ${(error as Error).message}`);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async execute(action: Action): Promise<void> {
    const returnToBrowser = action.return_to_browser === true;
    try {
      if (action.type === "resume") {
        if (!action.session_id) throw new Error("Resume action is missing a session id.");
        if (!this.executor.resumeSession) throw new Error("The current action executor cannot resume sessions.");
        await this.executor.resumeSession(action.session_id, action.cwd ?? null, returnToBrowser);
        return;
      }
      if (action.type === "new_terminal") {
        if (!this.executor.newTerminalSession) throw new Error("The current action executor cannot open new Terminal sessions.");
        await this.executor.newTerminalSession(action.cwd ?? null, action.open_in_new_window === true, returnToBrowser);
        return;
      }
      const target = await this.sessionForAction(action);
      if (!target) throw new Error(`No active session is available for slot ${action.slot}`);
      const { session, slot } = target;
      if (action.type === "fork") {
        if (!this.executor.forkSession) throw new Error("The current action executor cannot fork sessions.");
        await this.executor.forkSession(session, returnToBrowser);
        return;
      }
      if ((action.type === "approve" || action.type === "deny") && session.state !== "waiting") {
        throw new Error("No Codex approval or input request is waiting in this session.");
      }
      await this.executor.focusTerminal(session.tty, returnToBrowser);
      await this.store.setFocusedSlot(slot);
      if (action.type === "approve" || action.type === "deny") {
        const answer = action.type === "approve" ? "yes" : "no";
        await this.executor.respond(answer, session.waiting_kind === "input");
        await this.store.markSessionResponded(session.session_id, answer === "yes" || session.waiting_kind === "input");
      }
      if (action.type === "voice") {
        await this.executor.typeText(action.text!, true);
        await this.store.clearScreenshotDraft(session.session_id);
      }
      if (action.type === "interrupt") {
        await this.executor.interrupt();
        await this.store.markSessionInterrupted(session.session_id);
        await this.store.clearScreenshotDraft(session.session_id);
      }
      if (action.type === "compact") await this.executor.typeText("/compact");
      if (action.type === "new_session") await this.executor.typeText("/new");
      if (action.type === "exit") {
        await this.executor.typeText("/exit");
        await this.store.clearScreenshotDraft(session.session_id);
      }
      if (action.type === "model") await this.executor.typeText("/model");
      if (action.type === "mode") await this.executor.typeText("/mode");
      if (action.type === "agent") await this.executor.typeText("/agent");
      if (action.type === "favorite") {
        const template = await getFavoriteTemplate(this.promptTemplatePath);
        await this.executor.typeText(template.prompt);
      }
      if (action.type === "clipboard") {
        if (!this.executor.pasteClipboard) throw new Error("The current action executor cannot paste the clipboard.");
        await this.executor.pasteClipboard();
      }
      if (action.type === "screenshot") {
        if (!this.executor.captureScreenshot) throw new Error("The current action executor cannot capture screenshots.");
        const filePath = await this.executor.captureScreenshot();
        await this.executor.typeText(`A screenshot was captured at ${filePath}. Inspect this image with your available image-viewing tools before continuing. `, false);
        await this.store.stageScreenshotDraft(session.session_id, filePath);
      }
      if (action.type === "key") {
        await this.executor.pressKey(action.key!);
        if (action.key === "enter") await this.store.clearScreenshotDraft(session.session_id);
      }
      if (action.type === "prompt_template") {
        const templateId = isPromptTemplateId(action.template_id) ? action.template_id : "review";
        const template = await getPromptTemplate(templateId, this.promptTemplatePath);
        await this.executor.typeText(template.prompt);
      }
    } finally {
      if (returnToBrowser) await this.executor.restorePreviousApplication?.();
    }
  }

  private async sessionForAction(action: Action): Promise<{ session: Session; slot: number } | null> {
    const grid = await this.store.getGrid();
    if (action.session_id) {
      const matchingSlot = grid.slots.find((slot) => slot.session?.session_id === action.session_id);
      return matchingSlot?.session ? { session: matchingSlot.session, slot: matchingSlot.slot } : null;
    }
    const matchingSlot = grid.slots[action.slot - 1];
    return matchingSlot?.session ? { session: matchingSlot.session, slot: matchingSlot.slot } : null;
  }

  private async quarantineAction(source: string, failedPath: string, entry: string): Promise<void> {
    const destination = join(failedPath, `${entry}.${Date.now()}.${randomUUID()}.invalid`);
    try {
      await rename(source, destination);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`Vizhi could not quarantine ${entry}: ${(error as Error).message}`);
      }
    }
  }
}
