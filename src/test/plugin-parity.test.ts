import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DEFAULT_PROMPT_TEMPLATES, PROMPT_TEMPLATE_IDS } from "../prompt-template.js";
import { startServer } from "../server.js";
import { StateStore } from "../state-store.js";
import { TERMINAL_KEYS } from "../types.js";
import { CONVERSATION_POLICY, SESSION_NUMBER_WORDS, VOICE_INTENT_IDS, VOICE_INTENTS } from "../voice-intents.js";

function captures(source: string, expression: RegExp): string[] {
  return [...source.matchAll(expression)].map((match) => match[1]);
}

async function pluginSource(path: string): Promise<string> {
  return readFile(fileURLToPath(new URL(`../../VizhiPlugin/src/${path}`, import.meta.url)), "utf8");
}

async function repositorySource(path: string): Promise<string> {
  return readFile(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
}

test("keeps browser controls aligned with keypad actions, navigation, and templates", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "vizhi-parity-"));
  const originalTemplatePath = process.env.VIZHI_PROMPT_TEMPLATE_PATH;
  process.env.VIZHI_PROMPT_TEMPLATE_PATH = join(root, "prompt-templates.json");
  context.after(() => {
    if (originalTemplatePath === undefined) delete process.env.VIZHI_PROMPT_TEMPLATE_PATH;
    else process.env.VIZHI_PROMPT_TEMPLATE_PATH = originalTemplatePath;
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  const [gridCommands, runtime, templateCatalog, voiceIntentCatalog, conversationRuntime, profileGenerator, applicationLink, pluginProject] = await Promise.all([
    pluginSource("Actions/GridSlotCommands.cs"),
    pluginSource("Core/VizhiRuntime.cs"),
    pluginSource("Helpers/TemplateCatalog.cs"),
    pluginSource("Helpers/VoiceIntentCatalog.cs"),
    pluginSource("Core/VizhiConversationRuntime.cs"),
    repositorySource("tools/generate-default-profile.mjs"),
    pluginSource("VizhiApplication.cs"),
    pluginSource("VizhiPlugin.csproj"),
  ]);
  const contextCommands = gridCommands.slice(
    gridCommands.indexOf("public sealed class ContextCommand"),
    gridCommands.indexOf("public sealed class UsageCommand"),
  );
  const navigationCommands = gridCommands.slice(
    gridCommands.indexOf("public sealed class NavigationCommand"),
    gridCommands.indexOf("public sealed class ContextCommand"),
  );
  const keypadActions = new Set([
    ...captures(gridCommands, /: base\("[^"]+", "[^"]+", "([a-z_]+)"/g),
    ...captures(gridCommands, /WriteAction\("([a-z_]+)"/g),
    ...captures(contextCommands, /new NavigationDefinition\("([a-z_]+)"/g),
    ...captures(runtime, /type = "([a-z_]+)"/g),
    ...captures(runtime, /StateReader\.WriteAction\("([a-z_]+)"/g),
  ]);
  const expectedActions = [
    "approve", "deny", "interrupt", "compact", "new_session", "exit", "model", "mode", "agent", "fork",
    "favorite", "clipboard", "screenshot", "focus", "voice", "new_terminal", "key", "prompt_template",
  ];
  assert.deepEqual([...keypadActions].sort(), [...expectedActions].sort());
  assert.deepEqual(captures(navigationCommands, /new NavigationDefinition\("([a-z_]+)"/g).sort(), [...TERMINAL_KEYS].sort());
  assert.deepEqual(
    captures(profileGenerator, /page\("[A-F0-9]+", "([^"]+)", \[/g),
    ["Sessions", "Navigate", "Prompts", "Commands", "Git"],
  );
  assert.match(
    profileGenerator,
    /page\("E5B064CC1B484AE3BC0225475EAB1B02", "Commands", \[[\s\S]*?showActionsRingAction,/,
  );
  assert.match(profileGenerator, /\$@Generic___Loupedeck\.GenericPlugin\.ShowRadialMenuDynamicAction/);
  assert.match(profileGenerator, /const staticActionIcons = \[/);
  assert.match(profileGenerator, /backgroundColor: 0xFF000000,/);
  assert.match(profileGenerator, /area: \{ x: 17, y: 0, width: 65, height: 65 \}/);
  const staticActionIconDefinitions = profileGenerator.match(/const staticActionIcons = \[([\s\S]*?)\n\];/)?.[1] ?? "";
  assert.doesNotMatch(staticActionIconDefinitions, /GridCommand|ApproveFocusedCommand|DenyFocusedCommand|VoiceCommand/);
  assert.match(runtime, /public String GetFocusedSessionId\(\)/);
  assert.match(runtime, /var persistedSessionId = StateReader\.GetFocusedSessionId\(\)/);
  assert.match(runtime, /public static Boolean IsFocusedApprovalWaiting\(out Boolean isHighRisk\)/);
  assert.match(gridCommands, /KeyImage\.RenderApprovalAction\(/);
  for (const actionId of ["CompactSessionCommand", "InterruptSessionCommand", "ModelSessionCommand", "NewSessionCommand", "FavoritePromptCommand", "AgentSessionCommand", "ForkSessionCommand", "ExitSessionCommand", "NewTerminalTabCommand", "NewTerminalWindowCommand"]) {
    assert.match(profileGenerator, new RegExp(`action\\("${actionId}"\\)`));
  }
  for (const templateId of ["explain", "fix_bug", "refactor", "review", "security", "write_tests", "plan", "handoff", "safe_revert", "commit", "create_pr", "diff", "log", "push", "status"]) {
    assert.match(profileGenerator, new RegExp(`action\\("TemplateCommand", "${templateId}"\\)`));
  }
  assert.match(profileGenerator, /const profileApplicationName = "@_vizhi";/);
  assert.match(profileGenerator, /applicationName: profileApplicationName,/);
  assert.match(profileGenerator, /name: profileApplicationName,/);
  assert.match(profileGenerator, /const terminalBundleName = "com\.apple\.Terminal";/);
  assert.match(profileGenerator, /processOrBundleName: terminalBundleName,/);
  assert.match(applicationLink, /GetBundleName\(\) => "com\.apple\.Terminal";/);
  assert.match(pluginProject, /RemoveDir Directories="\$\(OutputPath\)\.\.\\profiles"/);
  assert.match(pluginProject, /PackageFiles Include="package\\\*\*\\\*" Exclude="package\\profiles\\\*\.lp5"/);
  assert.match(pluginProject, /PackageFiles Include="package\\profiles\\DefaultProfile70\.lp5"/);

  const keypadIntents = [...voiceIntentCatalog.matchAll(/new VoiceIntentDefinition\("([a-z_]+)"((?:, "[^"]+")*)\)/g)]
    .map((match) => ({ id: match[1], phrases: [...match[2].matchAll(/"([^"]+)"/g)].map((phrase) => phrase[1]) }));
  assert.deepEqual(keypadIntents, VOICE_INTENT_IDS.map((id) => ({ id, phrases: [...VOICE_INTENTS[id]] })));
  const keypadNumberWords = Object.fromEntries(
    [...voiceIntentCatalog.matchAll(/\{ "([a-z]+)", ([1-6]) \},/g)].map((match) => [match[1], Number(match[2])]),
  );
  assert.deepEqual(keypadNumberWords, SESSION_NUMBER_WORDS);
  assert.match(voiceIntentCatalog, new RegExp(`ConfirmPhrase = "${CONVERSATION_POLICY.confirmPhrase}";`));
  assert.match(voiceIntentCatalog, new RegExp(`MaxEmptyTurns = ${CONVERSATION_POLICY.maxEmptyTurns};`));
  assert.match(voiceIntentCatalog, new RegExp(`SilenceSeconds = ${CONVERSATION_POLICY.silenceSeconds};`));
  assert.match(voiceIntentCatalog, new RegExp(`TurnMaxSeconds = ${CONVERSATION_POLICY.turnMaxSeconds};`));
  assert.match(voiceIntentCatalog, new RegExp(`IdleTimeoutMinutes = ${CONVERSATION_POLICY.idleTimeoutMinutes};`));
  assert.match(conversationRuntime, /VizhiRuntime\.Write/);
  assert.doesNotMatch(conversationRuntime, /osascript|keystroke/i);

  const keypadTemplates = [...templateCatalog.matchAll(/new TemplateDefinition\("([a-z_]+)", "([^"]+)", "([^"]+)"/g)]
    .map((match) => ({ id: match[1], label: match[2], group: match[3] }));
  assert.deepEqual(keypadTemplates, PROMPT_TEMPLATE_IDS.map((id) => ({
    id,
    label: DEFAULT_PROMPT_TEMPLATES[id].label,
    group: DEFAULT_PROMPT_TEMPLATES[id].group,
  })));

  const store = new StateStore(root);
  const server = await startServer(store, 0);
  context.after(() => server.close());
  const base = `http://127.0.0.1:${server.port}`;
  const page = await fetch(`${base}/?token=${server.token}`).then((response) => response.text());
  for (const action of expectedActions) {
    if (action === "voice") assert.match(page, /queueAction\(\{type:'voice'/);
    else if (action === "favorite") assert.match(page, /id:'favorite',action:'favorite'/);
    else assert.match(page, new RegExp(`data-action="${action}"`));
  }
  for (const key of TERMINAL_KEYS) assert.match(page, new RegExp(`data-key="${key}"`));
  assert.match(page, /Selected session · Live usage/);
  assert.match(page, /data-action="focus"/);
  assert.match(page, /id="voice"/);
  assert.match(page, /id="converse"/);
  assert.ok(page.includes(JSON.stringify(VOICE_INTENTS)));
  assert.ok(page.includes(CONVERSATION_POLICY.confirmPhrase));

  const templates = await fetch(`${base}/api/templates`, { headers: { "x-vizhi-token": server.token } })
    .then((response) => response.json()) as Array<{ id: string; label: string; group: string }>;
  assert.deepEqual(templates, PROMPT_TEMPLATE_IDS.map((id) => ({
    id,
    label: DEFAULT_PROMPT_TEMPLATES[id].label,
    group: DEFAULT_PROMPT_TEMPLATES[id].group,
  })));
});
