# Vizhi 1.1.1

Vizhi 1.1.1 restores live session focus after the plugin reloads and improves the approval controls.

## Install

1. Quit Logi Options+ if it is running.
2. Install `Vizhi_1.1.1.lplug4` with Logi Options+ or run:

   ```sh
   logiplugintool install Vizhi_1.1.1.lplug4
   ```

3. Reopen Logi Options+ and use the Vizhi profile under Terminal.app.

If you previously imported or customized a Vizhi profile, export it first and restore the packaged default profile. Static custom images on the six Session keys, Yes, No, or Voice prevent their live visual state from updating.

## Highlights

- Restores the selected session marker from Vizhi's local registry after the plugin reloads.
- Shows an amber badge on Yes and No for a pending request, or red for a high-risk permission.
- Keeps the packaged default profile free of static overrides for the live session, approval, and Voice keys.
