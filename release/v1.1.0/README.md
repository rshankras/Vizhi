# Vizhi 1.1.0

Vizhi 1.1.0 makes the packaged MX Creative Keypad profile more consistent and safer to distribute.

## Install

1. Remove an earlier Vizhi plugin from Logi Options+ if it is installed.
2. Install `Vizhi_1.1.0.lplug4` with Logi Options+ or run:

   ```sh
   logiplugintool install Vizhi_1.1.0.lplug4
   ```

3. Open Terminal.app, start Codex, and approve Vizhi's one-time local hook trust prompt.
4. On the first Voice press, allow the requested local microphone setup if you want hands-free input.

The profile is linked to Terminal.app. New installations receive the default layout automatically. Existing customized Vizhi profiles are preserved; reset or reapply the default profile in Logi Options+ to adopt the new black key templates.

See the [main README](../../README.md) for requirements, permissions, browser usage, and uninstall guidance.

## Verify the download

From this directory, run:

```sh
shasum -a 256 -c SHA256SUMS.txt
```

## Highlights

- Opaque black action templates across Navigate, Prompts, Commands, and Git pages for a consistent keypad face.
- Default Vizhi profile explicitly activates under Terminal.app while retaining its Vizhi eye icon.
- Pure-black generated icon canvases and runtime key faces.
- Packaging excludes local exported `.lp5` profiles, so personal layouts and live session labels are never distributed.
