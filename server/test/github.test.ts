import { describe, expect, it } from 'vitest';
import { RateLimitError, collectGitHub, parseGithubRepo } from '../src/collectors/github';
import { fakeRunner } from './fakeRunner';

const NOW = new Date('2026-10-05T00:00:00Z');
const issue = (n: number, extra: Record<string, unknown> = {}) => ({
  number: n,
  title: `issue ${n}`,
  html_url: `https://github.com/me/r/issues/${n}`,
  labels: [{ name: 'bug' }],
  created_at: '2026-09-01T00:00:00Z',
  closed_at: null,
  ...extra,
});

function ghRunner(routes: Record<string, unknown>, failWith?: string) {
  return fakeRunner((cmd, args) => {
    if (cmd !== 'gh' || args[0] !== 'api') return undefined;
    if (failWith) return { code: 1, stderr: failWith };
    const p = args[3];
    const key = Object.keys(routes).find((k) => p.includes(k));
    return key ? { stdout: JSON.stringify(routes[key]) } : { code: 1, stderr: 'HTTP 404' };
  });
}

describe('parseGithubRepo', () => {
  it.each([
    ['git@github.com:itsmehank/mx5-bot.git', 'itsmehank/mx5-bot'],
    ['https://github.com/itsmehank/hw-note.git', 'itsmehank/hw-note'],
    ['https://github.com/itsmehank/hw-note/', 'itsmehank/hw-note'],
    ['ssh://git@github.com/itsmehank/yt-digest.git', 'itsmehank/yt-digest'],
    ['git@github.kakaocorp.com:team/repo.git', null],
    ['/tmp/bare-repo', null],
    [null, null],
  ])('%s -> %s', (url, expected) => {
    expect(parseGithubRepo(url)).toBe(expected);
  });
});

describe('collectGitHub', () => {
  it('collects issues (without PRs), PRs, recently closed issues and CI', async () => {
    const run = ghRunner({
      'issues?state=open': [issue(1), issue(2, { pull_request: {} })],
      'pulls?state=open': [issue(3)],
      'issues?state=closed': [
        issue(4, { closed_at: '2026-10-01T00:00:00Z' }),
        issue(5, { closed_at: '2026-09-01T00:00:00Z' }),
        issue(6, { closed_at: '2026-10-02T00:00:00Z', pull_request: {} }),
      ],
      'actions/runs': { workflow_runs: [{ status: 'completed', conclusion: 'success', html_url: 'u', created_at: 't' }] },
    });
    const info = await collectGitHub('me/r', run, NOW);
    expect(info.url).toBe('https://github.com/me/r');
    expect(info.openIssues.map((i) => i.number)).toEqual([1]);
    expect(info.openIssues[0]).toMatchObject({ labels: ['bug'], url: 'https://github.com/me/r/issues/1' });
    expect(info.openPRs.map((i) => i.number)).toEqual([3]);
    expect(info.recentlyClosedIssues.map((i) => i.number)).toEqual([4]);
    expect(info.ci).toEqual({ status: 'success', url: 'u', at: 't' });
    expect(run.calls.every((c) => c.args.slice(0, 3).join(' ') === 'api --hostname github.com')).toBe(true);
  });

  it('maps CI states', async () => {
    const base = { 'issues?state': [], 'pulls?state': [] };
    const running = await collectGitHub(
      'me/r',
      ghRunner({ ...base, 'actions/runs': { workflow_runs: [{ status: 'in_progress', conclusion: null }] } }),
      NOW,
    );
    expect(running.ci.status).toBe('in_progress');
    const none = await collectGitHub('me/r', ghRunner({ ...base, 'actions/runs': { workflow_runs: [] } }), NOW);
    expect(none.ci).toEqual({ status: 'none' });
    const failed = await collectGitHub(
      'me/r',
      ghRunner({ ...base, 'actions/runs': { workflow_runs: [{ status: 'completed', conclusion: 'failure' }] } }),
      NOW,
    );
    expect(failed.ci.status).toBe('failure');
  });

  it('throws RateLimitError on rate limiting', async () => {
    await expect(collectGitHub('me/r', ghRunner({}, 'gh: API rate limit exceeded (HTTP 403)'), NOW)).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it('throws a plain Error on other failures', async () => {
    const err = await collectGitHub('me/r', ghRunner({}, 'gh: Not Found (HTTP 404)'), NOW).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(RateLimitError);
    expect(err.message).toContain('Not Found');
  });
});
