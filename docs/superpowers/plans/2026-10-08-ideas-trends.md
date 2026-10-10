# 5단계 — 목록 접기, 커밋 잔디, 최근 이슈, 과감한 아이디어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 왼쪽 목록을 접을 수 있게 하고, 26주 커밋을 하루 단위 잔디로 바꾸며, 웹 검색으로 최근 이슈를 날짜별로 쌓고, 신규 아이디어에 "과감하게" 버전을 더한다.

**Architecture:** 날짜 문자열 함수(`toLocalDate`, `daysBetween`)는 `shared`에 둔다. 서버는 기존 26주 커밋 로그로 `dailyCommits`를 만들고, `TrendsManager`가 `claude -p`(WebSearch·WebFetch만 허용)로 이슈를 모아 `trend_digests`에 하루 한 행씩 쌓는다. 인사이트 프롬프트 v4는 `wildIdeas`와 최근 이슈 절을 더한다. 웹은 순수 함수(`listPanel.ts`, `heatmap.ts`, `trends.ts`)를 테스트로 고정한 뒤 컴포넌트가 그린다.

**Tech Stack:** pnpm 모노레포, zod 4, Hono, node:sqlite, React 19, react-query, Tailwind v4, motion, lucide-react, vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-ideas-trends-design.md`

## Global Constraints

- DB는 새 테이블만 추가(`trend_digests`). 새 필드는 선택(`?`)이거나 기본값이 있어 이전 데이터를 깨뜨리지 않는다.
- 날짜 문자열은 `YYYY-MM-DD`, 서버·브라우저 모두 로컬 날짜(`shared`의 `toLocalDate`).
- 이슈 수집 Claude에는 `WebSearch`, `WebFetch`만 허용한다. 이슈 링크는 http/https만. 화면에는 텍스트로만 그린다.
- 이슈 수집: 그날 첫 새로고침이 끝나면 자동(오늘 묶음이 없고, 오늘 자동 수집이 실패한 적이 없을 때). 서버 시작 때는 하지 않는다. 수동 버튼은 언제나.
- 제외 주제: 정치·선거·정당·외교 분쟁·전쟁·사건사고·연예 가십·주가 단기 등락 전망.
- `INSIGHTS_PROMPT_VERSION = 4`. 자동 재분석 해시에 이슈·태그·결정을 넣지 않는다.
- 단축키 `⌘B`/`Ctrl+B` = 목록 접기. 접힌 폭 56px, 펼친 폭 400px. 상태는 `localStorage['hub.listCollapsed']`.
- 잔디: 182일, 보관 제외, 저장소 묶음 대표만, 툴팁 `10/6(화) · 3건` / `10/6(화) · 커밋 없음`.
- 환경 변수 `HUB_TRENDS_MODEL`(기본 `sonnet`).
- 화면 문구 한국어. 커밋 메시지에 Co-Authored-By 트레일러를 넣지 않는다.

## Review Focus

1. 어제 새로고침한 데이터로 오늘 연 잔디는 하루씩 밀려 오늘 칸이 0이어야 한다(칸 날짜가 어긋나면 툴팁이 거짓말을 한다) → Task 3 `dailyTotals` 테스트.
2. 이슈 결과에 `javascript:` 등 비 http 링크나 중복 제목이 섞이면 버리고, 전부 버려지면 실패로 기록해야 한다 → Task 4 `sanitizeTrendItems` 테스트.
3. 오늘 자동 수집이 실패한 뒤 새로고침을 여러 번 해도 Sonnet을 다시 부르지 않아야 한다 → Task 4 `maybeCollect` 테스트.
4. 이전에 저장된 인사이트(`wildIdeas` 없음)를 읽어도 웹에 `wildIdeas: []`가 내려가야 한다 → Task 6 `stored()` 테스트.
5. 연말(12/29~1/4)에 걸친 잔디 열과 월 라벨 → Task 3 `heatmapGrid` 테스트.

---

## File Structure

| 파일 | 상태 | 책임 |
|---|---|---|
| `shared/src/dates.ts` (+test) | 생성 | `toLocalDate`, `daysBetween`, `addDays` |
| `shared/src/index.ts` | 수정 | `GitInfo.dailyCommits?`·`dailyUntil?`, 이슈 스키마, `wildIdeas`, 재export |
| `shared/src/insightItems.ts` | 수정 | `WildIdeaSchema` |
| `shared/src/trends.ts` | 생성 | `TREND_CATEGORIES`, `TrendItemSchema`, `TrendsResultSchema`, `TrendDigest`, `TrendsResponse` |
| `web/src/lib/listPanel.ts` (+test) | 생성 | 접힘 상태 읽기·쓰기, 단축키 판별 |
| `web/src/App.tsx`, `web/src/features/list/ProjectList.tsx` | 수정 | 접기 |
| `server/src/collectors/git.ts` (+test) | 수정 | `bucketDaily` |
| `web/src/lib/heatmap.ts` (+test) | 생성 | `dailyTotals`, `heatmapGrid`, `dayLabel` |
| `web/src/features/home/CommitHeatmap.tsx` | 생성 | 잔디 |
| `server/src/collectors/claude.ts` | 수정 | `tools` 옵션 |
| `server/src/db.ts` | 수정 | `trend_digests` |
| `server/src/trends.ts` (+`server/test/trends.test.ts`) | 생성 | 프롬프트, 결과 정리, `TrendsManager` |
| `server/src/app.ts`, `server/src/main.ts` | 수정 | 이슈 API, 연결 |
| `web/src/lib/trends.ts` (+test) | 생성 | 날짜 라벨, 분야 거르기 |
| `web/src/features/home/TrendsBlock.tsx` | 생성 | 최근 이슈 블록 |
| `server/src/insights.ts` (+test) | 수정 | 프롬프트 v4, `stored()` 정규화 |
| `web/src/features/home/IdeasSection.tsx` | 생성 | 기본/과감하게 탭 |
| `web/src/features/home/HomePage.tsx` | 수정 | 잔디·아이디어 탭·이슈 블록 배치 |
| `README.md` | 수정 | 새 기능, `HUB_TRENDS_MODEL` |

---

### Task 1: 왼쪽 목록 접기

**Files:**
- Create: `web/src/lib/listPanel.ts`, `web/src/lib/listPanel.test.ts`
- Modify: `web/src/App.tsx`, `web/src/features/list/ProjectList.tsx`

**Interfaces:**
- Produces:
  - `readCollapsed(storage: Pick<Storage, 'getItem'> | null): boolean`
  - `writeCollapsed(storage: Pick<Storage, 'setItem'> | null, value: boolean): void`
  - `isCollapseShortcut(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): boolean`
  - `LIST_WIDTH = { open: 400, collapsed: 56 }`
  - `ProjectList` props 추가: `collapsed: boolean; onToggle: () => void; runningCount: number`

- [ ] **Step 1: 실패하는 테스트** — `web/src/lib/listPanel.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { isCollapseShortcut, readCollapsed, writeCollapsed } from './listPanel';

const key = (k: string, o: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...o,
});

describe('listPanel', () => {
  it('reads and writes the collapsed state, defaulting to open on errors', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readCollapsed(storage)).toBe(false);
    writeCollapsed(storage, true);
    expect(readCollapsed(storage)).toBe(true);
    expect(readCollapsed(null)).toBe(false);
    expect(readCollapsed({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
    expect(() => writeCollapsed({ setItem: () => { throw new Error('blocked'); } }, true)).not.toThrow();
  });
  it('recognizes Cmd+B and Ctrl+B only', () => {
    expect(isCollapseShortcut(key('b', { metaKey: true }))).toBe(true);
    expect(isCollapseShortcut(key('B', { ctrlKey: true }))).toBe(true);
    expect(isCollapseShortcut(key('b'))).toBe(false);
    expect(isCollapseShortcut(key('b', { metaKey: true, shiftKey: true }))).toBe(false);
    expect(isCollapseShortcut(key('k', { metaKey: true }))).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm -F @hub/web exec vitest run src/lib/listPanel.test.ts` → FAIL(모듈 없음)

- [ ] **Step 3: 구현** — `web/src/lib/listPanel.ts`

```ts
const KEY = 'hub.listCollapsed';
export const LIST_WIDTH = { open: 400, collapsed: 56 } as const;

// 브라우저 저장소는 막혀 있을 수 있다(사생활 보호 모드 등). 실패하면 펼친 상태로 본다.
export function readCollapsed(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return storage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function writeCollapsed(storage: Pick<Storage, 'setItem'> | null, value: boolean): void {
  try {
    storage?.setItem(KEY, value ? '1' : '0');
  } catch {
    // 저장하지 못해도 화면 동작에는 영향이 없다.
  }
}

export const isCollapseShortcut = (e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }) =>
  (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b';
```

- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS

- [ ] **Step 5: App 연결** — `web/src/App.tsx`
  - import `{ LIST_WIDTH, isCollapseShortcut, readCollapsed, writeCollapsed } from './lib/listPanel'`.
  - 상태: `const [collapsed, setCollapsed] = useState(() => readCollapsed(typeof localStorage === 'undefined' ? null : localStorage));`
  - `const toggleList = () => setCollapsed((v) => { writeCollapsed(localStorage, !v); return !v; });`
  - 키 처리(`onKey`) 맨 앞에:

```ts
      if (isCollapseShortcut(e)) {
        e.preventDefault();
        toggleList();
        return;
      }
```

  - 기존 `⌘K` 처리에서 접혀 있으면 먼저 펼친다:

```ts
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (collapsed) {
          setCollapsed(false);
          writeCollapsed(localStorage, false);
        }
        // 펼친 뒤 그려진 검색창에 포커스한다.
        requestAnimationFrame(() => {
          searchRef.current?.focus();
          searchRef.current?.select();
        });
        return;
      }
```

  (검색창은 상단 바에 있어 접힘과 무관하게 항상 보인다. 펼치는 이유는 검색 결과 목록을 보이기 위해서다.)
  - `<main className="grid min-h-0 flex-1 grid-cols-[400px_1fr] gap-4 px-6 pb-6">`를

```tsx
      <main
        className="grid min-h-0 flex-1 gap-4 px-6 pb-6 transition-[grid-template-columns] duration-200"
        style={{ gridTemplateColumns: `${collapsed ? LIST_WIDTH.collapsed : LIST_WIDTH.open}px 1fr` }}
      >
```

  - `<ProjectList ...>`에 `collapsed={collapsed} onToggle={toggleList} runningCount={runningCount}`.

- [ ] **Step 6: ProjectList** — `web/src/features/list/ProjectList.tsx`
  - import `{ PanelLeftClose, PanelLeftOpen, Play } from 'lucide-react'`, `{ Kbd } from '../../components/ui/Kbd'`.
  - props 타입에 `collapsed: boolean; onToggle: () => void; runningCount: number;`
  - `return (` 바로 앞에 접힌 상태:

```tsx
  if (props.collapsed) {
    return (
      <aside className="flex min-h-0 flex-col items-center gap-3 rounded-xl border border-line bg-panel/70 py-3 backdrop-blur">
        <button onClick={props.onToggle} aria-label="프로젝트 목록 펼치기 (⌘B)" title="프로젝트 목록 펼치기 (⌘B)" className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-fg">
          <PanelLeftOpen className="size-4" />
        </button>
        {props.runningCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-live" title={`실행 중 ${props.runningCount}개`}>
            <Play className="size-2.5 fill-current" />
            {props.runningCount}
          </span>
        )}
        <button onClick={props.onToggle} aria-hidden tabIndex={-1} className="w-full flex-1" />
      </aside>
    );
  }
```

  - 펼친 상태 머리 줄(`<div className="flex items-start gap-2">`) 맨 앞에 접기 버튼:

```tsx
        <button onClick={props.onToggle} aria-label="프로젝트 목록 접기 (⌘B)" title="프로젝트 목록 접기 (⌘B)" className="mt-0.5 shrink-0 rounded-lg p-1 text-muted hover:bg-white/5 hover:text-fg">
          <PanelLeftClose className="size-4" />
        </button>
```

- [ ] **Step 7: 확인** — `pnpm -F @hub/web test && pnpm -F @hub/web typecheck && pnpm -F @hub/web build` → PASS
- [ ] **Step 8: 커밋** — `git commit -m "feat(web): collapsible project list with Cmd+B"`

---

### Task 2: 날짜 함수와 일별 커밋 수집

**Files:**
- Create: `shared/src/dates.ts`, `shared/src/dates.test.ts`
- Modify: `shared/src/index.ts`, `server/src/collectors/git.ts`, `server/test/git.test.ts`

**Interfaces:**
- Produces:
  - `toLocalDate(d: Date): string` — `'YYYY-MM-DD'`(로컬)
  - `daysBetween(from: string, to: string): number` — `to - from` 일 수(정수)
  - `addDays(date: string, n: number): string`
  - `GitInfo.dailyCommits?: number[]`(길이 182, 마지막 = `dailyUntil`), `GitInfo.dailyUntil?: string`
  - `server/src/collectors/git.ts`: `export const DAYS = 182; export function bucketDaily(isoDates: string[], now: Date): { dailyCommits: number[]; dailyUntil: string }`

- [ ] **Step 1: 실패하는 테스트**

`shared/src/dates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, toLocalDate } from './index';

describe('dates', () => {
  it('formats local dates and counts days across month and year ends', () => {
    expect(toLocalDate(new Date(2026, 9, 6, 23, 59))).toBe('2026-10-06');
    expect(toLocalDate(new Date(2027, 0, 1, 0, 0))).toBe('2027-01-01');
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(daysBetween('2026-10-06', '2026-10-06')).toBe(0);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
```

`server/test/git.test.ts`의 `describe('collectGit')` 안에:

```ts
  it('counts commits per local day for the last 182 days', async () => {
    const repo = await makeRepo();
    const now = new Date('2026-10-06T12:00:00');
    await commit(repo, 'old', '2026-04-06T09:00:00'); // 183일 전: 범위 밖
    await commit(repo, 'first day', '2026-04-08T09:00:00'); // 181일 전 = 인덱스 0
    await commit(repo, 'yesterday', '2026-10-05T23:30:00');
    await commit(repo, 'today 1', '2026-10-06T08:00:00');
    await commit(repo, 'today 2', '2026-10-06T09:00:00');
    const r = await collectGit(repo, runCommand, now);
    expect(r?.git.dailyUntil).toBe('2026-10-06');
    expect(r?.git.dailyCommits).toHaveLength(182);
    expect(r?.git.dailyCommits?.[181]).toBe(2);
    expect(r?.git.dailyCommits?.[180]).toBe(1);
    expect(r?.git.dailyCommits?.[0]).toBe(1);
    expect(r?.git.dailyCommits?.reduce((a, b) => a + b, 0)).toBe(4);
  });
```

(26주 로그가 `now - 182일`부터라 4/6 커밋은 이미 git에서 빠질 수 있다. 어느 쪽이든 합계는 4여야 한다.)

- [ ] **Step 2: 실패 확인** — `pnpm -F @hub/shared test`, `pnpm -F @hub/server exec vitest run test/git.test.ts` → FAIL

- [ ] **Step 3: 구현**

`shared/src/dates.ts`:

```ts
const pad = (n: number) => String(n).padStart(2, '0');

// 로컬 날짜 'YYYY-MM-DD'. 주간 리뷰·잔디·이슈 묶음이 모두 이 기준을 쓴다.
export const toLocalDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const utcDay = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

export const daysBetween = (from: string, to: string) => Math.round(utcDay(to) - utcDay(from));

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return toLocalDate(new Date(y, m - 1, d + n));
}
```

`shared/src/index.ts`: 끝에 `export * from './dates';`. `GitInfoSchema`에:

```ts
  // 5단계 잔디용 일별 커밋 수(길이 182, 마지막 = dailyUntil 당일). 이전 데이터에는 없다.
  dailyCommits: z.array(z.number().int()).optional(),
  dailyUntil: z.string().optional(),
```

`server/src/collectors/git.ts`: import `{ daysBetween, toLocalDate } from '@hub/shared'`(기존 `import type`과 별도 줄), 그리고

```ts
export const DAYS = 182;

// 26주 커밋 로그를 로컬 날짜별로 센다(git 호출을 늘리지 않는다).
export function bucketDaily(isoDates: string[], now: Date): { dailyCommits: number[]; dailyUntil: string } {
  const dailyUntil = toLocalDate(now);
  const dailyCommits = new Array<number>(DAYS).fill(0);
  for (const iso of isoDates) {
    const back = daysBetween(toLocalDate(new Date(iso)), dailyUntil);
    if (back >= 0 && back < DAYS) dailyCommits[DAYS - 1 - back] += 1;
  }
  return { dailyCommits, dailyUntil };
}
```

반환 부분에서 `weeklyR` 줄을 한 번 나눠 두 함수에 쓴다:

```ts
  const halfYear = weeklyR.code === 0 ? weeklyR.stdout.split('\n').filter(Boolean) : [];
  // ...
      weeklyCommits: bucketWeekly(halfYear, now),
      ...bucketDaily(halfYear, now),
```

- [ ] **Step 4: 통과 확인** — `pnpm -F @hub/shared test && pnpm -F @hub/server exec vitest run test/git.test.ts && pnpm typecheck` → PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: local date helpers and daily commit counts for the heatmap"`

---

### Task 3: 커밋 잔디 (웹)

**Files:**
- Create: `web/src/lib/heatmap.ts`, `web/src/lib/heatmap.test.ts`, `web/src/features/home/CommitHeatmap.tsx`
- Modify: `web/src/features/home/HomePage.tsx`

**Interfaces:**
- Consumes: `toLocalDate`, `daysBetween`, `addDays` (Task 2), `groupByRepo`, `isArchived`
- Produces:

```ts
export interface DayCount { date: string; count: number }
export interface HeatCell extends DayCount { level: 0 | 1 | 2 | 3 | 4 }
export function dailyTotals(projects: Project[], now: Date): DayCount[]          // 182개 또는 [] (데이터 없음)
export function heatmapGrid(days: DayCount[]): { weeks: (HeatCell | null)[][]; monthLabels: string[] }
export function dayLabel(date: string): string                                 // '10/6(화)'
```

- [ ] **Step 1: 실패하는 테스트** — `web/src/lib/heatmap.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { EMPTY_PERSONAL, type Lifecycle, type Project } from '@hub/shared';
import { dailyTotals, dayLabel, heatmapGrid } from './heatmap';

const NOW = new Date(2026, 9, 6, 12, 0); // 2026-10-06(화) 로컬
const days = (last: number[]) => [...new Array(182 - last.length).fill(0), ...last];
const p = (name: string, o: { daily?: number[]; until?: string; repo?: string; lifecycle?: Lifecycle } = {}) =>
  ({
    name,
    githubRepo: o.repo ?? null,
    remoteUrl: null,
    git: o.daily ? { dailyCommits: o.daily, dailyUntil: o.until ?? '2026-10-06' } : { weeklyCommits: [] },
    personal: { ...EMPTY_PERSONAL, lifecycle: o.lifecycle ?? null },
  }) as unknown as Project;

describe('dailyTotals', () => {
  it('sums projects per day, ending today', () => {
    const t = dailyTotals([p('a', { daily: days([1, 2]) }), p('b', { daily: days([0, 3]) })], NOW);
    expect(t).toHaveLength(182);
    expect(t.at(-1)).toEqual({ date: '2026-10-06', count: 5 });
    expect(t.at(-2)).toEqual({ date: '2026-10-05', count: 1 });
    expect(t[0].date).toBe('2026-04-08');
  });
  it('shifts data collected on an earlier day so dates line up and today is empty', () => {
    const t = dailyTotals([p('a', { daily: days([4]), until: '2026-10-05' })], NOW);
    expect(t.at(-1)).toEqual({ date: '2026-10-06', count: 0 });
    expect(t.at(-2)).toEqual({ date: '2026-10-05', count: 4 });
  });
  it('counts a repository once and excludes archived projects', () => {
    const t = dailyTotals(
      [p('DataBatcher', { daily: days([2]), repo: 'me/db' }), p('DataBatcher-main', { daily: days([2]), repo: 'me/db' }), p('old', { daily: days([9]), lifecycle: 'archive' })],
      NOW,
    );
    expect(t.at(-1)?.count).toBe(2);
  });
  it('returns nothing when no project has daily data yet', () => {
    expect(dailyTotals([p('a')], NOW)).toEqual([]);
  });
});

describe('heatmapGrid', () => {
  it('starts columns on Monday, pads out-of-range cells, and assigns levels', () => {
    const t = dailyTotals([p('a', { daily: days([0, 1, 4, 8]) })], NOW);
    const g = heatmapGrid(t);
    // 2026-04-08은 수요일 → 첫 열의 월·화는 빈칸
    expect(g.weeks[0][0]).toBeNull();
    expect(g.weeks[0][1]).toBeNull();
    expect(g.weeks[0][2]?.date).toBe('2026-04-08');
    const last = g.weeks.at(-1)!;
    expect(last[1]).toMatchObject({ date: '2026-10-06', count: 8, level: 4 }); // 화요일
    expect(last[2]).toBeNull();
    expect(last[0]).toMatchObject({ date: '2026-10-05', count: 4, level: 2 });
    expect(g.weeks.at(-2)![6]).toMatchObject({ date: '2026-10-04', count: 1, level: 1 });
    expect(g.weeks.flat().filter((c) => c && c.count === 0).every((c) => c!.level === 0)).toBe(true);
  });
  it('labels the first column of each month, across a year end', () => {
    const now = new Date(2027, 0, 2, 12, 0);
    const t = dailyTotals([p('a', { daily: days([1]), until: '2027-01-02' })], now);
    const g = heatmapGrid(t);
    expect(g.monthLabels).toHaveLength(g.weeks.length);
    expect(g.monthLabels.filter(Boolean).slice(-2)).toEqual(['12월', '1월']);
  });
});

describe('dayLabel', () => {
  it('shows month/day and weekday', () => {
    expect(dayLabel('2026-10-06')).toBe('10/6(화)');
    expect(dayLabel('2027-01-03')).toBe('1/3(일)');
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm -F @hub/web exec vitest run src/lib/heatmap.test.ts` → FAIL

- [ ] **Step 3: 구현** — `web/src/lib/heatmap.ts`

```ts
import { addDays, daysBetween, toLocalDate, type Project } from '@hub/shared';
import { isArchived } from './lifecycle';
import { groupByRepo } from './repo';

export const DAYS = 182;
export interface DayCount {
  date: string;
  count: number;
}
export interface HeatCell extends DayCount {
  level: 0 | 1 | 2 | 3 | 4;
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const parse = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function dayLabel(date: string): string {
  const d = parse(date);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY[d.getDay()]})`;
}

// 첫 화면 잔디: 보관 제외, 같은 저장소는 대표 폴더 하나만, 새로고침한 날짜가 오늘과 다르면 날짜를 맞춰 옮긴다.
export function dailyTotals(projects: Project[], now: Date): DayCount[] {
  const today = toLocalDate(now);
  const totals = new Array<number>(DAYS).fill(0);
  let any = false;
  for (const [rep] of groupByRepo(projects.filter((p) => !isArchived(p)))) {
    const daily = rep.git?.dailyCommits;
    const until = rep.git?.dailyUntil;
    if (!daily || !until) continue;
    any = true;
    const shift = daysBetween(until, today);
    daily.forEach((n, i) => {
      const j = i - shift;
      if (j >= 0 && j < DAYS) totals[j] += n;
    });
  }
  if (!any) return [];
  return totals.map((count, i) => ({ date: addDays(today, i - (DAYS - 1)), count }));
}

export function heatmapGrid(days: DayCount[]): { weeks: (HeatCell | null)[][]; monthLabels: string[] } {
  if (days.length === 0) return { weeks: [], monthLabels: [] };
  const max = Math.max(1, ...days.map((d) => d.count));
  const level = (n: number): HeatCell['level'] => (n === 0 ? 0 : (Math.min(4, Math.max(1, Math.ceil((n / max) * 4))) as HeatCell['level']));
  const lead = (parse(days[0].date).getDay() + 6) % 7; // 월요일 = 0
  const cells: (HeatCell | null)[] = [...new Array(lead).fill(null), ...days.map((d) => ({ ...d, level: level(d.count) }))];
  while (cells.length % 7) cells.push(null);
  const weeks: (HeatCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  let prev = -1;
  const monthLabels = weeks.map((w) => {
    const first = w.find((c) => c !== null)!;
    const month = parse(first.date).getMonth();
    const label = month !== prev ? `${month + 1}월` : '';
    prev = month;
    return label;
  });
  return { weeks, monthLabels };
}
```

- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS

- [ ] **Step 5: CommitHeatmap** — `web/src/features/home/CommitHeatmap.tsx`

```tsx
import type { Project } from '@hub/shared';
import { Tooltip } from '../../components/ui/Tooltip';
import { cn } from '../../lib/cn';
import { dailyTotals, dayLabel, heatmapGrid, type HeatCell } from '../../lib/heatmap';
import { toLocalDate } from '@hub/shared';

const LEVEL_CLS = ['bg-white/[0.04]', 'bg-accent/30', 'bg-accent/50', 'bg-accent/75', 'bg-accent2'];
const ROW_LABEL = ['월', '', '수', '', '금', '', ''];

function Cell({ c, today }: { c: HeatCell | null; today: string }) {
  if (!c) return <span className="size-[11px]" />;
  return (
    <Tooltip content={`${dayLabel(c.date)} · ${c.count ? `${c.count}건` : '커밋 없음'}`} side="top">
      <span className={cn('block size-[11px] rounded-[3px]', LEVEL_CLS[c.level], c.date === today && 'ring-1 ring-fg/70')} />
    </Tooltip>
  );
}

export function CommitHeatmap({ projects, now }: { projects: Project[]; now: Date }) {
  const { weeks, monthLabels } = heatmapGrid(dailyTotals(projects, now));
  if (weeks.length === 0) return <p className="py-6 text-center text-xs text-muted">일별 커밋은 다음 새로고침 후 표시됩니다.</p>;
  const today = toLocalDate(now);
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px] pl-5 text-[10px] text-muted">
        {monthLabels.map((m, i) => (
          <span key={i} className="w-[11px] shrink-0 overflow-visible whitespace-nowrap">
            {m}
          </span>
        ))}
      </div>
      <div className="mt-1 flex gap-[3px]">
        <div className="flex w-4 shrink-0 flex-col gap-[3px] text-[9px] leading-[11px] text-muted">
          {ROW_LABEL.map((l, i) => (
            <span key={i} className="h-[11px]">
              {l}
            </span>
          ))}
        </div>
        {weeks.map((w, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {w.map((c, j) => (
              <Cell key={j} c={c} today={today} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: HomePage** — "최근 26주 전체 커밋" `<Box>` 안의 막대(`stats.weekly.map`)와 월 라벨(`months.map`) 두 블록을 `<CommitHeatmap projects={projects} now={now} />`로 바꾼다. `months`·`maxWeek` 변수와 `weekMonthLabels` import가 쓰이지 않게 되면 지운다(`portfolio.ts`의 `weekMonthLabels`와 그 테스트는 남겨도 된다 — 지우면 테스트도 지운다. 이 계획은 지운다).
- [ ] **Step 7: 확인** — `pnpm test && pnpm typecheck && pnpm -F @hub/web build` → PASS
- [ ] **Step 8: 커밋** — `git commit -m "feat(web): daily commit heatmap with date and weekday tooltips"`

---

### Task 4: 최근 이슈 — 서버

**Files:**
- Create: `shared/src/trends.ts`, `server/src/trends.ts`, `server/test/trends.test.ts`
- Modify: `shared/src/index.ts`, `server/src/collectors/claude.ts`, `server/src/db.ts`, `server/src/app.ts`, `server/src/main.ts`, `server/test/app.test.ts`

**Interfaces:**
- Produces:

```ts
// shared/src/trends.ts
export const TREND_CATEGORIES = ['ai', 'consumer', 'life', 'invest'] as const; export type TrendCategory
export const TrendItemSchema; export type TrendItem
export const TrendsResultSchema = z.object({ items: z.array(TrendItemSchema).min(1).max(12) })
export const TRENDS_JSON_SCHEMA
export interface TrendDigest { date: string; items: TrendItem[]; model: string; createdAt: string }
export interface TrendsResponse { digests: TrendDigest[]; collecting: boolean; error: string | null; hasMore: boolean }
// server/src/db.ts
putTrendDigest(d: TrendDigest): void; getTrendDigest(date: string): TrendDigest | null; listTrendDigests(before: string | undefined, limit: number): TrendDigest[]
// server/src/collectors/claude.ts
callClaudeJson(run, { model, schema, prompt, timeoutMs, tools?: string[] })
// server/src/trends.ts
buildTrendsPrompt(projects: Project[], recentTitles: string[], today: string): string
sanitizeTrendItems(raw: unknown): TrendItem[]          // 없으면 throw
class TrendsManager { constructor(deps: { db; run; model; projects: () => Project[]; now?: () => Date }); get(before?: string, limit?: number): TrendsResponse; maybeCollect(): boolean; collect(): boolean; whenIdle(): Promise<void> }
// app: AppDeps.trends?: { get(before?: string, limit?: number): TrendsResponse; collect(): boolean }
GET /api/trends?before=&limit=   POST /api/trends/collect
```

- [ ] **Step 1: 공유 스키마** — `shared/src/trends.ts`

```ts
import { z } from 'zod';

export const TREND_CATEGORIES = ['ai', 'consumer', 'life', 'invest'] as const;
export type TrendCategory = (typeof TREND_CATEGORIES)[number];

export const TrendItemSchema = z.object({
  category: z.enum(TREND_CATEGORIES),
  region: z.enum(['국내', '해외']),
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(300),
  ideaAngle: z.string().min(1).max(200),
  sourceName: z.string().min(1).max(60),
  sourceUrl: z.string(),
  publishedAt: z.string(),
});
export type TrendItem = z.infer<typeof TrendItemSchema>;
export const TrendsResultSchema = z.object({ items: z.array(TrendItemSchema).min(1).max(12) });

const { $schema: _ignored, ...trendsJsonSchema } = z.toJSONSchema(TrendsResultSchema) as Record<string, unknown>;
export const TRENDS_JSON_SCHEMA = trendsJsonSchema as { type: string; required: string[]; [key: string]: unknown };

export interface TrendDigest {
  date: string;
  items: TrendItem[];
  model: string;
  createdAt: string;
}
export interface TrendsResponse {
  digests: TrendDigest[];
  collecting: boolean;
  error: string | null;
  hasMore: boolean;
}
```

`shared/src/index.ts` 끝에 `export * from './trends';`.

- [ ] **Step 2: 실패하는 테스트** — `server/test/trends.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { EMPTY_PERSONAL, type Project, type TrendItem } from '@hub/shared';
import { openDb } from '../src/db';
import { TrendsManager, buildTrendsPrompt, sanitizeTrendItems } from '../src/trends';
import { fakeRunner } from './fakeRunner';

const item = (title: string, o: Partial<TrendItem> = {}): TrendItem => ({
  category: 'ai',
  region: '해외',
  title,
  summary: '요약',
  ideaAngle: '관점',
  sourceName: '출처',
  sourceUrl: 'https://example.com/a',
  publishedAt: '2026-10-07',
  ...o,
});
const project = (name: string, lifecycle: 'archive' | null = null) =>
  ({ name, summary: { oneLiner: `${name} 설명` }, personal: { ...EMPTY_PERSONAL, lifecycle } }) as unknown as Project;

describe('sanitizeTrendItems', () => {
  it('drops non-http links and duplicate titles', () => {
    const out = sanitizeTrendItems({
      items: [item('A'), item('B', { sourceUrl: 'javascript:alert(1)' }), item(' a '), item('C', { sourceUrl: 'HTTP://x.dev' })],
    });
    expect(out.map((i) => i.title)).toEqual(['A', 'C']);
  });
  it('fails when nothing usable is left or the shape is wrong', () => {
    expect(() => sanitizeTrendItems({ items: [item('A', { sourceUrl: 'ftp://x' })] })).toThrow();
    expect(() => sanitizeTrendItems({ nope: true })).toThrow();
  });
});

describe('buildTrendsPrompt', () => {
  it('includes date, categories, exclusions, my non-archived projects and recent titles', () => {
    const prompt = buildTrendsPrompt([project('kr-by-claude'), project('old', 'archive')], ['지난 소식'], '2026-10-08');
    expect(prompt).toContain('2026-10-08');
    expect(prompt).toContain('정치');
    expect(prompt).toContain('kr-by-claude: kr-by-claude 설명');
    expect(prompt).not.toContain('old 설명');
    expect(prompt).toContain('- 지난 소식');
  });
});

function manager(result: () => { code: number; stdout?: string }, now = new Date(2026, 9, 8, 10)) {
  const db = openDb(':memory:');
  const run = fakeRunner((cmd) => (cmd === 'claude' ? result() : undefined));
  const m = new TrendsManager({ db, run, model: 'sonnet', projects: () => [project('a')], now: () => now });
  return { db, run, m };
}
const ok = () => ({ code: 0, stdout: JSON.stringify({ structured_output: { items: [item('A')] } }) });

describe('TrendsManager', () => {
  it('collects with web tools only and stores today\'s digest', async () => {
    const { db, run, m } = manager(ok);
    expect(m.collect()).toBe(true);
    expect(m.collect()).toBe(false);
    await m.whenIdle();
    expect(db.getTrendDigest('2026-10-08')?.items.map((i) => i.title)).toEqual(['A']);
    const args = run.calls[0].args;
    expect(args).toEqual(expect.arrayContaining(['--tools', 'WebSearch', 'WebFetch', '--allowedTools']));
    expect(args).not.toContain('Bash');
  });
  it('auto-collects once a day and does not retry automatically after a failure', async () => {
    const fail = manager(() => ({ code: 1, stdout: '' }));
    expect(fail.m.maybeCollect()).toBe(true);
    await fail.m.whenIdle();
    expect(fail.m.get().error).toBeTruthy();
    expect(fail.m.maybeCollect()).toBe(false);
    expect(fail.m.collect()).toBe(true); // 수동은 가능
    await fail.m.whenIdle();

    const good = manager(ok);
    expect(good.m.maybeCollect()).toBe(true);
    await good.m.whenIdle();
    expect(good.m.maybeCollect()).toBe(false);
  });
  it('pages digests newest first with hasMore', () => {
    const { db, m } = manager(ok);
    for (const d of ['2026-10-05', '2026-10-06', '2026-10-07']) db.putTrendDigest({ date: d, items: [item(d)], model: 's', createdAt: 't' });
    expect(m.get(undefined, 2)).toMatchObject({ hasMore: true });
    expect(m.get(undefined, 2).digests.map((d) => d.date)).toEqual(['2026-10-07', '2026-10-06']);
    expect(m.get('2026-10-06', 2)).toMatchObject({ hasMore: false });
    expect(m.get('2026-10-06', 2).digests.map((d) => d.date)).toEqual(['2026-10-05']);
  });
});
```

`server/test/app.test.ts`에:

```ts
describe('trends api', () => {
  const trends = { get: vi.fn(() => ({ digests: [], collecting: false, error: null, hasMore: false })), collect: vi.fn(() => true) };
  it('lists digests with paging params and starts a collection', async () => {
    const { app } = setup({ trends });
    expect((await app.request('/api/trends?before=2026-10-06&limit=3')).status).toBe(200);
    expect(trends.get).toHaveBeenCalledWith('2026-10-06', 3);
    expect((await app.request('/api/trends/collect', post({}))).status).toBe(202);
    trends.collect.mockReturnValueOnce(false);
    expect((await app.request('/api/trends/collect', post({}))).status).toBe(409);
    expect((await app.request('/api/trends/collect', { method: 'POST', body: '{}' })).status).toBe(415);
  });
  it('clamps the limit and ignores malformed dates', async () => {
    const { app } = setup({ trends });
    await app.request('/api/trends?before=nope&limit=999');
    expect(trends.get).toHaveBeenLastCalledWith(undefined, 30);
  });
});
```

- [ ] **Step 3: 실패 확인** — `pnpm -F @hub/server exec vitest run test/trends.test.ts test/app.test.ts` → FAIL

- [ ] **Step 4: 구현**

`server/src/collectors/claude.ts`: opts에 `tools?: string[]`. 인자 배열의 `'--tools', '',`를 다음으로 바꾼다.

```ts
      // 도구는 기본적으로 주지 않는다. 지정하면 그 도구만 쓰고 묻지 않고 허용한다.
      ...(opts.tools?.length ? ['--tools', ...opts.tools, '--allowedTools', ...opts.tools] : ['--tools', '']),
```

`server/src/db.ts`: SCHEMA에

```sql
CREATE TABLE IF NOT EXISTS trend_digests (date TEXT PRIMARY KEY, items TEXT NOT NULL, model TEXT NOT NULL, created_at TEXT NOT NULL);
```

`Db`와 구현에:

```ts
  const toDigest = (r: Row): TrendDigest => ({ date: String(r.date), items: JSON.parse(String(r.items)), model: String(r.model), createdAt: String(r.created_at) });
  // ...
    putTrendDigest: (d) => {
      db.prepare(
        'INSERT INTO trend_digests (date, items, model, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET items = excluded.items, model = excluded.model, created_at = excluded.created_at',
      ).run(d.date, JSON.stringify(d.items), d.model, d.createdAt);
    },
    getTrendDigest: (date) => {
      const r = db.prepare('SELECT * FROM trend_digests WHERE date = ?').get(date) as Row | undefined;
      return r ? toDigest(r) : null;
    },
    listTrendDigests: (before, limit) =>
      (before
        ? (db.prepare('SELECT * FROM trend_digests WHERE date < ? ORDER BY date DESC LIMIT ?').all(before, limit) as Row[])
        : (db.prepare('SELECT * FROM trend_digests ORDER BY date DESC LIMIT ?').all(limit) as Row[])
      ).map(toDigest),
```

`server/src/trends.ts`:

```ts
import { TRENDS_JSON_SCHEMA, TrendsResultSchema, addDays, toLocalDate, type Project, type TrendItem, type TrendsResponse } from '@hub/shared';
import { callClaudeJson } from './collectors/claude';
import type { Db } from './db';
import type { CommandRunner } from './exec';

const TOOLS = ['WebSearch', 'WebFetch'];

export function buildTrendsPrompt(projects: Project[], recentTitles: string[], today: string): string {
  const mine = projects
    .filter((p) => p.summary && p.personal.lifecycle !== 'archive')
    .map((p) => `- ${p.name}: ${p.summary!.oneLiner}`);
  return [
    `너는 한 개인 개발자에게 새 사이드 프로젝트 아이디어의 재료가 될 최근 소식을 골라 주는 리서처다.`,
    `오늘은 ${today}다. 웹 검색으로 최근 3일 안의 소식을 우선 찾고, 없으면 최근 7일까지 본다.`,
    ``,
    `분야(category)와 분야별 2~3개, 국내와 해외를 섞어 모두 8~12개:`,
    `- ai: AI·개발 도구(새 모델, 에이전트, 개발자 도구, 화제의 오픈소스)`,
    `- consumer: 소비자 앱·서비스·스타트업(새 서비스, 앱 순위·화제, 투자 유치)`,
    `- life: 생활·소비 트렌드(소비, 콘텐츠, 육아, 라이프스타일, 검색·SNS 유행)`,
    `- invest: 투자·모빌리티·공공데이터(개인 투자 도구, 자동차·교통, 새로 열린 공공데이터·API)`,
    ``,
    `넣지 않는 것: 정치, 선거, 정당, 외교 분쟁, 전쟁, 사건사고, 연예 가십, 주가 단기 등락 전망.`,
    `모든 항목은 실제로 열어 본 출처의 URL(http 또는 https)을 sourceUrl에 넣는다. 출처가 확실하지 않으면 넣지 않는다.`,
    `title은 한국어로 60자 안팎, summary는 두 문장, ideaAngle은 이 개발자가 새 프로젝트로 연결할 수 있는 관점 한 줄.`,
    `publishedAt은 소식의 게시일(YYYY-MM-DD), region은 국내 또는 해외.`,
    ``,
    `이 개발자의 프로젝트(관심사 파악용, 이것과 연결될 만한 소식을 우선):`,
    ...(mine.length ? mine : ['- (정보 없음)']),
    ``,
    `지난 7일에 이미 알려 준 소식(같은 소식은 다시 넣지 않는다):`,
    ...(recentTitles.length ? recentTitles.map((t) => `- ${t}`) : ['- (없음)']),
  ].join('\n');
}

const isHttp = (s: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(s.trim()).protocol);
  } catch {
    return false;
  }
};

// 외부 웹에서 온 결과다. 형식을 검증하고, 링크가 http(s)가 아니거나 제목이 겹치는 항목은 버린다.
export function sanitizeTrendItems(raw: unknown): TrendItem[] {
  const parsed = TrendsResultSchema.parse(raw);
  const seen = new Set<string>();
  const items = parsed.items
    .map((i) => ({ ...i, title: i.title.trim(), sourceUrl: i.sourceUrl.trim() }))
    .filter((i) => {
      const key = i.title.toLowerCase();
      if (!isHttp(i.sourceUrl) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (items.length === 0) throw new Error('쓸 수 있는 이슈가 없습니다');
  return items;
}

export interface TrendsDeps {
  db: Db;
  run: CommandRunner;
  model: string;
  projects: () => Project[];
  now?: () => Date;
}

export class TrendsManager {
  private current: Promise<void> | null = null;
  private error: string | null = null;
  // 자동 수집이 실패한 날. 그날은 새로고침마다 다시 부르지 않는다(수동 버튼은 예외).
  private failedAutoDate: string | null = null;

  constructor(private deps: TrendsDeps) {}

  private today() {
    return toLocalDate(this.deps.now?.() ?? new Date());
  }

  get(before?: string, limit = 7): TrendsResponse {
    const rows = this.deps.db.listTrendDigests(before, limit + 1);
    return { digests: rows.slice(0, limit), collecting: this.current !== null, error: this.error, hasMore: rows.length > limit };
  }

  maybeCollect(): boolean {
    const today = this.today();
    if (this.current || this.deps.db.getTrendDigest(today) || this.failedAutoDate === today) return false;
    return this.start(true);
  }

  collect(): boolean {
    return this.start(false);
  }

  private start(auto: boolean): boolean {
    if (this.current) return false;
    const today = this.today();
    const recentTitles = this.deps.db
      .listTrendDigests(undefined, 7)
      .filter((d) => d.date >= addDays(today, -7))
      .flatMap((d) => d.items.map((i) => i.title));
    this.current = callClaudeJson(this.deps.run, {
      model: this.deps.model,
      schema: TRENDS_JSON_SCHEMA,
      prompt: buildTrendsPrompt(this.deps.projects(), recentTitles, today),
      timeoutMs: 300_000,
      tools: TOOLS,
    })
      .then((raw) => {
        const items = sanitizeTrendItems(raw);
        this.deps.db.putTrendDigest({ date: today, items, model: this.deps.model, createdAt: new Date().toISOString() });
        this.error = null;
      })
      .catch((e) => {
        this.error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        if (auto) this.failedAutoDate = today;
      })
      .finally(() => {
        this.current = null;
      });
    return true;
  }

  whenIdle(): Promise<void> {
    return this.current ?? Promise.resolve();
  }
}
```

`server/src/app.ts`: `AppDeps`에 `trends?: { get(before?: string, limit?: number): TrendsResponse; collect(): boolean };` 그리고

```ts
  app.get('/api/trends', (c) => {
    const before = c.req.query('before');
    const limit = Math.min(30, Math.max(1, Number(c.req.query('limit')) || 7));
    const empty: TrendsResponse = { digests: [], collecting: false, error: null, hasMore: false };
    return c.json(deps.trends?.get(before && /^\d{4}-\d{2}-\d{2}$/.test(before) ? before : undefined, limit) ?? empty);
  });
  app.post('/api/trends/collect', (c) =>
    deps.trends?.collect() ? c.json({ started: true }, 202) : c.json({ error: 'already-running' }, 409),
  );
```

`server/src/main.ts`: `TrendsManager` 생성(`model: process.env.HUB_TRENDS_MODEL ?? 'sonnet'`, `projects`는 insights와 같음), `createApp`에 `trends`, 새로고침 `done`에서 `if (trends.maybeCollect()) console.log('[project-hub] 오늘 이슈 수집 시작');`.

- [ ] **Step 5: 통과 확인** — `pnpm -F @hub/server test && pnpm typecheck` → PASS
- [ ] **Step 6: 커밋** — `git commit -m "feat(server): daily recent-trends digest via claude web search, stored per day"`

---

### Task 5: 최근 이슈 — 화면

**Files:**
- Create: `web/src/lib/trends.ts`, `web/src/lib/trends.test.ts`, `web/src/features/home/TrendsBlock.tsx`
- Modify: `web/src/lib/api.ts`, `web/src/lib/hooks.ts`, `web/src/features/home/HomePage.tsx`

**Interfaces:**
- Produces:

```ts
export const CATEGORY_LABEL: Record<TrendCategory, string>   // ai: 'AI·개발', consumer: '앱·서비스', life: '생활·소비', invest: '투자·모빌리티·데이터'
export type CategoryFilter = 'all' | TrendCategory
export function trendDateLabel(date: string, now: Date): string   // '오늘' | '어제' | '10/6(월)'
export function filterItems(items: TrendItem[], f: CategoryFilter): TrendItem[]
api.trends(before?: string): Promise<TrendsResponse>; api.collectTrends(): Promise<{ started: boolean }>
useTrends()  // ['trends'] 첫 페이지, collecting이면 3초마다
```

- [ ] **Step 1: 실패하는 테스트** — `web/src/lib/trends.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { TrendItem } from '@hub/shared';
import { filterItems, trendDateLabel } from './trends';

describe('trends helpers', () => {
  const now = new Date(2026, 9, 8, 9, 0);
  it('labels today, yesterday and older dates with weekday', () => {
    expect(trendDateLabel('2026-10-08', now)).toBe('오늘');
    expect(trendDateLabel('2026-10-07', now)).toBe('어제');
    expect(trendDateLabel('2026-10-05', now)).toBe('10/5(월)');
  });
  it('filters items by category', () => {
    const items = [{ category: 'ai' }, { category: 'life' }] as TrendItem[];
    expect(filterItems(items, 'all')).toHaveLength(2);
    expect(filterItems(items, 'life').map((i) => i.category)).toEqual(['life']);
  });
});
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — `web/src/lib/trends.ts`

```ts
import { daysBetween, toLocalDate, type TrendCategory, type TrendItem } from '@hub/shared';
import { dayLabel } from './heatmap';

export const CATEGORY_LABEL: Record<TrendCategory, string> = {
  ai: 'AI·개발',
  consumer: '앱·서비스',
  life: '생활·소비',
  invest: '투자·모빌리티·데이터',
};
export type CategoryFilter = 'all' | TrendCategory;

export function trendDateLabel(date: string, now: Date): string {
  const back = daysBetween(date, toLocalDate(now));
  return back === 0 ? '오늘' : back === 1 ? '어제' : dayLabel(date);
}

export const filterItems = (items: TrendItem[], f: CategoryFilter) => (f === 'all' ? items : items.filter((i) => i.category === f));
```

`api.ts`: `trends: (before?: string) => request<TrendsResponse>(\`/api/trends${before ? \`?before=${before}\` : ''}\`)`, `collectTrends: () => request<{ started: boolean }>('/api/trends/collect', { method: 'POST', body: {} })`.

`hooks.ts`:

```ts
export const useTrends = () =>
  useQuery({ queryKey: ['trends'], queryFn: () => api.trends(), refetchInterval: (q) => (q.state.data?.collecting ? 3_000 : false) });
```

`useRefreshStatus`에서 새로고침이 끝날 때 `qc.invalidateQueries({ queryKey: ['trends'] })`도 부른다(자동 수집 시작을 화면이 알게).

- [ ] **Step 4: TrendsBlock** — `web/src/features/home/TrendsBlock.tsx`

```tsx
import { TREND_CATEGORIES, type TrendDigest } from '@hub/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, Newspaper, RefreshCw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useTrends } from '../../lib/hooks';
import { CATEGORY_LABEL, filterItems, trendDateLabel, type CategoryFilter } from '../../lib/trends';
import { toLocalDate } from '@hub/shared';

export function TrendsBlock({ now }: { now: Date }) {
  const { data } = useTrends();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [older, setOlder] = useState<TrendDigest[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState<boolean | null>(null);
  const collect = useMutation({ mutationFn: api.collectTrends, onSettled: () => qc.invalidateQueries({ queryKey: ['trends'] }) });
  const more = useMutation({
    mutationFn: (before: string) => api.trends(before),
    onSuccess: (r) => {
      setOlder((xs) => [...xs, ...r.digests]);
      setHasMoreOlder(r.hasMore);
    },
  });
  const digests = [...(data?.digests ?? []), ...older];
  const collecting = !!data?.collecting || collect.isPending;
  const hasToday = digests.some((d) => d.date === toLocalDate(now));
  const canMore = hasMoreOlder ?? data?.hasMore ?? false;

  return (
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-accent/15 text-accent [&_svg]:size-4">
          <Newspaper />
        </span>
        <h3 className="text-base font-semibold">최근 이슈</h3>
        <span className="text-[11px] text-muted">웹 검색 · Claude · 하루 한 번</span>
        <button onClick={() => collect.mutate()} disabled={collecting} className="ml-auto inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-fg disabled:cursor-wait">
          {collecting ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          {collecting ? '모으는 중…' : '오늘 이슈 다시 모으기'}
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['all', ...TREND_CATEGORIES] as CategoryFilter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn('rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted hover:text-fg', filter === f && 'border-accent/40 bg-accent/15 text-fg')}>
            {f === 'all' ? '전체' : CATEGORY_LABEL[f]}
          </button>
        ))}
      </div>
      {data?.error && (
        <p className="mb-3 flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/5 px-4 py-2 text-xs text-warn">
          <TriangleAlert className="size-3.5 shrink-0" /> 최근 수집이 실패했습니다: {data.error}
        </p>
      )}
      {!hasToday && !collecting && (
        <p className="mb-3 text-xs text-muted">
          오늘 이슈가 아직 없습니다 ·{' '}
          <button onClick={() => collect.mutate()} className="text-accent hover:underline">지금 모으기</button>
        </p>
      )}
      <div className="space-y-5">
        {digests.map((d) => {
          const items = filterItems(d.items, filter);
          if (items.length === 0) return null;
          return (
            <div key={d.date}>
              <h4 className="mb-2 text-xs font-medium text-muted">{trendDateLabel(d.date, now)}</h4>
              <div className="grid gap-2.5 md:grid-cols-2">
                {items.map((i, k) => (
                  <article key={k} className="rounded-xl border border-line bg-black/20 p-3.5 text-[13px]">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                      <span className="rounded-full border border-line px-1.5 py-px">{CATEGORY_LABEL[i.category]}</span>
                      <span className="rounded-full border border-line px-1.5 py-px">{i.region}</span>
                    </div>
                    <a href={i.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-start gap-1 font-medium hover:text-white">
                      {i.title} <ExternalLink className="mt-1 size-3 shrink-0 text-muted" />
                    </a>
                    <p className="mt-1 text-xs leading-relaxed text-fg/80">{i.summary}</p>
                    <p className="mt-1.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs">
                      <span className="text-accent">아이디어 관점 </span>
                      {i.ideaAngle}
                    </p>
                    <p className="mt-1.5 text-[10px] text-muted">
                      {i.sourceName} · {i.publishedAt}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {canMore && digests.length > 0 && (
        <button onClick={() => more.mutate(digests[digests.length - 1].date)} disabled={more.isPending} className="mt-3 text-xs text-accent hover:underline">
          {more.isPending ? '불러오는 중…' : '이전 날짜 더 보기'}
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 5: HomePage** — AI 제안 구역 맨 끝(구역을 닫는 `</div>` 바로 앞, `{ins && (...)}` 블록 바깥)에 `<TrendsBlock now={now} />`를 둔다. 최종 순서: 서비스 후보 → 정리 제안 → 신규 아이디어 → 나의 개발 성향(접힘 한 줄) → 최근 이슈. 인사이트가 아직 없을 때도 이슈 블록은 보인다.
- [ ] **Step 6: 확인** — `pnpm test && pnpm typecheck && pnpm -F @hub/web build` → PASS
- [ ] **Step 7: 커밋** — `git commit -m "feat(web): recent trends block with daily groups, category chips and paging"`

---

### Task 6: 과감한 아이디어와 인사이트 프롬프트 v4

**Files:**
- Create: `web/src/features/home/IdeasSection.tsx`
- Modify: `shared/src/insightItems.ts`, `shared/src/index.ts`, `server/src/insights.ts`, `server/test/insights.test.ts`, `web/src/features/home/HomePage.tsx`, 그리고 `Insights` 객체 픽스처가 있는 테스트(`grep -rln "newIdeas:" web/src server/test`)

**Interfaces:**
- Consumes: `TrendDigest`, `Db.listTrendDigests` (Task 4)
- Produces:
  - `WildIdeaSchema = NewIdeaSchema.extend({ contrast: z.string() })`, `Insights.wildIdeas: WildIdea[]`(기본 `[]`)
  - `buildInsightsPrompt(projects, decisions, now, trends: TrendDigest[] = [])`, `generateInsights(projects, decisions, run, opts, now?, trends?)`, `INSIGHTS_PROMPT_VERSION = 4`
  - `InsightsManager.stored()`가 스키마 파싱 결과(`parsed.data`)를 돌려준다(기본값 채움)

- [ ] **Step 1: 실패하는 테스트** — `server/test/insights.test.ts`에 추가

```ts
describe('insights prompt v4', () => {
  const digest = (date: string, title: string): TrendDigest => ({
    date,
    model: 's',
    createdAt: 't',
    items: [{ category: 'ai', region: '해외', title, summary: 's', ideaAngle: 'a', sourceName: 'n', sourceUrl: 'https://x.dev', publishedAt: date }],
  });
  it('asks for wild ideas opposite to the profile', () => {
    const prompt = buildInsightsPrompt([project('a', 'x')], [], NOW);
    expect(prompt).toContain('wildIdeas');
    expect(prompt).toContain('정반대');
    expect(INSIGHTS_PROMPT_VERSION).toBe(4);
  });
  it('adds recent trends only when there are some', () => {
    expect(buildInsightsPrompt([project('a', 'x')], [], NOW)).not.toContain('## 최근 이슈');
    const prompt = buildInsightsPrompt([project('a', 'x')], [], NOW, [digest('2026-10-05', '새 에이전트 도구')]);
    expect(prompt).toContain('## 최근 이슈');
    expect(prompt).toContain('[AI·개발] 새 에이전트 도구');
  });
  it('keeps the JSON schema requiring wildIdeas', () => {
    expect(INSIGHTS_JSON_SCHEMA.required).toContain('wildIdeas');
  });
});

describe('stored insights from before v4', () => {
  it('fills wildIdeas with an empty list', () => {
    const db = openDb(':memory:');
    const { wildIdeas: _w, ...old } = { profile: { headline: 'h', traits: [], strengths: [] }, serviceCandidates: [], newIdeas: [], cleanup: [], wildIdeas: [] };
    db.setMeta('insights', JSON.stringify({ content: old, sourceHash: 'x', generatedAt: 't' }));
    const m = new InsightsManager({ db, run: fakeRunner(() => undefined), model: 'opus', projects: () => [] });
    expect(m.get().insights?.wildIdeas).toEqual([]);
  });
});
```

`generateInsights` 테스트에 wildIdeas의 leverages 거르기를 더한다(기존 fake 응답의 insights 객체에 `wildIdeas: [{ title: 'w', pitch: 'p', leverages: ['a', 'nope'], firstStep: 'f', contrast: 'c' }]`를 넣고 `ins.wildIdeas[0].leverages`가 `['a']`인지). import에 `INSIGHTS_JSON_SCHEMA`, `type TrendDigest` 추가.

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**
  - `shared/src/insightItems.ts`: `export const WildIdeaSchema = NewIdeaSchema.extend({ contrast: z.string() });`
  - `shared/src/index.ts`: `InsightsSchema`에 `wildIdeas: z.array(WildIdeaSchema).default([]),`, `export type WildIdea = z.infer<typeof WildIdeaSchema>;`
  - `server/src/insights.ts`
    - `INSIGHTS_PROMPT_VERSION = 4`
    - 작성할 내용 절의 `newIdeas` 줄 다음에:

```ts
    `- wildIdeas: 과감한 아이디어 2~3개. profile에서 드러난 성향과 정반대 방향으로 쓴다(예: 혼자 쓰는 도구 → 많은 사람이 쓰는 서비스, 데이터 처리 → 오프라인·사람 중심, 안전한 선택 → 크게 거는 선택).`,
    `  실현 가능성보다 새로움을 우선하되 firstStep은 이번 주에 해볼 수 있는 작은 행동으로 쓴다. contrast에 내 성향과 어떻게 반대인지 한 줄로 쓴다. leverages는 비어도 된다.`,
```

    - 시그니처 `buildInsightsPrompt(projects, decisions, now, trends: TrendDigest[] = [])`. `## 내 결정` 절 다음에:

```ts
    ...(trends.length
      ? [
          `## 최근 이슈`,
          `newIdeas와 wildIdeas에서 아래 소식을 재료로 써도 된다(의무는 아니다).`,
          ...trends.flatMap((d) => d.items.map((i) => `- [${TREND_LABEL[i.category]}] ${i.title}`)),
          ``,
        ]
      : []),
```

      (`const TREND_LABEL = { ai: 'AI·개발', consumer: '앱·서비스', life: '생활·소비', invest: '투자·모빌리티·데이터' } as const;`)
    - `generateInsights(projects, decisions, run, opts, now = new Date(), trends: TrendDigest[] = [])` → `buildInsightsPrompt(projects, decisions, now, trends)`.
    - `keepKnown`에 `wildIdeas: ins.wildIdeas.map((i) => ({ ...i, leverages: i.leverages.filter((n) => names.has(n)) })),`
    - `InsightsManager.start`: `generateInsights(projects, this.deps.db.listDecisions(), this.deps.run, { model }, new Date(), this.deps.db.listTrendDigests(undefined, 7))`
    - `stored()`: `const r = InsightsSchema.safeParse(parsed.content); return r.success ? { ...parsed, content: r.data } : null;`
  - 픽스처: `Insights` 리터럴에 `wildIdeas: []` 추가(타입 오류가 나는 곳).

- [ ] **Step 4: IdeasSection** — `web/src/features/home/IdeasSection.tsx`: HomePage의 신규 아이디어 블록(제목 + 그리드)을 옮기고 탭을 더한다.

```tsx
import type { Insights } from '@hub/shared';
import { Lightbulb } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { SpotlightCard } from '../../components/ui/SpotlightCard';
import { cn } from '../../lib/cn';
import { DecisionButtons } from './DecisionButtons';

type Idea = Insights['newIdeas'][number] & { contrast?: string };

export function IdeasSection({ ins, chip }: { ins: Insights; chip: (name: string) => ReactNode }) {
  const [tab, setTab] = useState<'base' | 'wild'>('base');
  const ideas: Idea[] = tab === 'base' ? ins.newIdeas : ins.wildIdeas;
  return (
    <>
      <div className="mt-6 mb-3 flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-accent/15 text-accent [&_svg]:size-4">
          <Lightbulb />
        </span>
        <h3 className="text-base font-semibold">신규 프로젝트 아이디어</h3>
        <div className="ml-2 flex rounded-full border border-line p-0.5 text-[11px]">
          {(['base', 'wild'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn('rounded-full px-2.5 py-0.5 text-muted', tab === t && 'bg-accent/20 text-fg')}>
              {t === 'base' ? '기본' : '과감하게'}
            </button>
          ))}
        </div>
      </div>
      {ideas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-8 text-center text-xs text-muted">과감한 아이디어는 다음 분석 후 표시됩니다.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {ideas.map((idea) => (
            <SpotlightCard key={`${tab}:${idea.title}`}>
              <p className="font-semibold">{idea.title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg/90">{idea.pitch}</p>
              {idea.contrast && (
                <p className="mt-2 text-xs text-accent2">
                  <span className="font-medium">내 성향과 반대: </span>
                  {idea.contrast}
                </p>
              )}
              {idea.leverages.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted">활용할 프로젝트</span>
                  {idea.leverages.map((n) => chip(n))}
                </div>
              )}
              <p className="mt-2.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs">
                <span className="text-accent">이번 주 첫 단계 </span>
                {idea.firstStep}
              </p>
              <DecisionButtons
                suggestion={{ kind: 'idea', snapshot: { title: idea.title, pitch: idea.pitch, leverages: idea.leverages, firstStep: idea.firstStep } }}
              />
            </SpotlightCard>
          ))}
        </div>
      )}
    </>
  );
}
```

  HomePage: 기존 `<SectionTitle icon={<Lightbulb />}>신규 프로젝트 아이디어</SectionTitle>`와 그 다음 그리드 전체를 `<IdeasSection ins={ins} chip={(n) => <ProjectChip key={n} name={n} onOpen={onOpen} />} />`로 바꾼다. 쓰지 않게 된 import(`Lightbulb`)를 지운다.

- [ ] **Step 5: 확인** — `pnpm test && pnpm typecheck && pnpm -F @hub/web build` → PASS
- [ ] **Step 6: 커밋** — `git commit -m "feat: wild ideas opposite to my profile and insights prompt v4 with recent trends"`

---

### Task 7: README와 실제 확인

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README** — 화면 설명에 목록 접기(`⌘B`), 잔디, 과감하게 탭, 최근 이슈(하루 한 번 자동·수동, 날짜별 누적)를 더하고, 환경 변수 표에 `HUB_TRENDS_MODEL | sonnet | 최근 이슈 수집에 쓸 Claude 모델(웹 검색 사용)`을 추가한다. 데이터 절에 `trend_digests`(날짜별 이슈 묶음)를 더한다. 단축키 절에 `⌘B 목록 접기`.
- [ ] **Step 2: 새로고침 1회** — `curl -s -X POST -H 'content-type: application/json' -d '{}' 127.0.0.1:4310/api/refresh` 후 끝날 때까지 `/api/refresh/status` 조회. 끝나면 이슈 자동 수집과 v4 재분석이 시작된다.
  - 확인: `/api/projects`에서 `dailyCommits` 길이 182, `/api/trends`에 오늘 묶음(항목 8~12, 링크 모두 http/https), `/api/insights`의 `wildIdeas` 2~3개.
- [ ] **Step 3: 브라우저** — 목록 접기·펼치기·`⌘B`·새로고침 후 유지, 잔디 툴팁(`10/6(화) · n건`), 과감하게 탭, 최근 이슈 카드·분야 칩·더 보기.
- [ ] **Step 4: 커밋** — `git commit -m "docs: README for list collapse, heatmap, wild ideas and recent trends"`

---

## Self-Review 결과

- 스펙 3장(접기) → Task 1. 5장(잔디) → Task 2·3. 6장(이슈) → Task 4·5, 6.5(인사이트 연결) → Task 6. 4장(wild·v4) → Task 6. 7장(환경 변수·README) → Task 4·7. 8장 테스트 → 각 Task. 9장 순서 → Task 순서(이슈가 v4보다 먼저).
- 스펙 3장은 "motion으로 0.2초"라고 했지만, 그리드 열 폭은 CSS `transition-[grid-template-columns]`(0.2초)로 애니메이션한다. motion의 `layout` 애니메이션은 그리드 열 변경을 자연스럽게 다루지 못해 더 단순한 쪽을 택한다.
- 스펙 6.4의 블록 위치("신규 아이디어 아래")는 Task 5 Step 5에서 성향 블록 다음, 구역 맨 끝으로 정했다(인사이트가 없을 때도 보이도록).
