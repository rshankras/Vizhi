import type { RiskLevel, Session } from "./types.js";

const HIGH_PATTERNS = [
  "git push",
  "rm ",
  "sudo ",
  "curl ",
  "publish",
  "deploy",
  "force",
  "reset --hard",
  "drop ",
  "delete from",
];
const LOW_TOOLS = new Set(["read", "grep", "ls", "glob"]);

export function classifyRisk(session: Session): RiskLevel {
  if (session.state !== "waiting" || session.waiting_kind !== "permission") {
    return "none";
  }

  const command = `${session.pending_tool ?? ""} ${session.pending_command ?? ""}`.toLowerCase();
  if (HIGH_PATTERNS.some((pattern) => command.includes(pattern))) {
    return "high";
  }

  return LOW_TOOLS.has((session.pending_tool ?? "").toLowerCase()) ? "low" : "none";
}
