import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { appendFile, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { ensurePrivateDirectory, ensurePrivateFile, PRIVATE_FILE_MODE, writePrivateJsonAtomically } from "./private-files.js";
import { classifyRisk } from "./risk.js";
import { GRID_SLOT_COUNT, type Action, type GridSnapshot, type Registry, type Session } from "./types.js";

const STALE_AFTER_MS = 10 * 60 * 1000;
const LIVE_SESSION_HEARTBEAT_AFTER_MS = 60 * 1000;
const BUSY_WITHOUT_ACTIVITY_AFTER_MS = 45 * 1000;
const SCREENSHOT_DRAFT_AFTER_MS = 2 * 60 * 1000;
const CAPTURE_RETENTION_MS = 15 * 60 * 1000;
const COMPLETED_ACTION_RETENTION_MS = 60 * 60 * 1000;
const RAW_HOOK_LOG_MAX_BYTES = 1 * 1024 * 1024;
const RAW_HOOK_LOG_ENTRY_MAX_BYTES = 64 * 1024;
const executeFile = promisify(execFile);
const MACOS_PS = "/bin/ps";

interface ScreenshotDraft {
  schema: 1;
  session_id: string;
  image_path: string;
  created_at: string;
}

function sessionFilename(sessionId: string): string {
  return `${sessionId.replaceAll(/[^a-zA-Z0-9._-]/g, "_")}.json`;
}

function screenshotDraftFilename(sessionId: string): string {
  return `${Buffer.from(sessionId, "utf8").toString("base64url")}.json`;
}

function isCurrentScreenshotDraft(draft: ScreenshotDraft): boolean {
  const createdAt = Date.parse(draft.created_at);
  return Number.isFinite(createdAt) && Date.now() - createdAt <= SCREENSHOT_DRAFT_AFTER_MS;
}

function defaultRegistry(): Registry {
  return { schema: 1, slots: {}, focused_session: null };
}

function sessionIdentity(session: Session): string {
  return session.tty ?? session.session_id;
}

function isGridSlot(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= GRID_SLOT_COUNT;
}

function sameSlotAssignments(first: Record<string, string>, second: Record<string, string>): boolean {
  const firstKeys = Object.keys(first);
  return firstKeys.length === Object.keys(second).length
    && firstKeys.every((slot) => first[slot] === second[slot]);
}

function compactSlotAssignments(
  slots: Record<string, string>,
  sessionsByIdentity: Map<string, Session>,
): Record<string, string> {
  const assigned = new Set<string>();
  const identities: string[] = [];
  const configuredSlots = Object.entries(slots)
    .map(([slot, identity]) => ({ slot: Number(slot), identity }))
    .filter(({ slot, identity }) => isGridSlot(slot) && sessionsByIdentity.has(identity))
    .sort((first, second) => first.slot - second.slot);

  for (const { identity } of configuredSlots) {
    if (assigned.has(identity)) continue;
    assigned.add(identity);
    identities.push(identity);
  }

  const unassignedSessions = [...sessionsByIdentity.entries()]
    .filter(([identity]) => !assigned.has(identity))
    .sort(([firstIdentity, first], [secondIdentity, second]) => {
      const firstUpdatedAt = Date.parse(first.updated_at) || 0;
      const secondUpdatedAt = Date.parse(second.updated_at) || 0;
      return firstUpdatedAt - secondUpdatedAt || firstIdentity.localeCompare(secondIdentity);
    });
  for (const [identity] of unassignedSessions) identities.push(identity);

  return Object.fromEntries(
    identities.slice(0, GRID_SLOT_COUNT).map((identity, index) => [String(index + 1), identity]),
  );
}

function normalizedRegistry(registry: Registry, sessionsByIdentity: Map<string, Session>): Registry {
  const slots = compactSlotAssignments(registry.slots, sessionsByIdentity);
  const activeSessionIds = new Set([...sessionsByIdentity.values()].map((session) => session.session_id));
  return {
    ...registry,
    slots,
    focused_session: activeSessionIds.has(registry.focused_session ?? "") ? registry.focused_session : null,
  };
}

function isProvisionalSession(session: Session): boolean {
  return session.session_id.startsWith("provisional-");
}

function isCurrentSession(session: Session): boolean {
  const updatedAt = Date.parse(session.updated_at);
  return session.state !== "dead" && Number.isFinite(updatedAt) && Date.now() - updatedAt <= STALE_AFTER_MS;
}

function needsLiveSessionHeartbeat(session: Session, now: number): boolean {
  const updatedAt = Date.parse(session.updated_at);
  return session.state !== "dead" && (!Number.isFinite(updatedAt) || now - updatedAt >= LIVE_SESSION_HEARTBEAT_AFTER_MS);
}

function isStalledBusySession(session: Session, now: number): boolean {
  const updatedAt = Date.parse(session.updated_at);
  return session.state === "busy"
    && !session.pending_tool
    && !session.pending_command
    && Number.isFinite(updatedAt)
    && now - updatedAt >= BUSY_WITHOUT_ACTIVITY_AFTER_MS;
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function rawHookLoggingEnabled(): boolean {
  return process.env.VIZHI_RAW_HOOK_LOG === "1";
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

export class StateStore {
  readonly sessionsPath: string;
  readonly actionsPath: string;
  readonly draftsPath: string;
  readonly capturesPath: string;
  readonly rawHooksPath: string;
  private readonly registryPath: string;

  constructor(readonly root: string) {
    this.sessionsPath = join(root, "sessions");
    this.actionsPath = join(root, "actions");
    this.draftsPath = join(root, "drafts");
    this.capturesPath = join(root, "captures");
    this.rawHooksPath = join(root, "raw-hooks.jsonl");
    this.registryPath = join(root, "registry.json");
  }

  async ensure(): Promise<void> {
    await ensurePrivateDirectory(this.root);
    await Promise.all([
      ensurePrivateDirectory(this.sessionsPath),
      ensurePrivateDirectory(this.actionsPath),
      ensurePrivateDirectory(this.draftsPath),
      ensurePrivateDirectory(this.capturesPath),
    ]);
    if (!rawHookLoggingEnabled()) {
      await unlink(this.rawHooksPath).catch((error: unknown) => {
        if (!isNotFound(error)) throw error;
      });
    }
  }

  async getSession(sessionId: string): Promise<Session | null> {
    await this.ensure();
    return readJson<Session>(join(this.sessionsPath, sessionFilename(sessionId)));
  }

  async upsertSession(session: Session): Promise<void> {
    await this.ensure();
    if (session.tty && !isProvisionalSession(session)) {
      await this.removeProvisionalSessionsForTty(session.tty);
    }
    await writePrivateJsonAtomically(join(this.sessionsPath, sessionFilename(session.session_id)), session);
    await this.assignSlot(session);
  }

  async markSessionInterrupted(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session || session.state === "dead") return;
    await this.upsertSession({
      ...session,
      state: "idle",
      waiting_kind: null,
      question: null,
      pending_tool: null,
      pending_command: null,
      updated_at: new Date().toISOString(),
    });
  }

  async markSessionResponded(sessionId: string, continuesWorking: boolean): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session || session.state === "dead") return;
    await this.upsertSession({
      ...session,
      state: continuesWorking ? "busy" : "idle",
      waiting_kind: null,
      question: null,
      ...(continuesWorking ? {} : { pending_tool: null, pending_command: null }),
      updated_at: new Date().toISOString(),
    });
  }

  async reconcileCodexSessions(processes: Array<{ pid: string; tty: string }>): Promise<void> {
    await this.ensure();
    const sessions = await this.readSessions();
    const liveTtys = new Set(processes.map((process) => process.tty));
    const now = Date.now();
    for (const session of sessions) {
      if (session.agent === "codex" && session.tty && !liveTtys.has(session.tty)) {
        await unlink(join(this.sessionsPath, sessionFilename(session.session_id))).catch(() => undefined);
        await this.clearScreenshotDraft(session.session_id);
      }
    }

    const currentSessions = await this.readSessions();
    for (const process of processes) {
      const matchingSessions = currentSessions.filter((session) => session.tty === process.tty);
      const liveSessions = matchingSessions.filter((session) => !isProvisionalSession(session));
      if (liveSessions.length > 0) {
        for (const session of liveSessions) {
          if (isStalledBusySession(session, now)) {
            await this.upsertSession({
              ...session,
              state: "idle",
              waiting_kind: null,
              question: null,
              pending_tool: null,
              pending_command: null,
              updated_at: new Date(now).toISOString(),
            });
          } else if (needsLiveSessionHeartbeat(session, now)) {
            await this.upsertSession({ ...session, updated_at: new Date(now).toISOString() });
          }
        }
        continue;
      }
      const existing = matchingSessions.find(isProvisionalSession);
      const session = existing
        ? { ...existing, state: "idle" as const, updated_at: new Date().toISOString() }
        : createSession(`provisional-${process.pid}`, {
          agent: "codex",
          project: "Codex",
          tty: process.tty,
          state: "idle",
        });
      await this.upsertSession(session);
    }
    await this.getGrid();
  }

  async stageScreenshotDraft(sessionId: string, imagePath: string): Promise<void> {
    await this.ensure();
    const draft: ScreenshotDraft = {
      schema: 1,
      session_id: sessionId,
      image_path: imagePath,
      created_at: new Date().toISOString(),
    };
    await writePrivateJsonAtomically(join(this.draftsPath, screenshotDraftFilename(sessionId)), draft);
  }

  async getScreenshotDraft(sessionId: string): Promise<ScreenshotDraft | null> {
    await this.ensure();
    const path = join(this.draftsPath, screenshotDraftFilename(sessionId));
    const draft = await readJson<ScreenshotDraft>(path);
    if (draft?.schema === 1 && draft.session_id === sessionId && typeof draft.image_path === "string" && isCurrentScreenshotDraft(draft)) {
      return draft;
    }
    await unlink(path).catch(() => undefined);
    return null;
  }

  async clearScreenshotDraft(sessionId: string): Promise<void> {
    await unlink(join(this.draftsPath, screenshotDraftFilename(sessionId))).catch(() => undefined);
  }

  async appendRawHook(event: string, payload: unknown): Promise<void> {
    await this.ensure();
    if (!rawHookLoggingEnabled()) return;
    const entry = JSON.stringify({ event, at: new Date().toISOString(), payload });
    const line = Buffer.byteLength(entry, "utf8") > RAW_HOOK_LOG_ENTRY_MAX_BYTES
      ? `${JSON.stringify({ event, at: new Date().toISOString(), payload_omitted: true })}\n`
      : `${entry}\n`;
    try {
      const information = await stat(this.rawHooksPath);
      if (information.size + Buffer.byteLength(line, "utf8") > RAW_HOOK_LOG_MAX_BYTES) {
        await writeFile(this.rawHooksPath, line, { encoding: "utf8", mode: PRIVATE_FILE_MODE });
      } else {
        await ensurePrivateFile(this.rawHooksPath);
        await appendFile(this.rawHooksPath, line, { encoding: "utf8", mode: PRIVATE_FILE_MODE });
      }
    } catch (error: unknown) {
      if (!isNotFound(error)) throw error;
      await writeFile(this.rawHooksPath, line, { encoding: "utf8", mode: PRIVATE_FILE_MODE });
    }
  }

  async pruneLocalArtifacts(now = Date.now()): Promise<void> {
    await this.ensure();
    await Promise.all([
      this.pruneFilesOlderThan(this.capturesPath, CAPTURE_RETENTION_MS, now),
      this.pruneFilesOlderThan(join(this.actionsPath, "done"), COMPLETED_ACTION_RETENTION_MS, now),
      this.pruneFilesOlderThan(join(this.actionsPath, "failed"), COMPLETED_ACTION_RETENTION_MS, now),
    ]);
  }

  async pruneClosedTerminalSlots(): Promise<void> {
    if (process.platform !== "darwin") return;
    await this.ensure();
    const registry = await this.currentRegistry();
    const sessionsByIdentity = new Map<string, Session>();
    for (const entry of await readdir(this.sessionsPath)) {
      if (!entry.endsWith(".json")) continue;
      const session = await readJson<Session>(join(this.sessionsPath, entry));
      if (!session || session.schema !== 1 || !session.session_id) continue;
      sessionsByIdentity.set(sessionIdentity(session), session);
    }
    const closedIdentities = new Set<string>();
    for (const identity of Object.values(registry.slots)) {
      const session = sessionsByIdentity.get(identity);
      if (session?.tty && !(await isTerminalTtyOpen(session.tty))) closedIdentities.add(identity);
    }
    if (closedIdentities.size === 0) return;
    const slots = Object.fromEntries(
      Object.entries(registry.slots).filter(([, identity]) => !closedIdentities.has(identity)),
    );
    const activeSessionIds = new Set(
      Object.values(slots).map((identity) => sessionsByIdentity.get(identity)?.session_id).filter(Boolean),
    );
    const focusedSession = activeSessionIds.has(registry.focused_session ?? "")
      ? registry.focused_session
      : null;
    await this.writeRegistry({ ...registry, slots, focused_session: focusedSession });
    await Promise.all(
      (await this.readSessions())
        .filter((session) => closedIdentities.has(sessionIdentity(session)))
        .map(async (session) => {
          await unlink(join(this.sessionsPath, sessionFilename(session.session_id))).catch(() => undefined);
          await this.clearScreenshotDraft(session.session_id);
        }),
    );
    await this.currentRegistry();
  }

  async createAction(
    type: Action["type"],
    slot: number,
    details: Pick<Action, "text" | "key" | "template_id" | "return_to_browser"> = {},
  ): Promise<Action> {
    await this.ensure();
    if (!isGridSlot(slot)) {
      throw new Error(`slot must be between 1 and ${GRID_SLOT_COUNT}`);
    }
    const session = (await this.getGrid()).slots[slot - 1]?.session ?? null;
    const action: Action = {
      id: randomUUID(),
      type,
      slot,
      ...(session ? { session_id: session.session_id } : {}),
      ...details,
      created_at: new Date().toISOString(),
    };
    await writePrivateJsonAtomically(join(this.actionsPath, `${action.id}.json`), action);
    if (type === "focus") {
      await this.setFocusedSlot(slot);
    }
    return action;
  }

  async createResumeAction(sessionId: string, cwd: string | null, returnToBrowser = false): Promise<Action> {
    await this.ensure();
    const action: Action = {
      id: randomUUID(),
      type: "resume",
      slot: 0,
      session_id: sessionId,
      cwd,
      ...(returnToBrowser ? { return_to_browser: true } : {}),
      created_at: new Date().toISOString(),
    };
    await writePrivateJsonAtomically(join(this.actionsPath, `${action.id}.json`), action);
    return action;
  }

  async createNewTerminalAction(slot: number, openInNewWindow = false, returnToBrowser = false): Promise<Action> {
    await this.ensure();
    if (!isGridSlot(slot)) {
      throw new Error(`slot must be between 1 and ${GRID_SLOT_COUNT}`);
    }
    const session = (await this.getGrid()).slots[slot - 1]?.session ?? null;
    const action: Action = {
      id: randomUUID(),
      type: "new_terminal",
      slot: 0,
      cwd: session?.cwd ?? null,
      ...(openInNewWindow ? { open_in_new_window: true } : {}),
      ...(returnToBrowser ? { return_to_browser: true } : {}),
      created_at: new Date().toISOString(),
    };
    await writePrivateJsonAtomically(join(this.actionsPath, `${action.id}.json`), action);
    return action;
  }

  async setFocusedSlot(slot: number): Promise<void> {
    if (!isGridSlot(slot)) {
      throw new Error(`slot must be between 1 and ${GRID_SLOT_COUNT}`);
    }
    await this.focusSlot(slot);
  }

  async getGrid(): Promise<GridSnapshot> {
    await this.ensure();
    const registry = await this.readRegistry();
    const { sessionsByIdentity, invalidFiles } = await this.readCurrentSessions();
    const currentRegistry = normalizedRegistry(registry, sessionsByIdentity);
    if (!sameSlotAssignments(currentRegistry.slots, registry.slots)
      || currentRegistry.focused_session !== registry.focused_session) {
      await this.writeRegistry(currentRegistry);
    }

    const slottedTtys = new Set(Object.values(currentRegistry.slots));
    const slots = Array.from({ length: GRID_SLOT_COUNT }, (_, index) => {
      const slot = index + 1;
      const tty = currentRegistry.slots[String(slot)];
      const session = tty ? sessionsByIdentity.get(tty) ?? null : null;
      return { slot, session, risk: session ? classifyRisk(session) : "none" as const };
    });
    const overflow = [...sessionsByIdentity.keys()].filter((tty) => !slottedTtys.has(tty)).length;
    return { slots, focused_session: currentRegistry.focused_session, invalid_files: invalidFiles, overflow };
  }

  private async assignSlot(_session: Session): Promise<void> {
    await this.currentRegistry();
  }

  private async focusSlot(slot: number): Promise<void> {
    const registry = await this.currentRegistry();
    const identity = registry.slots[String(slot)];
    if (!identity) return;
    const grid = await this.getGrid();
    const focused = grid.slots[slot - 1]?.session;
    registry.focused_session = focused?.session_id ?? null;
    await this.writeRegistry(registry);
  }

  private async readRegistry(): Promise<Registry> {
    const registry = await readJson<Registry>(this.registryPath);
    return registry?.schema === 1 && registry.slots ? registry : defaultRegistry();
  }

  private async currentRegistry(): Promise<Registry> {
    const registry = await this.readRegistry();
    const { sessionsByIdentity } = await this.readCurrentSessions();
    const currentRegistry = normalizedRegistry(registry, sessionsByIdentity);
    if (!sameSlotAssignments(currentRegistry.slots, registry.slots)
      || currentRegistry.focused_session !== registry.focused_session) {
      await this.writeRegistry(currentRegistry);
    }
    return currentRegistry;
  }

  private async readCurrentSessions(): Promise<{ sessionsByIdentity: Map<string, Session>; invalidFiles: number }> {
    const sessionsByIdentity = new Map<string, Session>();
    let invalidFiles = 0;
    for (const entry of await readdir(this.sessionsPath)) {
      if (!entry.endsWith(".json")) continue;
      const session = await readJson<Session>(join(this.sessionsPath, entry));
      if (!session || session.schema !== 1 || !session.session_id) {
        invalidFiles += 1;
        continue;
      }
      if (isCurrentSession(session)) sessionsByIdentity.set(sessionIdentity(session), session);
    }
    return { sessionsByIdentity, invalidFiles };
  }

  private async removeProvisionalSessionsForTty(tty: string): Promise<void> {
    for (const session of await this.readSessions()) {
      if (isProvisionalSession(session) && session.tty === tty) {
        await unlink(join(this.sessionsPath, sessionFilename(session.session_id))).catch(() => undefined);
      }
    }
  }

  private async readSessions(): Promise<Session[]> {
    const sessions: Session[] = [];
    for (const entry of await readdir(this.sessionsPath)) {
      if (!entry.endsWith(".json")) continue;
      const session = await readJson<Session>(join(this.sessionsPath, entry));
      if (session?.schema === 1 && session.session_id) sessions.push(session);
    }
    return sessions;
  }

  private async writeRegistry(registry: Registry): Promise<void> {
    await writePrivateJsonAtomically(this.registryPath, registry);
  }

  private async pruneFilesOlderThan(path: string, retentionMs: number, now: number): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(path);
    } catch (error: unknown) {
      if (isNotFound(error)) return;
      throw error;
    }
    await Promise.all(entries.map(async (entry) => {
      const filePath = join(path, entry);
      try {
        const information = await stat(filePath);
        if (information.isFile() && now - information.mtimeMs > retentionMs) {
          await unlink(filePath);
        }
      } catch (error: unknown) {
        if (!isNotFound(error)) throw error;
      }
    }));
  }
}

async function isTerminalTtyOpen(tty: string): Promise<boolean> {
  const terminalName = basename(tty);
  if (!terminalName.startsWith("ttys")) return true;
  try {
    await executeFile(MACOS_PS, ["-t", terminalName, "-o", "pid="]);
    return true;
  } catch {
    return false;
  }
}

export function createSession(sessionId: string, values: Partial<Session> = {}): Session {
  const cwd = values.cwd ?? null;
  return {
    schema: 1,
    session_id: sessionId,
    agent: values.agent ?? "codex",
    project: values.project ?? (cwd ? basename(cwd) : "Codex"),
    cwd,
    tty: values.tty ?? null,
    state: values.state ?? "idle",
    waiting_kind: values.waiting_kind ?? null,
    question: values.question ?? null,
    pending_tool: values.pending_tool ?? null,
    pending_command: values.pending_command ?? null,
    last_message: values.last_message ?? null,
    model: values.model ?? null,
    reasoning: values.reasoning ?? null,
    ctx_pct: values.ctx_pct ?? null,
    cost_usd: values.cost_usd ?? null,
    updated_at: new Date().toISOString(),
    capabilities: values.capabilities ?? ["approve", "skills", "model", "mode"],
  };
}
