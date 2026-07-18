import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startServer } from "../server.js";
import { createSession, StateStore } from "../state-store.js";

test("serves grid state and records browser actions", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-server-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.upsertSession(createSession("server-session", { tty: "/dev/ttys001", project: "Server", cwd: "/work/Server" }));
  const server = await startServer(store, 0);
  context.after(() => server.close());
  const base = `http://127.0.0.1:${server.port}`;
  const authorizedHeaders = (headers: Record<string, string> = {}) => ({ ...headers, "x-vizhi-token": server.token });
  assert.equal((await fetch(base)).status, 403);
  const pageResponse = await fetch(`${base}/?token=${server.token}`);
  assert.equal(pageResponse.status, 200);
  const sessionCookie = pageResponse.headers.get("set-cookie");
  assert.ok(sessionCookie);
  assert.equal((await fetch(base, { headers: { cookie: sessionCookie } })).status, 200);
  const page = await pageResponse.text();
  assert.match(page, /data-action="mode"/);
  assert.match(page, /data-action="agent"/);
  assert.match(page, /data-action="fork"/);
  assert.match(page, /data-action="favorite"/);
  assert.match(page, /data-action="clipboard"/);
  assert.match(page, /data-action="screenshot"/);
  assert.match(page, /id="voice"/);
  assert.match(page, /queueAction\(\{type:'voice'/);
  assert.match(page, /data-action="new_terminal"/);
  assert.match(page, /data-action="exit"/);
  assert.match(page, /data-needs-waiting/);
  assert.match(page, /id="recent-history"/);
  assert.match(page, /data-key="page_down"/);
  assert.match(page, /id="prompt-controls"/);
  assert.match(page, /id="git-controls"/);
  assert.match(page, /data-keep-terminal/);
  assert.match(page, /const vizhiToken='[A-Za-z0-9_-]+'/);
  assert.doesNotMatch(page, /__VIZHI_TOKEN__/);
  assert.doesNotMatch(page, /data-action="usage"/);
  assert.equal((await fetch(`${base}/api/state`)).status, 403);
  const state = await fetch(`${base}/api/state`, { headers: authorizedHeaders() }).then((response) => response.json()) as { slots: Array<{ session: { project: string } | null }> };
  assert.equal(state.slots[0].session?.project, "Server");
  const templates = await fetch(`${base}/api/templates`, { headers: authorizedHeaders() }).then((response) => response.json()) as Array<{ id: string; label: string; group: string }>;
  assert.equal(templates.length, 15);
  assert.equal(templates.find((template) => template.id === "plan")?.label, "Plan");
  assert.deepEqual(templates.find((template) => template.id === "review"), { id: "review", label: "Review", group: "Vizhi Prompts" });

  const response = await fetch(`${base}/actions`, {
    method: "POST", headers: authorizedHeaders({ "content-type": "application/json" }), body: JSON.stringify({ type: "focus", slot: 1 }),
  });
  assert.equal(response.status, 201);

  const crossOriginResponse = await fetch(`${base}/actions`, {
    method: "POST",
    headers: authorizedHeaders({ "content-type": "application/json", origin: "https://example.test" }),
    body: JSON.stringify({ type: "focus", slot: 1 }),
  });
  assert.equal(crossOriginResponse.status, 403);

  const keyResponse = await fetch(`${base}/actions`, {
    method: "POST", headers: authorizedHeaders({ "content-type": "application/json" }), body: JSON.stringify({ type: "key", key: "tab", slot: 1, return_to_browser: true }),
  });
  assert.equal(keyResponse.status, 201);
  const keyAction = await keyResponse.json() as { id: string; created_at: string };
  assert.deepEqual(JSON.parse(await readFile(join(store.actionsPath, `${keyAction.id}.json`), "utf8")), {
    id: keyAction.id,
    type: "key",
    key: "tab",
    slot: 1,
    session_id: "server-session",
    return_to_browser: true,
    created_at: keyAction.created_at,
  });

  const templateResponse = await fetch(`${base}/actions`, {
    method: "POST", headers: authorizedHeaders({ "content-type": "application/json" }), body: JSON.stringify({ type: "prompt_template", template_id: "status", slot: 1 }),
  });
  assert.equal(templateResponse.status, 201);
  const templateAction = await templateResponse.json() as { id: string };
  const savedTemplateAction = JSON.parse(await readFile(join(store.actionsPath, `${templateAction.id}.json`), "utf8")) as { type: string; template_id: string };
  assert.equal(savedTemplateAction.type, "prompt_template");
  assert.equal(savedTemplateAction.template_id, "status");

  const voiceResponse = await fetch(`${base}/actions`, {
    method: "POST", headers: authorizedHeaders({ "content-type": "application/json" }), body: JSON.stringify({ type: "voice", text: "Write tests", slot: 1 }),
  });
  assert.equal(voiceResponse.status, 201);
  const voiceAction = await voiceResponse.json() as { id: string };
  const savedVoiceAction = JSON.parse(await readFile(join(store.actionsPath, `${voiceAction.id}.json`), "utf8")) as { type: string; text: string };
  assert.equal(savedVoiceAction.type, "voice");
  assert.equal(savedVoiceAction.text, "Write tests");

  const newTerminalResponse = await fetch(`${base}/actions`, {
    method: "POST", headers: authorizedHeaders({ "content-type": "application/json" }), body: JSON.stringify({ type: "new_terminal", slot: 1, open_in_new_window: true }),
  });
  assert.equal(newTerminalResponse.status, 201);
  const newTerminalAction = await newTerminalResponse.json() as { id: string; created_at: string };
  assert.deepEqual(JSON.parse(await readFile(join(store.actionsPath, `${newTerminalAction.id}.json`), "utf8")), {
    id: newTerminalAction.id,
    type: "new_terminal",
    slot: 0,
    cwd: "/work/Server",
    open_in_new_window: true,
    created_at: newTerminalAction.created_at,
  });

  const invalidResponse = await fetch(`${base}/actions`, {
    method: "POST", headers: authorizedHeaders({ "content-type": "application/json" }), body: JSON.stringify({ type: "key", key: "escape", slot: 1 }),
  });
  assert.equal(invalidResponse.status, 400);
});
