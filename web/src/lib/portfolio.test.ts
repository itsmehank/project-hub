import { describe, expect, it } from 'vitest';
import { EMPTY_PERSONAL, type Lifecycle, type Project, type RuntimeSnapshot } from '@hub/shared';
import { portfolioStats } from './portfolio';

const NOW = new Date('2026-10-06T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const weeks = (last: number[]) => [...Array(26 - last.length).fill(0), ...last];

function p(name: string, o: { last?: number | null; dirty?: number; issues?: number; prs?: number; stack?: string[]; tech?: string[]; weekly?: number[]; repo?: string; lifecycle?: Lifecycle } = {}): Project {
  return {
    name,
    path: '',
    isGit: o.last !== null,
    remoteUrl: null,
    githubRepo: o.repo ?? (o.issues !== undefined ? `me/${name}` : null),
    stack: o.stack ?? [],
    readmeExcerpt: null,
    git:
      o.last === null
        ? null
        : {
            branch: 'main',
            lastCommitAt: daysAgo(o.last ?? 1),
            dirtyCount: o.dirty ?? 0,
            hasUpstream: true,
            ahead: 0,
            behind: 0,
            recentCommits: [],
            weeklyCommits: o.weekly ?? weeks([]),
          },
    github:
      o.issues !== undefined
        ? {
            url: '',
            openIssues: Array.from({ length: o.issues }, (_, i) => ({ number: i, title: '', url: '', labels: [], createdAt: '', closedAt: null })),
            openPRs: Array.from({ length: o.prs ?? 0 }, (_, i) => ({ number: i, title: '', url: '', labels: [], createdAt: '', closedAt: null })),
            recentlyClosedIssues: [],
            ci: { status: 'none' },
          }
        : null,
    errors: {},
    updatedAt: '',
    summary: o.tech
      ? { oneLiner: 'x', whatItIs: 'x', features: [], structure: [], techOverview: '', techStack: o.tech, currentState: '', nextSteps: [], runSuggestion: null }
      : null,
    summaryAt: null,
    runConfig: null,
    personal: { ...EMPTY_PERSONAL, lifecycle: o.lifecycle ?? null },
  };
}

const projects = [
  p('a', { last: 2, issues: 5, prs: 1, stack: ['Python'], tech: ['python', 'FastAPI'], weekly: weeks([1, 4]) }),
  p('b', { last: 30, dirty: 3, issues: 0, stack: ['Node', 'React'], weekly: weeks([2, 0]) }),
  p('c', { last: 200, dirty: 1, stack: ['Python'] }),
  p('d', { last: null }),
];
const runtime: RuntimeSnapshot = { at: '', byProject: { a: [{ pid: 1, pgid: 1, command: '', cwd: '', ports: [], launchedByHub: false }] } };

describe('portfolioStats', () => {
  const s = portfolioStats(projects, runtime, NOW);
  it('counts projects by activity, running, issues and PRs', () => {
    expect(s).toMatchObject({ total: 4, running: 1, openIssues: 5, openPRs: 1, activity: { active: 1, dormant: 1, stale: 1, unknown: 1 } });
  });
  it('builds a case-insensitive stack distribution, one count per project', () => {
    expect(s.stacks[0]).toEqual({ name: 'Python', count: 2 });
    expect(s.stacks.map((x) => x.name)).toEqual(expect.arrayContaining(['FastAPI', 'Node', 'React']));
  });
  it('sums weekly commits across projects', () => {
    expect(s.weekly).toHaveLength(26);
    expect(s.weekly.slice(-2)).toEqual([3, 4]);
  });
  it('picks projects with most issues and most recent commits', () => {
    expect(s.mostIssues).toEqual([{ name: 'a', count: 6 }]);
    expect(s.mostActive.map((x) => x.name)).toEqual(['a', 'b']);
  });
});

describe('portfolioStats with tags and shared repositories', () => {
  it('excludes archived projects, even running ones, and reports how many were hidden', () => {
    const withArchived = [...projects, p('z', { last: 1, issues: 9, lifecycle: 'archive' })];
    const rt: RuntimeSnapshot = { at: '', byProject: { ...runtime.byProject, z: runtime.byProject.a } };
    const s2 = portfolioStats(withArchived, rt, NOW);
    expect(s2).toMatchObject({ total: 4, archived: 1, running: 1, openIssues: 5 });
    expect(s2.activity.active).toBe(1);
  });
  it('counts issues and PRs once per repository', () => {
    const dup = [p('DataBatcher', { issues: 3, prs: 1, repo: 'me/db' }), p('DataBatcher-main', { issues: 3, prs: 1, repo: 'me/db' })];
    expect(portfolioStats(dup, undefined, NOW)).toMatchObject({ openIssues: 3, openPRs: 1 });
  });
});
