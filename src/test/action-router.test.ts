import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionRouter, shellQuote, type ActionExecutor } from "../action-router.js";
import { createSession, StateStore } from "../state-store.js";

test("quotes shell arguments without allowing quote breakout", () => {
  assert.equal(shellQuote("plain path"), "'plain path'");
  assert.equal(shellQuote("a'b"), "'a'\"'\"'b'");
  assert.equal(shellQuote("$(unexpected)"), "'$(unexpected)'");
});

test("claims focus actions before executing them against the assigned terminal", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("session", { tty: "/dev/ttys001" }));
  await writeFile(join(store.actionsPath, "physical-focus.json"), JSON.stringify({
    id: "physical-focus", type: "focus", slot: 1, created_at: new Date().toISOString(),
  }));
  const calls: string[] = [];
  const executor: ActionExecutor = {
    focusTerminal: async (tty) => { calls.push(`focus:${tty}`); },
    respond: async (answer) => { calls.push(`respond:${answer}`); },
    typeText: async (text) => { calls.push(`text:${text}`); },
    interrupt: async () => { calls.push("interrupt"); },
    pressKey: async (key) => { calls.push(`key:${key}`); },
  };
  await new ActionRouter(store, executor, false).processPending();
  assert.deepEqual(calls, ["focus:/dev/ttys001"]);
  assert.equal((await readdir(join(store.actionsPath, "done"))).length, 1);
  assert.equal((await store.getGrid()).focused_session, "session");
});

test("quarantines malformed action files without blocking valid actions", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("session", { tty: "/dev/ttys001" }));
  await Promise.all([
    writeFile(join(store.actionsPath, "corrupt.json"), "{not json"),
    writeFile(join(store.actionsPath, "focus.json"), JSON.stringify({
      id: "focus", type: "focus", slot: 1, created_at: new Date().toISOString(),
    })),
  ]);
  const calls: string[] = [];
  const executor: ActionExecutor = {
    focusTerminal: async (tty) => { calls.push(`focus:${tty}`); },
    respond: async () => undefined,
    typeText: async () => undefined,
    interrupt: async () => undefined,
    pressKey: async () => undefined,
  };

  await new ActionRouter(store, executor, false).processPending();

  assert.deepEqual(calls, ["focus:/dev/ttys001"]);
  assert.equal((await readdir(join(store.actionsPath, "done"))).length, 1);
  assert.equal((await readdir(join(store.actionsPath, "failed"))).length, 1);
});

test("focuses the assigned terminal before typing a voice transcript", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("session", { tty: "/dev/ttys001" }));
  await writeFile(join(store.actionsPath, "voice.json"), JSON.stringify({
    id: "voice", type: "voice", slot: 1, text: "Write regression tests", created_at: new Date().toISOString(),
  }));
  const calls: string[] = [];
  const executor: ActionExecutor = {
    focusTerminal: async (tty) => { calls.push(`focus:${tty}`); },
    respond: async (answer) => { calls.push(`respond:${answer}`); },
    typeText: async (text) => { calls.push(`text:${text}`); },
    interrupt: async () => { calls.push("interrupt"); },
    pressKey: async (key) => { calls.push(`key:${key}`); },
  };
  await new ActionRouter(store, executor, false).processPending();
  assert.deepEqual(calls, ["focus:/dev/ttys001", "text:Write regression tests"]);
});

test("refuses to type into the frontmost app when a session has no terminal TTY", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("session-without-tty", { tty: null }));
  await writeFile(join(store.actionsPath, "voice.json"), JSON.stringify({
    id: "voice", type: "voice", slot: 1, text: "Do not send this elsewhere", created_at: new Date().toISOString(),
  }));
  const calls: string[] = [];
  const executor: ActionExecutor = {
    focusTerminal: async (tty) => { calls.push(`focus:${tty}`); },
    respond: async (answer) => { calls.push(`respond:${answer}`); },
    typeText: async (text) => { calls.push(`text:${text}`); },
    interrupt: async () => { calls.push("interrupt"); },
    pressKey: async (key) => { calls.push(`key:${key}`); },
  };

  await new ActionRouter(store, executor, false).processPending();

  assert.deepEqual(calls, []);
});

test("delivers a queued action to its session after slots compact", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("first", { tty: "/dev/ttys001" }));
  await store.upsertSession(createSession("second", { tty: "/dev/ttys002" }));
  const action = await store.createAction("compact", 2);
  assert.equal(action.session_id, "second");

  await store.reconcileCodexSessions([{ pid: "102", tty: "/dev/ttys002" }]);
  assert.equal((await store.getGrid()).slots[0].session?.session_id, "second");

  const calls: string[] = [];
  const executor: ActionExecutor = {
    focusTerminal: async (tty) => { calls.push(`focus:${tty}`); },
    respond: async (answer) => { calls.push(`respond:${answer}`); },
    typeText: async (text) => { calls.push(`text:${text}`); },
    interrupt: async () => { calls.push("interrupt"); },
    pressKey: async (key) => { calls.push(`key:${key}`); },
  };
  await new ActionRouter(store, executor, false).processPending();
  assert.deepEqual(calls, ["focus:/dev/ttys002", "text:/compact"]);
  assert.equal((await store.getGrid()).focused_session, "second");
});

test("returns to the browser after a browser-originated action", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("session", { tty: "/dev/ttys001" }));
  await writeFile(join(store.actionsPath, "browser-compact.json"), JSON.stringify({
    id: "browser-compact", type: "compact", slot: 1, return_to_browser: true, created_at: new Date().toISOString(),
  }));
  const calls: string[] = [];
  const executor: ActionExecutor = {
    focusTerminal: async (tty, capturePreviousApplication) => { calls.push(`focus:${tty}:${capturePreviousApplication}`); },
    respond: async (answer) => { calls.push(`respond:${answer}`); },
    typeText: async (text) => { calls.push(`text:${text}`); },
    interrupt: async () => { calls.push("interrupt"); },
    pressKey: async (key) => { calls.push(`key:${key}`); },
    restorePreviousApplication: async () => { calls.push("restore"); },
  };
  await new ActionRouter(store, executor, false).processPending();
  assert.deepEqual(calls, ["focus:/dev/ttys001:true", "text:/compact", "restore"]);
});

test("focuses the selected terminal before sending command shortcuts", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("session", { tty: "/dev/ttys001" }));
  const actions = [
    { id: "interrupt", type: "interrupt", slot: 1, created_at: new Date().toISOString() },
    { id: "compact", type: "compact", slot: 1, created_at: new Date(Date.now() + 1).toISOString() },
    { id: "new", type: "new_session", slot: 1, created_at: new Date(Date.now() + 2).toISOString() },
    { id: "model", type: "model", slot: 1, created_at: new Date(Date.now() + 3).toISOString() },
    { id: "mode", type: "mode", slot: 1, created_at: new Date(Date.now() + 4).toISOString() },
    { id: "agent", type: "agent", slot: 1, created_at: new Date(Date.now() + 5).toISOString() },
  ];
  await Promise.all(actions.map((action) => writeFile(join(store.actionsPath, `${action.id}.json`), JSON.stringify(action))));
  const calls: string[] = [];
  const executor: ActionExecutor = {
    focusTerminal: async (tty) => { calls.push(`focus:${tty}`); },
    respond: async (answer) => { calls.push(`respond:${answer}`); },
    typeText: async (text) => { calls.push(`text:${text}`); },
    interrupt: async () => { calls.push("interrupt"); },
    pressKey: async (key) => { calls.push(`key:${key}`); },
  };
  await new ActionRouter(store, executor, false).processPending();
  assert.deepEqual(calls, [
    "focus:/dev/ttys001", "interrupt",
    "focus:/dev/ttys001", "text:/compact",
    "focus:/dev/ttys001", "text:/new",
    "focus:/dev/ttys001", "text:/model",
    "focus:/dev/ttys001", "text:/mode",
    "focus:/dev/ttys001", "text:/agent",
  ]);
});

test("stops the busy indicator immediately after an interrupt", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("session", {
    tty: "/dev/ttys001",
    state: "busy",
    pending_tool: "shell",
    pending_command: "npm test",
  }));
  await writeFile(join(store.actionsPath, "interrupt.json"), JSON.stringify({
    id: "interrupt", type: "interrupt", slot: 1, created_at: new Date().toISOString(),
  }));
  const executor: ActionExecutor = {
    focusTerminal: async () => undefined,
    respond: async () => undefined,
    typeText: async () => undefined,
    interrupt: async () => undefined,
    pressKey: async () => undefined,
  };
  await new ActionRouter(store, executor, false).processPending();
  const session = (await store.getGrid()).slots[0].session;
  assert.equal(session?.state, "idle");
  assert.equal(session?.pending_tool, null);
  assert.equal(session?.pending_command, null);
});

test("answers a permission prompt with a single approval shortcut", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("session", {
    tty: "/dev/ttys001",
    state: "waiting",
    waiting_kind: "permission",
    pending_tool: "shell",
    pending_command: "git status",
  }));
  await writeFile(join(store.actionsPath, "approve.json"), JSON.stringify({
    id: "approve", type: "approve", slot: 1, created_at: new Date().toISOString(),
  }));
  const calls: string[] = [];
  const executor: ActionExecutor = {
    focusTerminal: async (tty) => { calls.push(`focus:${tty}`); },
    respond: async (answer, asTextInput) => { calls.push(`respond:${answer}:${asTextInput}`); },
    typeText: async () => undefined,
    interrupt: async () => undefined,
    pressKey: async () => undefined,
  };
  await new ActionRouter(store, executor, false).processPending();
  assert.deepEqual(calls, ["focus:/dev/ttys001", "respond:yes:false"]);
  assert.equal((await store.getGrid()).slots[0].session?.state, "busy");
});

test("rejects stale approval actions rather than typing into an idle prompt", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("session", { tty: "/dev/ttys001", state: "idle" }));
  await writeFile(join(store.actionsPath, "deny.json"), JSON.stringify({
    id: "deny", type: "deny", slot: 1, created_at: new Date().toISOString(),
  }));
  const calls: string[] = [];
  const executor: ActionExecutor = {
    focusTerminal: async (tty) => { calls.push(`focus:${tty}`); },
    respond: async () => { calls.push("respond"); },
    typeText: async () => undefined,
    interrupt: async () => undefined,
    pressKey: async () => undefined,
  };
  await new ActionRouter(store, executor, false).processPending();
  assert.deepEqual(calls, []);
});

test("focuses the selected terminal before sending navigation keys", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("session", { tty: "/dev/ttys001" }));
  const actions = [
    { id: "tab", type: "key", key: "tab", slot: 1, created_at: new Date().toISOString() },
    { id: "page-down", type: "key", key: "page_down", slot: 1, created_at: new Date(Date.now() + 1).toISOString() },
  ];
  await Promise.all(actions.map((action) => writeFile(join(store.actionsPath, `${action.id}.json`), JSON.stringify(action))));
  const calls: string[] = [];
  const executor: ActionExecutor = {
    focusTerminal: async (tty) => { calls.push(`focus:${tty}`); },
    respond: async (answer) => { calls.push(`respond:${answer}`); },
    typeText: async (text) => { calls.push(`text:${text}`); },
    interrupt: async () => { calls.push("interrupt"); },
    pressKey: async (key) => { calls.push(`key:${key}`); },
  };
  await new ActionRouter(store, executor, false).processPending();
  assert.deepEqual(calls, [
    "focus:/dev/ttys001", "key:tab",
    "focus:/dev/ttys001", "key:page_down",
  ]);
});

test("types the configured prompt template in the selected terminal", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("session", { tty: "/dev/ttys001" }));
  const templatePath = join(root, "prompt-template.json");
  await writeFile(templatePath, JSON.stringify({ schema: 1, label: "Review", prompt: "Review the current changes for regressions." }));
  await writeFile(join(store.actionsPath, "prompt.json"), JSON.stringify({
    id: "prompt", type: "prompt_template", slot: 1, created_at: new Date().toISOString(),
  }));
  const calls: string[] = [];
  const executor: ActionExecutor = {
    focusTerminal: async (tty) => { calls.push(`focus:${tty}`); },
    respond: async (answer) => { calls.push(`respond:${answer}`); },
    typeText: async (text) => { calls.push(`text:${text}`); },
    interrupt: async () => { calls.push("interrupt"); },
    pressKey: async (key) => { calls.push(`key:${key}`); },
  };
  await new ActionRouter(store, executor, false, templatePath).processPending();
  assert.deepEqual(calls, ["focus:/dev/ttys001", "text:Review the current changes for regressions."]);
});

test("types the requested built-in Git template", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("session", { tty: "/dev/ttys001" }));
  await writeFile(join(store.actionsPath, "status.json"), JSON.stringify({
    id: "status", type: "prompt_template", template_id: "status", slot: 1, created_at: new Date().toISOString(),
  }));
  const calls: string[] = [];
  const executor: ActionExecutor = {
    focusTerminal: async (tty) => { calls.push(`focus:${tty}`); },
    respond: async (answer) => { calls.push(`respond:${answer}`); },
    typeText: async (text) => { calls.push(`text:${text}`); },
    interrupt: async () => { calls.push("interrupt"); },
    pressKey: async (key) => { calls.push(`key:${key}`); },
  };
  await new ActionRouter(store, executor, false).processPending();
  assert.equal(calls[0], "focus:/dev/ttys001");
  assert.match(calls[1] ?? "", /^text:Inspect git status,/);
});

test("forks the selected session into a new Terminal tab", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("019f6c41-7317-7ca2-93f6-d3e20145b169", { tty: "/dev/ttys001", cwd: "/work/Vizhi" }));
  await writeFile(join(store.actionsPath, "fork.json"), JSON.stringify({
    id: "fork", type: "fork", slot: 1, return_to_browser: true, created_at: new Date().toISOString(),
  }));
  const calls: string[] = [];
  const executor: ActionExecutor = {
    focusTerminal: async (tty) => { calls.push(`focus:${tty}`); },
    respond: async () => undefined,
    typeText: async () => undefined,
    interrupt: async () => undefined,
    pressKey: async () => undefined,
    forkSession: async (session, returnToBrowser) => { calls.push(`fork:${session.session_id}:${returnToBrowser}`); },
    restorePreviousApplication: async () => { calls.push("restore"); },
  };
  await new ActionRouter(store, executor, false).processPending();
  assert.deepEqual(calls, ["fork:019f6c41-7317-7ca2-93f6-d3e20145b169:true", "restore"]);
});

test("resumes a saved session without requiring a live grid slot", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.createResumeAction("019f6c41-7317-7ca2-93f6-d3e20145b169", "/work/Vizhi", true);
  const calls: string[] = [];
  const executor: ActionExecutor = {
    focusTerminal: async () => undefined,
    respond: async () => undefined,
    typeText: async () => undefined,
    interrupt: async () => undefined,
    pressKey: async () => undefined,
    resumeSession: async (sessionId, cwd, returnToBrowser) => { calls.push(`resume:${sessionId}:${cwd}:${returnToBrowser}`); },
    restorePreviousApplication: async () => { calls.push("restore"); },
  };
  await new ActionRouter(store, executor, false).processPending();
  assert.deepEqual(calls, ["resume:019f6c41-7317-7ca2-93f6-d3e20145b169:/work/Vizhi:true", "restore"]);
});

test("opens Terminal tabs or windows without requiring a grid slot", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.ensure();
  await Promise.all([
    writeFile(join(store.actionsPath, "new-tab.json"), JSON.stringify({
      id: "new-tab", type: "new_terminal", slot: 0, cwd: "/work/Vizhi", created_at: new Date().toISOString(),
    })),
    writeFile(join(store.actionsPath, "new-window.json"), JSON.stringify({
      id: "new-window", type: "new_terminal", slot: 0, cwd: "/work/Other", open_in_new_window: true, created_at: new Date(Date.now() + 1).toISOString(),
    })),
  ]);
  const calls: string[] = [];
  const executor: ActionExecutor = {
    focusTerminal: async () => undefined,
    respond: async () => undefined,
    typeText: async () => undefined,
    interrupt: async () => undefined,
    pressKey: async () => undefined,
    newTerminalSession: async (cwd, openInNewWindow, returnToBrowser) => { calls.push(`new:${cwd}:${openInNewWindow}:${returnToBrowser}`); },
  };
  await new ActionRouter(store, executor, false).processPending();
  assert.deepEqual(calls, ["new:/work/Vizhi:false:false", "new:/work/Other:true:false"]);
});

test("sends Codex's exit command to the selected session", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("session", { tty: "/dev/ttys001" }));
  await writeFile(join(store.actionsPath, "exit.json"), JSON.stringify({
    id: "exit", type: "exit", slot: 1, created_at: new Date().toISOString(),
  }));
  const calls: string[] = [];
  const executor: ActionExecutor = {
    focusTerminal: async (tty) => { calls.push(`focus:${tty}`); },
    respond: async () => undefined,
    typeText: async (text) => { calls.push(`text:${text}`); },
    interrupt: async () => undefined,
    pressKey: async () => undefined,
  };
  await new ActionRouter(store, executor, false).processPending();
  assert.deepEqual(calls, ["focus:/dev/ttys001", "text:/exit"]);
});

test("delivers favorite, clipboard, and screenshot context actions", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("session", { tty: "/dev/ttys001" }));
  const templatePath = join(root, "prompt-templates.json");
  await writeFile(templatePath, JSON.stringify({ schema: 1, templates: {}, favorite_template_id: "plan" }));
  const actions = ["favorite", "clipboard", "screenshot"].map((type, index) => ({
    id: type, type, slot: 1, created_at: new Date(Date.now() + index).toISOString(),
  }));
  await Promise.all(actions.map((action) => writeFile(join(store.actionsPath, `${action.id}.json`), JSON.stringify(action))));
  const calls: string[] = [];
  const executor: ActionExecutor = {
    focusTerminal: async (tty) => { calls.push(`focus:${tty}`); },
    respond: async () => undefined,
    typeText: async (text) => { calls.push(`text:${text}`); },
    interrupt: async () => undefined,
    pressKey: async () => undefined,
    pasteClipboard: async () => { calls.push("clipboard"); },
    captureScreenshot: async () => { calls.push("screenshot"); return "/tmp/vizhi/captures/capture.png"; },
  };
  await new ActionRouter(store, executor, false, templatePath).processPending();
  assert.equal(calls[0], "focus:/dev/ttys001");
  assert.match(calls[1] ?? "", /^text:Explore the relevant repository/);
  assert.deepEqual(calls.slice(2, 5), ["focus:/dev/ttys001", "clipboard", "focus:/dev/ttys001"]);
  assert.equal(calls[5], "screenshot");
  assert.match(calls[6] ?? "", /capture.png/);
});

test("stages a screenshot and submits it with the next voice transcript", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-router-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("session", { tty: "/dev/ttys001" }));
  await writeFile(join(store.actionsPath, "screenshot.json"), JSON.stringify({
    id: "screenshot", type: "screenshot", slot: 1, created_at: new Date().toISOString(),
  }));
  const calls: string[] = [];
  const executor: ActionExecutor = {
    focusTerminal: async (tty) => { calls.push(`focus:${tty}`); },
    respond: async () => undefined,
    typeText: async (text, submit) => { calls.push(`text:${text}:${submit}`); },
    interrupt: async () => undefined,
    pressKey: async () => undefined,
    captureScreenshot: async () => "/tmp/vizhi/captures/capture.png",
  };
  const router = new ActionRouter(store, executor, false);
  await router.processPending();
  assert.match(calls[1] ?? "", /capture\.png.*:false$/);
  const draft = await store.getScreenshotDraft("session");
  assert.equal(draft?.session_id, "session");
  assert.equal(draft?.image_path, "/tmp/vizhi/captures/capture.png");

  await writeFile(join(store.actionsPath, "voice.json"), JSON.stringify({
    id: "voice", type: "voice", slot: 1, session_id: "session", text: "Check the spacing", created_at: new Date().toISOString(),
  }));
  await router.processPending();
  assert.equal(calls[3], "text:Check the spacing:true");
  assert.equal(await store.getScreenshotDraft("session"), null);
});
