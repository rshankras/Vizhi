# Vizhi

Vizhi gives you live Codex session controls in two places: a Logitech MX Creative Keypad plugin and a local browser dashboard. It is designed for macOS and Terminal.app. You can use the browser dashboard without a keypad.

## What you need

- A current Node.js LTS release.
- Codex CLI, signed in and usable from Terminal.app.
- macOS Terminal.app for actions that focus a terminal, type text, or press keys.
- For the physical keypad: Logi Options+, an MX Creative Keypad, and the Vizhi `.lplug4` plugin package.
- Only when building the plugin yourself: the .NET 10 SDK and `logiplugintool` from the Logi Actions SDK.
- Only for physical offline Voice: `whisper-cli` (for example, `brew install whisper-cpp`) and a downloaded Whisper model.

## Install and start

Follow these steps once, in order.

### 1. Prepare the Node app

```sh
npm install
npm run build
```

### 2. Connect Vizhi to Codex

```sh
node dist/cli.js install-codex-hooks
```

This adds a small local hook command to your Codex configuration. It also saves a backup of an existing `~/.codex/config.toml` as `config.toml.vizhi.bak`. Restart Codex, then approve Codex's one-time hook-trust prompt.

### 3. Install the keypad plugin (skip this for browser-only use)

If you already have the packaged plugin, install it with:

```sh
logiplugintool install VizhiPlugin/bin/Vizhi_3.9.11.lplug4
```

If you are building from this repository first, create the package and then install it:

```sh
npm run plugin:package
logiplugintool install VizhiPlugin/bin/Vizhi_3.9.11.lplug4
```

Open Logi Options+, choose your MX Creative Keypad, and drag Vizhi actions onto keys. If Vizhi does not appear, quit and reopen Logi Options+.

### 4. Start Vizhi each time you use it

Keep these two commands running in separate Terminal.app windows:

```sh
# Terminal window 1: browser dashboard
npm start

# Terminal window 2: keypad and browser action delivery
npm run router
```

Open the complete URL printed by `npm start`. Do not shorten it: the `token=...` part gives that browser tab access to your local dashboard. Start or resume Codex normally in Terminal.app; Vizhi then shows the session on the keypad and in the browser.

## Permissions in plain terms

Vizhi does not need an administrator password, Full Disk Access, or access to a cloud account. macOS and Codex may ask for these permissions:

- **Codex hook trust — required for live session cards.** Approve this only after you run Vizhi's hook installer yourself. It lets Codex send Vizhi session-status events; it does not bypass Codex approvals.
- **Accessibility for Terminal.app — needed for keypad and browser actions.** This lets the router bring the right Terminal tab forward and send keys such as Yes, No, Esc, or a prompt. Go to **System Settings → Privacy & Security → Accessibility** and enable the terminal app that runs `npm run router` if macOS asks.
- **Automation for Terminal — needed when macOS asks.** Allow the same terminal app to control Terminal.app so Vizhi can select the correct tab. This is only for Terminal.app actions.
- **Accessibility for Logi Plugin Service — needed for the physical Voice key.** It lets the keypad's Voice action deliver its transcript to Terminal.app. Enable it only if you use physical Voice.
- **Microphone — optional Voice only.** Browser Voice asks your browser for microphone access. Physical Voice asks for `Vizhi Voice Helper` access.
- **Screen Recording — optional Screenshot only.** Allow it only if macOS asks when you use Vizhi's Screenshot action.

The `Clipboard` action sends your current clipboard text to the selected Codex session. The `Screenshot` action keeps a local image for up to 15 minutes so Codex can inspect it after you send the prompt.

## Run the demo

```sh
npm install
npm run demo
```

Open the complete URL printed by the command. The replay needs only Node.js; it does not need a keypad, Codex, or macOS.

## Local IPC

This is technical detail for troubleshooting. Most users can skip it.

- Session state: `/tmp/vizhi/sessions/<session-id>.json`
- Slot registry: `/tmp/vizhi/registry.json`
- Browser actions: `/tmp/vizhi/actions/<uuid>.json`
- Captures: `/tmp/vizhi/captures/<timestamp>.png`

Use `--ipc-root <path>` with any command to isolate local runs and tests. Vizhi creates its IPC directories with owner-only permissions, writes new state/action files with owner-only permissions, and binds the browser only to `127.0.0.1`. The dashboard uses a fresh local token each time it starts, so its API and event stream cannot be called without loading that dashboard first.

## Browser dashboard details

The browser dashboard shares the same live session state as the keypad. Select a session card, then use its controls for Yes/No, Esc, Compact, New, Exit, Fork, New Tab, New Window, Model, Mode, Agent, Tab and menu navigation, all prompt templates, and all Git workflows. `Fork` starts `codex fork` in a new Terminal tab with the selected session's project directory. `New Tab` and `New Window` open plain Terminal shells in that project folder. The live usage panel shows context, cost, model, and reasoning. Browser-issued commands return you to the dashboard; choose `Open Terminal` only when you want to stay in the selected Codex tab.

The prompt box sends its text to the selected Codex session. Browser `Voice` uses the browser's speech-recognition support when available and sends the completed transcript immediately, matching the physical Voice key; typed prompts work in every supported browser. The `Clipboard` action deliberately asks for confirmation before pasting plaintext into the selected session. `Screenshot` opens macOS's area selector, saves the capture under `/tmp/vizhi/captures/`, and stages its local image path in the selected Codex prompt without submitting. Captures expire after 15 minutes, giving Codex enough time to inspect the staged path without retaining images indefinitely. Tap either Voice control to add spoken context and send both automatically, or add typed context and press `Enter`. Keep the router running for all browser actions, because it focuses the matching Terminal.app tab and delivers the staged instruction.

The Session Library is browser-only. It shows recent completed Codex sessions and archived sessions without reading conversation messages. `Resume` opens a saved session in a new Terminal tab; `Archive` is confirmation-gated and refuses to archive a currently live Vizhi slot; `Restore` returns an archived session to Codex's normal resume list.

## Troubleshooting

- **The browser says `unauthorized`:** stop `npm start`, run it again, and open the newly printed full URL. Each start creates a new local token.
- **A new Codex session does not appear:** make sure `npm run router` is still running, restart Codex after installing hooks, and start Codex in Terminal.app.
- **A key press does nothing:** check the Accessibility and Automation permissions above, then restart the router.
- **Vizhi does not appear in Logi Options+:** reinstall the `.lplug4` package, then quit and reopen Logi Options+.

## Development

```sh
npm test
```

## Logitech MX Creative Keypad

### Recommended first page

In Logi Options+, drag these Vizhi actions onto your keys:

- `Session 1` through `Session 6` from **Vizhi Sessions**, placed left to right and top to bottom.
- `Yes`, `No`, and `Voice` from **Vizhi Operate**, placed on the bottom row.

The six Session keys are capacity keys, not permanently assigned terminals. The first active Codex session uses Session 1, the next uses Session 2, and remaining sessions move forward when one exits. A black key means no session is available. Each occupied key shows the project name and context percentage: teal means ready, purple means working, and amber or red means attention is needed. A small blue marker shows which session will receive Yes, No, and Voice.

The six session keys plus fixed `Yes`, `No`, and `Voice` controls remain the primary dashboard. Put the following optional actions on a separate Logi Options+ page or profile so they do not displace that muscle-memory layout:

- `Vizhi Commands`: `Esc` interrupts the selected session, `Compact` sends `/compact`, `New` sends `/new`, `Exit` sends Codex's `/exit` command without deleting the saved session, `Fork` branches the selected session into a new Terminal tab, `Model` opens Codex's live model and reasoning picker, `Mode` opens Codex's live mode and approval picker, and `Agent` opens Codex's `/agent` subagent-thread picker. `Favorite` runs the user-selected prompt template and keeps its own star label even when it is configured to run Review. Vizhi never hardcodes models, reasoning levels, or approval modes.
- `Vizhi Terminal`: `New Tab` and `New Window` open plain Terminal shells in the focused session's project folder, or your home folder when no session is selected. They do not start a new Codex session.
- `Vizhi Navigate`: `Tab`, `Up`, `Down`, `Enter`, `Page Up`, and `Page Down` send the matching physical key to the selected Terminal.app session. Use them for Codex menus and scrolling. `Tab` cannot accept Codex's gray placeholder text because it is not an inline suggestion; it only sends a real Tab key to controls that support Tab completion. Codex's Model and Mode pickers use `Up`, `Down`, and `Enter` instead.
- `Vizhi Context`: `Clipboard` pastes the current macOS text clipboard into the selected session. `Screenshot` opens the macOS area selector, saves a PNG under `/tmp/vizhi/captures/`, and stages its path in the prompt. Its key changes to `Draft`; tap `Voice` to add spoken context and send both together automatically. Or add typed context and press `Enter`. Place these on an optional page because they intentionally move private local context into a prompt.
- `Vizhi Status`: `Usage` displays the selected session's context percentage plus current cost when available, otherwise its model and reasoning level. Pressing it focuses that session.
- `Vizhi Prompts`: `Fix Bug`, `Write Tests`, `Explain`, `Refactor`, `Review`, `Security`, `Plan`, `Handoff`, and `Safe Revert` send focused, built-in coding prompts to the selected session. `Plan` explores and waits before editing; `Handoff` summarizes work for a new session; `Safe Revert` inspects and explains risk before waiting for explicit confirmation to modify files.
- `Vizhi Git`: `Commit`, `Diff`, `Push`, `Create PR`, `Status`, and `Git Log` send safe Git workflows to the selected session. Actions such as Push and Create PR still use Codex's normal approval flow and never force-push.

Every prompt and Git workflow works immediately and can be customized independently. For example, replace the `Fix Bug` workflow:

```sh
npm run prompt:set -- --id fix_bug --label Repair --prompt "Investigate the reported bug, implement the smallest safe fix, and add regression coverage."
```

Available IDs are `fix_bug`, `write_tests`, `explain`, `refactor`, `review`, `security`, `plan`, `handoff`, `safe_revert`, `commit`, `diff`, `push`, `create_pr`, `status`, and `log`. Omitting `--id` preserves the older shorthand and edits `review`. Set the physical and browser Favorite action with:

```sh
npm run prompt:favorite -- --id plan
```

Configurations are stored at `~/.vizhi/prompt-templates.json`; an existing `~/.vizhi/prompt-template.json` Review override continues to work. The selected session receives the full prompt while the key shows its short label. Reload the plugin if a changed label is not immediately visible.

Use the normal build while developing. Use the development build only when you want Logi Plugin Service to create or refresh its `.link` development plugin:

```sh
npm run plugin:build
npm run plugin:dev
```

Create a distributable package with one repeatable build, pack, and verification command:

```sh
npm run plugin:package
```

It writes `VizhiPlugin/bin/Vizhi_3.9.11.lplug4`. Before publishing to Logi Marketplace, set real `supportPageUrl` and `homePageUrl` values in `VizhiPlugin/src/package/metadata/LoupedeckPackage.yaml`, add a repository `LICENSE` file, increment the semantic version, and test the package on physical supported hardware.

### Why the router stays open

The router lets keypad and browser actions find the matching Terminal.app tab, bring it forward, and type safely. It also watches for new Codex sessions before the first prompt. When `exit` ends Codex, it releases that session key even if the Terminal tab remains open. Keyboard Escape bypasses Vizhi, so a stopped task can take up to 45 seconds to change from Working to Ready; use Vizhi's `Esc` key when you need the status to update immediately.

The router claims each action by moving it into `/tmp/vizhi/actions/done/` before execution, then removes completed and quarantined action records after one hour. It quarantines malformed action files in `/tmp/vizhi/actions/failed/` so one bad file cannot block later keypad input. It verifies the selected tab by TTY before sending an approval response. `approve`, `deny`, and offline `voice` actions are supported.

### Physical offline Voice (optional)

Assign the `Voice` action from the `Vizhi Operate` group to a keypad key. Press once to record (the key changes to an animated green Listening face), speak, then press it again to transcribe. Vizhi sends the transcript immediately. When the selected session has a staged Screenshot draft, it includes the screenshot path and spoken context in that same submission. Transcription runs locally through `whisper-cli`; its temporary audio and transcript files live in a private Vizhi runtime directory and are cleared after transcription.

Set up the one-time local runtime before first use:

```sh
bash tools/voice/build.sh
bash tools/voice/download-model.sh
```

The first press asks macOS for Microphone permission for `Vizhi Voice Helper`. Normal physical Voice focuses the selected Terminal.app session and sends the transcript directly, without requiring the router. Screenshot-plus-Voice uses the router, which is already required for Screenshot capture. Browser Voice does not use Whisper; it uses your browser's microphone permission instead. `whisper-cli` must be installed first, for example with `brew install whisper-cpp`.

The implementation currently covers the Grid, normalized state, Codex event mapping, risk coloring, virtual-deck action files, Terminal.app focus routing, and offline voice dictation. The Claude adapter remains a follow-up milestone.
