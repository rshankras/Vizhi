import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_PROMPT_TEMPLATE, getFavoriteTemplate, getFavoriteTemplateId, getPromptTemplate, readPromptTemplate, writeFavoriteTemplateId, writePromptTemplate, writePromptTemplateForId } from "../prompt-template.js";

test("uses the built-in Review template until a user configures one", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-prompt-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await readPromptTemplate(join(root, "prompt-template.json")), DEFAULT_PROMPT_TEMPLATE);
});

test("stores and reloads a prompt template", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-prompt-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "prompt-template.json");
  await writePromptTemplate("Review", "Review this change for regressions.", path);
  assert.deepEqual(await readPromptTemplate(path), {
    schema: 1,
    id: "review",
    label: "Review",
    prompt: "Review this change for regressions.",
  });
});

test("writes prompt template config atomically with private permissions", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-prompt-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, "private");
  const path = join(directory, "prompt-templates.json");

  await writePromptTemplate("Review", "Review this change for regressions.", path);
  await writePromptTemplate("Review", "Review the latest change for regressions.", path);

  assert.equal((await readPromptTemplate(path)).prompt, "Review the latest change for regressions.");
  assert.deepEqual((await readdir(directory)).filter((entry) => entry.endsWith(".tmp")), []);
  if (process.platform !== "win32") {
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  }
});

test("preserves permissions on an existing custom template directory", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-prompt-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, "shared");
  const path = join(directory, "prompt-templates.json");
  await mkdir(directory, { mode: 0o755 });
  if (process.platform !== "win32") await chmod(directory, 0o755);

  await writePromptTemplate("Review", "Review this change for regressions.", path);

  if (process.platform !== "win32") {
    assert.equal((await stat(directory)).mode & 0o777, 0o755);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  }
});

test("rejects a custom template directory writable by group or other users", async (context) => {
  if (process.platform === "win32") return;
  const root = await mkdtemp(join(tmpdir(), "vizhi-prompt-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, "unsafe");
  await mkdir(directory, { mode: 0o777 });
  await chmod(directory, 0o777);

  await assert.rejects(
    writePromptTemplate("Review", "Review this change for regressions.", join(directory, "prompt-templates.json")),
    /writable by group or other users/,
  );
});

test("stores independent overrides for prompt and Git templates", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-prompt-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "prompt-templates.json");
  await writePromptTemplateForId("fix_bug", "Repair", "Find and repair the reported bug.", path);
  await writePromptTemplateForId("status", "Git State", "Show the working tree state.", path);
  assert.deepEqual(await getPromptTemplate("fix_bug", path), {
    schema: 1,
    id: "fix_bug",
    label: "Repair",
    prompt: "Find and repair the reported bug.",
  });
  assert.deepEqual(await getPromptTemplate("status", path), {
    schema: 1,
    id: "status",
    label: "Git State",
    prompt: "Show the working tree state.",
  });
  assert.equal((await getPromptTemplate("review", path)).label, "Review");
});

test("uses Review as the favorite until a user chooses another template", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-prompt-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "prompt-templates.json");
  assert.equal(await getFavoriteTemplateId(path), "review");
  await writeFavoriteTemplateId("plan", path);
  assert.equal(await getFavoriteTemplateId(path), "plan");
  assert.equal((await getFavoriteTemplate(path)).label, "Plan");
});
