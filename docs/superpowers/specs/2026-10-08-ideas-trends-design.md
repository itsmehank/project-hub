# Project Hub 5단계 — 목록 접기, 과감한 아이디어, 커밋 잔디, 최근 이슈

- 작성일: 2026-10-08
- 상태: 설계 합의(권장안), 스펙 리뷰 대기
- 기반: `2026-10-05-project-hub-design.md`, `2026-10-06-insights-issues-design.md`, `2026-10-06-phase4-design.md`
- 사전 확인: `claude -p --tools WebSearch --allowedTools WebSearch --json-schema ...`가 웹 검색 결과를 `structured_output`으로 돌려준다(Sonnet, 약 22초, 항목 2개 기준 약 $0.13).

## 1. 목표

1. 왼쪽 프로젝트 목록을 접어 본문을 넓게 쓴다.
2. 신규 아이디어에 "과감하게" 버전을 더해, 내 성향과 정반대 방향의 아이디어도 본다.
3. 26주 커밋을 하루 단위로 보고, 칸마다 날짜(요일)와 건수를 확인한다.
4. 국내외 최근 이슈(정치 제외)를 날짜별로 쌓아 보고, 신규 아이디어의 재료로 쓴다.

## 2. 비목표

- 사이드바 너비를 끌어서 조절하기
- 이슈의 본문 전체 저장·번역, 출처 사이트 직접 크롤링(RSS 등)
- 이슈 알림(푸시·메일)
- 이슈 묶음 삭제·편집 화면
- 잔디에서 프로젝트별로 거르기

## 3. 기능 1 — 왼쪽 목록 접기

- 참고: Aceternity UI Sidebar(motion으로 폭 애니메이션). 마우스를 올리면 펼쳐지는 방식은 검색창·필터가 있는 목록에서 오작동이 많아 쓰지 않고, 버튼과 단축키로만 접고 편다. Magic UI에는 맞는 컴포넌트가 없다(Dock은 아이콘 메뉴용).
- 목록 머리(필터 칩 줄) 왼쪽에 접기 버튼(`PanelLeftClose` 아이콘). 단축키 `⌘B`(Windows는 `Ctrl+B`). 입력창에 포커스가 있어도 동작한다.
- 접힌 상태: 폭 56px의 띠. 펼치기 버튼(`PanelLeftOpen`)과 실행 중 개수(`▶ 4`)만 보인다. 띠를 눌러도 펼쳐진다.
- `main`의 그리드 열 `400px 1fr` → `var(--list-w) 1fr`. 폭 변화는 motion으로 0.2초.
- 상태는 `localStorage['hub.listCollapsed']`에 저장한다(읽기·쓰기는 try/catch, 실패하면 펼친 상태).
- 접혀 있어도 `↑`/`↓` 프로젝트 이동과 `⌘K` 검색은 동작한다. `⌘K`를 누르면 목록을 펼치고 검색창에 포커스한다.

## 4. 기능 2 — 과감한(wild) 아이디어

### 4.1 데이터

```ts
// InsightsSchema에 추가
wildIdeas: z.array(NewIdeaSchema.extend({ contrast: z.string() })).default([])
```

- `contrast`: 내 성향(profile)과 어떻게 반대인지 한 줄.
- `.default([])`로 이전 저장 결과(필드 없음)도 그대로 읽는다.

### 4.2 프롬프트 v4

- `INSIGHTS_PROMPT_VERSION = 4`. 버전이 바뀌므로 서버 시작 또는 다음 새로고침 때 한 번 자동 재분석된다(Opus 1회).
- 추가 지시
  - `wildIdeas`: 2~3개. profile에서 드러난 성향과 정반대 방향(예: 혼자 쓰는 도구 → 많은 사람이 쓰는 서비스, 데이터 처리 → 오프라인·사람 중심, 안전한 선택 → 크게 거는 선택)으로 과감하게 쓴다. 실현 가능성보다 새로움을 우선하되 firstStep은 이번 주에 해볼 수 있는 작은 행동으로 쓴다. `contrast`에 어떻게 반대인지 쓴다. leverages는 비어도 된다.
  - 최근 이슈(6장)가 있으면 최근 7일 이슈 제목·분야를 `## 최근 이슈` 절로 넣고, newIdeas와 wildIdeas가 이를 활용할 수 있다고 알린다(활용할 의무는 없다).
- 자동 재분석 해시에는 이슈를 넣지 않는다(이슈가 바뀌었다고 Opus를 다시 부르지 않는다).
- `keepKnown`은 wildIdeas의 leverages도 거른다.

### 4.3 화면

- "신규 프로젝트 아이디어" 제목 오른쪽에 탭 `[기본 | 과감하게]`. 기본은 "기본". 선택은 저장하지 않는다.
- 과감하게 탭 카드: 제목, pitch, `contrast`(강조 색 한 줄, 앞에 "내 성향과 반대:"), 활용 프로젝트, 이번 주 첫 단계, 결정 버튼.
- 결정: kind `idea`를 그대로 쓴다(ID = 제목 sha1). wild와 기본이 같은 제목이면 같은 결정으로 본다. 결정 snapshot 스키마는 `NewIdeaSchema`이므로 저장할 때 `contrast`는 뺀다.
- wildIdeas가 비어 있으면(이전 분석) 탭 안에 "다음 분석 후 표시됩니다"를 보인다.

## 5. 기능 3 — 커밋 잔디

### 5.1 데이터

```ts
// GitInfoSchema에 추가 (선택)
dailyCommits: z.array(z.number().int()).optional(),   // 길이 182, 마지막 = dailyUntil 당일
dailyUntil: z.string().optional(),                    // 'YYYY-MM-DD' (서버 로컬 날짜)
```

- 기존 26주 커밋 로그(`git log --since=<26주 전> --format=%cI`) 출력을 그대로 써서 날짜별로 센다(git 호출을 늘리지 않는다). 날짜는 서버 로컬 날짜 기준.
- 182일보다 오래된 커밋은 버린다.

### 5.2 계산 (웹 순수 함수 `web/src/lib/heatmap.ts`)

```ts
dailyTotals(projects: Project[], now: Date): { date: string; count: number }[]  // 182개, 오래된 순, 마지막 = 오늘(로컬)
heatmapGrid(days, now): { weeks: ({ date: string; count: number; level: 0|1|2|3|4 } | null)[][]; monthLabels: string[] }
dayLabel(date: string): string   // '10/6(화)'
```

- 보관 프로젝트는 뺀다(첫 화면 통계와 같은 규칙).
- 같은 저장소 묶음은 대표 프로젝트(이름순 첫 번째, `groupByRepo`) 하나만 센다.
- 각 프로젝트의 `dailyUntil`과 오늘 날짜가 다르면 날짜를 맞춰 옮긴다(예: 어제 새로고침한 데이터는 하루 밀어 배치하고 오늘 칸은 0).
- `dailyCommits`가 있는 프로젝트가 하나도 없으면 빈 배열을 돌려주고 화면은 "다음 새로고침 후 표시됩니다".
- 격자: 열 = 주(월~일), 행 = 요일. 첫 열은 182일 전이 속한 주의 월요일부터, 마지막 열은 오늘이 속한 주. 범위 밖 칸은 `null`(빈칸).
- 단계: 0건 = 0, 그 외는 최대값의 25/50/75/100% 구간으로 1~4.
- 월 라벨: 달이 바뀌는 첫 열에 "n월".

### 5.3 화면

- 첫 화면 "최근 26주 전체 커밋" 상자의 막대를 잔디로 바꾼다. 칸 크기 약 11px, 간격 3px, 왼쪽에 월·수·금 라벨.
- 칸마다 툴팁 `10/6(화) · 3건`(기존 `Tooltip` 컴포넌트, 지연 없이). 0건은 `10/6(화) · 커밋 없음`.
- 오늘 칸은 테두리로 표시.
- 상세 화면의 프로젝트별 26주 막대(`CommitsSection`)는 이번 범위에서 바꾸지 않는다.

## 6. 기능 4 — 최근 이슈

### 6.1 데이터

```sql
CREATE TABLE IF NOT EXISTS trend_digests (
  date TEXT PRIMARY KEY,        -- 'YYYY-MM-DD' (서버 로컬)
  items TEXT NOT NULL,          -- JSON TrendItem[]
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

```ts
const TREND_CATEGORIES = ['ai', 'consumer', 'life', 'invest'] as const;
// ai = AI·개발 도구, consumer = 소비자 앱·서비스·스타트업, life = 생활·소비 트렌드, invest = 투자·모빌리티·공공데이터
TrendItemSchema = z.object({
  category: z.enum(TREND_CATEGORIES),
  region: z.enum(['국내', '해외']),
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(300),        // 두 문장 안팎
  ideaAngle: z.string().min(1).max(200),      // 아이디어 관점에서 왜 중요한지 한 줄
  sourceName: z.string().min(1).max(60),
  sourceUrl: z.string(),                       // http(s)만, 서버에서 검증 후 저장
  publishedAt: z.string(),                     // 'YYYY-MM-DD'
});
interface TrendDigest { date: string; items: TrendItem[]; model: string; createdAt: string }
```

### 6.2 수집 (`server/src/trends.ts`)

- `claude -p --model <HUB_TRENDS_MODEL, 기본 sonnet> --tools WebSearch,WebFetch --allowedTools WebSearch,WebFetch --json-schema <8~12개 items>`. 작업 폴더는 임시 폴더, 파일·명령 도구는 주지 않는다. 시간 제한 5분.
- 기존 `callClaudeJson`에 `tools?: string[]` 옵션을 더해 쓴다(기본은 지금처럼 도구 없음).
- 프롬프트
  - 오늘 날짜와 "최근 3일 안의 소식 우선"
  - 분야 4개와 분야별 2~3개, 국내·해외 섞기
  - 제외: 정치·선거·정당·외교 분쟁·전쟁·사건사고·연예 가십·주가 단기 등락 전망
  - 내 프로젝트 이름과 한 줄 설명 목록(요약이 있는 것만, 보관 제외)을 주고, 이 개발자가 새 프로젝트 아이디어로 쓸 만한 소식을 우선하라고 한다.
  - 지난 7일 묶음의 제목 목록을 주고 같은 소식은 다시 넣지 말라고 한다.
  - 모든 항목은 실제로 열어 본 출처 URL을 붙인다. 출처가 불확실하면 넣지 않는다.
- 결과 처리: zod 검증, `sourceUrl`이 http/https가 아니면 그 항목을 버린다, 제목 중복 제거, 남은 항목이 0개면 실패로 본다.
- 저장: 오늘 날짜 행을 넣거나 바꾼다(수동 재수집은 오늘 묶음을 바꾼다).
- 동작 관리: `TrendsManager`(InsightsManager와 같은 모양) — 동시에 하나만 실행, 마지막 오류를 메모리에 둔다.
  - `maybeCollect()`: 새로고침이 끝났을 때 호출. 오늘 묶음이 없고, 오늘 자동 수집이 실패한 적이 없으면 시작한다(실패한 날은 자동으로 다시 시도하지 않는다. 수동 버튼은 가능).
  - `collect()`: 수동 버튼.
- 서버 시작 시에는 자동 수집하지 않는다(새로고침이 끝날 때만).

### 6.3 API

- `GET /api/trends?before=<YYYY-MM-DD>&limit=<일수, 기본 7, 최대 30>` → `{ digests: TrendDigest[]; collecting: boolean; error: string | null; hasMore: boolean }` (날짜 내림차순)
- `POST /api/trends/collect` → 202 `{ started: true }` | 409 `already-running`. 기존 요청 가드 적용.

### 6.4 화면

- AI 제안 구역의 "신규 프로젝트 아이디어" 아래에 "최근 이슈" 블록(제목 옆 "웹 검색 · Claude", 오른쪽에 "오늘 이슈 다시 모으기" 버튼과 수집 중 표시).
- 분야 칩(전체 / AI·개발 / 앱·서비스 / 생활·소비 / 투자·모빌리티·데이터)으로 거른다(저장하지 않음).
- 날짜별 묶음: "오늘", "어제", 그 이전은 "10/6(월)". 묶음마다 항목 카드.
  - 카드: 분야·국내/해외 배지, 제목(출처 링크, 새 탭, `rel="noreferrer noopener"`), 요약, "아이디어 관점: …"(강조), 출처 이름·게시일.
- 처음에는 최근 7일 묶음. 아래 "이전 날짜 더 보기"로 7일씩 더 불러온다(`before` = 마지막 날짜).
- 오늘 묶음이 없고 수집 중이 아니면 "오늘 이슈가 아직 없습니다 · 지금 모으기". 수집 실패는 경고 줄로 보인다.
- 수집 중에는 3초마다 다시 조회한다.

### 6.5 인사이트와 연결

- 4.2대로 최근 7일 이슈 제목·분야를 인사이트 프롬프트에 넣는다. `InsightsManager`가 DB에서 읽어 넘긴다.

## 7. 공통

- **DB**: 새 테이블만 추가(`trend_digests`). `GitInfo`·`Insights`의 새 필드는 선택 또는 기본값이 있어 이전 데이터를 깨뜨리지 않는다.
- **환경 변수**: `HUB_TRENDS_MODEL`(기본 `sonnet`). README에 추가.
- **보안**: 이슈 내용은 외부 웹에서 온 데이터다. 화면에는 텍스트로만 그린다(HTML로 넣지 않는다). 링크는 http/https만. 수집 Claude에는 웹 검색·웹 읽기 외 도구를 주지 않는다.
- **비용**: 이슈 수집 하루 1회(Sonnet, 약 $0.3~0.6), 프롬프트 v4로 Opus 재분석 1회.
- **화면 문구**: 한국어, 기존 용어 통일(실행 중, git 아님, Claude).

## 8. 테스트

**서버**
- `dailyCommits`: 날짜별 집계, 182일 경계, 오늘 칸, 실제 임시 git 저장소
- `wildIdeas`: 스키마 기본값(이전 결과 읽기), `keepKnown`이 leverages를 거름, 프롬프트 v4에 wildIdeas 지시·최근 이슈 절(이슈 없을 때 절 생략)
- 이슈: 결과 검증(비 http URL 항목 버림, 0개면 실패, 제목 중복 제거), 저장·조회(`before`/`limit`/`hasMore`), `maybeCollect`(오늘 묶음 있으면 안 함, 오늘 자동 실패 후 다시 안 함), 동시 실행 409, `callClaudeJson`에 도구 인자 전달, 요청 가드
**웹(순수 함수)**
- `dailyTotals`: 저장소 중복 제거, 보관 제외, `dailyUntil` 날짜 맞추기, 데이터 없음
- `heatmapGrid`: 월요일 시작 열, 범위 밖 null, 단계 구간, 월 라벨, 연말
- `dayLabel`: 요일 표기
- 이슈 날짜 라벨(오늘/어제/날짜), 분야 거르기
**브라우저**: 목록 접기·펼치기·⌘B·새로고침 후 유지, 잔디 툴팁, 과감하게 탭, 이슈 수집·더 보기·분야 칩

## 9. 구현 순서

계획 문서 하나로 쓴다. 작업 순서:
1. 목록 접기(웹만)
2. 커밋 잔디(서버 수집 + 웹)
3. 최근 이슈(서버 수집·API + 웹 블록)
4. 과감한 아이디어와 프롬프트 v4(최근 이슈 절 포함, 이슈가 없으면 절 생략)
5. 새로고침 1회로 잔디·이슈 확인, v4 재분석 1회
