import { describe, expect, it } from 'vitest';
import { EMPTY_PERSONAL, type Decision, type Project } from '@hub/shared';
import { adoptedCandidateFor, changesSince, findDecision, groupDecisions, pendingCleanupFor, progressOf } from './decisions';

const cand = { project: 'a', pitch: '', targetUsers: '', monetization: '', readiness: 'high' as const, nextSteps: [] };
const d = (id: string, status: Decision['status'], kind: Decision['kind'], snapshot: Decision['snapshot'], updatedAt = '2026-10-06T00:00:00Z'): Decision =>
  ({ id, kind, status, reason: '', snapshot, projects: [], checklist: [], createdAt: updatedAt, updatedAt });

describe('decisions helpers', () => {
  const all = [
    d('candidate:a', 'adopted', 'candidate', cand),
    d('cleanup:a,b', 'adopted', 'cleanup', { projects: ['b', 'a'], suggestion: '', reason: '' }),
    d('idea:gone', 'held', 'idea', { title: '사라진 아이디어', pitch: '', leverages: [], firstStep: '' }),
    d('candidate:z', 'rejected', 'candidate', { ...cand, project: 'z' }),
  ];
  it('finds a decision for a suggestion by its id', () => {
    expect(findDecision(all, { kind: 'cleanup', snapshot: { projects: ['a', 'b'], suggestion: 'x', reason: 'y' } })?.id).toBe('cleanup:a,b');
    expect(findDecision(all, { kind: 'candidate', snapshot: { ...cand, project: 'q' } })).toBeUndefined();
  });
  it('groups by status regardless of the current analysis', () => {
    const g = groupDecisions(all);
    expect([g.adopted.length, g.held.length, g.rejected.length]).toEqual([2, 1, 1]);
    expect(g.held[0].id).toBe('idea:gone');
  });
  it('computes checklist progress', () => {
    expect(progressOf([{ id: '1', text: 'x', done: true }, { id: '2', text: 'y', done: false }])).toEqual({ done: 1, total: 2 });
  });
  it('finds the adopted candidate and pending cleanup for a project', () => {
    expect(adoptedCandidateFor(all, 'a')?.id).toBe('candidate:a');
    expect(adoptedCandidateFor(all, 'z')).toBeUndefined();
    expect(pendingCleanupFor(all, 'b')).toBe(true);
    expect(pendingCleanupFor(all, 'z')).toBe(false);
  });
  it('counts tag/note and decision changes after the analysis', () => {
    const p = (name: string, updatedAt: string | null) => ({ name, personal: { ...EMPTY_PERSONAL, updatedAt } }) as Project;
    const projects = [p('a', '2026-10-06T10:00:00Z'), p('b', '2026-10-05T00:00:00Z'), p('c', null)];
    const decisions = [d('x', 'held', 'idea', { title: 't', pitch: '', leverages: [], firstStep: '' }, '2026-10-06T11:00:00Z'), ...all];
    expect(changesSince(projects, decisions, '2026-10-06T09:00:00Z')).toBe(2);
    expect(changesSince(projects, decisions, null)).toBe(0);
  });
});
