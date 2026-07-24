import assert from "node:assert/strict";
import test from "node:test";
import {
  approvalRequiresConfirmation,
  CONVERSATION_POLICY,
  parseVoiceIntent,
  SESSION_NUMBER_WORDS,
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

test("confirm phrase in policy is a listed confirm_approve phrase", () => {
  assert.ok(VOICE_INTENTS.confirm_approve.includes(CONVERSATION_POLICY.confirmPhrase));
  assert.equal(CONVERSATION_POLICY.maxEmptyTurns > 0, true);
  assert.equal(CONVERSATION_POLICY.silenceSeconds > 0, true);
  assert.equal(CONVERSATION_POLICY.turnMaxSeconds > 0, true);
  assert.equal(CONVERSATION_POLICY.idleTimeoutMinutes > 0, true);
});
