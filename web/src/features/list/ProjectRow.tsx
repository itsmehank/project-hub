import type { Project } from '@hub/shared';
import { LiveBadge } from '../../components/ui/LiveBadge';
import { SpotlightRow } from '../../components/ui/SpotlightRow';
import { cn } from '../../lib/cn';
import { activityOf, displayLine, relativeTime } from '../../lib/status';
import { ACTIVITY } from './activity';

export function ProjectRow({ p, running, selected, onSelect, now }: { p: Project; running: boolean; selected: boolean; onSelect: () => void; now: Date }) {
  const act = activityOf(p.git?.lastCommitAt ?? null, now);
  const dirty = p.git?.dirtyCount ?? 0;
  return (
    <SpotlightRow active={selected} onClick={onSelect} className="cursor-pointer border-b border-line/70 px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <span className={cn('size-2 shrink-0 rounded-full', ACTIVITY[act].dot)} title={ACTIVITY[act].label} />
        <span className="truncate text-sm font-semibold">{p.name}</span>
        {running && <LiveBadge />}
        {dirty > 0 && <span className="text-[10px] text-warn" title={`미커밋 변경 ${dirty}개`}>±{dirty}</span>}
        <span className="ml-auto shrink-0 text-[11px] text-muted">{relativeTime(p.git?.lastCommitAt ?? null, now)}</span>
      </div>
      <p className="mt-0.5 truncate pl-4 text-xs text-muted">{displayLine(p)}</p>
    </SpotlightRow>
  );
}
