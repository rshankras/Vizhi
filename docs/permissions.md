# Permissions

[← Back to the README](../README.md)

Vizhi does not need an administrator password, Full Disk Access, Input Monitoring, or access to a cloud account. The live Grid needs Codex hook trust. macOS asks for further access only when you use a feature that controls Terminal, sends keys, records Voice, or captures a screenshot.

## At a glance

- **Codex hook trust — required for live session cards.** The installed plugin adds a marked Vizhi hook block locally. At the Codex prompt, review the hooks and choose **Trust all and continue**. The six lifecycle events call one local Vizhi hook that writes session state and never bypasses Codex approvals.
- **Accessibility for Logi Plugin Service — needed for keypad actions.** This lets Vizhi bring the correct Terminal tab forward and send keys such as Yes, No, Esc, or a prompt. In **System Settings → Privacy & Security → Accessibility**, enable **LogiPluginService** if macOS asks. Vizhi does not require the separate **Logi Options+** or **Terminal** entries to be enabled.
- **Automation for Terminal — needed when macOS asks.** Allow **Logi Plugin Service** to control Terminal.app so Vizhi can select the matching tab.
- **Automation for System Events — needed when macOS asks.** Allow **Logi Plugin Service** to control System Events so Vizhi can send real keys to Codex, including Yes, No, Voice text, Esc, and menu navigation.
- **Microphone — needed for Voice.** Browser Voice asks your browser for microphone access and may use an external browser speech-recognition service. After physical Voice finishes its one-time setup, `Vizhi Voice Helper` asks for access and transcribes locally with Whisper.
- **Screen Recording — needed for Screenshot.** Allow it only when macOS asks after you use Vizhi's Screenshot action through Logi Plugin Service.

The `Clipboard` action sends your current clipboard text to the selected Codex session. The `Screenshot` action keeps a local image for up to 15 minutes so Codex can inspect it after you send the prompt.

## First-use walkthrough

Two approvals cannot and should not be automated: Codex asks you to trust Vizhi's local hooks, and macOS may ask Logi Plugin Service for Accessibility or Terminal Automation access. Only approve access after confirming Vizhi is installed. macOS adds app entries automatically, so do not add anything manually.

### 1. Trust the six local Vizhi Codex hooks

This is a Codex safety review, not a macOS permission. Codex shows six lifecycle events because Vizhi needs reliable live state: session start, submitted prompts, tool activity, approval requests, completed tools, and the end of a turn. They all call the same bundled local Vizhi hook; it writes local session-state files and never approves actions on your behalf.

Choose **Review hooks** to inspect the list, then choose **Trust all and continue** when you are satisfied. Choosing **Continue without trusting** leaves Codex usable, but Vizhi cannot reliably show new sessions, Working/Ready state, or approval requests.

<img src="images/permissions/codex-hooks-trust.png" alt="Codex asks whether to review and trust the six Vizhi hooks" width="760">

<img src="images/permissions/codex-hooks-review.png" alt="Codex review showing the six installed Vizhi hook events" width="900">

### 2. Allow LogiPluginService accessibility

macOS first explains why LogiPluginService needs Accessibility. Choose **Open System Settings**, then enable **LogiPluginService** in the Accessibility list. This is required for keypad actions that send keys to Codex.

<img src="images/permissions/accessibility-request.png" alt="macOS asks to grant LogiPluginService Accessibility access" width="520">

<img src="images/permissions/accessibility-list.png" alt="macOS Accessibility list with LogiPluginService enabled" width="520">

The list may also show **Logi Options+** and **Terminal**. Those switches are not required by Vizhi itself.

### 3. Allow Terminal and System Events automation

Allow Terminal control so Vizhi can select the correct Codex tab, then allow System Events so it can send keystrokes such as Yes, No, Voice text, Esc, and navigation.

<img src="images/permissions/terminal-automation.png" alt="macOS asks to allow LogiPluginService to control Terminal" width="420">

<img src="images/permissions/system-events-automation.png" alt="macOS asks to allow LogiPluginService to control System Events" width="420">

### 4. Set up local Voice

The first physical Voice press asks before downloading the one-time local Whisper model. It then asks for Microphone permission for the separate `VizhiVoiceHelper` app. The audio remains local to the Mac for transcription.

<img src="images/permissions/voice-model-download.png" alt="Vizhi asks before downloading the local Whisper model" width="520">

<img src="images/permissions/voice-microphone.png" alt="VizhiVoiceHelper asks for microphone access" width="420">

Screen Recording is not shown above because macOS requests it only when you tap Screenshot.

## Removing Vizhi

Uninstall Vizhi itself in Logi Options+, then run `npm run plugin:cleanup` from the Vizhi source checkout. It removes the marked Codex hook block, local hook files, offline Voice helper/model, temporary runtime state, and the separate `Vizhi Voice Helper` microphone authorization. Add `-- --purge` only if you also want to remove saved prompt templates.

Accessibility, Terminal Automation, System Events Automation, and Screen & System Audio Recording are attributed to **LogiPluginService**, which is Logi's shared host service rather than the Vizhi package. Vizhi must not revoke them automatically because doing so could break other Logitech plugins.

If you no longer use any Logi actions that need those permissions, remove them manually in **System Settings → Privacy & Security**:

- In **Accessibility**, turn off **LogiPluginService**.
- In **Automation**, turn off its access to **Terminal** and **System Events**.
- In **Screen & System Audio Recording**, turn off **LogiPluginService** if it appears.

Do not run broad `tccutil reset All`, `tccutil reset Accessibility`, or `tccutil reset AppleEvents` commands: they can reset unrelated applications' permissions too.
