import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bucketWeekly, collectGit, parseLog } from '../src/collectors/git';
import { runCommand } from '../src/exec';
import { commit, git, makeRepo } from './gitFixture';

describe('collectGit', () => {
  it('returns null for a non-git folder', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hub-plain-'));
    expect(await collectGit(dir, runCommand)).toBeNull();
  });

  it('returns null for a subfolder of a repo', async () => {
    const repo = await makeRepo();
    mkdirSync(path.join(repo, 'sub'));
    expect(await collectGit(path.join(repo, 'sub'), runCommand)).toBeNull();
  });

  it('handles a repo with no commits', async () => {
    const repo = await makeRepo();
    const r = await collectGit(repo, runCommand);
    expect(r?.git).toMatchObject({ branch: 'main', lastCommitAt: null, recentCommits: [], hasUpstream: false });
    expect(r?.git.weeklyCommits).toHaveLength(26);
    expect(r?.remoteUrl).toBeNull();
  });

  it('reports commits, dirty files and missing upstream', async () => {
    const repo = await makeRepo();
    await commit(repo, 'first');
    await commit(repo, 'second');
    writeFileSync(path.join(repo, 'untracked.txt'), 'x');
    const r = await collectGit(repo, runCommand);
    expect(r?.git.recentCommits.map((c) => c.subject)).toEqual(['second', 'first']);
    expect(r?.git.lastCommitAt).toBe(r?.git.recentCommits[0].at);
    expect(r?.git.dirtyCount).toBe(1);
    expect(r?.git).toMatchObject({ hasUpstream: false, ahead: 0, behind: 0 });
    expect(r?.git.weeklyCommits[25]).toBe(2);
  });

  it('counts ahead commits against an upstream and reads the remote url', async () => {
    const bare = mkdtempSync(path.join(tmpdir(), 'hub-bare-'));
    await git(bare, 'init', '-q', '--bare', '-b', 'main');
    const repo = await makeRepo();
    await commit(repo, 'base');
    await git(repo, 'remote', 'add', 'origin', bare);
    await git(repo, 'push', '-q', '-u', 'origin', 'main');
    await commit(repo, 'local only');
    const r = await collectGit(repo, runCommand);
    expect(r?.git).toMatchObject({ hasUpstream: true, ahead: 1, behind: 0 });
    expect(r?.remoteUrl).toBe(bare);
  });

  it('reports detached HEAD as branch "HEAD"', async () => {
    const repo = await makeRepo();
    await commit(repo, 'one');
    await commit(repo, 'two');
    await git(repo, 'checkout', '-q', 'HEAD~1');
    expect((await collectGit(repo, runCommand))?.git.branch).toBe('HEAD');
  });
});

describe('parseLog', () => {
  it('splits unit-separated fields and keeps subjects with pipes', () => {
    const out = 'abc\x1ffeat: a | b\x1f2026-10-01T10:00:00+09:00\n';
    expect(parseLog(out)).toEqual([{ hash: 'abc', subject: 'feat: a | b', at: '2026-10-01T10:00:00+09:00' }]);
  });
});

describe('bucketWeekly', () => {
  it('puts this week last and drops dates older than 26 weeks', () => {
    const now = new Date('2026-10-05T00:00:00Z');
    const weeks = bucketWeekly(
      ['2026-10-04T00:00:00Z', '2026-09-27T00:00:00Z', '2026-09-26T00:00:00Z', '2025-01-01T00:00:00Z'],
      now,
    );
    expect(weeks).toHaveLength(26);
    expect(weeks[25]).toBe(1);
    expect(weeks[24]).toBe(2);
    expect(weeks.reduce((a, b) => a + b, 0)).toBe(3);
  });
});
