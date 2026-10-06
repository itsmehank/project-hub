import { describe, expect, it } from 'vitest';
import { EMPTY_PERSONAL, type Lifecycle, type Project } from '@hub/shared';
import { attentionSignals } from './attention';

const NOW = new Date('2026-10-06T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const pr = (number: number, age: number) => ({ number, title: '', url: '', labels: [], createdAt: daysAgo(age), closedAt: null });

function p(
  name: string,
  o: { git?: boolean; remote?: string | null; repo?: string; ahead?: number; dirty?: number; last?: number; prs?: number[]; lifecycle?: Lifecycle } = {},
): Project {
  const isGit = o.git ?? true;
  return {
    name,
    isGit,
    remoteUrl: o.remote === undefined ? `git@github.com:me/${name}.git` : o.remote,
    githubRepo: o.repo ?? null,
    git: isGit
      ? { branch: 'main', lastCommitAt: daysAgo(o.last ?? 1), dirtyCount: o.dirty ?? 0, hasUpstream: true, ahead: o.ahead ?? 0, behind: 0, recentCommits: [], weeklyCommits: [] }
      : null,
    github: o.prs ? { url: '', openIssues: [], openPRs: o.prs.map((age, i) => pr(i + 1, age)), recentlyClosedIssues: [], ci: { status: 'none' } } : null,
    personal: { ...EMPTY_PERSONAL, lifecycle: o.lifecycle ?? null },
  } as Project;
}

describe('attentionSignals', () => {
  it('lists unpushed commits, most first', () => {
    const s = attentionSignals([p('a', { ahead: 1 }), p('b', { ahead: 4 }), p('c')], NOW);
    expect(s.unpushed).toEqual([{ name: 'b', ahead: 4 }, { name: 'a', ahead: 1 }]);
  });
  it('lists PRs open for 30+ days once per repository', () => {
    const s = attentionSignals([p('db', { repo: 'me/db', prs: [40, 5, 31] }), p('db-main', { repo: 'me/db', prs: [40, 5, 31] }), p('x', { repo: 'me/x', prs: [29] })], NOW);
    expect(s.stalePRs).toEqual([{ name: 'db', count: 2, oldestDays: 40 }]);
  });
  it('lists forgotten changes only for dormant/stale, non-archived projects, oldest first', () => {
    const s = attentionSignals(
      [p('fresh', { dirty: 2, last: 3 }), p('dormant', { dirty: 1, last: 30 }), p('stale', { dirty: 5, last: 200 }), p('gone', { dirty: 9, last: 300, lifecycle: 'archive' })],
      NOW,
    );
    expect(s.forgotten.map((x) => x.name)).toEqual(['stale', 'dormant']);
    expect(s.forgotten[0]).toMatchObject({ dirty: 5 });
  });
  it('lists projects without a backup, excluding archived and experiment', () => {
    const s = attentionSignals(
      [p('local', { remote: null }), p('folder', { git: false }), p('ok'), p('lab', { remote: null, lifecycle: 'experiment' }), p('old', { git: false, lifecycle: 'archive' })],
      NOW,
    );
    expect(s.noBackup).toEqual([{ name: 'folder', reason: 'not-git' }, { name: 'local', reason: 'no-remote' }]);
  });
});
