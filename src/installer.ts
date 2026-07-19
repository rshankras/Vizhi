import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const BEGIN_MARKER = "# >>> Vizhi hooks >>>";
const END_MARKER = "# <<< Vizhi hooks <<<";
const EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "Stop"];

export interface CodexHookInstallOptions {
  home?: string;
  hooksFile?: string;
}

export interface CodexHookUninstallOptions extends CodexHookInstallOptions {
  ipcRoot?: string;
  purge?: boolean;
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

function removeMarkedBlock(config: string): string {
  const start = config.indexOf(BEGIN_MARKER);
  if (start === -1) return config;
  const end = config.indexOf(END_MARKER, start);
  if (end === -1) throw new Error("Existing Vizhi hook block is incomplete; restore the backup before uninstalling.");

  const before = config.slice(0, start).trimEnd();
  const after = config.slice(end + END_MARKER.length).trimStart();
  if (!before) return after ? `${after}\n` : "";
  if (!after) return `${before}\n`;
  return `${before}\n\n${after}`;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as NodeJS.ErrnoException).code === code;
}

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw error;
  }
}

async function removeOwnedPath(path: string): Promise<boolean> {
  try {
    const entry = await lstat(path);
    await rm(path, { recursive: entry.isDirectory() && !entry.isSymbolicLink(), force: true });
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return false;
    throw error;
  }
}

async function removeEmptyDirectory(path: string): Promise<void> {
  try {
    const entry = await lstat(path);
    if (!entry.isDirectory() || entry.isSymbolicLink()) return;
    await rmdir(path);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT") || hasErrorCode(error, "ENOTEMPTY")) return;
    throw error;
  }
}

async function ensureNotSymlink(path: string): Promise<void> {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`Vizhi refuses to modify symlinked path ${path}.`);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return;
    throw error;
  }
}

async function ensureDirectory(path: string): Promise<void> {
  await ensureNotSymlink(path);
  await mkdir(path, { recursive: true });
  const entry = await lstat(path);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error(`Vizhi refuses to use non-directory path ${path}.`);
  }
}

async function ensureRegularFileOrAbsent(path: string): Promise<void> {
  try {
    const entry = await lstat(path);
    if (entry.isSymbolicLink()) throw new Error(`Vizhi refuses to modify symlinked path ${path}.`);
    if (!entry.isFile()) throw new Error(`Vizhi refuses to modify non-regular file ${path}.`);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return;
    throw error;
  }
}

async function existingFileMode(path: string, fallback: number): Promise<number> {
  try {
    const entry = await lstat(path);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error(`Vizhi refuses to modify non-regular file ${path}.`);
    }
    return entry.mode & 0o777;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return fallback;
    throw error;
  }
}

async function writeFileAtomically(path: string, content: string, fallbackMode: number): Promise<void> {
  await ensureRegularFileOrAbsent(path);
  const mode = await existingFileMode(path, fallbackMode);
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, content, { encoding: "utf8", mode, flag: "wx" });
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function installCodexHooks(cliPath: string, options: CodexHookInstallOptions = {}): Promise<string> {
  const home = options.home ?? homedir();
  const vizhiPath = join(home, ".vizhi");
  const scriptsPath = join(vizhiPath, "scripts");
  const hooksFile = options.hooksFile ?? join(home, ".codex", "config.toml");
  const hooksDirectory = dirname(hooksFile);
  const hookPath = join(scriptsPath, "codex-hook.sh");
  const manifestPath = join(vizhiPath, "codex-hooks.vizhi.toml");
  const backupPath = `${hooksFile}.vizhi.bak`;
  await ensureDirectory(vizhiPath);
  await ensureDirectory(scriptsPath);
  await ensureDirectory(hooksDirectory);
  await Promise.all([
    ensureRegularFileOrAbsent(hookPath),
    ensureRegularFileOrAbsent(manifestPath),
    ensureRegularFileOrAbsent(hooksFile),
    ensureRegularFileOrAbsent(backupPath),
  ]);

  await writeFileAtomically(
    hookPath,
    `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(cliPath)} hook --event "$1"\n`,
    0o700,
  );
  const block = hookConfig(hookPath);
  await writeFileAtomically(manifestPath, block, 0o600);
  const current = await readOptionalFile(hooksFile) ?? "";
  const hasBackup = (await readOptionalFile(backupPath)) !== null;
  if (!hasBackup && current) await writeFileAtomically(backupPath, current, 0o600);
  await writeFileAtomically(hooksFile, replaceMarkedBlock(current, block), 0o600);
  return `Installed Vizhi hooks in ${hooksFile}. Restart Codex and approve its one-time hook trust prompt.`;
}

export async function uninstallCodexHooks(options: CodexHookUninstallOptions = {}): Promise<string> {
  const home = options.home ?? homedir();
  const hooksFile = options.hooksFile ?? join(home, ".codex", "config.toml");
  const vizhiPath = join(home, ".vizhi");
  const scriptsPath = join(vizhiPath, "scripts");
  const ipcRoot = options.ipcRoot ?? "/tmp/vizhi";
  const removed: string[] = [];
  await ensureNotSymlink(join(home, ".codex"));
  await ensureNotSymlink(dirname(hooksFile));
  await ensureNotSymlink(hooksFile);
  await ensureRegularFileOrAbsent(hooksFile);
  await ensureNotSymlink(vizhiPath);
  await ensureNotSymlink(ipcRoot);
  const current = await readOptionalFile(hooksFile);

  if (current !== null) {
    const next = removeMarkedBlock(current);
    if (next !== current) {
      await writeFileAtomically(hooksFile, next, 0o600);
      removed.push("Codex hook block");
    }
  }

  for (const path of [
    join(scriptsPath, "codex-hook.sh"),
    join(scriptsPath, "vizhi-codex-hook.js"),
    join(scriptsPath, "vizhi-codex-hook.sh"),
    join(vizhiPath, "codex-hooks.vizhi.toml"),
    join(vizhiPath, "voice"),
    ipcRoot,
  ]) {
    if (await removeOwnedPath(path)) removed.push(path);
  }

  if (options.purge) {
    for (const path of [
      join(vizhiPath, "prompt-template.json"),
      join(vizhiPath, "prompt-templates.json"),
    ]) {
      if (await removeOwnedPath(path)) removed.push(path);
    }
  }

  await removeEmptyDirectory(scriptsPath);
  await removeEmptyDirectory(vizhiPath);

  const result = removed.length ? `Removed ${removed.join(", ")}.` : "No Vizhi hooks or local runtime files were found.";
  return `${result} ${options.purge ? "Removed saved Vizhi prompt templates." : "Saved Vizhi prompt templates were preserved; use --purge to remove them."}`;
}
