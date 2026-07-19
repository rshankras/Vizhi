import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ActionRouter, MacTerminalExecutor } from "./action-router.js";
import { DemoPlayer } from "./demo.js";
import { CodexHookAdapter } from "./hook-adapter.js";
import { installCodexHooks, uninstallCodexHooks } from "./installer.js";
import { defaultPromptTemplatePath, isPromptTemplateId, writeFavoriteTemplateId, writePromptTemplateForId } from "./prompt-template.js";
import { startServer } from "./server.js";
import { StateStore } from "./state-store.js";

function option(args: string[], name: string): string | undefined {
  const position = args.indexOf(name);
  return position === -1 ? undefined : args[position + 1];
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "set-prompt-template") {
    const id = option(args, "--id") ?? "review";
    const label = option(args, "--label");
    const prompt = option(args, "--prompt");
    if (!isPromptTemplateId(id)) throw new Error(`Unknown prompt template '${id}'.`);
    if (!label || !prompt) throw new Error("set-prompt-template requires --label <Label> --prompt <Text>");
    await writePromptTemplateForId(id, label, prompt, option(args, "--path") ?? defaultPromptTemplatePath());
    process.stdout.write(`Saved ${id} prompt template to ${option(args, "--path") ?? defaultPromptTemplatePath()}\n`);
    return;
  }

  if (command === "set-favorite-template") {
    const id = option(args, "--id");
    if (!isPromptTemplateId(id)) throw new Error("set-favorite-template requires --id <TemplateId>");
    const template = await writeFavoriteTemplateId(id, option(args, "--path") ?? defaultPromptTemplatePath());
    process.stdout.write(`Favorite prompt is now ${template.label}\n`);
    return;
  }

  const demo = args.includes("--demo");
  const ipcRoot = option(args, "--ipc-root") ?? (demo ? "/tmp/vizhi-demo" : "/tmp/vizhi");
  const store = new StateStore(ipcRoot);
  await store.ensure();

  if (command === "hook") {
    const event = option(args, "--event");
    if (!event) throw new Error("hook requires --event <EventName>");
    let source = "";
    for await (const chunk of process.stdin) source += chunk.toString();
    const payload: unknown = source.trim() ? JSON.parse(source) : {};
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("hook payload must be a JSON object");
    await new CodexHookAdapter(store).handle(event, payload as Record<string, unknown>);
    process.stdout.write("{}\n");
    return;
  }

  if (command === "install-codex-hooks") {
    const cliPath = fileURLToPath(import.meta.url);
    process.stdout.write(`${await installCodexHooks(cliPath, { hooksFile: option(args, "--hooks-file") })}\n`);
    return;
  }

  if (command === "uninstall-codex-hooks") {
    process.stdout.write(`${await uninstallCodexHooks({ hooksFile: option(args, "--hooks-file"), purge: args.includes("--purge") })}\n`);
    return;
  }

  if (command === "router") {
    if (process.platform !== "darwin") throw new Error("The live Terminal action router requires macOS.");
    const router = new ActionRouter(store, new MacTerminalExecutor(ipcRoot));
    router.start();
    process.stdout.write(`Vizhi action router watching ${store.actionsPath}\n`);
    const stop = () => router.stop();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    return;
  }

  if (command === "serve") {
    const player = demo ? new DemoPlayer(store) : null;
    if (player) await player.start();
    const server = await startServer(store, Number(option(args, "--port") ?? "4917"));
    process.stdout.write(`Vizhi virtual deck: http://127.0.0.1:${server.port}/?token=${server.token}${demo ? " (demo)" : ""}\n`);
    const stop = async () => { player?.stop(); await server.close(); };
    process.once("SIGINT", () => void stop());
    process.once("SIGTERM", () => void stop());
    return;
  }

  throw new Error("Usage: vizhi <serve [--demo] | router | hook --event EventName | install-codex-hooks | uninstall-codex-hooks [--purge] | set-prompt-template [--id TemplateId] --label <Label> --prompt <Text> | set-favorite-template --id TemplateId>");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
