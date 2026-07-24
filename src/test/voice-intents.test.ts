import assert from "node:assert/strict";
import test from "node:test";
import {
  approvalRequiresConfirmation,
  CONVERSATION_POLICY,
  parseVoiceIntent,
  SESSION_NUMBER_WORDS,
  summarizeForSpeech,
  VOICE_INTENT_IDS,
  VOICE_INTENTS,
} from "../voice-intents.js";

test("every listed phrase parses to its own intent", () => {
  for (const id of VOICE_INTENT_IDS) {
    if (id === "focus_session") continue;
    for (const phrase of VOICE_INTENTS[id]) {
      assert.deepEqual(parseVoiceIntent(phrase), { intent: id }, `phrase '${phrase}'`);
    }
  }
});

test("matching ignores case, punctuation, and apostrophes", () => {
  assert.deepEqual(parseVoiceIntent("Yes."), { intent: "approve" });
  assert.deepEqual(parseVoiceIntent("  YES!  "), { intent: "approve" });
  assert.deepEqual(parseVoiceIntent("Don't"), { intent: "deny" });
  assert.deepEqual(parseVoiceIntent("What's happening?"), { intent: "status" });
  assert.deepEqual(parseVoiceIntent("End conversation."), { intent: "end_conversation" });
});

test("focus phrases resolve session numbers as words and digits", () => {
  assert.deepEqual(parseVoiceIntent("switch to session two"), { intent: "focus_session", slot: 2 });
  assert.deepEqual(parseVoiceIntent("Session 3."), { intent: "focus_session", slot: 3 });
  assert.deepEqual(parseVoiceIntent("go to session six"), { intent: "focus_session", slot: 6 });
  assert.deepEqual(parseVoiceIntent("focus session 1"), { intent: "focus_session", slot: 1 });
  for (const [word, slot] of Object.entries(SESSION_NUMBER_WORDS)) {
    assert.deepEqual(parseVoiceIntent(`session ${word}`), { intent: "focus_session", slot });
  }
});

test("focus phrases without a valid session number fall through to prompt", () => {
  assert.deepEqual(parseVoiceIntent("switch to session"), { intent: "prompt", text: "switch to session" });
  assert.deepEqual(parseVoiceIntent("session seven"), { intent: "prompt", text: "session seven" });
  assert.deepEqual(parseVoiceIntent("session 9"), { intent: "prompt", text: "session 9" });
});

test("utterances that merely contain a command phrase stay prompts", () => {
  assert.deepEqual(parseVoiceIntent("yes but first run the tests"), {
    intent: "prompt",
    text: "yes but first run the tests",
  });
  assert.deepEqual(parseVoiceIntent("no need to change the readme"), {
    intent: "prompt",
    text: "no need to change the readme",
  });
  assert.deepEqual(parseVoiceIntent("add a mute button to the settings screen"), {
    intent: "prompt",
    text: "add a mute button to the settings screen",
  });
});

test("empty and whitespace transcripts parse to an empty prompt", () => {
  assert.deepEqual(parseVoiceIntent(""), { intent: "prompt", text: "" });
  assert.deepEqual(parseVoiceIntent("   "), { intent: "prompt", text: "" });
  assert.deepEqual(parseVoiceIntent("?!"), { intent: "prompt", text: "" });
});

test("bare approval needs confirmation only for high-risk sessions", () => {
  assert.equal(approvalRequiresConfirmation("approve", "high"), true);
  assert.equal(approvalRequiresConfirmation("approve", "low"), false);
  assert.equal(approvalRequiresConfirmation("approve", "none"), false);
  assert.equal(approvalRequiresConfirmation("confirm_approve", "high"), false);
  assert.equal(approvalRequiresConfirmation("confirm_approve", "none"), false);
});

test("spoken summaries stay short and skip code", () => {
  assert.equal(summarizeForSpeech("", 240), "");
  assert.equal(summarizeForSpeech("Your working tree is clean.", 240), "Your working tree is clean.");
  assert.equal(
    summarizeForSpeech("Done. Run `npm test` to verify.", 240),
    "Done. Run npm test to verify.",
  );
  assert.equal(
    summarizeForSpeech("```diff\n- old\n+ new\n```", 240),
    "The answer is code; it's on screen.",
  );
  assert.equal(
    summarizeForSpeech("I fixed the bug.\n\n```js\nconst x = 1;\n```", 240),
    "I fixed the bug. Code is on screen.",
  );
  const long = summarizeForSpeech(`${"The build passed. ".repeat(40)}`, 240);
  assert.ok(long.length <= 260, `too long: ${long.length}`);
  assert.ok(long.endsWith("More on screen."));
  assert.equal(
    summarizeForSpeech("See [the docs](https://example.test/a) for details.", 240),
    "See the docs for details.",
  );
});

test("read_more phrases parse and prompts about reading stay prompts", () => {
  assert.deepEqual(parseVoiceIntent("Read more."), { intent: "read_more" });
  assert.deepEqual(parseVoiceIntent("what did it say"), { intent: "read_more" });
  assert.deepEqual(parseVoiceIntent("read the readme and summarize it"), {
    intent: "prompt",
    text: "read the readme and summarize it",
  });
});

test("confirm phrase in policy is a listed confirm_approve phrase", () => {
  assert.ok(VOICE_INTENTS.confirm_approve.includes(CONVERSATION_POLICY.confirmPhrase));
  assert.equal(CONVERSATION_POLICY.maxEmptyTurns > 0, true);
  assert.equal(CONVERSATION_POLICY.silenceSeconds > 0, true);
  assert.equal(CONVERSATION_POLICY.turnMaxSeconds > 0, true);
  assert.equal(CONVERSATION_POLICY.idleTimeoutMinutes > 0, true);
});
