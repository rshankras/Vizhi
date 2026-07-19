# Browser dashboard

[← Back to the README](../README.md)

The local browser dashboard shares the same live session state as the MX Creative Keypad. It works without a keypad, and the two surfaces stay in sync when both are used.

## Start the dashboard

When the keypad plugin is installed and loaded, use its built-in local action service:

```sh
npm install
npm start
```

Open the complete URL printed by `npm start`. Do not remove the `token=...` portion: it authorizes that browser tab to use the local dashboard.

For browser-only development without the keypad plugin, build once, install the Node hook, then keep the legacy router running:

```sh
npm install
npm run build
node dist/cli.js install-codex-hooks
npm run router
```

## Session controls

Select a session card, then use its controls for `Yes`, `No`, `Esc`, `Compact`, `New`, `Exit`, `Fork`, `New Tab`, `New Window`, Model, Mode, Agent, Tab, menu navigation, prompt templates, and Git workflows.

`Fork` starts `codex fork` in a new Terminal tab using the selected session's project directory. `New Tab` and `New Window` open plain Terminal shells in that directory. The live usage panel shows context, cost, model, and reasoning. Browser-issued commands return you to the dashboard; use `Open Terminal` only when you want to stay in the selected Codex tab.

## Quick Actions

The browser puts a **Quick Actions** row immediately below the fixed `Yes`, `No`, and `Esc` controls. Its defaults are Favorite, Compact, Write Tests, and Screenshot.

Choose **Customize** to pin up to four actions, remove them, or change their order. Dragging is available in the customization dialog, and left/right buttons provide the same ordering control for keyboard and touchpad use. **Reset to defaults** restores the initial row.

Only session-safe shortcuts are available: Favorite, Compact, Screenshot, Clipboard, Model, Mode, Agent, prompt templates, and read-only Git templates (Status, Diff, and Git Log). Approvals, `Esc`, Voice, session cards, terminal creation, navigation, and `Exit` stay fixed for reliable muscle memory.

Quick Action choices are stored in that browser's local storage. They do not leave the Mac, change the shared session state, or rearrange the MX Creative Keypad profile.

## Keypad parity

The dashboard and keypad create the same local action records for every session-affecting control: approvals, Voice text, interrupt, Codex controls, terminal navigation, context, prompt templates, and Git workflows. They therefore operate on the same focused session and update from the same live state.

`Show Actions Ring` is intentionally hardware-only: it opens Logitech's native contextual action ring, while the browser already exposes Vizhi's controls directly. The browser includes `Mode` directly; the packaged keypad profile uses its ninth Commands key for Show Actions Ring, but `Mode` remains assignable in Logi Options+.

## Prompt, Voice, and Screenshot

The prompt box sends its text to the selected Codex session. `Browser Voice` uses the browser's speech-recognition support when available and sends the completed transcript immediately. It shows a per-dashboard-session confirmation because browser speech recognition may process audio outside the Mac. Use the MX Creative Keypad's physical Voice key when local Whisper transcription is required. Typed prompts work in every supported browser.

`Clipboard` asks for confirmation before pasting plaintext into the selected session. `Screenshot` opens macOS's area selector, saves the capture under `/tmp/vizhi/captures/`, and stages its local image path in the selected Codex prompt without submitting it. Captures expire after 15 minutes. Tap Voice to add spoken context and submit both automatically, or add typed context and press `Enter`.

## Session Library

The browser-only Session Library shows recent completed and archived Codex sessions without reading conversation messages.

- `Resume` opens a saved session in a new Terminal tab.
- `Archive` requires confirmation and refuses to archive a currently live Vizhi slot.
- `Restore` returns an archived session to Codex's normal resume list.

For the local action model, token protection, and file retention details, see the [architecture guide](architecture.md).
