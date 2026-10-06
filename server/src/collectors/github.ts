import type { GitHubInfo, Item } from '@hub/shared';
import type { CommandRunner } from '../exec';

export class RateLimitError extends Error {}

// 닫힌 이슈·머지된 PR은 주간 리뷰(2주 전 + 직전 주 비교)를 위해 30일치를 모은다.
const CLOSED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE = 50;

export function parseGithubRepo(remoteUrl: string | null): string | null {
  if (!remoteUrl) return null;
  const m = remoteUrl.trim().match(/(?:^|[@/])github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export interface RawIssue {
  number: number;
  title: string;
  html_url: string;
  labels?: (string | { name?: string })[];
  created_at: string;
  closed_at?: string | null;
  merged_at?: string | null;
  updated_at?: string;
  pull_request?: unknown;
}

export const toItem = (r: RawIssue): Item => ({
  number: r.number,
  title: r.title,
  url: r.html_url,
  labels: (r.labels ?? []).map((l) => (typeof l === 'string' ? l : (l.name ?? ''))).filter(Boolean),
  createdAt: r.created_at,
  closedAt: r.closed_at ?? null,
});

export async function api<T>(run: CommandRunner, apiPath: string): Promise<T> {
  const r = await run('gh', ['api', '--hostname', 'github.com', apiPath], { timeoutMs: 15_000 });
  if (r.code !== 0) {
    const msg = r.stderr.trim() || `gh api ${apiPath} failed`;
    if (/rate limit|HTTP 429/i.test(msg)) throw new RateLimitError(msg);
    throw new Error(msg);
  }
  return JSON.parse(r.stdout) as T;
}

export async function collectGitHub(repo: string, run: CommandRunner, now = new Date()): Promise<GitHubInfo> {
  const since = new Date(now.getTime() - CLOSED_WINDOW_MS).toISOString();
  const [open, pulls, closed, closedPulls, runs] = await Promise.all([
    api<RawIssue[]>(run, `repos/${repo}/issues?state=open&per_page=50`),
    api<RawIssue[]>(run, `repos/${repo}/pulls?state=open&per_page=30`),
    api<RawIssue[]>(run, `repos/${repo}/issues?state=closed&since=${since}&per_page=${PAGE}`),
    api<RawIssue[]>(run, `repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${PAGE}`),
    api<{ workflow_runs?: RawRun[] }>(run, `repos/${repo}/actions/runs?per_page=20&exclude_pull_requests=true`),
  ]);

  return {
    url: `https://github.com/${repo}`,
    openIssues: open.filter((i) => !i.pull_request).map(toItem),
    openPRs: pulls.map(toItem),
    recentlyClosedIssues: closed
      .filter((i) => !i.pull_request && i.closed_at && i.closed_at >= since)
      .map(toItem)
      .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '')),
    ci: pickCi(runs.workflow_runs ?? []),
    recentlyClosedTruncated: closed.length >= PAGE,
    // 닫혔지만 머지되지 않은 PR은 뺀다. closedAt에는 머지 시각을 넣는다.
    recentlyMergedPRs: closedPulls
      .filter((p) => p.merged_at && p.merged_at >= since)
      .map((p) => ({ ...toItem(p), closedAt: p.merged_at! }))
      .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '')),
    // 업데이트순 한 페이지가 꽉 찼고 마지막 항목도 기간 안이면, 기간 안의 PR이 더 있을 수 있다.
    recentlyMergedTruncated: closedPulls.length >= PAGE && (closedPulls.at(-1)?.updated_at ?? '') >= since,
  };
}

interface RawRun {
  event?: string;
  status: string;
  conclusion: string | null;
  html_url?: string;
  created_at?: string;
  actor?: { login?: string };
}

// 사람이 만든 CI 결과만 본다. Dependabot 의존성 그래프 실행(dynamic)과 취소·건너뜀은 판단 근거가 아니다.
const IGNORED_CONCLUSIONS = new Set(['cancelled', 'skipped', 'neutral', 'stale']);
const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out', 'startup_failure', 'action_required']);

export function pickCi(runs: RawRun[]): GitHubInfo['ci'] {
  for (const r of runs) {
    if (r.event === 'dynamic' || r.actor?.login?.startsWith('dependabot')) continue;
    if (r.status !== 'completed') return { status: 'in_progress', url: r.html_url, at: r.created_at };
    if (r.conclusion === 'success') return { status: 'success', url: r.html_url, at: r.created_at };
    if (r.conclusion && FAILED_CONCLUSIONS.has(r.conclusion)) return { status: 'failure', url: r.html_url, at: r.created_at };
    if (r.conclusion && IGNORED_CONCLUSIONS.has(r.conclusion)) continue;
  }
  return { status: 'none' };
}
