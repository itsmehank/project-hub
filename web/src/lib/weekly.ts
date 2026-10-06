import type { Item, Project } from '@hub/shared';
import { isArchived } from './lifecycle';
import { groupByRepo, repoKeyOf } from './repo';

export type WeekOffset = 0 | -1 | -2;
export interface WeekRange {
  start: Date;
  end: Date;
  label: string;
}

const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

// 월요일 00:00(로컬)부터 다음 월요일 00:00까지. offset은 주 단위(0 = 이번 주, -1 = 지난주).
export function weekRange(now: Date, offset: number): WeekRange {
  const sinceMonday = (now.getDay() + 6) % 7;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday + offset * 7);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
  return { start, end, label: `${md(start)}–${md(last)}` };
}

export interface WeeklyRow {
  name: string;
  members: string[];
  commits: number;
  subjects: string[];
  closedIssues: number;
  mergedPRs: number;
  partial: boolean;
}
export interface ContinueItem {
  name: string;
  reason: 'focus' | 'commits' | 'note';
  note: string;
  nextStep: string | null;
  commits: number;
}
export interface WeeklyReview {
  commits: number;
  prevCommits: number | null;
  changePct: number | null;
  touched: number;
  closedIssues: number;
  mergedPRs: number;
  rows: WeeklyRow[];
  dirty: { name: string; dirty: number }[];
  continueList: ContinueItem[];
  missingData: boolean;
  partial: boolean;
}

const inRange = (iso: string | null | undefined, r: WeekRange) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= r.start.getTime() && t < r.end.getTime();
};

// 저장소 묶음 하나의 커밋(해시로 중복 제거, 최신순)
function groupCommits(group: Project[]) {
  const byHash = new Map<string, { subject: string; at: string }>();
  for (const p of group) for (const c of p.git?.windowCommits ?? []) byHash.set(c.hash, c);
  return [...byHash.values()].sort((a, b) => b.at.localeCompare(a.at));
}

// 묶음 안 여러 폴더의 같은 번호는 한 번만 센다(같은 저장소라 키가 같다).
function groupItems(group: Project[], pick: (p: Project) => Item[] | undefined, r: WeekRange): number {
  const seen = new Set<string>();
  for (const p of group) for (const i of pick(p) ?? []) if (inRange(i.closedAt, r)) seen.add(`${repoKeyOf(p)}#${i.number}`);
  return seen.size;
}

export function weeklyReview(projects: Project[], range: WeekRange, prev: WeekRange): WeeklyReview {
  const groups = groupByRepo(projects);
  let commits = 0;
  let prevCommits = 0;
  let closedIssues = 0;
  let mergedPRs = 0;
  const rows: WeeklyRow[] = [];
  const commitsByName = new Map<string, number>();

  for (const group of groups) {
    const all = groupCommits(group);
    const inWeek = all.filter((c) => inRange(c.at, range));
    const closed = groupItems(group, (p) => p.github?.recentlyClosedIssues, range);
    const merged = groupItems(group, (p) => p.github?.recentlyMergedPRs, range);
    commits += inWeek.length;
    prevCommits += all.filter((c) => inRange(c.at, prev)).length;
    closedIssues += closed;
    mergedPRs += merged;
    for (const p of group) commitsByName.set(p.name, inWeek.length);
    if (inWeek.length || closed || merged) {
      rows.push({
        name: group[0].name,
        members: group.slice(1).map((p) => p.name),
        commits: inWeek.length,
        subjects: inWeek.slice(0, 3).map((c) => c.subject),
        closedIssues: closed,
        mergedPRs: merged,
        partial: group.some((p) => p.git?.windowTruncated || p.github?.recentlyClosedTruncated || p.github?.recentlyMergedTruncated),
      });
    }
  }
  rows.sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name, 'en'));

  const collected = projects.filter((p) => p.git?.windowCommits !== undefined);
  // 직전 주 시작이 어느 프로젝트의 수집 시작보다 앞서면 그 주는 일부만 모은 것이라 비교하지 않는다.
  const comparable = collected.length > 0 && collected.every((p) => !p.git?.windowSince || new Date(p.git.windowSince).getTime() <= prev.start.getTime());
  const prevOrNull = comparable ? prevCommits : null;

  const candidates = projects.filter((p) => !isArchived(p));
  const rank = (p: Project): ContinueItem['reason'] | null =>
    p.personal.lifecycle === 'focus' ? 'focus' : (commitsByName.get(p.name) ?? 0) > 0 ? 'commits' : p.personal.note ? 'note' : null;
  const order = { focus: 0, commits: 1, note: 2 } as const;
  const continueList = candidates
    .map((p) => ({ p, reason: rank(p), commits: commitsByName.get(p.name) ?? 0 }))
    .filter((x): x is { p: Project; reason: ContinueItem['reason']; commits: number } => x.reason !== null)
    .sort((a, b) => order[a.reason] - order[b.reason] || b.commits - a.commits || a.p.name.localeCompare(b.p.name, 'en'))
    .slice(0, 5)
    .map(({ p, reason, commits: n }) => ({ name: p.name, reason, note: p.personal.note, nextStep: p.summary?.nextSteps[0] ?? null, commits: n }));

  return {
    commits,
    prevCommits: prevOrNull,
    changePct: prevOrNull ? Math.round(((commits - prevOrNull) / prevOrNull) * 100) : null,
    touched: rows.filter((r) => r.commits > 0).length,
    closedIssues,
    mergedPRs,
    rows,
    dirty: projects.filter((p) => (p.git?.dirtyCount ?? 0) > 0).map((p) => ({ name: p.name, dirty: p.git!.dirtyCount })),
    continueList,
    missingData: projects.some((p) => p.git) && collected.length === 0,
    partial: rows.some((r) => r.partial),
  };
}
