import { describe, expect, it } from 'vitest';
import { EMPTY_PERSONAL, type Project, type RuntimeSnapshot } from '@hub/shared';
import {
  activityOf,
  countFilters,
  displayLine,
  filterProjects,
  formatDate,
  relativeClock,
  relativeTime,
  sortProjects,
} from './status';

const NOW = new Date('2026-10-05T12:00:00+09:00');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function project(name: string, over: Partial<Project> = {}, lastDays: number | null = 1, dirty = 0): Project {
  return {
    name,
    path: `/r/${name}`,
    isGit: lastDays !== null,
    remoteUrl: null,
    githubRepo: null,
    stack: [],
    readmeExcerpt: null,
    git:
      lastDays === null
        ? null
        : {
            branch: 'main',
            lastCommitAt: daysAgo(lastDays),
            dirtyCount: dirty,
            hasUpstream: false,
            ahead: 0,
            behind: 0,
            recentCommits: [],
            weeklyCommits: [],
          },
    github: null,
    errors: {},
    updatedAt: '',
    summary: null,
    summaryAt: null,
    runConfig: null,
    personal: EMPTY_PERSONAL,
    ...over,
  };
}

describe('activityOf', () => {
  it('uses 14 / 60 day boundaries', () => {
    expect(activityOf(daysAgo(14), NOW)).toBe('active');
    expect(activityOf(daysAgo(15), NOW)).toBe('dormant');
    expect(activityOf(daysAgo(60), NOW)).toBe('dormant');
    expect(activityOf(daysAgo(61), NOW)).toBe('stale');
    expect(activityOf(null, NOW)).toBe('unknown');
  });
});

describe('relativeTime', () => {
  it('formats calendar-day differences in Korean', () => {
    expect(relativeTime(daysAgo(0), NOW)).toBe('오늘');
    expect(relativeTime(daysAgo(1), NOW)).toBe('어제');
    expect(relativeTime(daysAgo(5), NOW)).toBe('5일 전');
    expect(relativeTime(daysAgo(65), NOW)).toBe('2달 전');
    expect(relativeTime(daysAgo(800), NOW)).toBe('2년 전');
    expect(relativeTime(null, NOW)).toBe('—');
  });
});

describe('relativeClock', () => {
  it('uses minutes and hours for recent times', () => {
    expect(relativeClock(new Date(NOW.getTime() - 20_000).toISOString(), NOW)).toBe('방금');
    expect(relativeClock(new Date(NOW.getTime() - 5 * 60_000).toISOString(), NOW)).toBe('5분 전');
    expect(relativeClock(new Date(NOW.getTime() - 3 * 3_600_000).toISOString(), NOW)).toBe('3시간 전');
    expect(relativeClock(daysAgo(3), NOW)).toBe('3일 전');
  });
});

describe('filter / sort / count', () => {
  const runtime: RuntimeSnapshot = {
    at: '',
    byProject: { beta: [{ pid: 1, pgid: 1, command: 'x', cwd: '', ports: [3000], launchedByHub: false }] },
  };
  const list = [
    project('alpha', { summary: { oneLiner: '책 학습 노트', whatItIs: 'x', features: [], structure: [], techOverview: '', techStack: [], currentState: '', nextSteps: [], runSuggestion: null } }, 1, 2),
    project('beta', { stack: ['FastAPI'] }, 30),
    project('gamma', {}, 200),
    project('plain', {}, null),
  ];

  it('filters by state, running and dirty', () => {
    const names = (f: Parameters<typeof filterProjects>[1]) => filterProjects(list, f, runtime, '', NOW).map((p) => p.name);
    expect(names('all')).toEqual(['alpha', 'beta', 'gamma', 'plain']);
    expect(names('running')).toEqual(['beta']);
    expect(names('active')).toEqual(['alpha']);
    expect(names('dormant')).toEqual(['beta']);
    expect(names('stale')).toEqual(['gamma']);
    expect(names('dirty')).toEqual(['alpha']);
  });

  it('searches name, one-liner and stack case-insensitively', () => {
    expect(filterProjects(list, 'all', runtime, '학습', NOW).map((p) => p.name)).toEqual(['alpha']);
    expect(filterProjects(list, 'all', runtime, 'fastapi', NOW).map((p) => p.name)).toEqual(['beta']);
  });

  it('sorts by recency with never-committed projects last', () => {
    expect(sortProjects([list[3], list[2], list[0], list[1]], 'recent').map((p) => p.name)).toEqual([
      'alpha',
      'beta',
      'gamma',
      'plain',
    ]);
    expect(sortProjects([list[2], list[0]], 'name').map((p) => p.name)).toEqual(['alpha', 'gamma']);
  });

  it('sorts by open issues + PRs', () => {
    const withIssues = project('zeta', {
      github: {
        url: '',
        openIssues: [{ number: 1, title: '', url: '', labels: [], createdAt: '', closedAt: null }],
        openPRs: [],
        recentlyClosedIssues: [],
        ci: { status: 'none' },
      },
    }, 100);
    expect(sortProjects([list[0], withIssues], 'issues')[0].name).toBe('zeta');
  });

  it('counts every filter', () => {
    expect(countFilters(list, runtime, NOW)).toEqual({ all: 4, running: 1, active: 1, dormant: 1, stale: 1, dirty: 1 });
  });

  it('falls back from one-liner to readme excerpt', () => {
    expect(displayLine(list[0])).toBe('책 학습 노트');
    expect(displayLine(project('x', { readmeExcerpt: 'README 발췌' }))).toBe('README 발췌');
    expect(displayLine(project('y'))).toBe('설명 없음');
  });
});

describe('oldest sort and dates', () => {
  it('sorts by oldest last commit, projects without commits last', () => {
    const l = [project('new', {}, 1), project('none', {}, null), project('old', {}, 300)];
    expect(sortProjects(l, 'oldest').map((p) => p.name)).toEqual(['old', 'new', 'none']);
  });
  it('formats an absolute date', () => {
    expect(formatDate('2026-10-05T23:30:00+09:00')).toBe('2026-10-05');
    expect(formatDate(null)).toBe('—');
  });
});
