import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { installCodexHooks } from "../installer.js";

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
  assert.match(config, /codex-hook\.sh PermissionRequest/);
  assert.equal(backup, 'model = "test"\n');
});
