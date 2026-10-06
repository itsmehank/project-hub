import type { IssueDetail } from '@hub/shared';

export type IssueSort = 'newest' | 'oldest' | 'comments' | 'updated';

export function filterIssues(items: IssueDetail[], f: { query: string; labels: string[] }): IssueDetail[] {
  const q = f.query.trim().toLowerCase();
  const num = /^#?(\d+)$/.exec(q)?.[1];
  return items.filter((i) => {
    if (f.labels.some((l) => !i.labels.includes(l))) return false;
    if (!q) return true;
    if (num && String(i.number) === num) return true;
    return i.title.toLowerCase().includes(q) || i.body.toLowerCase().includes(q);
  });
}

export function sortIssues(items: IssueDetail[], sort: IssueSort): IssueDetail[] {
  const t = (s: string) => new Date(s).getTime();
  const cmp: Record<IssueSort, (a: IssueDetail, b: IssueDetail) => number> = {
    newest: (a, b) => t(b.createdAt) - t(a.createdAt),
    oldest: (a, b) => t(a.createdAt) - t(b.createdAt),
    comments: (a, b) => b.comments - a.comments || t(b.createdAt) - t(a.createdAt),
    updated: (a, b) => t(b.updatedAt) - t(a.updatedAt),
  };
  return [...items].sort(cmp[sort]);
}

export function collectLabels(items: IssueDetail[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const i of items) for (const l of i.labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'en'));
}
