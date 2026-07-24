# Local architecture and privacy

[← Back to the README](../README.md)

Vizhi uses a local state and action pipeline shared by the MX Creative Keypad and browser dashboard. Codex hooks report session state; either control surface writes normalized actions; Logi Plugin Service or the browser-only router delivers them to the right Terminal.app tab.

## Local IPC

- Session state: `/tmp/vizhi/sessions/<session-id>.json`
- Slot registry: `/tmp/vizhi/registry.json`
- Browser actions: `/tmp/vizhi/actions/<uuid>.json`
- Captures: `/tmp/vizhi/captures/<timestamp>.png`

Use `--ipc-root <path>` with any command to isolate local runs and tests.

## Safe action delivery

The embedded action service claims each action by moving it into `/tmp/vizhi/actions/done/` before execution. It removes completed and quarantined action records after one hour, and quarantines malformed records in `/tmp/vizhi/actions/failed/` so one bad action cannot block later input.

Before it delivers an approval response, Vizhi verifies the selected Terminal tab by TTY. This keeps Yes and No responses tied to the Codex session that requested them, even when sessions move between grid slots.

## Local-only boundaries

Vizhi creates IPC directories and new state/action files with owner-only permissions. The browser binds only to `127.0.0.1` and generates a fresh local token every time it starts, so its API and event stream require the full local dashboard URL.

Vizhi does not send session state, screenshots, or clipboard contents to a Vizhi cloud service. Screenshot captures remain local for up to 15 minutes. Physical Voice transcribes locally through Whisper. Browser Voice uses the browser's own speech-recognition support, which may process audio outside the Mac; Vizhi shows an explicit confirmation before starting it. Browser Quick Action preferences remain in local browser storage and do not change the MX Creative Keypad profile.

Voice conversation keeps the same boundaries. Keypad conversations listen through the local Whisper helper and speak through macOS's built-in `say` voice; browser conversations use the browser's speech services behind the same disclosure. Vizhi only speaks text the Codex hooks already provide — approval questions, pending tool and command names, session states, and project names — and never reads conversation content. Spoken approvals, focus changes, screenshots, and prompts are written as the same normalized action records as key presses, so the waiting-state gate and TTY verification always apply, and a high-risk approval additionally requires the spoken `confirm approve` phrase. Conversation mode is a per-surface interaction state; it adds no new IPC files and no shared state.

See the [permissions guide](permissions.md) for the macOS and Codex access prompts, and the [keypad reference](keypad-reference.md) for the user-facing control flow.
