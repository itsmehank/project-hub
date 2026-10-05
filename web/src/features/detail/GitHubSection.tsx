import type { Item, Project } from '@hub/shared';
import { CircleDot, CircleCheck, GitPullRequest } from 'lucide-react';
import type { ReactNode } from 'react';
import { Box } from '../../components/ui/Box';
import { relativeTime } from '../../lib/status';

const MAX = 6;

function ItemList({ items, icon, empty, now, moreUrl }: { items: Item[]; icon: ReactNode; empty: string; now: Date; moreUrl: string }) {
  if (items.length === 0) return <p className="py-1 text-xs text-muted">{empty}</p>;
  return (
    <ul>
      {items.slice(0, MAX).map((i) => (
        <li key={i.number} className="border-b border-dashed border-line py-1.5 last:border-0">
          <a href={i.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 hover:text-white">
            <span className="mt-0.5 shrink-0">{icon}</span>
            <span className="min-w-0 flex-1">
              <span className="text-muted">#{i.number}</span> {i.title}
              {i.labels.map((l) => (
                <span key={l} className="ml-1.5 rounded bg-white/5 px-1.5 text-[10px] text-muted">{l}</span>
              ))}
            </span>
            <span className="shrink-0 text-[11px] text-muted">{relativeTime(i.closedAt ?? i.createdAt, now)}</span>
          </a>
        </li>
      ))}
      {items.length > MAX && (
        <li className="pt-1.5 text-xs">
          <a href={moreUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            외 {items.length - MAX}개 GitHub에서 보기 ↗
          </a>
        </li>
      )}
    </ul>
  );
}

export function GitHubSection({ p, now }: { p: Project; now: Date }) {
  const g = p.github;
  if (!p.githubRepo || !g) {
    return (
      <Box title="GitHub">
        <p className="text-xs text-muted">{p.githubRepo ? 'GitHub 정보를 아직 가져오지 못했습니다.' : 'GitHub 저장소가 연결되어 있지 않습니다 (로컬 전용).'}</p>
      </Box>
    );
  }
  return (
    <Box title={`열린 이슈 ${g.openIssues.length} · PR ${g.openPRs.length}`}>
      <ItemList items={g.openIssues} icon={<CircleDot className="size-3.5 text-live" />} empty="열린 이슈가 없습니다." now={now} moreUrl={`${g.url}/issues`} />
      {g.openPRs.length > 0 && (
        <div className="mt-2">
          <ItemList items={g.openPRs} icon={<GitPullRequest className="size-3.5 text-accent" />} empty="" now={now} moreUrl={`${g.url}/pulls`} />
        </div>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted hover:text-fg">최근 14일 닫힌 이슈 {g.recentlyClosedIssues.length}</summary>
        <ItemList
          items={g.recentlyClosedIssues}
          icon={<CircleCheck className="size-3.5 text-muted" />}
          empty="최근에 닫힌 이슈가 없습니다."
          now={now}
          moreUrl={`${g.url}/issues?q=is%3Aclosed`}
        />
      </details>
    </Box>
  );
}
