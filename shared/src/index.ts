import { z } from 'zod';

export const STAGES = ['git', 'meta', 'github', 'summary'] as const;
export const StageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof StageSchema>;

export const CommitSchema = z.object({ hash: z.string(), subject: z.string(), at: z.string() });
export type Commit = z.infer<typeof CommitSchema>;

export const GitInfoSchema = z.object({
  branch: z.string(),
  lastCommitAt: z.string().nullable(),
  dirtyCount: z.number().int(),
  hasUpstream: z.boolean(),
  ahead: z.number().int(),
  behind: z.number().int(),
  recentCommits: z.array(CommitSchema),
  weeklyCommits: z.array(z.number().int()),
});
export type GitInfo = z.infer<typeof GitInfoSchema>;

export const ItemSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  labels: z.array(z.string()),
  createdAt: z.string(),
  closedAt: z.string().nullable(),
});
export type Item = z.infer<typeof ItemSchema>;

export const CiSchema = z.object({
  status: z.enum(['success', 'failure', 'in_progress', 'none']),
  url: z.string().optional(),
  at: z.string().optional(),
});

export const GitHubInfoSchema = z.object({
  url: z.string(),
  openIssues: z.array(ItemSchema),
  openPRs: z.array(ItemSchema),
  recentlyClosedIssues: z.array(ItemSchema),
  ci: CiSchema,
});
export type GitHubInfo = z.infer<typeof GitHubInfoSchema>;

export const RunSuggestionSchema = z.object({
  command: z.string().min(1),
  cwd: z.string(),
  expectedPort: z.number().int().nullable(),
});
export type RunSuggestion = z.infer<typeof RunSuggestionSchema>;
export const RunConfigInputSchema = RunSuggestionSchema;

export const SummarySchema = z.object({
  oneLiner: z.string().min(1),
  whatItIs: z.string().min(1),
  features: z.array(z.string()),
  structure: z.array(z.object({ path: z.string(), role: z.string() })),
  currentState: z.string(),
  nextSteps: z.array(z.string()),
  runSuggestion: RunSuggestionSchema.nullable(),
});
export type Summary = z.infer<typeof SummarySchema>;

// claude --json-schema 에 그대로 넘기는 JSON Schema.
// claude CLI는 "$schema" 키가 있으면 거부하므로 제거한다.
const { $schema: _ignored, ...summaryJsonSchema } = z.toJSONSchema(SummarySchema) as Record<string, unknown>;
export const SUMMARY_JSON_SCHEMA = summaryJsonSchema as { type: string; required: string[]; [key: string]: unknown };

export const RunConfigSchema = RunSuggestionSchema.extend({ source: z.enum(['user', 'approved']) });
export type RunConfig = z.infer<typeof RunConfigSchema>;

export type ProjectErrors = Partial<Record<Stage, string>>;

export interface StoredProject {
  name: string;
  path: string;
  isGit: boolean;
  remoteUrl: string | null;
  githubRepo: string | null;
  stack: string[];
  readmeExcerpt: string | null;
  git: GitInfo | null;
  github: GitHubInfo | null;
  errors: ProjectErrors;
  updatedAt: string;
}

export interface Project extends StoredProject {
  summary: Summary | null;
  summaryAt: string | null;
  runConfig: RunConfig | null;
}

export interface ProjectsResponse {
  projects: Project[];
  lastRefreshAt: string | null;
  refreshing: boolean;
}

export interface RuntimeProcess {
  pid: number;
  pgid: number;
  command: string;
  cwd: string;
  ports: number[];
  launchedByHub: boolean;
}

export interface RuntimeSnapshot {
  at: string;
  byProject: Record<string, RuntimeProcess[]>;
}

export type RefreshStep = 'local' | 'github' | 'summary';

export type RefreshEvent =
  | { type: 'state'; running: boolean }
  | { type: 'started'; total: number }
  | { type: 'project-updated'; name: string; step: RefreshStep; skipped: boolean; done: number; total: number }
  | { type: 'project-removed'; name: string }
  | { type: 'done'; durationMs: number }
  | { type: 'error'; message: string };

export interface Health {
  gh: boolean;
  claude: boolean;
  lsof: boolean;
  messages: string[];
}

export type StartResult =
  | { status: 'running'; processes: RuntimeProcess[] }
  | { status: 'running-no-port'; processes: RuntimeProcess[] }
  | { status: 'failed'; logTail: string }
  | { status: 'port-conflict'; port: number; holder: { project: string | null; pid: number; command: string } };
