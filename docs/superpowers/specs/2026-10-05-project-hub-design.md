# Project Hub — 설계 스펙

- 작성일: 2026-10-05
- 상태: 설계 승인됨, 구현 계획 작성 전

## 1. 목적

`~/git/personal` 아래 개인 프로젝트들을 한 화면에서 파악하는 로컬 웹 대시보드.

각 프로젝트에 대해 다음을 명료하게 보여준다.

1. 어떤 프로젝트인지 (이해하기 쉬운 설명)
2. 마지막으로 언제 개발했는지
3. 현재 상태 (활동성, git 상태, 진행 단계, 다음 할 일)
4. GitHub 이슈 / PR / 최근 닫힌 이슈 / CI 상태
5. 로컬에서 실행 중인지 여부 — 실행 중이면 바로 접속, 아니면 실행 버튼

### 사용자 요구 (원문 기준)

- 백엔드 / 프론트엔드 분리 구조
- Aceternity UI, Magic UI 수준의 세련된 디자인
- 프로젝트 추가 / 삭제 / 변경을 반영하는 **수동 새로고침 버튼**
- 프로젝트 설명이 충분히 자세할 것
- 실행 상태 표시 + 접속 링크 + 미실행 시 실행 버튼

### 가정

- 본인 맥에서 localhost로만 쓰는 개인 도구. 배포·인증 없음.
- 스캔 루트는 `~/git/personal` (환경변수 `HUB_ROOT`로 변경 가능).
- `*-worktrees`, 숨김 폴더, `project-hub` 자신은 스캔 대상에서 제외.
- git 저장소가 아닌 폴더도 프로젝트로 표시하되 git 관련 항목은 비운다.

### 비목표 (YAGNI)

- 원격 배포, 다중 사용자, 로그인
- 자동 주기 새로고침 (실행 상태 폴링만 예외)
- 사내 GHE 저장소 지원 (github.com만)
- 프로젝트 파일 편집, git 조작(commit/push) 기능

## 2. 기술 스택과 구조

pnpm workspace 모노레포, TypeScript 단일 언어.

```
project-hub/
├─ package.json            # workspace 루트, dev 스크립트(server+web 동시 실행)
├─ pnpm-workspace.yaml
├─ shared/                 # API 타입 정의 (zod 스키마 + infer 타입)
├─ server/                 # Hono + @hono/node-server + node:sqlite(내장), 127.0.0.1:4310
│  └─ src/
│     ├─ index.ts          # 라우트 등록, 최초 실행 시 자동 새로고침
│     ├─ db.ts             # SQLite 스키마/마이그레이션/쿼리
│     ├─ exec.ts           # 주입 가능한 CommandRunner (테스트 시 모킹)
│     ├─ scanner.ts        # 프로젝트 폴더 탐색
│     ├─ collectors/
│     │  ├─ git.ts
│     │  ├─ github.ts
│     │  ├─ meta.ts
│     │  └─ summary.ts
│     ├─ refresh.ts        # 새로고침 작업 오케스트레이션 + 이벤트 발행
│     └─ runtime/
│        ├─ detect.ts      # 실행 중 프로세스/포트 감지
│        └─ launcher.ts    # 실행/중지/로그
├─ web/                    # Vite + React 19 + Tailwind v4 + motion
│  └─ src/
│     ├─ components/ui/    # Aceternity/Magic UI 패턴 복사본 (shadcn 방식)
│     ├─ features/         # project-list, project-detail, runtime, refresh
│     └─ lib/              # api 클라이언트, 상태 계산, 포맷터
└─ data/                   # gitignore: hub.db, logs/
```

개발 실행: 루트에서 `pnpm dev` → server(4310) + web(Vite 5199, `/api` 프록시).

## 3. 데이터 모델

### SQLite 테이블

- `projects` — `name`(PK), `data`(JSON: StoredProject 전체), `updated_at`
- `summaries` — `name`(PK), `source_hash`(HEAD 해시 + dirty 여부 + README/CLAUDE.md mtime 해시), `content`(JSON: Summary), `created_at`
- `run_configs` — `name`(PK), `command`, `cwd`(프로젝트 기준 상대 경로), `expected_port`(nullable), `source`(`user`|`approved`), `updated_at`
- `launches` — `name`(PK), `pid`, `pgid`, `command`, `started_at`, `log_path`

### 공유 타입 (shared/)

```ts
GitInfo = {
  branch: string; lastCommitAt: string | null;
  dirtyCount: number; ahead: number; behind: number;
  recentCommits: { hash: string; subject: string; at: string }[]; // 최대 10
  weeklyCommits: number[]; // 최근 26주
}
GitHubInfo = {
  url: string;
  openIssues: Item[]; openPRs: Item[]; recentlyClosedIssues: Item[]; // 닫힌 건 최근 14일
  ci: { status: 'success' | 'failure' | 'in_progress' | 'none'; url?: string; at?: string };
}
Item = { number: number; title: string; url: string; labels: string[]; createdAt: string }
Summary = {
  oneLiner: string;            // 목록에 표시할 한 줄
  whatItIs: string;            // "이 프로젝트는" 3~5문장, 동작 방식과 다른 프로젝트와의 관계 포함
  features: string[];          // 주요 기능 3~6개
  structure: { path: string; role: string }[]; // 주요 디렉토리 역할
  currentState: string;        // 진행 단계 2~3문장
  nextSteps: string[];
  runSuggestion: { command: string; cwd: string; expectedPort: number | null } | null;
}
ActivityStatus = 'active' | 'dormant' | 'stale' | 'unknown'
RuntimeProcess = { pid: number; command: string; cwd: string; ports: number[]; launchedByHub: boolean }
```

### 활동 상태 계산 (web/lib, 순수 함수)

마지막 커밋 기준: 14일 이내 `active`, 60일 이내 `dormant`, 그 이상 `stale`, git 아님 또는 커밋 없음 `unknown`. 미커밋 변경은 별도 경고 배지로 표시한다.

## 4. 새로고침 (수동)

`POST /api/refresh` (`{ force?: boolean }`) — 백그라운드 작업 시작. 이미 실행 중이면 409.
진행 상황은 `GET /api/refresh/stream`(SSE)으로 받는다.

처리 순서:

1. **스캔**: 루트 하위 디렉토리 목록을 DB와 비교. 새 폴더는 추가, 사라진 폴더는 모든 테이블에서 행 삭제 후 `project-removed` 이벤트.
2. **git + meta** (동시 8개): `git log`, `git status --porcelain`, `git rev-list --left-right --count @{u}...HEAD`, 주별 커밋 수. meta는 README/CLAUDE.md 앞부분, 스택 감지(package.json, pyproject.toml, Dockerfile 등).
3. **GitHub** (동시 4개, remote가 github.com인 것만): `gh --hostname github.com`을 통해 REST API 호출(issues, pulls, actions/runs?per_page=1).
4. **Claude 요약** (동시 2개, 프로젝트당 타임아웃 90초): `source_hash`가 바뀌었거나 `force`일 때만 실행. `claude -p --output-format json --json-schema <Summary 스키마> --tools "" --no-session-persistence`(모델은 `HUB_SUMMARY_MODEL`, 기본 `sonnet`)에 stdin으로 README, CLAUDE.md, 디렉토리 트리(깊이 2), 최근 커밋 10개, package.json/pyproject 내용을 넣고 응답의 `structured_output` 필드로 Summary JSON을 받는다. zod로 검증하고, 실패하면 이전 요약을 유지하고 오류를 기록한다.

이벤트: `started{total}` → `project-updated{name, stage, done, total}` → `project-removed{name}` → `done{durationMs}` | `error{message}`.

최초 실행 시 DB가 비어 있으면 자동으로 한 번 새로고침한다.

## 5. 실행 관리

### 실행 감지 (`runtime/detect.ts`)

- `lsof -a -d cwd -u $USER -Fpcn`로 내 프로세스의 cwd를 한 번에 조회하고, cwd가 프로젝트 폴더 안에 있는 것만 남긴다.
- 제외 목록: zsh, bash, sh, fish, login, tmux, Code Helper, vim/nvim, claude, git, lsof, ssh.
- `lsof -nP -iTCP -sTCP:LISTEN -Fpn`로 pid별 포트를 붙인다.
- 결과는 메모리 캐시에만 둔다. `GET /api/runtime`은 캐시가 3초보다 오래됐으면 다시 감지한 뒤 반환한다. 프론트는 탭이 보이는 동안 5초마다 폴링한다.

### 실행 명령 결정

우선순위: `run_configs`(user/approved) → `summary.runSuggestion` → 없음(실행 버튼 숨김, "명령 등록" 링크만 표시).
`runSuggestion`을 처음 실행할 때는 앱 안의 확인 모달에서 명령/cwd/포트를 보여주고, 승인하면 `run_configs`에 `approved`로 저장한다. 편집하면 `user`로 저장한다.

### 실행 / 중지 (`runtime/launcher.ts`)

- 실행: `spawn('zsh', ['-lc', command], { cwd, detached: true, stdio: [ignore, logFd, logFd] })` 후 `unref()`. `launches`에 pid/pgid를 기록하고, 로그는 `data/logs/<name>.log`(실행마다 덮어씀)에 남긴다.
- 실행 전에 expectedPort가 다른 프로세스에 점유돼 있으면 409와 점유 프로세스 정보를 반환한다. UI는 경고를 띄운다.
- 실행 후 최대 30초 동안 감지를 반복한다. 포트가 열리면 `running`, 그 전에 프로세스가 종료되면 `failed`와 로그 마지막 30줄을 반환한다. 포트 없이 살아 있으면 `running(no-port)`.
- 중지: `process.kill(-pgid, 'SIGTERM')`, 5초 뒤에도 살아 있으면 `SIGKILL`. 허브가 띄우지 않은 프로세스는 pid 단위로 중지하며, UI에서 확인 모달을 거친다.
- 허브 서버가 재시작되면 `launches`의 pid가 살아 있는지 확인하고, 죽은 항목은 정리한다.

### API

```
GET    /api/projects
GET    /api/projects/:name
POST   /api/refresh
GET    /api/refresh/stream
GET    /api/runtime
POST   /api/projects/:name/start
POST   /api/projects/:name/stop        { pid?: number }
PUT    /api/projects/:name/run-config  { command, cwd, expectedPort }
GET    /api/projects/:name/logs/stream
POST   /api/projects/:name/open-editor # `code <path>`
GET    /api/health                     # gh/claude/lsof 사용 가능 여부
```

## 6. UI (B안 v2 확정)

목업: `.superpowers/brainstorm/*/content/layout-b-v2.html`

- **상단 바**: 그라디언트 타이틀, ⌘K 검색, 요약 수치(전체 개수, 실행 중 개수, 마지막 갱신 시각), 쉬머 효과의 새로고침 버튼. 새로고침 중에는 버튼이 진행률 링으로 바뀌고 `n/total`을 표시한다.
- **왼쪽 목록 (400px)**: 필터 칩(전체 / 실행 중 / 활성 / 휴면 / 방치 / 미커밋), 정렬(최근 활동 기본, 이름, 이슈 수). 행 구성은 상태 점, 이름, LIVE 배지, 상대 시간, 한 줄 설명. ↑↓ 키로 이동하고 Enter로 선택한다.
- **오른쪽 상세 패널**, 위에서부터:
  1. 헤더: 이름, LIVE 배지, VS Code로 열기, GitHub 링크, 태그(스택, 브랜치 ahead/behind, 미커밋, CI)
  2. 실행 상태 박스: 실행 중이면 프로세스별 `localhost:포트`, 열기, 중지 / 중지 상태면 명령, 예상 포트, 실행, 명령 편집 / 로그 보기
  3. 한 줄 설명(큰 글씨) → "이 프로젝트는" + 주요 기능 + 구성
  4. 현재 상태 · 다음 할 일
  5. 열린 이슈 · PR / 최근 닫힌 이슈, 최근 커밋, 26주 커밋 막대
  6. 수집 오류가 있으면 단계별 경고
- **비주얼**: 다크 테마 기본. 그리드 배경 + 방사형 그라디언트, 스포트라이트 보더(선택된 행), 쉬머 버튼, 펄스 LIVE 배지, motion 레이아웃 애니메이션(목록 재정렬, 패널 전환), 숫자 티커. Aceternity / Magic UI 컴포넌트 패턴을 `components/ui/`에 복사해 프로젝트에 맞게 수정한다.
- **빈 상태 / 로딩**: 최초 수집 중에는 스켈레톤 + 진행률을 보여준다. 요약이 없는 프로젝트는 README 첫 문단으로 대체한다.

## 7. 오류 처리

- 프로젝트 단위로 격리한다. git/gh/claude 실패는 해당 프로젝트의 `errors`에 기록하고, 새로고침은 계속 진행한다.
- `/api/health`에서 `gh` 미로그인, `claude` 미설치, `lsof` 실패를 감지하면 상단 배너로 알리고 해당 단계를 건너뛴다.
- GitHub API 레이트 리밋(403/429)이 나면 남은 GitHub 단계를 건너뛰고 이전 데이터를 유지한다.
- 외부 명령은 모두 타임아웃을 둔다: git 10초, gh 15초, claude 90초, lsof 5초.

## 8. 테스트

- **server (vitest)**
  - scanner: 임시 디렉토리에서 제외 규칙, 추가·삭제 판정
  - git collector: 실제 임시 git 저장소로 커밋, dirty, ahead 값 검증
  - github / summary / detect: `CommandRunner`를 모킹하고 고정 출력으로 파싱 검증
  - refresh: 모킹된 수집기로 이벤트 순서, 오류 격리, 요약 캐시(source_hash) 검증
  - launcher: `sleep`/간단한 node HTTP 서버를 실제로 띄워 실행, 포트 감지, 중지 검증
- **web (vitest)**: 활동 상태 계산, 필터·정렬, 실행 명령 우선순위 같은 순수 함수
- 수동 확인: 실제 `~/git/personal`에 대해 새로고침 1회와 프로젝트 1개 실행·중지
