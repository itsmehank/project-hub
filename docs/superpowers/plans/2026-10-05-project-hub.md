# Project Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `~/git/personal` 아래 프로젝트들의 정체·최근 개발 시점·상태·GitHub 이슈·로컬 실행 여부를 한 화면에서 보여주고, 수동 새로고침과 실행/중지를 지원하는 로컬 웹 대시보드를 만든다.

**Architecture:** pnpm 모노레포(`shared`/`server`/`web`). Hono 서버가 git·gh·claude·lsof CLI를 `CommandRunner`로 실행해 결과를 `node:sqlite`에 캐시하고, 새로고침 진행과 로그는 SSE로 흘린다. Vite+React 프론트는 목록+상세 분할 화면(B안 v2)을 Aceternity/Magic UI 스타일 컴포넌트로 그린다.

**Tech Stack:** Node 25, TypeScript 7, pnpm 11, Hono 4 + @hono/node-server 2, node:sqlite, zod 4, vitest 5, tsx 4, Vite 8, React 19, Tailwind CSS 4, motion 14, @tanstack/react-query 5, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-05-project-hub-design.md`

## Global Constraints

- 저장소 루트: `~/git/personal/project-hub`. 스캔 루트 기본값 `~/git/personal`, 환경변수 `HUB_ROOT`로 변경.
- 스캔 제외: 이름이 `.`로 시작, `-worktrees`로 끝남, `node_modules`, `project-hub`.
- 서버는 반드시 `127.0.0.1:4310`에만 바인딩. 웹 dev 서버는 `127.0.0.1:5199`, `/api`를 4310으로 프록시.
- GitHub는 github.com만: 모든 `gh` 호출에 `--hostname github.com`.
- 외부 명령 타임아웃: git 10초, gh 15초, claude 90초, lsof 5초.
- 동시성: git+meta 8, GitHub 4, Claude 요약 2.
- 활동 상태: 마지막 커밋 14일 이내 `active`, 60일 이내 `dormant`, 그 이상 `stale`, 커밋 없음/비git `unknown`.
- 최근 닫힌 이슈 범위: 14일. 커밋 히트맵: 26주. 최근 커밋: 10개(요약 입력도 같은 10개).
- Claude 호출: `claude -p --output-format json --model $HUB_SUMMARY_MODEL(기본 sonnet) --tools "" --no-session-persistence --json-schema <SUMMARY_JSON_SCHEMA>`, 프롬프트는 stdin, 결과는 `structured_output`.
- 실행: `zsh -lc <command>`를 `detached`로, 로그는 `data/logs/<name>.log`(실행마다 덮어씀). 포트 대기 30초, 중지 유예 5초 후 SIGKILL.
- 실행 상태 캐시 TTL 3초, 프론트 폴링 5초(탭이 보일 때만).
- UI 문구는 모두 한국어. 다크 테마 기본.
- 커밋 메시지에 `Co-Authored-By` 트레일러를 넣지 않는다(사용자 전역 규칙).

## Review Focus

1. **이름에 공백·한글이 있는 폴더, git이 아닌 폴더** — 목록에 정상 표시되고 git 항목만 비어야 한다. → Task 3 `scanProjects` 공백 폴더 테스트, Task 4 비git/하위폴더 테스트.
2. **커밋 0개 저장소, detached HEAD, upstream 없는 브랜치** — 크래시 없이 `lastCommitAt: null`, `branch: 'HEAD'`, `hasUpstream: false`. → Task 4 테스트.
3. **Claude가 오류·비JSON·타임아웃을 반환** — 이전 요약을 유지하고 `errors.summary`만 기록, 새로고침은 끝까지 진행. → Task 8 `refresh` 오류 격리 테스트.
4. **실행 명령이 즉시 죽는 경우** (잘못된 명령, 의존성 미설치) — 30초를 기다리지 않고 곧바로 `failed` + 로그 꼬리 반환. → Task 10 launcher 테스트.
5. **새로고침 버튼 연타 / 새로고침 도중 접속한 브라우저** — 두 번째 요청은 409, 늦게 붙은 SSE 구독자는 `state{running:true}`를 먼저 받는다. → Task 11 app 테스트.

---

## File Structure

```
project-hub/
├─ package.json                 # workspace 루트, dev/test/typecheck
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ shared/src/index.ts          # zod 스키마, 공유 타입, SUMMARY_JSON_SCHEMA
├─ server/
│  ├─ src/
│  │  ├─ exec.ts                # CommandRunner + runCommand
│  │  ├─ db.ts                  # node:sqlite 저장소
│  │  ├─ scanner.ts             # 프로젝트 폴더 탐색/차분
│  │  ├─ util/limit.ts          # mapLimit
│  │  ├─ collectors/git.ts
│  │  ├─ collectors/meta.ts     # 스택 감지, README 발췌, 문서/매니페스트/트리
│  │  ├─ collectors/github.ts
│  │  ├─ collectors/summary.ts  # 프롬프트, source hash, claude 호출
│  │  ├─ health.ts
│  │  ├─ refresh.ts             # runRefresh + RefreshManager
│  │  ├─ runtime/detect.ts      # lsof/ps 파싱, RuntimeCache
│  │  ├─ runtime/launcher.ts    # start/stop/logTail/cleanup
│  │  ├─ app.ts                 # createApp(deps): Hono 라우트
│  │  └─ main.ts                # 실제 의존성 연결, serve
│  └─ test/…                    # 모듈별 *.test.ts, fakeRunner.ts, gitFixture.ts
└─ web/
   ├─ index.html, vite.config.ts
   └─ src/
      ├─ main.tsx, App.tsx, index.css
      ├─ lib/{cn,api,status,runConfig,hooks}.ts
      ├─ components/ui/          # GridBackground, ShimmerButton, LiveBadge, SpotlightRow, NumberTicker, Dialog, Kbd
      └─ features/
         ├─ topbar/TopBar.tsx, RefreshButton.tsx, HealthBanner.tsx
         ├─ list/ProjectList.tsx, ProjectRow.tsx, FilterChips.tsx
         └─ detail/ProjectDetail.tsx, RuntimeBox.tsx, AboutSection.tsx, StateSection.tsx,
                   GitHubSection.tsx, CommitsSection.tsx, RunConfigDialog.tsx, LogViewer.tsx
```

---

### Task 1: 워크스페이스 + shared 스키마

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `shared/package.json`, `shared/tsconfig.json`, `shared/src/index.ts`
- Test: `shared/src/index.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces (`@hub/shared`): `Stage`, `Commit`, `GitInfo`, `Item`, `GitHubInfo`, `RunSuggestion`, `Summary`, `RunConfig`, `ProjectErrors`, `StoredProject`, `Project`, `ProjectsResponse`, `RuntimeProcess`, `RuntimeSnapshot`, `RefreshStep`, `RefreshEvent`, `Health`, `StartResult`; 스키마 `SummarySchema`, `RunSuggestionSchema`, `RunConfigInputSchema`, `GitInfoSchema`, `GitHubInfoSchema`; 상수 `SUMMARY_JSON_SCHEMA`.

- [ ] **Step 1: 워크스페이스 파일 작성**

`package.json`:
```json
{
  "name": "project-hub",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.0.8",
  "engines": { "node": ">=22.13" },
  "scripts": {
    "dev": "concurrently -n server,web -c magenta,cyan \"pnpm -F @hub/server dev\" \"pnpm -F @hub/web dev\"",
    "start": "pnpm -F @hub/web build && concurrently -n server,web \"pnpm -F @hub/server start\" \"pnpm -F @hub/web preview\"",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "concurrently": "^10.0.5",
    "typescript": "^7.0.2"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - shared
  - server
  - web
onlyBuiltDependencies:
  - esbuild
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  }
}
```

`shared/package.json`:
```json
{
  "name": "@hub/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": { "zod": "^4.6.5" },
  "devDependencies": { "typescript": "^7.0.2", "vitest": "^5.0.3" }
}
```

`shared/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 2: 실패하는 테스트 작성** — `shared/src/index.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { RunConfigInputSchema, SUMMARY_JSON_SCHEMA, SummarySchema } from './index';

const valid = {
  oneLiner: '영화 예매 오픈 감시 봇',
  whatItIs: 'CGV 예매 페이지를 주기적으로 확인합니다.',
  features: ['예매 오픈 감지'],
  structure: [{ path: 'scripts/', role: '실행 스크립트' }],
  currentState: '안정화 단계',
  nextSteps: ['알림 채널 추가'],
  runSuggestion: { command: 'uv run python scripts/server.py', cwd: '.', expectedPort: 8010 },
};

describe('SummarySchema', () => {
  it('accepts a complete summary', () => {
    expect(SummarySchema.parse(valid).oneLiner).toBe('영화 예매 오픈 감시 봇');
  });
  it('accepts a null runSuggestion', () => {
    expect(SummarySchema.parse({ ...valid, runSuggestion: null }).runSuggestion).toBeNull();
  });
  it('rejects an empty oneLiner', () => {
    expect(() => SummarySchema.parse({ ...valid, oneLiner: '' })).toThrow();
  });
});

describe('RunConfigInputSchema', () => {
  it('rejects an empty command', () => {
    expect(() => RunConfigInputSchema.parse({ command: '', cwd: '.', expectedPort: null })).toThrow();
  });
});

describe('SUMMARY_JSON_SCHEMA', () => {
  it('is an object schema requiring oneLiner', () => {
    expect(SUMMARY_JSON_SCHEMA.type).toBe('object');
    expect(SUMMARY_JSON_SCHEMA.required).toContain('oneLiner');
  });
  it('has no $schema key (claude --json-schema rejects it)', () => {
    expect(SUMMARY_JSON_SCHEMA).not.toHaveProperty('$schema');
  });
});
```

- [ ] **Step 3: 설치 후 테스트 실패 확인**

Run: `cd ~/git/personal/project-hub && pnpm install && pnpm -F @hub/shared test`
Expected: FAIL — `./index` 모듈이 없음.
(설치 시 esbuild 빌드 스크립트 무시 경고가 나오면 `pnpm-workspace.yaml`의 `onlyBuiltDependencies`가 반영됐는지 확인한다. pnpm 11에서 키 이름이 바뀌었다는 경고가 나오면 경고가 안내하는 키(`allowBuilds: { esbuild: true }` 등)로 바꾼다.)

- [ ] **Step 4: `shared/src/index.ts` 구현**

```ts
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
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm -F @hub/shared test && pnpm -F @hub/shared typecheck`
Expected: 6 tests PASS, typecheck 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json pnpm-lock.yaml shared
git commit -m "feat(shared): add workspace and shared API schemas"
```

---

### Task 2: server 기반 — CommandRunner + SQLite 저장소

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`
- Create: `server/src/exec.ts`, `server/src/db.ts`
- Create: `server/test/fakeRunner.ts`
- Test: `server/test/exec.test.ts`, `server/test/db.test.ts`

**Interfaces:**
- Consumes: `@hub/shared`의 `StoredProject`, `Summary`, `RunConfig`
- Produces:
  - `exec.ts`: `interface RunOptions { cwd?: string; timeoutMs?: number; input?: string; env?: NodeJS.ProcessEnv }`, `interface RunResult { code: number; stdout: string; stderr: string }`, `type CommandRunner = (cmd: string, args: string[], opts?: RunOptions) => Promise<RunResult>`, `const runCommand: CommandRunner` (절대 throw하지 않음. 실행 실패·타임아웃은 `code: -1`)
  - `db.ts`: `interface LaunchRecord { name; pid; pgid; command; startedAt; logPath }`, `interface SummaryRecord { sourceHash: string; content: Summary; createdAt: string }`, `interface Db { listProjects(); getProject(name); upsertProject(p); deleteProject(name); getSummary(name); putSummary(name, sourceHash, content); getRunConfig(name); putRunConfig(name, cfg); getLaunch(name); listLaunches(); putLaunch(l); deleteLaunch(name); getMeta(key); setMeta(key, value); close() }`, `function openDb(file: string): Db` (`':memory:'` 허용)
  - `test/fakeRunner.ts`: `fakeRunner(handler: (cmd, args, opts) => Partial<RunResult> | undefined): CommandRunner & { calls: { cmd: string; args: string[]; opts?: RunOptions }[] }`

- [ ] **Step 1: 패키지 파일 작성**

`server/package.json`:
```json
{
  "name": "@hub/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "start": "tsx src/main.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@hono/node-server": "^2.1.3",
    "@hub/shared": "workspace:*",
    "hono": "^4.13.13",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@types/node": "^26.6.4",
    "tsx": "^4.23.15",
    "typescript": "^7.0.2",
    "vitest": "^5.0.3"
  }
}
```

`server/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "test"]
}
```

`server/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { pool: 'forks', testTimeout: 30_000, include: ['test/**/*.test.ts'] },
});
```

Run: `pnpm install`

- [ ] **Step 2: 실패하는 테스트 작성** — `server/test/exec.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { runCommand } from '../src/exec';

describe('runCommand', () => {
  it('captures stdout and exit code 0', async () => {
    const r = await runCommand('sh', ['-c', 'echo hello']);
    expect(r).toEqual({ code: 0, stdout: 'hello\n', stderr: '' });
  });
  it('returns non-zero exit codes without throwing', async () => {
    const r = await runCommand('sh', ['-c', 'echo oops >&2; exit 3']);
    expect(r.code).toBe(3);
    expect(r.stderr).toBe('oops\n');
  });
  it('returns code -1 for a missing binary', async () => {
    const r = await runCommand('definitely-not-a-binary-xyz', []);
    expect(r.code).toBe(-1);
    expect(r.stderr).toContain('ENOENT');
  });
  it('kills and reports timeouts', async () => {
    const started = Date.now();
    const r = await runCommand('sleep', ['5'], { timeoutMs: 200 });
    expect(r.code).toBe(-1);
    expect(r.stderr).toContain('timeout');
    expect(Date.now() - started).toBeLessThan(2000);
  });
  it('pipes input to stdin', async () => {
    const r = await runCommand('cat', [], { input: '한글 입력' });
    expect(r.stdout).toBe('한글 입력');
  });
  it('runs in the given cwd', async () => {
    const r = await runCommand('pwd', [], { cwd: '/tmp' });
    expect(r.stdout.trim()).toMatch(/\/tmp$/);
  });
});
```

`server/test/db.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { StoredProject, Summary } from '@hub/shared';
import { openDb } from '../src/db';

const project = (name: string): StoredProject => ({
  name,
  path: `/root/${name}`,
  isGit: true,
  remoteUrl: null,
  githubRepo: null,
  stack: ['Node'],
  readmeExcerpt: null,
  git: null,
  github: null,
  errors: {},
  updatedAt: '2026-10-05T00:00:00.000Z',
});

const summary: Summary = {
  oneLiner: 'x',
  whatItIs: 'y',
  features: [],
  structure: [],
  currentState: '',
  nextSteps: [],
  runSuggestion: null,
};

describe('openDb', () => {
  it('round-trips projects sorted by name', () => {
    const db = openDb(':memory:');
    db.upsertProject(project('b'));
    db.upsertProject(project('a'));
    db.upsertProject({ ...project('a'), stack: ['Python'] });
    expect(db.listProjects().map((p) => p.name)).toEqual(['a', 'b']);
    expect(db.getProject('a')?.stack).toEqual(['Python']);
    expect(db.getProject('zzz')).toBeNull();
  });

  it('stores summaries, run configs and launches', () => {
    const db = openDb(':memory:');
    db.putSummary('a', 'hash1', summary);
    expect(db.getSummary('a')).toMatchObject({ sourceHash: 'hash1', content: summary });
    db.putRunConfig('a', { command: 'pnpm dev', cwd: '.', expectedPort: 5173, source: 'user' });
    expect(db.getRunConfig('a')).toEqual({ command: 'pnpm dev', cwd: '.', expectedPort: 5173, source: 'user' });
    db.putLaunch({ name: 'a', pid: 10, pgid: 10, command: 'pnpm dev', startedAt: 't', logPath: '/l' });
    expect(db.listLaunches()).toHaveLength(1);
    db.deleteLaunch('a');
    expect(db.getLaunch('a')).toBeNull();
  });

  it('deleteProject removes every row for that project', () => {
    const db = openDb(':memory:');
    db.upsertProject(project('a'));
    db.putSummary('a', 'h', summary);
    db.putRunConfig('a', { command: 'x', cwd: '.', expectedPort: null, source: 'approved' });
    db.putLaunch({ name: 'a', pid: 1, pgid: 1, command: 'x', startedAt: 't', logPath: '/l' });
    db.deleteProject('a');
    expect(db.getProject('a')).toBeNull();
    expect(db.getSummary('a')).toBeNull();
    expect(db.getRunConfig('a')).toBeNull();
    expect(db.getLaunch('a')).toBeNull();
  });

  it('stores meta values', () => {
    const db = openDb(':memory:');
    expect(db.getMeta('lastRefreshAt')).toBeNull();
    db.setMeta('lastRefreshAt', '2026-10-05');
    db.setMeta('lastRefreshAt', '2026-10-06');
    expect(db.getMeta('lastRefreshAt')).toBe('2026-10-06');
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm -F @hub/server test`
Expected: FAIL — `../src/exec`, `../src/db` 없음.

- [ ] **Step 4: `server/src/exec.ts` 구현**

```ts
import { spawn } from 'node:child_process';

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  input?: string;
  env?: NodeJS.ProcessEnv;
}
export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}
export type CommandRunner = (cmd: string, args: string[], opts?: RunOptions) => Promise<RunResult>;

// 절대 throw하지 않는다. 실행 실패/타임아웃은 code -1.
export const runCommand: CommandRunner = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    const finish = (r: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ code: -1, stdout, stderr: `${stderr}\n[timeout after ${timeoutMs}ms]` });
    }, timeoutMs);
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    child.on('error', (err) => finish({ code: -1, stdout, stderr: err.message }));
    child.on('close', (code) => finish({ code: code ?? -1, stdout, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(opts.input ?? '');
  });
```

- [ ] **Step 5: `server/src/db.ts` 구현**

```ts
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { RunConfig, StoredProject, Summary } from '@hub/shared';

export interface LaunchRecord {
  name: string;
  pid: number;
  pgid: number;
  command: string;
  startedAt: string;
  logPath: string;
}
export interface SummaryRecord {
  sourceHash: string;
  content: Summary;
  createdAt: string;
}
export interface Db {
  listProjects(): StoredProject[];
  getProject(name: string): StoredProject | null;
  upsertProject(p: StoredProject): void;
  deleteProject(name: string): void;
  getSummary(name: string): SummaryRecord | null;
  putSummary(name: string, sourceHash: string, content: Summary): void;
  getRunConfig(name: string): RunConfig | null;
  putRunConfig(name: string, cfg: RunConfig): void;
  getLaunch(name: string): LaunchRecord | null;
  listLaunches(): LaunchRecord[];
  putLaunch(l: LaunchRecord): void;
  deleteLaunch(name: string): void;
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (name TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS summaries (name TEXT PRIMARY KEY, source_hash TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS run_configs (name TEXT PRIMARY KEY, command TEXT NOT NULL, cwd TEXT NOT NULL, expected_port INTEGER, source TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS launches (name TEXT PRIMARY KEY, pid INTEGER NOT NULL, pgid INTEGER NOT NULL, command TEXT NOT NULL, started_at TEXT NOT NULL, log_path TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

type Row = Record<string, unknown>;

export function openDb(file: string): Db {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);

  const toLaunch = (r: Row): LaunchRecord => ({
    name: String(r.name),
    pid: Number(r.pid),
    pgid: Number(r.pgid),
    command: String(r.command),
    startedAt: String(r.started_at),
    logPath: String(r.log_path),
  });

  return {
    listProjects: () =>
      (db.prepare('SELECT data FROM projects ORDER BY name').all() as Row[]).map((r) => JSON.parse(String(r.data))),
    getProject: (name) => {
      const r = db.prepare('SELECT data FROM projects WHERE name = ?').get(name) as Row | undefined;
      return r ? JSON.parse(String(r.data)) : null;
    },
    upsertProject: (p) => {
      db.prepare(
        'INSERT INTO projects (name, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
      ).run(p.name, JSON.stringify(p), p.updatedAt);
    },
    deleteProject: (name) => {
      for (const t of ['projects', 'summaries', 'run_configs', 'launches']) {
        db.prepare(`DELETE FROM ${t} WHERE name = ?`).run(name);
      }
    },
    getSummary: (name) => {
      const r = db.prepare('SELECT * FROM summaries WHERE name = ?').get(name) as Row | undefined;
      return r
        ? { sourceHash: String(r.source_hash), content: JSON.parse(String(r.content)), createdAt: String(r.created_at) }
        : null;
    },
    putSummary: (name, sourceHash, content) => {
      db.prepare(
        'INSERT INTO summaries (name, source_hash, content, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET source_hash = excluded.source_hash, content = excluded.content, created_at = excluded.created_at',
      ).run(name, sourceHash, JSON.stringify(content), new Date().toISOString());
    },
    getRunConfig: (name) => {
      const r = db.prepare('SELECT * FROM run_configs WHERE name = ?').get(name) as Row | undefined;
      return r
        ? {
            command: String(r.command),
            cwd: String(r.cwd),
            expectedPort: r.expected_port === null ? null : Number(r.expected_port),
            source: r.source as RunConfig['source'],
          }
        : null;
    },
    putRunConfig: (name, cfg) => {
      db.prepare(
        'INSERT INTO run_configs (name, command, cwd, expected_port, source, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET command = excluded.command, cwd = excluded.cwd, expected_port = excluded.expected_port, source = excluded.source, updated_at = excluded.updated_at',
      ).run(name, cfg.command, cfg.cwd, cfg.expectedPort, cfg.source, new Date().toISOString());
    },
    getLaunch: (name) => {
      const r = db.prepare('SELECT * FROM launches WHERE name = ?').get(name) as Row | undefined;
      return r ? toLaunch(r) : null;
    },
    listLaunches: () => (db.prepare('SELECT * FROM launches').all() as Row[]).map(toLaunch),
    putLaunch: (l) => {
      db.prepare(
        'INSERT INTO launches (name, pid, pgid, command, started_at, log_path) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET pid = excluded.pid, pgid = excluded.pgid, command = excluded.command, started_at = excluded.started_at, log_path = excluded.log_path',
      ).run(l.name, l.pid, l.pgid, l.command, l.startedAt, l.logPath);
    },
    deleteLaunch: (name) => {
      db.prepare('DELETE FROM launches WHERE name = ?').run(name);
    },
    getMeta: (key) => {
      const r = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as Row | undefined;
      return r ? String(r.value) : null;
    },
    setMeta: (key, value) => {
      db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
        key,
        value,
      );
    },
    close: () => db.close(),
  };
}
```

- [ ] **Step 6: 테스트용 fakeRunner 작성** — `server/test/fakeRunner.ts`

```ts
import type { CommandRunner, RunOptions, RunResult } from '../src/exec';

type Handler = (cmd: string, args: string[], opts?: RunOptions) => Partial<RunResult> | undefined;

export function fakeRunner(handler: Handler) {
  const calls: { cmd: string; args: string[]; opts?: RunOptions }[] = [];
  const run: CommandRunner = async (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const r = handler(cmd, args, opts);
    if (!r) return { code: 127, stdout: '', stderr: `unexpected command: ${cmd} ${args.join(' ')}` };
    return { code: 0, stdout: '', stderr: '', ...r };
  };
  return Object.assign(run, { calls });
}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `pnpm -F @hub/server test && pnpm -F @hub/server typecheck`
Expected: exec 6개, db 4개 PASS.
(vitest가 `node:sqlite`를 해석하지 못하면 `server/vitest.config.ts`의 `test`에 `server: { deps: { external: [/^node:/] } }`를 추가한다.)

- [ ] **Step 8: 커밋**

```bash
git add server pnpm-lock.yaml
git commit -m "feat(server): add command runner and sqlite store"
```

---

### Task 3: 프로젝트 스캐너

**Files:**
- Create: `server/src/scanner.ts`
- Test: `server/test/scanner.test.ts`

**Interfaces:**
- Produces: `interface FoundProject { name: string; path: string }`, `isExcluded(name: string, exclude: string[]): boolean`, `scanProjects(root: string, exclude?: string[]): Promise<FoundProject[]>` (이름순 정렬), `diffProjects(existing: string[], found: string[]): { added: string[]; removed: string[]; kept: string[] }`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffProjects, scanProjects } from '../src/scanner';

describe('scanProjects', () => {
  it('lists project directories and applies exclusion rules', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'hub-scan-'));
    for (const d of ['alpha', 'my project', '한글프로젝트', '.hidden', 'foo-worktrees', 'project-hub', 'node_modules']) {
      mkdirSync(path.join(root, d));
    }
    writeFileSync(path.join(root, 'notes.txt'), 'x');
    const found = await scanProjects(root, ['project-hub']);
    expect(found.map((f) => f.name)).toEqual(['alpha', 'my project', '한글프로젝트']);
    expect(found[1].path).toBe(path.join(root, 'my project'));
  });
});

describe('diffProjects', () => {
  it('splits names into added, removed and kept', () => {
    expect(diffProjects(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual({ added: ['d'], removed: ['a'], kept: ['b', 'c'] });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm -F @hub/server test scanner`
Expected: FAIL — `../src/scanner` 없음.

- [ ] **Step 3: 구현** — `server/src/scanner.ts`

```ts
import { readdir } from 'node:fs/promises';
import path from 'node:path';

export interface FoundProject {
  name: string;
  path: string;
}

export function isExcluded(name: string, exclude: string[]): boolean {
  return name.startsWith('.') || name.endsWith('-worktrees') || name === 'node_modules' || exclude.includes(name);
}

export async function scanProjects(root: string, exclude: string[] = []): Promise<FoundProject[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !isExcluded(e.name, exclude))
    .map((e) => ({ name: e.name, path: path.join(root, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function diffProjects(existing: string[], found: string[]) {
  const e = new Set(existing);
  const f = new Set(found);
  return {
    added: found.filter((n) => !e.has(n)),
    removed: existing.filter((n) => !f.has(n)),
    kept: found.filter((n) => e.has(n)),
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F @hub/server test scanner`
Expected: 2 PASS. (`localeCompare` 기준으로 `alpha` < `my project` < `한글프로젝트` 순서.)

- [ ] **Step 5: 커밋**

```bash
git add server/src/scanner.ts server/test/scanner.test.ts
git commit -m "feat(server): add project scanner"
```

---

### Task 4: git 수집기

**Files:**
- Create: `server/src/collectors/git.ts`
- Create: `server/test/gitFixture.ts`
- Test: `server/test/git.test.ts`

**Interfaces:**
- Consumes: `CommandRunner`, `runCommand` (Task 2), `GitInfo`, `Commit` (Task 1)
- Produces: `WEEKS = 26`, `interface GitCollectResult { git: GitInfo; remoteUrl: string | null }`, `collectGit(dir: string, run: CommandRunner, now?: Date): Promise<GitCollectResult | null>` (git 저장소의 최상위가 아니면 `null`), `parseLog(out: string): Commit[]`, `bucketWeekly(isoDates: string[], now: Date): number[]`
- `gitFixture.ts`: `makeRepo(dir?: string): Promise<string>`, `commit(dir: string, message: string, isoDate?: string): Promise<void>`, `git(dir: string, ...args: string[]): Promise<string>`

- [ ] **Step 1: 테스트 픽스처 작성** — `server/test/gitFixture.ts`

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCommand } from '../src/exec';

export async function git(dir: string, ...args: string[]): Promise<string> {
  const r = await runCommand('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir });
  if (r.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

export async function makeRepo(dir = mkdtempSync(path.join(tmpdir(), 'hub-git-'))): Promise<string> {
  await git(dir, 'init', '-q', '-b', 'main');
  return dir;
}

let counter = 0;
export async function commit(dir: string, message: string, isoDate?: string): Promise<void> {
  writeFileSync(path.join(dir, `f${counter++}.txt`), message);
  await git(dir, 'add', '-A');
  const env = isoDate ? { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate } : process.env;
  const r = await runCommand('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', message], {
    cwd: dir,
    env,
  });
  if (r.code !== 0) throw new Error(r.stderr);
}
```

- [ ] **Step 2: 실패하는 테스트 작성** — `server/test/git.test.ts`

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bucketWeekly, collectGit, parseLog } from '../src/collectors/git';
import { runCommand } from '../src/exec';
import { commit, git, makeRepo } from './gitFixture';

describe('collectGit', () => {
  it('returns null for a non-git folder', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hub-plain-'));
    expect(await collectGit(dir, runCommand)).toBeNull();
  });

  it('returns null for a subfolder of a repo', async () => {
    const repo = await makeRepo();
    mkdirSync(path.join(repo, 'sub'));
    expect(await collectGit(path.join(repo, 'sub'), runCommand)).toBeNull();
  });

  it('handles a repo with no commits', async () => {
    const repo = await makeRepo();
    const r = await collectGit(repo, runCommand);
    expect(r?.git).toMatchObject({ branch: 'main', lastCommitAt: null, recentCommits: [], hasUpstream: false });
    expect(r?.git.weeklyCommits).toHaveLength(26);
    expect(r?.remoteUrl).toBeNull();
  });

  it('reports commits, dirty files and missing upstream', async () => {
    const repo = await makeRepo();
    await commit(repo, 'first');
    await commit(repo, 'second');
    writeFileSync(path.join(repo, 'untracked.txt'), 'x');
    const r = await collectGit(repo, runCommand);
    expect(r?.git.recentCommits.map((c) => c.subject)).toEqual(['second', 'first']);
    expect(r?.git.lastCommitAt).toBe(r?.git.recentCommits[0].at);
    expect(r?.git.dirtyCount).toBe(1);
    expect(r?.git).toMatchObject({ hasUpstream: false, ahead: 0, behind: 0 });
    expect(r?.git.weeklyCommits[25]).toBe(2);
  });

  it('counts ahead commits against an upstream and reads the remote url', async () => {
    const bare = mkdtempSync(path.join(tmpdir(), 'hub-bare-'));
    await git(bare, 'init', '-q', '--bare', '-b', 'main');
    const repo = await makeRepo();
    await commit(repo, 'base');
    await git(repo, 'remote', 'add', 'origin', bare);
    await git(repo, 'push', '-q', '-u', 'origin', 'main');
    await commit(repo, 'local only');
    const r = await collectGit(repo, runCommand);
    expect(r?.git).toMatchObject({ hasUpstream: true, ahead: 1, behind: 0 });
    expect(r?.remoteUrl).toBe(bare);
  });

  it('reports detached HEAD as branch "HEAD"', async () => {
    const repo = await makeRepo();
    await commit(repo, 'one');
    await commit(repo, 'two');
    await git(repo, 'checkout', '-q', 'HEAD~1');
    expect((await collectGit(repo, runCommand))?.git.branch).toBe('HEAD');
  });
});

describe('parseLog', () => {
  it('splits unit-separated fields and keeps subjects with pipes', () => {
    const out = 'abc\x1ffeat: a | b\x1f2026-10-01T10:00:00+09:00\n';
    expect(parseLog(out)).toEqual([{ hash: 'abc', subject: 'feat: a | b', at: '2026-10-01T10:00:00+09:00' }]);
  });
});

describe('bucketWeekly', () => {
  it('puts this week last and drops dates older than 26 weeks', () => {
    const now = new Date('2026-10-05T00:00:00Z');
    const weeks = bucketWeekly(
      ['2026-10-04T00:00:00Z', '2026-09-27T00:00:00Z', '2026-09-26T00:00:00Z', '2025-01-01T00:00:00Z'],
      now,
    );
    expect(weeks).toHaveLength(26);
    expect(weeks[25]).toBe(1);
    expect(weeks[24]).toBe(2);
    expect(weeks.reduce((a, b) => a + b, 0)).toBe(3);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm -F @hub/server test git`
Expected: FAIL — `../src/collectors/git` 없음.

- [ ] **Step 4: 구현** — `server/src/collectors/git.ts`

```ts
import { realpath } from 'node:fs/promises';
import type { Commit, GitInfo } from '@hub/shared';
import type { CommandRunner } from '../exec';

export const WEEKS = 26;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface GitCollectResult {
  git: GitInfo;
  remoteUrl: string | null;
}

export function parseLog(out: string): Commit[] {
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, at] = line.split('\x1f');
      return { hash, subject, at };
    });
}

export function bucketWeekly(isoDates: string[], now: Date): number[] {
  const weeks = new Array<number>(WEEKS).fill(0);
  for (const iso of isoDates) {
    const age = Math.max(0, now.getTime() - new Date(iso).getTime());
    const w = Math.floor(age / WEEK_MS);
    if (w < WEEKS) weeks[WEEKS - 1 - w] += 1;
  }
  return weeks;
}

export async function collectGit(dir: string, run: CommandRunner, now = new Date()): Promise<GitCollectResult | null> {
  const git = (args: string[]) => run('git', ['--no-optional-locks', ...args], { cwd: dir, timeoutMs: 10_000 });

  const top = await git(['rev-parse', '--show-toplevel']);
  if (top.code !== 0) return null;
  if ((await realpath(top.stdout.trim())) !== (await realpath(dir))) return null;

  const since = new Date(now.getTime() - WEEKS * WEEK_MS).toISOString();
  const [branchR, logR, statusR, upR, weeklyR, remoteR] = await Promise.all([
    git(['symbolic-ref', '--short', '-q', 'HEAD']),
    git(['log', '-n', '10', '--format=%H%x1f%s%x1f%cI']),
    git(['status', '--porcelain']),
    git(['rev-list', '--left-right', '--count', '@{u}...HEAD']),
    git(['log', `--since=${since}`, '--format=%cI']),
    git(['remote', 'get-url', 'origin']),
  ]);

  const recentCommits = logR.code === 0 ? parseLog(logR.stdout) : [];
  let hasUpstream = false;
  let behind = 0;
  let ahead = 0;
  if (upR.code === 0) {
    const [b, a] = upR.stdout.trim().split(/\s+/).map(Number);
    hasUpstream = true;
    behind = b || 0;
    ahead = a || 0;
  }

  return {
    git: {
      branch: branchR.code === 0 ? branchR.stdout.trim() : 'HEAD',
      lastCommitAt: recentCommits[0]?.at ?? null,
      dirtyCount: statusR.stdout.split('\n').filter(Boolean).length,
      hasUpstream,
      ahead,
      behind,
      recentCommits,
      weeklyCommits: bucketWeekly(weeklyR.code === 0 ? weeklyR.stdout.split('\n').filter(Boolean) : [], now),
    },
    remoteUrl: remoteR.code === 0 ? remoteR.stdout.trim() || null : null,
  };
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm -F @hub/server test git`
Expected: 8 PASS.

- [ ] **Step 6: 커밋**

```bash
git add server/src/collectors/git.ts server/test/gitFixture.ts server/test/git.test.ts
git commit -m "feat(server): add git collector"
```

---
### Task 5: meta 수집기 (스택, README 발췌, 문서·매니페스트·트리)

**Files:**
- Create: `server/src/collectors/meta.ts`
- Test: `server/test/meta.test.ts`

**Interfaces:**
- Produces:
  - `interface DocsBundle { readme: string | null; claudeMd: string | null; manifests: Record<string, string>; docMtimes: number[] }`
  - `interface MetaResult { stack: string[]; readmeExcerpt: string | null; docs: DocsBundle; tree: string }`
  - `collectMeta(dir: string): Promise<MetaResult>`
  - `detectStack(files: string[], manifests: Record<string, string>): string[]`
  - `readmeExcerpt(readme: string | null): string | null` (300자 제한)
  - `dirTree(dir: string, depth?: number, maxEntries?: number): Promise<string>`

- [ ] **Step 1: 실패하는 테스트 작성** — `server/test/meta.test.ts`

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectMeta, detectStack, dirTree, readmeExcerpt } from '../src/collectors/meta';

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hub-meta-'));
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ dependencies: { react: '19', vite: '8' }, devDependencies: { typescript: '7' } }),
  );
  writeFileSync(
    path.join(dir, 'README.md'),
    '# Title\n\n[![badge](x)](y)\n\n이 프로젝트는   책을\n학습 노트로 바꿉니다.\n\n## More\n',
  );
  writeFileSync(path.join(dir, 'CLAUDE.md'), 'rules');
  writeFileSync(path.join(dir, 'run.sh'), 'pnpm dev');
  mkdirSync(path.join(dir, 'src'));
  writeFileSync(path.join(dir, 'src', 'a.ts'), '');
  mkdirSync(path.join(dir, 'node_modules', 'x'), { recursive: true });
  return dir;
}

describe('collectMeta', () => {
  it('collects stack, excerpt, docs and tree', async () => {
    const meta = await collectMeta(fixture());
    expect(meta.stack).toEqual(['Node', 'TypeScript', 'React', 'Vite']);
    expect(meta.readmeExcerpt).toBe('이 프로젝트는 책을 학습 노트로 바꿉니다.');
    expect(meta.docs.claudeMd).toBe('rules');
    expect(Object.keys(meta.docs.manifests).sort()).toEqual(['package.json', 'run.sh']);
    expect(meta.docs.docMtimes).toHaveLength(2);
    expect(meta.tree).toContain('src/');
    expect(meta.tree).toContain('  a.ts');
    expect(meta.tree).not.toContain('node_modules');
  });

  it('works on an empty folder', async () => {
    const meta = await collectMeta(mkdtempSync(path.join(tmpdir(), 'hub-empty-')));
    expect(meta).toMatchObject({ stack: [], readmeExcerpt: null, docs: { readme: null, claudeMd: null, docMtimes: [] } });
  });
});

describe('detectStack', () => {
  it('detects Python frameworks and docker', () => {
    expect(
      detectStack(['pyproject.toml', 'Dockerfile'], { 'pyproject.toml': 'dependencies = ["fastapi", "python-telegram-bot"]' }),
    ).toEqual(['Python', 'FastAPI', 'Telegram Bot', 'Docker']);
  });
  it('survives a broken package.json', () => {
    expect(detectStack(['package.json'], { 'package.json': '{oops' })).toEqual(['Node']);
  });
});

describe('readmeExcerpt', () => {
  it('truncates long paragraphs to 300 chars', () => {
    const s = readmeExcerpt('가'.repeat(400));
    expect(s?.length).toBe(300);
    expect(s?.endsWith('…')).toBe(true);
  });
  it('returns null when only headings exist', () => {
    expect(readmeExcerpt('# a\n\n## b\n')).toBeNull();
  });
});

describe('dirTree', () => {
  it('caps the number of entries', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hub-tree-'));
    for (let i = 0; i < 10; i++) writeFileSync(path.join(dir, `f${i}.txt`), '');
    const tree = await dirTree(dir, 2, 5);
    expect(tree.split('\n')).toHaveLength(6);
    expect(tree.endsWith('…')).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm -F @hub/server test meta`
Expected: FAIL — `../src/collectors/meta` 없음.

- [ ] **Step 3: 구현** — `server/src/collectors/meta.ts`

```ts
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export interface DocsBundle {
  readme: string | null;
  claudeMd: string | null;
  manifests: Record<string, string>;
  docMtimes: number[];
}
export interface MetaResult {
  stack: string[];
  readmeExcerpt: string | null;
  docs: DocsBundle;
  tree: string;
}

const README_NAMES = ['README.md', 'readme.md', 'Readme.md', 'README'];
const MANIFESTS = [
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'Makefile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'Procfile',
];
const TREE_IGNORE = new Set([
  'node_modules', '.git', '.venv', 'venv', 'dist', 'build', '__pycache__', '.next', '.turbo',
  '.pytest_cache', '.mypy_cache', '.ruff_cache', '.superpowers', 'coverage', '.DS_Store',
]);
const MAX_MANIFEST = 3000;

async function readText(file: string): Promise<{ text: string; mtime: number } | null> {
  try {
    const [text, s] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
    return { text, mtime: s.mtimeMs };
  } catch {
    return null;
  }
}

export function detectStack(files: string[], manifests: Record<string, string>): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    if (!out.includes(s)) out.push(s);
  };
  if (files.includes('package.json')) {
    add('Node');
    let deps: Record<string, string> = {};
    try {
      const pkg = JSON.parse(manifests['package.json'] ?? '{}');
      deps = { ...pkg.dependencies, ...pkg.devDependencies };
    } catch {
      // 깨진 package.json은 Node로만 표시
    }
    const rules: [string, string][] = [
      ['typescript', 'TypeScript'], ['next', 'Next.js'], ['astro', 'Astro'], ['react', 'React'],
      ['vue', 'Vue'], ['svelte', 'Svelte'], ['vite', 'Vite'], ['hono', 'Hono'], ['express', 'Express'],
      ['electron', 'Electron'],
    ];
    for (const [dep, label] of rules) if (dep in deps) add(label);
  }
  const py = manifests['pyproject.toml'] ?? manifests['requirements.txt'];
  if (files.includes('pyproject.toml') || files.includes('requirements.txt')) {
    add('Python');
    const lower = (py ?? '').toLowerCase();
    const rules: [string, string][] = [
      ['fastapi', 'FastAPI'], ['django', 'Django'], ['flask', 'Flask'], ['streamlit', 'Streamlit'],
      ['python-telegram-bot', 'Telegram Bot'], ['aiogram', 'Telegram Bot'], ['playwright', 'Playwright'],
    ];
    for (const [dep, label] of rules) if (lower.includes(dep)) add(label);
  }
  if (files.includes('Dockerfile') || files.some((f) => f.startsWith('docker-compose'))) add('Docker');
  if (files.includes('Cargo.toml')) add('Rust');
  if (files.includes('go.mod')) add('Go');
  return out;
}

export function readmeExcerpt(readme: string | null): string | null {
  if (!readme) return null;
  const skip = /^(#|!\[|\[!\[|<|```|---|\||>)/;
  for (const block of readme.split(/\n\s*\n/)) {
    const text = block.trim();
    if (!text || skip.test(text)) continue;
    const flat = text.replace(/\s+/g, ' ');
    return flat.length > 300 ? `${flat.slice(0, 299)}…` : flat;
  }
  return null;
}

export async function dirTree(dir: string, depth = 2, maxEntries = 80): Promise<string> {
  const lines: string[] = [];
  let truncated = false;
  const walk = async (current: string, level: number) => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (TREE_IGNORE.has(e.name)) continue;
      if (lines.length >= maxEntries) {
        truncated = true;
        return;
      }
      lines.push(`${'  '.repeat(level)}${e.name}${e.isDirectory() ? '/' : ''}`);
      if (e.isDirectory() && level + 1 < depth) await walk(path.join(current, e.name), level + 1);
    }
  };
  await walk(dir, 0);
  if (truncated) lines.push('…');
  return lines.join('\n');
}

export async function collectMeta(dir: string): Promise<MetaResult> {
  const files = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
  const docMtimes: number[] = [];

  let readme: string | null = null;
  const readmeName = README_NAMES.find((n) => files.includes(n));
  if (readmeName) {
    const r = await readText(path.join(dir, readmeName));
    if (r) {
      readme = r.text;
      docMtimes.push(r.mtime);
    }
  }
  let claudeMd: string | null = null;
  if (files.includes('CLAUDE.md')) {
    const r = await readText(path.join(dir, 'CLAUDE.md'));
    if (r) {
      claudeMd = r.text;
      docMtimes.push(r.mtime);
    }
  }

  const manifestNames = [...MANIFESTS.filter((m) => files.includes(m)), ...files.filter((f) => f.endsWith('.sh')).slice(0, 3)];
  const manifests: Record<string, string> = {};
  for (const name of manifestNames) {
    const r = await readText(path.join(dir, name));
    if (r) manifests[name] = r.text.slice(0, MAX_MANIFEST);
  }

  return {
    stack: detectStack(files, manifests),
    readmeExcerpt: readmeExcerpt(readme),
    docs: { readme, claudeMd, manifests, docMtimes },
    tree: await dirTree(dir),
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F @hub/server test meta`
Expected: 7 PASS.

- [ ] **Step 5: 커밋**

```bash
git add server/src/collectors/meta.ts server/test/meta.test.ts
git commit -m "feat(server): add meta collector"
```

---

### Task 6: GitHub 수집기

**Files:**
- Create: `server/src/collectors/github.ts`
- Test: `server/test/github.test.ts`

**Interfaces:**
- Consumes: `CommandRunner`, `fakeRunner`, `GitHubInfo`, `Item`
- Produces: `class RateLimitError extends Error`, `parseGithubRepo(remoteUrl: string | null): string | null` (`"owner/repo"`, github.com이 아니면 null), `collectGitHub(repo: string, run: CommandRunner, now?: Date): Promise<GitHubInfo>` (실패 시 throw, 레이트 리밋이면 `RateLimitError`)

- [ ] **Step 1: 실패하는 테스트 작성** — `server/test/github.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { RateLimitError, collectGitHub, parseGithubRepo } from '../src/collectors/github';
import { fakeRunner } from './fakeRunner';

const NOW = new Date('2026-10-05T00:00:00Z');
const issue = (n: number, extra: Record<string, unknown> = {}) => ({
  number: n,
  title: `issue ${n}`,
  html_url: `https://github.com/me/r/issues/${n}`,
  labels: [{ name: 'bug' }],
  created_at: '2026-09-01T00:00:00Z',
  closed_at: null,
  ...extra,
});

function ghRunner(routes: Record<string, unknown>, failWith?: string) {
  return fakeRunner((cmd, args) => {
    if (cmd !== 'gh' || args[0] !== 'api') return undefined;
    if (failWith) return { code: 1, stderr: failWith };
    const p = args[3];
    const key = Object.keys(routes).find((k) => p.includes(k));
    return key ? { stdout: JSON.stringify(routes[key]) } : { code: 1, stderr: 'HTTP 404' };
  });
}

describe('parseGithubRepo', () => {
  it.each([
    ['git@github.com:itsmehank/mx5-bot.git', 'itsmehank/mx5-bot'],
    ['https://github.com/itsmehank/hw-note.git', 'itsmehank/hw-note'],
    ['https://github.com/itsmehank/hw-note/', 'itsmehank/hw-note'],
    ['ssh://git@github.com/itsmehank/yt-digest.git', 'itsmehank/yt-digest'],
    ['git@ghe.example.com:team/repo.git', null],
    ['/tmp/bare-repo', null],
    [null, null],
  ])('%s -> %s', (url, expected) => {
    expect(parseGithubRepo(url)).toBe(expected);
  });
});

describe('collectGitHub', () => {
  it('collects issues (without PRs), PRs, recently closed issues and CI', async () => {
    const run = ghRunner({
      'issues?state=open': [issue(1), issue(2, { pull_request: {} })],
      'pulls?state=open': [issue(3)],
      'issues?state=closed': [
        issue(4, { closed_at: '2026-10-01T00:00:00Z' }),
        issue(5, { closed_at: '2026-09-01T00:00:00Z' }),
        issue(6, { closed_at: '2026-10-02T00:00:00Z', pull_request: {} }),
      ],
      'actions/runs': { workflow_runs: [{ status: 'completed', conclusion: 'success', html_url: 'u', created_at: 't' }] },
    });
    const info = await collectGitHub('me/r', run, NOW);
    expect(info.url).toBe('https://github.com/me/r');
    expect(info.openIssues.map((i) => i.number)).toEqual([1]);
    expect(info.openIssues[0]).toMatchObject({ labels: ['bug'], url: 'https://github.com/me/r/issues/1' });
    expect(info.openPRs.map((i) => i.number)).toEqual([3]);
    expect(info.recentlyClosedIssues.map((i) => i.number)).toEqual([4]);
    expect(info.ci).toEqual({ status: 'success', url: 'u', at: 't' });
    expect(run.calls.every((c) => c.args.slice(0, 3).join(' ') === 'api --hostname github.com')).toBe(true);
  });

  it('maps CI states', async () => {
    const base = { 'issues?state': [], 'pulls?state': [] };
    const running = await collectGitHub(
      'me/r',
      ghRunner({ ...base, 'actions/runs': { workflow_runs: [{ status: 'in_progress', conclusion: null }] } }),
      NOW,
    );
    expect(running.ci.status).toBe('in_progress');
    const none = await collectGitHub('me/r', ghRunner({ ...base, 'actions/runs': { workflow_runs: [] } }), NOW);
    expect(none.ci).toEqual({ status: 'none' });
    const failed = await collectGitHub(
      'me/r',
      ghRunner({ ...base, 'actions/runs': { workflow_runs: [{ status: 'completed', conclusion: 'failure' }] } }),
      NOW,
    );
    expect(failed.ci.status).toBe('failure');
  });

  it('throws RateLimitError on rate limiting', async () => {
    await expect(collectGitHub('me/r', ghRunner({}, 'gh: API rate limit exceeded (HTTP 403)'), NOW)).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it('throws a plain Error on other failures', async () => {
    const err = await collectGitHub('me/r', ghRunner({}, 'gh: Not Found (HTTP 404)'), NOW).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(RateLimitError);
    expect(err.message).toContain('Not Found');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm -F @hub/server test github`
Expected: FAIL — `../src/collectors/github` 없음.

- [ ] **Step 3: 구현** — `server/src/collectors/github.ts`

```ts
import type { GitHubInfo, Item } from '@hub/shared';
import type { CommandRunner } from '../exec';

export class RateLimitError extends Error {}

const CLOSED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function parseGithubRepo(remoteUrl: string | null): string | null {
  if (!remoteUrl) return null;
  const m = remoteUrl.trim().match(/(?:^|[@/])github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

interface RawIssue {
  number: number;
  title: string;
  html_url: string;
  labels?: (string | { name?: string })[];
  created_at: string;
  closed_at?: string | null;
  pull_request?: unknown;
}

const toItem = (r: RawIssue): Item => ({
  number: r.number,
  title: r.title,
  url: r.html_url,
  labels: (r.labels ?? []).map((l) => (typeof l === 'string' ? l : (l.name ?? ''))).filter(Boolean),
  createdAt: r.created_at,
  closedAt: r.closed_at ?? null,
});

async function api<T>(run: CommandRunner, apiPath: string): Promise<T> {
  const r = await run('gh', ['api', '--hostname', 'github.com', apiPath], { timeoutMs: 15_000 });
  if (r.code !== 0) {
    const msg = r.stderr.trim() || `gh api ${apiPath} failed`;
    if (/rate limit|HTTP 429/i.test(msg)) throw new RateLimitError(msg);
    throw new Error(msg);
  }
  return JSON.parse(r.stdout) as T;
}

export async function collectGitHub(repo: string, run: CommandRunner, now = new Date()): Promise<GitHubInfo> {
  const since = new Date(now.getTime() - CLOSED_WINDOW_MS).toISOString();
  const [open, pulls, closed, runs] = await Promise.all([
    api<RawIssue[]>(run, `repos/${repo}/issues?state=open&per_page=50`),
    api<RawIssue[]>(run, `repos/${repo}/pulls?state=open&per_page=30`),
    api<RawIssue[]>(run, `repos/${repo}/issues?state=closed&since=${since}&per_page=30`),
    api<{ workflow_runs?: { status: string; conclusion: string | null; html_url?: string; created_at?: string }[] }>(
      run,
      `repos/${repo}/actions/runs?per_page=1`,
    ),
  ]);

  const latest = runs.workflow_runs?.[0];
  let ci: GitHubInfo['ci'] = { status: 'none' };
  if (latest) {
    const status = latest.status !== 'completed' ? 'in_progress' : latest.conclusion === 'success' ? 'success' : 'failure';
    ci = { status, url: latest.html_url, at: latest.created_at };
  }

  return {
    url: `https://github.com/${repo}`,
    openIssues: open.filter((i) => !i.pull_request).map(toItem),
    openPRs: pulls.map(toItem),
    recentlyClosedIssues: closed
      .filter((i) => !i.pull_request && i.closed_at && i.closed_at >= since)
      .map(toItem)
      .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '')),
    ci,
  };
}
```

주의: CI 테스트의 `'issues?state'` 키는 open/closed 이슈 요청 모두에 걸린다(`Object.keys(...).find`는 처음 일치한 키를 사용). 첫 테스트는 `issues?state=open`과 `issues?state=closed`를 각각 따로 둔다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F @hub/server test github`
Expected: 11 PASS (parseGithubRepo 7 + collectGitHub 4).

- [ ] **Step 5: 커밋**

```bash
git add server/src/collectors/github.ts server/test/github.test.ts
git commit -m "feat(server): add GitHub collector"
```

---

### Task 7: Claude 요약 수집기

**Files:**
- Create: `server/src/collectors/summary.ts`
- Test: `server/test/summary.test.ts`

**Interfaces:**
- Consumes: `DocsBundle` (Task 5), `CommandRunner`, `Commit`, `Summary`, `SummarySchema`, `SUMMARY_JSON_SCHEMA` (Task 1)
- Produces:
  - `PROMPT_VERSION = 1`
  - `interface SummaryContext { name: string; docs: DocsBundle; tree: string; commits: Commit[] }`
  - `computeSourceHash(input: { head: string | null; dirtyCount: number; docMtimes: number[] }): string`
  - `buildSummaryPrompt(ctx: SummaryContext): string`
  - `generateSummary(ctx: SummaryContext, run: CommandRunner, opts: { model: string; timeoutMs?: number }): Promise<Summary>` (실패 시 throw)

- [ ] **Step 1: 실패하는 테스트 작성** — `server/test/summary.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { Summary } from '@hub/shared';
import { buildSummaryPrompt, computeSourceHash, generateSummary, type SummaryContext } from '../src/collectors/summary';
import { fakeRunner } from './fakeRunner';

const ctx: SummaryContext = {
  name: 'movie-sniper',
  docs: { readme: '# Movie Sniper\n예매 감시', claudeMd: '규칙', manifests: { 'pyproject.toml': '[project]' }, docMtimes: [1] },
  tree: 'scripts/\n  server.py',
  commits: [{ hash: 'abc', subject: 'feat: 알림', at: '2026-10-01T10:00:00+09:00' }],
};

const summary: Summary = {
  oneLiner: '영화 예매 감시 봇',
  whatItIs: '예매 페이지를 감시합니다.',
  features: ['감시'],
  structure: [{ path: 'scripts/', role: '서버' }],
  currentState: '안정화',
  nextSteps: [],
  runSuggestion: { command: 'uv run python scripts/server.py --port 8010', cwd: '.', expectedPort: 8010 },
};

const claudeOk = (payload: unknown) =>
  fakeRunner((cmd) => (cmd === 'claude' ? { stdout: JSON.stringify(payload) } : undefined));

describe('computeSourceHash', () => {
  it('is stable and changes with inputs', () => {
    const a = computeSourceHash({ head: 'abc', dirtyCount: 0, docMtimes: [1, 2] });
    expect(computeSourceHash({ head: 'abc', dirtyCount: 0, docMtimes: [1, 2] })).toBe(a);
    expect(computeSourceHash({ head: 'abc', dirtyCount: 1, docMtimes: [1, 2] })).not.toBe(a);
    expect(computeSourceHash({ head: 'abd', dirtyCount: 0, docMtimes: [1, 2] })).not.toBe(a);
  });
});

describe('buildSummaryPrompt', () => {
  it('includes all sources and truncates huge docs', () => {
    const prompt = buildSummaryPrompt({ ...ctx, docs: { ...ctx.docs, readme: '가'.repeat(20_000) } });
    expect(prompt).toContain('"movie-sniper"');
    expect(prompt).toContain('scripts/\n  server.py');
    expect(prompt).toContain('2026-10-01 feat: 알림');
    expect(prompt).toContain('## CLAUDE.md\n규칙');
    expect(prompt).toContain('## pyproject.toml');
    expect(prompt).toContain('…(생략)');
    expect(prompt.length).toBeLessThan(15_000);
  });
});

describe('generateSummary', () => {
  it('passes the schema and prompt to claude and returns structured_output', async () => {
    const run = claudeOk({ is_error: false, result: '', structured_output: summary });
    expect(await generateSummary(ctx, run, { model: 'sonnet' })).toEqual(summary);
    const call = run.calls[0];
    expect(call.args).toEqual(expect.arrayContaining(['-p', '--output-format', 'json', '--model', 'sonnet', '--no-session-persistence']));
    expect(call.args[call.args.indexOf('--tools') + 1]).toBe('');
    expect(JSON.parse(call.args[call.args.indexOf('--json-schema') + 1]).required).toContain('oneLiner');
    expect(call.opts?.input).toContain('movie-sniper');
    expect(call.opts?.timeoutMs).toBe(90_000);
  });

  it('falls back to parsing the result string', async () => {
    const run = claudeOk({ is_error: false, result: JSON.stringify(summary) });
    expect((await generateSummary(ctx, run, { model: 'sonnet' })).oneLiner).toBe('영화 예매 감시 봇');
  });

  it('throws on is_error, non-JSON output, non-zero exit and schema mismatch', async () => {
    await expect(generateSummary(ctx, claudeOk({ is_error: true, result: 'quota' }), { model: 's' })).rejects.toThrow(/quota/);
    await expect(
      generateSummary(ctx, fakeRunner(() => ({ stdout: 'not json' })), { model: 's' }),
    ).rejects.toThrow(/JSON/);
    await expect(
      generateSummary(ctx, fakeRunner(() => ({ code: 1, stderr: 'boom' })), { model: 's' }),
    ).rejects.toThrow(/boom/);
    await expect(
      generateSummary(ctx, claudeOk({ is_error: false, structured_output: { oneLiner: '' } }), { model: 's' }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm -F @hub/server test summary`
Expected: FAIL — `../src/collectors/summary` 없음.

- [ ] **Step 3: 구현** — `server/src/collectors/summary.ts`

```ts
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { SUMMARY_JSON_SCHEMA, SummarySchema, type Commit, type Summary } from '@hub/shared';
import type { CommandRunner } from '../exec';
import type { DocsBundle } from './meta';

// 프롬프트를 바꾸면 올려서 기존 요약 캐시를 무효화한다.
export const PROMPT_VERSION = 1;

export interface SummaryContext {
  name: string;
  docs: DocsBundle;
  tree: string;
  commits: Commit[];
}

export function computeSourceHash(input: { head: string | null; dirtyCount: number; docMtimes: number[] }): string {
  return createHash('sha1').update(JSON.stringify({ v: PROMPT_VERSION, ...input })).digest('hex');
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n…(생략)` : text);

export function buildSummaryPrompt(ctx: SummaryContext): string {
  const sections: string[] = [
    `너는 개인 개발자의 프로젝트 대시보드에 들어갈 설명을 쓰는 도우미다.`,
    `아래 자료만 근거로 프로젝트 "${ctx.name}"을 설명하라. 추측하지 말고, 자료에 없는 내용은 비워 두거나 짧게 쓴다.`,
    `모든 문장은 한국어 평서문 존댓말(…합니다)로 쓴다.`,
    ``,
    `필드 지침:`,
    `- oneLiner: 목록에 표시할 40자 이내 한 줄. 무엇을 하는 프로젝트인지.`,
    `- whatItIs: 3~5문장. 어떤 문제를 풀고, 어떻게 동작하며(데이터 흐름·주요 구성), 다른 프로젝트나 외부 서비스와 어떤 관계인지.`,
    `- features: 주요 기능 3~6개, 각 25자 이내.`,
    `- structure: 주요 디렉토리·파일 3~6개와 역할.`,
    `- currentState: 2~3문장. 최근 커밋과 문서 기준으로 어디까지 진행됐는지.`,
    `- nextSteps: 다음 할 일 0~4개. 문서나 커밋에 근거가 있을 때만.`,
    `- runSuggestion: 로컬에서 띄워 쓰는 서버·웹앱·봇이면 {command, cwd(프로젝트 루트 기준 상대 경로, 루트면 "."), expectedPort(모르면 null)}.`,
    `  라이브러리, 일회성 스크립트 모음, 문서 저장소처럼 상시 실행할 대상이 없으면 null.`,
    `  패키지 매니저는 lock 파일 기준(pnpm-lock.yaml이면 pnpm, uv.lock이면 uv run, package-lock.json이면 npm).`,
    ``,
    `## 디렉토리 구조`,
    clip(ctx.tree || '(비어 있음)', 4000),
    ``,
    `## 최근 커밋`,
    ctx.commits.length ? ctx.commits.map((c) => `- ${c.at.slice(0, 10)} ${c.subject}`).join('\n') : '(커밋 없음)',
  ];
  if (ctx.docs.readme) sections.push('', '## README', clip(ctx.docs.readme, 6000));
  if (ctx.docs.claudeMd) sections.push('', '## CLAUDE.md', clip(ctx.docs.claudeMd, 4000));
  for (const [name, text] of Object.entries(ctx.docs.manifests)) sections.push('', `## ${name}`, clip(text, 1500));
  return sections.join('\n');
}

export async function generateSummary(
  ctx: SummaryContext,
  run: CommandRunner,
  opts: { model: string; timeoutMs?: number },
): Promise<Summary> {
  const r = await run(
    'claude',
    [
      '-p',
      '--output-format', 'json',
      '--model', opts.model,
      '--tools', '',
      '--no-session-persistence',
      '--json-schema', JSON.stringify(SUMMARY_JSON_SCHEMA),
    ],
    { input: buildSummaryPrompt(ctx), timeoutMs: opts.timeoutMs ?? 90_000, cwd: tmpdir() },
  );
  if (r.code !== 0) throw new Error(`claude 종료 코드 ${r.code}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);

  let payload: { is_error?: boolean; result?: unknown; structured_output?: unknown };
  try {
    payload = JSON.parse(r.stdout);
  } catch {
    throw new Error('claude 출력이 JSON이 아닙니다');
  }
  if (payload.is_error) throw new Error(`claude 오류: ${String(payload.result).slice(0, 300)}`);

  let raw = payload.structured_output;
  if (raw === undefined && typeof payload.result === 'string') {
    try {
      raw = JSON.parse(payload.result);
    } catch {
      throw new Error('claude 결과가 JSON이 아닙니다');
    }
  }
  return SummarySchema.parse(raw);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F @hub/server test summary`
Expected: 5 PASS.

- [ ] **Step 5: 커밋**

```bash
git add server/src/collectors/summary.ts server/test/summary.test.ts
git commit -m "feat(server): add claude summary collector"
```

---

### Task 8: 새로고침 오케스트레이션 (mapLimit, health, refresh)

**Files:**
- Create: `server/src/util/limit.ts`, `server/src/health.ts`, `server/src/refresh.ts`
- Test: `server/test/limit.test.ts`, `server/test/health.test.ts`, `server/test/refresh.test.ts`

**Interfaces:**
- Consumes: Task 2~7 전부 — `Db`, `CommandRunner`, `scanProjects`, `diffProjects`, `collectGit`, `collectMeta`, `DocsBundle`, `parseGithubRepo`, `collectGitHub`, `RateLimitError`, `computeSourceHash`, `generateSummary`
- Produces:
  - `mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>`
  - `checkHealth(run: CommandRunner): Promise<Health>`
  - `interface RefreshDeps { root: string; exclude: string[]; db: Db; run: CommandRunner; summaryModel: string; now?: () => Date }`
  - `runRefresh(deps: RefreshDeps, opts: { force?: boolean }, emit: (e: RefreshEvent) => void): Promise<void>`
  - `interface RefreshController { readonly running: boolean; start(opts?: { force?: boolean }): boolean; subscribe(fn: (e: RefreshEvent) => void): () => void }`
  - `class RefreshManager implements RefreshController` — 추가로 `whenIdle(): Promise<void>`

- [ ] **Step 1: 실패하는 테스트 작성**

`server/test/limit.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { mapLimit } from '../src/util/limit';

describe('mapLimit', () => {
  it('keeps order and never exceeds the limit', async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, n * 5));
      active--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });
  it('handles an empty list', async () => {
    expect(await mapLimit([], 3, async () => 1)).toEqual([]);
  });
});
```

`server/test/health.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { checkHealth } from '../src/health';
import { fakeRunner } from './fakeRunner';

describe('checkHealth', () => {
  it('reports everything available', async () => {
    const h = await checkHealth(fakeRunner(() => ({ code: 0 })));
    expect(h).toEqual({ gh: true, claude: true, lsof: true, messages: [] });
  });
  it('explains what is missing', async () => {
    const h = await checkHealth(fakeRunner((cmd) => ({ code: cmd === 'lsof' ? 0 : 1 })));
    expect(h).toMatchObject({ gh: false, claude: false, lsof: true });
    expect(h.messages).toHaveLength(2);
    expect(h.messages[0]).toContain('gh auth login');
  });
});
```

`server/test/refresh.test.ts`:
```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RefreshEvent, Summary } from '@hub/shared';
import { openDb } from '../src/db';
import { runCommand, type CommandRunner, type RunResult } from '../src/exec';
import { RefreshManager, runRefresh, type RefreshDeps } from '../src/refresh';
import { commit, git, makeRepo } from './gitFixture';

const SUMMARY: Summary = {
  oneLiner: '요약',
  whatItIs: '설명',
  features: [],
  structure: [],
  currentState: '',
  nextSteps: [],
  runSuggestion: null,
};
const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '' });

function testRunner(opts: { claude?: () => RunResult; ghLoggedIn?: boolean; delayMs?: number } = {}) {
  let summaryCalls = 0;
  const run: CommandRunner = async (cmd, args, o) => {
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (cmd === 'git') return runCommand(cmd, args, o);
    if (cmd === 'gh' && args[0] === 'auth') return { code: opts.ghLoggedIn === false ? 1 : 0, stdout: '', stderr: '' };
    if (cmd === 'gh' && args[0] === 'api') return ok(args[3].includes('actions/runs') ? '{"workflow_runs":[]}' : '[]');
    if (cmd === 'claude' && args[0] === '--version') return ok('2.1');
    if (cmd === 'claude') {
      summaryCalls++;
      return opts.claude ? opts.claude() : ok(JSON.stringify({ is_error: false, structured_output: SUMMARY }));
    }
    if (cmd === 'lsof') return ok('');
    return { code: 127, stdout: '', stderr: `unexpected ${cmd}` };
  };
  return { run, summaryCalls: () => summaryCalls };
}

async function makeRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'hub-root-'));
  const alpha = path.join(root, 'alpha');
  mkdirSync(alpha);
  await makeRepo(alpha);
  writeFileSync(path.join(alpha, 'README.md'), '알파 프로젝트입니다.');
  await commit(alpha, 'init');
  await git(alpha, 'remote', 'add', 'origin', 'git@github.com:me/alpha.git');
  mkdirSync(path.join(root, 'plain'));
  writeFileSync(path.join(root, 'plain', 'README.md'), '평범한 폴더입니다.');
  return root;
}

async function refreshOnce(deps: RefreshDeps, force = false) {
  const events: RefreshEvent[] = [];
  await runRefresh(deps, { force }, (e) => events.push(e));
  return events;
}

describe('runRefresh', () => {
  it('collects every stage and emits progress', async () => {
    const root = await makeRoot();
    const db = openDb(':memory:');
    const { run } = testRunner();
    const events = await refreshOnce({ root, exclude: [], db, run, summaryModel: 'sonnet' });

    const alpha = db.getProject('alpha')!;
    expect(alpha).toMatchObject({ isGit: true, githubRepo: 'me/alpha', readmeExcerpt: '알파 프로젝트입니다.', errors: {} });
    expect(alpha.github?.ci.status).toBe('none');
    const plain = db.getProject('plain')!;
    expect(plain).toMatchObject({ isGit: false, git: null, githubRepo: null, github: null });
    expect(db.getSummary('alpha')?.content.oneLiner).toBe('요약');
    expect(db.getSummary('plain')?.content.oneLiner).toBe('요약');
    expect(db.getMeta('lastRefreshAt')).not.toBeNull();

    expect(events[0]).toEqual({ type: 'started', total: 6 });
    const progress = events.filter((e) => e.type === 'project-updated');
    expect(progress).toHaveLength(6);
    expect(progress.map((e) => (e.type === 'project-updated' ? e.done : 0))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('removes projects whose folder disappeared', async () => {
    const root = await makeRoot();
    const db = openDb(':memory:');
    const { run } = testRunner();
    await refreshOnce({ root, exclude: [], db, run, summaryModel: 's' });
    rmSync(path.join(root, 'plain'), { recursive: true });
    const events = await refreshOnce({ root, exclude: [], db, run, summaryModel: 's' });
    expect(events).toContainEqual({ type: 'project-removed', name: 'plain' });
    expect(db.getProject('plain')).toBeNull();
    expect(db.getSummary('plain')).toBeNull();
  });

  it('reuses cached summaries unless forced', async () => {
    const root = await makeRoot();
    const db = openDb(':memory:');
    const t = testRunner();
    const deps = { root, exclude: [], db, run: t.run, summaryModel: 's' };
    await refreshOnce(deps);
    expect(t.summaryCalls()).toBe(2);
    await refreshOnce(deps);
    expect(t.summaryCalls()).toBe(2);
    await refreshOnce(deps, true);
    expect(t.summaryCalls()).toBe(4);
  });

  it('keeps the previous summary and records the error when claude fails', async () => {
    const root = await makeRoot();
    const db = openDb(':memory:');
    await refreshOnce({ root, exclude: [], db, run: testRunner().run, summaryModel: 's' });
    const failing = testRunner({ claude: () => ({ code: 0, stdout: 'not json', stderr: '' }) });
    const events = await refreshOnce({ root, exclude: [], db, run: failing.run, summaryModel: 's' }, true);
    expect(db.getSummary('alpha')?.content.oneLiner).toBe('요약');
    expect(db.getProject('alpha')?.errors.summary).toContain('JSON');
    expect(events.at(-1)?.type).toBe('done');

    await refreshOnce({ root, exclude: [], db, run: testRunner().run, summaryModel: 's' }, true);
    expect(db.getProject('alpha')?.errors.summary).toBeUndefined();
  });

  it('skips GitHub when gh is not logged in', async () => {
    const root = await makeRoot();
    const db = openDb(':memory:');
    const events = await refreshOnce({ root, exclude: [], db, run: testRunner({ ghLoggedIn: false }).run, summaryModel: 's' });
    expect(db.getProject('alpha')?.github).toBeNull();
    const gh = events.filter((e) => e.type === 'project-updated' && e.step === 'github');
    expect(gh.every((e) => e.type === 'project-updated' && e.skipped)).toBe(true);
  });
});

describe('RefreshManager', () => {
  it('refuses a second start while running and notifies subscribers', async () => {
    const root = await makeRoot();
    const db = openDb(':memory:');
    const mgr = new RefreshManager({ root, exclude: [], db, run: testRunner({ delayMs: 20 }).run, summaryModel: 's' });
    const events: RefreshEvent[] = [];
    mgr.subscribe((e) => events.push(e));
    expect(mgr.start()).toBe(true);
    expect(mgr.running).toBe(true);
    expect(mgr.start()).toBe(false);
    await mgr.whenIdle();
    expect(mgr.running).toBe(false);
    expect(events[0]).toEqual({ type: 'state', running: true });
    expect(events.at(-1)).toEqual({ type: 'state', running: false });
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm -F @hub/server test limit health refresh`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: `server/src/util/limit.ts` 구현**

```ts
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
```

- [ ] **Step 4: `server/src/health.ts` 구현**

```ts
import type { Health } from '@hub/shared';
import type { CommandRunner } from './exec';

export async function checkHealth(run: CommandRunner): Promise<Health> {
  const [gh, claude, lsof] = await Promise.all([
    run('gh', ['auth', 'status', '--hostname', 'github.com'], { timeoutMs: 10_000 }),
    run('claude', ['--version'], { timeoutMs: 10_000 }),
    run('lsof', ['-p', String(process.pid)], { timeoutMs: 5_000 }),
  ]);
  const health: Health = { gh: gh.code === 0, claude: claude.code === 0, lsof: lsof.code === 0, messages: [] };
  if (!health.gh)
    health.messages.push('GitHub CLI가 github.com에 로그인되어 있지 않아 이슈·PR·CI를 건너뜁니다. `gh auth login --hostname github.com`을 실행하세요.');
  if (!health.claude) health.messages.push('claude CLI를 찾을 수 없어 프로젝트 요약을 건너뜁니다.');
  if (!health.lsof) health.messages.push('lsof를 실행할 수 없어 실행 상태를 감지하지 못합니다.');
  return health;
}
```

- [ ] **Step 5: `server/src/refresh.ts` 구현**

```ts
import type { ProjectErrors, RefreshEvent, RefreshStep, StoredProject } from '@hub/shared';
import { collectGitHub, parseGithubRepo, RateLimitError } from './collectors/github';
import { collectGit, type GitCollectResult } from './collectors/git';
import { collectMeta, type DocsBundle } from './collectors/meta';
import { computeSourceHash, generateSummary } from './collectors/summary';
import type { Db } from './db';
import type { CommandRunner } from './exec';
import { checkHealth } from './health';
import { diffProjects, scanProjects } from './scanner';
import { mapLimit } from './util/limit';

export interface RefreshDeps {
  root: string;
  exclude: string[];
  db: Db;
  run: CommandRunner;
  summaryModel: string;
  now?: () => Date;
}

export interface RefreshController {
  readonly running: boolean;
  start(opts?: { force?: boolean }): boolean;
  subscribe(fn: (e: RefreshEvent) => void): () => void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

export async function runRefresh(deps: RefreshDeps, opts: { force?: boolean }, emit: (e: RefreshEvent) => void) {
  const { db, run } = deps;
  const now = deps.now ?? (() => new Date());
  const startedAt = Date.now();

  const [health, found] = await Promise.all([checkHealth(run), scanProjects(deps.root, deps.exclude)]);
  const { removed } = diffProjects(
    db.listProjects().map((p) => p.name),
    found.map((f) => f.name),
  );
  for (const name of removed) {
    db.deleteProject(name);
    emit({ type: 'project-removed', name });
  }

  const total = found.length * 3;
  let done = 0;
  emit({ type: 'started', total });
  const progress = (name: string, step: RefreshStep, skipped: boolean) =>
    emit({ type: 'project-updated', name, step, skipped, done: ++done, total });

  // 1단계: git + meta (로컬)
  const local = new Map<string, { docs: DocsBundle; tree: string; git: GitCollectResult | null }>();
  await mapLimit(found, 8, async (f) => {
    const prev = db.getProject(f.name);
    const errors: ProjectErrors = { ...(prev?.errors ?? {}) };
    let gitRes: GitCollectResult | null = null;
    try {
      gitRes = await collectGit(f.path, run, now());
      delete errors.git;
    } catch (e) {
      errors.git = message(e);
    }
    let meta: Awaited<ReturnType<typeof collectMeta>> | null = null;
    try {
      meta = await collectMeta(f.path);
      delete errors.meta;
    } catch (e) {
      errors.meta = message(e);
    }
    const githubRepo = parseGithubRepo(gitRes?.remoteUrl ?? null);
    const project: StoredProject = {
      name: f.name,
      path: f.path,
      isGit: gitRes !== null,
      remoteUrl: gitRes?.remoteUrl ?? null,
      githubRepo,
      stack: meta?.stack ?? prev?.stack ?? [],
      readmeExcerpt: meta?.readmeExcerpt ?? prev?.readmeExcerpt ?? null,
      git: gitRes?.git ?? null,
      github: githubRepo && prev?.githubRepo === githubRepo ? prev.github : null,
      errors,
      updatedAt: now().toISOString(),
    };
    db.upsertProject(project);
    if (meta) local.set(f.name, { docs: meta.docs, tree: meta.tree, git: gitRes });
    progress(f.name, 'local', false);
  });

  // 2단계: GitHub
  let rateLimited = false;
  await mapLimit(found, 4, async (f) => {
    const p = db.getProject(f.name);
    if (!p?.githubRepo || !health.gh || rateLimited) {
      progress(f.name, 'github', true);
      return;
    }
    try {
      p.github = await collectGitHub(p.githubRepo, run, now());
      delete p.errors.github;
    } catch (e) {
      if (e instanceof RateLimitError) rateLimited = true;
      p.errors.github = message(e);
    }
    db.upsertProject(p);
    progress(f.name, 'github', false);
  });

  // 3단계: Claude 요약 (변경된 프로젝트만)
  await mapLimit(found, 2, async (f) => {
    const p = db.getProject(f.name);
    const ctx = local.get(f.name);
    if (!p || !ctx || !health.claude) {
      progress(f.name, 'summary', true);
      return;
    }
    const hash = computeSourceHash({
      head: p.git?.recentCommits[0]?.hash ?? null,
      dirtyCount: p.git?.dirtyCount ?? 0,
      docMtimes: ctx.docs.docMtimes,
    });
    if (!opts.force && db.getSummary(f.name)?.sourceHash === hash) {
      progress(f.name, 'summary', true);
      return;
    }
    try {
      const summary = await generateSummary(
        { name: f.name, docs: ctx.docs, tree: ctx.tree, commits: p.git?.recentCommits ?? [] },
        run,
        { model: deps.summaryModel },
      );
      db.putSummary(f.name, hash, summary);
      delete p.errors.summary;
    } catch (e) {
      p.errors.summary = message(e);
    }
    db.upsertProject(p);
    progress(f.name, 'summary', false);
  });

  db.setMeta('lastRefreshAt', now().toISOString());
  emit({ type: 'done', durationMs: Date.now() - startedAt });
}

export class RefreshManager implements RefreshController {
  private listeners = new Set<(e: RefreshEvent) => void>();
  private current: Promise<void> | null = null;

  constructor(private deps: RefreshDeps) {}

  get running(): boolean {
    return this.current !== null;
  }

  subscribe(fn: (e: RefreshEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  start(opts: { force?: boolean } = {}): boolean {
    if (this.current) return false;
    const emit = (e: RefreshEvent) => this.listeners.forEach((fn) => fn(e));
    this.current = runRefresh(this.deps, opts, emit)
      .catch((e) => emit({ type: 'error', message: message(e) }))
      .finally(() => {
        this.current = null;
        emit({ type: 'state', running: false });
      });
    emit({ type: 'state', running: true });
    return true;
  }

  whenIdle(): Promise<void> {
    return this.current ?? Promise.resolve();
  }
}
```

주의: `start()`는 `runRefresh`를 먼저 호출한 뒤 `state{running:true}`를 보낸다. `runRefresh`의 첫 `await` 이전에는 동기적으로 emit하는 코드가 없으므로 구독자는 항상 `state(true)`를 `started`보다 먼저 받는다.

- [ ] **Step 6: 테스트 통과 확인**

Run: `pnpm -F @hub/server test limit health refresh`
Expected: limit 2, health 2, refresh 6 PASS.

- [ ] **Step 7: 커밋**

```bash
git add server/src/util server/src/health.ts server/src/refresh.ts server/test/limit.test.ts server/test/health.test.ts server/test/refresh.test.ts
git commit -m "feat(server): add refresh orchestration"
```

---
### Task 9: 실행 상태 감지

**Files:**
- Create: `server/src/runtime/detect.ts`
- Test: `server/test/detect.test.ts`

**Interfaces:**
- Consumes: `CommandRunner`, `fakeRunner`, `RuntimeProcess`, `RuntimeSnapshot`
- Produces:
  - `isExcludedCommand(name: string): boolean`
  - `parseLsofCwd(out: string): Map<number, { name: string; cwd: string }>`
  - `parseLsofListen(out: string): Map<number, number[]>`
  - `parsePs(out: string): Map<number, { pgid: number; args: string }>`
  - `matchProject(cwd: string, projects: { name: string; path: string }[]): string | null` (가장 긴 경로 우선)
  - `interface DetectInput { projects: { name: string; path: string }[]; launchedPgids: Set<number> }`
  - `detectRuntime(input: DetectInput, run: CommandRunner): Promise<RuntimeSnapshot>` (프로젝트당 pgid별로 프로세스 하나)
  - `class RuntimeCache { constructor(load: () => Promise<RuntimeSnapshot>, ttlMs?: number, clock?: () => number); get(): Promise<RuntimeSnapshot>; invalidate(): void }`

경로 주의: lsof는 cwd를 실제 경로(`/private/var/...`)로 보고하므로 `projects[].path`는 반드시 `realpath`된 경로여야 한다. main(Task 12)에서 `HUB_ROOT`를 `realpathSync`한다.

- [ ] **Step 1: 실패하는 테스트 작성** — `server/test/detect.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { RuntimeSnapshot } from '@hub/shared';
import {
  RuntimeCache,
  detectRuntime,
  isExcludedCommand,
  matchProject,
  parseLsofCwd,
  parseLsofListen,
  parsePs,
} from '../src/runtime/detect';
import { fakeRunner } from './fakeRunner';

const CWD_OUT = [
  'p100', 'cnode', 'fcwd', 'n/root/alpha/web',
  'p101', 'czsh', 'fcwd', 'n/root/alpha',
  'p102', 'cPython', 'fcwd', 'n/root/beta',
  'p103', 'cnode', 'fcwd', 'n/elsewhere',
  'p104', 'cuv', 'fcwd', 'n/root/beta',
  'p105', 'cCode Helper (Plugin)', 'fcwd', 'n/root/alpha',
  'p106', 'ctelegram-bot', 'fcwd', 'n/root/gamma',
].join('\n');
const LISTEN_OUT = ['p100', 'f20', 'n*:5173', 'f21', 'n[::1]:5173', 'p102', 'f7', 'n127.0.0.1:8000', 'p999', 'f3', 'n*:22'].join('\n');
const PS_OUT = [
  '  100   100 node /root/alpha/web/node_modules/.bin/vite',
  '  102   104 /root/beta/.venv/bin/python -m uvicorn app:app',
  '  104   104 uv run uvicorn app:app',
  '  106   106 python bot.py',
].join('\n');

const PROJECTS = [
  { name: 'alpha', path: '/root/alpha' },
  { name: 'beta', path: '/root/beta' },
  { name: 'gamma', path: '/root/gamma' },
];

describe('parsers', () => {
  it('parses lsof cwd records', () => {
    const m = parseLsofCwd(CWD_OUT);
    expect(m.get(100)).toEqual({ name: 'node', cwd: '/root/alpha/web' });
    expect(m.get(105)?.name).toBe('Code Helper (Plugin)');
  });
  it('parses listening ports and dedupes them', () => {
    const m = parseLsofListen(LISTEN_OUT);
    expect(m.get(100)).toEqual([5173]);
    expect(m.get(102)).toEqual([8000]);
  });
  it('parses ps output', () => {
    expect(parsePs(PS_OUT).get(102)).toEqual({ pgid: 104, args: '/root/beta/.venv/bin/python -m uvicorn app:app' });
  });
  it('excludes shells, editors and tools', () => {
    for (const n of ['zsh', '-zsh', 'Code Helper (Plugin)', 'claude', 'git', 'tail']) expect(isExcludedCommand(n)).toBe(true);
    for (const n of ['node', 'Python', 'uv']) expect(isExcludedCommand(n)).toBe(false);
  });
  it('matches the longest project path and respects path boundaries', () => {
    const ps = [
      { name: 'alpha', path: '/root/alpha' },
      { name: 'alpha-2', path: '/root/alpha-2' },
    ];
    expect(matchProject('/root/alpha-2/src', ps)).toBe('alpha-2');
    expect(matchProject('/root/alpha', ps)).toBe('alpha');
    expect(matchProject('/root/alphabet', ps)).toBeNull();
  });
});

describe('detectRuntime', () => {
  it('groups project processes by process group and attaches ports', async () => {
    const run = fakeRunner((cmd, args) => {
      if (cmd === 'lsof' && args.includes('cwd')) return { stdout: CWD_OUT };
      if (cmd === 'lsof') return { stdout: LISTEN_OUT };
      if (cmd === 'ps') return { stdout: PS_OUT };
      return undefined;
    });
    const snap = await detectRuntime({ projects: PROJECTS, launchedPgids: new Set([104]) }, run);
    expect(snap.byProject.alpha).toEqual([
      { pid: 100, pgid: 100, command: 'node /root/alpha/web/node_modules/.bin/vite', cwd: '/root/alpha/web', ports: [5173], launchedByHub: false },
    ]);
    expect(snap.byProject.beta).toEqual([
      { pid: 104, pgid: 104, command: 'uv run uvicorn app:app', cwd: '/root/beta', ports: [8000], launchedByHub: true },
    ]);
    expect(snap.byProject.gamma).toEqual([
      { pid: 106, pgid: 106, command: 'python bot.py', cwd: '/root/gamma', ports: [], launchedByHub: false },
    ]);
    const psCall = run.calls.find((c) => c.cmd === 'ps');
    expect(psCall?.args.at(-1)?.split(',').map(Number).sort()).toEqual([100, 102, 104, 106]);
  });

  it('returns an empty snapshot when no project process runs', async () => {
    const run = fakeRunner((cmd) => (cmd === 'lsof' ? { stdout: 'p1\ncnode\nfcwd\nn/elsewhere' } : undefined));
    expect((await detectRuntime({ projects: PROJECTS, launchedPgids: new Set() }, run)).byProject).toEqual({});
  });

  it('throws when lsof produces nothing and fails', async () => {
    const run = fakeRunner(() => ({ code: 1, stderr: 'lsof: boom' }));
    await expect(detectRuntime({ projects: PROJECTS, launchedPgids: new Set() }, run)).rejects.toThrow(/lsof/);
  });
});

describe('RuntimeCache', () => {
  it('caches within the TTL, dedupes concurrent loads and supports invalidate', async () => {
    let now = 0;
    let loads = 0;
    const snap: RuntimeSnapshot = { at: 't', byProject: {} };
    const cache = new RuntimeCache(async () => (loads++, snap), 3000, () => now);
    await Promise.all([cache.get(), cache.get()]);
    expect(loads).toBe(1);
    now = 2000;
    await cache.get();
    expect(loads).toBe(1);
    now = 3500;
    await cache.get();
    expect(loads).toBe(2);
    cache.invalidate();
    await cache.get();
    expect(loads).toBe(3);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm -F @hub/server test detect`
Expected: FAIL — `../src/runtime/detect` 없음.

- [ ] **Step 3: 구현** — `server/src/runtime/detect.ts`

```ts
import { userInfo } from 'node:os';
import path from 'node:path';
import type { RuntimeProcess, RuntimeSnapshot } from '@hub/shared';
import type { CommandRunner } from '../exec';

const EXCLUDED = new Set([
  'zsh', 'bash', 'sh', 'fish', 'login', 'tmux', 'tmux: server', 'screen', 'vim', 'nvim', 'vi', 'emacs',
  'claude', 'git', 'lsof', 'ssh', 'less', 'more', 'man', 'top', 'htop', 'ps', 'sudo', 'tail', 'watch', 'code', 'cursor',
]);

export function isExcludedCommand(name: string): boolean {
  const n = name.toLowerCase().replace(/^-/, '');
  return EXCLUDED.has(n) || n.startsWith('code helper') || n.startsWith('cursor helper') || n.startsWith('electron');
}

function parseRecords(out: string, onField: (pid: number, tag: string, value: string) => void) {
  let pid = -1;
  for (const line of out.split('\n')) {
    if (!line) continue;
    const tag = line[0];
    const value = line.slice(1);
    if (tag === 'p') pid = Number(value);
    else if (pid > 0) onField(pid, tag, value);
  }
}

export function parseLsofCwd(out: string): Map<number, { name: string; cwd: string }> {
  const m = new Map<number, { name: string; cwd: string }>();
  parseRecords(out, (pid, tag, value) => {
    const entry = m.get(pid) ?? { name: '', cwd: '' };
    if (tag === 'c') entry.name = value;
    if (tag === 'n') entry.cwd = value;
    m.set(pid, entry);
  });
  return m;
}

export function parseLsofListen(out: string): Map<number, number[]> {
  const m = new Map<number, number[]>();
  parseRecords(out, (pid, tag, value) => {
    if (tag !== 'n') return;
    const port = Number(value.slice(value.lastIndexOf(':') + 1));
    if (!Number.isInteger(port)) return;
    const ports = m.get(pid) ?? [];
    if (!ports.includes(port)) ports.push(port);
    m.set(pid, ports.sort((a, b) => a - b));
  });
  return m;
}

export function parsePs(out: string): Map<number, { pgid: number; args: string }> {
  const m = new Map<number, { pgid: number; args: string }>();
  for (const line of out.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (match) m.set(Number(match[1]), { pgid: Number(match[2]), args: match[3] });
  }
  return m;
}

export function matchProject(cwd: string, projects: { name: string; path: string }[]): string | null {
  let best: { name: string; len: number } | null = null;
  for (const p of projects) {
    if ((cwd === p.path || cwd.startsWith(p.path + path.sep)) && (!best || p.path.length > best.len)) {
      best = { name: p.name, len: p.path.length };
    }
  }
  return best?.name ?? null;
}

export interface DetectInput {
  projects: { name: string; path: string }[];
  launchedPgids: Set<number>;
}

export async function detectRuntime(input: DetectInput, run: CommandRunner): Promise<RuntimeSnapshot> {
  const user = process.env.USER ?? userInfo().username;
  const [cwdR, listenR] = await Promise.all([
    run('lsof', ['+c', '0', '-a', '-d', 'cwd', '-u', user, '-Fpcn'], { timeoutMs: 5_000 }),
    run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'], { timeoutMs: 5_000 }),
  ]);
  // lsof는 일부 항목을 못 읽어도 exit 1을 내므로, 출력이 전혀 없을 때만 실패로 본다.
  if (!cwdR.stdout && cwdR.code !== 0) throw new Error(`lsof 실패: ${cwdR.stderr.trim()}`);

  const cwds = parseLsofCwd(cwdR.stdout);
  const listen = parseLsofListen(listenR.stdout);
  const candidates: { pid: number; project: string; cwd: string }[] = [];
  for (const [pid, { name, cwd }] of cwds) {
    if (isExcludedCommand(name)) continue;
    const project = matchProject(cwd, input.projects);
    if (project) candidates.push({ pid, project, cwd });
  }
  const snapshot: RuntimeSnapshot = { at: new Date().toISOString(), byProject: {} };
  if (candidates.length === 0) return snapshot;

  const psR = await run('ps', ['-o', 'pid=,pgid=,args=', '-p', candidates.map((c) => c.pid).join(',')], { timeoutMs: 5_000 });
  const ps = parsePs(psR.stdout);

  const groups = new Map<string, { project: string; members: { pid: number; cwd: string }[]; pgid: number }>();
  for (const c of candidates) {
    const info = ps.get(c.pid);
    if (!info) continue; // 그 사이 종료됨
    const key = `${c.project}:${info.pgid}`;
    const g = groups.get(key) ?? { project: c.project, members: [], pgid: info.pgid };
    g.members.push({ pid: c.pid, cwd: c.cwd });
    groups.set(key, g);
  }

  for (const g of groups.values()) {
    const leader = g.members.find((m) => m.pid === g.pgid) ?? [...g.members].sort((a, b) => a.pid - b.pid)[0];
    const ports = [...new Set(g.members.flatMap((m) => listen.get(m.pid) ?? []))].sort((a, b) => a - b);
    const proc: RuntimeProcess = {
      pid: leader.pid,
      pgid: g.pgid,
      command: (ps.get(leader.pid)?.args ?? '').slice(0, 200),
      cwd: leader.cwd,
      ports,
      launchedByHub: input.launchedPgids.has(g.pgid),
    };
    (snapshot.byProject[g.project] ??= []).push(proc);
  }
  for (const list of Object.values(snapshot.byProject)) list.sort((a, b) => a.pid - b.pid);
  return snapshot;
}

export class RuntimeCache {
  private value: RuntimeSnapshot | null = null;
  private loadedAt = 0;
  private inflight: Promise<RuntimeSnapshot> | null = null;

  constructor(
    private load: () => Promise<RuntimeSnapshot>,
    private ttlMs = 3_000,
    private clock: () => number = Date.now,
  ) {}

  get(): Promise<RuntimeSnapshot> {
    if (this.value && this.clock() - this.loadedAt < this.ttlMs) return Promise.resolve(this.value);
    this.inflight ??= this.load()
      .then((v) => {
        this.value = v;
        this.loadedAt = this.clock();
        return v;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  invalidate(): void {
    this.value = null;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F @hub/server test detect`
Expected: 9 PASS.

- [ ] **Step 5: 커밋**

```bash
git add server/src/runtime/detect.ts server/test/detect.test.ts
git commit -m "feat(server): add runtime process detection"
```

---

### Task 10: 실행/중지 런처

**Files:**
- Create: `server/src/runtime/launcher.ts`
- Test: `server/test/launcher.test.ts`

**Interfaces:**
- Consumes: `Db`, `LaunchRecord` (Task 2), `RuntimeCache`, `detectRuntime` (Task 9), `CommandRunner`, `RunSuggestion`, `StartResult`
- Produces:
  - `logPathFor(logsDir: string, name: string): string`
  - `interface LauncherDeps { db: Db; logsDir: string; runtime: RuntimeCache; run: CommandRunner }`
  - `interface StartOptions { waitMs?: number; pollMs?: number }` (기본 30000 / 1000)
  - `startProject(deps: LauncherDeps, project: { name: string; path: string }, cfg: RunSuggestion, opts?: StartOptions): Promise<StartResult>`
  - `stopProcess(target: { pid: number; group: boolean }, opts?: { graceMs?: number; pollMs?: number }): Promise<'stopped' | 'killed' | 'not-running'>`
  - `isAlive(id: number): boolean` (음수면 프로세스 그룹)
  - `readLogTail(file: string, lines: number): Promise<string>`
  - `cleanupLaunches(db: Db): void`

- [ ] **Step 1: 실패하는 테스트 작성** — `server/test/launcher.test.ts`

이 테스트는 실제 `zsh`, `node`, `lsof`로 프로세스를 띄운다.

```ts
import { mkdtempSync, realpathSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db';
import { runCommand } from '../src/exec';
import { RuntimeCache, detectRuntime } from '../src/runtime/detect';
import { cleanupLaunches, isAlive, startProject, stopProcess, type LauncherDeps } from '../src/runtime/launcher';

const toStop: number[] = [];
afterEach(async () => {
  for (const pgid of toStop.splice(0)) await stopProcess({ pid: pgid, group: true }, { graceMs: 500 });
});

function setup() {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'hub-launch-')));
  const project = { name: 'demo', path: dir };
  const db = openDb(':memory:');
  const runtime = new RuntimeCache(
    () => detectRuntime({ projects: [project], launchedPgids: new Set(db.listLaunches().map((l) => l.pgid)) }, runCommand),
    0,
  );
  const deps: LauncherDeps = { db, logsDir: path.join(dir, '.logs'), runtime, run: runCommand };
  return { project, db, deps };
}

const SERVER = `node -e "require('http').createServer((q,s)=>s.end('ok')).listen(0,'127.0.0.1',()=>console.log('listening'))"`;

describe('startProject', () => {
  it('starts a server, detects its port, then stops the group', async () => {
    const { project, db, deps } = setup();
    const result = await startProject(deps, project, { command: SERVER, cwd: '.', expectedPort: null }, { pollMs: 300 });
    expect(result.status).toBe('running');
    if (result.status !== 'running') return;
    const proc = result.processes[0];
    toStop.push(proc.pgid);
    expect(proc.launchedByHub).toBe(true);
    expect(db.getLaunch('demo')?.pgid).toBe(proc.pgid);
    const res = await fetch(`http://127.0.0.1:${proc.ports[0]}`);
    expect(await res.text()).toBe('ok');

    expect(await stopProcess({ pid: proc.pgid, group: true })).toBe('stopped');
    expect(isAlive(-proc.pgid)).toBe(false);
  });

  it('fails fast with the log tail when the command exits', async () => {
    const { project, db, deps } = setup();
    const started = Date.now();
    const result = await startProject(deps, project, { command: 'echo boom; exit 3', cwd: '.', expectedPort: null }, { pollMs: 200 });
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.logTail).toContain('boom');
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(db.getLaunch('demo')).toBeNull();
  });

  it('fails when the working directory does not exist', async () => {
    const { project, deps } = setup();
    const result = await startProject(deps, project, { command: 'true', cwd: 'nope', expectedPort: null });
    expect(result).toMatchObject({ status: 'failed' });
    if (result.status === 'failed') expect(result.logTail).toContain('nope');
  });

  it('reports a port conflict before launching', async () => {
    const { project, deps } = setup();
    const server: Server = createServer().listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const port = (server.address() as AddressInfo).port;
    try {
      const result = await startProject(deps, project, { command: SERVER, cwd: '.', expectedPort: port });
      expect(result).toMatchObject({ status: 'port-conflict', port, holder: { pid: process.pid, project: null } });
    } finally {
      server.close();
    }
  });

  it('returns running-no-port for long-running processes without a port', async () => {
    const { project, deps } = setup();
    const result = await startProject(deps, project, { command: 'sleep 30', cwd: '.', expectedPort: null }, { waitMs: 1500, pollMs: 300 });
    expect(result.status).toBe('running-no-port');
    if (result.status === 'running-no-port') toStop.push(result.processes[0].pgid);
  });
});

describe('stopProcess', () => {
  it('escalates to SIGKILL when SIGTERM is ignored', async () => {
    const { project, deps } = setup();
    const result = await startProject(
      deps,
      project,
      { command: "trap '' TERM; sleep 30", cwd: '.', expectedPort: null },
      { waitMs: 1000, pollMs: 300 },
    );
    if (result.status !== 'running-no-port') throw new Error(`unexpected ${result.status}`);
    const pgid = result.processes[0].pgid;
    expect(await stopProcess({ pid: pgid, group: true }, { graceMs: 500 })).toBe('killed');
    expect(isAlive(-pgid)).toBe(false);
  });

  it('returns not-running for dead processes', async () => {
    expect(await stopProcess({ pid: 999_999, group: false })).toBe('not-running');
  });
});

describe('cleanupLaunches', () => {
  it('removes records of dead process groups', () => {
    const db = openDb(':memory:');
    db.putLaunch({ name: 'dead', pid: 999_999, pgid: 999_999, command: 'x', startedAt: 't', logPath: '/x' });
    cleanupLaunches(db);
    expect(db.listLaunches()).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm -F @hub/server test launcher`
Expected: FAIL — `../src/runtime/launcher` 없음.

- [ ] **Step 3: 구현** — `server/src/runtime/launcher.ts`

```ts
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { RunSuggestion, RuntimeProcess, StartResult } from '@hub/shared';
import type { Db } from '../db';
import type { CommandRunner } from '../exec';
import { parseLsofCwd, type RuntimeCache } from './detect';

export interface LauncherDeps {
  db: Db;
  logsDir: string;
  runtime: RuntimeCache;
  run: CommandRunner;
}
export interface StartOptions {
  waitMs?: number;
  pollMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function logPathFor(logsDir: string, name: string): string {
  return path.join(logsDir, `${name.replace(/[^\w.-]+/g, '_')}.log`);
}

export function isAlive(id: number): boolean {
  try {
    process.kill(id, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export async function readLogTail(file: string, lines: number): Promise<string> {
  try {
    return (await readFile(file, 'utf8')).split('\n').slice(-lines).join('\n');
  } catch {
    return '';
  }
}

async function findPortHolder(run: CommandRunner, port: number): Promise<{ pid: number; command: string; cwd: string } | null> {
  const r = await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'], { timeoutMs: 5_000 });
  const first = [...parseLsofCwd(r.stdout).entries()][0];
  if (!first) return null;
  const [pid, { name }] = first;
  const cwdR = await run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { timeoutMs: 5_000 });
  const cwd = parseLsofCwd(cwdR.stdout).get(pid)?.cwd ?? '';
  return { pid, command: name, cwd };
}

export async function startProject(
  deps: LauncherDeps,
  project: { name: string; path: string },
  cfg: RunSuggestion,
  opts: StartOptions = {},
): Promise<StartResult> {
  const waitMs = opts.waitMs ?? 30_000;
  const pollMs = opts.pollMs ?? 1_000;
  const cwd = path.resolve(project.path, cfg.cwd);
  if (!existsSync(cwd)) return { status: 'failed', logTail: `작업 디렉토리가 없습니다: ${cwd}` };

  if (cfg.expectedPort) {
    const holder = await findPortHolder(deps.run, cfg.expectedPort);
    if (holder) {
      const snap = await deps.runtime.get();
      const owner = Object.entries(snap.byProject).find(([, procs]) =>
        procs.some((p) => p.pid === holder.pid || p.pgid === holder.pid),
      );
      return {
        status: 'port-conflict',
        port: cfg.expectedPort,
        holder: { project: owner?.[0] ?? null, pid: holder.pid, command: holder.command },
      };
    }
  }

  mkdirSync(deps.logsDir, { recursive: true });
  const logPath = logPathFor(deps.logsDir, project.name);
  const fd = openSync(logPath, 'w');
  writeSync(fd, `[project-hub] ${new Date().toISOString()} $ ${cfg.command}\n`);
  const child = spawn('zsh', ['-lc', cfg.command], { cwd, detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  child.on('error', () => {});
  child.unref();
  const pgid = child.pid;
  if (!pgid) return { status: 'failed', logTail: await readLogTail(logPath, 30) };

  deps.db.putLaunch({ name: project.name, pid: pgid, pgid, command: cfg.command, startedAt: new Date().toISOString(), logPath });

  const deadline = Date.now() + waitMs;
  let procs: RuntimeProcess[] = [];
  while (Date.now() < deadline) {
    await sleep(pollMs);
    if (!isAlive(-pgid)) {
      deps.db.deleteLaunch(project.name);
      deps.runtime.invalidate();
      return { status: 'failed', logTail: await readLogTail(logPath, 30) };
    }
    deps.runtime.invalidate();
    procs = ((await deps.runtime.get()).byProject[project.name] ?? []).filter((p) => p.pgid === pgid);
    if (procs.some((p) => p.ports.length > 0)) return { status: 'running', processes: procs };
  }
  return { status: 'running-no-port', processes: procs };
}

export async function stopProcess(
  target: { pid: number; group: boolean },
  opts: { graceMs?: number; pollMs?: number } = {},
): Promise<'stopped' | 'killed' | 'not-running'> {
  const id = target.group ? -target.pid : target.pid;
  const graceMs = opts.graceMs ?? 5_000;
  const pollMs = opts.pollMs ?? 100;
  if (!isAlive(id)) return 'not-running';
  try {
    process.kill(id, 'SIGTERM');
  } catch {
    return 'not-running';
  }
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    if (!isAlive(id)) return 'stopped';
  }
  try {
    process.kill(id, 'SIGKILL');
  } catch {
    return 'stopped';
  }
  for (let i = 0; i < 20 && isAlive(id); i++) await sleep(50);
  return 'killed';
}

export function cleanupLaunches(db: Db): void {
  for (const l of db.listLaunches()) if (!isAlive(-l.pgid)) db.deleteLaunch(l.name);
}
```

참고: `findPortHolder`는 `-Fpc` 출력(`p`/`c` 레코드)을 `parseLsofCwd`로 파싱해 이름만 쓴다. 이 경우 `cwd` 필드는 비어 있다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F @hub/server test launcher`
Expected: 8 PASS. 첫 테스트는 `zsh -lc`가 로그인 프로필을 읽기 때문에 수 초가 걸릴 수 있다.

- [ ] **Step 5: 커밋**

```bash
git add server/src/runtime/launcher.ts server/test/launcher.test.ts
git commit -m "feat(server): add process launcher"
```

---

### Task 11: HTTP API (Hono 앱)

**Files:**
- Create: `server/src/app.ts`
- Test: `server/test/app.test.ts`

**Interfaces:**
- Consumes: `Db`, `RefreshController` (Task 8), `RuntimeCache` (Task 9), `startProject`, `stopProcess`, `logPathFor`, `readLogTail`, `LauncherDeps`, `StartOptions` (Task 10), `CommandRunner`, shared 타입, `RunConfigInputSchema`
- Produces:
  - `interface Launcher { start: typeof startProject; stop: typeof stopProcess }`
  - `interface AppDeps { db: Db; refresh: RefreshController; runtime: RuntimeCache; run: CommandRunner; logsDir: string; health: () => Promise<Health>; launcher?: Launcher; startOptions?: StartOptions }`
  - `toProject(db: Db, p: StoredProject): Project`
  - `createApp(deps: AppDeps): Hono`
  - 엔드포인트 (프론트가 사용):
    - `GET /api/projects` → `ProjectsResponse`
    - `GET /api/projects/:name` → `Project` | 404
    - `POST /api/refresh` body `{ force?: boolean }` → 202 `{ started: true }` | 409 `{ error: 'already-running' }`
    - `GET /api/refresh/stream` → SSE, `data`는 `RefreshEvent` JSON. 연결 직후 `state` 이벤트 1회, 15초마다 `event: ping`
    - `GET /api/runtime` → `RuntimeSnapshot`
    - `GET /api/health` → `Health`
    - `POST /api/projects/:name/start` body `{ approve?: boolean }` → 200 `StartResult` | 404 `{ error: 'no-run-config' }` | 428 `{ error: 'approval-required', suggestion: RunSuggestion }`
    - `POST /api/projects/:name/stop` body `{ pid: number }` → 200 `{ result: 'stopped' | 'killed' | 'not-running' }` | 404
    - `PUT /api/projects/:name/run-config` body `RunSuggestion` → 200 `RunConfig` | 400
    - `GET /api/projects/:name/logs/stream` → SSE, `event: snapshot`(전체 꼬리 200줄) / `event: append`(새로 붙은 내용)
    - `POST /api/projects/:name/open-editor` → 200 `{ ok: true }` | 500

- [ ] **Step 1: 실패하는 테스트 작성** — `server/test/app.test.ts`

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { RefreshEvent, RuntimeSnapshot, StoredProject, Summary } from '@hub/shared';
import { createApp, type AppDeps } from '../src/app';
import { openDb } from '../src/db';
import type { RefreshController } from '../src/refresh';
import { RuntimeCache } from '../src/runtime/detect';
import { logPathFor } from '../src/runtime/launcher';
import { fakeRunner } from './fakeRunner';

const stored = (name: string): StoredProject => ({
  name,
  path: `/root/${name}`,
  isGit: true,
  remoteUrl: null,
  githubRepo: null,
  stack: [],
  readmeExcerpt: null,
  git: null,
  github: null,
  errors: {},
  updatedAt: 't',
});
const summary = (runSuggestion: Summary['runSuggestion']): Summary => ({
  oneLiner: '한 줄',
  whatItIs: '설명',
  features: [],
  structure: [],
  currentState: '',
  nextSteps: [],
  runSuggestion,
});

function fakeRefresh(running = false) {
  const listeners = new Set<(e: RefreshEvent) => void>();
  const ctl: RefreshController & { emit(e: RefreshEvent): void; starts: number } = {
    running,
    starts: 0,
    start() {
      if (this.running) return false;
      this.starts++;
      return true;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit(e) {
      listeners.forEach((fn) => fn(e));
    },
  };
  return ctl;
}

function setup(over: Partial<AppDeps> = {}, snapshot: RuntimeSnapshot = { at: 't', byProject: {} }) {
  const db = openDb(':memory:');
  db.upsertProject(stored('alpha'));
  const launcher = {
    start: vi.fn(async () => ({ status: 'running' as const, processes: [] })),
    stop: vi.fn(async () => 'stopped' as const),
  };
  const deps: AppDeps = {
    db,
    refresh: fakeRefresh(),
    runtime: new RuntimeCache(async () => snapshot, 0),
    run: fakeRunner(() => ({ code: 0 })),
    logsDir: mkdtempSync(path.join(tmpdir(), 'hub-logs-')),
    health: async () => ({ gh: true, claude: true, lsof: true, messages: [] }),
    launcher,
    ...over,
  };
  return { app: createApp(deps), db, launcher, deps };
}

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

async function readSse(res: Response, until: (text: string) => boolean): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (!until(text)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  await reader.cancel();
  return text;
}

describe('projects', () => {
  it('lists projects with summary and run config attached', async () => {
    const { app, db } = setup();
    db.putSummary('alpha', 'h', summary(null));
    db.putRunConfig('alpha', { command: 'pnpm dev', cwd: '.', expectedPort: 5173, source: 'user' });
    db.setMeta('lastRefreshAt', '2026-10-05T00:00:00.000Z');
    const body = await (await app.request('/api/projects')).json();
    expect(body.lastRefreshAt).toBe('2026-10-05T00:00:00.000Z');
    expect(body.refreshing).toBe(false);
    expect(body.projects[0]).toMatchObject({
      name: 'alpha',
      summary: { oneLiner: '한 줄' },
      runConfig: { command: 'pnpm dev', source: 'user' },
    });
    expect(body.projects[0].summaryAt).toEqual(expect.any(String));
  });
  it('returns 404 for unknown projects', async () => {
    expect((await setup().app.request('/api/projects/nope')).status).toBe(404);
  });
});

describe('refresh', () => {
  it('starts a refresh and rejects a concurrent one', async () => {
    const idle = setup();
    expect((await idle.app.request('/api/refresh', post({}))).status).toBe(202);
    const busy = setup({ refresh: fakeRefresh(true) });
    expect((await busy.app.request('/api/refresh', post({ force: true }))).status).toBe(409);
  });

  it('streams the current state first, then refresh events', async () => {
    const refresh = fakeRefresh(true);
    const { app } = setup({ refresh });
    const res = await app.request('/api/refresh/stream');
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    setTimeout(() => refresh.emit({ type: 'done', durationMs: 5 }), 50);
    const text = await readSse(res, (t) => t.includes('"done"'));
    expect(text.indexOf('{"type":"state","running":true}')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('"state"')).toBeLessThan(text.indexOf('"done"'));
  });
});

describe('start / stop / run-config', () => {
  it('returns 404 when there is no config and no suggestion', async () => {
    const res = await setup().app.request('/api/projects/alpha/start', post({}));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no-run-config' });
  });

  it('requires approval for a suggested command, then saves it as approved', async () => {
    const { app, db, launcher } = setup();
    const suggestion = { command: 'pnpm dev', cwd: '.', expectedPort: 5173 };
    db.putSummary('alpha', 'h', summary(suggestion));
    const first = await app.request('/api/projects/alpha/start', post({}));
    expect(first.status).toBe(428);
    expect(await first.json()).toEqual({ error: 'approval-required', suggestion });
    expect(launcher.start).not.toHaveBeenCalled();

    const second = await app.request('/api/projects/alpha/start', post({ approve: true }));
    expect(second.status).toBe(200);
    expect(db.getRunConfig('alpha')).toEqual({ ...suggestion, source: 'approved' });
    expect(launcher.start).toHaveBeenCalledWith(
      expect.objectContaining({ db }),
      { name: 'alpha', path: '/root/alpha' },
      { ...suggestion, source: 'approved' },
      undefined,
    );
  });

  it('validates and saves a user run config', async () => {
    const { app, db } = setup();
    const bad = await app.request('/api/projects/alpha/run-config', { ...post({ command: '' }), method: 'PUT' });
    expect(bad.status).toBe(400);
    const good = await app.request('/api/projects/alpha/run-config', {
      ...post({ command: 'uv run app.py', cwd: '.', expectedPort: null }),
      method: 'PUT',
    });
    expect(good.status).toBe(200);
    expect(db.getRunConfig('alpha')?.source).toBe('user');
  });

  it('stops hub-launched processes by group and external ones by pid', async () => {
    const snapshot: RuntimeSnapshot = {
      at: 't',
      byProject: {
        alpha: [
          { pid: 10, pgid: 10, command: 'a', cwd: '/root/alpha', ports: [], launchedByHub: true },
          { pid: 21, pgid: 20, command: 'b', cwd: '/root/alpha', ports: [], launchedByHub: false },
        ],
      },
    };
    const { app, launcher, db } = setup({}, snapshot);
    db.putLaunch({ name: 'alpha', pid: 10, pgid: 10, command: 'a', startedAt: 't', logPath: '/l' });
    expect((await app.request('/api/projects/alpha/stop', post({ pid: 10 }))).status).toBe(200);
    expect(launcher.stop).toHaveBeenLastCalledWith({ pid: 10, group: true });
    expect(db.getLaunch('alpha')).toBeNull();
    await app.request('/api/projects/alpha/stop', post({ pid: 21 }));
    expect(launcher.stop).toHaveBeenLastCalledWith({ pid: 21, group: false });
    expect((await app.request('/api/projects/alpha/stop', post({ pid: 99 }))).status).toBe(404);
  });
});

describe('logs and misc', () => {
  it('streams a log snapshot', async () => {
    const { app, deps } = setup();
    writeFileSync(logPathFor(deps.logsDir, 'alpha'), 'line1\nline2\n');
    const res = await app.request('/api/projects/alpha/logs/stream');
    const text = await readSse(res, (t) => t.includes('line2'));
    expect(text).toContain('event: snapshot');
  });

  it('serves runtime and health', async () => {
    const { app } = setup();
    expect(await (await app.request('/api/runtime')).json()).toEqual({ at: 't', byProject: {} });
    expect((await (await app.request('/api/health')).json()).gh).toBe(true);
  });

  it('opens the editor with the project path', async () => {
    const run = fakeRunner(() => ({ code: 0 }));
    const { app } = setup({ run });
    expect((await app.request('/api/projects/alpha/open-editor', post({}))).status).toBe(200);
    expect(run.calls[0]).toMatchObject({ cmd: 'code', args: ['/root/alpha'] });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm -F @hub/server test app`
Expected: FAIL — `../src/app` 없음.

- [ ] **Step 3: 구현** — `server/src/app.ts`

```ts
import { open, stat } from 'node:fs/promises';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  RunConfigInputSchema,
  type Health,
  type Project,
  type ProjectsResponse,
  type RefreshEvent,
  type RunConfig,
  type StoredProject,
} from '@hub/shared';
import type { Db } from './db';
import type { CommandRunner } from './exec';
import type { RefreshController } from './refresh';
import type { RuntimeCache } from './runtime/detect';
import { logPathFor, readLogTail, startProject, stopProcess, type StartOptions } from './runtime/launcher';

export interface Launcher {
  start: typeof startProject;
  stop: typeof stopProcess;
}

export interface AppDeps {
  db: Db;
  refresh: RefreshController;
  runtime: RuntimeCache;
  run: CommandRunner;
  logsDir: string;
  health: () => Promise<Health>;
  launcher?: Launcher;
  startOptions?: StartOptions;
}

export function toProject(db: Db, p: StoredProject): Project {
  const s = db.getSummary(p.name);
  return { ...p, summary: s?.content ?? null, summaryAt: s?.createdAt ?? null, runConfig: db.getRunConfig(p.name) };
}

async function body(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown>> {
  const b = await c.req.json().catch(() => ({}));
  return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
}

export function createApp(deps: AppDeps) {
  const { db, refresh, runtime, run, logsDir } = deps;
  const launcher: Launcher = deps.launcher ?? { start: startProject, stop: stopProcess };
  const app = new Hono();

  app.get('/api/projects', (c) =>
    c.json<ProjectsResponse>({
      projects: db.listProjects().map((p) => toProject(db, p)),
      lastRefreshAt: db.getMeta('lastRefreshAt'),
      refreshing: refresh.running,
    }),
  );

  app.get('/api/projects/:name', (c) => {
    const p = db.getProject(c.req.param('name'));
    return p ? c.json(toProject(db, p)) : c.json({ error: 'not-found' }, 404);
  });

  app.post('/api/refresh', async (c) => {
    const b = await body(c);
    return refresh.start({ force: b.force === true })
      ? c.json({ started: true }, 202)
      : c.json({ error: 'already-running' }, 409);
  });

  app.get('/api/refresh/stream', (c) =>
    streamSSE(c, async (stream) => {
      const queue: RefreshEvent[] = [{ type: 'state', running: refresh.running }];
      let wake: (() => void) | null = null;
      const unsubscribe = refresh.subscribe((e) => {
        queue.push(e);
        wake?.();
      });
      stream.onAbort(() => {
        unsubscribe();
        wake?.();
      });
      while (!stream.aborted) {
        while (queue.length) await stream.writeSSE({ data: JSON.stringify(queue.shift()) });
        const timedOut = await new Promise<boolean>((resolve) => {
          const t = setTimeout(() => resolve(true), 15_000);
          wake = () => {
            clearTimeout(t);
            resolve(false);
          };
        });
        wake = null;
        if (timedOut && !stream.aborted) await stream.writeSSE({ event: 'ping', data: '' });
      }
      unsubscribe();
    }),
  );

  app.get('/api/runtime', async (c) => c.json(await runtime.get()));
  app.get('/api/health', async (c) => c.json(await deps.health()));

  app.post('/api/projects/:name/start', async (c) => {
    const name = c.req.param('name');
    const p = db.getProject(name);
    if (!p) return c.json({ error: 'not-found' }, 404);
    const b = await body(c);
    let cfg: RunConfig | null = db.getRunConfig(name);
    if (!cfg) {
      const suggestion = db.getSummary(name)?.content.runSuggestion;
      if (!suggestion) return c.json({ error: 'no-run-config' }, 404);
      if (b.approve !== true) return c.json({ error: 'approval-required', suggestion }, 428);
      cfg = { ...suggestion, source: 'approved' };
      db.putRunConfig(name, cfg);
    }
    const result = await launcher.start({ db, logsDir, runtime, run }, { name, path: p.path }, cfg, deps.startOptions);
    return c.json(result);
  });

  app.post('/api/projects/:name/stop', async (c) => {
    const name = c.req.param('name');
    const pid = Number((await body(c)).pid);
    runtime.invalidate();
    const proc = (await runtime.get()).byProject[name]?.find((p) => p.pid === pid);
    if (!proc) return c.json({ error: 'not-running' }, 404);
    const result = proc.launchedByHub
      ? await launcher.stop({ pid: proc.pgid, group: true })
      : await launcher.stop({ pid: proc.pid, group: false });
    if (proc.launchedByHub) db.deleteLaunch(name);
    runtime.invalidate();
    return c.json({ result });
  });

  app.put('/api/projects/:name/run-config', async (c) => {
    const name = c.req.param('name');
    if (!db.getProject(name)) return c.json({ error: 'not-found' }, 404);
    const parsed = RunConfigInputSchema.safeParse(await body(c));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const cfg: RunConfig = { ...parsed.data, source: 'user' };
    db.putRunConfig(name, cfg);
    return c.json(cfg);
  });

  app.get('/api/projects/:name/logs/stream', (c) => {
    const file = logPathFor(logsDir, c.req.param('name'));
    return streamSSE(c, async (stream) => {
      const size = async () => (await stat(file).catch(() => null))?.size ?? 0;
      let offset = await size();
      await stream.writeSSE({ event: 'snapshot', data: JSON.stringify(await readLogTail(file, 200)) });
      while (!stream.aborted) {
        await stream.sleep(1_000);
        const current = await size();
        if (current < offset) {
          // 새로 실행되어 로그가 덮어써짐
          offset = current;
          await stream.writeSSE({ event: 'snapshot', data: JSON.stringify(await readLogTail(file, 200)) });
        } else if (current > offset) {
          const fh = await open(file, 'r');
          const buf = Buffer.alloc(current - offset);
          await fh.read(buf, 0, buf.length, offset);
          await fh.close();
          offset = current;
          await stream.writeSSE({ event: 'append', data: JSON.stringify(buf.toString('utf8')) });
        }
      }
    });
  });

  app.post('/api/projects/:name/open-editor', async (c) => {
    const p = db.getProject(c.req.param('name'));
    if (!p) return c.json({ error: 'not-found' }, 404);
    const r = await run('code', [p.path], { timeoutMs: 10_000 });
    return r.code === 0 ? c.json({ ok: true }) : c.json({ error: r.stderr.trim() || 'code 실행 실패' }, 500);
  });

  return app;
}
```

로그 SSE의 `data`는 줄바꿈이 섞인 텍스트라서 JSON 문자열로 감싸 보낸다. 프론트에서 `JSON.parse`한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F @hub/server test app`
Expected: 11 PASS.

- [ ] **Step 5: 커밋**

```bash
git add server/src/app.ts server/test/app.test.ts
git commit -m "feat(server): add HTTP API"
```

---

### Task 12: 서버 진입점 + 실제 데이터 스모크 테스트

**Files:**
- Create: `server/src/main.ts`

**Interfaces:**
- Consumes: `openDb`, `runCommand`, `RefreshManager`, `RuntimeCache`, `detectRuntime`, `cleanupLaunches`, `checkHealth`, `createApp`
- Produces: `pnpm -F @hub/server dev`로 `http://127.0.0.1:4310` 서버 실행. 환경변수 `HUB_ROOT`, `HUB_SUMMARY_MODEL`, `HUB_PORT`(기본 4310).

- [ ] **Step 1: 구현** — `server/src/main.ts`

```ts
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { openDb } from './db';
import { runCommand } from './exec';
import { checkHealth } from './health';
import { RefreshManager } from './refresh';
import { RuntimeCache, detectRuntime } from './runtime/detect';
import { cleanupLaunches } from './runtime/launcher';

const HUB_DIR = path.resolve(import.meta.dirname, '../..');
const ROOT = realpathSync(process.env.HUB_ROOT ?? path.join(homedir(), 'git/personal'));
const DATA = path.join(HUB_DIR, 'data');
const PORT = Number(process.env.HUB_PORT ?? 4310);

const db = openDb(path.join(DATA, 'hub.db'));
cleanupLaunches(db);

const refresh = new RefreshManager({
  root: ROOT,
  exclude: [path.basename(HUB_DIR)],
  db,
  run: runCommand,
  summaryModel: process.env.HUB_SUMMARY_MODEL ?? 'sonnet',
});
refresh.subscribe((e) => {
  if (e.type === 'done') console.log(`[project-hub] 새로고침 완료 (${Math.round(e.durationMs / 1000)}초)`);
  if (e.type === 'error') console.error(`[project-hub] 새로고침 실패: ${e.message}`);
});

const runtime = new RuntimeCache(() =>
  detectRuntime(
    {
      projects: db.listProjects().map((p) => ({ name: p.name, path: p.path })),
      launchedPgids: new Set(db.listLaunches().map((l) => l.pgid)),
    },
    runCommand,
  ),
);

const app = createApp({
  db,
  refresh,
  runtime,
  run: runCommand,
  logsDir: path.join(DATA, 'logs'),
  health: () => checkHealth(runCommand),
});

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: PORT }, (info) => {
  console.log(`[project-hub] API http://127.0.0.1:${info.port}  (root: ${ROOT})`);
  if (db.listProjects().length === 0) {
    console.log('[project-hub] DB가 비어 있어 최초 새로고침을 시작합니다');
    refresh.start();
  }
});
```

- [ ] **Step 2: 타입 검사와 전체 서버 테스트**

Run: `pnpm -F @hub/server typecheck && pnpm -F @hub/server test`
Expected: 오류 없음, 전체 PASS.

- [ ] **Step 3: 실제 데이터로 스모크 테스트**

```bash
cd ~/git/personal/project-hub
pnpm -F @hub/server dev    # 별도 터미널 또는 백그라운드
```

최초 새로고침이 끝날 때까지(콘솔에 `새로고침 완료`가 찍힐 때까지, 수 분) 기다린 뒤:

```bash
curl -s 127.0.0.1:4310/api/health
curl -s 127.0.0.1:4310/api/projects | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['projects'])); [print(p['name'], (p['git'] or {}).get('lastCommitAt'), bool(p['github']), (p['summary'] or {}).get('oneLiner'), p['errors']) for p in d['projects']]"
curl -s 127.0.0.1:4310/api/runtime | python3 -m json.tool
```

Expected:
- 프로젝트 수는 `ls ~/git/personal`에서 제외 규칙을 적용한 수와 같다(현재 31개 안팎).
- GitHub remote가 있는 16개 프로젝트에서 `github`이 채워진다.
- 대부분의 프로젝트에 `oneLiner`가 생긴다. `errors`에 남은 항목은 원인을 확인해 수정하거나, 실제 데이터 문제라면 기록해 둔다.
- `/api/runtime`에 현재 실행 중인 프로젝트(예: kr-by-claude, route-guide, movie-sniper)가 포트와 함께 나온다.

- [ ] **Step 4: 커밋**

```bash
git add server/src/main.ts
git commit -m "feat(server): add server entrypoint"
```

---
### Task 13: web 기반 — Vite/Tailwind 설정 + 순수 로직(lib) + API 클라이언트

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/src/index.css`, `web/src/main.tsx`, `web/src/App.tsx`(임시)
- Create: `web/src/lib/cn.ts`, `web/src/lib/status.ts`, `web/src/lib/runConfig.ts`, `web/src/lib/api.ts`, `web/src/lib/hooks.ts`
- Test: `web/src/lib/status.test.ts`, `web/src/lib/runConfig.test.ts`

**Interfaces:**
- Consumes: `@hub/shared` 타입, Task 11의 API 엔드포인트
- Produces:
  - `cn(...inputs: ClassValue[]): string`
  - `status.ts`: `type Activity = 'active' | 'dormant' | 'stale' | 'unknown'`, `type Filter = 'all' | 'running' | 'active' | 'dormant' | 'stale' | 'dirty'`, `type Sort = 'recent' | 'name' | 'issues'`, `FILTERS: Filter[]`, `activityOf(lastCommitAt: string | null, now: Date): Activity`, `relativeTime(iso: string | null, now: Date): string`, `relativeClock(iso: string, now: Date): string`, `isRunning(p: Project, runtime?: RuntimeSnapshot): boolean`, `filterProjects(projects, filter, runtime, query, now): Project[]`, `sortProjects(projects, sort): Project[]`, `countFilters(projects, runtime, now): Record<Filter, number>`, `displayLine(p: Project): string`
  - `runConfig.ts`: `interface ResolvedRun extends RunSuggestion { source: 'user' | 'approved' | 'suggested' }`, `resolveRun(p: Project): ResolvedRun | null`, `openUrl(port: number): string`
  - `api.ts`: `class ApiError extends Error { status: number; body: any }`, `api.{ projects, runtime, health, refresh(force), start(name, approve), stop(name, pid), saveRunConfig(name, cfg), openEditor(name) }`
  - `hooks.ts`: `useProjects()`, `useRuntime()`, `useHealth()`, `useNow(intervalMs?)`, `useRefreshStream(): { running: boolean; done: number; total: number; error: string | null }`, `useLogStream(name: string, enabled: boolean): string`

- [ ] **Step 1: 패키지·설정 파일 작성**

`web/package.json`:
```json
{
  "name": "@hub/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@hub/shared": "workspace:*",
    "@tanstack/react-query": "^5.104.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.52.0",
    "motion": "^14.0.0",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "tailwind-merge": "^3.7.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.1",
    "tailwindcss": "^4.3.3",
    "typescript": "^7.0.2",
    "vite": "^8.3.2",
    "vitest": "^5.0.3"
  }
}
```

`web/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`web/vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const proxy = { '/api': 'http://127.0.0.1:4310' };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5199, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 5199, strictPort: true, proxy },
  test: { include: ['src/**/*.test.ts'] },
});
```

`web/index.html`:
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Project Hub</title>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/src/index.css`:
```css
@import 'tailwindcss';

@theme {
  --color-bg: #07070a;
  --color-panel: #0d0d13;
  --color-line: #1f1f29;
  --color-muted: #8b8b9e;
  --color-fg: #ececf3;
  --color-live: #34d399;
  --color-warn: #fbbf24;
  --color-bad: #f87171;
  --color-accent: #a78bfa;
  --color-accent2: #22d3ee;
  --font-sans: 'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', sans-serif;
  --font-mono: ui-monospace, 'SF Mono', Menlo, monospace;
  --animate-shimmer: shimmer 2.5s linear infinite;
  --animate-pulse-dot: pulse-dot 1.6s ease-in-out infinite;

  @keyframes shimmer {
    to {
      background-position: -200% 0;
    }
  }
  @keyframes pulse-dot {
    50% {
      opacity: 0.3;
    }
  }
}

html,
body,
#root {
  height: 100%;
}
body {
  @apply bg-bg font-sans text-fg antialiased;
  color-scheme: dark;
}
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-thumb {
  background: #2a2a36;
  border-radius: 999px;
}
```

`web/src/main.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1 } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

`web/src/App.tsx` (Task 15에서 교체될 임시 파일):
```tsx
export default function App() {
  return <div className="p-6 text-2xl font-bold">Project Hub</div>;
}
```

Run: `cd ~/git/personal/project-hub && pnpm install`

- [ ] **Step 2: 실패하는 테스트 작성**

`web/src/lib/status.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Project, RuntimeSnapshot } from '@hub/shared';
import {
  activityOf,
  countFilters,
  displayLine,
  filterProjects,
  relativeClock,
  relativeTime,
  sortProjects,
} from './status';

const NOW = new Date('2026-10-05T12:00:00+09:00');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function project(name: string, over: Partial<Project> = {}, lastDays: number | null = 1, dirty = 0): Project {
  return {
    name,
    path: `/r/${name}`,
    isGit: lastDays !== null,
    remoteUrl: null,
    githubRepo: null,
    stack: [],
    readmeExcerpt: null,
    git:
      lastDays === null
        ? null
        : {
            branch: 'main',
            lastCommitAt: daysAgo(lastDays),
            dirtyCount: dirty,
            hasUpstream: false,
            ahead: 0,
            behind: 0,
            recentCommits: [],
            weeklyCommits: [],
          },
    github: null,
    errors: {},
    updatedAt: '',
    summary: null,
    summaryAt: null,
    runConfig: null,
    ...over,
  };
}

describe('activityOf', () => {
  it('uses 14 / 60 day boundaries', () => {
    expect(activityOf(daysAgo(14), NOW)).toBe('active');
    expect(activityOf(daysAgo(15), NOW)).toBe('dormant');
    expect(activityOf(daysAgo(60), NOW)).toBe('dormant');
    expect(activityOf(daysAgo(61), NOW)).toBe('stale');
    expect(activityOf(null, NOW)).toBe('unknown');
  });
});

describe('relativeTime', () => {
  it('formats calendar-day differences in Korean', () => {
    expect(relativeTime(daysAgo(0), NOW)).toBe('오늘');
    expect(relativeTime(daysAgo(1), NOW)).toBe('어제');
    expect(relativeTime(daysAgo(5), NOW)).toBe('5일 전');
    expect(relativeTime(daysAgo(65), NOW)).toBe('2달 전');
    expect(relativeTime(daysAgo(800), NOW)).toBe('2년 전');
    expect(relativeTime(null, NOW)).toBe('—');
  });
});

describe('relativeClock', () => {
  it('uses minutes and hours for recent times', () => {
    expect(relativeClock(new Date(NOW.getTime() - 20_000).toISOString(), NOW)).toBe('방금');
    expect(relativeClock(new Date(NOW.getTime() - 5 * 60_000).toISOString(), NOW)).toBe('5분 전');
    expect(relativeClock(new Date(NOW.getTime() - 3 * 3_600_000).toISOString(), NOW)).toBe('3시간 전');
    expect(relativeClock(daysAgo(3), NOW)).toBe('3일 전');
  });
});

describe('filter / sort / count', () => {
  const runtime: RuntimeSnapshot = {
    at: '',
    byProject: { beta: [{ pid: 1, pgid: 1, command: 'x', cwd: '', ports: [3000], launchedByHub: false }] },
  };
  const list = [
    project('alpha', { summary: { oneLiner: '책 학습 노트', whatItIs: 'x', features: [], structure: [], currentState: '', nextSteps: [], runSuggestion: null } }, 1, 2),
    project('beta', { stack: ['FastAPI'] }, 30),
    project('gamma', {}, 200),
    project('plain', {}, null),
  ];

  it('filters by state, running and dirty', () => {
    const names = (f: Parameters<typeof filterProjects>[1]) => filterProjects(list, f, runtime, '', NOW).map((p) => p.name);
    expect(names('all')).toEqual(['alpha', 'beta', 'gamma', 'plain']);
    expect(names('running')).toEqual(['beta']);
    expect(names('active')).toEqual(['alpha']);
    expect(names('dormant')).toEqual(['beta']);
    expect(names('stale')).toEqual(['gamma']);
    expect(names('dirty')).toEqual(['alpha']);
  });

  it('searches name, one-liner and stack case-insensitively', () => {
    expect(filterProjects(list, 'all', runtime, '학습', NOW).map((p) => p.name)).toEqual(['alpha']);
    expect(filterProjects(list, 'all', runtime, 'fastapi', NOW).map((p) => p.name)).toEqual(['beta']);
  });

  it('sorts by recency with never-committed projects last', () => {
    expect(sortProjects([list[3], list[2], list[0], list[1]], 'recent').map((p) => p.name)).toEqual([
      'alpha',
      'beta',
      'gamma',
      'plain',
    ]);
    expect(sortProjects([list[2], list[0]], 'name').map((p) => p.name)).toEqual(['alpha', 'gamma']);
  });

  it('sorts by open issues + PRs', () => {
    const withIssues = project('zeta', {
      github: {
        url: '',
        openIssues: [{ number: 1, title: '', url: '', labels: [], createdAt: '', closedAt: null }],
        openPRs: [],
        recentlyClosedIssues: [],
        ci: { status: 'none' },
      },
    }, 100);
    expect(sortProjects([list[0], withIssues], 'issues')[0].name).toBe('zeta');
  });

  it('counts every filter', () => {
    expect(countFilters(list, runtime, NOW)).toEqual({ all: 4, running: 1, active: 1, dormant: 1, stale: 1, dirty: 1 });
  });

  it('falls back from one-liner to readme excerpt', () => {
    expect(displayLine(list[0])).toBe('책 학습 노트');
    expect(displayLine(project('x', { readmeExcerpt: 'README 발췌' }))).toBe('README 발췌');
    expect(displayLine(project('y'))).toBe('설명 없음');
  });
});
```

`web/src/lib/runConfig.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Project } from '@hub/shared';
import { openUrl, resolveRun } from './runConfig';

const base = { summary: null, runConfig: null } as unknown as Project;
const suggestion = { command: 'pnpm dev', cwd: '.', expectedPort: 5173 };

describe('resolveRun', () => {
  it('prefers a saved config over the Claude suggestion', () => {
    const p = {
      ...base,
      runConfig: { command: 'uv run app.py', cwd: '.', expectedPort: 8000, source: 'user' },
      summary: { runSuggestion: suggestion },
    } as unknown as Project;
    expect(resolveRun(p)).toEqual({ command: 'uv run app.py', cwd: '.', expectedPort: 8000, source: 'user' });
  });
  it('marks a bare suggestion as suggested', () => {
    expect(resolveRun({ ...base, summary: { runSuggestion: suggestion } } as unknown as Project)).toEqual({
      ...suggestion,
      source: 'suggested',
    });
  });
  it('returns null when nothing is known', () => {
    expect(resolveRun(base)).toBeNull();
  });
});

describe('openUrl', () => {
  it('builds a localhost URL', () => {
    expect(openUrl(5173)).toBe('http://localhost:5173');
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm -F @hub/web test`
Expected: FAIL — `./status`, `./runConfig` 없음.

- [ ] **Step 4: lib 구현**

`web/src/lib/cn.ts`:
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
```

`web/src/lib/status.ts`:
```ts
import type { Project, RuntimeSnapshot } from '@hub/shared';

export type Activity = 'active' | 'dormant' | 'stale' | 'unknown';
export type Filter = 'all' | 'running' | 'active' | 'dormant' | 'stale' | 'dirty';
export type Sort = 'recent' | 'name' | 'issues';
export const FILTERS: Filter[] = ['all', 'running', 'active', 'dormant', 'stale', 'dirty'];

const DAY = 86_400_000;

export function activityOf(lastCommitAt: string | null, now: Date): Activity {
  if (!lastCommitAt) return 'unknown';
  const days = (now.getTime() - new Date(lastCommitAt).getTime()) / DAY;
  if (days <= 14) return 'active';
  if (days <= 60) return 'dormant';
  return 'stale';
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function relativeTime(iso: string | null, now: Date): string {
  if (!iso) return '—';
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY);
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 30) return `${days}일 전`;
  if (days < 365) return `${Math.floor(days / 30)}달 전`;
  return `${Math.floor(days / 365)}년 전`;
}

export function relativeClock(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}시간 전`;
  return relativeTime(iso, now);
}

export const isRunning = (p: Project, runtime?: RuntimeSnapshot) => (runtime?.byProject[p.name]?.length ?? 0) > 0;

function matchesFilter(p: Project, filter: Filter, runtime: RuntimeSnapshot | undefined, now: Date): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'running':
      return isRunning(p, runtime);
    case 'dirty':
      return (p.git?.dirtyCount ?? 0) > 0;
    default:
      return activityOf(p.git?.lastCommitAt ?? null, now) === filter;
  }
}

function matchesQuery(p: Project, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [p.name, p.summary?.oneLiner, p.readmeExcerpt, ...p.stack].some((s) => s?.toLowerCase().includes(q));
}

export function filterProjects(
  projects: Project[],
  filter: Filter,
  runtime: RuntimeSnapshot | undefined,
  query: string,
  now: Date,
): Project[] {
  return projects.filter((p) => matchesFilter(p, filter, runtime, now) && matchesQuery(p, query));
}

const lastAt = (p: Project) => (p.git?.lastCommitAt ? new Date(p.git.lastCommitAt).getTime() : 0);
const openCount = (p: Project) => (p.github?.openIssues.length ?? 0) + (p.github?.openPRs.length ?? 0);

export function sortProjects(projects: Project[], sort: Sort): Project[] {
  const byName = (a: Project, b: Project) => a.name.localeCompare(b.name);
  const byRecent = (a: Project, b: Project) => lastAt(b) - lastAt(a) || byName(a, b);
  const cmp =
    sort === 'name' ? byName : sort === 'issues' ? (a: Project, b: Project) => openCount(b) - openCount(a) || byRecent(a, b) : byRecent;
  return [...projects].sort(cmp);
}

export function countFilters(projects: Project[], runtime: RuntimeSnapshot | undefined, now: Date): Record<Filter, number> {
  const counts = { all: 0, running: 0, active: 0, dormant: 0, stale: 0, dirty: 0 } satisfies Record<Filter, number>;
  for (const p of projects) for (const f of FILTERS) if (matchesFilter(p, f, runtime, now)) counts[f]++;
  return counts;
}

export const displayLine = (p: Project) => p.summary?.oneLiner ?? p.readmeExcerpt ?? '설명 없음';
```

`web/src/lib/runConfig.ts`:
```ts
import type { Project, RunSuggestion } from '@hub/shared';

export interface ResolvedRun extends RunSuggestion {
  source: 'user' | 'approved' | 'suggested';
}

export function resolveRun(p: Project): ResolvedRun | null {
  if (p.runConfig) return p.runConfig;
  const s = p.summary?.runSuggestion;
  return s ? { ...s, source: 'suggested' } : null;
}

export const openUrl = (port: number) => `http://localhost:${port}`;
```

`web/src/lib/api.ts`:
```ts
import type { Health, ProjectsResponse, RunConfig, RunSuggestion, RuntimeSnapshot, StartResult } from '@hub/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public body: any,
  ) {
    super(body?.error ?? `HTTP ${status}`);
  }
}

async function request<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

const p = (name: string) => `/api/projects/${encodeURIComponent(name)}`;

export const api = {
  projects: () => request<ProjectsResponse>('/api/projects'),
  runtime: () => request<RuntimeSnapshot>('/api/runtime'),
  health: () => request<Health>('/api/health'),
  refresh: (force = false) => request<{ started: boolean }>('/api/refresh', { method: 'POST', body: { force } }),
  start: (name: string, approve = false) => request<StartResult>(`${p(name)}/start`, { method: 'POST', body: { approve } }),
  stop: (name: string, pid: number) => request<{ result: string }>(`${p(name)}/stop`, { method: 'POST', body: { pid } }),
  saveRunConfig: (name: string, cfg: RunSuggestion) => request<RunConfig>(`${p(name)}/run-config`, { method: 'PUT', body: cfg }),
  openEditor: (name: string) => request<{ ok: true }>(`${p(name)}/open-editor`, { method: 'POST', body: {} }),
};
```

`web/src/lib/hooks.ts`:
```ts
import type { RefreshEvent } from '@hub/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './api';

export const useProjects = () => useQuery({ queryKey: ['projects'], queryFn: api.projects });

export const useRuntime = () =>
  useQuery({ queryKey: ['runtime'], queryFn: api.runtime, refetchInterval: 5_000, refetchIntervalInBackground: false });

export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 60_000 });

export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useRefreshStream() {
  const qc = useQueryClient();
  const [state, setState] = useState({ running: false, done: 0, total: 0, error: null as string | null });
  useEffect(() => {
    const es = new EventSource('/api/refresh/stream');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refetchProjects = () => qc.invalidateQueries({ queryKey: ['projects'] });
    const refetchSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(refetchProjects, 600);
    };
    es.onmessage = (m) => {
      const e = JSON.parse(m.data) as RefreshEvent;
      switch (e.type) {
        case 'state':
          setState((s) => ({ ...s, running: e.running }));
          if (!e.running) {
            refetchProjects();
            qc.invalidateQueries({ queryKey: ['runtime'] });
          }
          break;
        case 'started':
          setState({ running: true, done: 0, total: e.total, error: null });
          break;
        case 'project-updated':
          setState((s) => ({ ...s, done: e.done, total: e.total }));
          refetchSoon();
          break;
        case 'project-removed':
          refetchSoon();
          break;
        case 'error':
          setState((s) => ({ ...s, error: e.message }));
          break;
        case 'done':
          break;
      }
    };
    return () => {
      clearTimeout(timer);
      es.close();
    };
  }, [qc]);
  return state;
}

export function useLogStream(name: string, enabled: boolean): string {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource(`/api/projects/${encodeURIComponent(name)}/logs/stream`);
    es.addEventListener('snapshot', (m) => setText(JSON.parse((m as MessageEvent).data)));
    es.addEventListener('append', (m) =>
      setText((t) => (t + JSON.parse((m as MessageEvent).data)).split('\n').slice(-500).join('\n')),
    );
    return () => es.close();
  }, [name, enabled]);
  return text;
}
```

- [ ] **Step 5: 테스트·타입 검사 통과 확인**

Run: `pnpm -F @hub/web test && pnpm -F @hub/web typecheck`
Expected: status 9, runConfig 4 PASS. 타입 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add web pnpm-lock.yaml
git commit -m "feat(web): scaffold web app with status logic and API client"
```

---

### Task 14: UI 프리미티브 (Aceternity / Magic UI 패턴)

**Files:**
- Create: `web/src/components/ui/GridBackground.tsx`, `ShimmerButton.tsx`, `LiveBadge.tsx`, `SpotlightRow.tsx`, `NumberTicker.tsx`, `ProgressRing.tsx`, `Dialog.tsx`, `Button.tsx`, `Kbd.tsx`, `Box.tsx`
- Modify: `web/src/App.tsx` (임시 쇼케이스)

**Interfaces:**
- Consumes: `cn` (Task 13)
- Produces (모두 named export):
  - `GridBackground()` — 고정 배경(그리드 + 방사형 글로우)
  - `ShimmerButton(props: ButtonHTMLAttributes<HTMLButtonElement>)`
  - `LiveBadge({ label?: string })`
  - `SpotlightRow({ active?: boolean } & HTMLAttributes<HTMLDivElement>)` — 마우스를 따라가는 스포트라이트, active면 왼쪽 강조 바
  - `NumberTicker({ value: number; className?: string })`
  - `ProgressRing({ value: number /* 0~1 */; size?: number })`
  - `Dialog({ open: boolean; onClose(): void; title: string; children: ReactNode; footer?: ReactNode })`
  - `Button({ variant?: 'primary' | 'ghost' | 'danger' | 'gradient' | 'live'; size?: 'sm' | 'md' } & ButtonHTMLAttributes)`
  - `Kbd({ children; className? })`
  - `Box({ title: ReactNode; right?: ReactNode; children; className? })` — 상세 패널 섹션 카드

이 작업은 시각 컴포넌트라 단위 테스트 대신 타입 검사와 브라우저 쇼케이스로 검증한다.

- [ ] **Step 1: 컴포넌트 작성**

`GridBackground.tsx`:
```tsx
export function GridBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_at_top,black_15%,transparent_70%)]" />
      <div className="absolute top-[-280px] left-1/2 h-[520px] w-[960px] -translate-x-1/2 rounded-full bg-accent/15 blur-[120px]" />
      <div className="absolute top-[-200px] left-[65%] h-[320px] w-[480px] rounded-full bg-accent2/10 blur-[120px]" />
    </div>
  );
}
```

`ShimmerButton.tsx`:
```tsx
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export function ShimmerButton({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        'relative inline-flex items-center gap-2 rounded-full border border-[#3a3360] px-4 py-1.5 text-sm font-medium text-fg',
        'animate-shimmer bg-[linear-gradient(110deg,#1a1630_45%,#3a2f6b_55%,#1a1630)] bg-[length:200%_100%]',
        'shadow-[0_0_24px_-8px] shadow-accent/50 transition hover:border-accent/70 disabled:cursor-wait',
        className,
      )}
    >
      {children}
    </button>
  );
}
```

`LiveBadge.tsx`:
```tsx
export function LiveBadge({ label = 'LIVE' }: { label?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-live/30 bg-live/10 px-1.5 py-px text-[10px] font-semibold tracking-wide text-live">
      <span className="size-1.5 animate-pulse-dot rounded-full bg-live shadow-[0_0_6px] shadow-live" />
      {label}
    </span>
  );
}
```

`SpotlightRow.tsx`:
```tsx
import { useRef, type HTMLAttributes, type MouseEvent } from 'react';
import { cn } from '../../lib/cn';

export function SpotlightRow({ active, className, children, ...props }: HTMLAttributes<HTMLDivElement> & { active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--x', `${e.clientX - r.left}px`);
    el.style.setProperty('--y', `${e.clientY - r.top}px`);
  };
  return (
    <div ref={ref} onMouseMove={onMouseMove} className={cn('group relative overflow-hidden', active && 'bg-accent/10', className)} {...props}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: 'radial-gradient(260px circle at var(--x) var(--y), rgba(167,139,250,0.13), transparent 70%)' }}
      />
      {active && <div aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-accent to-accent2" />}
      <div className="relative">{children}</div>
    </div>
  );
}
```

`NumberTicker.tsx`:
```tsx
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useEffect } from 'react';
import { cn } from '../../lib/cn';

export function NumberTicker({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 140, damping: 22 });
  const text = useTransform(spring, (v) => Math.round(v).toString());
  useEffect(() => {
    mv.set(value);
  }, [mv, value]);
  return <motion.span className={cn('tabular-nums', className)}>{text}</motion.span>;
}
```

`ProgressRing.tsx`:
```tsx
export function ProgressRing({ value, size = 16 }: { value: number; size?: number }) {
  const r = (size - 3) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={2} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#ring)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
        className="transition-[stroke-dashoffset] duration-500"
      />
      <defs>
        <linearGradient id="ring">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
    </svg>
  );
}
```

`Button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const VARIANTS = {
  primary: 'bg-fg text-bg hover:bg-white',
  ghost: 'border border-[#34344a] text-fg/85 hover:border-muted hover:text-fg',
  danger: 'bg-bad/90 text-black hover:bg-bad',
  gradient: 'bg-gradient-to-r from-accent to-accent2 font-semibold text-[#0a0a12] hover:brightness-110',
  live: 'bg-live font-semibold text-[#04120d] hover:brightness-110',
};
const SIZES = { sm: 'h-7 px-2.5 text-xs gap-1 [&_svg]:size-3.5', md: 'h-8 px-3.5 text-sm gap-1.5 [&_svg]:size-4' };

export function Button({
  variant = 'ghost',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    />
  );
}
```

`Kbd.tsx`:
```tsx
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn('rounded-md border border-line bg-bg/80 px-1.5 py-px font-mono text-[10px] text-muted', className)}>{children}</kbd>
  );
}
```

`Box.tsx`:
```tsx
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Box({ title, right, children, className }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mb-3 rounded-xl border border-line bg-black/20 p-4', className)}>
      <header className="mb-2 flex items-center gap-2 text-[11px] font-medium tracking-wider text-muted uppercase">
        {title}
        {right && <div className="ml-auto normal-case tracking-normal">{right}</div>}
      </header>
      <div className="text-[13px] leading-relaxed text-fg/90">{children}</div>
    </section>
  );
}
```

`Dialog.tsx`:
```tsx
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, type ReactNode } from 'react';

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-line bg-panel p-5 shadow-2xl shadow-accent/10"
            initial={{ scale: 0.96, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <h2 className="text-base font-semibold">{title}</h2>
            <div className="mt-3 text-sm text-fg/90">{children}</div>
            {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: 임시 쇼케이스로 `App.tsx` 교체**

```tsx
import { useState } from 'react';
import { Box } from './components/ui/Box';
import { Button } from './components/ui/Button';
import { Dialog } from './components/ui/Dialog';
import { GridBackground } from './components/ui/GridBackground';
import { LiveBadge } from './components/ui/LiveBadge';
import { NumberTicker } from './components/ui/NumberTicker';
import { ProgressRing } from './components/ui/ProgressRing';
import { ShimmerButton } from './components/ui/ShimmerButton';
import { SpotlightRow } from './components/ui/SpotlightRow';

export default function App() {
  const [n, setN] = useState(3);
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4 p-8">
      <GridBackground />
      <div className="flex items-center gap-3">
        <ShimmerButton onClick={() => setN((v) => v + 7)}>
          <ProgressRing value={0.6} /> 새로고침
        </ShimmerButton>
        <NumberTicker value={n} className="text-2xl font-bold" />
        <LiveBadge />
        <Button variant="gradient" onClick={() => setOpen(true)}>모달</Button>
        <Button variant="live">localhost:5173 ↗</Button>
      </div>
      <div className="w-96 rounded-xl border border-line">
        <SpotlightRow active className="px-3 py-2">선택된 행</SpotlightRow>
        <SpotlightRow className="px-3 py-2">마우스를 올려보세요</SpotlightRow>
      </div>
      <Box title="이 프로젝트는" right={<span>오른쪽</span>}>본문</Box>
      <Dialog open={open} onClose={() => setOpen(false)} title="확인" footer={<Button onClick={() => setOpen(false)}>닫기</Button>}>
        내용
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: 타입 검사와 육안 확인**

Run: `pnpm -F @hub/web typecheck`, 그다음 `pnpm -F @hub/web dev`를 띄우고 `http://127.0.0.1:5199`를 연다.
Expected: 쉬머 버튼이 흐르고, 버튼을 누르면 숫자가 튕기듯 올라가고, LIVE 점이 깜빡이고, 행에 마우스를 올리면 스포트라이트가 따라오고, 모달이 스프링 애니메이션으로 열리며 Esc나 바깥 클릭으로 닫힌다. 확인 후 dev 서버를 종료한다.

- [ ] **Step 4: 커밋**

```bash
git add web/src/components web/src/App.tsx
git commit -m "feat(web): add Aceternity/Magic UI style primitives"
```

---

### Task 15: 앱 셸 — 상단 바, 새로고침, 목록, 키보드 이동

**Files:**
- Create: `web/src/features/topbar/TopBar.tsx`, `RefreshButton.tsx`, `HealthBanner.tsx`
- Create: `web/src/features/list/ProjectList.tsx`, `ProjectRow.tsx`, `FilterChips.tsx`, `activity.ts`
- Create: `web/src/features/detail/ProjectDetail.tsx` (이 Task에서는 이름만 보여주는 자리표시 컴포넌트, Task 16에서 완성)
- Modify: `web/src/App.tsx` (쇼케이스를 실제 앱으로 교체)

**Interfaces:**
- Consumes: Task 13의 `status`·`hooks`·`api`, Task 14의 UI 프리미티브
- Produces:
  - `ACTIVITY: Record<Activity, { label: string; dot: string }>` (`features/list/activity.ts`)
  - `TopBar({ query, onQuery, searchRef, total, running, lastRefreshAt })`
  - `ProjectList({ projects, runtime, selected, onSelect, filter, onFilter, sort, onSort, counts, now, loading })`
  - `ProjectDetail({ project: Project; processes: RuntimeProcess[]; now: Date })` — Task 16에서 같은 시그니처로 완성

- [ ] **Step 1: 활동 상태 표시 정보** — `web/src/features/list/activity.ts`

```ts
import type { Activity } from '../../lib/status';

export const ACTIVITY: Record<Activity, { label: string; dot: string }> = {
  active: { label: '활성', dot: 'bg-live shadow-[0_0_8px] shadow-live/60' },
  dormant: { label: '휴면', dot: 'bg-warn' },
  stale: { label: '방치', dot: 'bg-bad/80' },
  unknown: { label: '기록 없음', dot: 'bg-muted/50' },
};
```

- [ ] **Step 2: 상단 바 구성요소**

`web/src/features/topbar/RefreshButton.tsx`:
```tsx
import { RefreshCw } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { ProgressRing } from '../../components/ui/ProgressRing';
import { ShimmerButton } from '../../components/ui/ShimmerButton';
import { api, ApiError } from '../../lib/api';
import { useRefreshStream } from '../../lib/hooks';

export function RefreshButton() {
  const { running, done, total, error } = useRefreshStream();
  const [pending, setPending] = useState(false);
  const busy = running || pending;

  const onClick = async (e: MouseEvent) => {
    setPending(true);
    try {
      await api.refresh(e.shiftKey);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 409)) console.error(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="text-xs text-bad" title={error}>
          새로고침 실패
        </span>
      )}
      <ShimmerButton onClick={onClick} disabled={busy} title="Shift+클릭: Claude 요약까지 전부 다시 생성">
        {busy ? <ProgressRing value={total ? done / total : 0} /> : <RefreshCw className="size-3.5" />}
        {busy ? `새로고침 중 ${done}/${total || '…'}` : '새로고침'}
      </ShimmerButton>
    </div>
  );
}
```

`web/src/features/topbar/HealthBanner.tsx`:
```tsx
import { TriangleAlert } from 'lucide-react';
import { useHealth } from '../../lib/hooks';

export function HealthBanner() {
  const { data } = useHealth();
  if (!data?.messages.length) return null;
  return (
    <div className="mx-6 mb-3 rounded-xl border border-warn/30 bg-warn/5 px-4 py-2.5 text-xs text-warn">
      {data.messages.map((m) => (
        <p key={m} className="flex items-center gap-2">
          <TriangleAlert className="size-3.5 shrink-0" /> {m}
        </p>
      ))}
    </div>
  );
}
```

`web/src/features/topbar/TopBar.tsx`:
```tsx
import { Search } from 'lucide-react';
import type { RefObject } from 'react';
import { Kbd } from '../../components/ui/Kbd';
import { NumberTicker } from '../../components/ui/NumberTicker';
import { useNow } from '../../lib/hooks';
import { relativeClock } from '../../lib/status';
import { RefreshButton } from './RefreshButton';

export function TopBar(props: {
  query: string;
  onQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  total: number;
  running: number;
  lastRefreshAt: string | null;
}) {
  const now = useNow(30_000);
  return (
    <header className="flex flex-wrap items-center gap-4 px-6 pt-5 pb-4">
      <h1 className="bg-gradient-to-b from-white to-muted bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
        Project Hub
      </h1>
      <label className="relative ml-2 flex w-72 items-center">
        <Search className="absolute left-3 size-4 text-muted" />
        <input
          ref={props.searchRef}
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          placeholder="프로젝트 검색…"
          className="w-full rounded-xl border border-line bg-panel/80 py-1.5 pr-12 pl-9 text-sm outline-none placeholder:text-muted/70 focus:border-accent/60"
        />
        <Kbd className="absolute right-2">⌘K</Kbd>
      </label>
      <div className="ml-auto flex items-center gap-5 text-xs text-muted">
        <span>
          <NumberTicker value={props.total} className="font-semibold text-fg" />개 프로젝트
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-live" />
          실행 중 <NumberTicker value={props.running} className="font-semibold text-fg" />
        </span>
        <span>{props.lastRefreshAt ? `${relativeClock(props.lastRefreshAt, now)} 갱신` : '갱신 기록 없음'}</span>
        <RefreshButton />
      </div>
    </header>
  );
}
```

- [ ] **Step 3: 목록 구성요소**

`web/src/features/list/FilterChips.tsx`:
```tsx
import { motion } from 'motion/react';
import { cn } from '../../lib/cn';
import { FILTERS, type Filter } from '../../lib/status';

const LABEL: Record<Filter, string> = {
  all: '전체',
  running: '● 실행 중',
  active: '활성',
  dormant: '휴면',
  stale: '방치',
  dirty: '미커밋',
};

export function FilterChips({ value, onChange, counts }: { value: Filter; onChange: (f: Filter) => void; counts: Record<Filter, number> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FILTERS.map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={cn(
            'relative rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted transition hover:text-fg',
            value === f && 'border-accent/40 text-fg',
          )}
        >
          {value === f && <motion.span layoutId="chip" className="absolute inset-0 -z-10 rounded-full bg-accent/15" />}
          {LABEL[f]} <span className="tabular-nums opacity-60">{counts[f]}</span>
        </button>
      ))}
    </div>
  );
}
```

`web/src/features/list/ProjectRow.tsx`:
```tsx
import type { Project } from '@hub/shared';
import { LiveBadge } from '../../components/ui/LiveBadge';
import { SpotlightRow } from '../../components/ui/SpotlightRow';
import { cn } from '../../lib/cn';
import { activityOf, displayLine, relativeTime } from '../../lib/status';
import { ACTIVITY } from './activity';

export function ProjectRow({ p, running, selected, onSelect, now }: { p: Project; running: boolean; selected: boolean; onSelect: () => void; now: Date }) {
  const act = activityOf(p.git?.lastCommitAt ?? null, now);
  const dirty = p.git?.dirtyCount ?? 0;
  return (
    <SpotlightRow active={selected} onClick={onSelect} className="cursor-pointer border-b border-line/70 px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <span className={cn('size-2 shrink-0 rounded-full', ACTIVITY[act].dot)} title={ACTIVITY[act].label} />
        <span className="truncate text-sm font-semibold">{p.name}</span>
        {running && <LiveBadge />}
        {dirty > 0 && <span className="text-[10px] text-warn" title={`미커밋 변경 ${dirty}개`}>±{dirty}</span>}
        <span className="ml-auto shrink-0 text-[11px] text-muted">{relativeTime(p.git?.lastCommitAt ?? null, now)}</span>
      </div>
      <p className="mt-0.5 truncate pl-4 text-xs text-muted">{displayLine(p)}</p>
    </SpotlightRow>
  );
}
```

`web/src/features/list/ProjectList.tsx`:
```tsx
import type { Project, RuntimeSnapshot } from '@hub/shared';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { isRunning, type Filter, type Sort } from '../../lib/status';
import { FilterChips } from './FilterChips';
import { ProjectRow } from './ProjectRow';

export function ProjectList(props: {
  projects: Project[];
  runtime: RuntimeSnapshot | undefined;
  selected: string | null;
  onSelect: (name: string) => void;
  filter: Filter;
  onFilter: (f: Filter) => void;
  sort: Sort;
  onSort: (s: Sort) => void;
  counts: Record<Filter, number>;
  now: Date;
  loading: boolean;
}) {
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => {
    if (props.selected) rowRefs.current.get(props.selected)?.scrollIntoView({ block: 'nearest' });
  }, [props.selected]);

  return (
    <aside className="flex min-h-0 flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <FilterChips value={props.filter} onChange={props.onFilter} counts={props.counts} />
        <select
          value={props.sort}
          onChange={(e) => props.onSort(e.target.value as Sort)}
          className="ml-auto rounded-lg border border-line bg-panel px-2 py-0.5 text-[11px] text-muted outline-none"
        >
          <option value="recent">최근 활동순</option>
          <option value="name">이름순</option>
          <option value="issues">이슈 많은 순</option>
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-panel/70 backdrop-blur">
        {props.loading &&
          Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="border-b border-line/70 px-3.5 py-3">
              <div className="h-3 w-32 animate-pulse rounded bg-white/5" />
              <div className="mt-2 h-2.5 w-56 animate-pulse rounded bg-white/5" />
            </div>
          ))}
        {!props.loading && props.projects.length === 0 && (
          <p className="p-6 text-center text-sm text-muted">조건에 맞는 프로젝트가 없습니다.</p>
        )}
        {props.projects.map((p) => (
          <motion.div
            key={p.name}
            layout="position"
            transition={{ duration: 0.2 }}
            ref={(el: HTMLDivElement | null) => {
              if (el) rowRefs.current.set(p.name, el);
              else rowRefs.current.delete(p.name);
            }}
          >
            <ProjectRow
              p={p}
              running={isRunning(p, props.runtime)}
              selected={p.name === props.selected}
              onSelect={() => props.onSelect(p.name)}
              now={props.now}
            />
          </motion.div>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: 상세 패널 자리표시** — `web/src/features/detail/ProjectDetail.tsx`

```tsx
import type { Project, RuntimeProcess } from '@hub/shared';

export function ProjectDetail({ project }: { project: Project; processes: RuntimeProcess[]; now: Date }) {
  return (
    <section className="min-h-0 overflow-y-auto rounded-2xl border border-line bg-panel/80 p-6">
      <h2 className="text-xl font-bold">{project.name}</h2>
    </section>
  );
}
```

- [ ] **Step 5: `web/src/App.tsx`를 실제 앱으로 교체**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { GridBackground } from './components/ui/GridBackground';
import { ProjectDetail } from './features/detail/ProjectDetail';
import { ProjectList } from './features/list/ProjectList';
import { HealthBanner } from './features/topbar/HealthBanner';
import { TopBar } from './features/topbar/TopBar';
import { useNow, useProjects, useRuntime } from './lib/hooks';
import { countFilters, filterProjects, sortProjects, type Filter, type Sort } from './lib/status';

export default function App() {
  const { data, isLoading, error } = useProjects();
  const { data: runtime } = useRuntime();
  const now = useNow();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [selected, setSelected] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const projects = data?.projects ?? [];
  const visible = useMemo(
    () => sortProjects(filterProjects(projects, filter, runtime, query, now), sort),
    [projects, filter, runtime, query, now, sort],
  );
  const counts = useMemo(() => countFilters(projects, runtime, now), [projects, runtime, now]);
  const current = visible.find((p) => p.name === selected) ?? visible[0] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [role="dialog"]')) {
        if (e.key === 'Escape' && target === searchRef.current) {
          setQuery('');
          searchRef.current?.blur();
        }
        if (target !== searchRef.current || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      if (!visible.length) return;
      const idx = current ? visible.indexOf(current) : -1;
      const next = Math.min(visible.length - 1, Math.max(0, idx + (e.key === 'ArrowDown' ? 1 : -1)));
      setSelected(visible[next].name);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, current]);

  const runningCount = Object.keys(runtime?.byProject ?? {}).length;

  return (
    <div className="flex h-full flex-col">
      <GridBackground />
      <TopBar
        query={query}
        onQuery={setQuery}
        searchRef={searchRef}
        total={projects.length}
        running={runningCount}
        lastRefreshAt={data?.lastRefreshAt ?? null}
      />
      <HealthBanner />
      {error && (
        <p className="mx-6 mb-3 rounded-xl border border-bad/30 bg-bad/5 px-4 py-2.5 text-xs text-bad">
          API 서버(127.0.0.1:4310)에 연결할 수 없습니다. 루트에서 <code>pnpm dev</code>로 서버가 실행 중인지 확인하세요.
        </p>
      )}
      <main className="grid min-h-0 flex-1 grid-cols-[400px_1fr] gap-4 px-6 pb-6">
        <ProjectList
          projects={visible}
          runtime={runtime}
          selected={current?.name ?? null}
          onSelect={setSelected}
          filter={filter}
          onFilter={setFilter}
          sort={sort}
          onSort={setSort}
          counts={counts}
          now={now}
          loading={isLoading || (projects.length === 0 && !!data?.refreshing)}
        />
        {current ? (
          <ProjectDetail key={current.name} project={current} processes={runtime?.byProject[current.name] ?? []} now={now} />
        ) : (
          <section className="grid place-items-center rounded-2xl border border-dashed border-line text-sm text-muted">
            {isLoading || data?.refreshing ? '프로젝트 정보를 모으는 중입니다…' : '왼쪽에서 프로젝트를 선택하세요.'}
          </section>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 6: 실제 서버와 함께 확인**

Run: `pnpm -F @hub/web typecheck && pnpm -F @hub/web test`, 그다음 루트에서 `pnpm dev` 후 `http://127.0.0.1:5199`를 연다.
Expected:
- 목록에 실제 프로젝트가 최근 활동순으로 나오고, 실행 중인 프로젝트에 LIVE 배지가 붙는다.
- 필터 칩 숫자가 맞고, 칩을 누르면 강조 배경이 미끄러지듯 이동한다.
- ⌘K로 검색창에 포커스되고, 검색창에서도 ↑↓로 선택이 이동하며, Esc를 누르면 검색어가 지워진다.
- 새로고침 버튼을 누르면 진행 링과 `n/total`이 올라가고, 끝나면 목록이 갱신된다. 연속으로 눌러도 오류가 나지 않는다(409 무시).

- [ ] **Step 7: 커밋**

```bash
git add web/src
git commit -m "feat(web): add top bar, refresh button and project list"
```

---

### Task 16: 상세 패널 — 헤더, 설명, 상태, GitHub, 커밋

**Files:**
- Modify: `web/src/features/detail/ProjectDetail.tsx` (완성)
- Create: `web/src/features/detail/AboutSection.tsx`, `StateSection.tsx`, `GitHubSection.tsx`, `CommitsSection.tsx`

**Interfaces:**
- Consumes: `Box`, `LiveBadge`, `Button`, `api.openEditor`, `relativeTime`, `activityOf`, `ACTIVITY`
- Produces: `ProjectDetail({ project, processes, now })` (Task 15와 같은 시그니처). Task 17의 `RuntimeBox({ project, processes })`가 들어갈 자리를 둔다. 이 Task에서는 import하지 않고 Task 17에서 연결한다.

- [ ] **Step 1: 섹션 컴포넌트 작성**

`AboutSection.tsx`:
```tsx
import type { Project } from '@hub/shared';
import { Box } from '../../components/ui/Box';

export function AboutSection({ p }: { p: Project }) {
  const s = p.summary;
  if (!s) {
    return (
      <Box title="이 프로젝트는">
        <p>{p.readmeExcerpt ?? 'README에서 가져올 설명이 없습니다.'}</p>
        <p className="mt-2 text-xs text-muted">Claude 요약이 아직 없습니다. 새로고침하면 작성됩니다.</p>
      </Box>
    );
  }
  return (
    <>
      <p className="mb-3 text-[15px] leading-relaxed text-fg">{s.oneLiner}</p>
      <Box title="이 프로젝트는">
        <p>{s.whatItIs}</p>
        {(s.features.length > 0 || s.structure.length > 0) && (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {s.features.length > 0 && (
              <div>
                <h4 className="mb-1 text-[11px] tracking-wider text-muted uppercase">주요 기능</h4>
                <ul className="list-disc space-y-0.5 pl-4">
                  {s.features.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </div>
            )}
            {s.structure.length > 0 && (
              <div>
                <h4 className="mb-1 text-[11px] tracking-wider text-muted uppercase">구성</h4>
                <ul className="space-y-0.5">
                  {s.structure.map((x) => (
                    <li key={x.path}>
                      <code className="font-mono text-xs text-accent2/90">{x.path}</code> <span className="text-fg/75">{x.role}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Box>
    </>
  );
}
```

`StateSection.tsx`:
```tsx
import type { Project } from '@hub/shared';
import { Box } from '../../components/ui/Box';

export function StateSection({ p }: { p: Project }) {
  const s = p.summary;
  if (!s || (!s.currentState && s.nextSteps.length === 0)) return null;
  return (
    <Box title="현재 상태 · 다음 할 일">
      {s.currentState && <p>{s.currentState}</p>}
      {s.nextSteps.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {s.nextSteps.map((n) => (
            <li key={n} className="flex gap-2">
              <span className="text-accent">→</span>
              {n}
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}
```

`GitHubSection.tsx`:
```tsx
import type { Item, Project } from '@hub/shared';
import { CircleDot, CircleCheck, GitPullRequest } from 'lucide-react';
import type { ReactNode } from 'react';
import { Box } from '../../components/ui/Box';
import { relativeTime } from '../../lib/status';

const MAX = 6;

function ItemList({ items, icon, empty, now, moreUrl }: { items: Item[]; icon: ReactNode; empty: string; now: Date; moreUrl: string }) {
  if (items.length === 0) return <p className="py-1 text-xs text-muted">{empty}</p>;
  return (
    <ul>
      {items.slice(0, MAX).map((i) => (
        <li key={i.number} className="border-b border-dashed border-line py-1.5 last:border-0">
          <a href={i.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 hover:text-white">
            <span className="mt-0.5 shrink-0">{icon}</span>
            <span className="min-w-0 flex-1">
              <span className="text-muted">#{i.number}</span> {i.title}
              {i.labels.map((l) => (
                <span key={l} className="ml-1.5 rounded bg-white/5 px-1.5 text-[10px] text-muted">{l}</span>
              ))}
            </span>
            <span className="shrink-0 text-[11px] text-muted">{relativeTime(i.closedAt ?? i.createdAt, now)}</span>
          </a>
        </li>
      ))}
      {items.length > MAX && (
        <li className="pt-1.5 text-xs">
          <a href={moreUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            외 {items.length - MAX}개 GitHub에서 보기 ↗
          </a>
        </li>
      )}
    </ul>
  );
}

export function GitHubSection({ p, now }: { p: Project; now: Date }) {
  const g = p.github;
  if (!p.githubRepo || !g) {
    return (
      <Box title="GitHub">
        <p className="text-xs text-muted">{p.githubRepo ? 'GitHub 정보를 아직 가져오지 못했습니다.' : 'GitHub 저장소가 연결되어 있지 않습니다 (로컬 전용).'}</p>
      </Box>
    );
  }
  return (
    <Box title={`열린 이슈 ${g.openIssues.length} · PR ${g.openPRs.length}`}>
      <ItemList items={g.openIssues} icon={<CircleDot className="size-3.5 text-live" />} empty="열린 이슈가 없습니다." now={now} moreUrl={`${g.url}/issues`} />
      {g.openPRs.length > 0 && (
        <div className="mt-2">
          <ItemList items={g.openPRs} icon={<GitPullRequest className="size-3.5 text-accent" />} empty="" now={now} moreUrl={`${g.url}/pulls`} />
        </div>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted hover:text-fg">최근 14일 닫힌 이슈 {g.recentlyClosedIssues.length}</summary>
        <ItemList
          items={g.recentlyClosedIssues}
          icon={<CircleCheck className="size-3.5 text-muted" />}
          empty="최근에 닫힌 이슈가 없습니다."
          now={now}
          moreUrl={`${g.url}/issues?q=is%3Aclosed`}
        />
      </details>
    </Box>
  );
}
```

`CommitsSection.tsx`:
```tsx
import type { Project } from '@hub/shared';
import { Box } from '../../components/ui/Box';
import { relativeTime } from '../../lib/status';

export function CommitsSection({ p, now }: { p: Project; now: Date }) {
  const git = p.git;
  if (!git) {
    return (
      <Box title="최근 커밋">
        <p className="text-xs text-muted">git 저장소가 아닙니다.</p>
      </Box>
    );
  }
  const max = Math.max(1, ...git.weeklyCommits);
  return (
    <Box title="최근 커밋" right={<span className="text-[11px] text-muted">26주 활동</span>}>
      <div className="mb-3 flex h-10 items-end gap-[3px]" title="주별 커밋 수 (오른쪽이 이번 주)">
        {git.weeklyCommits.map((n, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-gradient-to-t from-accent/40 to-accent2/70"
            style={{ height: n ? `${Math.max(12, (n / max) * 100)}%` : '3px', opacity: n ? 1 : 0.25 }}
            title={`${n}개`}
          />
        ))}
      </div>
      {git.recentCommits.length === 0 ? (
        <p className="text-xs text-muted">커밋이 없습니다.</p>
      ) : (
        <ul>
          {git.recentCommits.map((c) => (
            <li key={c.hash} className="flex gap-2 border-b border-dashed border-line py-1 text-xs last:border-0">
              <code className="shrink-0 font-mono text-muted">{c.hash.slice(0, 7)}</code>
              <span className="min-w-0 flex-1 truncate">{c.subject}</span>
              <span className="shrink-0 text-muted">{relativeTime(c.at, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: `ProjectDetail.tsx` 완성**

```tsx
import type { Project, RuntimeProcess } from '@hub/shared';
import { useMutation } from '@tanstack/react-query';
import { Code2, ExternalLink, TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Box } from '../../components/ui/Box';
import { Button } from '../../components/ui/Button';
import { LiveBadge } from '../../components/ui/LiveBadge';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { activityOf } from '../../lib/status';
import { ACTIVITY } from '../list/activity';
import { AboutSection } from './AboutSection';
import { CommitsSection } from './CommitsSection';
import { GitHubSection } from './GitHubSection';
import { StateSection } from './StateSection';

const STAGE_LABEL: Record<string, string> = { git: 'git', meta: '파일 읽기', github: 'GitHub', summary: 'Claude 요약' };
const CI: Record<string, { label: string; cls: string }> = {
  success: { label: 'CI ✓', cls: 'text-live' },
  failure: { label: 'CI ✗', cls: 'text-bad' },
  in_progress: { label: 'CI ●', cls: 'text-warn' },
};

function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-fg/75', className)}>{children}</span>;
}

export function ProjectDetail({ project: p, processes, now }: { project: Project; processes: RuntimeProcess[]; now: Date }) {
  const act = activityOf(p.git?.lastCommitAt ?? null, now);
  const openEditor = useMutation({ mutationFn: () => api.openEditor(p.name) });
  const git = p.git;
  const ci = p.github ? CI[p.github.ci.status] : undefined;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="min-h-0 overflow-y-auto rounded-2xl border border-line bg-panel/80 p-6 backdrop-blur"
    >
      <div className="flex items-center gap-2.5">
        <span className={cn('size-2.5 rounded-full', ACTIVITY[act].dot)} title={ACTIVITY[act].label} />
        <h2 className="text-xl font-bold tracking-tight">{p.name}</h2>
        {processes.length > 0 && <LiveBadge />}
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={() => openEditor.mutate()} disabled={openEditor.isPending} title={openEditor.error?.message}>
            <Code2 /> VS Code로 열기
          </Button>
          {p.github && (
            <a href={p.github.url} target="_blank" rel="noreferrer">
              <Button size="sm">
                <ExternalLink /> GitHub
              </Button>
            </a>
          )}
        </div>
      </div>

      <div className="mt-2 mb-4 flex flex-wrap gap-1.5">
        <Tag>{ACTIVITY[act].label}</Tag>
        {p.stack.map((s) => <Tag key={s}>{s}</Tag>)}
        {git && (
          <Tag>
            ⎇ {git.branch}
            {git.ahead > 0 && ` ↑${git.ahead}`}
            {git.behind > 0 && ` ↓${git.behind}`}
            {git.hasUpstream ? '' : ' · upstream 없음'}
          </Tag>
        )}
        {git && git.dirtyCount > 0 && <Tag className="text-warn">미커밋 {git.dirtyCount}</Tag>}
        {ci && p.github?.ci.url ? (
          <a href={p.github.ci.url} target="_blank" rel="noreferrer">
            <Tag className={ci.cls}>{ci.label}</Tag>
          </a>
        ) : (
          ci && <Tag className={ci.cls}>{ci.label}</Tag>
        )}
        {!p.isGit && <Tag className="text-muted">git 아님</Tag>}
      </div>

      {/* RUNTIME_BOX: Task 17에서 <RuntimeBox project={p} processes={processes} />로 교체 */}

      <AboutSection p={p} />
      <StateSection p={p} />
      <div className="grid gap-x-3 xl:grid-cols-2">
        <GitHubSection p={p} now={now} />
        <CommitsSection p={p} now={now} />
      </div>

      {Object.keys(p.errors).length > 0 && (
        <Box title={<span className="flex items-center gap-1.5 text-warn"><TriangleAlert className="size-3.5" /> 수집 경고</span>}>
          <ul className="space-y-1 text-xs">
            {Object.entries(p.errors).map(([stage, msg]) => (
              <li key={stage}>
                <b className="text-warn">{STAGE_LABEL[stage] ?? stage}</b> <span className="text-muted">{msg}</span>
              </li>
            ))}
          </ul>
        </Box>
      )}
    </motion.section>
  );
}
```

- [ ] **Step 3: 확인**

Run: `pnpm -F @hub/web typecheck`, 그다음 `pnpm dev` 상태에서 브라우저로 확인한다.
Expected:
- kr-by-claude처럼 GitHub 이슈가 있는 프로젝트를 선택하면 이슈 목록, 라벨, 상대 시간이 나오고 클릭하면 GitHub로 이동한다.
- 26주 막대와 최근 커밋 10개가 보인다.
- `btc-price-period-analysis`처럼 git이 아닌 폴더는 "git 아님" 태그와 빈 상태 문구가 나온다.
- "VS Code로 열기"를 누르면 VS Code가 해당 폴더를 연다.
- 프로젝트를 바꿀 때 패널이 살짝 페이드인된다.

- [ ] **Step 4: 커밋**

```bash
git add web/src/features/detail
git commit -m "feat(web): add project detail panel"
```

---

### Task 17: 실행 상태 박스 — 실행/중지/명령 편집/승인/로그

**Files:**
- Create: `web/src/features/detail/RuntimeBox.tsx`, `RunConfigDialog.tsx`, `LogViewer.tsx`
- Modify: `web/src/features/detail/ProjectDetail.tsx` (자리표시 주석을 `<RuntimeBox />`로 교체 + import 추가)

**Interfaces:**
- Consumes: `api.start/stop/saveRunConfig`, `ApiError`, `resolveRun`, `openUrl`, `useLogStream`, `Dialog`, `Button`, `LiveBadge`
- Produces: `RuntimeBox({ project: Project; processes: RuntimeProcess[] })`, `RunConfigDialog({ open, onClose, project, initial: ResolvedRun | null })`, `LogViewer({ name: string })`

- [ ] **Step 1: `LogViewer.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { useLogStream } from '../../lib/hooks';

export function LogViewer({ name }: { name: string }) {
  const text = useLogStream(name, true);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);
  return (
    <pre ref={ref} className="mt-3 max-h-64 overflow-auto rounded-lg border border-line bg-black/50 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-fg/80">
      {text || '허브가 실행한 로그가 아직 없습니다. 터미널에서 직접 띄운 프로세스의 로그는 볼 수 없습니다.'}
    </pre>
  );
}
```

- [ ] **Step 2: `RunConfigDialog.tsx`**

```tsx
import type { Project } from '@hub/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { api } from '../../lib/api';
import type { ResolvedRun } from '../../lib/runConfig';

const input = 'w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xs outline-none focus:border-accent/60';

export function RunConfigDialog({ open, onClose, project, initial }: { open: boolean; onClose: () => void; project: Project; initial: ResolvedRun | null }) {
  const qc = useQueryClient();
  const [command, setCommand] = useState('');
  const [cwd, setCwd] = useState('.');
  const [port, setPort] = useState('');

  // 열릴 때만 초기값을 채운다(initial은 렌더마다 새 객체라 의존성에 넣지 않는다).
  useEffect(() => {
    if (!open) return;
    setCommand(initial?.command ?? '');
    setCwd(initial?.cwd ?? '.');
    setPort(initial?.expectedPort ? String(initial.expectedPort) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = useMutation({
    mutationFn: () =>
      api.saveRunConfig(project.name, { command: command.trim(), cwd: cwd.trim() || '.', expectedPort: port ? Number(port) : null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
  });
  const portValid = port === '' || (/^\d+$/.test(port) && Number(port) > 0 && Number(port) < 65536);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${project.name} 실행 명령`}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="gradient" onClick={() => save.mutate()} disabled={!command.trim() || !portValid || save.isPending}>
            저장
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">명령 (로그인 셸 zsh -lc 로 실행)</span>
          <input className={input} value={command} onChange={(e) => setCommand(e.target.value)} placeholder="pnpm dev" autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">작업 디렉토리 (프로젝트 기준)</span>
            <input className={input} value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="." />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">예상 포트 (선택)</span>
            <input className={input} value={port} onChange={(e) => setPort(e.target.value)} placeholder="5173" inputMode="numeric" />
          </label>
        </div>
        {!portValid && <p className="text-xs text-bad">포트는 1~65535 사이 숫자여야 합니다.</p>}
        {save.error && <p className="text-xs text-bad">저장 실패: {save.error.message}</p>}
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 3: `RuntimeBox.tsx`**

```tsx
import type { Project, RunSuggestion, RuntimeProcess, StartResult } from '@hub/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Play, ScrollText, Square } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { LiveBadge } from '../../components/ui/LiveBadge';
import { api, ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { openUrl, resolveRun } from '../../lib/runConfig';
import { LogViewer } from './LogViewer';
import { RunConfigDialog } from './RunConfigDialog';

export function RuntimeBox({ project, processes }: { project: Project; processes: RuntimeProcess[] }) {
  const qc = useQueryClient();
  const run = resolveRun(project);
  const running = processes.length > 0;
  const [editing, setEditing] = useState(false);
  const [approval, setApproval] = useState<RunSuggestion | null>(null);
  const [stopTarget, setStopTarget] = useState<RuntimeProcess | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [result, setResult] = useState<StartResult | null>(null);

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ['runtime'] });
    qc.invalidateQueries({ queryKey: ['projects'] });
  };
  const start = useMutation({
    mutationFn: (approve: boolean) => api.start(project.name, approve),
    onMutate: () => setResult(null),
    onSuccess: (r) => {
      setResult(r);
      refetch();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 428) setApproval(e.body.suggestion);
      else setResult({ status: 'failed', logTail: e.message });
    },
  });
  const stop = useMutation({ mutationFn: (pid: number) => api.stop(project.name, pid), onSettled: refetch });

  return (
    <div
      className={cn(
        'mb-4 rounded-xl border p-3.5',
        running ? 'border-live/30 bg-[linear-gradient(90deg,rgba(52,211,153,0.08),transparent_60%)]' : 'border-line bg-black/20',
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] tracking-wider text-muted uppercase">
        실행 상태
        {running ? <LiveBadge label={`${processes.length}개 프로세스`} /> : <span className="tracking-normal normal-case">○ 중지됨</span>}
        <div className="ml-auto flex gap-1.5 tracking-normal normal-case">
          <Button size="sm" onClick={() => setShowLogs((v) => !v)}>
            <ScrollText /> 로그 {showLogs ? '닫기' : '보기'}
          </Button>
          {run && (
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil /> 명령 편집
            </Button>
          )}
        </div>
      </div>

      {running &&
        processes.map((proc) => (
          <div key={proc.pid} className="flex items-center gap-3 border-t border-dashed border-live/15 py-2 first:border-t-0">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg/80" title={proc.command}>
              {proc.command}
            </code>
            {!proc.launchedByHub && <span className="shrink-0 text-[10px] text-muted">직접 실행</span>}
            {proc.ports.length > 0 ? (
              proc.ports.map((port) => (
                <a key={port} href={openUrl(port)} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="live">localhost:{port} ↗</Button>
                </a>
              ))
            ) : (
              <span className="shrink-0 text-xs text-muted">포트 없음</span>
            )}
            <Button
              size="sm"
              onClick={() => (proc.launchedByHub ? stop.mutate(proc.pid) : setStopTarget(proc))}
              disabled={stop.isPending}
            >
              <Square /> 중지
            </Button>
          </div>
        ))}

      {!running && run && (
        <div className="flex flex-wrap items-center gap-3">
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg/80">{run.command}</code>
          <span className="text-xs text-muted">
            {run.expectedPort ? `예상 포트 ${run.expectedPort}` : '포트 미지정'}
            {run.source === 'suggested' && ' · Claude 추정'}
          </span>
          <Button variant="gradient" onClick={() => start.mutate(false)} disabled={start.isPending}>
            {start.isPending ? (
              <>
                <Loader2 className="animate-spin" /> 시작 중…
              </>
            ) : (
              <>
                <Play /> 실행
              </>
            )}
          </Button>
        </div>
      )}

      {!running && !run && (
        <div className="flex items-center gap-3 text-xs text-muted">
          상시 실행할 대상이 없거나 명령을 아직 모릅니다.
          <Button size="sm" onClick={() => setEditing(true)}>
            <Pencil /> 명령 등록
          </Button>
        </div>
      )}

      {result?.status === 'failed' && (
        <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-bad/30 bg-bad/5 p-2.5 font-mono text-[11px] whitespace-pre-wrap text-bad/90">
          실행에 실패했습니다.{'\n'}
          {result.logTail || '(로그 없음)'}
        </pre>
      )}
      {result?.status === 'port-conflict' && (
        <p className="mt-2 text-xs text-warn">
          포트 {result.port}를 이미 {result.holder.project ?? '다른 프로세스'}(pid {result.holder.pid}, {result.holder.command})가 사용 중입니다.
        </p>
      )}
      {result?.status === 'running-no-port' && (
        <p className="mt-2 text-xs text-muted">실행됐지만 30초 안에 열린 포트를 찾지 못했습니다. 봇이나 백그라운드 작업이면 정상입니다.</p>
      )}

      {showLogs && <LogViewer name={project.name} />}

      <RunConfigDialog open={editing} onClose={() => setEditing(false)} project={project} initial={run} />

      <Dialog
        open={approval !== null}
        onClose={() => setApproval(null)}
        title="이 명령으로 실행할까요?"
        footer={
          <>
            <Button onClick={() => setApproval(null)}>취소</Button>
            <Button
              onClick={() => {
                setApproval(null);
                setEditing(true);
              }}
            >
              편집
            </Button>
            <Button
              variant="gradient"
              onClick={() => {
                setApproval(null);
                start.mutate(true);
              }}
            >
              승인하고 실행
            </Button>
          </>
        }
      >
        <p className="text-muted">Claude가 README와 설정 파일을 보고 추정한 명령입니다. 승인하면 저장되고 다음부터는 바로 실행됩니다.</p>
        {approval && (
          <dl className="mt-3 grid grid-cols-[80px_1fr] gap-y-1.5 text-xs">
            <dt className="text-muted">명령</dt>
            <dd><code className="font-mono">{approval.command}</code></dd>
            <dt className="text-muted">위치</dt>
            <dd><code className="font-mono">{approval.cwd}</code></dd>
            <dt className="text-muted">예상 포트</dt>
            <dd>{approval.expectedPort ?? '없음'}</dd>
          </dl>
        )}
      </Dialog>

      <Dialog
        open={stopTarget !== null}
        onClose={() => setStopTarget(null)}
        title="직접 띄운 프로세스를 중지할까요?"
        footer={
          <>
            <Button onClick={() => setStopTarget(null)}>취소</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (stopTarget) stop.mutate(stopTarget.pid);
                setStopTarget(null);
              }}
            >
              중지
            </Button>
          </>
        }
      >
        <p className="text-muted">허브가 실행하지 않은 프로세스입니다. 터미널에서 실행 중인 작업이라면 그 작업이 종료됩니다.</p>
        {stopTarget && (
          <code className="mt-3 block truncate rounded-lg bg-bg p-2 font-mono text-xs">
            pid {stopTarget.pid} · {stopTarget.command}
          </code>
        )}
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 4: `ProjectDetail.tsx`에 연결**

import 추가:
```tsx
import { RuntimeBox } from './RuntimeBox';
```
자리표시 주석 한 줄을 교체:
```tsx
      <RuntimeBox project={p} processes={processes} />
```

- [ ] **Step 5: 브라우저 확인 (실제 프로세스 사용)**

Run: `pnpm -F @hub/web typecheck`, 그다음 `pnpm dev` 상태에서 확인한다.
Expected:
- 실행 중인 프로젝트(예: kr-by-claude)는 초록 박스에 프로세스별 `localhost:포트 ↗`가 나오고, 누르면 새 탭으로 열린다.
- 실행 중이 아닌 웹 프로젝트(예: `sam-kingdom-textgame`, vite)에서 **실행**을 누르면 승인 모달 → "승인하고 실행" → "시작 중…" 후 LIVE와 포트 링크로 바뀐다. **로그 보기**에 vite 출력이 실시간으로 나온다. **중지**를 누르면 확인 없이 멈추고 "○ 중지됨"으로 돌아간다(허브가 실행한 프로세스이므로).
- 명령 편집에서 잘못된 명령(예: `exit 1`)으로 저장하고 실행하면 빨간 실패 박스에 로그 꼬리가 나온다. 확인 후 원래 명령으로 되돌린다.
- 터미널에서 직접 띄운 프로세스의 **중지**는 확인 모달이 먼저 뜬다. 실제로 중지하지 말고 **취소**까지만 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add web/src/features/detail
git commit -m "feat(web): add runtime controls with approval, run config and logs"
```

---

### Task 18: README + 전체 검증

**Files:**
- Create: `README.md`

- [ ] **Step 1: `README.md` 작성**

````markdown
# Project Hub

`~/git/personal` 아래 개인 프로젝트를 한 화면에서 보는 로컬 대시보드.
프로젝트 설명(Claude 요약), 마지막 개발 시점, git 상태, GitHub 이슈·PR·CI, 로컬 실행 여부를 보여주고,
실행 중이면 바로 접속하고, 아니면 실행·중지할 수 있다.

## 실행

```bash
pnpm install
pnpm dev        # API 127.0.0.1:4310 + 웹 http://127.0.0.1:5199
```

처음 실행하면 DB가 비어 있어 자동으로 전체 수집을 시작한다(Claude 요약 때문에 수 분 걸린다).
이후에는 오른쪽 위 **새로고침** 버튼으로 수동 갱신한다. **Shift+클릭**하면 Claude 요약까지 전부 다시 만든다.

## 필요 조건

- Node 22.13+ (내장 `node:sqlite` 사용), pnpm
- `gh`가 github.com에 로그인되어 있을 것 (`gh auth login --hostname github.com`)
- `claude` CLI (요약 생성)
- `lsof`, `ps` (macOS 기본)

## 환경 변수

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `HUB_ROOT` | `~/git/personal` | 스캔할 루트 |
| `HUB_SUMMARY_MODEL` | `sonnet` | 요약에 쓸 Claude 모델 |
| `HUB_PORT` | `4310` | API 포트 (바꾸면 `web/vite.config.ts`의 proxy도 함께 수정) |

## 데이터

- `data/hub.db` — 수집 결과, 요약 캐시, 실행 명령, 실행 기록 (gitignore)
- `data/logs/<project>.log` — 허브가 실행한 프로세스의 출력. 실행할 때마다 덮어쓴다.

## 단축키

- `⌘K` 검색, `↑`/`↓` 프로젝트 이동, `Esc` 검색어 지우기

## 설계

- 스펙: `docs/superpowers/specs/2026-10-05-project-hub-design.md`
- 구현 계획: `docs/superpowers/plans/2026-10-05-project-hub.md`
````

- [ ] **Step 2: 전체 테스트와 타입 검사**

Run: `pnpm test && pnpm typecheck && pnpm -F @hub/web build`
Expected: 모든 패키지 PASS, 타입 오류 없음, 웹 빌드 성공.

- [ ] **Step 3: 종단 확인 체크리스트** (`pnpm dev` 상태, 브라우저)

- [ ] 프로젝트 수가 `~/git/personal`의 폴더 수(제외 규칙 적용)와 같다.
- [ ] 테스트용 빈 폴더 `~/git/personal/zz-hub-test`를 만들고 새로고침 → 목록에 생긴다. 폴더를 지우고 새로고침 → 목록에서 사라진다.
- [ ] 아무 프로젝트에 커밋이 생긴 뒤 새로고침하면 마지막 개발 시점과 요약이 갱신되고, 바뀌지 않은 프로젝트는 요약을 다시 만들지 않는다(서버 로그·소요 시간으로 확인).
- [ ] GitHub 이슈 수가 github.com 저장소 화면과 일치한다(한 프로젝트 표본 확인).
- [ ] 실행 중 감지·실행·중지·로그가 Task 17 Step 5대로 동작한다.
- [ ] API 서버를 끄면 웹 상단에 연결 오류 안내가 나오고, 다시 켜면 자동으로 회복된다.

- [ ] **Step 4: 커밋**

```bash
git add README.md
git commit -m "docs: add README"
```
