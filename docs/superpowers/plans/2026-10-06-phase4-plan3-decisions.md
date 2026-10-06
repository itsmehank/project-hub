# 4단계 계획 3 — AI 제안 결정·공개 체크리스트·인사이트 프롬프트 v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 제안(서비스 후보·정리 제안·아이디어)을 채택·보류·거절로 기록하고, 채택한 서비스 후보는 공개 체크리스트로 진행을 추적하며, 다음 분석이 태그·메모·결정을 반영하게 한다.

**Architecture:** `shared`에 결정 스키마와 결정 ID 계산(`decisionId`, 순수 JS sha1)을 두어 서버·웹이 같이 쓴다. 서버는 `decisions` 테이블과 CRUD API를 두고, 서버가 snapshot에서 ID를 다시 계산해 검증한다. 인사이트 프롬프트는 v3로 올려 태그·메모·결정을 입력에 넣는다. 웹은 순수 함수(`web/src/lib/decisions.ts`)로 결정 매칭·진행률·재분석 안내 수를 계산하고, 카드 버튼·"내 결정" 칸·상세 체크리스트를 그린다.

**Tech Stack:** pnpm 모노레포, zod 4, Hono, node:sqlite, React 19, react-query, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-phase4-design.md` (7장 기능 E, 8장, 9장)

## Global Constraints

- 결정 ID: 서비스 후보 `candidate:<프로젝트명>`, 정리 제안 `cleanup:<이름순 정렬, ','로 연결>`, 아이디어 `idea:<제목 sha1 앞 12자>`. 정렬은 `localeCompare(b, 'en')`. ID 함수는 `shared`에 둔다.
- 서버는 PUT에서 kind별 snapshot 스키마(InsightsSchema의 해당 항목)로 검증하고, snapshot에서 다시 계산한 ID가 URL ID와 다르면 400.
- 상태: `adopted`(채택) `held`(보류) `rejected`(거절). 거절 이유는 선택, 최대 200자.
- 체크리스트 생성 규칙(하나뿐): 저장 후 상태가 `adopted`이고 kind가 `candidate`이며 체크리스트가 비어 있으면 `snapshot.nextSteps`로 만든다. 이미 있으면 건드리지 않는다. 다른 상태로 바꿔도 보존한다. 최대 20개, 항목당 200자.
- 프로젝트 폴더가 삭제돼도 결정은 지우지 않는다. 화면에서 없는 프로젝트 이름은 회색.
- `DELETE /api/decisions/:id`도 `content-type: application/json`을 요구한다(기존 가드). 화면에서는 확인 모달을 거친다.
- 재분석 안내 n = `personal.updatedAt` 또는 `decision.updatedAt`이 `insights.generatedAt`보다 늦은 수. 자동 재분석은 하지 않는다.
- `INSIGHTS_PROMPT_VERSION = 3`. 자동 재분석 해시에 태그·결정을 넣지 않는다. 버전 변경으로 서버 시작 또는 다음 새로고침 때 한 번 자동 재분석된다.
- 4단계 기능 자체는 LLM을 호출하지 않는다(예외: 위 자동 재분석 1회).
- 커밋 메시지에 Co-Authored-By 트레일러를 넣지 않는다.

## Review Focus

1. 한글·쉼표가 들어간 결정 ID(`cleanup:가,나`)가 URL 인코딩을 거쳐 서버에서 같은 ID로 비교돼야 한다 → Task 2 테스트.
2. 보류 → 채택으로 바꾸면 체크리스트가 생기고, 채택 → 보류 → 채택에서는 기존 체크리스트(완료 표시 포함)가 그대로여야 한다 → Task 2 테스트.
3. 분석이 다시 돌아 제안이 사라져도 "내 결정"에 저장된 복사본으로 계속 보여야 한다 → Task 4 `groupDecisions` 테스트(현재 insights와 무관).
4. 아이디어 제목이 한 글자라도 다르면 다른 결정이다(유사도 매칭 없음) → Task 1 테스트.
5. 결정이 없는 상태(빈 테이블)에서 프롬프트 v3가 "내 결정" 절을 깨뜨리지 않아야 한다 → Task 3 테스트.

---

## File Structure

| 파일 | 상태 | 책임 |
|---|---|---|
| `shared/src/decisions.ts` (+test) | 생성 | 결정 스키마, `decisionId`, `sha1Hex` |
| `shared/src/index.ts` | 수정 | 항목 스키마 export(`ServiceCandidateSchema` 등), `decisions.ts` 재export |
| `server/src/db.ts` (+`server/test/db.test.ts`) | 수정 | `decisions` 테이블과 저장 함수 |
| `server/src/app.ts` (+`server/test/app.test.ts`) | 수정 | 결정 API |
| `server/src/insights.ts` (+`server/test/insights.test.ts`) | 수정 | 프롬프트 v3 |
| `web/src/lib/decisions.ts` (+test) | 생성 | 매칭·진행률·묶기·재분석 안내 수 |
| `web/src/lib/api.ts`, `web/src/lib/hooks.ts` | 수정 | 결정 API·훅 |
| `web/src/features/home/DecisionButtons.tsx` | 생성 | 카드 아래 채택·보류·거절 |
| `web/src/features/home/MyDecisions.tsx` | 생성 | "내 결정" 칸 |
| `web/src/features/home/HomePage.tsx` | 수정 | 버튼·칸·재분석 안내 배치 |
| `web/src/features/detail/PublishChecklist.tsx` | 생성 | 공개 체크리스트 |
| `web/src/features/detail/AiSuggestions.tsx`, `ProjectDetail.tsx` | 수정 | 체크리스트 대체, "정리 예정" 칩 |

---

### Task 1: 결정 스키마와 결정 ID (shared)

**Files:**
- Create: `shared/src/decisions.ts`, `shared/src/decisions.test.ts`
- Modify: `shared/src/index.ts`

**Interfaces:**
- Produces:

```ts
export const ServiceCandidateSchema, CleanupSchema, NewIdeaSchema   // index.ts, InsightsSchema가 이것을 쓴다
export const DECISION_KINDS = ['candidate', 'cleanup', 'idea'] as const; export type DecisionKind
export const DECISION_STATUSES = ['adopted', 'held', 'rejected'] as const; export type DecisionStatus
export const ChecklistItemSchema  // { id: string(1..60), text: trim 1..200, done: boolean }
export const ChecklistSchema      // array max 20
export type ChecklistItem
export const DecisionInputSchema  // discriminatedUnion('kind') { kind, status, reason(max 200, default ''), snapshot(kind별), projects: string[] }
export type DecisionInput
export type DecisionSnapshot = ServiceCandidate | Cleanup | NewIdea
export interface Decision { id; kind; status; reason; snapshot; projects: string[]; checklist: ChecklistItem[]; createdAt; updatedAt }
export function sha1Hex(text: string): string
export function decisionId(input: { kind: 'candidate'; snapshot: { project: string } } | { kind: 'cleanup'; snapshot: { projects: string[] } } | { kind: 'idea'; snapshot: { title: string } }): string
export function decisionProjects(input: same): string[]   // candidate → [project], cleanup → projects, idea → leverages
```

- [ ] **Step 1: 실패하는 테스트** — `shared/src/decisions.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { DecisionInputSchema, decisionId, decisionProjects, sha1Hex } from './index';

const candidate = { project: 'kr-by-claude', pitch: 'p', targetUsers: 't', monetization: 'm', readiness: 'medium' as const, nextSteps: ['a', 'b'] };
const cleanup = { projects: ['나-프로젝트', 'DataBatcher-main', 'DataBatcher'], suggestion: 's', reason: 'r' };
const idea = { title: '주식 일지 앱', pitch: 'p', leverages: ['kr-by-claude'], firstStep: 'f' };

describe('sha1Hex', () => {
  it('matches known vectors, including UTF-8 text', () => {
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(sha1Hex('한글')).toBe('6d5d2b5d2f6f2d2a7e0f6b0c6f2e9c0e0b7c1d3a'.length === 40 ? sha1Hex('한글') : '');
  });
});

describe('decisionId', () => {
  it('builds ids per kind; cleanup sorts project names', () => {
    expect(decisionId({ kind: 'candidate', snapshot: candidate })).toBe('candidate:kr-by-claude');
    expect(decisionId({ kind: 'cleanup', snapshot: cleanup })).toBe(`cleanup:${[...cleanup.projects].sort((a, b) => a.localeCompare(b, 'en')).join(',')}`);
    expect(decisionId({ kind: 'idea', snapshot: idea })).toBe(`idea:${sha1Hex('주식 일지 앱').slice(0, 12)}`);
  });
  it('treats a different idea title as a different decision', () => {
    expect(decisionId({ kind: 'idea', snapshot: { title: '주식 일지 앱 ' } })).not.toBe(decisionId({ kind: 'idea', snapshot: idea }));
  });
  it('lists related projects per kind', () => {
    expect(decisionProjects({ kind: 'candidate', snapshot: candidate })).toEqual(['kr-by-claude']);
    expect(decisionProjects({ kind: 'idea', snapshot: idea })).toEqual(['kr-by-claude']);
  });
});

describe('DecisionInputSchema', () => {
  it('validates the snapshot by kind', () => {
    expect(DecisionInputSchema.safeParse({ kind: 'candidate', status: 'adopted', snapshot: candidate, projects: ['kr-by-claude'] }).success).toBe(true);
    expect(DecisionInputSchema.safeParse({ kind: 'candidate', status: 'adopted', snapshot: idea, projects: [] }).success).toBe(false);
    expect(DecisionInputSchema.safeParse({ kind: 'idea', status: 'maybe', snapshot: idea, projects: [] }).success).toBe(false);
    expect(DecisionInputSchema.safeParse({ kind: 'idea', status: 'rejected', reason: 'a'.repeat(201), snapshot: idea, projects: [] }).success).toBe(false);
  });
  it('defaults the reason to an empty string', () => {
    expect(DecisionInputSchema.parse({ kind: 'idea', status: 'held', snapshot: idea, projects: [] }).reason).toBe('');
  });
});
```

(`sha1Hex('한글')` 줄은 Step 3 구현 후 Node의 `crypto.createHash('sha1')` 값으로 교체한다: `node -e "console.log(require('crypto').createHash('sha1').update('한글').digest('hex'))"`.)

- [ ] **Step 2: 실패 확인** — `pnpm -F @hub/shared test` → FAIL(모듈 없음)

- [ ] **Step 3: 구현**

`shared/src/index.ts`: `InsightsSchema` 위에 항목 스키마를 꺼내고 InsightsSchema가 쓰게 한다.

```ts
export const ServiceCandidateSchema = z.object({
  project: z.string(),
  pitch: z.string(),
  targetUsers: z.string(),
  monetization: z.string(),
  readiness: z.enum(['high', 'medium', 'low']),
  nextSteps: z.array(z.string()),
});
export const NewIdeaSchema = z.object({ title: z.string(), pitch: z.string(), leverages: z.array(z.string()), firstStep: z.string() });
export const CleanupSchema = z.object({ projects: z.array(z.string()), suggestion: z.string(), reason: z.string() });

export const InsightsSchema = z.object({
  profile: z.object({ headline: z.string(), traits: z.array(z.string()), strengths: z.array(z.string()) }),
  serviceCandidates: z.array(ServiceCandidateSchema),
  newIdeas: z.array(NewIdeaSchema),
  cleanup: z.array(CleanupSchema),
});
```

파일 끝에 `export * from './decisions';`.

`shared/src/decisions.ts`:

```ts
import { z } from 'zod';
import { CleanupSchema, NewIdeaSchema, ServiceCandidateSchema } from './index';

export const DECISION_KINDS = ['candidate', 'cleanup', 'idea'] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];
export const DECISION_STATUSES = ['adopted', 'held', 'rejected'] as const;
export const DecisionStatusSchema = z.enum(DECISION_STATUSES);
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

export const ChecklistItemSchema = z.object({
  id: z.string().min(1).max(60),
  text: z.string().trim().min(1, '항목 내용을 입력하세요').max(200, '항목은 200자까지 쓸 수 있습니다'),
  done: z.boolean(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
export const ChecklistSchema = z.array(ChecklistItemSchema).max(20, '체크리스트는 20개까지 만들 수 있습니다');

const base = {
  status: DecisionStatusSchema,
  reason: z.string().max(200, '이유는 200자까지 쓸 수 있습니다').default(''),
  projects: z.array(z.string()),
};
export const DecisionInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('candidate'), snapshot: ServiceCandidateSchema, ...base }),
  z.object({ kind: z.literal('cleanup'), snapshot: CleanupSchema, ...base }),
  z.object({ kind: z.literal('idea'), snapshot: NewIdeaSchema, ...base }),
]);
export type DecisionInput = z.infer<typeof DecisionInputSchema>;
export type DecisionSnapshot = DecisionInput['snapshot'];

export interface Decision {
  id: string;
  kind: DecisionKind;
  status: DecisionStatus;
  reason: string;
  snapshot: DecisionSnapshot;
  projects: string[];
  checklist: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

type IdInput =
  | { kind: 'candidate'; snapshot: { project: string } }
  | { kind: 'cleanup'; snapshot: { projects: string[] } }
  | { kind: 'idea'; snapshot: { title: string; leverages?: string[] } };

const byName = (a: string, b: string) => a.localeCompare(b, 'en');

// 분석마다 문장이 바뀌므로 결정은 이 키가 같을 때만 새 제안과 연결한다(서버·웹 공통).
export function decisionId(d: IdInput): string {
  if (d.kind === 'candidate') return `candidate:${d.snapshot.project}`;
  if (d.kind === 'cleanup') return `cleanup:${[...d.snapshot.projects].sort(byName).join(',')}`;
  return `idea:${sha1Hex(d.snapshot.title).slice(0, 12)}`;
}

export function decisionProjects(d: IdInput): string[] {
  if (d.kind === 'candidate') return [d.snapshot.project];
  if (d.kind === 'cleanup') return [...d.snapshot.projects];
  return [...(d.snapshot.leverages ?? [])];
}

// 브라우저에도 동기 sha1이 필요해 직접 구현한다(아이디어 ID 12자에만 쓰며 보안 용도가 아니다).
export function sha1Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const words = new Uint32Array((((bytes.length + 8) >> 6) + 1) * 16);
  bytes.forEach((b, i) => (words[i >> 2] |= b << (24 - (i % 4) * 8)));
  words[bytes.length >> 2] |= 0x80 << (24 - (bytes.length % 4) * 8);
  words[words.length - 1] = bytes.length * 8;
  let [h0, h1, h2, h3, h4] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  for (let i = 0; i < words.length; i += 16) {
    for (let t = 0; t < 80; t++) w[t] = t < 16 ? words[i + t] : rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let t = 0; t < 80; t++) {
      const f = t < 20 ? (b & c) | (~b & d) : t < 40 ? b ^ c ^ d : t < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const tmp = (rotl(a, 5) + f + e + k + w[t]) >>> 0;
      [e, d, c, b, a] = [d, c, rotl(b, 30) >>> 0, a, tmp];
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, '0')).join('');
}
```

순환 import(`index.ts` ↔ `decisions.ts`)를 피하려면 항목 스키마 3개를 `shared/src/insightItems.ts`로 옮기고 `index.ts`와 `decisions.ts`가 각각 거기서 import한다(index.ts는 재export).

- [ ] **Step 4: 통과 확인** — `pnpm -F @hub/shared test && pnpm typecheck` → PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat(shared): decision schema and decision id (sha1) shared by server and web"`

---

### Task 2: 결정 저장소와 API (server)

**Files:**
- Modify: `server/src/db.ts`, `server/src/app.ts`
- Test: `server/test/db.test.ts`, `server/test/app.test.ts`

**Interfaces:**
- Consumes: Task 1
- Produces:
  - `Db.listDecisions(): Decision[]`(updated_at 최신순), `Db.getDecision(id): Decision | null`, `Db.putDecision(id, input: DecisionInput): Decision`, `Db.putChecklist(id, items: ChecklistItem[]): Decision | null`, `Db.deleteDecision(id): boolean`
  - `GET /api/decisions` → `Decision[]`; `PUT /api/decisions/:id` → 200 Decision | 400 `invalid`/`id-mismatch`; `PUT /api/decisions/:id/checklist` `{ items }` → 200 | 400 | 404; `DELETE /api/decisions/:id` → 200 `{ ok: true }` | 404

- [ ] **Step 1: 실패하는 DB 테스트** — `server/test/db.test.ts`

```ts
describe('decisions', () => {
  const candidate = { project: 'a', pitch: 'p', targetUsers: 't', monetization: 'm', readiness: 'high' as const, nextSteps: ['도메인 연결', '약관 작성'] };
  const input = (status: 'adopted' | 'held' | 'rejected') => ({ kind: 'candidate' as const, status, reason: '', snapshot: candidate, projects: ['a'] });

  it('creates a checklist from nextSteps when a candidate is adopted, and keeps it afterwards', () => {
    const db = openDb(':memory:');
    expect(db.putDecision('candidate:a', input('held')).checklist).toEqual([]);
    const adopted = db.putDecision('candidate:a', input('adopted'));
    expect(adopted.checklist.map((c) => [c.text, c.done])).toEqual([['도메인 연결', false], ['약관 작성', false]]);
    db.putChecklist('candidate:a', [{ ...adopted.checklist[0], done: true }]);
    db.putDecision('candidate:a', input('held'));
    expect(db.putDecision('candidate:a', input('adopted')).checklist).toEqual([{ ...adopted.checklist[0], done: true }]);
    expect(db.getDecision('candidate:a')?.createdAt).toBe(adopted.createdAt);
  });
  it('does not create checklists for other kinds', () => {
    const db = openDb(':memory:');
    const d = db.putDecision('cleanup:a', { kind: 'cleanup', status: 'adopted', reason: '', snapshot: { projects: ['a'], suggestion: 's', reason: 'r' }, projects: ['a'] });
    expect(d.checklist).toEqual([]);
  });
  it('lists, deletes, and survives project deletion', () => {
    const db = openDb(':memory:');
    db.putDecision('candidate:a', input('rejected'));
    db.deleteProject('a');
    expect(db.listDecisions().map((d) => d.id)).toEqual(['candidate:a']);
    expect(db.deleteDecision('candidate:a')).toBe(true);
    expect(db.deleteDecision('candidate:a')).toBe(false);
    expect(db.putChecklist('candidate:a', [])).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: DB 구현** — `server/src/db.ts`

SCHEMA에 추가:

```sql
CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', snapshot TEXT NOT NULL, projects TEXT NOT NULL, checklist TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
```

`Db` 인터페이스와 구현:

```ts
  const toDecision = (r: Row): Decision => ({
    id: String(r.id),
    kind: r.kind as Decision['kind'],
    status: r.status as Decision['status'],
    reason: String(r.reason),
    snapshot: JSON.parse(String(r.snapshot)),
    projects: JSON.parse(String(r.projects)),
    checklist: JSON.parse(String(r.checklist)),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  });
  const getDecision = (id: string) => {
    const r = db.prepare('SELECT * FROM decisions WHERE id = ?').get(id) as Row | undefined;
    return r ? toDecision(r) : null;
  };
  // ...
    listDecisions: () => (db.prepare('SELECT * FROM decisions ORDER BY updated_at DESC').all() as Row[]).map(toDecision),
    getDecision,
    putDecision: (id, input) => {
      const now = new Date().toISOString();
      const prev = getDecision(id);
      let checklist = prev?.checklist ?? [];
      // 생성 규칙은 하나뿐: 저장 후 채택된 서비스 후보이고 체크리스트가 비어 있으면 다음 할 일로 만든다.
      if (input.status === 'adopted' && input.kind === 'candidate' && checklist.length === 0) {
        checklist = input.snapshot.nextSteps.slice(0, 20).map((text, i) => ({ id: `s${i + 1}`, text: text.slice(0, 200), done: false }));
      }
      db.prepare(
        'INSERT INTO decisions (id, kind, status, reason, snapshot, projects, checklist, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, status = excluded.status, reason = excluded.reason, snapshot = excluded.snapshot, projects = excluded.projects, checklist = excluded.checklist, updated_at = excluded.updated_at',
      ).run(id, input.kind, input.status, input.reason, JSON.stringify(input.snapshot), JSON.stringify(input.projects), JSON.stringify(checklist), prev?.createdAt ?? now, now);
      return getDecision(id)!;
    },
    putChecklist: (id, items) => {
      if (!getDecision(id)) return null;
      db.prepare('UPDATE decisions SET checklist = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(items), new Date().toISOString(), id);
      return getDecision(id);
    },
    deleteDecision: (id) => Number(db.prepare('DELETE FROM decisions WHERE id = ?').run(id).changes) > 0,
```

- [ ] **Step 4: 실패하는 API 테스트** — `server/test/app.test.ts`

```ts
describe('decisions api', () => {
  const cleanup = { projects: ['나', '가'], suggestion: '합치기', reason: '중복' };
  const del = { method: 'DELETE', headers: { 'content-type': 'application/json' } };
  const path = (id: string) => `/api/decisions/${encodeURIComponent(id)}`;

  it('creates and lists a decision with a Korean, comma-joined id', async () => {
    const { app } = setup();
    const res = await app.request(path('cleanup:가,나'), put({ kind: 'cleanup', status: 'adopted', snapshot: cleanup, projects: ['가', '나'] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 'cleanup:가,나', status: 'adopted', reason: '' });
    const list = (await (await app.request('/api/decisions')).json()) as { id: string }[];
    expect(list.map((d) => d.id)).toEqual(['cleanup:가,나']);
  });
  it('rejects an id that does not match the snapshot, and invalid snapshots', async () => {
    const { app } = setup();
    expect((await app.request(path('cleanup:나,가'), put({ kind: 'cleanup', status: 'held', snapshot: cleanup, projects: [] }))).status).toBe(400);
    const bad = await app.request(path('candidate:x'), put({ kind: 'candidate', status: 'held', snapshot: cleanup, projects: [] }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe('invalid');
  });
  it('replaces the checklist and deletes a decision', async () => {
    const { app } = setup();
    await app.request(path('cleanup:가,나'), put({ kind: 'cleanup', status: 'held', snapshot: cleanup, projects: [] }));
    const items = [{ id: 'x', text: '확인', done: true }];
    expect(await (await app.request(`${path('cleanup:가,나')}/checklist`, put({ items }))).json()).toMatchObject({ checklist: items });
    expect((await app.request(`${path('nope')}/checklist`, put({ items }))).status).toBe(404);
    expect((await app.request(`${path('cleanup:가,나')}/checklist`, put({ items: [{ id: 'x', text: '', done: false }] }))).status).toBe(400);
    expect((await app.request(path('cleanup:가,나'), del)).status).toBe(200);
    expect((await app.request(path('cleanup:가,나'), del)).status).toBe(404);
  });
  it('requires json content-type on delete', async () => {
    const { app } = setup();
    expect((await app.request(path('cleanup:가,나'), { method: 'DELETE' })).status).toBe(415);
  });
});
```

- [ ] **Step 5: 실패 확인** → FAIL
- [ ] **Step 6: API 구현** — `server/src/app.ts` (import `ChecklistSchema, DecisionInputSchema, decisionId`)

```ts
  app.get('/api/decisions', (c) => c.json(db.listDecisions()));

  // AI 제안 결정. ID는 snapshot에서 다시 계산해 URL과 맞을 때만 저장한다.
  app.put('/api/decisions/:id', async (c) => {
    const id = c.req.param('id');
    const parsed = DecisionInputSchema.safeParse(await body(c));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    if (decisionId(parsed.data) !== id) return c.json({ error: 'id-mismatch', expected: decisionId(parsed.data) }, 400);
    return c.json(db.putDecision(id, parsed.data));
  });

  app.put('/api/decisions/:id/checklist', async (c) => {
    const parsed = ChecklistSchema.safeParse((await body(c)).items);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const d = db.putChecklist(c.req.param('id'), parsed.data);
    return d ? c.json(d) : c.json({ error: 'not-found' }, 404);
  });

  app.delete('/api/decisions/:id', (c) => (db.deleteDecision(c.req.param('id')) ? c.json({ ok: true }) : c.json({ error: 'not-found' }, 404)));
```

- [ ] **Step 7: 통과 확인** — `pnpm -F @hub/server test && pnpm typecheck` → PASS
- [ ] **Step 8: 커밋** — `git commit -m "feat(server): decisions table and API with server-side id check and checklist rule"`

---

### Task 3: 인사이트 프롬프트 v3

**Files:**
- Modify: `server/src/insights.ts`
- Test: `server/test/insights.test.ts`

**Interfaces:**
- Consumes: `Decision` (Task 1), `Db.listDecisions` (Task 2), `Project.personal` (계획 1)
- Produces: `buildInsightsPrompt(projects: Project[], decisions: Decision[], now: Date): string`, `INSIGHTS_PROMPT_VERSION = 3`, `generateInsights(projects, decisions, run, opts, now?)`

- [ ] **Step 1: 실패하는 테스트** — `server/test/insights.test.ts`에 추가(기존 `buildInsightsPrompt(projects, NOW)` 호출은 `buildInsightsPrompt(projects, [], NOW)`로 바꾼다)

```ts
describe('insights prompt v3', () => {
  it('includes tags, notes and archived marks', () => {
    const a = { ...project('a'), personal: { lifecycle: 'focus' as const, note: '결제 붙이기', links: [], updatedAt: 't' } };
    const b = { ...project('b'), personal: { lifecycle: 'archive' as const, note: '', links: [], updatedAt: 't' } };
    const prompt = buildInsightsPrompt([a, b], [], NOW);
    expect(prompt).toContain('- 내 태그: 집중');
    expect(prompt).toContain('- 내 메모: 결제 붙이기');
    expect(prompt).toContain('보관(추천 대상 아님)');
  });
  it('lists decisions with rules per status, and reasons for rejections', () => {
    const d = (id: string, status: Decision['status'], kind: Decision['kind'], snapshot: Decision['snapshot'], reason = ''): Decision =>
      ({ id, kind, status, reason, snapshot, projects: [], checklist: [], createdAt: 't', updatedAt: 't' });
    const prompt = buildInsightsPrompt([project('a')], [
      d('candidate:a', 'adopted', 'candidate', { project: 'a', pitch: '', targetUsers: '', monetization: '', readiness: 'high', nextSteps: [] }),
      d('idea:x', 'rejected', 'idea', { title: '쇼핑몰', pitch: '', leverages: [], firstStep: '' }, '관심 없음'),
      d('cleanup:a', 'held', 'cleanup', { projects: ['a'], suggestion: '보관하기', reason: '' }),
    ], NOW);
    expect(prompt).toContain('## 내 결정');
    expect(prompt).toContain('[채택] 서비스 후보: a');
    expect(prompt).toContain('[거절] 아이디어: 쇼핑몰 — 이유: 관심 없음');
    expect(prompt).toContain('[보류] 정리 제안: a — 보관하기');
    expect(prompt).toMatch(/채택한 항목은 다시 제안하지/);
  });
  it('says there are no decisions when the table is empty', () => {
    expect(buildInsightsPrompt([project('a')], [], NOW)).toContain('아직 내린 결정이 없습니다');
  });
  it('bumps the prompt version to 3', () => {
    expect(INSIGHTS_PROMPT_VERSION).toBe(3);
  });
});
```

(`project` 픽스처 이름은 기존 파일에 맞춘다.)

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — `server/src/insights.ts`

- `INSIGHTS_PROMPT_VERSION = 3`
- 상수:

```ts
const LIFECYCLE_KO = { focus: '집중', maintain: '유지', launch: '공개 준비', experiment: '실험', archive: '보관' } as const;
const STATUS_KO = { adopted: '채택', held: '보류', rejected: '거절' } as const;
const KIND_KO = { candidate: '서비스 후보', cleanup: '정리 제안', idea: '아이디어' } as const;

function decisionLine(d: Decision): string {
  const s = d.snapshot as Record<string, unknown>;
  const what = d.kind === 'candidate' ? String(s.project) : d.kind === 'cleanup' ? `${(s.projects as string[]).join(', ')} — ${String(s.suggestion)}` : String(s.title);
  return `- [${STATUS_KO[d.status]}] ${KIND_KO[d.kind]}: ${what}${d.status === 'rejected' && d.reason ? ` — 이유: ${d.reason}` : ''}`;
}
```

- 프로젝트 줄 배열에서 `- 기술:` 다음에:

```ts
      `- 내 태그: ${p.personal.lifecycle === 'archive' ? '보관(추천 대상 아님)' : p.personal.lifecycle ? LIFECYCLE_KO[p.personal.lifecycle] : '미분류'}`,
      ...(p.personal.note ? [`- 내 메모: ${p.personal.note}`] : []),
```

- 규칙 절(`근거 규칙:` 앞)에 추가:

```ts
    `내 태그와 결정 반영 규칙:`,
    `- "보관(추천 대상 아님)" 프로젝트는 서비스 후보와 아이디어의 활용 대상으로 고르지 않는다.`,
    `- 채택한 항목은 다시 제안하지 않는다. 필요하면 진행을 돕는 다음 단계만 다른 항목(예: 관련 아이디어의 firstStep)에 쓴다.`,
    `- 보류한 항목은 다시 제안해도 된다.`,
    `- 거절한 항목은 같은 제안을 반복하지 않는다. 이유를 참고해 비슷한 방향도 피한다.`,
    ``,
```

- 프로젝트 목록 앞에:

```ts
    `## 내 결정`,
    ...(decisions.length ? decisions.map(decisionLine) : ['아직 내린 결정이 없습니다.']),
    ``,
```

- `generateInsights(projects, decisions, run, opts, now)`로 시그니처를 바꾸고 `buildInsightsPrompt(projects, decisions, now)`를 쓴다. `InsightsManager.start`에서 `generateInsights(projects, this.deps.db.listDecisions(), this.deps.run, { model })`. `insightsSourceHash`는 바꾸지 않는다(태그·결정은 해시에 넣지 않는다).

- [ ] **Step 4: 통과 확인** — `pnpm -F @hub/server test && pnpm typecheck` → PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat(server): insights prompt v3 with tags, notes and decisions"`

---

### Task 4: 결정 계산 (웹 순수 함수)과 API·훅

**Files:**
- Create: `web/src/lib/decisions.ts`, `web/src/lib/decisions.test.ts`
- Modify: `web/src/lib/api.ts`, `web/src/lib/hooks.ts`

**Interfaces:**
- Produces:

```ts
export function findDecision(decisions: Decision[], input: { kind; snapshot }): Decision | undefined
export function progressOf(items: ChecklistItem[]): { done: number; total: number }
export function groupDecisions(decisions: Decision[]): { adopted: Decision[]; held: Decision[]; rejected: Decision[] }
export function changesSince(projects: Project[], decisions: Decision[], generatedAt: string | null): number
export function newChecklistItem(text: string): ChecklistItem   // id = 'u' + Date.now().toString(36) + random
export function decisionTitle(d: Decision): string               // 후보: 프로젝트명, 정리: 프로젝트들, 아이디어: 제목
export const adoptedCandidateFor = (decisions: Decision[], name: string) => Decision | undefined
export const pendingCleanupFor = (decisions: Decision[], name: string) => boolean   // 채택한 정리 제안에 포함
// api
decisions(): Promise<Decision[]>; saveDecision(id, input): Promise<Decision>; saveChecklist(id, items): Promise<Decision>; deleteDecision(id): Promise<{ ok: true }>
// hooks
useDecisions(); useSaveDecision(); useSaveChecklist(); useDeleteDecision()  — 성공 시 ['decisions'] 무효화
```

- [ ] **Step 1: 실패하는 테스트** — `web/src/lib/decisions.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { EMPTY_PERSONAL, type Decision, type Project } from '@hub/shared';
import { adoptedCandidateFor, changesSince, findDecision, groupDecisions, pendingCleanupFor, progressOf } from './decisions';

const cand = { project: 'a', pitch: '', targetUsers: '', monetization: '', readiness: 'high' as const, nextSteps: [] };
const d = (id: string, status: Decision['status'], kind: Decision['kind'], snapshot: Decision['snapshot'], updatedAt = '2026-10-06T00:00:00Z'): Decision =>
  ({ id, kind, status, reason: '', snapshot, projects: [], checklist: [], createdAt: updatedAt, updatedAt });

describe('decisions helpers', () => {
  const all = [
    d('candidate:a', 'adopted', 'candidate', cand),
    d('cleanup:a,b', 'adopted', 'cleanup', { projects: ['b', 'a'], suggestion: '', reason: '' }),
    d('idea:gone', 'held', 'idea', { title: '사라진 아이디어', pitch: '', leverages: [], firstStep: '' }),
    d('candidate:z', 'rejected', 'candidate', { ...cand, project: 'z' }),
  ];
  it('finds a decision for a suggestion by its id', () => {
    expect(findDecision(all, { kind: 'cleanup', snapshot: { projects: ['a', 'b'], suggestion: 'x', reason: 'y' } })?.id).toBe('cleanup:a,b');
    expect(findDecision(all, { kind: 'candidate', snapshot: { ...cand, project: 'q' } })).toBeUndefined();
  });
  it('groups by status regardless of the current analysis', () => {
    const g = groupDecisions(all);
    expect([g.adopted.length, g.held.length, g.rejected.length]).toEqual([2, 1, 1]);
    expect(g.held[0].id).toBe('idea:gone');
  });
  it('computes checklist progress', () => {
    expect(progressOf([{ id: '1', text: 'x', done: true }, { id: '2', text: 'y', done: false }])).toEqual({ done: 1, total: 2 });
  });
  it('finds the adopted candidate and pending cleanup for a project', () => {
    expect(adoptedCandidateFor(all, 'a')?.id).toBe('candidate:a');
    expect(adoptedCandidateFor(all, 'z')).toBeUndefined();
    expect(pendingCleanupFor(all, 'b')).toBe(true);
    expect(pendingCleanupFor(all, 'z')).toBe(false);
  });
  it('counts tag/note and decision changes after the analysis', () => {
    const p = (name: string, updatedAt: string | null) => ({ name, personal: { ...EMPTY_PERSONAL, updatedAt } }) as Project;
    const projects = [p('a', '2026-10-06T10:00:00Z'), p('b', '2026-10-05T00:00:00Z'), p('c', null)];
    const decisions = [d('x', 'held', 'idea', { title: 't', pitch: '', leverages: [], firstStep: '' }, '2026-10-06T11:00:00Z'), ...all];
    expect(changesSince(projects, decisions, '2026-10-06T09:00:00Z')).toBe(2);
    expect(changesSince(projects, decisions, null)).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — `web/src/lib/decisions.ts`

```ts
import { decisionId, type ChecklistItem, type Decision, type DecisionInput, type Project } from '@hub/shared';

type SuggestionRef = Pick<DecisionInput, 'kind' | 'snapshot'>;

export const findDecision = (decisions: Decision[], s: SuggestionRef) => {
  const id = decisionId(s as Parameters<typeof decisionId>[0]);
  return decisions.find((d) => d.id === id);
};

export const progressOf = (items: ChecklistItem[]) => ({ done: items.filter((i) => i.done).length, total: items.length });

export function groupDecisions(decisions: Decision[]) {
  return {
    adopted: decisions.filter((d) => d.status === 'adopted'),
    held: decisions.filter((d) => d.status === 'held'),
    rejected: decisions.filter((d) => d.status === 'rejected'),
  };
}

// 분석 이후 바뀐 태그·메모와 결정 수(재분석 안내). 결정 삭제는 행이 사라져 세지 못한다(스펙 7.4 한계).
export function changesSince(projects: Project[], decisions: Decision[], generatedAt: string | null): number {
  if (!generatedAt) return 0;
  const t = new Date(generatedAt).getTime();
  const later = (iso: string | null) => !!iso && new Date(iso).getTime() > t;
  return projects.filter((p) => later(p.personal.updatedAt)).length + decisions.filter((d) => later(d.updatedAt)).length;
}

export const newChecklistItem = (text: string): ChecklistItem => ({
  id: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  text,
  done: false,
});

export function decisionTitle(d: Decision): string {
  const s = d.snapshot as Record<string, unknown>;
  if (d.kind === 'candidate') return String(s.project);
  if (d.kind === 'cleanup') return (s.projects as string[]).join(', ');
  return String(s.title);
}

export const adoptedCandidateFor = (decisions: Decision[], name: string) =>
  decisions.find((d) => d.kind === 'candidate' && d.status === 'adopted' && (d.snapshot as { project: string }).project === name);

export const pendingCleanupFor = (decisions: Decision[], name: string) =>
  decisions.some((d) => d.kind === 'cleanup' && d.status === 'adopted' && (d.snapshot as { projects: string[] }).projects.includes(name));
```

`web/src/lib/api.ts` (import `ChecklistItem, Decision, DecisionInput`):

```ts
  decisions: () => request<Decision[]>('/api/decisions'),
  saveDecision: (id: string, input: DecisionInput) => request<Decision>(`/api/decisions/${encodeURIComponent(id)}`, { method: 'PUT', body: input }),
  saveChecklist: (id: string, items: ChecklistItem[]) =>
    request<Decision>(`/api/decisions/${encodeURIComponent(id)}/checklist`, { method: 'PUT', body: { items } }),
  // 요청 가드가 DELETE에도 JSON 헤더를 요구하므로 빈 본문을 보낸다.
  deleteDecision: (id: string) => request<{ ok: true }>(`/api/decisions/${encodeURIComponent(id)}`, { method: 'DELETE', body: {} }),
```

`web/src/lib/hooks.ts`:

```ts
export const useDecisions = () => useQuery({ queryKey: ['decisions'], queryFn: api.decisions });

function useDecisionMutation<A>(fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['decisions'] }) });
}
export const useSaveDecision = () => useDecisionMutation((a: { id: string; input: DecisionInput }) => api.saveDecision(a.id, a.input));
export const useSaveChecklist = () => useDecisionMutation((a: { id: string; items: ChecklistItem[] }) => api.saveChecklist(a.id, a.items));
export const useDeleteDecision = () => useDecisionMutation((id: string) => api.deleteDecision(id));
```

- [ ] **Step 4: 통과 확인** — `pnpm -F @hub/web test && pnpm -F @hub/web typecheck` → PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat(web): decision helpers, API client and hooks"`

---

### Task 5: 첫 화면 — 결정 버튼, 내 결정, 재분석 안내

**Files:**
- Create: `web/src/features/home/DecisionButtons.tsx`, `web/src/features/home/MyDecisions.tsx`
- Modify: `web/src/features/home/HomePage.tsx`

**Interfaces:**
- Consumes: Task 4
- Produces: `<DecisionButtons kind snapshot />`, `<MyDecisions projects onOpen />`

- [ ] **Step 1: DecisionButtons** — 결정 전: [채택] [보류] [거절]. 거절은 이유 대화상자(선택, 최대 200자). 결정 후: 상태 배지 + "변경"(누르면 버튼 다시 표시).

```tsx
import { decisionId, decisionProjects, type DecisionInput, type DecisionStatus } from '@hub/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { cn } from '../../lib/cn';
import { findDecision } from '../../lib/decisions';
import { useDecisions, useSaveDecision } from '../../lib/hooks';

export const STATUS_LABEL: Record<DecisionStatus, { label: string; cls: string }> = {
  adopted: { label: '채택', cls: 'border-live/40 bg-live/10 text-live' },
  held: { label: '보류', cls: 'border-warn/40 bg-warn/10 text-warn' },
  rejected: { label: '거절', cls: 'border-line bg-white/5 text-muted' },
};

type Suggestion = Pick<DecisionInput, 'kind' | 'snapshot'>;

export function DecisionButtons({ suggestion }: { suggestion: Suggestion }) {
  const { data: decisions = [] } = useDecisions();
  const save = useSaveDecision();
  const current = findDecision(decisions, suggestion);
  const [changing, setChanging] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const decide = (status: DecisionStatus, why = '') => {
    const s = suggestion as Parameters<typeof decisionId>[0];
    const input = { ...suggestion, status, reason: why, projects: decisionProjects(s) } as DecisionInput;
    save.mutate({ id: decisionId(s), input }, { onSuccess: () => setChanging(false) });
  };

  if (current && !changing) {
    return (
      <div className="mt-3 flex items-center gap-2 border-t border-line pt-2 text-xs">
        <span className={cn('rounded-full border px-2 py-px text-[10px]', STATUS_LABEL[current.status].cls)}>{STATUS_LABEL[current.status].label}</span>
        {current.status === 'rejected' && current.reason && <span className="truncate text-muted">{current.reason}</span>}
        <button onClick={() => setChanging(true)} className="ml-auto text-[11px] text-muted hover:text-fg">변경</button>
      </div>
    );
  }
  return (
    <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-2">
      <Button size="sm" variant="live" onClick={() => decide('adopted')} disabled={save.isPending}>채택</Button>
      <Button size="sm" onClick={() => decide('held')} disabled={save.isPending}>보류</Button>
      <Button size="sm" onClick={() => { setReason(current?.reason ?? ''); setRejecting(true); }} disabled={save.isPending}>거절</Button>
      {changing && <button onClick={() => setChanging(false)} className="ml-auto text-[11px] text-muted hover:text-fg">취소</button>}
      <Dialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="이 제안을 거절할까요?"
        footer={
          <>
            <Button onClick={() => setRejecting(false)}>취소</Button>
            <Button variant="primary" onClick={() => { decide('rejected', reason.trim()); setRejecting(false); }}>거절</Button>
          </>
        }
      >
        <p className="mb-2 text-xs text-muted">이유를 남기면 다음 분석에서 비슷한 제안을 피합니다(선택).</p>
        <textarea value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="예: 운영 부담이 커서 하지 않음" className="w-full rounded-lg border border-line bg-black/30 px-2.5 py-1.5 text-sm outline-none focus:border-accent/50" />
        <p className="text-right text-[10px] text-muted">{reason.length}/200</p>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: MyDecisions** — 채택(이름 + 진행률, 후보·정리는 프로젝트 상세로, 아이디어는 펼치기), 보류(목록), 거절(기본 접힘). 각 행에 "결정 취소"(확인 모달 → DELETE). 없는 프로젝트 이름은 회색.

```tsx
import type { Decision, Project } from '@hub/shared';
import { ChevronDown, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { cn } from '../../lib/cn';
import { decisionTitle, groupDecisions, progressOf } from '../../lib/decisions';
import { useDecisions, useDeleteDecision } from '../../lib/hooks';

const KIND = { candidate: '서비스 후보', cleanup: '정리 제안', idea: '아이디어' } as const;

function Row({ d, known, onOpen, onCancel }: { d: Decision; known: Set<string>; onOpen: (n: string) => void; onCancel: (d: Decision) => void }) {
  const [open, setOpen] = useState(false);
  const p = progressOf(d.checklist);
  const target = d.kind === 'idea' ? null : d.projects.find((n) => known.has(n)) ?? null;
  const idea = d.kind === 'idea' ? (d.snapshot as { pitch: string; firstStep: string }) : null;
  return (
    <li className="text-xs">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[10px] text-muted">{KIND[d.kind]}</span>
        <button
          onClick={() => (idea ? setOpen((v) => !v) : target && onOpen(target))}
          className={cn('truncate text-left hover:text-white', !idea && !target && 'text-muted/60')}
          title={!idea && !target ? '폴더가 없는 프로젝트' : undefined}
        >
          {decisionTitle(d)}
        </button>
        {d.kind === 'candidate' && p.total > 0 && <span className="shrink-0 tabular-nums text-live">{p.done}/{p.total}</span>}
        <button onClick={() => onCancel(d)} aria-label="결정 취소" className="ml-auto shrink-0 text-muted hover:text-bad">
          <X className="size-3" />
        </button>
      </div>
      {open && idea && (
        <p className="mt-1 rounded bg-white/[0.03] px-2 py-1 text-fg/80">
          {idea.pitch}
          <span className="mt-0.5 block text-muted">첫 단계: {idea.firstStep}</span>
        </p>
      )}
      {d.status === 'rejected' && d.reason && <p className="mt-0.5 pl-14 text-muted">이유: {d.reason}</p>}
    </li>
  );
}

export function MyDecisions({ projects, onOpen }: { projects: Project[]; onOpen: (name: string) => void }) {
  const { data: decisions = [] } = useDecisions();
  const del = useDeleteDecision();
  const [cancel, setCancel] = useState<Decision | null>(null);
  if (decisions.length === 0) return null;
  const g = groupDecisions(decisions);
  const known = new Set(projects.map((p) => p.name));
  const row = (d: Decision) => <Row key={d.id} d={d} known={known} onOpen={onOpen} onCancel={setCancel} />;
  return (
    <div className="mb-5 grid gap-3 rounded-xl border border-line bg-black/20 p-4 md:grid-cols-2">
      <div>
        <h4 className="mb-1.5 text-[11px] font-medium text-live">채택 {g.adopted.length}</h4>
        <ul className="space-y-1">{g.adopted.length ? g.adopted.map(row) : <li className="text-xs text-muted">없음</li>}</ul>
      </div>
      <div>
        <h4 className="mb-1.5 text-[11px] font-medium text-warn">보류 {g.held.length}</h4>
        <ul className="space-y-1">{g.held.length ? g.held.map(row) : <li className="text-xs text-muted">없음</li>}</ul>
        {g.rejected.length > 0 && (
          <details className="group mt-3">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] text-muted">
              거절 {g.rejected.length} <ChevronDown className="size-3 transition group-open:rotate-180" />
            </summary>
            <ul className="mt-1.5 space-y-1">{g.rejected.map(row)}</ul>
          </details>
        )}
      </div>
      <Dialog
        open={cancel !== null}
        onClose={() => setCancel(null)}
        title="결정을 취소할까요?"
        footer={
          <>
            <Button onClick={() => setCancel(null)}>닫기</Button>
            <Button variant="danger" onClick={() => cancel && del.mutate(cancel.id, { onSettled: () => setCancel(null) })} disabled={del.isPending}>결정 취소</Button>
          </>
        }
      >
        {cancel && (
          <p>
            "{decisionTitle(cancel)}"에 대한 결정을 지웁니다.
            {cancel.checklist.length > 0 && ' 공개 체크리스트도 함께 지워집니다.'}
          </p>
        )}
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: HomePage 배치**
  - import `DecisionButtons`, `MyDecisions`, `useDecisions`, `changesSince`.
  - AI 제안 구역의 `{data?.error && ...}` 앞에:

```tsx
        {(() => {
          const n = changesSince(projects, decisions, data?.generatedAt ?? null);
          return n > 0 && ins && !generating ? (
            <p className="mb-3 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-2.5 text-xs">
              분석 이후 태그·결정이 {n}건 바뀌었습니다
              <button onClick={() => regenerate.mutate()} className="text-accent hover:underline">다시 분석</button>
            </p>
          ) : null;
        })()}
        <MyDecisions projects={projects} onOpen={onOpen} />
```

   (`const { data: decisions = [] } = useDecisions();`를 컴포넌트 위쪽에 둔다.)
  - 서비스 후보 카드의 "프로젝트 보기" 버튼 앞에 `<DecisionButtons suggestion={{ kind: 'candidate', snapshot: c }} />`. 정리 제안 각 항목 끝에 `<DecisionButtons suggestion={{ kind: 'cleanup', snapshot: c }} />`, 아이디어 카드 끝에 `<DecisionButtons suggestion={{ kind: 'idea', snapshot: idea }} />`.

- [ ] **Step 4: 확인** — `pnpm test && pnpm typecheck && pnpm -F @hub/web build` → PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat(web): adopt/hold/reject buttons, my decisions panel and re-analysis notice"`

---

### Task 6: 상세 — 공개 체크리스트와 "정리 예정" 칩

**Files:**
- Create: `web/src/features/detail/PublishChecklist.tsx`
- Modify: `web/src/features/detail/AiSuggestions.tsx`, `web/src/features/detail/ProjectDetail.tsx`

- [ ] **Step 1: PublishChecklist**

```tsx
import { ChecklistSchema, type Decision } from '@hub/shared';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { newChecklistItem, progressOf } from '../../lib/decisions';
import { saveErrorText, useSaveChecklist } from '../../lib/hooks';

export function PublishChecklist({ decision }: { decision: Decision }) {
  const save = useSaveChecklist();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const items = decision.checklist;
  const p = progressOf(items);
  const commit = (next: typeof items) => {
    const parsed = ChecklistSchema.safeParse(next);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setError(null);
    save.mutate({ id: decision.id, items: parsed.data }, { onError: (e) => setError(saveErrorText(e)) });
  };
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="font-medium">공개 체크리스트</span>
        <span className="tabular-nums text-xs text-live">{p.done}/{p.total}</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
          <span className="block h-full rounded-full bg-live" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {items.map((it) => (
          <li key={it.id} className="group flex items-center gap-2 text-xs">
            <input type="checkbox" checked={it.done} onChange={() => commit(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))} className="accent-[var(--color-live)]" />
            <span className={it.done ? 'text-muted line-through' : 'text-fg/90'}>{it.text}</span>
            <button onClick={() => commit(items.filter((x) => x.id !== it.id))} aria-label="항목 삭제" className="ml-auto text-muted opacity-0 group-hover:opacity-100 hover:text-bad">
              <X className="size-3" />
            </button>
          </li>
        ))}
      </ul>
      {items.length < 20 && (
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            commit([...items, newChecklistItem(text.trim())]);
            setText('');
          }}
        >
          <input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="할 일 추가" className="min-w-0 flex-1 rounded-lg border border-line bg-black/30 px-2 py-1 text-xs outline-none focus:border-accent/50" />
          <button type="submit" aria-label="추가" className="rounded-lg border border-line px-2 text-muted hover:text-fg">
            <Plus className="size-3.5" />
          </button>
        </form>
      )}
      {error && <p className="mt-1 text-[11px] text-bad">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: AiSuggestions** — `useDecisions()`로 `adoptedCandidateFor(decisions, p.name)`를 찾는다. 있으면 서비스 후보 부분 대신 `<PublishChecklist decision={...} />`를 그린다. 현재 분석에 이 프로젝트 언급이 없어도 채택한 후보가 있으면 블록을 보여준다(`if (!mine && !adopted) return null`). 정리 제안·아이디어 부분은 그대로.

- [ ] **Step 3: "정리 예정" 칩** — `ProjectDetail.tsx`에서 `useDecisions()` + `pendingCleanupFor(decisions, p.name)`가 참이면 `<LifecycleSelect>` 뒤에 `<span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] text-warn">정리 예정</span>`.

- [ ] **Step 4: 전체 확인** — `pnpm test && pnpm typecheck && pnpm -F @hub/web build` → PASS. 브라우저: 서비스 후보 채택 → "내 결정"에 `0/n` → 상세에서 체크 → 진행률 변경, 거절 이유 대화상자, 재분석 안내 문구, 결정 취소 모달. 확인 후 시험 결정은 화면의 "결정 취소"로 지운다.
- [ ] **Step 5: 커밋** — `git commit -m "feat(web): publish checklist on adopted candidates and pending-cleanup chip"`

---

## Self-Review 결과

- 7.1 ID·shared·서버 재계산 → Task 1·2. 7.2 테이블·체크리스트 규칙·삭제 보존·회색 → Task 2·5. 7.3 API → Task 2. 7.4 카드 버튼·거절 이유·배지/변경·내 결정(채택 진행률, 보류, 거절 접힘, 사라진 제안 유지)·상세 체크리스트·정리 예정 칩·재분석 안내 → Task 4·5·6. 7.5 프롬프트 v3 → Task 3. 8장 DELETE JSON 헤더 → Task 2·4. 9장 서버(결정 CRUD, ID 검증, 체크리스트 생성·유지, 프로젝트 삭제 후 유지, 프롬프트 v3, 가드)·웹(결정 ID 규칙) → Task 1~4.
- 결정 행의 "결정 취소"는 스펙 7.3의 DELETE("화면에서 확인 모달")를 "내 결정" 칸에 둔 것이다.
