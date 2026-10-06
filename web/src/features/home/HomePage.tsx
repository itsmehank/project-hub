import type { Insights, Project, RuntimeSnapshot } from '@hub/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowRight, Brain, Lightbulb, Loader2, Rocket, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Box } from '../../components/ui/Box';
import { NumberTicker } from '../../components/ui/NumberTicker';
import { SpotlightCard } from '../../components/ui/SpotlightCard';
import { Tooltip } from '../../components/ui/Tooltip';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useInsights } from '../../lib/hooks';
import { portfolioStats } from '../../lib/portfolio';
import { relativeClock, relativeTime } from '../../lib/status';

const READINESS: Record<Insights['serviceCandidates'][number]['readiness'], { label: string; cls: string }> = {
  high: { label: '바로 공개 가능', cls: 'border-live/40 bg-live/10 text-live' },
  medium: { label: '몇 주 작업 필요', cls: 'border-warn/40 bg-warn/10 text-warn' },
  low: { label: '큰 작업 필요', cls: 'border-bad/40 bg-bad/10 text-bad' },
};

function SectionTitle({ icon, children, right }: { icon: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-8 mb-3 flex items-center gap-2">
      <span className="grid size-7 place-items-center rounded-lg bg-accent/15 text-accent [&_svg]:size-4">{icon}</span>
      <h3 className="text-base font-semibold">{children}</h3>
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
  onOpen,
}: {
  projects: Project[];
  runtime: RuntimeSnapshot | undefined;
  now: Date;
  onOpen: (name: string) => void;
}) {
  const stats = portfolioStats(projects, runtime, now);
  const { data } = useInsights();
  const qc = useQueryClient();
  const regenerate = useMutation({
    mutationFn: api.regenerateInsights,
    onSettled: () => qc.invalidateQueries({ queryKey: ['insights'] }),
  });
  const ins = data?.insights ?? null;
  const generating = !!data?.generating || regenerate.isPending;
  const maxWeek = Math.max(1, ...stats.weekly);
  const maxStack = Math.max(1, ...stats.stacks.map((s) => s.count));

  const cards = [
    { label: '전체', value: stats.total, cls: 'text-fg' },
    { label: '실행 중', value: stats.running, cls: 'text-live' },
    { label: '활성', value: stats.activity.active, cls: 'text-live' },
    { label: '휴면', value: stats.activity.dormant, cls: 'text-warn' },
    { label: '방치', value: stats.activity.stale, cls: 'text-bad' },
    { label: '열린 이슈·PR', value: stats.openIssues + stats.openPRs, cls: 'text-accent' },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl border border-line bg-panel/80 p-6 backdrop-blur"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="bg-gradient-to-r from-white via-accent to-accent2 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
            포트폴리오 인사이트
          </h2>
          <p className="mt-1 text-xs text-muted">
            {stats.total}개 프로젝트 기준
            {data?.generatedAt && ` · Opus 분석 ${relativeClock(data.generatedAt, now)}`}
          </p>
        </div>
        <Tooltip className="ml-auto" align="end" content="모든 프로젝트 설명과 활동 지표를 Opus가 다시 읽고 성향·추천·아이디어를 새로 분석합니다 (1~2분).">
          <button
            onClick={() => regenerate.mutate()}
            disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#3a3360] bg-[linear-gradient(110deg,#1a1630_45%,#3a2f6b_55%,#1a1630)] bg-[length:200%_100%] px-3.5 py-1.5 text-xs text-fg transition hover:border-accent/70 disabled:cursor-wait animate-shimmer"
          >
            {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {generating ? '분석 중…' : '인사이트 다시 분석'}
          </button>
        </Tooltip>
      </div>

      {/* 한눈에 보기 */}
      <div className="mt-5 grid grid-cols-3 gap-2.5 xl:grid-cols-6">
        {cards.map((c) => (
          <SpotlightCard key={c.label} className="p-3">
            <NumberTicker value={c.value} className={cn('block text-2xl font-bold', c.cls)} />
            <span className="text-[11px] text-muted">{c.label}</span>
          </SpotlightCard>
        ))}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Box title="최근 26주 전체 커밋" className="mb-0">
          <div className="flex h-20 items-end gap-[3px]">
            {stats.weekly.map((n, i) => (
              <div
                key={i}
                title={`${i === 25 ? '이번 주' : `${25 - i}주 전`} · ${n}개`}
                className="flex-1 rounded-sm bg-gradient-to-t from-accent/40 to-accent2/80"
                style={{ height: n ? `${Math.max(6, (n / maxWeek) * 100)}%` : '3px', opacity: n ? 1 : 0.25 }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted">
            <span>25주 전</span>
            <span>이번 주</span>
          </div>
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

      <div className="mt-3 grid gap-3 md:grid-cols-3">
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
        <Box title="잊혀진 작업 (미커밋 + 휴면·방치)" className="mb-0">
          {stats.forgottenDirty.length === 0 && <p className="text-xs text-muted">없습니다.</p>}
          {stats.forgottenDirty.slice(0, 5).map((x) => (
            <button key={x.name} onClick={() => onOpen(x.name)} className="flex w-full justify-between py-0.5 text-left text-xs hover:text-white">
              <span>{x.name}</span>
              <span className="text-warn">±{x.dirty} · {relativeTime(x.lastCommitAt, now)}</span>
            </button>
          ))}
        </Box>
      </div>

      {/* Opus 분석 */}
      {data?.error && (
        <p className="mt-6 flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/5 px-4 py-2.5 text-xs text-warn">
          <TriangleAlert className="size-3.5 shrink-0" /> 최근 분석이 실패했습니다{ins ? ' (이전 결과를 보여줍니다)' : ''}: {data.error}
        </p>
      )}
      {!ins && (
        <div className="mt-8 grid place-items-center gap-3 rounded-2xl border border-dashed border-line py-14 text-sm text-muted">
          {generating ? (
            <>
              <Loader2 className="size-6 animate-spin text-accent" />
              Opus가 {stats.total}개 프로젝트를 읽고 분석하고 있습니다… (1~2분)
            </>
          ) : (
            <>아직 분석 결과가 없습니다. 위의 "인사이트 다시 분석"을 눌러 시작하세요.</>
          )}
        </div>
      )}

      {ins && (
        <div className={cn('transition-opacity', generating && 'opacity-60')}>
          <SectionTitle icon={<Brain />}>나의 개발 성향</SectionTitle>
          <SpotlightCard className="p-5">
            <p className="bg-gradient-to-r from-white to-accent bg-clip-text text-lg font-bold text-transparent">{ins.profile.headline}</p>
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
          </SpotlightCard>

          <SectionTitle icon={<Rocket />}>서비스로 공개해볼 만한 프로젝트</SectionTitle>
          <div className="grid gap-3 xl:grid-cols-3">
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
              </SpotlightCard>
            ))}
          </div>

          <SectionTitle icon={<Lightbulb />}>신규 프로젝트 아이디어</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {ins.newIdeas.map((idea, i) => (
              <SpotlightCard key={i}>
                <p className="font-semibold">{idea.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-fg/90">{idea.pitch}</p>
                {idea.leverages.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted">활용:</span>
                    {idea.leverages.map((n) => (
                      <ProjectChip key={n} name={n} onOpen={onOpen} />
                    ))}
                  </div>
                )}
                <p className="mt-2.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs">
                  <span className="text-accent">이번 주 첫 단계 </span>
                  {idea.firstStep}
                </p>
              </SpotlightCard>
            ))}
          </div>

          {ins.cleanup.length > 0 && (
            <>
              <SectionTitle icon={<Trash2 />}>정리 제안</SectionTitle>
              <div className="space-y-2">
                {ins.cleanup.map((c, i) => (
                  <div key={i} className="rounded-xl border border-line bg-black/20 p-3.5 text-[13px]">
                    <div className="flex flex-wrap gap-1.5">
                      {c.projects.map((n) => (
                        <ProjectChip key={n} name={n} onOpen={onOpen} />
                      ))}
                    </div>
                    <p className="mt-2 font-medium">{c.suggestion}</p>
                    <p className="mt-0.5 text-xs text-muted">{c.reason}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </motion.section>
  );
}
