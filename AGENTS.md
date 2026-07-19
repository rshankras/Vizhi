# Vizhi agent guide

## Product and scope

- Vizhi is keypad-first mission control for Codex CLI sessions in macOS Terminal.app.
- The Logitech MX Creative Keypad is the primary surface; the browser dashboard is an optional, behaviorally equivalent companion.
- Normal plugin users install the `.lplug4` package once. Do not require them to run `npm run router` or maintain a background Terminal process.

## Architecture

- `src/` is the TypeScript local state, hooks, browser, and action-routing service.
- `VizhiPlugin/src/` is the C# Logitech plugin, including physical keypad actions and its embedded action service.
- `tools/` builds the plugin, default profile, status assets, and local Voice helper.
- The browser and keypad must write compatible normalized actions and show compatible session state.
- Keep IPC local and private. Do not add cloud transport or loosen owner-only file handling without an explicit request.

## Safety rules

- Preserve TTY verification before sending Yes or No to Terminal.app.
- Never bypass Codex approval prompts or send approval responses to an unverified session.
- Preserve short screenshot retention and local physical Voice transcription.
- Treat Terminal Automation, System Events, Accessibility, Microphone, and Screen Recording as least-privilege, feature-specific permissions.

## UX rules

- Keep the six Session capacity keys primary; sessions compact into the earliest free slot when one exits.
- Keep `Yes`, `No`, and `Voice` as the fixed core controls, and make the selected target session obvious.
- Voice is a core hands-free input path, not a secondary add-on.
- Keep the default Logi profile associated with Terminal, not a separate Vizhi application profile.
- Prefer clear states and large readable key labels over dense status text or extra commands.

## Documentation

- Keep `README.md` concise and keypad-first. Put detailed guidance in `docs/`.
- Update the relevant guide when changing browser behavior, keypad controls, permissions, architecture, or packaging.
- Preserve the permission screenshots in `docs/images/permissions/` and their references in `docs/permissions.md`.
- Do not add, stage, or commit `spec.md` or `SPEC.md` unless the user explicitly asks.

## Commands

- Test TypeScript service: `npm test`
- Run local dashboard: `npm start`
- Run replay demo: `npm run demo`
- Build plugin: `npm run plugin:build`
- Build development plugin: `npm run plugin:dev`
- Package plugin: `npm run plugin:package`
- Uninstall local plugin and integration: `npm run plugin:uninstall`
- Clean local Vizhi integration after Logi Options+ uninstall: `npm run plugin:cleanup`

Plugin builds are opt-in: do not run `plugin:build`, `plugin:dev`, or `plugin:package` unless the user explicitly asks to build, package, install, or test the Logitech plugin. Routine source edits, documentation changes, and `npm test` must not create or update a `.lplug4` file.

## Working agreement

- Start cross-cutting changes with a short plan covering TypeScript, plugin, browser, and documentation impact.
- Keep changes focused; do not fix unrelated failures.
- For behavior changes, run the most targeted relevant checks. For documentation-only changes, run `git diff --check` and verify local links and image paths.
- Do not commit or push unless the user explicitly requests it.
