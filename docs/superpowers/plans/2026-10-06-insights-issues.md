# Project Hub v2 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps follow RED → GREEN; each task ends with a commit.

**Goal:** 첫 화면 인사이트(Opus), 이슈 전체 페이지, 소비자 관점 설명 + 기술 구성 분리, 해시 라우팅, 툴팁을 추가한다.

**Architecture:** 서버에 이슈 수집기(`collectors/issues.ts`)와 인사이트 생성기(`insights.ts`, `InsightsManager`)를 추가하고 Hono 라우트를 확장한다. 새로고침 완료 이벤트에 인사이트 생성이 연결된다. 웹은 해시 라우터(`lib/route.ts`)로 홈 / 상세 / 이슈 화면을 전환하고, 포트폴리오 통계와 이슈 필터는 순수 함수로 분리해 테스트한다.

**Tech Stack:** 기존과 동일 (Hono, node:sqlite, zod, Vite React, TanStack Query, motion, Tailwind v4).

**Spec:** `docs/superpowers/specs/2026-10-06-insights-issues-design.md`

## Global Constraints

- 인사이트 모델 `HUB_INSIGHTS_MODEL` 기본 `opus`, 타임아웃 180초. 요약 모델은 `sonnet` 유지.
- 요약 `PROMPT_VERSION = 3`.
- 이슈 페이지네이션 `per_page=100`, 최대 10페이지, 본문 2000자, 캐시 60초.
- 모든 `gh` 호출은 `--hostname github.com`. 모든 UI 문구는 한국어.
- 기존 API 가드(JSON 강제, 출처 검사)는 새 POST에도 그대로 적용된다.
- 커밋에 Co-Authored-By 트레일러를 넣지 않는다.

## Review Focus

1. 인사이트가 존재하지 않는 프로젝트 이름을 반환 → 화면에서 깨진 링크가 되지 않도록 걸러야 한다. (Task 3 테스트)
2. 요약 스키마 v3 이전 데이터(techOverview 없음)가 DB에 남은 상태 → 화면이 깨지지 않아야 한다. (Task 1 스키마 기본값 + Task 7)
3. GitHub 저장소가 없는 프로젝트의 이슈 페이지 → 404를 받아 안내 문구를 보여야 한다. (Task 2/8)
4. 인사이트 생성 중 새로고침이 또 끝남 → 중복 생성하지 않는다. (Task 3 테스트)
5. 프로젝트 이름에 한글·공백 → 해시 라우트가 왕복 변환되어야 한다. (Task 5 테스트)

---

### Task 1: 요약 스키마 v3 (소비자 설명 + 기술 구성)

**Files:** `shared/src/index.ts`, `shared/src/index.test.ts`, `server/src/collectors/summary.ts`, `server/test/summary.test.ts`

- `SummarySchema`에 `techOverview: z.string().default('')`, `techStack: z.array(z.string()).default([])` 추가. JSON Schema에서는 필수로 요구한다(`SUMMARY_JSON_SCHEMA.required`에 포함 확인).
- 프롬프트 필드 지침을 스펙 표대로 바꾸고 `PROMPT_VERSION = 3`.
- 테스트: v2 형태(techOverview 없음) 파싱 시 기본값, JSON Schema required에 techOverview 포함, 프롬프트에 "기술 용어" 금지 지침과 techOverview 지침 포함.

### Task 2: 이슈 수집기 + API

**Files:** `shared/src/index.ts`(IssueDetail, IssueList, IssueKind), `server/src/collectors/issues.ts`, `server/src/app.ts`, `server/test/issues.test.ts`, `server/test/app.test.ts`

- `fetchIssues(repo, kind, run): Promise<IssueList>` — `page=1..10`, 응답 길이 < 100이면 중단, 10페이지 꽉 차면 `truncated: true`. issues는 `pull_request` 있는 항목 제외.
- `GET /api/projects/:name/issues?kind=` — 잘못된 kind 400, 저장소 없음 404 `{error:'no-github'}`, gh 실패 502 `{error}`; 60초 메모리 캐시.
- 테스트: 2페이지 이어붙이기, PR 제외, body 자르기, truncated, 캐시 재사용(두 번째 호출에 gh 미호출), 404/400/502.

### Task 3: 인사이트 생성기

**Files:** `shared/src/index.ts`(InsightsSchema, INSIGHTS_JSON_SCHEMA, InsightsResponse), `server/src/insights.ts`, `server/test/insights.test.ts`

- `buildInsightsInput(projects: Project[]): string`, `insightsSourceHash(db): string`, `generateInsights(projects, run, {model, timeoutMs}): Promise<Insights>` (없는 프로젝트 이름 제거), `class InsightsManager { constructor(deps); get(): InsightsResponse; regenerate(): boolean; maybeGenerate(): boolean; whenIdle() }`.
- 저장은 `db.setMeta('insights', JSON)`.
- 테스트: 입력에 모든 프로젝트 이름·한 줄 설명 포함, 없는 이름 필터, 실패 시 이전 유지 + error, 해시 동일하면 maybeGenerate가 false, 생성 중 regenerate는 false.

### Task 4: 인사이트 API + 새로고침 연결

**Files:** `server/src/app.ts`, `server/src/main.ts`, `server/test/app.test.ts`

- `GET /api/insights`, `POST /api/insights/regenerate`(202/409). `AppDeps.insights` 주입.
- main: `refresh.subscribe(e => e.type==='done' && insights.maybeGenerate())`.
- 테스트: GET 형태, regenerate 202/409.

### Task 5: 웹 라우팅 + 툴팁 + 제목 링크

**Files:** `web/src/lib/route.ts`(+test), `web/src/components/ui/Tooltip.tsx`, `web/src/lib/tooltips.ts`(+test), `web/src/App.tsx`, `TopBar.tsx`, `FilterChips.tsx`, `RefreshButton.tsx`, `ProjectList.tsx`

- `parseRoute(hash): Route`, `toHash(route): string`, `useRoute(): [Route, (r: Route) => void]`.
- 툴팁 문구는 `FILTER_TIPS`, `REFRESH_TIP` 상수(스펙 표 그대로).
- 테스트: 한글·공백 이름 왕복, 알 수 없는 해시 → home, issues 경로 파싱; 문구가 6개 필터 모두 존재.

### Task 6: 이슈 전체 페이지

**Files:** `web/src/lib/issues.ts`(+test: `filterIssues`, `sortIssues`, `collectLabels`), `web/src/features/issues/IssuesPage.tsx`, `GitHubSection.tsx`(전체 보기 링크), `web/src/lib/api.ts`

### Task 7: 상세 패널 설명 개편

**Files:** `AboutSection.tsx`, 신규 `TechSection.tsx`, `ProjectDetail.tsx`

### Task 8: 첫 화면 인사이트

**Files:** `web/src/lib/portfolio.ts`(+test: `portfolioStats`), `web/src/features/home/HomePage.tsx`(+하위 섹션 컴포넌트), `web/src/lib/api.ts`, `web/src/lib/hooks.ts`(`useInsights`)

### Task 9: 실데이터 검증

- 전체 재요약(PROMPT_VERSION 3) → 인사이트 생성 확인 → 브라우저로 첫 화면·이슈 페이지(kr-by-claude 33개 전체)·툴팁·제목 링크·뒤로 가기 확인 → README 갱신.
