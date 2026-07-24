# MX Creative Keypad reference

[← Back to the README](../README.md)

## Default profile

The packaged Vizhi profile provides five ready-to-use pages in this order: Sessions, Navigate, Prompts, Commands, and Git. The first page contains the six Session capacity keys, left to right and top to bottom, plus fixed `Yes`, `No`, and `Voice` controls on the bottom row. You can customize a copy in Logi Options+ without changing the packaged default.

Fixed controls on Navigate, Prompts, Commands, and Git use opaque black icon templates so their labels and artwork match the Sessions page. Logitech's native `Show Actions Ring` keeps its own face.

The Session keys are capacity keys, not permanently assigned terminals. The first active Codex session uses Session 1, the next uses Session 2, and remaining sessions move forward when one exits. A black key means no session is available. Each occupied key shows the project name and context percentage:

- **Teal** means Ready.
- **Purple** means Working.
- **Amber or red** means attention is needed.
- A small blue marker identifies the session that will receive `Yes`, `No`, and `Voice`.

The six Session keys plus fixed `Yes`, `No`, and `Voice` controls form the primary dashboard. Put less frequent actions on another Logi Options+ page or profile so that layout remains familiar.

## Control pages

- **Vizhi Commands:** `Esc` interrupts the selected session, `Compact` sends `/compact`, `New` sends `/new`, `Exit` sends Codex's `/exit` without deleting the saved session, `Fork` starts `codex fork` in a new Terminal tab, `Model` opens Codex's live model and reasoning picker, `Mode` opens Codex's live mode and approval picker, and `Agent` opens Codex's `/agent` picker. `Favorite` runs the selected prompt template. `Show Actions Ring` opens Logitech's contextual action ring. Vizhi does not hardcode model, reasoning, or approval-mode choices.
- **Default Commands page:** its nine positions are Compact, Esc, Model, New, Favorite, Agent, Fork, Exit, and Show Actions Ring. `Mode` and `Usage` are still available from the Vizhi action groups in Logi Options+ if you want to replace a default key.
- **Vizhi Terminal:** `New Tab` and `New Window` open plain Terminal shells in the selected session's project directory, or in your home directory when no session is selected. They do not start Codex automatically.
- **Vizhi Navigate:** `Tab`, `Up`, `Down`, `Enter`, `Page Up`, and `Page Down` send matching keys to the selected Terminal.app session. Use `Up`, `Down`, and `Enter` for Codex Model and Mode pickers. `Tab` cannot accept Codex's gray placeholder text because it is not an inline suggestion.
- **Vizhi Context:** `Clipboard` pastes the current macOS text clipboard into the selected session. `Screenshot` opens the macOS area selector, saves a PNG under `/tmp/vizhi/captures/`, and stages its path in the prompt. Its key changes to `Draft`; add Voice context to send both together, or type context and press `Enter`.
- **Vizhi Status:** `Usage` displays the selected session's context percentage and current cost when available; otherwise it shows model and reasoning. Pressing it focuses that session.
- **Vizhi Prompts:** `Fix Bug`, `Write Tests`, `Explain`, `Refactor`, `Review`, `Security`, `Plan`, `Handoff`, and `Safe Revert` send focused coding prompts. `Plan` explores and waits before editing, `Handoff` summarizes work for a new session, and `Safe Revert` explains risk before waiting for explicit confirmation.
- **Vizhi Git:** `Commit`, `Diff`, `Push`, `Create PR`, `Status`, and `Git Log` send Git workflows to the selected session. Push and Create PR still use Codex's normal approval flow and never force-push.

## Voice

Voice is Vizhi's hands-free way to send prompts and context without reaching for the keyboard. The supplied profile already includes the `Voice` control; you can also assign the `Voice` action from the `Vizhi Operate` group to another key.

Press once to record, speak, then press it again to transcribe. The key changes to an animated green Listening face while it records. Vizhi sends the transcript immediately. When the selected session has a staged Screenshot draft, it sends the screenshot path and spoken context together.

Physical Voice transcribes locally through `whisper-cli`. Install it once, for example with `brew install whisper-cpp`. On the first Voice press, Vizhi installs its helper into your private local runtime and, when needed, asks before downloading its one-time local Whisper model (about 142 MB). macOS then asks for Microphone permission for `Vizhi Voice Helper`. Temporary audio and transcript files are cleared after transcription.

Browser Voice uses the browser's microphone and speech-recognition support instead; see the [browser dashboard guide](browser-dashboard.md). For the related prompts, see the [permissions guide](permissions.md).

## Voice conversation

Hold the `Voice` key for about a second (or double-tap its surface) to start a spoken conversation; hold it again to end one. A short tap keeps its normal one-shot recording behavior outside a conversation. Everything stays local: listening uses the same Whisper helper, and speech uses macOS's built-in voice.

While a conversation is on, Vizhi speaks for the sessions on your grid:

- When a session asks for approval, Vizhi reads the question aloud, then listens. Say `yes` to approve or `no` to deny. For a high-risk command such as `git push`, Vizhi reads the exact command back and only accepts `confirm approve`; a bare `yes` is refused aloud.
- When a Working session becomes Ready, Vizhi speaks a short summary of Codex's answer — markdown and code stripped, cut at a sentence near 240 characters, ending with "More on screen" when there is more. Plain "Finished." is only said when no readable text came back, and the project name is prefixed only when several sessions are running. Say `read more` (or `what did it say`) for a longer passage; answers that are mostly code are announced as on-screen instead of read aloud. Ended sessions are announced too, and when the last session ends the conversation ends itself.
- Say `status` for a spoken digest of every session, `switch to session two` to move focus, `take a screenshot` to stage a capture, or anything else to send it to the focused session as a prompt — including a staged Screenshot draft, exactly like one-shot Voice. A sent prompt is confirmed with a soft click; Vizhi only says "Sent to …" when more than one session is running, and completion announcements likewise name the project only then.
- Tap the key whenever you want to talk: while Vizhi is monitoring, a tap opens the microphone for any command or prompt; while Vizhi is speaking, a tap interrupts the speech and listens; while the microphone is open, a tap closes it. Say `mute` to keep the microphone closed after announcements — announcements continue, and a tap opens the microphone again. Say `end conversation` or `goodbye` to finish.

The key face follows the conversation: a teal Converse face while monitoring, the green Listening wave while the microphone is open, a Thinking spinner during transcription, a green Speaking face during announcements, and a red-slashed Muted face when the microphone is off. Listening stops on its own after about 1.5 seconds of silence, recording is capped at 60 seconds per turn, and a conversation left idle for 10 minutes ends itself with a notification. The microphone is only open while the Listening face shows.

Spoken approvals travel the same verified path as the `Yes` and `No` keys — Vizhi never answers a prompt without confirming the Terminal tab by TTY first, and it only speaks text that Codex hooks already provide (questions, pending commands, states, and project names), never conversation content.

## Custom prompt templates

Every prompt and Git workflow works immediately and can be customized independently. For example, replace the `Fix Bug` workflow:

```sh
npm run prompt:set -- --id fix_bug --label Repair --prompt "Investigate the reported bug, implement the smallest safe fix, and add regression coverage."
```

Available IDs are `fix_bug`, `write_tests`, `explain`, `refactor`, `review`, `security`, `plan`, `handoff`, `safe_revert`, `commit`, `diff`, `push`, `create_pr`, `status`, and `log`. Omitting `--id` preserves the older shorthand and edits `review`.

Set the physical and browser Favorite action with:

```sh
npm run prompt:favorite -- --id plan
```

Configurations are stored at `~/.vizhi/prompt-templates.json`; an existing `~/.vizhi/prompt-template.json` Review override continues to work. The selected session receives the full prompt while the key shows its short label. Reload the plugin if a changed label is not immediately visible.

## How actions are delivered

Logi Plugin Service starts Vizhi's embedded action service with the plugin. It watches for newly started Codex sessions, finds the matching Terminal.app tab, brings it forward, and delivers keypad or dashboard actions. When `exit` ends Codex, it releases that Session key even if the Terminal tab remains open.

Use Vizhi's `Esc` key when you need the state to update immediately. Keyboard Escape bypasses Vizhi, so a stopped task can take up to 45 seconds to change from Working to Ready. See the [architecture guide](architecture.md) for action-queue, TTY-verification, and privacy details.
