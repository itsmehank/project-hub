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
  structure: [], techOverview: '', techStack: [],
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
    db.putPersonal('a', { lifecycle: 'archive', note: 'n', links: [] });
    db.deleteProject('a');
    expect(db.getPersonal('a').updatedAt).toBeNull();
    expect(db.getProject('a')).toBeNull();
    expect(db.getSummary('a')).toBeNull();
    expect(db.getRunConfig('a')).toBeNull();
    expect(db.getLaunch('a')).toBeNull();
  });

  it('stores personal data and returns an empty default', () => {
    const db = openDb(':memory:');
    expect(db.getPersonal('a')).toEqual({ lifecycle: null, note: '', links: [], updatedAt: null });
    const saved = db.putPersonal('a', { lifecycle: 'focus', note: '메모', links: [{ label: '운영', url: 'https://x.dev' }] });
    expect(saved.updatedAt).toEqual(expect.any(String));
    expect(db.getPersonal('a')).toEqual(saved);
    db.putPersonal('a', { lifecycle: null, note: '', links: [] });
    expect(db.getPersonal('a')).toMatchObject({ lifecycle: null, note: '', links: [] });
  });

  it('stores meta values', () => {
    const db = openDb(':memory:');
    expect(db.getMeta('lastRefreshAt')).toBeNull();
    db.setMeta('lastRefreshAt', '2026-10-05');
    db.setMeta('lastRefreshAt', '2026-10-06');
    expect(db.getMeta('lastRefreshAt')).toBe('2026-10-06');
  });
});

describe('decisions', () => {
  const candidate = { project: 'a', pitch: 'p', targetUsers: 't', monetization: 'm', readiness: 'high' as const, nextSteps: ['도메인 연결', '약관 작성'] };
  const input = (status: 'adopted' | 'held' | 'rejected') => ({ kind: 'candidate' as const, status, reason: '', snapshot: candidate, projects: ['a'] });

  it('creates a checklist from nextSteps when a candidate is adopted, and keeps it afterwards', () => {
    const db = openDb(':memory:');
    expect(db.putDecision('candidate:a', input('held')).checklist).toEqual([]);
    const adopted = db.putDecision('candidate:a', input('adopted'));
    expect(adopted.checklist.map((c) => [c.text, c.done])).toEqual([['도메인 연결', false], ['약관 작성', false]]);
    db.putChecklist('candidate:a', [{ ...adopted.checklist[0], done: true }]);
    db.putDecision('candidate:a', input('held'));
    expect(db.putDecision('candidate:a', input('adopted')).checklist).toEqual([{ ...adopted.checklist[0], done: true }]);
    expect(db.getDecision('candidate:a')?.createdAt).toBe(adopted.createdAt);
  });
  it('does not create checklists for other kinds', () => {
    const db = openDb(':memory:');
    const d = db.putDecision('cleanup:a', { kind: 'cleanup', status: 'adopted', reason: '', snapshot: { projects: ['a'], suggestion: 's', reason: 'r' }, projects: ['a'] });
    expect(d.checklist).toEqual([]);
  });
  it('lists, deletes, and survives project deletion', () => {
    const db = openDb(':memory:');
    db.putDecision('candidate:a', input('rejected'));
    db.deleteProject('a');
    expect(db.listDecisions().map((d) => d.id)).toEqual(['candidate:a']);
    expect(db.deleteDecision('candidate:a')).toBe(true);
    expect(db.deleteDecision('candidate:a')).toBe(false);
    expect(db.putChecklist('candidate:a', [])).toBeNull();
  });
});
