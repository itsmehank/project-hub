import { z } from 'zod';
import { CleanupSchema, NewIdeaSchema, ServiceCandidateSchema } from './insightItems';

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
  // 4단계 주간 리뷰용 30일 커밋. 이전 새로고침 데이터에는 없다.
  windowCommits: z.array(CommitSchema).optional(),
  windowSince: z.string().optional(),
  windowTruncated: z.boolean().optional(),
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
  recentlyClosedTruncated: z.boolean().optional(),
  recentlyMergedPRs: z.array(ItemSchema).optional(),
  recentlyMergedTruncated: z.boolean().optional(),
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
  // v3: 기술 구성은 소비자용 설명과 분리한다. v3 이전 요약에는 없으므로 기본값을 둔다.
  techOverview: z.string().default(''),
  techStack: z.array(z.string()).default([]),
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

export const LIFECYCLES = ['focus', 'maintain', 'launch', 'experiment', 'archive'] as const;
export const LifecycleSchema = z.enum(LIFECYCLES);
export type Lifecycle = z.infer<typeof LifecycleSchema>;

// 바로가기 링크는 http(s)만 허용한다(javascript: 등으로 클릭 시 스크립트가 실행되지 않게).
const isHttpUrl = (s: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(s).protocol);
  } catch {
    return false;
  }
};
export const PersonalLinkSchema = z.object({
  label: z.string().trim().min(1, '링크 이름을 입력하세요').max(30, '링크 이름은 30자까지 쓸 수 있습니다'),
  url: z.string().trim().refine(isHttpUrl, 'http 또는 https 주소만 넣을 수 있습니다'),
});
export type PersonalLink = z.infer<typeof PersonalLinkSchema>;

export const PersonalInputSchema = z.object({
  lifecycle: LifecycleSchema.nullable(),
  note: z.string().max(500, '메모는 500자까지 쓸 수 있습니다'),
  links: z.array(PersonalLinkSchema).max(5, '링크는 5개까지 넣을 수 있습니다'),
});
export type PersonalInput = z.infer<typeof PersonalInputSchema>;

export interface Personal extends PersonalInput {
  updatedAt: string | null;
}
export const EMPTY_PERSONAL: Personal = { lifecycle: null, note: '', links: [], updatedAt: null };

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
  personal: Personal;
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

export const ISSUE_KINDS = ['open', 'closed', 'pr'] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

export interface IssueDetail extends Item {
  author: string | null;
  comments: number;
  updatedAt: string;
  body: string;
}

export interface IssueList {
  kind: IssueKind;
  items: IssueDetail[];
  truncated: boolean;
  fetchedAt: string;
}

export const InsightsSchema = z.object({
  profile: z.object({ headline: z.string(), traits: z.array(z.string()), strengths: z.array(z.string()) }),
  serviceCandidates: z.array(ServiceCandidateSchema),
  newIdeas: z.array(NewIdeaSchema),
  cleanup: z.array(CleanupSchema),
});
export type Insights = z.infer<typeof InsightsSchema>;

const { $schema: _ignoredInsights, ...insightsJsonSchema } = z.toJSONSchema(InsightsSchema) as Record<string, unknown>;
export const INSIGHTS_JSON_SCHEMA = insightsJsonSchema as { type: string; required: string[]; [key: string]: unknown };

export interface InsightsResponse {
  insights: Insights | null;
  generatedAt: string | null;
  generating: boolean;
  error: string | null;
}

export interface RefreshStatus {
  running: boolean;
  done: number;
  total: number;
  error: string | null;
  finishedAt: string | null;
}

export interface LogChunk {
  text: string;
  offset: number;
  reset: boolean;
  // 실행 구분값(허브가 띄운 실행의 시작 시각). 바뀌면 새 실행이므로 로그를 처음부터 다시 받는다.
  gen: string;
}

export * from './insightItems';
export * from './decisions';
