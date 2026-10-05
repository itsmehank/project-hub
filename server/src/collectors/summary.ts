import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { SUMMARY_JSON_SCHEMA, SummarySchema, type Commit, type Summary } from '@hub/shared';
import type { CommandRunner } from '../exec';
import type { DocsBundle } from './meta';

// 프롬프트를 바꾸면 올려서 기존 요약 캐시를 무효화한다.
export const PROMPT_VERSION = 1;

export interface SummaryContext {
  name: string;
  docs: DocsBundle;
  tree: string;
  commits: Commit[];
}

export function computeSourceHash(input: { head: string | null; dirty: boolean; docMtimes: number[] }): string {
  return createHash('sha1').update(JSON.stringify({ v: PROMPT_VERSION, ...input })).digest('hex');
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n…(생략)` : text);

export function buildSummaryPrompt(ctx: SummaryContext): string {
  const sections: string[] = [
    `너는 개인 개발자의 프로젝트 대시보드에 들어갈 설명을 쓰는 도우미다.`,
    `아래 자료만 근거로 프로젝트 "${ctx.name}"을 설명하라. 추측하지 말고, 자료에 없는 내용은 비워 두거나 짧게 쓴다.`,
    `모든 문장은 한국어 평서문 존댓말(…합니다)로 쓴다.`,
    ``,
    `필드 지침:`,
    `- oneLiner: 목록에 표시할 40자 이내 한 줄. 무엇을 하는 프로젝트인지.`,
    `- whatItIs: 3~5문장. 어떤 문제를 풀고, 어떻게 동작하며(데이터 흐름·주요 구성), 다른 프로젝트나 외부 서비스와 어떤 관계인지.`,
    `- features: 주요 기능 3~6개, 각 25자 이내.`,
    `- structure: 주요 디렉토리·파일 3~6개와 역할.`,
    `- currentState: 2~3문장. 최근 커밋과 문서 기준으로 어디까지 진행됐는지.`,
    `- nextSteps: 다음 할 일 0~4개. 문서나 커밋에 근거가 있을 때만.`,
    `- runSuggestion: 로컬에서 띄워 쓰는 서버·웹앱·봇이면 {command, cwd(프로젝트 루트 기준 상대 경로, 루트면 "."), expectedPort(모르면 null)}.`,
    `  라이브러리, 일회성 스크립트 모음, 문서 저장소처럼 상시 실행할 대상이 없으면 null.`,
    `  패키지 매니저는 lock 파일 기준(pnpm-lock.yaml이면 pnpm, uv.lock이면 uv run, package-lock.json이면 npm).`,
    ``,
    `## 디렉토리 구조`,
    clip(ctx.tree || '(비어 있음)', 4000),
    ``,
    `## 최근 커밋`,
    ctx.commits.length ? ctx.commits.map((c) => `- ${c.at.slice(0, 10)} ${c.subject}`).join('\n') : '(커밋 없음)',
  ];
  if (ctx.docs.readme) sections.push('', '## README', clip(ctx.docs.readme, 6000));
  if (ctx.docs.claudeMd) sections.push('', '## CLAUDE.md', clip(ctx.docs.claudeMd, 4000));
  for (const [name, text] of Object.entries(ctx.docs.manifests)) sections.push('', `## ${name}`, clip(text, 1500));
  return sections.join('\n');
}

export async function generateSummary(
  ctx: SummaryContext,
  run: CommandRunner,
  opts: { model: string; timeoutMs?: number },
): Promise<Summary> {
  const r = await run(
    'claude',
    [
      '-p',
      '--output-format', 'json',
      '--model', opts.model,
      '--tools', '',
      '--no-session-persistence',
      '--json-schema', JSON.stringify(SUMMARY_JSON_SCHEMA),
    ],
    { input: buildSummaryPrompt(ctx), timeoutMs: opts.timeoutMs ?? 90_000, cwd: tmpdir() },
  );
  if (r.code !== 0) throw new Error(`claude 종료 코드 ${r.code}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);

  let payload: { is_error?: boolean; result?: unknown; structured_output?: unknown };
  try {
    payload = JSON.parse(r.stdout);
  } catch {
    throw new Error('claude 출력이 JSON이 아닙니다');
  }
  if (payload.is_error) throw new Error(`claude 오류: ${String(payload.result).slice(0, 300)}`);

  let raw = payload.structured_output;
  if (raw === undefined && typeof payload.result === 'string') {
    try {
      raw = JSON.parse(payload.result);
    } catch {
      throw new Error('claude 결과가 JSON이 아닙니다');
    }
  }
  return SummarySchema.parse(raw);
}
