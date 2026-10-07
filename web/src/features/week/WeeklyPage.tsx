import type { Project } from '@hub/shared';
import { useMutation } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Code2, TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { Box } from '../../components/ui/Box';
import { NumberTicker } from '../../components/ui/NumberTicker';
import { SpotlightCard } from '../../components/ui/SpotlightCard';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { relativeClock } from '../../lib/status';
import { changeLabel, weekRange, weeklyReview, type WeekOffset } from '../../lib/weekly';
import { RefreshButton } from '../topbar/RefreshButton';

const TITLE: Record<WeekOffset, string> = { 0: '이번 주', [-1]: '지난주', [-2]: '2주 전' };
const REASON = { focus: '집중', commits: '이 주 커밋', note: '메모' } as const;

function OpenEditor({ name }: { name: string }) {
  const m = useMutation({ mutationFn: () => api.openEditor(name) });
  return (
    <button onClick={() => m.mutate()} disabled={m.isPending} className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-fg">
      <Code2 className="size-3" /> 편집기에서 열기
    </button>
  );
}

export function WeeklyPage({
  projects,
  now,
  lastRefreshAt,
  offset,
  onOffset,
  onOpen,
}: {
  projects: Project[];
  now: Date;
  lastRefreshAt: string | null;
  offset: WeekOffset;
  onOffset: (o: WeekOffset) => void;
  onOpen: (name: string) => void;
}) {
  const range = weekRange(now, offset);
  const r = weeklyReview(projects, range, weekRange(now, offset - 1));
  const stale = !lastRefreshAt || now.getTime() - new Date(lastRefreshAt).getTime() > 12 * 3_600_000;
  const notYet = lastRefreshAt && new Date(lastRefreshAt).getTime() < range.start.getTime();
  const maxRow = Math.max(1, ...r.rows.map((x) => x.commits));
  const change = changeLabel(r);

  return (
    <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="rounded-2xl border border-line bg-panel/80 p-6 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-extrabold tracking-tight">주간 리뷰</h2>
        <div className="flex items-center gap-1 text-sm">
          <button onClick={() => onOffset((offset - 1) as WeekOffset)} disabled={offset === -2} aria-label="이전 주" className="rounded-lg p-1 text-muted hover:text-fg disabled:opacity-30">
            <ChevronLeft className="size-4" />
          </button>
          <span className="font-medium">{TITLE[offset]}</span>
          <span className="text-muted">{range.label}</span>
          <button onClick={() => onOffset((offset + 1) as WeekOffset)} disabled={offset === 0} aria-label="다음 주" className="rounded-lg p-1 text-muted hover:text-fg disabled:opacity-30">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className={cn('mt-3 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2 text-xs', stale ? 'border-warn/30 bg-warn/5 text-warn' : 'border-line text-muted')}>
        {stale && <TriangleAlert className="size-3.5" />}
        데이터 기준: {lastRefreshAt ? `${relativeClock(lastRefreshAt, now)} 새로고침` : '새로고침 기록 없음'}
        {notYet && <span>· 이 주의 데이터가 아직 수집되지 않았습니다</span>}
        <span className="ml-auto">
          <RefreshButton />
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted">주는 월요일 0시부터 일요일 끝까지입니다. 첫 화면의 26주 막대는 새로고침 시각 기준 7일 묶음이라 숫자가 조금 다를 수 있습니다.</p>

      {r.missingData ? (
        <p className="mt-6 rounded-xl border border-dashed border-line py-10 text-center text-sm text-muted">주간 리뷰용 데이터는 다음 새로고침 후 표시됩니다.</p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
            <SpotlightCard className="p-3">
              <NumberTicker value={r.commits} className="block text-2xl font-bold" />
              <span className="text-[11px] text-muted">
                커밋 · 직전 주 대비 <b className={cn('font-medium', r.changePct === null ? 'text-muted' : r.changePct >= 0 ? 'text-live' : 'text-warn')}>{change}</b>
              </span>
            </SpotlightCard>
            <SpotlightCard className="p-3">
              <NumberTicker value={r.touched} className="block text-2xl font-bold" />
              <span className="text-[11px] text-muted">손댄 프로젝트</span>
            </SpotlightCard>
            <SpotlightCard className="p-3">
              <NumberTicker value={r.closedIssues} className="block text-2xl font-bold" />
              <span className="text-[11px] text-muted">닫힌 이슈</span>
            </SpotlightCard>
            <SpotlightCard className="p-3">
              <NumberTicker value={r.mergedPRs} className="block text-2xl font-bold" />
              <span className="text-[11px] text-muted">머지된 PR</span>
            </SpotlightCard>
          </div>
          {r.partial && <p className="mt-1.5 text-[11px] text-warn">일부만 집계했습니다. 수집 상한에 닿은 저장소가 있거나, 일부 프로젝트는 다음 새로고침 후 전체가 반영됩니다.</p>}

          <Box title="프로젝트별 활동" className="mt-4">
            {r.rows.length === 0 && <p className="text-xs text-muted">이 주에는 활동 기록이 없습니다.</p>}
            <ul className="space-y-2.5">
              {r.rows.map((row) => (
                <li key={row.name} className="text-xs">
                  <div className="flex items-center gap-2">
                    <button onClick={() => onOpen(row.name)} className="w-44 shrink-0 truncate text-left font-medium hover:text-white">
                      {row.name}
                      {row.members.length > 0 && <span className="ml-1 font-normal text-muted">({row.members.join(', ')} 포함)</span>}
                    </button>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <span className="block h-full rounded-full bg-gradient-to-r from-accent to-accent2" style={{ width: `${(row.commits / maxRow) * 100}%` }} />
                    </span>
                    <span className="w-40 shrink-0 text-right text-muted">
                      커밋 {row.commits} · 이슈 {row.closedIssues} · PR {row.mergedPRs}
                      {row.partial && <span className="text-warn"> · 일부만 집계</span>}
                    </span>
                  </div>
                  {row.subjects.length > 0 && (
                    <ul className="mt-1 ml-[11.5rem] space-y-0.5 text-muted">
                      {row.subjects.map((s, i) => (
                        <li key={i} className="truncate">· {s}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </Box>

          <Box title="이어갈 후보" className="mt-3">
            {r.continueList.length === 0 && <p className="text-xs text-muted">집중 태그, 이 주 커밋, 메모가 있는 프로젝트가 없습니다.</p>}
            <ul className="space-y-2">
              {r.continueList.map((x) => (
                <li key={x.name} className="rounded-lg bg-white/[0.03] px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{x.name}</span>
                    <span className="rounded-full border border-line px-1.5 py-px text-[10px] text-muted">{REASON[x.reason]}</span>
                    <span className="ml-auto flex gap-3">
                      <button onClick={() => onOpen(x.name)} className="text-[11px] text-accent hover:underline">상세 보기</button>
                      <OpenEditor name={x.name} />
                    </span>
                  </div>
                  {x.note && <p className="mt-1 text-fg/85">메모: {x.note}</p>}
                  {x.nextStep && <p className="mt-0.5 text-muted">다음 할 일: {x.nextStep}</p>}
                </li>
              ))}
            </ul>
          </Box>

          <Box title="현재 미커밋 · 현재 시점 기준" className="mt-3 mb-0">
            {r.dirty.length === 0 && <p className="text-xs text-muted">커밋하지 않은 변경이 있는 프로젝트가 없습니다.</p>}
            <div className="flex flex-wrap gap-1.5">
              {r.dirty.map((d) => (
                <button key={d.name} onClick={() => onOpen(d.name)} className="rounded-md border border-line px-2 py-0.5 text-[11px] hover:border-warn/50">
                  {d.name} <span className="text-warn">±{d.dirty}</span>
                </button>
              ))}
            </div>
          </Box>
        </>
      )}
    </motion.section>
  );
}
