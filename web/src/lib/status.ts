import type { Project, RuntimeSnapshot } from '@hub/shared';

export type Activity = 'active' | 'dormant' | 'stale' | 'unknown';
export type Filter = 'all' | 'running' | 'active' | 'dormant' | 'stale' | 'dirty';
export type Sort = 'recent' | 'name' | 'issues';
export const FILTERS: Filter[] = ['all', 'running', 'active', 'dormant', 'stale', 'dirty'];

const DAY = 86_400_000;

export function activityOf(lastCommitAt: string | null, now: Date): Activity {
  if (!lastCommitAt) return 'unknown';
  const days = (now.getTime() - new Date(lastCommitAt).getTime()) / DAY;
  if (days <= 14) return 'active';
  if (days <= 60) return 'dormant';
  return 'stale';
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function relativeTime(iso: string | null, now: Date): string {
  if (!iso) return '—';
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY);
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 30) return `${days}일 전`;
  if (days < 365) return `${Math.floor(days / 30)}달 전`;
  return `${Math.floor(days / 365)}년 전`;
}

export function relativeClock(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}시간 전`;
  return relativeTime(iso, now);
}

export const isRunning = (p: Project, runtime?: RuntimeSnapshot) => (runtime?.byProject[p.name]?.length ?? 0) > 0;

function matchesFilter(p: Project, filter: Filter, runtime: RuntimeSnapshot | undefined, now: Date): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'running':
      return isRunning(p, runtime);
    case 'dirty':
      return (p.git?.dirtyCount ?? 0) > 0;
    default:
      return activityOf(p.git?.lastCommitAt ?? null, now) === filter;
  }
}

function matchesQuery(p: Project, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [p.name, p.summary?.oneLiner, p.readmeExcerpt, ...p.stack].some((s) => s?.toLowerCase().includes(q));
}

export function filterProjects(
  projects: Project[],
  filter: Filter,
  runtime: RuntimeSnapshot | undefined,
  query: string,
  now: Date,
): Project[] {
  return projects.filter((p) => matchesFilter(p, filter, runtime, now) && matchesQuery(p, query));
}

const lastAt = (p: Project) => (p.git?.lastCommitAt ? new Date(p.git.lastCommitAt).getTime() : 0);
const openCount = (p: Project) => (p.github?.openIssues.length ?? 0) + (p.github?.openPRs.length ?? 0);

export function sortProjects(projects: Project[], sort: Sort): Project[] {
  const byName = (a: Project, b: Project) => a.name.localeCompare(b.name, 'en');
  const byRecent = (a: Project, b: Project) => lastAt(b) - lastAt(a) || byName(a, b);
  const cmp =
    sort === 'name' ? byName : sort === 'issues' ? (a: Project, b: Project) => openCount(b) - openCount(a) || byRecent(a, b) : byRecent;
  return [...projects].sort(cmp);
}

export function countFilters(projects: Project[], runtime: RuntimeSnapshot | undefined, now: Date): Record<Filter, number> {
  const counts = { all: 0, running: 0, active: 0, dormant: 0, stale: 0, dirty: 0 } satisfies Record<Filter, number>;
  for (const p of projects) for (const f of FILTERS) if (matchesFilter(p, f, runtime, now)) counts[f]++;
  return counts;
}

export const displayLine = (p: Project) => p.summary?.oneLiner ?? p.readmeExcerpt ?? '설명 없음';
