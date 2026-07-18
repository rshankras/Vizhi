import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
