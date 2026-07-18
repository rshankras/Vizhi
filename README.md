# Vizhi

> **Vizhi (விழி)** — Tamil for *"eye."* Vizhi watches your Codex agents so you do not have to.

Vizhi is live supervision for Codex CLI sessions through a **Logitech MX Creative Keypad** plugin and a **local browser dashboard**. Glance at every session, then approve, interrupt, redirect, or add context with a key press or spoken prompt.

**Choose your surface:** use the Logitech MX Creative Keypad for instant tactile controls and hands-free Voice, or open the browser dashboard for a full live view. Both stay in sync.

## Try the replay in 60 seconds

Node.js only; no keypad, Codex account, or macOS required:

```sh
npm install
npm run demo
```

Open the complete URL that prints in Terminal to watch a recorded supervision session play back live.

## Logitech MX Creative Keypad

For normal keypad use, install the plugin once. You do **not** need `npm`, `npm run router`, or a separate background Terminal window.

### Requirements

- Codex CLI, signed in and usable from macOS Terminal.app.
- Logi Options+, an MX Creative Keypad, and the Vizhi `.lplug4` package.
- `whisper-cli` for physical offline Voice, for example `brew install whisper-cpp`. Vizhi installs its helper automatically and asks before downloading its local Whisper model.

### 1. Install Vizhi

Install Vizhi from the Logi Marketplace when it is published. For a local build, open the `.lplug4` package with Logi Options+ or run:

```sh
logiplugintool install VizhiPlugin/bin/Vizhi_3.10.4.lplug4
```

The package includes the default six-session profile with Yes, No, Voice, commands, prompts, navigation, and Git pages. No individual actions need to be dragged onto keys.

### 2. Use Vizhi under Terminal

The default profile is registered under **Terminal**, not as a separate Vizhi application. When Terminal.app is frontmost, Logi Options+ selects the Terminal profile automatically. If you have several Terminal profiles, choose **Vizhi** under Terminal once; Logi keeps that choice and your custom profiles.

### 3. Start Codex normally

When Vizhi first loads, it installs a small bundled local hook into `~/.codex/config.toml` and creates a one-time backup at `~/.codex/config.toml.vizhi.bak`. Restart any already-running Codex session. At Codex's one-time hook-trust prompt, review the hooks and choose **Trust all and continue** to enable the live Grid.

Start or resume Codex normally in Terminal.app. New sessions appear on the earliest free session key as soon as Codex starts; Logi Plugin Service handles keypad actions automatically.

## Browser dashboard (optional)

The dashboard is a complete local alternative to the keypad, or a companion view when you use both. It requires a current Node.js LTS release.

```sh
npm install
npm start
```

Open the complete URL printed by `npm start`. Keep the `token=...` portion intact: it authorizes that browser tab to access the local dashboard. See the [browser dashboard guide](docs/browser-dashboard.md) for browser-only development and detailed controls.

## Permissions

Vizhi never needs an administrator password, Full Disk Access, Input Monitoring, or a cloud account. Two safeguards cannot and should not be automated: Codex asks you to trust Vizhi's local hooks, and macOS asks for access only when a feature needs it.

- **Codex hook trust** is required for live session cards.
- **Accessibility, Terminal Automation, and System Events** let the keypad focus the correct tab and send actions such as Yes, No, Esc, Voice text, and menu navigation.
- **Microphone** is needed for Voice.
- **Screen Recording** is needed only for Screenshot.

Follow the [full permission walkthrough with screenshots](docs/permissions.md) when macOS or Codex prompts you.

## What Vizhi gives you

- A six-session LCD grid that shows project name, context percentage, Working/Ready state, and attention status.
- TTY-verified Yes and No responses that are delivered to the session requesting approval.
- Voice as a core hands-free way to send prompts and context without reaching for the keyboard.
- Screenshot-plus-Voice context, prompt templates, Git workflows, session navigation, and live model, mode, reasoning, and usage controls.
- A local Session Library in the browser to resume, archive, and restore sessions without reading conversation messages.

## Documentation

| Guide | Use it for |
| --- | --- |
| [MX Creative Keypad reference](docs/keypad-reference.md) | Default profile, six-session grid, every action, Voice, and custom prompts. |
| [Browser dashboard](docs/browser-dashboard.md) | Browser controls, Voice, Screenshot, Session Library, and browser-only setup. |
| [Permissions](docs/permissions.md) | Codex hook trust and every macOS prompt, with screenshots. |
| [Local architecture and privacy](docs/architecture.md) | Shared action pipeline, TTY verification, local IPC, and data boundaries. |
| [Development and packaging](docs/development.md) | Tests, plugin builds, development installs, and release packaging. |

## Built with Codex + GPT-5.6

Vizhi was built for OpenAI Build Week through iterative Codex sessions. During the final implementation, the live session grid used to supervise terminal work also served as the project's own development control surface.

Key design decisions developed with Codex:

- **One local action pipeline.** The browser and keypad create the same normalized action records, so both surfaces deliver commands through one router instead of drifting into separate implementations.
- **Safe file-queue delivery.** Actions are claimed by moving them into `actions/done/`; malformed records are quarantined and completed records expire. This prevents duplicate delivery and one bad action from blocking later input.
- **TTY-verified approvals.** Before Vizhi sends an approval response, it verifies the target Terminal tab by TTY. That keeps an approval tied to the Codex session that requested it, even when sessions move between slots.
- **Live Codex controls, not hardcoded choices.** Model, reasoning, mode, and approval controls open Codex's own current pickers rather than encoding an outdated list in the plugin.

Early architecture and implementation iterations used GPT-5.6 Terra High. Later, GPT-5.6 Terra Max was used for the harder integration and safety reviews, especially around approval delivery, the local dashboard token model, and the shared action path. Routine UI, documentation, and parity work used lighter-weight iterative sessions. The primary Codex session ID is submitted through Devpost's `/feedback` flow.

## Related approaches

Several projects are exploring ambient supervision for coding agents. Vizhi focuses on the Codex CLI workflow in Terminal.app and keeps the hardware optional.

| Project | Integration surface | Supervision surface | How it differs from Vizhi |
| --- | --- | --- | --- |
| [Codex Micro](https://openai.com/supply/co-lab/work-louder/) | ChatGPT Codex and Work Louder Input | Custom 13-switch controller with real-time RGB agent state | Vizhi targets Codex CLI hooks in Terminal.app and works either on an existing Logitech keypad or in a browser. |
| [AgentDeck](https://github.com/puritysb/AgentDeck) | Multi-agent bridge with hook- and PTY-based state | Stream Deck, mobile, display, and terminal surfaces | Vizhi is deliberately narrower: a focused Codex CLI workflow with a six-session LCD grid, TTY-verified approvals, and a browser fallback. |
| [agent-deck](https://github.com/asheshgoplani/agent-deck) | Multiple terminal-based coding agents | Terminal TUI | Vizhi moves the status and response loop off the terminal while preserving Terminal.app as the execution surface. |
| **Vizhi** | Codex CLI lifecycle hooks in Terminal.app | Logitech MX Creative Keypad or local browser dashboard | Project name, state, context percentage, risk-aware approvals, offline Voice, screenshot-plus-Voice context, and a local Session Library. |

The common thread is that agent supervision matters. Vizhi's contribution is a lightweight physical-or-browser control loop for the Codex CLI environment people already use.

## Lineage

Vizhi is informed by [Claude Console](https://github.com/rshankras/claude-console), an earlier Logitech MX Creative Keypad controller for Claude Code. This Build Week project adds a Codex CLI adapter built on lifecycle hooks, a shared local action and state layer for keypad and browser controls, a multi-session risk-aware grid, a browser dashboard and Session Library, screenshot-plus-Voice staged prompts, and a replayable demo. A Claude adapter on the new core remains a follow-up milestone.

## Troubleshooting

- **The browser says `unauthorized`:** stop `npm start`, run it again, and open the newly printed full URL. Each start creates a new local token.
- **A new Codex session does not appear:** confirm the Vizhi profile is active under Terminal, restart Codex after the trust prompt, and start Codex in Terminal.app.
- **A key press does nothing:** check the [Accessibility and Automation permissions](docs/permissions.md), then quit and reopen Logi Options+.
- **Vizhi does not appear in Logi Options+:** reinstall the `.lplug4` package, then quit and reopen Logi Options+.

## Development

Run the TypeScript test suite with `npm test`. See [development and packaging](docs/development.md) for build, development-plugin, and release instructions.
