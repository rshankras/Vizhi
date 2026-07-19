import { basename } from "node:path";
import { execFileSync } from "node:child_process";
import { readContextPercent } from "./context-usage.js";
import { createSession, StateStore } from "./state-store.js";
import type { Session } from "./types.js";

type Payload = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pick(payload: Payload, keys: string[]): string | null {
  for (const key of keys) {
    const direct = text(payload[key]);
    if (direct) return direct;
  }
  for (const nestedKey of ["session", "context", "input", "tool_input", "tool"]) {
    const nested = payload[nestedKey];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const found = pick(nested as Payload, keys);
      if (found) return found;
    }
  }
  return null;
}

function parentTty(): string | null {
  try {
    const tty = execFileSync("/bin/ps", ["-o", "tty=", "-p", String(process.ppid)], { encoding: "utf8" }).trim();
    return tty && tty !== "??" ? `/dev/${tty}` : null;
  } catch {
    return null;
  }
}

function identity(payload: Payload): { sessionId: string; tty: string | null; cwd: string | null } {
  const tty = pick(payload, ["tty", "terminal_tty"]) ?? parentTty();
  const cwd = pick(payload, ["cwd", "workspace", "working_directory"]);
  const sessionId = pick(payload, ["session_id", "sessionId", "thread_id", "threadId", "id"])
    ?? `${tty ?? "tty-unknown"}-${process.ppid}`;
  return { sessionId, tty, cwd };
}

function details(payload: Payload): Partial<Session> {
  const cwd = pick(payload, ["cwd", "workspace", "working_directory"]);
  const model = pick(payload, ["model", "model_name"]);
  return {
    cwd,
    project: pick(payload, ["project", "project_name"]) ?? (cwd ? basename(cwd) : "Codex"),
    model,
    reasoning: pick(payload, ["reasoning", "reasoning_effort", "effort"]),
  };
}

export class CodexHookAdapter {
  constructor(private readonly store: StateStore) {}

  async handle(event: string, payload: Payload): Promise<Session> {
    await this.store.appendRawHook(event, payload);
    const { sessionId, tty } = identity(payload);
    const sessionDetails = details(payload);
    const contextPercent = await readContextPercent(pick(payload, ["transcript_path"]));
    if (contextPercent !== null) sessionDetails.ctx_pct = contextPercent;
    const existing = await this.store.getSession(sessionId);
    const session = existing ?? createSession(sessionId, { ...sessionDetails, tty });
    const base = { ...session, ...sessionDetails, tty: tty ?? session.tty, updated_at: new Date().toISOString() };
    const normalizedEvent = event.toLowerCase();

    if (normalizedEvent === "sessionstart") {
      if (pick(payload, ["source"]) === "compact" && existing?.state === "busy") {
        await this.store.upsertSession(base);
        return base;
      }
      const next = { ...base, state: "idle" as const, waiting_kind: null, question: null };
      await this.store.upsertSession(next);
      return next;
    }

    if (normalizedEvent === "userpromptsubmit") {
      await this.store.clearScreenshotDraft(sessionId);
      const next = { ...base, state: "busy" as const, waiting_kind: null, question: null };
      await this.store.upsertSession(next);
      return next;
    }

    if (normalizedEvent === "pretooluse") {
      const next = {
        ...base,
        state: "busy" as const,
        pending_tool: pick(payload, ["tool_name", "toolName", "name"]),
        pending_command: pick(payload, ["command", "cmd", "input"]),
      };
      await this.store.upsertSession(next);
      return next;
    }

    if (normalizedEvent === "permissionrequest") {
      const next = {
        ...base,
        state: "waiting" as const,
        waiting_kind: "permission" as const,
        question: pick(payload, ["question", "message", "prompt", "reason"]) ?? "Approval requested",
      };
      await this.store.upsertSession(next);
      return next;
    }

    if (normalizedEvent === "posttooluse") {
      const completedTool = pick(payload, ["tool_name", "toolName", "name"]);
      const matchesPending = Boolean(completedTool && completedTool === session.pending_tool);
      const next = matchesPending
        ? { ...base, state: "busy" as const, waiting_kind: null, question: null, pending_tool: null, pending_command: null }
        : base;
      await this.store.upsertSession(next);
      return next;
    }

    if (normalizedEvent === "stop" || normalizedEvent === "agent-turn-complete") {
      const next = { ...base, state: "idle" as const, waiting_kind: null, question: null, pending_tool: null, pending_command: null };
      await this.store.upsertSession(next);
      return next;
    }

    if (normalizedEvent === "sessionend") {
      await this.store.clearScreenshotDraft(sessionId);
      const next = { ...base, state: "dead" as const };
      await this.store.upsertSession(next);
      return next;
    }

    await this.store.upsertSession(base);
    return base;
  }
}
