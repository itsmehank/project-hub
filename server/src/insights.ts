import { createHash } from 'node:crypto';
import { INSIGHTS_JSON_SCHEMA, InsightsSchema, type Insights, type InsightsResponse, type Project } from '@hub/shared';
import { callClaudeJson } from './collectors/claude';
import type { Db } from './db';
import type { CommandRunner } from './exec';

// 프롬프트를 바꾸면 올려서 저장된 인사이트를 무효화한다.
export const INSIGHTS_PROMPT_VERSION = 1;
const META_KEY = 'insights';
const DAY = 86_400_000;

function activity(p: Project, now: Date): string {
  const at = p.git?.lastCommitAt;
  if (!at) return '커밋 기록 없음';
  const days = Math.floor((now.getTime() - new Date(at).getTime()) / DAY);
  const label = days <= 14 ? '활성' : days <= 60 ? '휴면' : '방치';
  return `${label}(마지막 커밋 ${days}일 전)`;
}

export function buildInsightsPrompt(projects: Project[], now: Date): string {
  const counts = { 활성: 0, 휴면: 0, 방치: 0 };
  for (const p of projects) {
    const a = activity(p, now);
    for (const k of Object.keys(counts) as (keyof typeof counts)[]) if (a.startsWith(k)) counts[k]++;
  }
  const lines = projects.map((p) => {
    const s = p.summary;
    const stack = [...new Set([...(s?.techStack ?? []), ...p.stack])].slice(0, 8).join(', ') || '알 수 없음';
    const issues = p.github ? p.github.openIssues.length : 0;
    return [
      `### ${p.name}`,
      `- 한 줄: ${s?.oneLiner ?? p.readmeExcerpt ?? '설명 없음'}`,
      `- 설명: ${s?.whatItIs ?? ''}`,
      `- 기능: ${(s?.features ?? []).join(' / ')}`,
      `- 상태: ${activity(p, now)}, GitHub ${p.githubRepo ? `있음(열린 이슈 ${issues})` : '없음'}, 실행 명령 ${s?.runSuggestion || p.runConfig ? '있음' : '없음'}`,
      `- 기술: ${stack}`,
      `- 현재: ${s?.currentState ?? ''}`,
    ].join('\n');
  });

  return [
    `너는 한 개인 개발자의 사이드 프로젝트 전체를 보고 조언하는 제품 전략가다.`,
    `아래는 그가 ~/git/personal 에 가진 프로젝트 목록이다. 전체 ${projects.length}개 (활성 ${counts.활성}, 휴면 ${counts.휴면}, 방치 ${counts.방치}).`,
    `모든 문장은 한국어 존댓말 평서문(…합니다)으로, 구체적이고 솔직하게 쓴다. 듣기 좋은 말보다 실제로 쓸모 있는 판단을 준다.`,
    `프로젝트를 언급할 때는 반드시 아래 목록의 이름을 그대로 쓴다. 목록에 없는 이름은 쓰지 않는다.`,
    ``,
    `작성할 내용:`,
    `- profile.headline: 이 개발자의 성향을 한 문장으로.`,
    `- profile.traits: 프로젝트 주제·방식에서 보이는 관심사와 패턴 3~5개.`,
    `- profile.strengths: 반복해서 쌓인 강점이나 재사용 가능한 자산 3~5개.`,
    `- serviceCandidates: 서비스로 공개해 사용자나 수익을 얻을 가능성이 큰 프로젝트 정확히 3개.`,
    `  pitch(무엇을 누구에게 왜), targetUsers(구체적인 사용자층), monetization(한국 시장 기준 현실적인 수익 방식과 대략적 가격대),`,
    `  readiness(high=바로 공개 가능, medium=몇 주 작업, low=큰 작업 필요), nextSteps(공개 전 해야 할 일 2~4개).`,
    `  개인용 도구나 문서 저장소는 고르지 않는다. 시장성과 현재 완성도를 함께 본다.`,
    `- newIdeas: 기존 프로젝트의 자산·데이터·코드를 조합하거나 확장한 신규 프로젝트 아이디어 3~5개.`,
    `  title, pitch, leverages(활용할 기존 프로젝트 이름들), firstStep(이번 주에 해볼 첫 단계).`,
    `- cleanup: 중복되거나 방치되어 합치거나 보관할 만한 프로젝트 묶음 0~4개. projects, suggestion, reason.`,
    ``,
    `## 프로젝트 목록`,
    ...lines,
  ].join('\n');
}

// 존재하지 않는 프로젝트 이름은 화면에서 깨진 링크가 되므로 걸러낸다.
function keepKnown(ins: Insights, names: Set<string>): Insights {
  return {
    profile: ins.profile,
    serviceCandidates: ins.serviceCandidates.filter((c) => names.has(c.project)),
    newIdeas: ins.newIdeas.map((i) => ({ ...i, leverages: i.leverages.filter((n) => names.has(n)) })),
    cleanup: ins.cleanup
      .map((c) => ({ ...c, projects: c.projects.filter((n) => names.has(n)) }))
      .filter((c) => c.projects.length > 0),
  };
}

export async function generateInsights(
  projects: Project[],
  run: CommandRunner,
  opts: { model: string; timeoutMs?: number },
  now = new Date(),
): Promise<Insights> {
  const raw = await callClaudeJson(run, {
    model: opts.model,
    schema: INSIGHTS_JSON_SCHEMA,
    prompt: buildInsightsPrompt(projects, now),
    timeoutMs: opts.timeoutMs ?? 180_000,
  });
  return keepKnown(InsightsSchema.parse(raw), new Set(projects.map((p) => p.name)));
}

export function insightsSourceHash(projects: Project[]): string {
  const key = [...projects]
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .map((p) => [p.name, p.summaryAt ?? '']);
  return createHash('sha1').update(JSON.stringify({ v: INSIGHTS_PROMPT_VERSION, key })).digest('hex');
}

interface Stored {
  content: Insights;
  sourceHash: string;
  generatedAt: string;
}

export interface InsightsDeps {
  db: Db;
  run: CommandRunner;
  model: string;
  projects: () => Project[];
}

export class InsightsManager {
  private current: Promise<void> | null = null;
  private error: string | null = null;

  constructor(private deps: InsightsDeps) {}

  private stored(): Stored | null {
    const raw = this.deps.db.getMeta(META_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Stored;
    } catch {
      return null;
    }
  }

  get(): InsightsResponse {
    const s = this.stored();
    return { insights: s?.content ?? null, generatedAt: s?.generatedAt ?? null, generating: this.current !== null, error: this.error };
  }

  // 요약이 바뀐 경우에만 생성한다(새로고침 뒤 호출).
  maybeGenerate(): boolean {
    const projects = this.deps.projects().filter((p) => p.summary);
    if (projects.length === 0) return false;
    if (this.stored()?.sourceHash === insightsSourceHash(projects)) return false;
    return this.start(projects);
  }

  // "다시 분석" 버튼. 해시와 관계없이 생성한다.
  regenerate(): boolean {
    const projects = this.deps.projects().filter((p) => p.summary);
    if (projects.length === 0) return false;
    return this.start(projects);
  }

  private start(projects: Project[]): boolean {
    if (this.current) return false;
    this.current = generateInsights(projects, this.deps.run, { model: this.deps.model })
      .then((content) => {
        const stored: Stored = { content, sourceHash: insightsSourceHash(projects), generatedAt: new Date().toISOString() };
        this.deps.db.setMeta(META_KEY, JSON.stringify(stored));
        this.error = null;
      })
      .catch((e) => {
        this.error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
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
