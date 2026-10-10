import { toLocalDate, type Project } from '@hub/shared';
import { Tooltip } from '../../components/ui/Tooltip';
import { cn } from '../../lib/cn';
import { dailyTotals, dayLabel, heatmapGrid, type HeatCell } from '../../lib/heatmap';

const LEVEL_CLS = ['bg-white/[0.04]', 'bg-accent/30', 'bg-accent/50', 'bg-accent/75', 'bg-accent2'];
const ROW_LABEL = ['월', '', '수', '', '금', '', ''];

function Cell({ c, today }: { c: HeatCell | null; today: string }) {
  if (!c) return <span className="size-[11px]" />;
  return (
    <Tooltip content={`${dayLabel(c.date)} · ${c.count ? `${c.count}건` : '커밋 없음'}`} side="top">
      <span className={cn('block size-[11px] rounded-[3px]', LEVEL_CLS[c.level], c.date === today && 'ring-1 ring-fg/70')} />
    </Tooltip>
  );
}

export function CommitHeatmap({ projects, now }: { projects: Project[]; now: Date }) {
  const { weeks, monthLabels } = heatmapGrid(dailyTotals(projects, now));
  if (weeks.length === 0) return <p className="py-6 text-center text-xs text-muted">일별 커밋은 다음 새로고침 후 표시됩니다.</p>;
  const today = toLocalDate(now);
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px] pl-5 text-[10px] text-muted">
        {monthLabels.map((m, i) => (
          <span key={i} className="w-[11px] shrink-0 overflow-visible whitespace-nowrap">
            {m}
          </span>
        ))}
      </div>
      <div className="mt-1 flex gap-[3px]">
        <div className="flex w-4 shrink-0 flex-col gap-[3px] text-[9px] leading-[11px] text-muted">
          {ROW_LABEL.map((l, i) => (
            <span key={i} className="h-[11px]">
              {l}
            </span>
          ))}
        </div>
        {weeks.map((w, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {w.map((c, j) => (
              <Cell key={j} c={c} today={today} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
