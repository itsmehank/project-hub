import type { Insights, Project, RuntimeSnapshot } from '@hub/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Activity, ArrowRight, Brain, ChevronDown, Lightbulb, Loader2, Newspaper, Play, Rocket, Sparkles, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Box } from '../../components/ui/Box';
import { NumberTicker } from '../../components/ui/NumberTicker';
import { SpotlightCard } from '../../components/ui/SpotlightCard';
import { Tooltip } from '../../components/ui/Tooltip';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { changesSince } from '../../lib/decisions';
import { HOME_TABS, nextTab, readHomeTab, writeHomeTab, type HomeTab } from '../../lib/homeTab';
import { useDecisions, useInsights } from '../../lib/hooks';
import { portfolioStats } from '../../lib/portfolio';
import { openUrl } from '../../lib/runConfig';
import { relativeClock, type Filter, type Sort } from '../../lib/status';
import { AttentionBox } from './AttentionBox';
import { CommitHeatmap } from './CommitHeatmap';
import { IdeasSection } from './IdeasSection';
import { DecisionButtons } from './DecisionButtons';
import { MyDecisions } from './MyDecisions';
import { TrendsBlock } from './TrendsBlock';

const READINESS: Record<Insights['serviceCandidates'][number]['readiness'], { label: string; cls: string }> = {
  high: { label: '바로 공개 가능', cls: 'border-live/40 bg-live/10 text-live' },
  medium: { label: '몇 주 작업 필요', cls: 'border-warn/40 bg-warn/10 text-warn' },
  low: { label: '큰 작업 필요', cls: 'border-bad/40 bg-bad/10 text-bad' },
};

const TAB_META: Record<HomeTab, { label: string; icon: LucideIcon }> = {
  status: { label: '현황', icon: Activity },
  candidates: { label: '서비스 후보', icon: Rocket },
  cleanup: { label: '정리 제안', icon: Trash2 },
  ideas: { label: '신규 아이디어', icon: Lightbulb },
  trends: { label: '최근 이슈', icon: Newspaper },
};

const getStorage = () => window.localStorage;

function ZoneHeader({ title, sub, right }: { title: string; sub: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end gap-2">
      <h3 className="text-sm font-semibold tracking-wide">{title}</h3>
      <span className="text-[11px] text-muted">{sub}</span>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

function ProjectChip({ name, onOpen }: { name: string; onOpen: (n: string) => void }) {
  return (
    <button
      onClick={() => onOpen(name)}
      className="rounded-md border border-line bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-accent2/90 transition hover:border-accent2/50"
    >
      {name}
    </button>
  );
}

export function HomePage({
  projects,
  runtime,
  now,
  lastRefreshAt,
  onOpen,
  onFilter,
  onSort,
}: {
  projects: Project[];
  runtime: RuntimeSnapshot | undefined;
  now: Date;
  lastRefreshAt: string | null;
  onOpen: (name: string) => void;
  onFilter: (f: Filter) => void;
  onSort: (s: Sort) => void;
}) {
  const stats = portfolioStats(projects, runtime, now);
  const { data } = useInsights();
  const { data: decisions = [] } = useDecisions();
  const qc = useQueryClient();
  const regenerate = useMutation({
    mutationFn: api.regenerateInsights,
    onSettled: () => qc.invalidateQueries({ queryKey: ['insights'] }),
  });
  const ins = data?.insights ?? null;
  const generating = !!data?.generating || regenerate.isPending;
  const maxStack = Math.max(1, ...stats.stacks.map((s) => s.count));
  const running = Object.entries(runtime?.byProject ?? {});
  const [tab, setTabState] = useState<HomeTab>(() => readHomeTab(getStorage));
  const tabRefs = useRef<Partial<Record<HomeTab, HTMLButtonElement | null>>>({});
  const setTab = (t: HomeTab) => {
    setTabState(t);
    writeHomeTab(getStorage, t);
  };
  const onTabKey = (e: KeyboardEvent) => {
    const t = nextTab(tab, e.key);
    if (!t) return;
    e.preventDefault();
    setTab(t);
    tabRefs.current[t]?.focus();
  };
  const counts: Partial<Record<HomeTab, number>> = ins ? { candidates: ins.serviceCandidates.length, cleanup: ins.cleanup.length } : {};
  const aiTab = tab === 'candidates' || tab === 'cleanup' || tab === 'ideas';

  // 지표 카드를 누르면 왼쪽 목록이 그 조건으로 걸러진다.
  const cards: { label: string; value: number; extra?: string; cls: string; onClick: () => void }[] = [
    { label: '전체', value: stats.total, extra: stats.archived ? `(+보관 ${stats.archived})` : undefined, cls: 'text-fg', onClick: () => onFilter('all') },
    { label: '실행 중', value: stats.running, cls: 'text-live', onClick: () => onFilter('running') },
    { label: '활성', value: stats.activity.active, cls: 'text-live', onClick: () => onFilter('active') },
    { label: '휴면', value: stats.activity.dormant, cls: 'text-warn', onClick: () => onFilter('dormant') },
    { label: '방치', value: stats.activity.stale, cls: 'text-bad', onClick: () => onFilter('stale') },
    {
      label: '열린 이슈·PR',
      value: stats.openIssues + stats.openPRs,
      cls: 'text-accent',
      onClick: () => {
        onFilter('all');
        onSort('issues');
      },
    },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl border border-line bg-panel/80 p-6 backdrop-blur"
    >
      <h2 className="bg-gradient-to-r from-white via-accent to-accent2 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
        포트폴리오 인사이트
      </h2>
      <p className="mt-1 text-xs text-muted">{stats.total}개 프로젝트</p>

      {/* 지금 실행 중 */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-live/20 bg-live/[0.05] px-4 py-2.5 text-xs">
        <span className="inline-flex items-center gap-1 font-medium text-live">
          <Play className="size-3 fill-current" /> 지금 실행 중
        </span>
        {running.length === 0 && <span className="text-muted">없음</span>}
        {running.map(([name, procs]) => {
          const ports = [...new Set(procs.flatMap((p) => p.ports))];
          return (
            <span key={name} className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2 py-1">
              <button onClick={() => onOpen(name)} className="hover:text-white">
                {name}
              </button>
              {ports.length === 0 && <span className="text-muted">포트 없음</span>}
              {ports.map((port) => (
                <a key={port} href={openUrl(port)} target="_blank" rel="noreferrer" className="text-live hover:underline">
                  :{port}
                </a>
              ))}
            </span>
          );
        })}
      </div>

      {/* 영역이 길어 탭으로 나눠 한 번에 하나만 보여준다. */}
      <div role="tablist" aria-label="인사이트 영역" onKeyDown={onTabKey} className="mt-5 flex flex-wrap gap-1.5 border-b border-line pb-3">
        {HOME_TABS.map((t) => {
          const { label, icon: Icon } = TAB_META[t];
          const on = tab === t;
          return (
            <button
              key={t}
              ref={(el) => {
                tabRefs.current[t] = el;
              }}
              role="tab"
              id={`home-tab-${t}`}
              aria-selected={on}
              aria-controls="home-tabpanel"
              tabIndex={on ? 0 : -1}
              onClick={() => setTab(t)}
              className={cn('relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted transition hover:text-fg', on && 'text-fg')}
            >
              {on && <motion.span layoutId="home-tab" className="absolute inset-0 -z-10 rounded-lg bg-white/[0.06]" />}
              <Icon className={cn('size-3.5', on && 'text-accent')} />
              {label}
              {counts[t] !== undefined && <span className="text-xs tabular-nums text-muted">{counts[t]}</span>}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="home-tabpanel" aria-labelledby={`home-tab-${tab}`}>
        {/* 현황: 수집한 사실 */}
        {tab === 'status' && (
          <div className="mt-4">
            <ZoneHeader
              title="현황"
              sub={`git·GitHub 집계 · 데이터 갱신 ${lastRefreshAt ? relativeClock(lastRefreshAt, now) : '기록 없음'}`}
            />
            <div className="grid grid-cols-3 gap-2.5 xl:grid-cols-6">
              {cards.map((c) => (
                <button key={c.label} onClick={c.onClick} className="text-left" title="눌러서 왼쪽 목록 거르기">
                  <SpotlightCard className="p-3">
                    <NumberTicker value={c.value} className={cn('block text-2xl font-bold', c.cls)} />
                    <span className="text-[11px] text-muted">
                      {c.label}
                      {c.extra && <span className="ml-1 opacity-70">{c.extra}</span>}
                    </span>
                  </SpotlightCard>
                </button>
              ))}
            </div>

            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              <Box title="최근 26주 전체 커밋" className="mb-0">
                <CommitHeatmap projects={projects} now={now} />
              </Box>
              <Box title="기술 스택 분포" className="mb-0">
                <ul className="space-y-1">
                  {stats.stacks.map((s) => (
                    <li key={s.name} className="flex items-center gap-2 text-xs">
                      <span className="w-24 shrink-0 truncate text-fg/80">{s.name}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                        <motion.span
                          className="block h-full rounded-full bg-gradient-to-r from-accent to-accent2"
                          initial={{ width: 0 }}
                          animate={{ width: `${(s.count / maxStack) * 100}%` }}
                          transition={{ duration: 0.6 }}
                        />
                      </span>
                      <span className="w-5 text-right tabular-nums text-muted">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </Box>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Box title="요즘 가장 활발한" className="mb-0">
                {stats.mostActive.length === 0 && <p className="text-xs text-muted">최근 2주 커밋이 없습니다.</p>}
                {stats.mostActive.map((x) => (
                  <button key={x.name} onClick={() => onOpen(x.name)} className="flex w-full justify-between py-0.5 text-left text-xs hover:text-white">
                    <span>{x.name}</span>
                    <span className="text-muted">2주 커밋 {x.commits}</span>
                  </button>
                ))}
              </Box>
              <Box title="이슈가 쌓인" className="mb-0">
                {stats.mostIssues.length === 0 && <p className="text-xs text-muted">열린 이슈가 없습니다.</p>}
                {stats.mostIssues.map((x) => (
                  <button key={x.name} onClick={() => onOpen(x.name)} className="flex w-full justify-between py-0.5 text-left text-xs hover:text-white">
                    <span>{x.name}</span>
                    <span className="text-muted">이슈·PR {x.count}</span>
                  </button>
                ))}
              </Box>
            </div>
            <AttentionBox projects={projects} now={now} onOpen={onOpen} />
          </div>
        )}

        {/* AI 제안: Claude의 판단(사실과 구분) */}
        {aiTab && (
          <div className="mt-4 rounded-2xl border border-accent/20 bg-accent/[0.04] p-5">
            <ZoneHeader
              title="AI 제안"
              sub={`Claude 분석${data?.generatedAt ? ` · ${relativeClock(data.generatedAt, now)}` : ''} · 추천이므로 판단은 직접`}
              right={
                <Tooltip align="end" content="모든 프로젝트 설명과 활동 지표를 Claude(Opus 모델)가 다시 읽고 추천을 새로 만듭니다 (1~2분).">
                  <button
                    onClick={() => regenerate.mutate()}
                    disabled={generating}
                    className="inline-flex animate-shimmer items-center gap-1.5 rounded-full border border-[#3a3360] bg-[linear-gradient(110deg,#1a1630_45%,#3a2f6b_55%,#1a1630)] bg-[length:200%_100%] px-3.5 py-1.5 text-xs text-fg transition hover:border-accent/70 disabled:cursor-wait"
                  >
                    {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    {generating ? '분석 중…' : '다시 분석'}
                  </button>
                </Tooltip>
              }
            />

            {(() => {
              const n = changesSince(projects, decisions, data?.generatedAt ?? null);
              return n > 0 && ins && !generating ? (
                <p className="mb-3 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-2.5 text-xs">
                  분석 이후 태그·결정이 {n}건 바뀌었습니다
                  <button onClick={() => regenerate.mutate()} className="text-accent hover:underline">
                    다시 분석
                  </button>
                </p>
              ) : null;
            })()}
            <MyDecisions projects={projects} onOpen={onOpen} />
            {data?.error && (
              <p className="mb-3 flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/5 px-4 py-2.5 text-xs text-warn">
                <TriangleAlert className="size-3.5 shrink-0" /> 최근 분석이 실패했습니다{ins ? ' (이전 결과를 보여줍니다)' : ''}: {data.error}
              </p>
            )}
            {!ins && (
              <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-line py-12 text-sm text-muted">
                {generating ? (
                  <>
                    <Loader2 className="size-6 animate-spin text-accent" />
                    Claude가 {stats.total}개 프로젝트를 읽고 분석하고 있습니다… (1~2분)
                  </>
                ) : (
                  <>아직 분석 결과가 없습니다. "다시 분석"을 눌러 시작하세요.</>
                )}
              </div>
            )}

            {ins && (
              <div className={cn('transition-opacity', generating && 'opacity-60')}>
                {tab === 'candidates' && (
                  <div className="mt-2 grid gap-3 xl:grid-cols-3">
                    {ins.serviceCandidates.map((c, i) => (
                      <SpotlightCard key={`${i}-${c.project}`} className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-accent/70">{i + 1}</span>
                          <button onClick={() => onOpen(c.project)} className="font-semibold hover:text-white">
                            {c.project}
                          </button>
                          <span className={cn('ml-auto rounded-full border px-2 py-px text-[10px]', READINESS[c.readiness].cls)}>
                            {READINESS[c.readiness].label}
                          </span>
                        </div>
                        <p className="mt-2 text-[13px] leading-relaxed">{c.pitch}</p>
                        <dl className="mt-3 space-y-2 text-xs">
                          <div>
                            <dt className="text-muted">대상 사용자</dt>
                            <dd className="text-fg/90">{c.targetUsers}</dd>
                          </div>
                          <div>
                            <dt className="text-muted">수익·사용자 확보</dt>
                            <dd className="text-fg/90">{c.monetization}</dd>
                          </div>
                        </dl>
                        {c.nextSteps.length > 0 && (
                          <ol className="mt-3 space-y-1 border-t border-line pt-2 text-xs text-fg/85">
                            {c.nextSteps.map((s, j) => (
                              <li key={j} className="flex gap-1.5">
                                <span className="text-muted">{j + 1}.</span>
                                {s}
                              </li>
                            ))}
                          </ol>
                        )}
                        <button onClick={() => onOpen(c.project)} className="mt-auto inline-flex items-center gap-1 pt-3 text-xs text-accent hover:underline">
                          프로젝트 보기 <ArrowRight className="size-3" />
                        </button>
                        <DecisionButtons suggestion={{ kind: 'candidate', snapshot: c }} />
                      </SpotlightCard>
                    ))}
                  </div>
                )}

                {tab === 'cleanup' &&
                  (ins.cleanup.length === 0 ? (
                    <p className="mt-2 rounded-xl border border-dashed border-line py-8 text-center text-xs text-muted">정리 제안이 없습니다.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {ins.cleanup.map((c, i) => (
                        <div key={i} className="rounded-xl border border-line bg-black/20 p-3.5 text-[13px]">
                          <div className="flex flex-wrap gap-1.5">
                            {c.projects.map((n) => (
                              <ProjectChip key={n} name={n} onOpen={onOpen} />
                            ))}
                          </div>
                          <p className="mt-2 font-medium">{c.suggestion}</p>
                          <p className="mt-0.5 text-xs text-muted">{c.reason}</p>
                          <DecisionButtons suggestion={{ kind: 'cleanup', snapshot: c }} />
                        </div>
                      ))}
                    </div>
                  ))}

                {tab === 'ideas' && (
                  <>
                    <IdeasSection ins={ins} chip={(n) => <ProjectChip key={n} name={n} onOpen={onOpen} />} />

                    {/* 한 번 읽으면 되는 내용이라 기본으로 접어 둔다. */}
                    <details className="group mt-6 rounded-xl border border-line bg-black/20 p-4">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
                        <Brain className="size-4 text-accent" /> 나의 개발 성향
                        <span className="truncate text-xs font-normal text-muted">{ins.profile.headline}</span>
                        <ChevronDown className="ml-auto size-4 text-muted transition group-open:rotate-180" />
                      </summary>
                      <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <ul className="space-y-1.5 text-[13px]">
                          {ins.profile.traits.map((t, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-accent">•</span>
                              {t}
                            </li>
                          ))}
                        </ul>
                        <div>
                          <h4 className="mb-1.5 text-[11px] tracking-wider text-muted uppercase">강점과 자산</h4>
                          <div className="flex flex-wrap gap-1.5">
                            {ins.profile.strengths.map((s, i) => (
                              <span key={i} className="rounded-lg border border-accent/25 bg-accent/10 px-2.5 py-1 text-xs text-fg/90">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </details>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'trends' && <TrendsBlock now={now} />}
      </div>
    </motion.section>
  );
}
