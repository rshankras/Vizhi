import type { RiskLevel } from "./types.js";

export const VOICE_INTENT_IDS = [
  "approve",
  "deny",
  "confirm_approve",
  "status",
  "read_more",
  "focus_session",
  "screenshot",
  "mute",
  "end_conversation",
] as const;

export type VoiceIntentId = (typeof VOICE_INTENT_IDS)[number];

export const VOICE_INTENTS: Record<VoiceIntentId, readonly string[]> = {
  approve: ["yes", "yeah", "yep", "approve", "approved", "go ahead", "do it"],
  deny: ["no", "nope", "deny", "denied", "don't", "stop that"],
  confirm_approve: ["confirm approve", "confirm"],
  status: ["status", "status report", "what's happening", "what needs me"],
  read_more: ["read more", "read it", "read the answer", "what did it say", "tell me more"],
  focus_session: ["switch to session", "focus session", "go to session", "session"],
  screenshot: ["take a screenshot", "screenshot"],
  mute: ["mute"],
  end_conversation: ["end conversation", "stop listening", "goodbye"],
};

export const SESSION_NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

export const CONVERSATION_POLICY = {
  confirmPhrase: "confirm approve",
  maxEmptyTurns: 2,
  silenceSeconds: 1.5,
  turnMaxSeconds: 60,
  idleTimeoutMinutes: 10,
} as const;

export type VoiceIntent =
  | { intent: Exclude<VoiceIntentId, "focus_session"> }
  | { intent: "focus_session"; slot: number }
  | { intent: "prompt"; text: string };

export function normalizeUtterance(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSessionNumber(value: string): number | null {
  const fromWord = SESSION_NUMBER_WORDS[value];
  if (fromWord) return fromWord;
  if (!/^[1-6]$/.test(value)) return null;
  return Number(value);
}

export function parseVoiceIntent(text: string): VoiceIntent {
  const utterance = normalizeUtterance(text);
  if (!utterance) return { intent: "prompt", text: "" };

  for (const id of VOICE_INTENT_IDS) {
    if (id === "focus_session") continue;
    if (VOICE_INTENTS[id].some((phrase) => normalizeUtterance(phrase) === utterance)) {
      return { intent: id };
    }
  }

  for (const prefix of VOICE_INTENTS.focus_session) {
    const normalizedPrefix = normalizeUtterance(prefix);
    if (!utterance.startsWith(`${normalizedPrefix} `)) continue;
    const slot = parseSessionNumber(utterance.slice(normalizedPrefix.length + 1));
    if (slot !== null) return { intent: "focus_session", slot };
  }

  return { intent: "prompt", text: text.trim() };
}

export function approvalRequiresConfirmation(intent: "approve" | "confirm_approve", risk: RiskLevel): boolean {
  return intent === "approve" && risk === "high";
}

export function summarizeForSpeech(text: string, maxChars: number): string {
  if (!text) return "";
  const endSentence = (value: string) => (/[.!?…]$/.test(value) ? value : `${value}.`);
  const hadCode = text.includes("```");
  const cleaned = text
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "a link")
    .replace(/^[\s#>|*+-]+/gm, " ")
    .replace(/[*_~#|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return hadCode ? "The answer is code; it's on screen." : "";
  const sentences = cleaned.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [cleaned];
  let summary = "";
  for (const sentence of sentences) {
    const candidate = summary ? `${summary} ${sentence.trim()}` : sentence.trim();
    if (summary && candidate.length > maxChars) break;
    summary = candidate;
    if (summary.length > maxChars) break;
  }
  if (summary.length > maxChars) {
    const slice = summary.slice(0, maxChars);
    const wordEnd = slice.lastIndexOf(" ");
    summary = `${slice.slice(0, wordEnd > 0 ? wordEnd : maxChars).trimEnd()}…`;
  }
  if (summary.length < cleaned.length) return `${endSentence(summary)} There's more on screen.`;
  return hadCode ? `${endSentence(summary)} Code is on screen.` : summary;
}
