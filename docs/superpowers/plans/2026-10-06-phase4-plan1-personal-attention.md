# 4단계 계획 1 — 태그·메모·링크, 통계 중복 수정, 주의 신호 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트마다 내 태그·메모·바로가기 링크를 저장하고, 보관 프로젝트를 기본 화면에서 빼며, 첫 화면 통계의 저장소 중복을 없애고, "주의할 것"과 "백업 없음"을 보여준다.

**Architecture:** 서버는 `project_personal` 테이블과 `PUT /api/projects/:name/personal`을 추가하고 `toProject`가 `personal`을 붙인다. 검증 스키마는 `shared`에 두어 서버·웹이 같이 쓴다. 웹은 순수 함수(`lifecycle.ts`의 태그 필터, `repo.ts`의 저장소 키, `portfolio.ts`, `attention.ts`)를 테스트로 먼저 고정하고, 컴포넌트는 그 결과만 그린다.

**Tech Stack:** pnpm 모노레포, zod 4, Hono, node:sqlite, React 19, @tanstack/react-query, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-phase4-design.md` (3장 기능 A, 5장 기능 C, 6장, 8장, 9장)

## Global Constraints

- DB 마이그레이션은 `CREATE TABLE IF NOT EXISTS`로 새 테이블만 추가한다. 기존 테이블은 바꾸지 않는다.
- `note` 최대 500자. `links` 최대 5개, `label` 1~30자, `url`은 `http:`/`https:` 스킴만.
- 검증 위반은 400과 위반 항목(`issues`)으로 응답한다. 없는 프로젝트는 404.
- 새 PUT은 기존 요청 가드(Host 검사, `application/json` MIME 강제, Sec-Fetch-Site, Origin 포트 4310/5199)를 통과해야 한다.
- 태그 값: `focus`(집중) `maintain`(유지) `launch`(공개 준비) `experiment`(실험) `archive`(보관) `null`(미분류).
- 목록 거르기 순서: 태그 조건 → 필터 칩 → 검색어. 필터 칩 숫자는 태그 조건 적용 후 센다.
- 태그 선택 "전체"는 보관을 뺀다(실행 중이어도 뺀다). "보관"을 골랐을 때만 보관이 보인다. 상단 "지금 실행 중" 줄은 그대로.
- 화면 문구는 한국어, 용어 통일(실행 중, git 아님, Claude).
- 4단계 기능은 LLM을 호출하지 않는다.
- 커밋 메시지에 Co-Authored-By 트레일러를 넣지 않는다.

## Review Focus

1. 메모를 지우면(빈 문자열) 저장돼야 하고, 링크 0개도 유효하다 → Task 1 테스트에 빈 note·빈 links 저장 케이스.
2. 태그만 바꾸는 빠른 버튼(백업 없음의 "실험으로 표시")이 기존 메모·링크를 지우면 안 된다 → Task 7의 `withLifecycle` 순수 함수 테스트.
3. 같은 GitHub 저장소를 가리키는 두 폴더(DataBatcher)에서 이슈·PR 합계와 오래 열린 PR이 두 번 세지면 안 된다 → Task 4·6 테스트.
4. URL에 공백·대문자 스킴(`HTTPS://`)·`javascript:`가 섞인 입력 → Task 1 테스트(대문자 스킴은 허용, `javascript:`·`ftp:`·파싱 불가는 거부).
5. 실행 중인 보관 프로젝트는 "전체" 목록·지표 카드에서 빠지지만 "지금 실행 중" 줄에는 남는다 → Task 4 테스트(`running` 카운트에서 제외).

---

## File Structure

| 파일 | 상태 | 책임 |
|---|---|---|
| `shared/src/index.ts` | 수정 | `Lifecycle`, `PersonalLink`, `Personal`, `PersonalInputSchema`, `EMPTY_PERSONAL`, `Project.personal` |
| `shared/src/index.test.ts` | 수정 | `PersonalInputSchema` 검증 테스트 |
| `server/src/db.ts` | 수정 | `project_personal` 테이블, `getPersonal`/`putPersonal`, `deleteProject` 목록 추가 |
| `server/src/app.ts` | 수정 | `toProject`에 personal, `PUT /api/projects/:name/personal` |
| `server/test/db.test.ts`, `server/test/app.test.ts` | 수정 | 저장·삭제·API·가드 테스트 |
| `web/src/lib/lifecycle.ts` (+test) | 생성 | 태그 이름표, `TagFilter`, `filterByTag`, `archivedCount`, `withLifecycle` |
| `web/src/lib/repo.ts` (+test) | 생성 | `repoKeyOf`, `groupByRepo` (계획 2 주간 리뷰도 쓴다) |
| `web/src/lib/portfolio.ts` (+test) | 수정 | 보관 제외, `archived` 수, 저장소 단위 이슈·PR 합계, `forgottenDirty` 삭제 |
| `web/src/lib/attention.ts` (+test) | 생성 | `attentionSignals(projects, now)` |
| `web/src/lib/api.ts` | 수정 | `api.savePersonal` |
| `web/src/lib/hooks.ts` | 수정 | `useSavePersonal` |
| `web/src/features/detail/PersonalHeader.tsx` | 생성 | 태그 드롭다운, 메모 한 줄 편집, 링크 칩 |
| `web/src/features/detail/LinksDialog.tsx` | 생성 | 링크 편집 대화상자 |
| `web/src/features/detail/ProjectDetail.tsx` | 수정 | 위 두 컴포넌트 배치 |
| `web/src/features/list/ProjectList.tsx`, `ProjectRow.tsx` | 수정 | 태그 선택, 보관 숨김 링크, 태그 칩, `↑n` |
| `web/src/App.tsx` | 수정 | 태그 상태, 거르기 순서, 카드 클릭 시 태그 초기화 |
| `web/src/features/home/HomePage.tsx` | 수정 | `(+보관 n)`, "주의할 것" 상자, "백업 없음" 접힘 목록 |
| `web/src/features/home/AttentionBox.tsx` | 생성 | 주의할 것 + 백업 없음 |
| `web/src/lib/status.test.ts`, `runConfig.test.ts`, `server/test/insights.test.ts` | 수정 | Project 픽스처에 `personal` 추가 |

---

### Task 1: 공유 타입과 검증 스키마

**Files:**
- Modify: `shared/src/index.ts`
- Test: `shared/src/index.test.ts`

**Interfaces:**
- Produces:
  - `LIFECYCLES: readonly ['focus','maintain','launch','experiment','archive']`
  - `type Lifecycle = (typeof LIFECYCLES)[number]`
  - `interface PersonalLink { label: string; url: string }`
  - `interface Personal { lifecycle: Lifecycle | null; note: string; links: PersonalLink[]; updatedAt: string | null }`
  - `PersonalInputSchema` (zod) → `PersonalInput = { lifecycle: Lifecycle | null; note: string; links: PersonalLink[] }`
  - `EMPTY_PERSONAL: Personal`
  - `Project.personal: Personal` (필수 필드)

- [ ] **Step 1: 실패하는 테스트 작성** — `shared/src/index.test.ts` 끝에 추가

```ts
import { PersonalInputSchema } from './index';

describe('PersonalInputSchema', () => {
  const ok = { lifecycle: 'focus', note: '다음: 배포', links: [{ label: '운영', url: 'https://example.com' }] };
  it('accepts a valid input, empty note and no links', () => {
    expect(PersonalInputSchema.safeParse(ok).success).toBe(true);
    expect(PersonalInputSchema.safeParse({ lifecycle: null, note: '', links: [] }).success).toBe(true);
  });
  it('accepts an upper-case scheme and trims label/url whitespace', () => {
    const r = PersonalInputSchema.parse({ lifecycle: null, note: '', links: [{ label: ' 봇 ', url: ' HTTPS://t.me/x ' }] });
    expect(r.links[0]).toEqual({ label: '봇', url: 'HTTPS://t.me/x' });
  });
  it('rejects too long notes, too many links, bad labels and non-http urls', () => {
    const bad = (o: object) => PersonalInputSchema.safeParse({ ...ok, ...o }).success;
    expect(bad({ note: 'a'.repeat(501) })).toBe(false);
    expect(bad({ links: Array.from({ length: 6 }, () => ok.links[0]) })).toBe(false);
    expect(bad({ links: [{ label: '', url: 'https://a.b' }] })).toBe(false);
    expect(bad({ links: [{ label: 'a'.repeat(31), url: 'https://a.b' }] })).toBe(false);
    expect(bad({ links: [{ label: 'x', url: 'javascript:alert(1)' }] })).toBe(false);
    expect(bad({ links: [{ label: 'x', url: 'ftp://a.b' }] })).toBe(false);
    expect(bad({ links: [{ label: 'x', url: 'not a url' }] })).toBe(false);
    expect(bad({ lifecycle: 'done' })).toBe(false);
  });
});
```

(`describe`/`expect`/`it` import가 파일 위에 이미 있으면 다시 넣지 않는다.)

- [ ] **Step 2: 실패 확인**

Run: `pnpm -F @hub/shared test`
Expected: FAIL — `PersonalInputSchema` 없음

- [ ] **Step 3: 구현** — `shared/src/index.ts`에서 `StoredProject` 선언 바로 위에 추가

```ts
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
  label: z.string().trim().min(1).max(30),
  url: z.string().trim().refine(isHttpUrl, 'http 또는 https 주소만 넣을 수 있습니다'),
});
export type PersonalLink = z.infer<typeof PersonalLinkSchema>;

export const PersonalInputSchema = z.object({
  lifecycle: LifecycleSchema.nullable(),
  note: z.string().max(500),
  links: z.array(PersonalLinkSchema).max(5),
});
export type PersonalInput = z.infer<typeof PersonalInputSchema>;

export interface Personal extends PersonalInput {
  updatedAt: string | null;
}
export const EMPTY_PERSONAL: Personal = { lifecycle: null, note: '', links: [], updatedAt: null };
```

그리고 `Project` 인터페이스에 필드를 추가한다.

```ts
export interface Project extends StoredProject {
  summary: Summary | null;
  summaryAt: string | null;
  runConfig: RunConfig | null;
  personal: Personal;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm -F @hub/shared test`
Expected: PASS

- [ ] **Step 5: 기존 Project 픽스처에 personal 추가**

`personal`이 필수가 되어 다음 픽스처가 타입 오류를 낸다. 각 픽스처 객체의 `runConfig: null,` 바로 다음 줄에 `personal: EMPTY_PERSONAL,`을 넣고, 파일 상단 `@hub/shared` import에 `EMPTY_PERSONAL`을 추가한다.

- `web/src/lib/status.test.ts`
- `web/src/lib/portfolio.test.ts`
- `web/src/lib/runConfig.test.ts`
- `server/test/insights.test.ts`

그 밖에 `Project` 객체 리터럴을 만드는 곳을 찾는다: `grep -rn "runConfig: null" web/src server/src server/test`. 서버 `toProject`는 Task 2에서 고친다(그때까지 server typecheck 오류는 허용하되 테스트는 돌려 본다).

Run: `pnpm -F @hub/web typecheck && pnpm -F @hub/web test`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add shared web/src/lib server/test/insights.test.ts
git commit -m "feat(shared): personal tags/notes/links schema and Project.personal"
```

---

### Task 2: 서버 저장소와 API

**Files:**
- Modify: `server/src/db.ts`, `server/src/app.ts`
- Test: `server/test/db.test.ts`, `server/test/app.test.ts`

**Interfaces:**
- Consumes: `PersonalInputSchema`, `PersonalInput`, `Personal`, `EMPTY_PERSONAL` (Task 1)
- Produces:
  - `Db.getPersonal(name: string): Personal` (행이 없으면 `EMPTY_PERSONAL`)
  - `Db.putPersonal(name: string, input: PersonalInput): Personal` (`updatedAt` = 현재 ISO)
  - `PUT /api/projects/:name/personal` → 200 `Personal` | 400 `{ error: 'invalid', issues }` | 404

- [ ] **Step 1: 실패하는 DB 테스트** — `server/test/db.test.ts`의 `describe('openDb')` 안에 추가하고, 기존 `deleteProject` 테스트도 보강

```ts
  it('stores personal data and returns an empty default', () => {
    const db = openDb(':memory:');
    expect(db.getPersonal('a')).toEqual({ lifecycle: null, note: '', links: [], updatedAt: null });
    const saved = db.putPersonal('a', { lifecycle: 'focus', note: '메모', links: [{ label: '운영', url: 'https://x.dev' }] });
    expect(saved.updatedAt).toEqual(expect.any(String));
    expect(db.getPersonal('a')).toEqual(saved);
    db.putPersonal('a', { lifecycle: null, note: '', links: [] });
    expect(db.getPersonal('a')).toMatchObject({ lifecycle: null, note: '', links: [] });
  });
```

`deleteProject removes every row for that project` 테스트에 다음 두 줄을 넣는다(`db.deleteProject('a')` 앞뒤).

```ts
    db.putPersonal('a', { lifecycle: 'archive', note: 'n', links: [] });
    // ... db.deleteProject('a'); 다음에
    expect(db.getPersonal('a').updatedAt).toBeNull();
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm -F @hub/server exec vitest run test/db.test.ts`
Expected: FAIL — `getPersonal is not a function`

- [ ] **Step 3: DB 구현** — `server/src/db.ts`

import에 `EMPTY_PERSONAL, type Personal, type PersonalInput`을 추가한다. `Db` 인터페이스에:

```ts
  getPersonal(name: string): Personal;
  putPersonal(name: string, input: PersonalInput): Personal;
```

`SCHEMA` 문자열 끝에:

```sql
CREATE TABLE IF NOT EXISTS project_personal (name TEXT PRIMARY KEY, lifecycle TEXT, note TEXT NOT NULL DEFAULT '', links TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL);
```

`deleteProject`의 테이블 목록을 `['projects', 'summaries', 'run_configs', 'launches', 'project_personal']`로 바꾼다. 반환 객체에:

```ts
    getPersonal: (name) => {
      const r = db.prepare('SELECT * FROM project_personal WHERE name = ?').get(name) as Row | undefined;
      return r
        ? {
            lifecycle: (r.lifecycle as Personal['lifecycle']) ?? null,
            note: String(r.note),
            links: JSON.parse(String(r.links)),
            updatedAt: String(r.updated_at),
          }
        : { ...EMPTY_PERSONAL };
    },
    putPersonal: (name, input) => {
      const updatedAt = new Date().toISOString();
      db.prepare(
        'INSERT INTO project_personal (name, lifecycle, note, links, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET lifecycle = excluded.lifecycle, note = excluded.note, links = excluded.links, updated_at = excluded.updated_at',
      ).run(name, input.lifecycle, input.note, JSON.stringify(input.links), updatedAt);
      return { ...input, updatedAt };
    },
```

- [ ] **Step 4: 실패하는 API 테스트** — `server/test/app.test.ts`에 새 describe 추가

```ts
const put = (body: unknown) => ({ method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('personal', () => {
  const input = { lifecycle: 'launch', note: '도메인 연결', links: [{ label: '운영', url: 'https://x.dev' }] };
  it('saves personal data and attaches it to project responses', async () => {
    const { app } = setup();
    const res = await app.request('/api/projects/alpha/personal', put(input));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ...input, updatedAt: expect.any(String) });
    const list = (await (await app.request('/api/projects')).json()) as ProjectsResponse;
    expect(list.projects[0].personal).toMatchObject(input);
    expect((await (await app.request('/api/projects/alpha')).json()).personal).toMatchObject(input);
  });
  it('defaults to empty personal data', async () => {
    const list = (await (await setup().app.request('/api/projects')).json()) as ProjectsResponse;
    expect(list.projects[0].personal).toEqual({ lifecycle: null, note: '', links: [], updatedAt: null });
  });
  it('rejects invalid input with the violated fields', async () => {
    const res = await setup().app.request('/api/projects/alpha/personal', put({ ...input, links: [{ label: 'x', url: 'javascript:alert(1)' }] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid');
    expect(body.issues[0].path).toEqual(['links', 0, 'url']);
  });
  it('returns 404 for unknown projects', async () => {
    expect((await setup().app.request('/api/projects/nope/personal', put(input))).status).toBe(404);
  });
  it('is protected by the request guard', async () => {
    const { app } = setup();
    const noJson = await app.request('/api/projects/alpha/personal', { method: 'PUT', body: JSON.stringify(input) });
    expect(noJson.status).toBe(415);
    const cross = await app.request('/api/projects/alpha/personal', { ...put(input), headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' } });
    expect(cross.status).toBe(403);
  });
});
```

- [ ] **Step 5: 실패 확인**

Run: `pnpm -F @hub/server exec vitest run test/app.test.ts`
Expected: FAIL — 404 대신 200 기대 등

- [ ] **Step 6: API 구현** — `server/src/app.ts`

import에 `PersonalInputSchema`를 추가한다. `toProject`를:

```ts
export function toProject(db: Db, p: StoredProject): Project {
  const s = db.getSummary(p.name);
  return {
    ...p,
    summary: s?.content ?? null,
    summaryAt: s?.createdAt ?? null,
    runConfig: db.getRunConfig(p.name),
    personal: db.getPersonal(p.name),
  };
}
```

`app.put('/api/projects/:name/run-config', ...)` 바로 아래에:

```ts
  // 내 태그·메모·바로가기 링크. 본문 전체로 교체한다.
  app.put('/api/projects/:name/personal', async (c) => {
    const name = c.req.param('name');
    if (!db.getProject(name)) return c.json({ error: 'not-found' }, 404);
    const parsed = PersonalInputSchema.safeParse(await body(c));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    return c.json(db.putPersonal(name, parsed.data));
  });
```

- [ ] **Step 7: 통과 확인**

Run: `pnpm -F @hub/server test && pnpm -F @hub/server typecheck`
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add server
git commit -m "feat(server): project_personal table and PUT /api/projects/:name/personal"
```

---

### Task 3: 태그 이름표와 태그 필터 (웹 순수 함수)

**Files:**
- Create: `web/src/lib/lifecycle.ts`, `web/src/lib/lifecycle.test.ts`

**Interfaces:**
- Consumes: `Lifecycle`, `LIFECYCLES`, `Personal`, `PersonalInput`, `Project` (Task 1)
- Produces:
  - `LIFECYCLE_LABEL: Record<Lifecycle, { label: string; short: string; cls: string }>`
  - `type TagFilter = 'all' | Lifecycle | 'none'`
  - `TAG_FILTERS: TagFilter[]` = `['all','focus','maintain','launch','experiment','none','archive']`
  - `TAG_FILTER_LABEL: Record<TagFilter, string>`
  - `isArchived(p: Project): boolean`
  - `filterByTag(projects: Project[], tag: TagFilter): Project[]`
  - `archivedCount(projects: Project[]): number`
  - `withLifecycle(personal: Personal, lifecycle: Lifecycle | null): PersonalInput`

- [ ] **Step 1: 실패하는 테스트**

```ts
import { describe, expect, it } from 'vitest';
import { EMPTY_PERSONAL, type Lifecycle, type Project } from '@hub/shared';
import { archivedCount, filterByTag, withLifecycle } from './lifecycle';

const p = (name: string, lifecycle: Lifecycle | null) =>
  ({ name, personal: { ...EMPTY_PERSONAL, lifecycle } }) as Project;
const all = [p('a', 'focus'), p('b', null), p('c', 'archive'), p('d', 'experiment')];
const names = (xs: Project[]) => xs.map((x) => x.name);

describe('filterByTag', () => {
  it('hides archived projects under "all"', () => {
    expect(names(filterByTag(all, 'all'))).toEqual(['a', 'b', 'd']);
  });
  it('shows archived projects only under "archive"', () => {
    expect(names(filterByTag(all, 'archive'))).toEqual(['c']);
  });
  it('matches a single tag, and "none" means untagged', () => {
    expect(names(filterByTag(all, 'focus'))).toEqual(['a']);
    expect(names(filterByTag(all, 'none'))).toEqual(['b']);
  });
  it('counts archived projects', () => {
    expect(archivedCount(all)).toBe(1);
  });
});

describe('withLifecycle', () => {
  it('changes only the tag and keeps note and links', () => {
    const personal = { lifecycle: null, note: '메모', links: [{ label: 'x', url: 'https://x.dev' }], updatedAt: 't' };
    expect(withLifecycle(personal, 'experiment')).toEqual({ lifecycle: 'experiment', note: '메모', links: personal.links });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm -F @hub/web exec vitest run src/lib/lifecycle.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** — `web/src/lib/lifecycle.ts`

```ts
import type { Lifecycle, Personal, PersonalInput, Project } from '@hub/shared';

export const LIFECYCLE_LABEL: Record<Lifecycle, { label: string; short: string; cls: string }> = {
  focus: { label: '집중', short: '집중', cls: 'border-accent/40 bg-accent/10 text-accent' },
  maintain: { label: '유지', short: '유지', cls: 'border-live/30 bg-live/10 text-live' },
  launch: { label: '공개 준비', short: '공개', cls: 'border-accent2/40 bg-accent2/10 text-accent2' },
  experiment: { label: '실험', short: '실험', cls: 'border-line bg-white/5 text-muted' },
  archive: { label: '보관', short: '보관', cls: 'border-line bg-white/5 text-muted/70' },
};

export type TagFilter = 'all' | Lifecycle | 'none';
export const TAG_FILTERS: TagFilter[] = ['all', 'focus', 'maintain', 'launch', 'experiment', 'none', 'archive'];
export const TAG_FILTER_LABEL: Record<TagFilter, string> = {
  all: '전체',
  focus: '집중',
  maintain: '유지',
  launch: '공개 준비',
  experiment: '실험',
  none: '미분류',
  archive: '보관',
};

export const isArchived = (p: Project) => p.personal.lifecycle === 'archive';

// "전체"는 보관을 뺀다. 보관은 "보관"을 골랐을 때만 보인다(실행 중이어도 예외 없음).
export function filterByTag(projects: Project[], tag: TagFilter): Project[] {
  if (tag === 'all') return projects.filter((p) => !isArchived(p));
  if (tag === 'none') return projects.filter((p) => p.personal.lifecycle === null);
  return projects.filter((p) => p.personal.lifecycle === tag);
}

export const archivedCount = (projects: Project[]) => projects.filter(isArchived).length;

// 태그만 바꾸고 메모·링크는 그대로 둔다(PUT은 전체 교체라 나머지를 같이 보내야 한다).
export const withLifecycle = (personal: Personal, lifecycle: Lifecycle | null): PersonalInput => ({
  lifecycle,
  note: personal.note,
  links: personal.links,
});
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm -F @hub/web exec vitest run src/lib/lifecycle.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add web/src/lib/lifecycle.ts web/src/lib/lifecycle.test.ts
git commit -m "feat(web): lifecycle labels and tag filter helpers"
```

---

### Task 4: 저장소 키와 첫 화면 통계 수정 (6장)

**Files:**
- Create: `web/src/lib/repo.ts`, `web/src/lib/repo.test.ts`
- Modify: `web/src/lib/portfolio.ts`, `web/src/lib/portfolio.test.ts`

**Interfaces:**
- Consumes: `isArchived` (Task 3)
- Produces:
  - `repoKeyOf(p: Project): string` — `githubRepo` → `remoteUrl` → `local:<name>`
  - `groupByRepo(projects: Project[]): Project[][]` — 각 묶음은 이름순, 묶음 순서는 대표(첫 번째) 이름순
  - `PortfolioStats`: `archived: number` 추가, `forgottenDirty` 삭제. `total`·`running`·`activity`·`openIssues`·`openPRs`·`stacks`·`weekly`·`mostIssues`·`mostActive`는 보관 제외 목록으로 계산. `openIssues`·`openPRs`는 저장소 묶음마다 대표 프로젝트 하나만 센다.

- [ ] **Step 1: 실패하는 repo 테스트** — `web/src/lib/repo.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { Project } from '@hub/shared';
import { groupByRepo, repoKeyOf } from './repo';

const p = (name: string, githubRepo: string | null, remoteUrl: string | null = null) => ({ name, githubRepo, remoteUrl }) as Project;

describe('repoKeyOf', () => {
  it('prefers githubRepo, then remoteUrl, then the folder name', () => {
    expect(repoKeyOf(p('a', 'me/a', 'git@github.com:me/a.git'))).toBe('me/a');
    expect(repoKeyOf(p('b', null, 'ssh://host/b.git'))).toBe('ssh://host/b.git');
    expect(repoKeyOf(p('c', null))).toBe('local:c');
  });
});

describe('groupByRepo', () => {
  it('groups folders of the same repository, representative first by name', () => {
    const groups = groupByRepo([p('DataBatcher-main', 'me/db'), p('solo', null), p('DataBatcher', 'me/db')]);
    expect(groups.map((g) => g.map((x) => x.name))).toEqual([['DataBatcher', 'DataBatcher-main'], ['solo']]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm -F @hub/web exec vitest run src/lib/repo.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** — `web/src/lib/repo.ts`

```ts
import type { Project } from '@hub/shared';

// 같은 저장소를 가리키는 폴더(예: DataBatcher 두 폴더)를 하나로 보기 위한 키.
export const repoKeyOf = (p: Project) => p.githubRepo ?? p.remoteUrl ?? `local:${p.name}`;

const byName = (a: Project, b: Project) => a.name.localeCompare(b.name, 'en');

export function groupByRepo(projects: Project[]): Project[][] {
  const groups = new Map<string, Project[]>();
  for (const p of projects) {
    const key = repoKeyOf(p);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.values()].map((g) => [...g].sort(byName)).sort((a, b) => byName(a[0], b[0]));
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm -F @hub/web exec vitest run src/lib/repo.test.ts`
Expected: PASS

- [ ] **Step 5: portfolio 테스트 고치기** — `web/src/lib/portfolio.test.ts`

픽스처 함수 `p`의 옵션에 `repo?: string; lifecycle?: Lifecycle`을 추가하고 다음처럼 반영한다(`Lifecycle`은 `@hub/shared`에서 import).

```ts
    githubRepo: o.repo ?? (o.issues !== undefined ? `me/${name}` : null),
    // ...
    personal: { ...EMPTY_PERSONAL, lifecycle: o.lifecycle ?? null },
```

기존 `forgottenDirty` 기대값 줄(`expect(s.forgottenDirty...)`)을 지우고, describe 안에 다음을 추가한다.

```ts
  it('excludes archived projects, even running ones, and reports how many were hidden', () => {
    const withArchived = [...projects, p('z', { last: 1, issues: 9, lifecycle: 'archive' })];
    const rt: RuntimeSnapshot = { at: '', byProject: { ...runtime.byProject, z: runtime.byProject.a } };
    const s2 = portfolioStats(withArchived, rt, NOW);
    expect(s2).toMatchObject({ total: 4, archived: 1, running: 1, openIssues: 5 });
    expect(s2.activity.active).toBe(1);
  });
  it('counts issues and PRs once per repository', () => {
    const dup = [p('DataBatcher', { issues: 3, prs: 1, repo: 'me/db' }), p('DataBatcher-main', { issues: 3, prs: 1, repo: 'me/db' })];
    expect(portfolioStats(dup, undefined, NOW)).toMatchObject({ openIssues: 3, openPRs: 1 });
  });
```

- [ ] **Step 6: 실패 확인**

Run: `pnpm -F @hub/web exec vitest run src/lib/portfolio.test.ts`
Expected: FAIL — `archived` 없음, openIssues 6

- [ ] **Step 7: 구현** — `web/src/lib/portfolio.ts`

- import 추가: `import { isArchived } from './lifecycle';`, `import { groupByRepo } from './repo';`
- `PortfolioStats`에서 `forgottenDirty` 줄을 지우고 `archived: number;`를 `total` 다음에 넣는다.
- 함수 본문 첫 줄에서 보관을 뺀 목록으로 바꿔 계산한다.

```ts
export function portfolioStats(all: Project[], runtime: RuntimeSnapshot | undefined, now: Date): PortfolioStats {
  // 보관 프로젝트는 지표에서 뺀다(실행 중이어도). 몇 개를 뺐는지는 archived로 알려 준다.
  const projects = all.filter((p) => !isArchived(p));
```

- 루프 안의 `openIssues += ...`, `openPRs += ...` 두 줄을 지우고, 루프 다음에 저장소 단위로 센다.

```ts
  // 같은 저장소를 가리키는 폴더가 여럿이면 이슈·PR은 한 번만 센다.
  for (const [rep] of groupByRepo(projects)) {
    openIssues += rep.github?.openIssues.length ?? 0;
    openPRs += rep.github?.openPRs.length ?? 0;
  }
```

- `age` 상수와 반환 객체의 `forgottenDirty` 항목을 지우고 `archived: all.length - projects.length,`를 `total` 다음에 넣는다.

- [ ] **Step 8: 통과 확인**

Run: `pnpm -F @hub/web test`
Expected: portfolio·repo PASS. `HomePage.tsx`는 아직 `forgottenDirty`를 쓰므로 typecheck는 Task 8에서 맞춘다.

- [ ] **Step 9: 커밋**

```bash
git add web/src/lib/repo.ts web/src/lib/repo.test.ts web/src/lib/portfolio.ts web/src/lib/portfolio.test.ts
git commit -m "fix(web): count issues/PRs once per repository and exclude archived projects from stats"
```

---

### Task 5: 주의 신호 계산 (기능 C 순수 함수)

**Files:**
- Create: `web/src/lib/attention.ts`, `web/src/lib/attention.test.ts`

**Interfaces:**
- Consumes: `isArchived` (Task 3), `groupByRepo` (Task 4), `activityOf` (`status.ts`)
- Produces:

```ts
export interface AttentionSignals {
  unpushed: { name: string; ahead: number }[];                         // ahead 많은 순
  stalePRs: { name: string; count: number; oldestDays: number }[];     // 저장소 대표 이름, oldestDays 큰 순
  forgotten: { name: string; dirty: number; lastCommitAt: string | null }[]; // 오래된 순
  noBackup: { name: string; reason: 'no-remote' | 'not-git' }[];       // 이름순
}
export const STALE_PR_DAYS = 30;
export function attentionSignals(projects: Project[], now: Date): AttentionSignals
export const attentionCount = (s: AttentionSignals) => s.unpushed.length + s.stalePRs.length + s.forgotten.length;
```

- [ ] **Step 1: 실패하는 테스트** — `web/src/lib/attention.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { EMPTY_PERSONAL, type Lifecycle, type Project } from '@hub/shared';
import { attentionSignals } from './attention';

const NOW = new Date('2026-10-06T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const pr = (number: number, age: number) => ({ number, title: '', url: '', labels: [], createdAt: daysAgo(age), closedAt: null });

function p(
  name: string,
  o: { git?: boolean; remote?: string | null; repo?: string; ahead?: number; dirty?: number; last?: number; prs?: number[]; lifecycle?: Lifecycle } = {},
): Project {
  const isGit = o.git ?? true;
  return {
    name,
    isGit,
    remoteUrl: o.remote === undefined ? `git@github.com:me/${name}.git` : o.remote,
    githubRepo: o.repo ?? null,
    git: isGit ? { branch: 'main', lastCommitAt: daysAgo(o.last ?? 1), dirtyCount: o.dirty ?? 0, hasUpstream: true, ahead: o.ahead ?? 0, behind: 0, recentCommits: [], weeklyCommits: [] } : null,
    github: o.prs ? { url: '', openIssues: [], openPRs: o.prs.map((age, i) => pr(i + 1, age)), recentlyClosedIssues: [], ci: { status: 'none' } } : null,
    personal: { ...EMPTY_PERSONAL, lifecycle: o.lifecycle ?? null },
  } as Project;
}

describe('attentionSignals', () => {
  it('lists unpushed commits, most first', () => {
    const s = attentionSignals([p('a', { ahead: 1 }), p('b', { ahead: 4 }), p('c')], NOW);
    expect(s.unpushed).toEqual([{ name: 'b', ahead: 4 }, { name: 'a', ahead: 1 }]);
  });
  it('lists PRs open for 30+ days once per repository', () => {
    const s = attentionSignals([p('db', { repo: 'me/db', prs: [40, 5, 31] }), p('db-main', { repo: 'me/db', prs: [40, 5, 31] }), p('x', { repo: 'me/x', prs: [29] })], NOW);
    expect(s.stalePRs).toEqual([{ name: 'db', count: 2, oldestDays: 40 }]);
  });
  it('lists forgotten changes only for dormant/stale, non-archived projects, oldest first', () => {
    const s = attentionSignals(
      [p('fresh', { dirty: 2, last: 3 }), p('dormant', { dirty: 1, last: 30 }), p('stale', { dirty: 5, last: 200 }), p('gone', { dirty: 9, last: 300, lifecycle: 'archive' })],
      NOW,
    );
    expect(s.forgotten.map((x) => x.name)).toEqual(['stale', 'dormant']);
    expect(s.forgotten[0]).toMatchObject({ dirty: 5 });
  });
  it('lists projects without a backup, excluding archived and experiment', () => {
    const s = attentionSignals(
      [p('local', { remote: null }), p('folder', { git: false }), p('ok'), p('lab', { remote: null, lifecycle: 'experiment' }), p('old', { git: false, lifecycle: 'archive' })],
      NOW,
    );
    expect(s.noBackup).toEqual([{ name: 'folder', reason: 'not-git' }, { name: 'local', reason: 'no-remote' }]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm -F @hub/web exec vitest run src/lib/attention.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** — `web/src/lib/attention.ts`

```ts
import type { Project } from '@hub/shared';
import { isArchived } from './lifecycle';
import { groupByRepo } from './repo';
import { activityOf } from './status';

export interface AttentionSignals {
  unpushed: { name: string; ahead: number }[];
  stalePRs: { name: string; count: number; oldestDays: number }[];
  forgotten: { name: string; dirty: number; lastCommitAt: string | null }[];
  noBackup: { name: string; reason: 'no-remote' | 'not-git' }[];
}

export const STALE_PR_DAYS = 30;
const DAY = 86_400_000;

// 행동이 필요한 신호(주의)와 참고 목록(백업 없음)을 수집 데이터만으로 계산한다.
export function attentionSignals(projects: Project[], now: Date): AttentionSignals {
  const unpushed = projects
    .filter((p) => (p.git?.ahead ?? 0) > 0)
    .map((p) => ({ name: p.name, ahead: p.git!.ahead }))
    .sort((a, b) => b.ahead - a.ahead || a.name.localeCompare(b.name, 'en'));

  const stalePRs = groupByRepo(projects)
    .map(([rep]) => {
      const ages = (rep.github?.openPRs ?? []).map((x) => Math.floor((now.getTime() - new Date(x.createdAt).getTime()) / DAY)).filter((d) => d >= STALE_PR_DAYS);
      return { name: rep.name, count: ages.length, oldestDays: Math.max(0, ...ages) };
    })
    .filter((x) => x.count > 0)
    .sort((a, b) => b.oldestDays - a.oldestDays);

  const lastAt = (p: Project) => (p.git?.lastCommitAt ? new Date(p.git.lastCommitAt).getTime() : 0);
  const forgotten = projects
    .filter((p) => !isArchived(p) && (p.git?.dirtyCount ?? 0) > 0 && ['dormant', 'stale'].includes(activityOf(p.git?.lastCommitAt ?? null, now)))
    .sort((a, b) => lastAt(a) - lastAt(b))
    .map((p) => ({ name: p.name, dirty: p.git!.dirtyCount, lastCommitAt: p.git!.lastCommitAt }));

  const noBackup = projects
    .filter((p) => !['archive', 'experiment'].includes(p.personal.lifecycle ?? '') && (!p.isGit || !p.remoteUrl))
    .map((p) => ({ name: p.name, reason: p.isGit ? ('no-remote' as const) : ('not-git' as const) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));

  return { unpushed, stalePRs, forgotten, noBackup };
}

export const attentionCount = (s: AttentionSignals) => s.unpushed.length + s.stalePRs.length + s.forgotten.length;
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm -F @hub/web exec vitest run src/lib/attention.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add web/src/lib/attention.ts web/src/lib/attention.test.ts
git commit -m "feat(web): attention signals (unpushed, stale PRs, forgotten changes) and no-backup list"
```

---

### Task 6: 목록의 태그 선택·거르기 순서·보관 숨김

**Files:**
- Modify: `web/src/App.tsx`, `web/src/features/list/ProjectList.tsx`, `web/src/features/list/ProjectRow.tsx`, `web/src/lib/status.test.ts`

**Interfaces:**
- Consumes: `TagFilter`, `TAG_FILTERS`, `TAG_FILTER_LABEL`, `LIFECYCLE_LABEL`, `filterByTag`, `archivedCount` (Task 3)
- Produces: `ProjectList` 새 props `tag: TagFilter`, `onTag: (t: TagFilter) => void`, `hiddenArchived: number`. App의 `applyFilter(f: Filter)` (태그를 'all'로 되돌리고 필터 적용) — Task 8의 HomePage가 `onFilter`로 받는다.

- [ ] **Step 1: 실패하는 테스트** — `web/src/lib/status.test.ts`에 추가 (태그 → 필터 칩 숫자 순서 고정)

```ts
import { filterByTag } from './lifecycle';

describe('tag filter then filter-chip counts', () => {
  it('counts filter chips after applying the tag condition', () => {
    const a = { ...project('a', {}, 1, 2), personal: { ...EMPTY_PERSONAL, lifecycle: 'focus' as const } };
    const b = { ...project('b', {}, 1, 3), personal: { ...EMPTY_PERSONAL, lifecycle: 'archive' as const } };
    const c = project('c', {}, 100);
    const counts = countFilters(filterByTag([a, b, c], 'all'), undefined, NOW);
    expect(counts).toMatchObject({ all: 2, dirty: 1, stale: 1 });
    expect(countFilters(filterByTag([a, b, c], 'archive'), undefined, NOW)).toMatchObject({ all: 1, dirty: 1 });
  });
});
```

(`project` 픽스처의 네 번째 인자가 dirty 수다. `EMPTY_PERSONAL` import는 Task 1에서 추가했다.)

- [ ] **Step 2: 통과 확인** (조합 테스트라 Task 3 함수가 있으면 바로 통과한다)

Run: `pnpm -F @hub/web exec vitest run src/lib/status.test.ts`
Expected: PASS

- [ ] **Step 3: App 상태와 거르기 순서** — `web/src/App.tsx`

import 추가: `import { archivedCount, filterByTag, type TagFilter } from './lib/lifecycle';`

`const [sort, setSort] = ...` 다음 줄에:

```ts
  const [tag, setTag] = useState<TagFilter>('all');
```

`visible`·`counts` 계산을 다음으로 바꾼다.

```ts
  const projects = data?.projects ?? [];
  // 태그 조건 → 필터 칩 → 검색어 순서로 거른다. 칩 숫자도 태그 조건을 적용한 뒤 센다.
  const tagged = useMemo(() => filterByTag(projects, tag), [projects, tag]);
  const visible = useMemo(
    () => sortProjects(filterProjects(tagged, filter, runtime, query, now), sort),
    [tagged, filter, runtime, query, now, sort],
  );
  const counts = useMemo(() => countFilters(tagged, runtime, now), [tagged, runtime, now]);
  const hiddenArchived = tag === 'all' ? archivedCount(projects) : 0;
  // 첫 화면 지표 카드: 태그 선택을 "전체"로 되돌린 뒤 해당 필터를 건다.
  const applyFilter = (f: Filter) => {
    setTag('all');
    setFilter(f);
  };
```

`<HomePage ... onFilter={setFilter}`를 `onFilter={applyFilter}`로 바꾼다. `<ProjectList>`에 props를 추가한다.

```tsx
          tag={tag}
          onTag={setTag}
          hiddenArchived={hiddenArchived}
```

- [ ] **Step 4: 목록 UI** — `web/src/features/list/ProjectList.tsx`

import 추가: `import { TAG_FILTERS, TAG_FILTER_LABEL, type TagFilter } from '../../lib/lifecycle';`

props 타입에 `tag: TagFilter; onTag: (t: TagFilter) => void; hiddenArchived: number;` 추가. 정렬 `<select>`를 다음 블록으로 감싼다.

```tsx
        <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
          <select
            value={props.tag}
            onChange={(e) => props.onTag(e.target.value as TagFilter)}
            aria-label="태그로 거르기"
            className="rounded-lg border border-line bg-panel px-2 py-0.5 text-[11px] text-muted outline-none"
          >
            {TAG_FILTERS.map((t) => (
              <option key={t} value={t}>
                {t === 'all' ? '태그 전체' : TAG_FILTER_LABEL[t]}
              </option>
            ))}
          </select>
          {/* 기존 정렬 select. className에서 ml-auto를 뺀다. */}
        </div>
```

목록 스크롤 영역(`props.projects.map(...)` 다음, 닫는 `</div>` 앞)에:

```tsx
        {!props.loading && props.hiddenArchived > 0 && (
          <button onClick={() => props.onTag('archive')} className="w-full px-3.5 py-2.5 text-center text-[11px] text-muted hover:text-fg">
            보관 {props.hiddenArchived}개 숨김 · 보기
          </button>
        )}
```

- [ ] **Step 5: 행 표시** — `web/src/features/list/ProjectRow.tsx`

import 추가: `import { LIFECYCLE_LABEL } from '../../lib/lifecycle';`

이름 `<span>` 바로 뒤에 태그 칩(미분류는 표시 안 함), `dirty` 표시 앞에 `↑n`을 넣는다.

```tsx
        {p.personal.lifecycle && (
          <span className={cn('shrink-0 rounded-full border px-1.5 py-px text-[10px]', LIFECYCLE_LABEL[p.personal.lifecycle].cls)}>
            {LIFECYCLE_LABEL[p.personal.lifecycle].short}
          </span>
        )}
        {(p.git?.ahead ?? 0) > 0 && (
          <span className="text-[10px] text-warn" title={`push 안 한 커밋 ${p.git!.ahead}개`}>
            ↑{p.git!.ahead}
          </span>
        )}
```

- [ ] **Step 6: 확인**

Run: `pnpm -F @hub/web test`
Expected: PASS (typecheck는 HomePage의 `forgottenDirty` 때문에 Task 8 전까지 실패할 수 있다)

- [ ] **Step 7: 커밋**

```bash
git add web/src/App.tsx web/src/features/list web/src/lib/status.test.ts
git commit -m "feat(web): tag filter in the list, archived hidden by default, tag and unpushed chips"
```

---

### Task 7: 상세 헤더의 태그·메모·링크 편집

**Files:**
- Modify: `web/src/lib/api.ts`, `web/src/lib/hooks.ts`, `web/src/features/detail/ProjectDetail.tsx`
- Create: `web/src/features/detail/PersonalHeader.tsx`, `web/src/features/detail/LinksDialog.tsx`

**Interfaces:**
- Consumes: `PersonalInput`, `PersonalInputSchema`, `Personal`, `LIFECYCLES` (Task 1), `LIFECYCLE_LABEL`, `withLifecycle` (Task 3)
- Produces:
  - `api.savePersonal(name: string, input: PersonalInput): Promise<Personal>`
  - `useSavePersonal(name: string)` → react-query mutation(`mutate(input)`), 성공 시 `['projects']` 무효화
  - `<LifecycleSelect project={p} />`, `<NoteLine project={p} />`, `<LinkChips project={p} />` (모두 `PersonalHeader.tsx`에서 export)

- [ ] **Step 1: API·훅** — `web/src/lib/api.ts`

import에 `Personal, PersonalInput` 추가. `api` 객체에:

```ts
  savePersonal: (name: string, input: PersonalInput) => request<Personal>(`${p(name)}/personal`, { method: 'PUT', body: input }),
```

`web/src/lib/hooks.ts`에 (import에 `useMutation`, `PersonalInput` 추가):

```ts
export function useSavePersonal(name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PersonalInput) => api.savePersonal(name, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

// 서버 400 응답의 첫 위반 항목을 사람이 읽을 문장으로 바꾼다.
export function saveErrorText(e: unknown): string {
  const issue = (e as { body?: { issues?: { message?: string }[] } })?.body?.issues?.[0];
  return issue?.message ?? (e instanceof Error ? e.message : '저장하지 못했습니다');
}
```

- [ ] **Step 2: PersonalHeader** — `web/src/features/detail/PersonalHeader.tsx`

```tsx
import { LIFECYCLES, type Lifecycle, type Project } from '@hub/shared';
import { ExternalLink, Pencil } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/cn';
import { saveErrorText, useSavePersonal } from '../../lib/hooks';
import { LIFECYCLE_LABEL, withLifecycle } from '../../lib/lifecycle';
import { LinksDialog } from './LinksDialog';

export function LifecycleSelect({ project: p }: { project: Project }) {
  const save = useSavePersonal(p.name);
  const value = p.personal.lifecycle;
  return (
    <select
      value={value ?? ''}
      onChange={(e) => save.mutate(withLifecycle(p.personal, (e.target.value || null) as Lifecycle | null))}
      disabled={save.isPending}
      aria-label="프로젝트 태그"
      className={cn('rounded-full border px-2 py-0.5 text-[11px] outline-none', value ? LIFECYCLE_LABEL[value].cls : 'border-line bg-transparent text-muted')}
    >
      <option value="">미분류</option>
      {LIFECYCLES.map((l) => (
        <option key={l} value={l}>
          {LIFECYCLE_LABEL[l].label}
        </option>
      ))}
    </select>
  );
}

// 한 줄 메모. 눌러서 편집하고 Enter로 저장, Esc로 취소한다.
export function NoteLine({ project: p }: { project: Project }) {
  const save = useSavePersonal(p.name);
  const [draft, setDraft] = useState<string | null>(null);
  const submit = () => {
    if (draft === null) return;
    save.mutate({ ...withLifecycle(p.personal, p.personal.lifecycle), note: draft.trim() }, { onSuccess: () => setDraft(null) });
  };
  if (draft !== null) {
    return (
      <div className="mt-1.5">
        <input
          autoFocus
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
            if (e.key === 'Escape') setDraft(null);
          }}
          onBlur={() => setDraft(null)}
          placeholder="다음에 할 일을 한 줄로 (Enter 저장 · Esc 취소)"
          className="w-full rounded-lg border border-accent/40 bg-black/30 px-2.5 py-1 text-sm outline-none"
        />
        {save.error && <p className="mt-1 text-[11px] text-bad">{saveErrorText(save.error)}</p>}
      </div>
    );
  }
  return (
    <button onClick={() => setDraft(p.personal.note)} className="group mt-1.5 flex items-center gap-1.5 text-left text-sm text-fg/80 hover:text-fg">
      <span className="text-[11px] text-muted">메모</span>
      {p.personal.note || <span className="text-muted">눌러서 메모 남기기</span>}
      <Pencil className="size-3 text-muted opacity-0 group-hover:opacity-100" />
    </button>
  );
}

// 바로가기 링크 칩. 실행 여부와 관계없이 항상 보인다.
export function LinkChips({ project: p }: { project: Project }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {p.personal.links.map((l) => (
        <a
          key={`${l.label}-${l.url}`}
          href={l.url}
          target="_blank"
          rel="noreferrer noopener"
          title={l.url}
          className="inline-flex items-center gap-1 rounded-full border border-line bg-white/[0.03] px-2 py-0.5 text-[11px] text-fg/85 hover:border-accent/50"
        >
          {l.label} <ExternalLink className="size-3" />
        </a>
      ))}
      <button onClick={() => setEditing(true)} className="text-[11px] text-muted hover:text-fg">
        {p.personal.links.length ? '링크 편집' : '+ 바로가기 링크'}
      </button>
      <LinksDialog project={p} open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}
```

- [ ] **Step 3: LinksDialog** — `web/src/features/detail/LinksDialog.tsx`

```tsx
import { PersonalInputSchema, type PersonalLink, type Project } from '@hub/shared';
import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { saveErrorText, useSavePersonal } from '../../lib/hooks';

const MAX_LINKS = 5;

export function LinksDialog({ project: p, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  const save = useSavePersonal(p.name);
  const [rows, setRows] = useState<PersonalLink[]>(p.personal.links);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setRows(p.personal.links);
      setError(null);
    }
  }, [open, p.personal.links]);

  const update = (i: number, patch: Partial<PersonalLink>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const submit = () => {
    // 둘 다 빈 행은 버린다. 나머지는 서버와 같은 스키마로 먼저 검사한다.
    const links = rows.filter((r) => r.label.trim() || r.url.trim());
    const parsed = PersonalInputSchema.safeParse({ lifecycle: p.personal.lifecycle, note: p.personal.note, links });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(`${typeof issue.path[1] === 'number' ? `${issue.path[1] + 1}번째 링크: ` : ''}${issue.message}`);
      return;
    }
    save.mutate(parsed.data, { onSuccess: onClose, onError: (e) => setError(saveErrorText(e)) });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="바로가기 링크 편집"
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={submit} disabled={save.isPending}>
            저장
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-muted">운영 주소, 관리 화면, 텔레그램 봇(https://t.me/...) 등. 최대 {MAX_LINKS}개, http·https 주소만.</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <input value={r.label} maxLength={30} onChange={(e) => update(i, { label: e.target.value })} placeholder="이름" className="w-28 rounded-lg border border-line bg-black/30 px-2 py-1 text-xs outline-none focus:border-accent/50" />
            <input value={r.url} onChange={(e) => update(i, { url: e.target.value })} placeholder="https://" className="min-w-0 flex-1 rounded-lg border border-line bg-black/30 px-2 py-1 font-mono text-xs outline-none focus:border-accent/50" />
            <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="링크 삭제" className="text-muted hover:text-bad">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
      {rows.length < MAX_LINKS && (
        <button onClick={() => setRows((rs) => [...rs, { label: '', url: '' }])} className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
          <Plus className="size-3" /> 링크 추가
        </button>
      )}
      {error && <p className="mt-3 text-xs text-bad">{error}</p>}
    </Dialog>
  );
}
```

- [ ] **Step 4: 상세 화면에 배치** — `web/src/features/detail/ProjectDetail.tsx`

import 추가: `import { LifecycleSelect, LinkChips, NoteLine } from './PersonalHeader';`

헤더의 `<h2>` 바로 뒤에 `<LifecycleSelect project={p} />`를 넣는다. 한 줄 설명 `<p>` 바로 뒤에 다음 두 줄을 넣는다.

```tsx
      <NoteLine project={p} />
      <LinkChips project={p} />
```

- [ ] **Step 5: 확인**

Run: `pnpm -F @hub/web test`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add web/src/lib/api.ts web/src/lib/hooks.ts web/src/features/detail
git commit -m "feat(web): edit tag, one-line note and quick links in the detail header"
```

---

### Task 8: 첫 화면 — 보관 수, 주의할 것, 백업 없음

**Files:**
- Create: `web/src/features/home/AttentionBox.tsx`
- Modify: `web/src/features/home/HomePage.tsx`

**Interfaces:**
- Consumes: `attentionSignals`, `attentionCount`, `AttentionSignals` (Task 5), `PortfolioStats.archived` (Task 4), `useSavePersonal`, `withLifecycle` (Task 3·7)
- Produces: `<AttentionBox projects={Project[]} now={Date} onOpen={(name) => void} />`

- [ ] **Step 1: AttentionBox** — `web/src/features/home/AttentionBox.tsx`

```tsx
import type { Lifecycle, Project } from '@hub/shared';
import { ChevronDown, HardDriveDownload } from 'lucide-react';
import { Box } from '../../components/ui/Box';
import { attentionCount, attentionSignals } from '../../lib/attention';
import { useSavePersonal } from '../../lib/hooks';
import { withLifecycle } from '../../lib/lifecycle';
import { relativeTime } from '../../lib/status';

function Row({ name, onOpen, right }: { name: string; onOpen: (n: string) => void; right: string }) {
  return (
    <button onClick={() => onOpen(name)} className="flex w-full justify-between py-0.5 text-left text-xs hover:text-white">
      <span>{name}</span>
      <span className="text-warn">{right}</span>
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-0.5 text-[11px] text-muted">{title}</h4>
      {children}
    </div>
  );
}

function QuickTag({ project, lifecycle, label }: { project: Project; lifecycle: Lifecycle; label: string }) {
  const save = useSavePersonal(project.name);
  return (
    <button
      onClick={() => save.mutate(withLifecycle(project.personal, lifecycle))}
      disabled={save.isPending}
      className="rounded-md border border-line px-1.5 py-px text-[10px] text-muted hover:border-accent/50 hover:text-fg disabled:opacity-50"
    >
      {label}
    </button>
  );
}

export function AttentionBox({ projects, now, onOpen }: { projects: Project[]; now: Date; onOpen: (name: string) => void }) {
  const s = attentionSignals(projects, now);
  const byName = new Map(projects.map((p) => [p.name, p]));
  return (
    <div className="mt-3 grid gap-3 xl:grid-cols-[2fr_1fr]">
      <Box title="주의할 것" className="mb-0">
        {attentionCount(s) === 0 ? (
          <p className="text-xs text-muted">지금 처리할 것이 없습니다.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {s.unpushed.length > 0 && (
              <Group title="push 안 한 커밋">
                {s.unpushed.map((x) => <Row key={x.name} name={x.name} onOpen={onOpen} right={`↑${x.ahead} push 안 함`} />)}
              </Group>
            )}
            {s.stalePRs.length > 0 && (
              <Group title="30일 넘게 열린 PR">
                {s.stalePRs.map((x) => <Row key={x.name} name={x.name} onOpen={onOpen} right={`PR ${x.count}개 · 최장 ${x.oldestDays}일`} />)}
              </Group>
            )}
            {s.forgotten.length > 0 && (
              <Group title="잊혀진 변경 · 휴면·방치인데 커밋 안 한 변경">
                {s.forgotten.map((x) => <Row key={x.name} name={x.name} onOpen={onOpen} right={`±${x.dirty} · ${relativeTime(x.lastCommitAt, now)}`} />)}
              </Group>
            )}
          </div>
        )}
      </Box>

      {/* 경고가 아닌 참고 목록이라 접어 둔다. 실험·보관으로 표시하면 목록에서 빠진다. */}
      <details className="group rounded-xl border border-line bg-black/20 p-3.5">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium">
          <HardDriveDownload className="size-3.5 text-muted" /> 백업 없음 {s.noBackup.length}개
          <ChevronDown className="ml-auto size-3.5 text-muted transition group-open:rotate-180" />
        </summary>
        <p className="mt-2 text-[11px] text-muted">원격 저장소(GitHub 등)가 없어 이 컴퓨터에만 있는 프로젝트입니다.</p>
        <ul className="mt-2 space-y-1">
          {s.noBackup.map((x) => {
            const p = byName.get(x.name)!;
            return (
              <li key={x.name} className="flex items-center gap-1.5 text-xs">
                <button onClick={() => onOpen(x.name)} className="truncate hover:text-white">
                  {x.name}
                </button>
                <span className="text-[10px] text-muted">{x.reason === 'not-git' ? 'git 아님' : '원격 없음'}</span>
                <span className="ml-auto flex shrink-0 gap-1">
                  <QuickTag project={p} lifecycle="experiment" label="실험으로 표시" />
                  <QuickTag project={p} lifecycle="archive" label="보관으로 표시" />
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
```

- [ ] **Step 2: HomePage 수정** — `web/src/features/home/HomePage.tsx`

1. import 추가: `import { AttentionBox } from './AttentionBox';`
2. "전체" 카드의 표시값에 보관 수를 붙인다. `cards` 배열 원소 타입에 `extra?: string`을 추가하고 첫 원소를

```ts
    { label: '전체', value: stats.total, extra: stats.archived ? `(+보관 ${stats.archived})` : undefined, cls: 'text-fg', onClick: () => onFilter('all') },
```

   로 바꾼다. 카드 렌더링의 `<span className="text-[11px] text-muted">{c.label}</span>`을

```tsx
                <span className="text-[11px] text-muted">
                  {c.label}
                  {c.extra && <span className="ml-1 opacity-70">{c.extra}</span>}
                </span>
```

   로 바꾼다.
3. 세 칸 그리드(`md:grid-cols-3`)에서 "잊혀진 작업" `<Box>` 전체를 지우고 그리드를 `md:grid-cols-2`로 바꾼다. 그 그리드 바로 다음에 `<AttentionBox projects={projects} now={now} onOpen={onOpen} />`를 넣는다.
4. 첫 화면 제목 아래 `{stats.total}개 프로젝트`는 그대로 둔다(보관 제외 수).

- [ ] **Step 3: 전체 확인**

Run: `pnpm test && pnpm typecheck && pnpm -F @hub/web build`
Expected: 모두 PASS, 타입 오류 없음

- [ ] **Step 4: 브라우저 확인** (dev 서버가 4310/5199에 떠 있다. 서버는 tsx watch라 자동 재시작된다)

`curl -s 127.0.0.1:4310/api/projects | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['projects'][0]['personal'])"` → `{'lifecycle': None, 'note': '', 'links': [], 'updatedAt': None}`

http://127.0.0.1:5199 에서:
- 상세 헤더에서 태그를 "실험"으로 바꾸고, 메모를 입력해 Enter, 링크 1개 추가 → 목록 행에 "실험" 칩, 새로고침해도 유지
- 링크에 `javascript:alert(1)` 입력 → 대화상자에 오류 문구, 저장 안 됨
- 태그를 "보관"으로 바꾸면 "전체" 목록에서 사라지고 목록 하단에 "보관 1개 숨김 · 보기", 지표 카드에 "(+보관 1)"
- 첫 화면 "주의할 것" 상자와 "백업 없음 n개" 펼치기, "실험으로 표시" 누르면 목록에서 빠짐
- 확인 후 테스트로 바꾼 태그·메모·링크는 원래대로(미분류·빈 값) 되돌린다.

- [ ] **Step 5: 커밋**

```bash
git add web/src/features/home
git commit -m "feat(web): attention box, no-backup list with quick tags, archived count on the home cards"
```

---

## Self-Review 결과

- 스펙 3장(A): 3.1 데이터 → Task 1·2, 3.2 검증 → Task 1, 3.3 API → Task 2, 3.4 삭제 → Task 2, 3.5 화면 → Task 6·7·8. 5장(C): 5.1 → Task 5, 5.2 → Task 6(`↑n`)·Task 8. 6장 → Task 4. 8장 가드 → Task 2 테스트. 9장 테스트 항목 중 계획 1 범위(project_personal, attentionSignals, 태그 후 칩 숫자, portfolioStats) → Task 2·4·5·6.
- `portfolioStats.forgottenDirty` 삭제(5.1) → Task 4, 화면 대체 → Task 8.
- 스펙에는 "지표 카드"만 보관 제외라고 했지만, 같은 함수가 만드는 26주 막대·스택 분포·활발한/이슈 많은 목록도 보관을 뺀 목록으로 계산한다(보관은 더 이상 작업하지 않는 프로젝트라 첫 화면 집계 전체에서 빼는 것이 일관된다).
