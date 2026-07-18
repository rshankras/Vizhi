import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CodexProcessWatcher, parseCodexTerminalProcesses, type CodexProcessSource } from "../codex-process-watcher.js";
import { createSession, StateStore } from "../state-store.js";

test("discovers only Codex processes attached to terminal TTYs", () => {
  const processes = parseCodexTerminalProcesses(`
  101 11 ttys001 codex
  102 12 ttys002 codex --resume abc
  103 102 ttys004 codex --no-alt-screen
  104 12 ttys003 codex-code-mode-host
  105 12 ??       codex
`);
  assert.deepEqual(processes, [
    { pid: "101", tty: "/dev/ttys001" },
    { pid: "102", tty: "/dev/ttys002" },
  ]);
});

test("creates a provisional slot and replaces it when the hook session arrives", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-watcher-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  const source: CodexProcessSource = { list: async () => [{ pid: "101", tty: "/dev/ttys001" }] };
  await new CodexProcessWatcher(store, source).scan();
  assert.equal((await store.getGrid()).slots[0].session?.session_id, "provisional-101");

  await store.upsertSession(createSession("real-session", { tty: "/dev/ttys001", project: "Vizhi" }));
  const grid = await store.getGrid();
  assert.equal(grid.slots[0].session?.session_id, "real-session");
  assert.equal(grid.slots[0].session?.project, "Vizhi");
});

test("releases a Codex slot when its terminal no longer runs Codex", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-watcher-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("session", { agent: "codex", tty: "/dev/ttys001" }));
  await store.reconcileCodexSessions([]);
  assert.equal((await store.getGrid()).slots[0].session, null);
});

test("keeps a live idle session visible after hook activity becomes stale", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-watcher-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  const session = createSession("session", { agent: "codex", tty: "/dev/ttys001", state: "idle" });
  await store.upsertSession(session);

  const staleAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  await writeFile(join(store.sessionsPath, "session.json"), `${JSON.stringify({ ...session, updated_at: staleAt })}\n`);

  await store.reconcileCodexSessions([{ pid: "101", tty: "/dev/ttys001" }]);
  const refreshed = await store.getSession("session");
  assert.ok(Date.parse(refreshed!.updated_at) > Date.parse(staleAt));
  assert.equal((await store.getGrid()).slots[0].session?.session_id, "session");
});

test("clears a stale busy state with no active tool", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-watcher-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  const session = createSession("session", { agent: "codex", tty: "/dev/ttys001", state: "busy" });
  await store.upsertSession(session);

  const staleAt = new Date(Date.now() - 46 * 1000).toISOString();
  await writeFile(join(store.sessionsPath, "session.json"), `${JSON.stringify({ ...session, updated_at: staleAt })}\n`);

  await store.reconcileCodexSessions([{ pid: "101", tty: "/dev/ttys001" }]);
  assert.equal((await store.getGrid()).slots[0].session?.state, "idle");
});
