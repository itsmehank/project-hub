import { createHash } from 'node:crypto';
import { SUMMARY_JSON_SCHEMA, SummarySchema, type Commit, type RunSuggestion, type Summary } from '@hub/shared';
import type { CommandRunner } from '../exec';
import { callClaudeJson } from './claude';
import type { DocsBundle } from './meta';

// 프롬프트를 바꾸면 올려서 기존 요약 캐시를 무효화한다.
export const PROMPT_VERSION = 4;

export interface SummaryContext {
  name: string;
  docs: DocsBundle;
  tree: string;
  commits: Commit[];
  // git 상태 맥락: git 아님, 현재 브랜치, 같은 원격 저장소를 쓰는 다른 폴더
  repo?: { isGit: boolean; branch: string | null; sharedRemoteWith: string[] };
}

export function computeSourceHash(input: { head: string | null; dirty: boolean; docMtimes: number[] }): string {
  return createHash('sha1').update(JSON.stringify({ v: PROMPT_VERSION, ...input })).digest('hex');
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n…(생략)` : text);

export function buildSummaryPrompt(ctx: SummaryContext): string {
  const sections: string[] = [
    `너는 개인 개발자의 프로젝트 대시보드에 들어갈 설명을 쓰는 도우미다.`,
    `아래 자료만 근거로 프로젝트 "${ctx.name}"을 설명하라. 추측하지 말고, 자료에 없는 내용은 비워 두거나 짧게 쓴다.`,
    `모든 문장은 한국어 존댓말 평서문(…합니다)으로 쓴다.`,
    ``,
    `공통 원칙:`,
    `- 현재 상태를 지어내지 않는다. 코드가 없거나 설계·계획 단계면 "~하도록 설계했습니다", "~을 만들 계획입니다"로 쓰고 "~하는 서비스입니다"처럼 완성된 것으로 쓰지 않는다.`,
    `  가상·연습 데이터로만 동작하면 그 사실을 whatItIs 마지막 문장에 밝힌다.`,
    `- 프로젝트 이름만 보고 내용을 짐작하지 않는다. 제품·차종 코드명은 README 표기를 그대로 쓰고 일반 명칭을 덧붙인다(예: "5세대 싼타페 하이브리드(코드명 MX5)"). 자료에 없는 브랜드·모델은 쓰지 않는다.`,
    `- 용어 통일: 유튜브(YouTube 아님), 텔레그램, 차로(차선 아님), 주의할 점(우려 점 아님).`,
    `- "제공된 자료만으로는 확인되지 않습니다" 같은 작성자 입장의 말은 쓰지 않는다.`,
    ``,
    `필드 지침:`,
    `- oneLiner: 25~35자 명사형. "[누구]의 [무엇]을 [어떻게] 하는 [도구/서비스/봇/사이트/게임/실험]" 형식. 영어 약어를 쓰지 않고 두 기능을 "와/과"로 붙이지 않는다.`,
    `- whatItIs: 정확히 3문장, 한 문장은 50자 안팎(최대 70자).`,
    `  ① 누가 어떤 불편 때문에 쓰는지 ② 무엇을 해 주는지 ③ 어떻게 쓰는지(웹 화면, 텔레그램 봇, 터미널 명령, 문서 모음)와 공개 범위(나만 / 내 컴퓨터 / 공개).`,
    `  API, DB, CLI, 파이프라인, 스크리너, 일봉, 종가, 스킬, 세션, PR, 이슈, 프로파일 같은 말은 그대로 쓰지 않고 풀어 쓴다.`,
    `  인명·고유명사·약어는 처음 나올 때 괄호로 풀어 쓴다(예: "마크 미너비니(미국의 추세 매매 투자자)").`,
    `- features: 사용자가 하는 행동 3~6개, 각각 "~하기"로 끝나는 15자 안팎. 캐시·인덱스·분석 항목 추가 같은 개발자 기능은 techOverview로 보낸다.`,
    `  실험·검증 폴더면 "확인한 것", 설계 단계면 "만들려는 기능"으로 읽히도록 쓴다.`,
    `- techOverview: 2~4문장. 개발자를 위한 동작 방식 설명. 데이터 흐름, 주요 구성 요소, 외부 서비스 연동, 다른 프로젝트와의 관계.`,
    `- techStack: 언어·프레임워크·주요 라이브러리·인프라 이름 3~8개. 같은 도구를 버전만 달리해 두 번 쓰지 않는다.`,
    `- structure: 주요 디렉토리·파일 3~6개와 역할(명사형으로 끝냄).`,
    `- currentState: 2~3문장. 날짜는 "10월 5일 기준"처럼 쓴다. 이슈 번호·내부 약어(ELTD, ADR, Phase 등)는 내용을 먼저 쓰고 괄호에 둔다.`,
    `  문서끼리 어긋나는 점은 "⚠"로 시작하는 별도 문장으로 쓴다.`,
    `- nextSteps: 다음 할 일 0~4개. 문서나 커밋에 근거가 있을 때만. 무엇을 할지 알 수 있게 구체적으로 쓴다.`,
    `- runSuggestion: 로컬에서 띄워 쓰는 서버·웹앱·봇이면 {command, cwd(프로젝트 루트 기준 상대 경로, 루트면 "."), expectedPort(모르면 null)}.`,
    `  라이브러리, 일회성 스크립트 모음, 문서 저장소처럼 상시 실행할 대상이 없으면 null.`,
    `  demo·test·build·lint 같은 한 번 실행하고 끝나는 스크립트는 실행 명령이 아니다. 상시 서버/봇 스크립트(dev, start, serve 등)가 없으면 null.`,
    `  패키지 매니저는 lock 파일 기준(pnpm-lock.yaml이면 pnpm, uv.lock이면 uv run, package-lock.json이면 npm).`,
    ``,
    `## 저장소 상태`,
    ctx.repo
      ? [
          ctx.repo.isGit
            ? `git 저장소입니다(현재 브랜치 ${ctx.repo.branch ?? '알 수 없음'}).`
            : 'git으로 관리하지 않는 폴더라 변경 기록이 없습니다. currentState에서 "커밋 이력이 없다"고 쓰지 말고 이 표현을 쓴다.',
          ctx.repo.sharedRemoteWith.length
            ? `같은 원격 저장소를 쓰는 다른 폴더: ${ctx.repo.sharedRemoteWith.join(', ')}. 이 사실과 이 폴더의 브랜치를 currentState에 적는다.`
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '(정보 없음)',
    ``,
    `## 디렉토리 구조`,
    clip(ctx.tree || '(비어 있음)', 4000),
    ``,
    `## 최근 커밋`,
    ctx.commits.length ? ctx.commits.map((c) => `- ${c.at.slice(0, 10)} ${c.subject}`).join('\n') : '(커밋 없음)',
  ];
  if (ctx.docs.readme) sections.push('', '## README', clip(ctx.docs.readme, 6000));
  if (ctx.docs.claudeMd) sections.push('', '## CLAUDE.md', clip(ctx.docs.claudeMd, 4000));
  for (const [rel, text] of Object.entries(ctx.docs.extraDocs ?? {})) sections.push('', `## ${rel}`, clip(text, 3000));
  for (const [name, text] of Object.entries(ctx.docs.manifests)) sections.push('', `## ${name}`, clip(text, 1500));
  return sections.join('\n');
}

export async function generateSummary(
  ctx: SummaryContext,
  run: CommandRunner,
  opts: { model: string; timeoutMs?: number },
): Promise<Summary> {
  const raw = await callClaudeJson(run, {
    model: opts.model,
    schema: SUMMARY_JSON_SCHEMA,
    prompt: buildSummaryPrompt(ctx),
    timeoutMs: opts.timeoutMs ?? 90_000,
  });
  const summary = SummarySchema.parse(raw);
  return { ...summary, runSuggestion: sanitizeRunSuggestion(summary.runSuggestion) };
}

// 한 번 실행하고 끝나는 스크립트는 "실행" 대상이 아니다. 모델이 규칙을 어겨도 여기서 걸러낸다.
const ONE_SHOT = /^(demo|test|tests|build|lint|typecheck|check|format|fixtures|pytest|vitest|jest|tsc|eslint)(:|$)/;
const RUNNERS = new Set(['pnpm', 'npm', 'yarn', 'bun', 'run', 'uv', 'npx', 'poetry', 'exec']);

export function sanitizeRunSuggestion(s: RunSuggestion | null): RunSuggestion | null {
  if (!s) return null;
  const first = s.command.trim().split(/\s+/).find((t) => !RUNNERS.has(t));
  return first && ONE_SHOT.test(first) ? null : s;
}
