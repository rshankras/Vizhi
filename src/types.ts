export const SESSION_STATES = ["idle", "busy", "waiting", "dead"] as const;
export const WAITING_KINDS = ["permission", "input"] as const;
export const GRID_SLOT_COUNT = 6;

export type SessionState = (typeof SESSION_STATES)[number];
export type WaitingKind = (typeof WAITING_KINDS)[number];
export type RiskLevel = "high" | "low" | "none";
export const TERMINAL_KEYS = ["tab", "up", "down", "enter", "page_up", "page_down"] as const;
export type TerminalKey = (typeof TERMINAL_KEYS)[number];

export interface Session {
  schema: 1;
  session_id: string;
  agent: string;
  project: string;
  cwd: string | null;
  tty: string | null;
  state: SessionState;
  waiting_kind: WaitingKind | null;
  question: string | null;
  pending_tool: string | null;
  pending_command: string | null;
  last_message: string | null;
  model: string | null;
  reasoning: string | null;
  ctx_pct: number | null;
  cost_usd: number | null;
  updated_at: string;
  capabilities: string[];
}

export interface Registry {
  schema: 1;
  slots: Record<string, string>;
  focused_session: string | null;
}

export interface Action {
  id: string;
  type: "focus" | "approve" | "deny" | "voice" | "interrupt" | "compact" | "new_session" | "new_terminal" | "exit" | "model" | "mode" | "agent" | "fork" | "favorite" | "clipboard" | "screenshot" | "key" | "prompt_template" | "resume";
  slot: number;
  created_at: string;
  text?: string;
  key?: TerminalKey;
  template_id?: string;
  session_id?: string;
  cwd?: string | null;
  open_in_new_window?: boolean;
  return_to_browser?: boolean;
}

export interface SessionHistoryEntry {
  session_id: string;
  project: string;
  cwd: string | null;
  updated_at: string;
  archived: boolean;
}

export interface GridSlot {
  slot: number;
  session: Session | null;
  risk: RiskLevel;
}

export interface GridSnapshot {
  slots: GridSlot[];
  focused_session: string | null;
  invalid_files: number;
  overflow: number;
}
