import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CodexHookAdapter } from "../hook-adapter.js";
import { StateStore } from "../state-store.js";

test("maps Codex hook events to the session state machine", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-hooks-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const adapter = new CodexHookAdapter(new StateStore(root));
  const base = { session_id: "thread-1", tty: "/dev/ttys001", cwd: "/work/Vizhi", model: "gpt-5.6" };
  assert.equal((await adapter.handle("SessionStart", base)).state, "idle");
  assert.equal((await adapter.handle("UserPromptSubmit", base)).state, "busy");
  await adapter.handle("PreToolUse", { ...base, tool_name: "shell", command: "git push origin main" });
  const waiting = await adapter.handle("PermissionRequest", { ...base, question: "Push changes?" });
  assert.equal(waiting.state, "waiting");
  assert.equal(waiting.pending_command, "git push origin main");
  assert.equal((await adapter.handle("PostToolUse", { ...base, tool_name: "other" })).state, "waiting");
  assert.equal((await adapter.handle("PostToolUse", { ...base, tool_name: "shell" })).state, "busy");
  assert.equal((await adapter.handle("Stop", base)).state, "idle");
});

test("captures the last assistant message on turn completion and clears it on the next prompt", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-hooks-message-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const adapter = new CodexHookAdapter(new StateStore(root));
  const base = { session_id: "thread-2", tty: "/dev/ttys002", cwd: "/work/Vizhi" };
  await adapter.handle("SessionStart", base);

  const finished = await adapter.handle("Stop", { ...base, "last-assistant-message": "Your working tree is clean." });
  assert.equal(finished.state, "idle");
  assert.equal(finished.last_message, "Your working tree is clean.");

  const kept = await adapter.handle("Stop", base);
  assert.equal(kept.last_message, "Your working tree is clean.");

  const nextTurn = await adapter.handle("UserPromptSubmit", base);
  assert.equal(nextTurn.last_message, null);
});
