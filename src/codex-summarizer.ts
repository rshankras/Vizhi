import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const SUMMARY_TIMEOUT_MS = 20_000;
const CODEX_CANDIDATES = [
  join(homedir(), ".local", "bin", "codex"),
  "/opt/homebrew/bin/codex",
  "/usr/local/bin/codex",
];

export function summaryPrompt(text: string): string {
  return `Summarize the following coding-assistant answer in at most two short spoken sentences for text-to-speech. Reply with only the summary. ANSWER: ${text}`;
}

export type SummaryRunner = (prompt: string, outputPath: string) => Promise<void>;

async function findCodex(): Promise<string | null> {
  for (const candidate of CODEX_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

async function runCodex(prompt: string, outputPath: string): Promise<void> {
  const codexPath = await findCodex();
  if (!codexPath) throw new Error("Vizhi could not find the codex binary.");
  await executeFile(codexPath, [
    "exec", "--ephemeral", "--ignore-user-config", "--skip-git-repo-check",
    "-s", "read-only", "-c", "model_reasoning_effort=low", "-C", tmpdir(),
    "-o", outputPath, prompt,
  ], {
    timeout: SUMMARY_TIMEOUT_MS,
    env: { ...process.env, VIZHI_IPC_ROOT: join(tmpdir(), "vizhi-summarizer") },
  });
}

export async function summarizeWithCodex(text: string, runner: SummaryRunner = runCodex): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const workspace = await mkdtemp(join(tmpdir(), "vizhi-summary-"));
  const outputPath = join(workspace, "summary.txt");
  try {
    await runner(summaryPrompt(trimmed.slice(0, 2000)), outputPath);
    const summary = (await readFile(outputPath, "utf8")).trim();
    return summary || null;
  } catch {
    return null;
  } finally {
    await rm(workspace, { recursive: true, force: true }).catch(() => undefined);
  }
}
