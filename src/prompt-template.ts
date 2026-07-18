import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface PromptTemplate {
  schema: 1;
  id: PromptTemplateId;
  label: string;
  prompt: string;
}

export const PROMPT_TEMPLATE_IDS = [
  "fix_bug",
  "write_tests",
  "explain",
  "refactor",
  "review",
  "security",
  "plan",
  "handoff",
  "safe_revert",
  "commit",
  "diff",
  "push",
  "create_pr",
  "status",
  "log",
] as const;

export type PromptTemplateId = (typeof PROMPT_TEMPLATE_IDS)[number];

export interface PromptTemplateDefinition {
  id: PromptTemplateId;
  label: string;
  group: "Vizhi Prompts" | "Vizhi Git";
  icon: string;
  prompt: string;
}

export const DEFAULT_PROMPT_TEMPLATES: Readonly<Record<PromptTemplateId, PromptTemplateDefinition>> = {
  fix_bug: {
    id: "fix_bug",
    label: "Fix Bug",
    group: "Vizhi Prompts",
    icon: "fixbug",
    prompt: "Investigate the current or described bug. Identify the root cause, implement the smallest safe fix, add focused regression coverage when appropriate, and run the most relevant validation.",
  },
  write_tests: {
    id: "write_tests",
    label: "Write Tests",
    group: "Vizhi Prompts",
    icon: "tests",
    prompt: "Identify the highest-value missing test coverage for the current code or change. Add focused tests that protect the behavior, then run the relevant test command and summarize the result.",
  },
  explain: {
    id: "explain",
    label: "Explain",
    group: "Vizhi Prompts",
    icon: "explain",
    prompt: "Explain the current code, task, or recent changes clearly: describe the main flow, important decisions, risks, and the most useful next step. Keep the explanation concise and grounded in the repository.",
  },
  refactor: {
    id: "refactor",
    label: "Refactor",
    group: "Vizhi Prompts",
    icon: "refactor",
    prompt: "Identify a safe, high-value refactoring opportunity in the current code. Preserve behavior, keep the change focused, update or add tests where needed, and run the relevant validation.",
  },
  review: {
    id: "review",
    label: "Review",
    group: "Vizhi Prompts",
    icon: "review",
    prompt: "Review the current changes for correctness, regressions, security concerns, and missing tests. Summarize findings in priority order, then recommend the highest-priority next step.",
  },
  security: {
    id: "security",
    label: "Security",
    group: "Vizhi Prompts",
    icon: "security",
    prompt: "Review the relevant code and current changes for security issues, including secrets exposure, unsafe input handling, authorization gaps, dangerous commands, and data loss risks. Prioritize concrete findings with evidence and recommend fixes.",
  },
  plan: {
    id: "plan",
    label: "Plan",
    group: "Vizhi Prompts",
    icon: "plan",
    prompt: "Explore the relevant repository and task first. Propose a concise, numbered implementation plan with risks, affected files, and focused validation. Do not modify files or run destructive commands until I approve the plan.",
  },
  handoff: {
    id: "handoff",
    label: "Handoff",
    group: "Vizhi Prompts",
    icon: "handoff",
    prompt: "Create a concise handoff for another Codex session: goal, current state, files changed, important decisions, commands or tests run, blockers, and the exact next steps. Do not modify product files. Make it ready to paste into a new session.",
  },
  safe_revert: {
    id: "safe_revert",
    label: "Safe Revert",
    group: "Vizhi Prompts",
    icon: "revert",
    prompt: "Inspect git status and the current diff. Do not modify files yet. Explain exactly what would be reverted, including any staged or untracked work at risk, and wait for my explicit confirmation before using restore, reset, checkout, clean, or any other destructive command.",
  },
  commit: {
    id: "commit",
    label: "Commit",
    group: "Vizhi Git",
    icon: "commit",
    prompt: "Review the current git diff and test status. If the changes are coherent and ready, create a concise conventional commit with an accurate message; otherwise explain what must be resolved first. Report the resulting commit hash if one is created.",
  },
  diff: {
    id: "diff",
    label: "Diff",
    group: "Vizhi Git",
    icon: "diff",
    prompt: "Inspect the current git diff and summarize the behavioral changes, likely risks, and any missing pieces or validation. Keep the summary concise and actionable.",
  },
  push: {
    id: "push",
    label: "Push",
    group: "Vizhi Git",
    icon: "push",
    prompt: "Check the current branch, remote, git status, and recent commits. Push the current branch only when it is safe to do so; never force-push or alter remote history without explicit confirmation. Summarize the result.",
  },
  create_pr: {
    id: "create_pr",
    label: "Create PR",
    group: "Vizhi Git",
    icon: "createpr",
    prompt: "Prepare the current branch for a pull request: review the diff and test status, identify the appropriate base branch, then create a concise PR title and body if the repository tooling and state support it. Summarize the PR link or the blocker.",
  },
  status: {
    id: "status",
    label: "Status",
    group: "Vizhi Git",
    icon: "status",
    prompt: "Inspect git status, staged and untracked files, and the current branch. Summarize what has changed and recommend the most useful next action.",
  },
  log: {
    id: "log",
    label: "Git Log",
    group: "Vizhi Git",
    icon: "gitlog",
    prompt: "Inspect recent git history and summarize the commits most relevant to the current work, including notable changes, context, and anything that may affect the next step.",
  },
};

export const DEFAULT_PROMPT_TEMPLATE: PromptTemplate = toTemplate(DEFAULT_PROMPT_TEMPLATES.review);

interface PromptTemplateConfig {
  schema: 1;
  templates: Partial<Record<PromptTemplateId, { label?: string; prompt?: string }>>;
  favorite_template_id?: PromptTemplateId;
}

export function defaultPromptTemplatePath(): string {
  return process.env.VIZHI_PROMPT_TEMPLATE_PATH ?? join(homedir(), ".vizhi", "prompt-templates.json");
}

export function isPromptTemplateId(value: string | undefined): value is PromptTemplateId {
  return typeof value === "string" && (PROMPT_TEMPLATE_IDS as readonly string[]).includes(value);
}

export async function getPromptTemplate(id: PromptTemplateId, path = defaultPromptTemplatePath()): Promise<PromptTemplate> {
  const defaultTemplate = DEFAULT_PROMPT_TEMPLATES[id];
  const config = await readPromptTemplateConfig(path);
  const override = config?.templates[id];
  if (override) {
    return {
      schema: 1,
      id,
      label: normalizedOr(override.label, defaultTemplate.label),
      prompt: normalizedOr(override.prompt, defaultTemplate.prompt),
    };
  }

  if (id === "review") {
    const legacy = await readLegacyPromptTemplate(path);
    if (legacy) return legacy;
  }
  return toTemplate(defaultTemplate);
}

export async function getFavoriteTemplateId(path = defaultPromptTemplatePath()): Promise<PromptTemplateId> {
  const config = await readPromptTemplateConfig(path);
  return config?.favorite_template_id ?? "review";
}

export async function getFavoriteTemplate(path = defaultPromptTemplatePath()): Promise<PromptTemplate> {
  return getPromptTemplate(await getFavoriteTemplateId(path), path);
}

export async function readPromptTemplate(path = defaultPromptTemplatePath()): Promise<PromptTemplate> {
  return getPromptTemplate("review", path);
}

export async function writePromptTemplate(
  label: string,
  prompt: string,
  path = defaultPromptTemplatePath(),
): Promise<PromptTemplate> {
  return writePromptTemplateForId("review", label, prompt, path);
}

export async function writePromptTemplateForId(
  id: PromptTemplateId,
  label: string,
  prompt: string,
  path = defaultPromptTemplatePath(),
): Promise<PromptTemplate> {
  const normalizedLabel = label.trim();
  const normalizedPrompt = prompt.trim();
  if (!normalizedLabel) throw new Error("Prompt template label cannot be empty.");
  if (!normalizedPrompt) throw new Error("Prompt template text cannot be empty.");
  const existing = await readPromptTemplateConfig(path);
  const config: PromptTemplateConfig = {
    schema: 1,
    templates: {
      ...existing?.templates,
      [id]: { label: normalizedLabel, prompt: normalizedPrompt },
    },
  };
  await writeConfig(config, path);
  return getPromptTemplate(id, path);
}

export async function writeFavoriteTemplateId(
  id: PromptTemplateId,
  path = defaultPromptTemplatePath(),
): Promise<PromptTemplate> {
  const existing = await readPromptTemplateConfig(path);
  await writeConfig({
    schema: 1,
    templates: existing?.templates ?? {},
    favorite_template_id: id,
  }, path);
  return getFavoriteTemplate(path);
}

function toTemplate(template: PromptTemplateDefinition): PromptTemplate {
  return { schema: 1, id: template.id, label: template.label, prompt: template.prompt };
}

function normalizedOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function readPromptTemplateConfig(path: string): Promise<PromptTemplateConfig | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<PromptTemplateConfig>;
    if (value.schema !== 1 || !value.templates || typeof value.templates !== "object") return null;
    const templates: PromptTemplateConfig["templates"] = {};
    for (const id of PROMPT_TEMPLATE_IDS) {
      const candidate = value.templates[id];
      if (!candidate || typeof candidate !== "object") continue;
      const label = normalizedOr(candidate.label, "");
      const prompt = normalizedOr(candidate.prompt, "");
      if (label || prompt) templates[id] = { ...(label ? { label } : {}), ...(prompt ? { prompt } : {}) };
    }
    const favoriteTemplateId = isPromptTemplateId(value.favorite_template_id) ? value.favorite_template_id : undefined;
    return { schema: 1, templates, ...(favoriteTemplateId ? { favorite_template_id: favoriteTemplateId } : {}) };
  } catch {
    return null;
  }
}

async function readLegacyPromptTemplate(path: string): Promise<PromptTemplate | null> {
  for (const candidatePath of legacyPaths(path)) {
    try {
      const value = JSON.parse(await readFile(candidatePath, "utf8")) as Partial<PromptTemplate>;
      const label = normalizedOr(value.label, "");
      const prompt = normalizedOr(value.prompt, "");
      if (value.schema === 1 && label && prompt) return { schema: 1, id: "review", label, prompt };
    } catch { }
  }
  return null;
}

function legacyPaths(path: string): string[] {
  const defaultPath = defaultPromptTemplatePath();
  const legacyDefaultPath = join(homedir(), ".vizhi", "prompt-template.json");
  return path === defaultPath && path !== legacyDefaultPath ? [legacyDefaultPath] : [path];
}

async function writeConfig(config: PromptTemplateConfig, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}
