import type { Project, RuntimeProcess } from '@hub/shared';
import { Play } from 'lucide-react';
import { SpotlightRow } from '../../components/ui/SpotlightRow';
import { cn } from '../../lib/cn';
import { LIFECYCLE_LABEL } from '../../lib/lifecycle';
import { activityOf, displayLine, formatDate, relativeTime } from '../../lib/status';
import { ACTIVITY, activityLabel } from './activity';

export function ProjectRow({ p, processes, selected, onSelect, now }: { p: Project; processes: RuntimeProcess[]; selected: boolean; onSelect: () => void; now: Date }) {
  const ports = [...new Set(processes.flatMap((x) => x.ports))];
  const act = activityOf(p.git?.lastCommitAt ?? null, now);
  const dirty = p.git?.dirtyCount ?? 0;
  return (
    <SpotlightRow active={selected} onClick={onSelect} className="cursor-pointer border-b border-line/70 px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <span className={cn('size-2 shrink-0 rounded-full', ACTIVITY[act].dot)} title={activityLabel(act, p.isGit)} />
        <span className="truncate text-sm font-semibold">{p.name}</span>
        {p.personal.lifecycle && (
          <span className={cn('shrink-0 rounded-full border px-1.5 py-px text-[10px]', LIFECYCLE_LABEL[p.personal.lifecycle].cls)}>
            {LIFECYCLE_LABEL[p.personal.lifecycle].short}
          </span>
        )}
        {processes.length > 0 && (
          // 실행 여부는 활동 점(색)과 다른 모양(▶)으로 구분하고, 포트가 있으면 바로 보여준다.
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-live/30 bg-live/10 px-1.5 py-px text-[10px] font-medium text-live">
            <Play className="size-2.5 fill-current" />
            {ports.length ? ports.map((n) => `:${n}`).join(' ') : '실행 중'}
          </span>
        )}
        {(p.git?.ahead ?? 0) > 0 && (
          <span className="text-[10px] text-warn" title={`push 안 한 커밋 ${p.git!.ahead}개`}>
            ↑{p.git!.ahead}
          </span>
        )}
        {dirty > 0 && <span className="text-[10px] text-warn" title={`미커밋 변경 ${dirty}개`}>±{dirty}</span>}
        <span className="ml-auto shrink-0 text-[11px] text-muted" title={p.git?.lastCommitAt ? `마지막 커밋 ${formatDate(p.git.lastCommitAt)}` : undefined}>{p.git?.lastCommitAt ? relativeTime(p.git.lastCommitAt, now) : activityLabel(act, p.isGit)}</span>
      </div>
      <p className="mt-0.5 truncate pl-4 text-xs text-muted">{displayLine(p)}</p>
    </SpotlightRow>
  );
}
