import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import test from "node:test";
import { summarizeWithCodex, summaryPrompt } from "../codex-summarizer.js";

test("returns the summary the runner writes and cleans its workspace", async () => {
  let receivedPrompt = "";
  const summary = await summarizeWithCodex("A long answer about the build.", async (prompt, outputPath) => {
    receivedPrompt = prompt;
    await writeFile(outputPath, "The build is fine.\n");
  });
  assert.equal(summary, "The build is fine.");
  assert.equal(receivedPrompt, summaryPrompt("A long answer about the build."));
});

test("returns null for empty input, runner failure, and empty output", async () => {
  assert.equal(await summarizeWithCodex("   ", async () => {}), null);
  assert.equal(await summarizeWithCodex("text", async () => {
    throw new Error("codex unavailable");
  }), null);
  assert.equal(await summarizeWithCodex("text", async () => {}), null);
});

test("caps the text embedded in the prompt", async () => {
  let receivedPrompt = "";
  await summarizeWithCodex("x".repeat(5000), async (prompt, outputPath) => {
    receivedPrompt = prompt;
    await writeFile(outputPath, "Short.");
  });
  assert.ok(receivedPrompt.length < 2200);
});
