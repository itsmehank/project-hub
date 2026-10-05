import type { Project } from '@hub/shared';
import { Box } from '../../components/ui/Box';
import { relativeTime } from '../../lib/status';

export function CommitsSection({ p, now }: { p: Project; now: Date }) {
  const git = p.git;
  if (!git) {
    return (
      <Box title="최근 커밋">
        <p className="text-xs text-muted">git 저장소가 아닙니다.</p>
      </Box>
    );
  }
  const max = Math.max(1, ...git.weeklyCommits);
  return (
    <Box title="최근 커밋" right={<span className="text-[11px] text-muted">26주 활동</span>}>
      <div className="mb-3 flex h-10 items-end gap-[3px]" title="주별 커밋 수 (오른쪽이 이번 주)">
        {git.weeklyCommits.map((n, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-gradient-to-t from-accent/40 to-accent2/70"
            style={{ height: n ? `${Math.max(12, (n / max) * 100)}%` : '3px', opacity: n ? 1 : 0.25 }}
            title={`${n}개`}
          />
        ))}
      </div>
      {git.recentCommits.length === 0 ? (
        <p className="text-xs text-muted">커밋이 없습니다.</p>
      ) : (
        <ul>
          {git.recentCommits.map((c) => (
            <li key={c.hash} className="flex gap-2 border-b border-dashed border-line py-1 text-xs last:border-0">
              <code className="shrink-0 font-mono text-muted">{c.hash.slice(0, 7)}</code>
              <span className="min-w-0 flex-1 truncate">{c.subject}</span>
              <span className="shrink-0 text-muted">{relativeTime(c.at, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}
