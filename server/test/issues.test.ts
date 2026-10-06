import { describe, expect, it } from 'vitest';
import { fetchIssues } from '../src/collectors/issues';
import { fakeRunner } from './fakeRunner';

const raw = (n: number, extra: Record<string, unknown> = {}) => ({
  number: n,
  title: `t${n}`,
  html_url: `u${n}`,
  labels: [{ name: 'bug' }],
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-02T00:00:00Z',
  closed_at: null,
  comments: n % 3,
  user: { login: 'me' },
  body: 'b'.repeat(3000),
  ...extra,
});

function pagedRunner(pages: unknown[][]) {
  return fakeRunner((cmd, args) => {
    if (cmd !== 'gh') return undefined;
    const page = Number(/[?&]page=(\d+)/.exec(args[3])?.[1] ?? 1);
    return { stdout: JSON.stringify(pages[page - 1] ?? []) };
  });
}

describe('fetchIssues', () => {
  it('follows pages, drops PRs from issue lists and trims bodies', async () => {
    const page1 = [...Array.from({ length: 99 }, (_, i) => raw(i + 1)), raw(100, { pull_request: {} })];
    const run = pagedRunner([page1, [raw(101)]]);
    const list = await fetchIssues('me/r', 'open', run);
    expect(list.items).toHaveLength(100);
    expect(list.items.some((i) => i.number === 100)).toBe(false);
    expect(list.items[0]).toMatchObject({ author: 'me', comments: 1, updatedAt: '2026-09-02T00:00:00Z', labels: ['bug'] });
    expect(list.items[0].body).toHaveLength(2000);
    expect(list.truncated).toBe(false);
    expect(run.calls).toHaveLength(2);
    expect(run.calls[0].args.slice(0, 3)).toEqual(['api', '--hostname', 'github.com']);
    expect(run.calls[0].args[3]).toContain('issues?state=open&per_page=100&page=1');
  });

  it('marks the list truncated after 10 full pages', async () => {
    const full = Array.from({ length: 100 }, (_, i) => raw(i + 1));
    const run = pagedRunner(Array.from({ length: 11 }, () => full));
    const list = await fetchIssues('me/r', 'closed', run);
    expect(run.calls).toHaveLength(10);
    expect(list.truncated).toBe(true);
    expect(run.calls[0].args[3]).toContain('issues?state=closed');
  });

  it('lists open pull requests for kind=pr', async () => {
    const run = pagedRunner([[raw(7)]]);
    const list = await fetchIssues('me/r', 'pr', run);
    expect(list.items.map((i) => i.number)).toEqual([7]);
    expect(run.calls[0].args[3]).toContain('pulls?state=open');
  });

  it('throws when gh fails', async () => {
    const run = fakeRunner(() => ({ code: 1, stderr: 'HTTP 500' }));
    await expect(fetchIssues('me/r', 'open', run)).rejects.toThrow(/500/);
  });
});
