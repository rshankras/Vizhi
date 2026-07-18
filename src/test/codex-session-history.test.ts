import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CodexSessionHistory, isSessionId } from "../codex-session-history.js";

test("reads only session metadata, including a large metadata record", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-history-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sessionsPath = join(root, "sessions", "2026", "07", "18");
  await mkdir(sessionsPath, { recursive: true });
  const sessionId = "019f6c41-7317-7ca2-93f6-d3e20145b169";
  await writeFile(join(sessionsPath, "rollout.jsonl"), `${JSON.stringify({
    timestamp: "2026-07-18T10:00:00.000Z",
    type: "session_meta",
    payload: { id: sessionId, cwd: "/work/Vizhi", base_instructions: { text: "x".repeat(70_000) } },
  })}\n${JSON.stringify({ type: "response_item", payload: { text: "not read" } })}\n`);
  const entries = await new CodexSessionHistory(root).list(false);
  assert.deepEqual(entries, [{
    session_id: sessionId,
    project: "Vizhi",
    cwd: "/work/Vizhi",
    updated_at: "2026-07-18T10:00:00.000Z",
    archived: false,
  }]);
});

test("accepts Codex UUID-style session ids only", () => {
  assert.equal(isSessionId("019f6c41-7317-7ca2-93f6-d3e20145b169"), true);
  assert.equal(isSessionId("../../unsafe"), false);
});
