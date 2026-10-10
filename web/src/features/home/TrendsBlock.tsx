import { TREND_CATEGORIES, toLocalDate, type TrendDigest } from '@hub/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, Newspaper, RefreshCw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useTrends } from '../../lib/hooks';
import { CATEGORY_LABEL, filterItems, isHttpUrl, mergeDigests, trendDateLabel, type CategoryFilter } from '../../lib/trends';

// 최근 이슈: 날짜별 묶음 + 카테고리 칩 + 이전 날짜 더 보기. 모든 텍스트는 평문으로만 렌더한다.
export function TrendsBlock({ now }: { now: Date }) {
  const { data } = useTrends();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [older, setOlder] = useState<TrendDigest[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState<boolean | null>(null);
  const collect = useMutation({ mutationFn: api.collectTrends, onSettled: () => qc.invalidateQueries({ queryKey: ['trends'] }) });
  const more = useMutation({
    mutationFn: (before: string) => api.trends(before),
    onSuccess: (r) => {
      setOlder((xs) => [...xs, ...r.digests]);
      setHasMoreOlder(r.hasMore);
    },
  });
  const digests = mergeDigests(data?.digests ?? [], older);
  const collecting = !!data?.collecting || collect.isPending;
  const hasToday = digests.some((d) => d.date === toLocalDate(now));
  const canMore = hasMoreOlder ?? data?.hasMore ?? false;

  return (
    <section className="mt-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-accent/15 text-accent [&_svg]:size-4">
          <Newspaper />
        </span>
        <h3 className="text-base font-semibold">최근 이슈</h3>
        <span className="text-[11px] text-muted">웹 검색 · Claude · 하루 한 번</span>
        <button onClick={() => collect.mutate()} disabled={collecting} className="ml-auto inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-fg disabled:cursor-wait">
          {collecting ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          {collecting ? '모으는 중…' : '오늘 이슈 다시 모으기'}
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['all', ...TREND_CATEGORIES] as CategoryFilter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn('rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted hover:text-fg', filter === f && 'border-accent/40 bg-accent/15 text-fg')}>
            {f === 'all' ? '전체' : CATEGORY_LABEL[f]}
          </button>
        ))}
      </div>
      {collect.isError && <p className="mb-3 text-xs text-warn">수집을 시작하지 못했습니다</p>}
      {data?.error && (
        <p className="mb-3 flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/5 px-4 py-2 text-xs text-warn">
          <TriangleAlert className="size-3.5 shrink-0" /> 최근 수집이 실패했습니다: {data.error}
        </p>
      )}
      {!hasToday && !collecting && (
        <p className="mb-3 text-xs text-muted">
          오늘 이슈가 아직 없습니다 ·{' '}
          <button onClick={() => collect.mutate()} className="text-accent hover:underline">지금 모으기</button>
        </p>
      )}
      <div className="space-y-5">
        {digests.map((d) => {
          const items = filterItems(d.items, filter);
          if (items.length === 0) return null;
          return (
            <div key={d.date}>
              <h4 className="mb-2 text-xs font-medium text-muted">{trendDateLabel(d.date, now)}</h4>
              <div className="grid gap-2.5 md:grid-cols-2">
                {items.map((i, k) => (
                  <article key={k} className="rounded-xl border border-line bg-black/20 p-3.5 text-[13px]">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                      <span className="rounded-full border border-line px-1.5 py-px">{CATEGORY_LABEL[i.category]}</span>
                      <span className="rounded-full border border-line px-1.5 py-px">{i.region}</span>
                    </div>
                    {isHttpUrl(i.sourceUrl) ? (
                      <a href={i.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-start gap-1 font-medium hover:text-white">
                        {i.title} <ExternalLink className="mt-1 size-3 shrink-0 text-muted" />
                      </a>
                    ) : (
                      <span className="font-medium">{i.title}</span>
                    )}
                    <p className="mt-1 text-xs leading-relaxed text-fg/80">{i.summary}</p>
                    <p className="mt-1.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs">
                      <span className="text-accent">아이디어 관점 </span>
                      {i.ideaAngle}
                    </p>
                    <p className="mt-1.5 text-[10px] text-muted">
                      {i.sourceName} · {i.publishedAt}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {canMore && digests.length > 0 && (
        <div className="mt-3 flex items-center gap-3">
          <button onClick={() => more.mutate(digests[digests.length - 1].date)} disabled={more.isPending} className="text-xs text-accent hover:underline">
            {more.isPending ? '불러오는 중…' : '이전 날짜 더 보기'}
          </button>
          {more.isError && <span className="text-xs text-warn">이전 날짜를 불러오지 못했습니다</span>}
        </div>
      )}
    </section>
  );
}
