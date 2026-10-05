import { describe, expect, it } from 'vitest';
import type { StoredProject, Summary } from '@hub/shared';
import { openDb } from '../src/db';

const project = (name: string): StoredProject => ({
  name,
  path: `/root/${name}`,
  isGit: true,
  remoteUrl: null,
  githubRepo: null,
  stack: ['Node'],
  readmeExcerpt: null,
  git: null,
  github: null,
  errors: {},
  updatedAt: '2026-10-05T00:00:00.000Z',
});

const summary: Summary = {
  oneLiner: 'x',
  whatItIs: 'y',
  features: [],
  structure: [],
  currentState: '',
  nextSteps: [],
  runSuggestion: null,
};

describe('openDb', () => {
  it('round-trips projects sorted by name', () => {
    const db = openDb(':memory:');
    db.upsertProject(project('b'));
    db.upsertProject(project('a'));
    db.upsertProject({ ...project('a'), stack: ['Python'] });
    expect(db.listProjects().map((p) => p.name)).toEqual(['a', 'b']);
    expect(db.getProject('a')?.stack).toEqual(['Python']);
    expect(db.getProject('zzz')).toBeNull();
  });

  it('stores summaries, run configs and launches', () => {
    const db = openDb(':memory:');
    db.putSummary('a', 'hash1', summary);
    expect(db.getSummary('a')).toMatchObject({ sourceHash: 'hash1', content: summary });
    db.putRunConfig('a', { command: 'pnpm dev', cwd: '.', expectedPort: 5173, source: 'user' });
    expect(db.getRunConfig('a')).toEqual({ command: 'pnpm dev', cwd: '.', expectedPort: 5173, source: 'user' });
    db.putLaunch({ name: 'a', pid: 10, pgid: 10, command: 'pnpm dev', startedAt: 't', logPath: '/l' });
    expect(db.listLaunches()).toHaveLength(1);
    db.deleteLaunch('a');
    expect(db.getLaunch('a')).toBeNull();
  });

  it('deleteProject removes every row for that project', () => {
    const db = openDb(':memory:');
    db.upsertProject(project('a'));
    db.putSummary('a', 'h', summary);
    db.putRunConfig('a', { command: 'x', cwd: '.', expectedPort: null, source: 'approved' });
    db.putLaunch({ name: 'a', pid: 1, pgid: 1, command: 'x', startedAt: 't', logPath: '/l' });
    db.deleteProject('a');
    expect(db.getProject('a')).toBeNull();
    expect(db.getSummary('a')).toBeNull();
    expect(db.getRunConfig('a')).toBeNull();
    expect(db.getLaunch('a')).toBeNull();
  });

  it('stores meta values', () => {
    const db = openDb(':memory:');
    expect(db.getMeta('lastRefreshAt')).toBeNull();
    db.setMeta('lastRefreshAt', '2026-10-05');
    db.setMeta('lastRefreshAt', '2026-10-06');
    expect(db.getMeta('lastRefreshAt')).toBe('2026-10-06');
  });
});
