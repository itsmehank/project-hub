import type { IssueDetail, IssueKind, IssueList } from '@hub/shared';
import type { CommandRunner } from '../exec';
import { api, toItem, type RawIssue } from './github';

const PER_PAGE = 100;
const MAX_PAGES = 10;
const MAX_BODY = 2000;

interface RawIssueDetail extends RawIssue {
  user?: { login?: string } | null;
  comments?: number;
  updated_at?: string;
  body?: string | null;
}

const toDetail = (r: RawIssueDetail): IssueDetail => ({
  ...toItem(r),
  author: r.user?.login ?? null,
  comments: r.comments ?? 0,
  updatedAt: r.updated_at ?? r.created_at,
  body: (r.body ?? '').slice(0, MAX_BODY),
});

// 이슈 전체 페이지용. 상세 패널의 요약 목록과 달리 페이지를 넘겨 가며 모두 가져온다.
export async function fetchIssues(repo: string, kind: IssueKind, run: CommandRunner): Promise<IssueList> {
  const base =
    kind === 'pr' ? `repos/${repo}/pulls?state=open` : `repos/${repo}/issues?state=${kind === 'open' ? 'open' : 'closed'}`;
  const items: IssueDetail[] = [];
  let truncated = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await api<RawIssueDetail[]>(run, `${base}&per_page=${PER_PAGE}&page=${page}`);
    for (const r of batch) if (kind === 'pr' || !r.pull_request) items.push(toDetail(r));
    if (batch.length < PER_PAGE) break;
    if (page === MAX_PAGES) truncated = true;
  }
  return { kind, items, truncated, fetchedAt: new Date().toISOString() };
}
