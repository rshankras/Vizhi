import assert from "node:assert/strict";
import test from "node:test";
import { contextPercentFromTranscript } from "../context-usage.js";

test("derives current context percentage from the most recent Codex usage event", () => {
  const transcript = [
    JSON.stringify({ type: "event_msg", payload: { info: { model_context_window: 1000, last_token_usage: { total_tokens: 120 } } } }),
    "not json",
    JSON.stringify({ type: "event_msg", payload: { info: { model_context_window: 4000, last_token_usage: { total_tokens: 1300 } } } }),
  ].join("\n");

  assert.equal(contextPercentFromTranscript(transcript), 33);
});

test("clamps malformed context telemetry and ignores records without usage", () => {
  assert.equal(contextPercentFromTranscript(""), null);
  assert.equal(contextPercentFromTranscript(JSON.stringify({ type: "event_msg", payload: { info: {} } })), null);
  assert.equal(
    contextPercentFromTranscript(JSON.stringify({ type: "event_msg", payload: { info: { model_context_window: 100, last_token_usage: { total_tokens: 180 } } } })),
    100,
  );
});
