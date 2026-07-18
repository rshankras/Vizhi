import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const BEGIN_MARKER = "# >>> Vizhi hooks >>>";
const END_MARKER = "# <<< Vizhi hooks <<<";
const EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "Stop"];

export interface CodexHookInstallOptions {
  home?: string;
  hooksFile?: string;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function escapeToml(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function hookConfig(scriptPath: string): string {
  const tables = EVENTS.map((event) => [
    `[[hooks.${event}]]`,
    'matcher = "*"',
    "",
    `[[hooks.${event}.hooks]]`,
    'type = "command"',
    `command = "${escapeToml(`${shellQuote(scriptPath)} ${event}`)}"`,
    "timeout = 5",
  ].join("\n")).join("\n\n");
  return `${BEGIN_MARKER}\n# Vizhi receives Codex lifecycle payloads on stdin and writes local IPC state.\n# Codex will request trust for these hooks on the next launch; approve normally.\n# Never use --dangerously-bypass-hook-trust.\n${tables}\n${END_MARKER}\n`;
}

function replaceMarkedBlock(config: string, block: string): string {
  const start = config.indexOf(BEGIN_MARKER);
  if (start === -1) return `${config.trimEnd()}\n\n${block}`;
  const end = config.indexOf(END_MARKER, start);
  if (end === -1) throw new Error("Existing Vizhi hook block is incomplete; restore the backup before retrying.");
  return `${config.slice(0, start)}${block}${config.slice(end + END_MARKER.length).replace(/^\n?/, "")}`;
}

export async function installCodexHooks(cliPath: string, options: CodexHookInstallOptions = {}): Promise<string> {
  const home = options.home ?? homedir();
  const scriptsPath = join(home, ".vizhi", "scripts");
  const hooksFile = options.hooksFile ?? join(home, ".codex", "config.toml");
  await mkdir(scriptsPath, { recursive: true });
  const hookPath = join(scriptsPath, "codex-hook.sh");
  await writeFile(hookPath, `#!/bin/sh\nexec node ${shellQuote(cliPath)} hook --event "$1"\n`, { mode: 0o755 });

  const block = hookConfig(hookPath);
  await writeFile(join(home, ".vizhi", "codex-hooks.vizhi.toml"), block);
  await mkdir(join(home, ".codex"), { recursive: true });
  const current = await readFile(hooksFile, "utf8").catch(() => "");
  const backupPath = `${hooksFile}.vizhi.bak`;
  const hasBackup = await readFile(backupPath, "utf8").then(() => true).catch(() => false);
  if (!hasBackup && current) await copyFile(hooksFile, backupPath);
  await writeFile(hooksFile, replaceMarkedBlock(current, block));
  return `Installed Vizhi hooks in ${hooksFile}. Restart Codex and approve its one-time hook trust prompt.`;
}
