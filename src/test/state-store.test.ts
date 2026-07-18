import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { classifyRisk } from "../risk.js";
import { createSession, StateStore } from "../state-store.js";

async function temporaryStore(): Promise<{ store: StateStore; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "vizhi-test-"));
  const store = new StateStore(root);
  await store.ensure();
  return { store, root };
}

test("assigns sessions to stable grid slots by TTY", async (context) => {
  const { store, root } = await temporaryStore();
  context.after(() => rm(root, { recursive: true, force: true }));
  await store.upsertSession(createSession("first", { tty: "/dev/ttys001", project: "One" }));
  await store.upsertSession(createSession("new-id", { tty: "/dev/ttys001", project: "One" }));
  await store.upsertSession(createSession("second", { tty: "/dev/ttys002", project: "Two" }));
  const grid = await store.getGrid();
  assert.equal(grid.slots[0].session?.session_id, "new-id");
  assert.equal(grid.slots[1].session?.project, "Two");
});

test("packs remaining sessions forward after a session exits and preserves focus", async (context) => {
  const { store, root } = await temporaryStore();
  context.after(() => rm(root, { recursive: true, force: true }));
  await store.upsertSession(createSession("first", { tty: "/dev/ttys001", project: "One" }));
  await store.upsertSession(createSession("second", { tty: "/dev/ttys002", project: "Two" }));
  await store.upsertSession(createSession("third", { tty: "/dev/ttys003", project: "Three" }));
  await store.setFocusedSlot(2);

  await store.reconcileCodexSessions([
    { pid: "102", tty: "/dev/ttys002" },
    { pid: "103", tty: "/dev/ttys003" },
  ]);

  const grid = await store.getGrid();
  assert.equal(grid.slots[0].session?.session_id, "second");
  assert.equal(grid.slots[1].session?.session_id, "third");
  assert.equal(grid.slots[2].session, null);
  assert.equal(grid.focused_session, "second");
});

test("creates replay-safe action files and focuses the selected session", async (context) => {
  const { store, root } = await temporaryStore();
  context.after(() => rm(root, { recursive: true, force: true }));
  await store.upsertSession(createSession("session", { tty: "/dev/ttys001" }));
  const action = await store.createAction("focus", 1);
  const written = JSON.parse(await readFile(join(store.actionsPath, `${action.id}.json`), "utf8"));
  assert.equal(written.type, "focus");
  assert.equal((await store.getGrid()).focused_session, "session");
});

test("creates a session-independent resume action", async (context) => {
  const { store, root } = await temporaryStore();
  context.after(() => rm(root, { recursive: true, force: true }));
  const action = await store.createResumeAction("019f6c41-7317-7ca2-93f6-d3e20145b169", "/tmp/project", true);
  assert.deepEqual(JSON.parse(await readFile(join(store.actionsPath, `${action.id}.json`), "utf8")), {
    id: action.id,
    type: "resume",
    slot: 0,
    session_id: "019f6c41-7317-7ca2-93f6-d3e20145b169",
    cwd: "/tmp/project",
    return_to_browser: true,
    created_at: action.created_at,
  });
});

test("uses private IPC permissions and leaves raw hook capture disabled by default", async (context) => {
  const originalRawHookLog = process.env.VIZHI_RAW_HOOK_LOG;
  delete process.env.VIZHI_RAW_HOOK_LOG;
  context.after(() => {
    if (originalRawHookLog === undefined) delete process.env.VIZHI_RAW_HOOK_LOG;
    else process.env.VIZHI_RAW_HOOK_LOG = originalRawHookLog;
  });
  const { store, root } = await temporaryStore();
  context.after(() => rm(root, { recursive: true, force: true }));
  await store.upsertSession(createSession("private", { tty: "/dev/ttys001" }));
  const action = await store.createAction("focus", 1);
  await writeFile(store.rawHooksPath, "legacy hook payload\n");
  await store.ensure();

  for (const path of [root, store.sessionsPath, store.actionsPath, store.draftsPath, store.capturesPath]) {
    assert.equal((await stat(path)).mode & 0o777, 0o700);
  }
  assert.equal((await stat(join(store.sessionsPath, "private.json"))).mode & 0o777, 0o600);
  assert.equal((await stat(join(store.actionsPath, `${action.id}.json`))).mode & 0o777, 0o600);
  await assert.rejects(readFile(store.rawHooksPath, "utf8"), { code: "ENOENT" });
});

test("expires completed actions and screenshot captures without removing fresh artifacts", async (context) => {
  const { store, root } = await temporaryStore();
  context.after(() => rm(root, { recursive: true, force: true }));
  const donePath = join(store.actionsPath, "done");
  const failedPath = join(store.actionsPath, "failed");
  await store.ensure();
  await Promise.all([mkdir(donePath, { recursive: true }), mkdir(failedPath, { recursive: true })]);
  await writeFile(join(store.capturesPath, "expired.png"), "expired capture");
  await writeFile(join(store.capturesPath, "fresh.png"), "fresh capture");
  await writeFile(join(donePath, "expired.json"), "expired action");
  await writeFile(join(donePath, "fresh.json"), "fresh action");
  await writeFile(join(failedPath, "expired.invalid"), "expired malformed action");
  await writeFile(join(failedPath, "fresh.invalid"), "fresh malformed action");
  const expiredAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await Promise.all([
    utimes(join(store.capturesPath, "expired.png"), expiredAt, expiredAt),
    utimes(join(donePath, "expired.json"), expiredAt, expiredAt),
    utimes(join(failedPath, "expired.invalid"), expiredAt, expiredAt),
  ]);

  await store.pruneLocalArtifacts();

  await assert.rejects(readFile(join(store.capturesPath, "expired.png"), "utf8"), { code: "ENOENT" });
  await assert.rejects(readFile(join(donePath, "expired.json"), "utf8"), { code: "ENOENT" });
  await assert.rejects(readFile(join(failedPath, "expired.invalid"), "utf8"), { code: "ENOENT" });
  assert.equal(await readFile(join(store.capturesPath, "fresh.png"), "utf8"), "fresh capture");
  assert.equal(await readFile(join(donePath, "fresh.json"), "utf8"), "fresh action");
  assert.equal(await readFile(join(failedPath, "fresh.invalid"), "utf8"), "fresh malformed action");
});

test("classifies risky pending permissions", () => {
  assert.equal(classifyRisk(createSession("push", {
    state: "waiting", waiting_kind: "permission", pending_tool: "shell", pending_command: "git push origin main",
  })), "high");
  assert.equal(classifyRisk(createSession("read", {
    state: "waiting", waiting_kind: "permission", pending_tool: "read",
  })), "low");
});
