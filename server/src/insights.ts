import { createHash } from 'node:crypto';
import { INSIGHTS_JSON_SCHEMA, InsightsSchema, type Decision, type Insights, type InsightsResponse, type Project, type TrendDigest } from '@hub/shared';
import { callClaudeJson } from './collectors/claude';
import type { Db } from './db';
import type { CommandRunner } from './exec';

// 프롬프트를 바꾸면 올려서 저장된 인사이트를 무효화한다.
export const INSIGHTS_PROMPT_VERSION = 4;
const META_KEY = 'insights';
const DAY = 86_400_000;

function activity(p: Project, now: Date): string {
  const at = p.git?.lastCommitAt;
  if (!at) return '커밋 기록 없음';
  const days = Math.floor((now.getTime() - new Date(at).getTime()) / DAY);
  const label = days <= 14 ? '활성' : days <= 60 ? '휴면' : '방치';
  return `${label}(마지막 커밋 ${days}일 전)`;
}

const LIFECYCLE_KO = { focus: '집중', maintain: '유지', launch: '공개 준비', experiment: '실험', archive: '보관' } as const;
const STATUS_KO = { adopted: '채택', held: '보류', rejected: '거절' } as const;
const KIND_KO = { candidate: '서비스 후보', cleanup: '정리 제안', idea: '아이디어' } as const;

function decisionLine(d: Decision): string {
  const s = d.snapshot as Record<string, unknown>;
  const what =
    d.kind === 'candidate' ? String(s.project) : d.kind === 'cleanup' ? `${(s.projects as string[]).join(', ')} — ${String(s.suggestion)}` : String(s.title);
  return `- [${STATUS_KO[d.status]}] ${KIND_KO[d.kind]}: ${what}${d.status === 'rejected' && d.reason ? ` — 이유: ${d.reason}` : ''}`;
}

const TREND_LABEL = { ai: 'AI·개발', consumer: '앱·서비스', life: '생활·소비', invest: '투자·모빌리티·데이터' } as const;

const tagLine = (p: Project) =>
  p.personal.lifecycle === 'archive' ? '보관(추천 대상 아님)' : p.personal.lifecycle ? LIFECYCLE_KO[p.personal.lifecycle] : '미분류';

export function buildInsightsPrompt(projects: Project[], decisions: Decision[], now: Date, trends: TrendDigest[] = []): string {
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
      `- 내 태그: ${tagLine(p)}`,
      ...(p.personal.note ? [`- 내 메모: ${p.personal.note}`] : []),
    ].join('\n');
  });

  return [
    `너는 한 개인 개발자의 사이드 프로젝트 전체를 보고 조언하는 제품 전략가다.`,
    `아래는 그가 ~/git/personal 에 가진 프로젝트 목록이다. 전체 ${projects.length}개 (활성 ${counts.활성}, 휴면 ${counts.휴면}, 방치 ${counts.방치}).`,
    `모든 문장은 한국어 존댓말 평서문(…합니다)으로, 구체적이고 솔직하게 쓴다. 듣기 좋은 말보다 실제로 쓸모 있는 판단을 준다.`,
    `프로젝트를 언급할 때는 반드시 아래 목록의 이름을 그대로 쓴다. 목록에 없는 이름은 쓰지 않는다.`,
    ``,
    `내 태그와 결정 반영 규칙:`,
    `- "보관(추천 대상 아님)" 프로젝트는 서비스 후보와 아이디어의 활용 대상으로 고르지 않는다.`,
    `- 채택한 항목은 다시 제안하지 않는다. 필요하면 진행을 돕는 다음 단계만 다른 항목(예: 관련 아이디어의 firstStep)에 쓴다.`,
    `- 보류한 항목은 다시 제안해도 된다.`,
    `- 거절한 항목은 같은 제안을 반복하지 않는다. 이유를 참고해 비슷한 방향도 피한다.`,
    ``,
    `근거 규칙:`,
    `- 모든 주장에는 근거 프로젝트 이름이나 숫자를 붙인다. 개수를 말하면 나열한 목록과 개수를 맞춘다("7개 이상"이라고 쓰고 7개만 나열하지 않는다).`,
    `- 수익은 "가정(월 방문자·전환율·단가) → 계산 → 결과" 순서로 쓴다. 가정한 숫자는 가정이라고 밝힌다.`,
    `- "시너지", "확장 비용이 낮아진다", "체류 시간이 늘어난다" 같은 결론에는 어떻게 측정할지를 함께 쓴다.`,
    `- 법적 확인(저작권, 의료·금융 고지 등)이 남아 있으면 readiness를 high로 매기지 않는다.`,
    `- 개발 용어(ADR, mock, fixture, acceptance 등)는 쓰지 않거나 풀어 쓴다. 한 문장은 70자 안팎으로 끊는다.`,
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
    `- wildIdeas: 과감한 아이디어 2~3개. profile에서 드러난 성향과 정반대 방향으로 쓴다(예: 혼자 쓰는 도구 → 많은 사람이 쓰는 서비스, 데이터 처리 → 오프라인·사람 중심, 안전한 선택 → 크게 거는 선택).`,
    `  실현 가능성보다 새로움을 우선하되 firstStep은 이번 주에 해볼 수 있는 작은 행동으로 쓴다. contrast에 내 성향과 어떻게 반대인지 한 줄로 쓴다. leverages는 비어도 된다.`,
    `- cleanup: 중복되거나 방치되어 합치거나 보관할 만한 프로젝트 묶음 0~4개. projects, suggestion, reason.`,
    ``,
    `## 내 결정`,
    ...(decisions.length ? decisions.map(decisionLine) : ['아직 내린 결정이 없습니다.']),
    ``,
    ...(trends.length
      ? [
          `## 최근 이슈`,
          `newIdeas와 wildIdeas에서 아래 소식을 재료로 써도 된다(의무는 아니다).`,
          ...trends.flatMap((d) => d.items.map((i) => `- [${TREND_LABEL[i.category]}] ${i.title}`)),
          ``,
        ]
      : []),
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
    wildIdeas: ins.wildIdeas.map((i) => ({ ...i, leverages: i.leverages.filter((n) => names.has(n)) })),
    cleanup: ins.cleanup
      .map((c) => ({ ...c, projects: c.projects.filter((n) => names.has(n)) }))
      .filter((c) => c.projects.length > 0),
  };
}

export async function generateInsights(
  projects: Project[],
  decisions: Decision[],
  run: CommandRunner,
  opts: { model: string; timeoutMs?: number },
  now = new Date(),
  trends: TrendDigest[] = [],
): Promise<Insights> {
  const raw = await callClaudeJson(run, {
    model: opts.model,
    schema: INSIGHTS_JSON_SCHEMA,
    prompt: buildInsightsPrompt(projects, decisions, now, trends),
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
  // 분석 중에 새로고침이 재분석을 요청하면, 현재 분석이 끝난 뒤 한 번 더 확인한다.
  private pending = false;
  // 실패한 요약 상태로는 자동 재시도하지 않는다(새로고침·재시작마다 Opus를 다시 부르지 않도록). 수동 버튼은 예외.
  private failedHash: string | null = null;

  constructor(private deps: InsightsDeps) {}

  private stored(): Stored | null {
    const raw = this.deps.db.getMeta(META_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Stored;
      // 스키마가 바뀐 예전 결과는 화면을 깨뜨리지 않도록 버리고, 새로 생긴 필드는 기본값으로 채운다.
      const r = InsightsSchema.safeParse(parsed.content);
      return r.success ? { ...parsed, content: r.data } : null;
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
    if (this.current) {
      this.pending = true;
      return false;
    }
    const projects = this.deps.projects().filter((p) => p.summary);
    if (projects.length === 0) return false;
    const hash = insightsSourceHash(projects);
    if (this.stored()?.sourceHash === hash || this.failedHash === hash) return false;
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
    const hash = insightsSourceHash(projects);
    this.current = generateInsights(projects, this.deps.db.listDecisions(), this.deps.run, { model: this.deps.model }, new Date(), this.deps.db.listTrendDigests(undefined, 7))
      .then((content) => {
        const stored: Stored = { content, sourceHash: hash, generatedAt: new Date().toISOString() };
        this.deps.db.setMeta(META_KEY, JSON.stringify(stored));
        this.error = null;
        this.failedHash = null;
      })
      .catch((e) => {
        this.error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        this.failedHash = hash;
      })
      .finally(() => {
        this.current = null;
        if (this.pending) {
          this.pending = false;
          this.maybeGenerate();
        }
      });
    return true;
  }

  whenIdle(): Promise<void> {
    return this.current ?? Promise.resolve();
  }
}
