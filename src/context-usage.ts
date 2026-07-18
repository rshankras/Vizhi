import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";

const MAX_TRANSCRIPT_BYTES = 512 * 1024;
const CODEX_SESSIONS_ROOT = resolve(homedir(), ".codex", "sessions");

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isCodexTranscript(transcriptPath: string): boolean {
  if (!isAbsolute(transcriptPath)) return false;
  const pathRelativeToSessions = relative(CODEX_SESSIONS_ROOT, resolve(transcriptPath));
  return Boolean(pathRelativeToSessions) && !pathRelativeToSessions.startsWith("..") && !isAbsolute(pathRelativeToSessions);
}

export function contextPercentFromTranscript(content: string): number | null {
  const lines = content.trimEnd().split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const entry = JSON.parse(lines[index]) as JsonRecord;
      const payload = entry.payload;
      if (!isRecord(payload) || !isRecord(payload.info)) continue;

      const contextWindow = numberValue(payload.info.model_context_window);
      const lastTokenUsage = payload.info.last_token_usage;
      if (!contextWindow || contextWindow <= 0 || !isRecord(lastTokenUsage)) continue;

      const totalTokens = numberValue(lastTokenUsage.total_tokens);
      if (totalTokens === null || totalTokens < 0) continue;
      return Math.min(100, Math.max(0, Math.round((totalTokens / contextWindow) * 100)));
    } catch {
      continue;
    }
  }

  return null;
}

export async function readContextPercent(transcriptPath: string | null): Promise<number | null> {
  if (!transcriptPath || !isCodexTranscript(transcriptPath)) return null;

  try {
    const file = await open(transcriptPath, "r");
    try {
      const { size } = await file.stat();
      const bytesToRead = Math.min(size, MAX_TRANSCRIPT_BYTES);
      const buffer = Buffer.alloc(bytesToRead);
      await file.read(buffer, 0, bytesToRead, size - bytesToRead);
      return contextPercentFromTranscript(buffer.toString("utf8"));
    } finally {
      await file.close();
    }
  } catch {
    return null;
  }
}
