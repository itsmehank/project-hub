import { TRENDS_JSON_SCHEMA, TrendsResultSchema, addDays, toLocalDate, type Project, type TrendItem, type TrendsResponse } from '@hub/shared';
import { callClaudeJson } from './collectors/claude';
import type { Db } from './db';
import type { CommandRunner } from './exec';

const TOOLS = ['WebSearch', 'WebFetch'];

export function buildTrendsPrompt(projects: Project[], recentTitles: string[], today: string): string {
  const mine = projects
    .filter((p) => p.summary && p.personal.lifecycle !== 'archive')
    .map((p) => `- ${p.name}: ${p.summary!.oneLiner}`);
  return [
    `너는 한 개인 개발자에게 새 사이드 프로젝트 아이디어의 재료가 될 최근 소식을 골라 주는 리서처다.`,
    `오늘은 ${today}다. 웹 검색으로 최근 3일 안의 소식을 우선 찾고, 없으면 최근 7일까지 본다.`,
    ``,
    `분야(category)와 분야별 2~3개, 국내와 해외를 섞어 모두 8~12개:`,
    `- ai: AI·개발 도구(새 모델, 에이전트, 개발자 도구, 화제의 오픈소스)`,
    `- consumer: 소비자 앱·서비스·스타트업(새 서비스, 앱 순위·화제, 투자 유치)`,
    `- life: 생활·소비 트렌드(소비, 콘텐츠, 육아, 라이프스타일, 검색·SNS 유행)`,
    `- invest: 투자·모빌리티·공공데이터(개인 투자 도구, 자동차·교통, 새로 열린 공공데이터·API)`,
    ``,
    `넣지 않는 것: 정치, 선거, 정당, 외교 분쟁, 전쟁, 사건사고, 연예 가십, 주가 단기 등락 전망.`,
    `모든 항목은 실제로 열어 본 출처의 URL(http 또는 https)을 sourceUrl에 넣는다. 출처가 확실하지 않으면 넣지 않는다.`,
    `title은 한국어로 60자 안팎, summary는 두 문장, ideaAngle은 이 개발자가 새 프로젝트로 연결할 수 있는 관점 한 줄.`,
    `publishedAt은 소식의 게시일(YYYY-MM-DD), region은 국내 또는 해외.`,
    ``,
    `이 개발자의 프로젝트(관심사 파악용, 이것과 연결될 만한 소식을 우선):`,
    ...(mine.length ? mine : ['- (정보 없음)']),
    ``,
    `지난 7일에 이미 알려 준 소식(같은 소식은 다시 넣지 않는다):`,
    ...(recentTitles.length ? recentTitles.map((t) => `- ${t}`) : ['- (없음)']),
  ].join('\n');
}

const isHttp = (s: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(s.trim()).protocol);
  } catch {
    return false;
  }
};

// 외부 웹에서 온 결과다. 형식을 검증하고, 링크가 http(s)가 아니거나 제목이 겹치는 항목은 버린다.
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

export function sanitizeTrendItems(raw: unknown): TrendItem[] {
  const parsed = TrendsResultSchema.parse(raw);
  const seen = new Set<string>();
  const items = parsed.items
    // 웹에서 온 텍스트는 줄바꿈을 없애 한 줄로 저장한다(프롬프트 구조 흉내 방지).
    .map((i) => ({ ...i, title: flat(i.title), summary: flat(i.summary), ideaAngle: flat(i.ideaAngle), sourceName: flat(i.sourceName), sourceUrl: i.sourceUrl.trim() }))
    .filter((i) => {
      const key = i.title.toLowerCase();
      if (!isHttp(i.sourceUrl) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (items.length === 0) throw new Error('쓸 수 있는 이슈가 없습니다');
  return items;
}

export interface TrendsDeps {
  db: Db;
  run: CommandRunner;
  model: string;
  projects: () => Project[];
  now?: () => Date;
}

export class TrendsManager {
  private current: Promise<void> | null = null;
  private error: string | null = null;
  // 자동 수집이 실패한 날. 그날은 새로고침마다 다시 부르지 않는다(수동 버튼은 예외).
  private failedAutoDate: string | null = null;

  constructor(private deps: TrendsDeps) {}

  private today() {
    return toLocalDate(this.deps.now?.() ?? new Date());
  }

  get(before?: string, limit = 7): TrendsResponse {
    const rows = this.deps.db.listTrendDigests(before, limit + 1);
    return { digests: rows.slice(0, limit), collecting: this.current !== null, error: this.error, hasMore: rows.length > limit };
  }

  maybeCollect(): boolean {
    const today = this.today();
    if (this.current || this.deps.db.getTrendDigest(today) || this.failedAutoDate === today) return false;
    return this.start(true);
  }

  collect(): boolean {
    return this.start(false);
  }

  private start(auto: boolean): boolean {
    if (this.current) return false;
    const today = this.today();
    const recentTitles = this.deps.db
      .listTrendDigests(undefined, 7)
      .filter((d) => d.date >= addDays(today, -7))
      .flatMap((d) => d.items.map((i) => i.title));
    this.current = callClaudeJson(this.deps.run, {
      model: this.deps.model,
      schema: TRENDS_JSON_SCHEMA,
      prompt: buildTrendsPrompt(this.deps.projects(), recentTitles, today),
      timeoutMs: 300_000,
      tools: TOOLS,
    })
      .then((raw) => {
        const items = sanitizeTrendItems(raw);
        this.deps.db.putTrendDigest({ date: today, items, model: this.deps.model, createdAt: new Date().toISOString() });
        this.error = null;
      })
      .catch((e) => {
        this.error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        if (auto) this.failedAutoDate = today;
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
