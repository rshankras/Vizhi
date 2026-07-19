import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { installCodexHooks, uninstallCodexHooks } from "../installer.js";

test("appends one backup-safe Vizhi hooks block to Codex config", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "vizhi-installer-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const codexPath = join(home, ".codex");
  const configPath = join(codexPath, "config.toml");
  await mkdir(codexPath, { recursive: true });
  await writeFile(configPath, 'model = "test"\n');
  await installCodexHooks("/opt/vizhi/dist/cli.js", { home });
  await installCodexHooks("/opt/vizhi/dist/cli.js", { home });
  const config = await readFile(configPath, "utf8");
  const backup = await readFile(`${configPath}.vizhi.bak`, "utf8");
  assert.equal((config.match(/# >>> Vizhi hooks >>>/g) ?? []).length, 1);
  assert.match(config, /\[\[hooks\.PermissionRequest\]\]/);
  assert.match(config, /\[\[hooks\.PermissionRequest\.hooks\]\]/);
  assert.match(config, /codex-hook\.sh' PermissionRequest/);
  assert.equal(backup, 'model = "test"\n');
  const hook = await readFile(join(home, ".vizhi", "scripts", "codex-hook.sh"), "utf8");
  assert.ok(hook.includes(process.execPath));
  assert.doesNotMatch(hook, /\nexec node /);
});

test("refuses to install hooks through a symlinked Codex config", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "vizhi-installer-symlink-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const codexPath = join(home, ".codex");
  const configPath = join(codexPath, "config.toml");
  const targetPath = join(home, "target.toml");
  await mkdir(codexPath, { recursive: true });
  await writeFile(targetPath, 'model = "preserve"\n');
  await symlink(targetPath, configPath);

  await assert.rejects(installCodexHooks("/opt/vizhi/dist/cli.js", { home }), /symlinked path/);
  assert.equal(await readFile(targetPath, "utf8"), 'model = "preserve"\n');
});

test("removes Vizhi hooks and runtime while preserving saved prompts by default", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "vizhi-uninstaller-"));
  const ipcRoot = join(home, "ipc");
  context.after(() => rm(home, { recursive: true, force: true }));
  const codexPath = join(home, ".codex");
  const configPath = join(codexPath, "config.toml");
  const vizhiPath = join(home, ".vizhi");
  const scriptsPath = join(vizhiPath, "scripts");
  const promptPath = join(vizhiPath, "prompt-templates.json");
  const voicePath = join(vizhiPath, "voice", "models", "ggml-base.en.bin");

  await mkdir(codexPath, { recursive: true });
  await writeFile(configPath, 'model = "test"\n');
  await installCodexHooks("/opt/vizhi/dist/cli.js", { home });
  await mkdir(join(scriptsPath), { recursive: true });
  await writeFile(join(scriptsPath, "vizhi-codex-hook.js"), "hook");
  await writeFile(join(scriptsPath, "vizhi-codex-hook.sh"), "hook");
  await mkdir(join(vizhiPath, "voice", "models"), { recursive: true });
  await writeFile(voicePath, "model");
  await writeFile(promptPath, '{"review":{"label":"Review"}}');
  await mkdir(ipcRoot, { recursive: true });
  await writeFile(join(ipcRoot, "registry.json"), "{}");

  const result = await uninstallCodexHooks({ home, ipcRoot });
  const config = await readFile(configPath, "utf8");
  assert.equal(config, 'model = "test"\n');
  assert.doesNotMatch(config, /# >>> Vizhi hooks >>>/);
  assert.equal(await readFile(promptPath, "utf8"), '{"review":{"label":"Review"}}');
  await assert.rejects(lstat(join(scriptsPath, "codex-hook.sh")), { code: "ENOENT" });
  await assert.rejects(lstat(voicePath), { code: "ENOENT" });
  await assert.rejects(lstat(ipcRoot), { code: "ENOENT" });
  assert.match(result, /Saved Vizhi prompt templates were preserved/);

  await uninstallCodexHooks({ home, ipcRoot, purge: true });
  await assert.rejects(lstat(promptPath), { code: "ENOENT" });
});

test("refuses to alter an incomplete Vizhi hook block", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "vizhi-uninstaller-incomplete-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  const codexPath = join(home, ".codex");
  const configPath = join(codexPath, "config.toml");
  const config = 'model = "test"\n# >>> Vizhi hooks >>>\n';
  await mkdir(codexPath, { recursive: true });
  await writeFile(configPath, config);

  await assert.rejects(uninstallCodexHooks({ home }), /Existing Vizhi hook block is incomplete/);
  assert.equal(await readFile(configPath, "utf8"), config);
});
