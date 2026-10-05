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

## 실행 관리 동작

- 실행 중 감지는 프로세스의 작업 디렉토리(cwd)가 프로젝트 폴더 안에 있는지로 판단한다. 셸·에디터·`claude` 세션은 제외한다.
- 실행 명령은 직접 등록한 명령 → Claude가 추정한 명령 순으로 쓴다. 추정 명령은 처음 실행할 때 확인 모달에서 승인해야 한다.
- `astro dev`처럼 서버를 따로 띄우고 자신은 끝나는 명령도 새로 생긴 서버 프로세스를 따라가 실행 중으로 표시한다.
- 허브가 띄운 프로세스는 바로 중지하고, 터미널에서 직접 띄운 프로세스는 확인을 거쳐 중지한다.

## 단축키

- `⌘K` 검색, `↑`/`↓` 프로젝트 이동, `Esc` 검색어 지우기

## 설계

- 스펙: `docs/superpowers/specs/2026-10-05-project-hub-design.md`
- 구현 계획: `docs/superpowers/plans/2026-10-05-project-hub.md`
