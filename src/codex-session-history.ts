import { execFile } from "node:child_process";
import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import type { SessionHistoryEntry } from "./types.js";

const executeFile = promisify(execFile);
const MAX_HISTORY_ENTRIES = 18;
const SESSION_ID = /^[a-zA-Z0-9-]{8,128}$/;

interface SessionMetaPayload {
  id?: unknown;
  cwd?: unknown;
  timestamp?: unknown;
}

interface SessionMetaRecord {
  timestamp?: unknown;
  type?: unknown;
  payload?: SessionMetaPayload;
}

export class CodexSessionHistory {
  constructor(private readonly codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex")) {}

  async list(archived: boolean): Promise<SessionHistoryEntry[]> {
    const directory = join(this.codexHome, archived ? "archived_sessions" : "sessions");
    const files = await sessionFiles(directory);
    const entries = await Promise.all(files.map(async (filePath) => this.readEntry(filePath, archived)));
    return entries
      .filter((entry): entry is SessionHistoryEntry => entry !== null)
      .sort((first, second) => second.updated_at.localeCompare(first.updated_at))
      .slice(0, MAX_HISTORY_ENTRIES);
  }

  async find(sessionId: string, archived: boolean): Promise<SessionHistoryEntry | null> {
    if (!isSessionId(sessionId)) return null;
    return (await this.list(archived)).find((entry) => entry.session_id === sessionId) ?? null;
  }

  async archive(sessionId: string): Promise<void> {
    await this.run("archive", sessionId);
  }

  async unarchive(sessionId: string): Promise<void> {
    await this.run("unarchive", sessionId);
  }

  private async run(command: "archive" | "unarchive", sessionId: string): Promise<void> {
    if (!isSessionId(sessionId)) throw new Error("Invalid Codex session id.");
    await executeFile("codex", [command, sessionId], { maxBuffer: 64 * 1024 });
  }

  private async readEntry(filePath: string, archived: boolean): Promise<SessionHistoryEntry | null> {
    const [metadata, fileStat] = await Promise.all([readSessionMeta(filePath), stat(filePath)]);
    if (!metadata || !isSessionId(metadata.id)) return null;
    const cwd = typeof metadata.cwd === "string" && metadata.cwd ? metadata.cwd : null;
    const updatedAt = typeof metadata.timestamp === "string" && !Number.isNaN(Date.parse(metadata.timestamp))
      ? metadata.timestamp
      : fileStat.mtime.toISOString();
    return {
      session_id: metadata.id,
      project: cwd ? basename(cwd) || "Codex" : "Codex",
      cwd,
      updated_at: updatedAt,
      archived,
    };
  }
}

export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID.test(value);
}

async function sessionFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => join(entry.parentPath, entry.name));
  } catch {
    return [];
  }
}

async function readSessionMeta(filePath: string): Promise<{ id: string; cwd: unknown; timestamp: unknown } | null> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(filePath, "r");
    const buffer = Buffer.alloc(64 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const source = buffer.subarray(0, bytesRead).toString("utf8");
    for (const line of source.split("\n")) {
      try {
        const record = JSON.parse(line) as SessionMetaRecord;
        if (record.type !== "session_meta" || !record.payload) continue;
        return {
          id: typeof record.payload.id === "string" ? record.payload.id : "",
          cwd: record.payload.cwd,
          timestamp: record.timestamp ?? record.payload.timestamp,
        };
      } catch {
      }
    }
    if (source.includes('"type":"session_meta"')) {
      const id = jsonStringField(source, "id");
      const cwd = jsonStringField(source, "cwd");
      const timestamp = jsonStringField(source, "timestamp");
      if (id) return { id, cwd, timestamp };
    }
  } catch {
  } finally {
    await handle?.close();
  }
  return null;
}

function jsonStringField(source: string, name: string): string | null {
  const escapedName = name.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`"${escapedName}"\\s*:\\s*("(?:\\\\.|[^"\\\\])*")`).exec(source);
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]) as unknown;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
