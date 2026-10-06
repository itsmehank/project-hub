# 4단계 계획 2 — 주간 리뷰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이번 주·지난주·2주 전에 무엇을 했고(커밋·닫힌 이슈·머지된 PR) 무엇을 이어갈지 보여주는 `#/week` 화면을 만든다.

**Architecture:** 새로고침 때 서버가 30일치 커밋(`GitInfo.windowCommits`)과 머지된 PR(`GitHubInfo.recentlyMergedPRs`)을 더 모으고, 닫힌 이슈 기간을 30일로 늘린다. 웹은 순수 함수 `weekRange`·`weeklyReview`(`web/src/lib/weekly.ts`)로 주를 자르고 저장소 단위로 중복을 없앤 뒤 `WeeklyPage`가 그린다. LLM 호출은 없다.

**Tech Stack:** pnpm 모노레포, zod 4, Hono, node:sqlite, React 19, react-query, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-phase4-design.md` (4장 기능 B, 8장, 9장)

## Global Constraints

- 주 = 월요일 00:00 ~ 다음 월요일 00:00, 브라우저 로컬 시간. 이번 주 / 지난주 / 2주 전만 이동한다.
- 수집 기간 30일. 커밋 최대 500개(닿으면 `windowTruncated: true`), 머지된 PR·닫힌 이슈 `per_page=50`(꽉 차면 `...Truncated: true`). 페이지는 넘기지 않는다.
- 새 필드는 모두 선택(`?`). 없으면 화면에 "다음 새로고침 후 표시됩니다".
- 저장소 키 = `githubRepo` → `remoteUrl` → 폴더별(계획 1의 `repoKeyOf`/`groupByRepo`). 커밋은 해시로, 이슈·PR은 `저장소 키 + 번호`로 중복 제거.
- 직전 주가 수집 기간보다 앞서면 증감률 대신 "비교 불가".
- 현재 미커밋은 "현재 시점 기준"이라고 쓰고 "새로 생긴"이라는 말을 쓰지 않는다.
- 이어갈 후보 최대 5개, 순서 ① 집중 ② 이 주 커밋 있음(많은 순) ③ 메모 있음. 보관 제외. 체크 상태는 저장하지 않는다.
- 상세 GitHub 상자 문구 "최근 14일 닫힌 이슈" → "최근 30일 닫힌 이슈".
- 첫 화면 26주 막대는 바꾸지 않는다. 주 정의가 다르다는 안내를 주간 리뷰 화면에 작게 적는다.
- 커밋 메시지에 Co-Authored-By 트레일러를 넣지 않는다.

## Review Focus

1. 일요일 23:59(로컬)에 연 이번 주는 그 주 월요일부터여야 하고, 월요일 00:00에는 새 주가 시작돼야 한다 → Task 3 `weekRange` 테스트.
2. 같은 저장소 두 폴더(DataBatcher)에서 커밋·닫힌 이슈·머지된 PR이 두 번 세지면 안 된다 → Task 3 테스트.
3. 이전 새로고침 데이터(새 필드 없음)만 있을 때 화면이 깨지지 않고 "다음 새로고침 후 표시됩니다"가 나와야 한다 → Task 3 `missingData` 테스트.
4. 수집 시작일보다 앞선 직전 주(2주 전 보기에서 오래된 데이터)는 0%가 아니라 "비교 불가" → Task 3 테스트(`windowSince` 기준).
5. 머지 안 된 닫힌 PR이 "머지된 PR"에 섞이면 안 된다 → Task 2 테스트.

---

## File Structure

| 파일 | 상태 | 책임 |
|---|---|---|
| `shared/src/index.ts` | 수정 | `GitInfo.windowCommits?`·`windowSince?`·`windowTruncated?`, `GitHubInfo.recentlyMergedPRs?`·`recentlyMergedTruncated?`·`recentlyClosedTruncated?` |
| `server/src/collectors/git.ts` (+`server/test/git.test.ts`) | 수정 | 30일 커밋 수집 |
| `server/src/collectors/github.ts` (+`server/test/github.test.ts`) | 수정 | 닫힌 이슈 30일·50개, 머지된 PR |
| `web/src/lib/weekly.ts` (+test) | 생성 | `weekRange`, `weeklyReview` |
| `web/src/lib/route.ts` (+test) | 수정 | `#/week`, `#/week/-1`, `#/week/-2` |
| `web/src/features/week/WeeklyPage.tsx` | 생성 | 주간 리뷰 화면 |
| `web/src/App.tsx`, `web/src/features/topbar/TopBar.tsx` | 수정 | 경로 연결, "주간 리뷰" 링크 |
| `web/src/features/detail/GitHubSection.tsx` | 수정 | 14일 → 30일 문구 |

---

### Task 1: 공유 타입 확장과 git 30일 커밋 수집

**Files:**
- Modify: `shared/src/index.ts`, `server/src/collectors/git.ts`
- Test: `server/test/git.test.ts`

**Interfaces:**
- Produces:
  - `GitInfo.windowCommits?: Commit[]` (최신순), `GitInfo.windowSince?: string` (수집 시작 ISO = 30일 전 로컬 00:00), `GitInfo.windowTruncated?: boolean`
  - `GitHubInfo.recentlyMergedPRs?: Item[]`, `GitHubInfo.recentlyMergedTruncated?: boolean`, `GitHubInfo.recentlyClosedTruncated?: boolean`
  - `export const WINDOW_DAYS = 30; export const WINDOW_COMMIT_LIMIT = 500;` (`server/src/collectors/git.ts`)
  - `export function windowStart(now: Date): Date` — 30일 전 로컬 00:00

- [ ] **Step 1: 실패하는 테스트** — `server/test/git.test.ts`의 `describe('collectGit')` 안에 추가

```ts
  it('collects commits of the last 30 days from local midnight, newest first', async () => {
    const repo = await makeRepo();
    const now = new Date('2026-10-06T12:00:00');
    await commit(repo, 'too old', '2026-09-05T23:00:00');
    await commit(repo, 'inside', '2026-09-07T09:00:00');
    await commit(repo, 'recent', '2026-10-05T09:00:00');
    const r = await collectGit(repo, runCommand, now);
    expect(r?.git.windowCommits?.map((c) => c.subject)).toEqual(['recent', 'inside']);
    expect(r?.git.windowSince).toBe(new Date('2026-09-06T00:00:00').toISOString());
    expect(r?.git.windowTruncated).toBe(false);
  });

  it('marks the window as truncated when the commit limit is reached', async () => {
    const run = fakeRunner((cmd, args) => {
      if (args.includes('rev-parse')) return { stdout: '/repo\n' };
      if (args.includes('--since') || args.some((a) => a.startsWith('--since='))) {
        if (args.includes('500')) return { stdout: Array.from({ length: 500 }, (_, i) => `h${i}\x1fs\x1f2026-10-01T00:00:00Z`).join('\n') };
      }
      return { stdout: '' };
    });
    const r = await collectGit('/repo', run, new Date('2026-10-06T12:00:00'), { skipRealpath: true });
    expect(r?.git.windowCommits).toHaveLength(500);
    expect(r?.git.windowTruncated).toBe(true);
  });
```

두 번째 테스트는 `realpath` 비교를 건너뛰는 옵션이 필요하다(가짜 경로라 실제 파일이 없다). `opts.skipRealpath`를 추가한다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm -F @hub/server exec vitest run test/git.test.ts`
Expected: FAIL — `windowCommits` undefined

- [ ] **Step 3: 공유 타입** — `shared/src/index.ts`

`GitInfoSchema`에 선택 필드 추가:

```ts
  // 4단계 주간 리뷰용 30일 커밋. 이전 새로고침 데이터에는 없다.
  windowCommits: z.array(CommitSchema).optional(),
  windowSince: z.string().optional(),
  windowTruncated: z.boolean().optional(),
```

`GitHubInfoSchema`에 선택 필드 추가:

```ts
  recentlyClosedTruncated: z.boolean().optional(),
  recentlyMergedPRs: z.array(ItemSchema).optional(),
  recentlyMergedTruncated: z.boolean().optional(),
```

- [ ] **Step 4: 수집 구현** — `server/src/collectors/git.ts`

```ts
export const WINDOW_DAYS = 30;
export const WINDOW_COMMIT_LIMIT = 500;

// 주간 리뷰는 브라우저 로컬 기준 달력 주를 쓰므로 수집 시작도 로컬 자정으로 맞춘다.
export function windowStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - WINDOW_DAYS);
}
```

`collectGit`의 `opts` 타입을 `{ fetch?: boolean; skipRealpath?: boolean }`로 바꾸고, realpath 비교 줄을 `if (!opts.skipRealpath && (await realpath(...)) !== (await realpath(dir))) return null;`로 바꾼다. `Promise.all`에 하나를 더한다.

```ts
  const windowSince = windowStart(now).toISOString();
  const [branchR, logR, statusR, upR, weeklyR, remoteR, windowR] = await Promise.all([
    // ...기존 6개 그대로
    git(['log', `--since=${windowSince}`, '--format=%H%x1f%s%x1f%cI', '-n', String(WINDOW_COMMIT_LIMIT)]),
  ]);
  const windowCommits = windowR.code === 0 ? parseLog(windowR.stdout) : [];
```

반환 `git` 객체에 추가:

```ts
      windowCommits,
      windowSince,
      windowTruncated: windowCommits.length >= WINDOW_COMMIT_LIMIT,
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm -F @hub/server exec vitest run test/git.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add shared server/src/collectors/git.ts server/test/git.test.ts
git commit -m "feat(server): collect 30-day window commits for the weekly review"
```

---

### Task 2: GitHub 닫힌 이슈 30일·머지된 PR 수집

**Files:**
- Modify: `server/src/collectors/github.ts`, `web/src/features/detail/GitHubSection.tsx`
- Test: `server/test/github.test.ts`

**Interfaces:**
- Consumes: Task 1의 `GitHubInfo` 선택 필드
- Produces: `collectGitHub`가 `recentlyClosedIssues`(30일), `recentlyClosedTruncated`, `recentlyMergedPRs`(`closedAt = merged_at`, 최신순), `recentlyMergedTruncated`를 채운다.

- [ ] **Step 1: 실패하는 테스트** — `server/test/github.test.ts`의 `describe('collectGitHub')` 안에 추가

```ts
  it('collects merged PRs of the last 30 days and issues closed in 30 days', async () => {
    const run = ghRunner({
      'issues?state=open': [],
      'pulls?state=open': [],
      'pulls?state=closed': [
        issue(10, { closed_at: '2026-10-01T00:00:00Z', merged_at: '2026-10-01T00:00:00Z' }),
        issue(11, { closed_at: '2026-10-02T00:00:00Z', merged_at: null }),
        issue(12, { closed_at: '2026-08-01T00:00:00Z', merged_at: '2026-08-01T00:00:00Z' }),
        issue(13, { closed_at: '2026-10-03T00:00:00Z', merged_at: '2026-10-03T00:00:00Z' }),
      ],
      'issues?state=closed': [issue(4, { closed_at: '2026-09-10T00:00:00Z' })],
      'actions/runs': { workflow_runs: [] },
    });
    const info = await collectGitHub('me/r', run, NOW);
    expect(info.recentlyMergedPRs?.map((i) => i.number)).toEqual([13, 10]);
    expect(info.recentlyMergedPRs?.[0].closedAt).toBe('2026-10-03T00:00:00Z');
    expect(info.recentlyMergedTruncated).toBe(false);
    expect(info.recentlyClosedIssues.map((i) => i.number)).toEqual([4]);
    expect(info.recentlyClosedTruncated).toBe(false);
    expect(run.calls.some((c) => c.args[3].includes('issues?state=closed') && c.args[3].includes('per_page=50'))).toBe(true);
  });

  it('marks merged PRs and closed issues as truncated when a full page comes back', async () => {
    const full = (base: number) => Array.from({ length: 50 }, (_, i) => issue(base + i, { closed_at: '2026-10-01T00:00:00Z', merged_at: '2026-10-01T00:00:00Z' }));
    const run = ghRunner({
      'issues?state=open': [],
      'pulls?state=open': [],
      'pulls?state=closed': full(100),
      'issues?state=closed': full(200),
      'actions/runs': { workflow_runs: [] },
    });
    const info = await collectGitHub('me/r', run, NOW);
    expect(info).toMatchObject({ recentlyMergedTruncated: true, recentlyClosedTruncated: true });
  });
```

기존 첫 테스트의 라우트에 `'pulls?state=closed': []`를 추가한다(없으면 404로 실패한다). 그 테스트의 `issue(5, { closed_at: '2026-09-01T00:00:00Z' })`는 이제 30일 안(NOW 2026-10-05 기준 9/5 이후가 아님 → 9/1은 밖)이라 기대값 `[4]`는 그대로다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm -F @hub/server exec vitest run test/github.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현** — `server/src/collectors/github.ts`

- `CLOSED_WINDOW_MS`를 `30 * 24 * 60 * 60 * 1000`으로, 주석 "닫힌 이슈·머지된 PR은 주간 리뷰를 위해 30일치를 모은다".
- `RawIssue`에 `merged_at?: string | null;` 추가.
- `const PAGE = 50;`
- `Promise.all`을 5개로:

```ts
  const [open, pulls, closed, closedPulls, runs] = await Promise.all([
    api<RawIssue[]>(run, `repos/${repo}/issues?state=open&per_page=50`),
    api<RawIssue[]>(run, `repos/${repo}/pulls?state=open&per_page=30`),
    api<RawIssue[]>(run, `repos/${repo}/issues?state=closed&since=${since}&per_page=${PAGE}`),
    api<RawIssue[]>(run, `repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${PAGE}`),
    api<{ workflow_runs?: RawRun[] }>(run, `repos/${repo}/actions/runs?per_page=20&exclude_pull_requests=true`),
  ]);
```

- 반환에 추가:

```ts
    recentlyClosedTruncated: closed.length >= PAGE,
    // 닫혔지만 머지되지 않은 PR은 뺀다. closedAt에는 머지 시각을 넣는다.
    recentlyMergedPRs: closedPulls
      .filter((p) => p.merged_at && p.merged_at >= since)
      .map((p) => ({ ...toItem(p), closedAt: p.merged_at! }))
      .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '')),
    recentlyMergedTruncated: closedPulls.length >= PAGE,
```

- `web/src/features/detail/GitHubSection.tsx`의 `최근 14일 닫힌 이슈`를 `최근 30일 닫힌 이슈`로.

- [ ] **Step 4: 통과 확인**

Run: `pnpm -F @hub/server test && pnpm typecheck`
Expected: PASS (refresh 테스트의 가짜 gh 라우트가 `pulls?state=closed`를 모르면 실패할 수 있다 → 해당 fake에 빈 배열 라우트를 추가한다)

- [ ] **Step 5: 커밋**

```bash
git add server web/src/features/detail/GitHubSection.tsx
git commit -m "feat(server): collect merged PRs and 30-day closed issues with truncation flags"
```

---

### Task 3: 주 계산과 주간 리뷰 집계 (웹 순수 함수)

**Files:**
- Create: `web/src/lib/weekly.ts`, `web/src/lib/weekly.test.ts`

**Interfaces:**
- Consumes: `groupByRepo`, `repoKeyOf` (계획 1), `isArchived` (계획 1)
- Produces:

```ts
export type WeekOffset = 0 | -1 | -2;
export interface WeekRange { start: Date; end: Date; label: string }   // label "9/29–10/5"
export function weekRange(now: Date, offset: number): WeekRange
export interface WeeklyRow { name: string; members: string[]; commits: number; subjects: string[]; closedIssues: number; mergedPRs: number; partial: boolean }
export interface ContinueItem { name: string; reason: 'focus' | 'commits' | 'note'; note: string; nextStep: string | null; commits: number }
export interface WeeklyReview {
  commits: number;
  prevCommits: number | null;      // null = 비교 불가
  changePct: number | null;        // prevCommits가 0이거나 null이면 null
  touched: number;                 // 커밋 1개 이상인 저장소 묶음 수
  closedIssues: number;
  mergedPRs: number;
  rows: WeeklyRow[];               // 커밋 많은 순, 같으면 이름순. 커밋·닫힌 이슈·머지 PR 중 하나라도 있으면 포함
  dirty: { name: string; dirty: number }[];
  continueList: ContinueItem[];    // 최대 5
  missingData: boolean;            // git 프로젝트가 있는데 windowCommits가 있는 프로젝트가 하나도 없음
  partial: boolean;                // 어느 행이든 잘림
}
export function weeklyReview(projects: Project[], range: WeekRange, prev: WeekRange): WeeklyReview
```

- [ ] **Step 1: 실패하는 테스트** — `web/src/lib/weekly.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { EMPTY_PERSONAL, type Commit, type Item, type Lifecycle, type Project } from '@hub/shared';
import { weekRange, weeklyReview } from './weekly';

const local = (s: string) => new Date(s); // 'YYYY-MM-DDTHH:mm' without Z = local time

describe('weekRange', () => {
  it('starts on Monday 00:00 local and ends the next Monday', () => {
    const r = weekRange(local('2026-10-08T15:00'), 0); // Thursday
    expect(r.start).toEqual(local('2026-10-05T00:00'));
    expect(r.end).toEqual(local('2026-10-12T00:00'));
    expect(r.label).toBe('10/5–10/11');
  });
  it('treats Sunday 23:59 as the end of the week and Monday 00:00 as a new week', () => {
    expect(weekRange(local('2026-10-11T23:59'), 0).start).toEqual(local('2026-10-05T00:00'));
    expect(weekRange(local('2026-10-12T00:00'), 0).start).toEqual(local('2026-10-12T00:00'));
  });
  it('moves back by whole weeks across month and year ends', () => {
    expect(weekRange(local('2026-10-08T12:00'), -1).label).toBe('9/28–10/4');
    expect(weekRange(local('2026-10-08T12:00'), -2).label).toBe('9/21–9/27');
    const ny = weekRange(local('2027-01-02T12:00'), 0); // Saturday
    expect(ny.start).toEqual(local('2026-12-28T00:00'));
    expect(ny.label).toBe('12/28–1/3');
  });
});

const NOW = local('2026-10-08T12:00');
const c = (hash: string, at: string, subject = hash): Commit => ({ hash, subject, at: local(at).toISOString() });
const item = (number: number, closedAt: string): Item => ({ number, title: '', url: '', labels: [], createdAt: '', closedAt: local(closedAt).toISOString() });

function p(
  name: string,
  o: { repo?: string; commits?: Commit[]; since?: string; closed?: Item[]; merged?: Item[]; dirty?: number; lifecycle?: Lifecycle; note?: string; next?: string; noWindow?: boolean; truncated?: boolean } = {},
): Project {
  return {
    name,
    isGit: true,
    githubRepo: o.repo ?? null,
    remoteUrl: null,
    git: {
      branch: 'main', lastCommitAt: null, dirtyCount: o.dirty ?? 0, hasUpstream: true, ahead: 0, behind: 0, recentCommits: [], weeklyCommits: [],
      ...(o.noWindow ? {} : { windowCommits: o.commits ?? [], windowSince: local(o.since ?? '2026-09-08T00:00').toISOString(), windowTruncated: o.truncated ?? false }),
    },
    github: o.closed || o.merged ? { url: '', openIssues: [], openPRs: [], recentlyClosedIssues: o.closed ?? [], recentlyMergedPRs: o.merged ?? [], ci: { status: 'none' } } : null,
    summary: o.next ? ({ nextSteps: [o.next] } as Project['summary']) : null,
    personal: { ...EMPTY_PERSONAL, lifecycle: o.lifecycle ?? null, note: o.note ?? '' },
  } as Project;
}

const week = weekRange(NOW, 0); // 10/5–10/11
const prev = weekRange(NOW, -1); // 9/28–10/4

describe('weeklyReview', () => {
  it('counts commits in the week, compares with the previous week, and dedupes the same repository', () => {
    const shared = [c('a1', '2026-10-06T10:00', '기능 추가'), c('a2', '2026-10-05T09:00'), c('a0', '2026-09-30T09:00')];
    const r = weeklyReview(
      [p('DataBatcher', { repo: 'me/db', commits: shared }), p('DataBatcher-main', { repo: 'me/db', commits: shared }), p('solo', { commits: [c('s1', '2026-10-07T09:00')] })],
      week,
      prev,
    );
    expect(r.commits).toBe(3);
    expect(r.prevCommits).toBe(1);
    expect(r.changePct).toBe(200);
    expect(r.touched).toBe(2);
    expect(r.rows[0]).toMatchObject({ name: 'DataBatcher', members: ['DataBatcher-main'], commits: 2, subjects: ['기능 추가', 'a2'] });
  });
  it('dedupes closed issues and merged PRs by repository and number', () => {
    const closed = [item(1, '2026-10-06T00:00'), item(2, '2026-09-29T00:00')];
    const merged = [item(7, '2026-10-07T00:00')];
    const r = weeklyReview([p('db', { repo: 'me/db', closed, merged }), p('db2', { repo: 'me/db', closed, merged })], week, prev);
    expect(r).toMatchObject({ closedIssues: 1, mergedPRs: 1 });
    expect(r.rows).toEqual([expect.objectContaining({ name: 'db', commits: 0, closedIssues: 1, mergedPRs: 1 })]);
  });
  it('says "not comparable" when the previous week starts before the collected window', () => {
    const r = weeklyReview([p('a', { commits: [c('x', '2026-09-23T09:00')], since: '2026-09-25T00:00' })], weekRange(NOW, -1), weekRange(NOW, -2));
    expect(r.prevCommits).toBeNull();
    expect(r.changePct).toBeNull();
  });
  it('compares two weeks ago with three weeks ago when the window covers it', () => {
    const r = weeklyReview([p('a', { commits: [c('x', '2026-09-22T09:00'), c('y', '2026-09-15T09:00'), c('z', '2026-09-16T09:00')], since: '2026-09-08T00:00' })], weekRange(NOW, -2), weekRange(NOW, -3));
    expect(r).toMatchObject({ commits: 1, prevCommits: 2, changePct: -50 });
  });
  it('flags missing data from refreshes before the window was collected', () => {
    expect(weeklyReview([p('old', { noWindow: true })], week, prev).missingData).toBe(true);
    expect(weeklyReview([p('new')], week, prev).missingData).toBe(false);
  });
  it('flags partial counts when a repository was truncated', () => {
    const r = weeklyReview([p('big', { commits: [c('x', '2026-10-06T09:00')], truncated: true })], week, prev);
    expect(r.partial).toBe(true);
    expect(r.rows[0].partial).toBe(true);
  });
  it('orders continue candidates focus → commits → note, excludes archive, max 5', () => {
    const r = weeklyReview(
      [
        p('noted', { note: '배포하기' }),
        p('busy', { commits: [c('b1', '2026-10-06T09:00'), c('b2', '2026-10-06T10:00')] }),
        p('little', { commits: [c('l1', '2026-10-06T09:00')], next: '테스트 추가' }),
        p('focus', { lifecycle: 'focus' }),
        p('gone', { lifecycle: 'archive', note: 'x', commits: [c('g1', '2026-10-06T09:00')] }),
        p('n2', { note: 'a' }),
        p('n3', { note: 'b' }),
      ],
      week,
      prev,
    );
    expect(r.continueList.map((x) => x.name)).toEqual(['focus', 'busy', 'little', 'n2', 'n3']);
    expect(r.continueList[2]).toMatchObject({ reason: 'commits', nextStep: '테스트 추가' });
  });
  it('lists current uncommitted changes', () => {
    expect(weeklyReview([p('a', { dirty: 3 }), p('b')], week, prev).dirty).toEqual([{ name: 'a', dirty: 3 }]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm -F @hub/web exec vitest run src/lib/weekly.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** — `web/src/lib/weekly.ts`

```ts
import type { Item, Project } from '@hub/shared';
import { isArchived } from './lifecycle';
import { groupByRepo, repoKeyOf } from './repo';

export type WeekOffset = 0 | -1 | -2;
export interface WeekRange {
  start: Date;
  end: Date;
  label: string;
}

const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

// 월요일 00:00(로컬)부터 다음 월요일 00:00까지. offset은 주 단위(0 = 이번 주, -1 = 지난주).
export function weekRange(now: Date, offset: number): WeekRange {
  const sinceMonday = (now.getDay() + 6) % 7;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday + offset * 7);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
  return { start, end, label: `${md(start)}–${md(last)}` };
}

export interface WeeklyRow {
  name: string;
  members: string[];
  commits: number;
  subjects: string[];
  closedIssues: number;
  mergedPRs: number;
  partial: boolean;
}
export interface ContinueItem {
  name: string;
  reason: 'focus' | 'commits' | 'note';
  note: string;
  nextStep: string | null;
  commits: number;
}
export interface WeeklyReview {
  commits: number;
  prevCommits: number | null;
  changePct: number | null;
  touched: number;
  closedIssues: number;
  mergedPRs: number;
  rows: WeeklyRow[];
  dirty: { name: string; dirty: number }[];
  continueList: ContinueItem[];
  missingData: boolean;
  partial: boolean;
}

const inRange = (iso: string | null | undefined, r: WeekRange) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= r.start.getTime() && t < r.end.getTime();
};

// 저장소 묶음 하나의 커밋(해시로 중복 제거, 최신순)
function groupCommits(group: Project[]) {
  const byHash = new Map<string, { subject: string; at: string }>();
  for (const p of group) for (const c of p.git?.windowCommits ?? []) byHash.set(c.hash, c);
  return [...byHash.values()].sort((a, b) => b.at.localeCompare(a.at));
}

// 묶음 안 여러 폴더의 같은 번호는 한 번만 센다(같은 저장소라 키가 같다).
function groupItems(group: Project[], pick: (p: Project) => Item[] | undefined, r: WeekRange): number {
  const seen = new Set<string>();
  for (const p of group) for (const i of pick(p) ?? []) if (inRange(i.closedAt, r)) seen.add(`${repoKeyOf(p)}#${i.number}`);
  return seen.size;
}

export function weeklyReview(projects: Project[], range: WeekRange, prev: WeekRange): WeeklyReview {
  const groups = groupByRepo(projects);
  let commits = 0;
  let prevCommits = 0;
  let closedIssues = 0;
  let mergedPRs = 0;
  const rows: WeeklyRow[] = [];
  const commitsByName = new Map<string, number>();

  for (const group of groups) {
    const all = groupCommits(group);
    const inWeek = all.filter((c) => inRange(c.at, range));
    const closed = groupItems(group, (p) => p.github?.recentlyClosedIssues, range);
    const merged = groupItems(group, (p) => p.github?.recentlyMergedPRs, range);
    commits += inWeek.length;
    prevCommits += all.filter((c) => inRange(c.at, prev)).length;
    closedIssues += closed;
    mergedPRs += merged;
    for (const p of group) commitsByName.set(p.name, inWeek.length);
    if (inWeek.length || closed || merged) {
      rows.push({
        name: group[0].name,
        members: group.slice(1).map((p) => p.name),
        commits: inWeek.length,
        subjects: inWeek.slice(0, 3).map((c) => c.subject),
        closedIssues: closed,
        mergedPRs: merged,
        partial: group.some((p) => p.git?.windowTruncated || p.github?.recentlyClosedTruncated || p.github?.recentlyMergedTruncated),
      });
    }
  }
  rows.sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name, 'en'));

  const collected = projects.filter((p) => p.git?.windowCommits !== undefined);
  // 직전 주 시작이 어느 프로젝트의 수집 시작보다 앞서면 그 주는 일부만 모은 것이라 비교하지 않는다.
  const comparable = collected.length > 0 && collected.every((p) => !p.git?.windowSince || new Date(p.git.windowSince).getTime() <= prev.start.getTime());
  const prevOrNull = comparable ? prevCommits : null;

  const candidates = projects.filter((p) => !isArchived(p));
  const rank = (p: Project): ContinueItem['reason'] | null =>
    p.personal.lifecycle === 'focus' ? 'focus' : (commitsByName.get(p.name) ?? 0) > 0 ? 'commits' : p.personal.note ? 'note' : null;
  const order = { focus: 0, commits: 1, note: 2 } as const;
  const continueList = candidates
    .map((p) => ({ p, reason: rank(p), commits: commitsByName.get(p.name) ?? 0 }))
    .filter((x): x is { p: Project; reason: ContinueItem['reason']; commits: number } => x.reason !== null)
    .sort((a, b) => order[a.reason] - order[b.reason] || b.commits - a.commits || a.p.name.localeCompare(b.p.name, 'en'))
    .slice(0, 5)
    .map(({ p, reason, commits: n }) => ({ name: p.name, reason, note: p.personal.note, nextStep: p.summary?.nextSteps[0] ?? null, commits: n }));

  return {
    commits,
    prevCommits: prevOrNull,
    changePct: prevOrNull ? Math.round(((commits - prevOrNull) / prevOrNull) * 100) : null,
    touched: rows.filter((r) => r.commits > 0).length,
    closedIssues,
    mergedPRs,
    rows,
    dirty: projects.filter((p) => (p.git?.dirtyCount ?? 0) > 0).map((p) => ({ name: p.name, dirty: p.git!.dirtyCount })),
    continueList,
    missingData: projects.some((p) => p.git) && collected.length === 0,
    partial: rows.some((r) => r.partial),
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm -F @hub/web exec vitest run src/lib/weekly.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add web/src/lib/weekly.ts web/src/lib/weekly.test.ts
git commit -m "feat(web): week range and weekly review aggregation with repository dedupe"
```

---

### Task 4: 주간 리뷰 경로와 화면

**Files:**
- Modify: `web/src/lib/route.ts`, `web/src/lib/route.test.ts`, `web/src/App.tsx`, `web/src/features/topbar/TopBar.tsx`
- Create: `web/src/features/week/WeeklyPage.tsx`

**Interfaces:**
- Consumes: `weekRange`, `weeklyReview`, `WeekOffset` (Task 3)
- Produces: `Route`에 `{ view: 'week'; offset: WeekOffset }`. `<WeeklyPage projects now lastRefreshAt offset onOffset onOpen />`

- [ ] **Step 1: 실패하는 경로 테스트** — `web/src/lib/route.test.ts`에 추가

```ts
  it('parses and builds weekly review routes', () => {
    expect(parseRoute('#/week')).toEqual({ view: 'week', offset: 0 });
    expect(parseRoute('#/week/-1')).toEqual({ view: 'week', offset: -1 });
    expect(parseRoute('#/week/-2')).toEqual({ view: 'week', offset: -2 });
    expect(parseRoute('#/week/-3')).toEqual({ view: 'home' });
    expect(toHash({ view: 'week', offset: 0 })).toBe('#/week');
    expect(toHash({ view: 'week', offset: -2 })).toBe('#/week/-2');
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm -F @hub/web exec vitest run src/lib/route.test.ts`
Expected: FAIL

- [ ] **Step 3: 경로 구현** — `web/src/lib/route.ts`

`Route`에 `| { view: 'week'; offset: WeekOffset }`를 추가하고 `import type { WeekOffset } from './weekly';`. `parseRoute` 맨 앞에:

```ts
  const w = hash.replace(/^#/, '').match(/^\/week(?:\/(-[12]))?\/?$/);
  if (w) return { view: 'week', offset: (w[1] ? Number(w[1]) : 0) as WeekOffset };
```

`toHash`에서 home 다음에:

```ts
  if (route.view === 'week') return route.offset ? `#/week/${route.offset}` : '#/week';
```

- [ ] **Step 4: WeeklyPage** — `web/src/features/week/WeeklyPage.tsx`

```tsx
import type { Project } from '@hub/shared';
import { useMutation } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Code2, TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { Box } from '../../components/ui/Box';
import { NumberTicker } from '../../components/ui/NumberTicker';
import { SpotlightCard } from '../../components/ui/SpotlightCard';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { relativeClock } from '../../lib/status';
import { weekRange, weeklyReview, type WeekOffset } from '../../lib/weekly';
import { RefreshButton } from '../topbar/RefreshButton';

const TITLE: Record<WeekOffset, string> = { 0: '이번 주', [-1]: '지난주', [-2]: '2주 전' };
const REASON = { focus: '집중', commits: '이 주 커밋', note: '메모' } as const;

function OpenEditor({ name }: { name: string }) {
  const m = useMutation({ mutationFn: () => api.openEditor(name) });
  return (
    <button onClick={() => m.mutate()} disabled={m.isPending} className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-fg">
      <Code2 className="size-3" /> 편집기에서 열기
    </button>
  );
}

export function WeeklyPage({
  projects,
  now,
  lastRefreshAt,
  offset,
  onOffset,
  onOpen,
}: {
  projects: Project[];
  now: Date;
  lastRefreshAt: string | null;
  offset: WeekOffset;
  onOffset: (o: WeekOffset) => void;
  onOpen: (name: string) => void;
}) {
  const range = weekRange(now, offset);
  const r = weeklyReview(projects, range, weekRange(now, offset - 1));
  const stale = !lastRefreshAt || now.getTime() - new Date(lastRefreshAt).getTime() > 12 * 3_600_000;
  const notYet = lastRefreshAt && new Date(lastRefreshAt).getTime() < range.start.getTime();
  const maxRow = Math.max(1, ...r.rows.map((x) => x.commits));
  const change = r.changePct === null ? '비교 불가' : `${r.changePct > 0 ? '+' : ''}${r.changePct}%`;

  return (
    <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="rounded-2xl border border-line bg-panel/80 p-6 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-extrabold tracking-tight">주간 리뷰</h2>
        <div className="flex items-center gap-1 text-sm">
          <button onClick={() => onOffset((offset - 1) as WeekOffset)} disabled={offset === -2} aria-label="이전 주" className="rounded-lg p-1 text-muted hover:text-fg disabled:opacity-30">
            <ChevronLeft className="size-4" />
          </button>
          <span className="font-medium">{TITLE[offset]}</span>
          <span className="text-muted">{range.label}</span>
          <button onClick={() => onOffset((offset + 1) as WeekOffset)} disabled={offset === 0} aria-label="다음 주" className="rounded-lg p-1 text-muted hover:text-fg disabled:opacity-30">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className={cn('mt-3 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2 text-xs', stale ? 'border-warn/30 bg-warn/5 text-warn' : 'border-line text-muted')}>
        {stale && <TriangleAlert className="size-3.5" />}
        데이터 기준: {lastRefreshAt ? `${relativeClock(lastRefreshAt, now)} 새로고침` : '새로고침 기록 없음'}
        {notYet && <span>· 이 주의 데이터가 아직 수집되지 않았습니다</span>}
        <span className="ml-auto">
          <RefreshButton />
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted">주는 월요일 0시부터 일요일 끝까지입니다. 첫 화면의 26주 막대는 새로고침 시각 기준 7일 묶음이라 숫자가 조금 다를 수 있습니다.</p>

      {r.missingData ? (
        <p className="mt-6 rounded-xl border border-dashed border-line py-10 text-center text-sm text-muted">주간 리뷰용 데이터는 다음 새로고침 후 표시됩니다.</p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
            <SpotlightCard className="p-3">
              <NumberTicker value={r.commits} className="block text-2xl font-bold" />
              <span className="text-[11px] text-muted">
                커밋 · 직전 주 대비 <b className={cn('font-medium', r.changePct === null ? 'text-muted' : r.changePct >= 0 ? 'text-live' : 'text-warn')}>{change}</b>
              </span>
            </SpotlightCard>
            <SpotlightCard className="p-3">
              <NumberTicker value={r.touched} className="block text-2xl font-bold" />
              <span className="text-[11px] text-muted">손댄 프로젝트</span>
            </SpotlightCard>
            <SpotlightCard className="p-3">
              <NumberTicker value={r.closedIssues} className="block text-2xl font-bold" />
              <span className="text-[11px] text-muted">닫힌 이슈</span>
            </SpotlightCard>
            <SpotlightCard className="p-3">
              <NumberTicker value={r.mergedPRs} className="block text-2xl font-bold" />
              <span className="text-[11px] text-muted">머지된 PR</span>
            </SpotlightCard>
          </div>
          {r.partial && <p className="mt-1.5 text-[11px] text-warn">일부 저장소는 수집 상한에 닿아 일부만 집계했습니다.</p>}

          <Box title="프로젝트별 활동" className="mt-4">
            {r.rows.length === 0 && <p className="text-xs text-muted">이 주에는 활동 기록이 없습니다.</p>}
            <ul className="space-y-2.5">
              {r.rows.map((row) => (
                <li key={row.name} className="text-xs">
                  <div className="flex items-center gap-2">
                    <button onClick={() => onOpen(row.name)} className="w-44 shrink-0 truncate text-left font-medium hover:text-white">
                      {row.name}
                      {row.members.length > 0 && <span className="ml-1 font-normal text-muted">({row.members.join(', ')} 포함)</span>}
                    </button>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <span className="block h-full rounded-full bg-gradient-to-r from-accent to-accent2" style={{ width: `${(row.commits / maxRow) * 100}%` }} />
                    </span>
                    <span className="w-40 shrink-0 text-right text-muted">
                      커밋 {row.commits} · 이슈 {row.closedIssues} · PR {row.mergedPRs}
                      {row.partial && <span className="text-warn"> · 일부만 집계</span>}
                    </span>
                  </div>
                  {row.subjects.length > 0 && (
                    <ul className="mt-1 ml-[11.5rem] space-y-0.5 text-muted">
                      {row.subjects.map((s, i) => (
                        <li key={i} className="truncate">· {s}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </Box>

          <Box title="이어갈 후보" className="mt-3">
            {r.continueList.length === 0 && <p className="text-xs text-muted">집중 태그, 이 주 커밋, 메모가 있는 프로젝트가 없습니다.</p>}
            <ul className="space-y-2">
              {r.continueList.map((x) => (
                <li key={x.name} className="rounded-lg bg-white/[0.03] px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{x.name}</span>
                    <span className="rounded-full border border-line px-1.5 py-px text-[10px] text-muted">{REASON[x.reason]}</span>
                    <span className="ml-auto flex gap-3">
                      <button onClick={() => onOpen(x.name)} className="text-[11px] text-accent hover:underline">상세 보기</button>
                      <OpenEditor name={x.name} />
                    </span>
                  </div>
                  {x.note && <p className="mt-1 text-fg/85">메모: {x.note}</p>}
                  {x.nextStep && <p className="mt-0.5 text-muted">다음 할 일: {x.nextStep}</p>}
                </li>
              ))}
            </ul>
          </Box>

          <Box title="현재 미커밋 · 현재 시점 기준" className="mt-3 mb-0">
            {r.dirty.length === 0 && <p className="text-xs text-muted">커밋하지 않은 변경이 있는 프로젝트가 없습니다.</p>}
            <div className="flex flex-wrap gap-1.5">
              {r.dirty.map((d) => (
                <button key={d.name} onClick={() => onOpen(d.name)} className="rounded-md border border-line px-2 py-0.5 text-[11px] hover:border-warn/50">
                  {d.name} <span className="text-warn">±{d.dirty}</span>
                </button>
              ))}
            </div>
          </Box>
        </>
      )}
    </motion.section>
  );
}
```

- [ ] **Step 5: App·TopBar 연결**

`web/src/App.tsx`:
- import `WeeklyPage`.
- `screenKey`를 `route.view === 'home' ? 'home' : route.view === 'week' ? 'week' : \`${route.view}:${route.name}\``로.
- `selectedName`을 `route.view === 'project' || route.view === 'issues' ? route.name : null`로.
- `main` 분기에서 home 다음에:

```tsx
  } else if (route.view === 'week') {
    main = (
      <WeeklyPage
        projects={projects}
        now={now}
        lastRefreshAt={data?.lastRefreshAt ?? null}
        offset={route.offset}
        onOffset={(offset) => navigate({ view: 'week', offset }, { replace: true })}
        onOpen={openProject}
      />
    );
```

- `<TopBar>`에 `onWeek={() => navigate({ view: 'week', offset: 0 })}` 추가.

`web/src/features/topbar/TopBar.tsx`: props에 `onWeek: () => void;`, `</h1>` 다음에:

```tsx
      <a
        href="#/week"
        onClick={(e) => {
          e.preventDefault();
          props.onWeek();
        }}
        className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition hover:border-accent/50 hover:text-fg"
      >
        주간 리뷰
      </a>
```

- [ ] **Step 6: 확인**

Run: `pnpm test && pnpm typecheck && pnpm -F @hub/web build`
Expected: PASS

브라우저: http://127.0.0.1:5199/#/week → 새로고침 전이면 "다음 새로고침 후 표시됩니다", 이전·다음 주 버튼으로 `#/week/-1`, `#/week/-2` 이동, -2에서 이전 버튼 비활성.

- [ ] **Step 7: 커밋**

```bash
git add web/src
git commit -m "feat(web): weekly review page with week navigation and top bar link"
```

---

## Self-Review 결과

- 4.1 주 정의 → Task 3·4. 4.2 수집 → Task 1·2(잘림 표시, 30일 문구 포함). 4.3 계산·중복 제거·구성 → Task 3. 4.4 화면·경로·데이터 기준 줄 → Task 4. 9장 웹 테스트(weekRange 경계, weeklyReview 중복 제거·직전 주·2주 전·비교 불가·후보 순서) → Task 3, 서버 수집 테스트 → Task 1·2.
- `windowSince`는 스펙에 없지만 "직전 주가 수집 기간보다 앞서면 비교 불가"를 판단하려면 수집 시작 시각이 필요해 추가한다.
- 실제 데이터 확인에는 새로고침 1회가 필요하다. 새로고침은 Claude 요약·인사이트 재생성을 부를 수 있으므로 계획 3(프롬프트 v3로 인사이트 재분석 1회)까지 끝낸 뒤 한 번만 실행한다.
