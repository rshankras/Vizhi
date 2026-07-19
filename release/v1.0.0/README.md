# Vizhi 1.0.0

The first public release of Vizhi: local mission control for Codex CLI sessions through the Logitech MX Creative Keypad and a companion browser dashboard.

## Install

1. Install Logi Options+ and connect an MX Creative Keypad.
2. Install `Vizhi_1.0.0.lplug4` with Logi Options+ or run:

   ```sh
   logiplugintool install Vizhi_1.0.0.lplug4
   ```

3. Open Terminal.app, start Codex, and approve Vizhi's one-time local hook trust prompt.
4. On the first Voice press, allow the requested local microphone setup if you want hands-free input.

See the [main README](../../README.md) for requirements, permissions, browser usage, and uninstall guidance.

## Verify the download

From this directory, run:

```sh
shasum -a 256 -c SHA256SUMS.txt
```

## Highlights

- Six live Codex session keys with project, context, and state at a glance.
- TTY-verified Yes and No approvals, plus Esc, Compact, Model, Agent, Fork, and Exit controls.
- Local offline Voice prompts, Screenshot-plus-Voice context, prompt templates, Git actions, and a browser dashboard.
- Local-only session state and a short-lived action queue; no cloud relay.
