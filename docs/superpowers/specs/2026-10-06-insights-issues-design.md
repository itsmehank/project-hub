# Project Hub v2 — 첫 화면 인사이트, 이슈 페이지, 설명 개편, 툴팁

- 작성일: 2026-10-06
- 상태: 설계 승인됨 (대화에서 승인, roast 심층 심사는 제외하고 1단계만 진행)
- 기반 스펙: `2026-10-05-project-hub-design.md`

## 요구사항 (사용자 원문 요약)

1. 프로젝트별로 이슈를 모두 볼 수 있는 별도 페이지. 상세 패널의 "외 N개 GitHub에서 보기"를 대체한다.
2. "이 프로젝트는" 설명은 어떤 서비스인지 핵심만, 처음 보는 사람이 이해할 수 있게 소비자 관점으로 쓴다. 아키텍처·기술 스택은 아래에 따로 둔다.
3. 첫 화면: 전체 프로젝트 구성에서 인사이트를 준다. 개발 성향 분석, 신규 프로젝트 아이디어, 서비스로 공개해 수익·사용자를 얻을 만한 프로젝트 추천 등.
4. "Project Hub" 제목을 누르면 첫 화면으로 간다.
5. 필터 칩(실행 중·활성·휴면 등)에 각각 의미를 설명하는 툴팁.
6. 새로고침 버튼에 어떤 작업인지 설명하는 툴팁.

## 결정

- 인사이트 분석 모델: **Opus** (`HUB_INSIGHTS_MODEL`, 기본 `opus`). 프로젝트 요약은 기존대로 Sonnet.
- roast 방식(페르소나 5명 심층 심사)은 이번 범위에서 제외한다.

## 화면 구조와 라우팅

해시 라우팅으로 뒤로 가기를 지원한다. 왼쪽 목록은 모든 화면에서 유지하고, 오른쪽 영역만 바뀐다.

| 해시 | 화면 |
|---|---|
| `#/` (또는 빈 값) | 첫 화면(인사이트) |
| `#/p/<encodeURIComponent(name)>` | 프로젝트 상세 |
| `#/p/<name>/issues` | 이슈 전체 페이지 |

- 목록 클릭, ↑↓ 이동은 `#/p/<name>`으로 이동한다. 첫 화면에서는 목록에 선택 표시가 없다.
- 검색어·필터를 바꿔도 현재 화면은 유지한다(기존의 "첫 결과로 이동" 동작은 상세 화면에서만 적용).
- 제목 "Project Hub" 클릭 → `#/`.

## (1) 이슈 전체 페이지

API: `GET /api/projects/:name/issues?kind=open|closed|pr`

- `gh api --hostname github.com` 수동 페이지네이션(`per_page=100&page=N`, 최대 10페이지)으로 가져온다. 이슈 목록에서 PR은 제외한다. `kind=pr`은 열린 PR.
- 응답 `IssueList = { kind, items: IssueDetail[], truncated: boolean, fetchedAt }`
- `IssueDetail = Item + { author: string|null, comments: number, updatedAt: string, body: string }` (body는 2000자까지)
- 서버 메모리 캐시 60초(프로젝트+kind 단위). GitHub 저장소가 없으면 404, gh 실패는 502 `{error}`.

화면: 탭(열림 N / 닫힘 / PR N), 검색(제목·본문·번호), 라벨 필터 칩, 정렬(최신 / 오래된 / 댓글 많은 / 최근 업데이트), 이슈 행(번호·제목·라벨·작성자·상대시간·댓글 수), 행을 펼치면 본문 미리보기와 GitHub 링크. 상단에 "← 프로젝트로" 링크.

상세 패널의 GitHub 섹션: 목록 최대 6개 + "이슈 전체 보기 (N) →" 링크로 이슈 페이지로 이동.

## (2) 설명 개편

`Summary` 스키마 변경(PROMPT_VERSION 3, 전체 재생성):

| 필드 | 의미 |
|---|---|
| `oneLiner` | 40자 이내, 무엇을 해주는 서비스인지(소비자 관점) |
| `whatItIs` | 2~3문장. 누가, 무엇을, 어떤 도움을 받는지. 기술 용어 금지 |
| `features` | 사용자가 할 수 있는 일 3~6개 |
| `techOverview` (신규) | 2~4문장. 동작 방식·데이터 흐름·외부 서비스 연동 |
| `techStack` (신규) | 언어·프레임워크·주요 라이브러리·인프라 |
| `structure` | 기존과 동일(주요 디렉토리) |
| `currentState`, `nextSteps`, `runSuggestion` | 기존과 동일 |

상세 패널 순서: 한 줄 설명 → **이 프로젝트는**(whatItIs + 주요 기능) → 현재 상태·다음 할 일 → GitHub·커밋 → **기술 구성**(techOverview, techStack 태그, structure). 기존 DB의 v1/v2 요약은 `techOverview`/`techStack`이 없으므로 화면은 없는 필드를 숨긴다(재생성 전 호환).

## (3) 첫 화면 인사이트

### 규칙 기반 "한눈에 보기" (프론트에서 계산)

- 지표 카드: 전체 / 활성 / 휴면 / 방치 / 실행 중 / 열린 이슈 합계
- 기술 스택 분포(상위 8개, 막대)
- 전체 프로젝트 합산 26주 커밋 추이(막대)
- 주목할 프로젝트: 열린 이슈 많은 순 상위 3, 최근 2주 커밋 많은 순 상위 3, 미커밋 변경이 남은 휴면·방치 프로젝트

### Claude(Opus) 분석

`Insights` 스키마:

```
{
  profile: { headline: string, traits: string[], strengths: string[] },
  serviceCandidates: [{ project, pitch, targetUsers, monetization, readiness: 'high'|'medium'|'low', nextSteps: string[] }],  // 3개
  newIdeas: [{ title, pitch, leverages: string[] /* 기존 프로젝트 이름 */, firstStep }],  // 3~5개
  cleanup: [{ projects: string[], suggestion, reason }]  // 0~4개
}
```

- 입력: 모든 프로젝트의 이름·한 줄 설명·whatItIs·features·기술 스택·활동 상태·마지막 커밋일·열린 이슈 수·GitHub 여부·실행 명령 유무, 그리고 전체 통계.
- 호출: `claude -p --output-format json --model $HUB_INSIGHTS_MODEL --tools "" --no-session-persistence --json-schema <INSIGHTS_JSON_SCHEMA>`, 타임아웃 180초. 존재하지 않는 프로젝트 이름은 결과에서 걸러낸다.
- 저장: `meta` 테이블 `insights` 키에 `{ content, sourceHash, generatedAt }`. `sourceHash` = 모든 요약의 source hash와 이름 목록의 해시.
- 생성 시점: 새로고침이 끝난 뒤 `sourceHash`가 바뀌었으면 백그라운드로 생성. 첫 화면의 "인사이트 다시 분석" 버튼(`POST /api/insights/regenerate`, 202/409)은 강제 생성.
- API: `GET /api/insights` → `{ insights: Insights|null, generatedAt: string|null, generating: boolean, error: string|null }`. 생성 중에는 프론트가 3초마다 폴링.
- 실패하면 이전 인사이트를 유지하고 `error`를 기록한다.

### 화면 구성

1. 헤더: "포트폴리오 인사이트" + 생성 시각 + 다시 분석 버튼
2. 한눈에 보기(지표 카드, 스택 분포, 커밋 추이, 주목할 프로젝트)
3. 나의 개발 성향(headline + traits + strengths)
4. 서비스로 공개해볼 만한 프로젝트(카드 3개: 준비도 배지, 대상 사용자, 수익 모델, 다음 단계, 프로젝트로 이동)
5. 신규 프로젝트 아이디어(카드: 제목, 피치, 활용할 기존 프로젝트 칩, 첫 단계)
6. 정리 제안(대상 프로젝트 칩 + 제안 + 이유)

## (5)(6) 툴팁

다크 테마 애니메이션 툴팁 컴포넌트(`Tooltip`, motion fade+scale, 마우스 오버와 키보드 포커스로 표시).

| 대상 | 문구 |
|---|---|
| 전체 | 스캔한 모든 프로젝트 |
| 실행 중 | 지금 이 프로젝트 폴더에서 프로세스가 실행되고 있음 |
| 활성 | 최근 14일 안에 커밋이 있음 |
| 휴면 | 마지막 커밋이 15~60일 전 |
| 방치 | 마지막 커밋이 60일보다 오래됨 |
| 미커밋 | 커밋하지 않은 변경 파일이 남아 있음 |
| 새로고침 | 폴더를 다시 스캔해 추가·삭제를 반영 → 각 저장소 git fetch 후 브랜치·커밋·변경 상태 수집 → GitHub 이슈·PR·CI 갱신 → 바뀐 프로젝트만 Claude 요약 재생성 → 인사이트 갱신. Shift+클릭: 모든 요약을 새로 생성 |

## 테스트

- server: 이슈 수집(페이지네이션, PR 제외, 본문 자르기, 캐시), 이슈 API(404/502), 인사이트 생성(프롬프트 입력·없는 프로젝트 이름 필터·실패 시 이전 유지), 새로고침 후 해시 변경 시에만 생성, 인사이트 API, 요약 스키마 v3 프롬프트.
- web: 해시 라우트 파싱·생성, 포트폴리오 통계 순수 함수, 이슈 필터·정렬 순수 함수, 툴팁 문구 매핑.
- 실데이터: 전체 재요약, 인사이트 생성 결과 확인, 브라우저로 첫 화면·이슈 페이지·툴팁 확인.
