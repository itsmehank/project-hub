import { describe, expect, it } from 'vitest';
import { EMPTY_PERSONAL, type Commit, type Item, type Lifecycle, type Project } from '@hub/shared';
import { weekRange, weeklyReview } from './weekly';

const local = (s: string) => new Date(s); // 'YYYY-MM-DDTHH:mm' without Z = local time

describe('weekRange', () => {
  it('starts on Monday 00:00 local and ends the next Monday', () => {
    const r = weekRange(local('2026-10-08T15:00'), 0); // Thursday
    expect(r.start).toEqual(local('2026-10-05T00:00'));
    expect(r.end).toEqual(local('2026-10-12T00:00'));
    expect(r.label).toBe('10/5–10/11');
  });
  it('treats Sunday 23:59 as the end of the week and Monday 00:00 as a new week', () => {
    expect(weekRange(local('2026-10-11T23:59'), 0).start).toEqual(local('2026-10-05T00:00'));
    expect(weekRange(local('2026-10-12T00:00'), 0).start).toEqual(local('2026-10-12T00:00'));
  });
  it('moves back by whole weeks across month and year ends', () => {
    expect(weekRange(local('2026-10-08T12:00'), -1).label).toBe('9/28–10/4');
    expect(weekRange(local('2026-10-08T12:00'), -2).label).toBe('9/21–9/27');
    const ny = weekRange(local('2027-01-02T12:00'), 0); // Saturday
    expect(ny.start).toEqual(local('2026-12-28T00:00'));
    expect(ny.label).toBe('12/28–1/3');
  });
});

const NOW = local('2026-10-08T12:00');
const c = (hash: string, at: string, subject = hash): Commit => ({ hash, subject, at: local(at).toISOString() });
const item = (number: number, closedAt: string): Item => ({ number, title: '', url: '', labels: [], createdAt: '', closedAt: local(closedAt).toISOString() });

function p(
  name: string,
  o: { repo?: string; commits?: Commit[]; since?: string; closed?: Item[]; merged?: Item[]; dirty?: number; lifecycle?: Lifecycle; note?: string; next?: string; noWindow?: boolean; truncated?: boolean } = {},
): Project {
  return {
    name,
    isGit: true,
    githubRepo: o.repo ?? null,
    remoteUrl: null,
    git: {
      branch: 'main', lastCommitAt: null, dirtyCount: o.dirty ?? 0, hasUpstream: true, ahead: 0, behind: 0, recentCommits: [], weeklyCommits: [],
      ...(o.noWindow ? {} : { windowCommits: o.commits ?? [], windowSince: local(o.since ?? '2026-09-08T00:00').toISOString(), windowTruncated: o.truncated ?? false }),
    },
    github: o.closed || o.merged ? { url: '', openIssues: [], openPRs: [], recentlyClosedIssues: o.closed ?? [], recentlyMergedPRs: o.merged ?? [], ci: { status: 'none' } } : null,
    summary: o.next ? ({ nextSteps: [o.next] } as Project['summary']) : null,
    personal: { ...EMPTY_PERSONAL, lifecycle: o.lifecycle ?? null, note: o.note ?? '' },
  } as Project;
}

const week = weekRange(NOW, 0); // 10/5–10/11
const prev = weekRange(NOW, -1); // 9/28–10/4

describe('weeklyReview', () => {
  it('counts commits in the week, compares with the previous week, and dedupes the same repository', () => {
    const shared = [c('a1', '2026-10-06T10:00', '기능 추가'), c('a2', '2026-10-05T09:00'), c('a0', '2026-09-30T09:00')];
    const r = weeklyReview(
      [p('DataBatcher', { repo: 'me/db', commits: shared }), p('DataBatcher-main', { repo: 'me/db', commits: shared }), p('solo', { commits: [c('s1', '2026-10-07T09:00')] })],
      week,
      prev,
    );
    expect(r.commits).toBe(3);
    expect(r.prevCommits).toBe(1);
    expect(r.changePct).toBe(200);
    expect(r.touched).toBe(2);
    expect(r.rows[0]).toMatchObject({ name: 'DataBatcher', members: ['DataBatcher-main'], commits: 2, subjects: ['기능 추가', 'a2'] });
  });
  it('dedupes closed issues and merged PRs by repository and number', () => {
    const closed = [item(1, '2026-10-06T00:00'), item(2, '2026-09-29T00:00')];
    const merged = [item(7, '2026-10-07T00:00')];
    const r = weeklyReview([p('db', { repo: 'me/db', closed, merged }), p('db2', { repo: 'me/db', closed, merged })], week, prev);
    expect(r).toMatchObject({ closedIssues: 1, mergedPRs: 1 });
    expect(r.rows).toEqual([expect.objectContaining({ name: 'db', commits: 0, closedIssues: 1, mergedPRs: 1 })]);
  });
  it('says "not comparable" when the previous week starts before the collected window', () => {
    const r = weeklyReview([p('a', { commits: [c('x', '2026-09-23T09:00')], since: '2026-09-25T00:00' })], weekRange(NOW, -1), weekRange(NOW, -2));
    expect(r.prevCommits).toBeNull();
    expect(r.changePct).toBeNull();
  });
  it('compares two weeks ago with three weeks ago when the window covers it', () => {
    const r = weeklyReview([p('a', { commits: [c('x', '2026-09-22T09:00'), c('y', '2026-09-15T09:00'), c('z', '2026-09-16T09:00')], since: '2026-09-08T00:00' })], weekRange(NOW, -2), weekRange(NOW, -3));
    expect(r).toMatchObject({ commits: 1, prevCommits: 2, changePct: -50 });
  });
  it('flags missing data from refreshes before the window was collected', () => {
    expect(weeklyReview([p('old', { noWindow: true })], week, prev).missingData).toBe(true);
    expect(weeklyReview([p('new')], week, prev).missingData).toBe(false);
  });
  it('flags partial counts when a repository was truncated', () => {
    const r = weeklyReview([p('big', { commits: [c('x', '2026-10-06T09:00')], truncated: true })], week, prev);
    expect(r.partial).toBe(true);
    expect(r.rows[0].partial).toBe(true);
  });
  it('orders continue candidates focus → commits → note, excludes archive, max 5', () => {
    const r = weeklyReview(
      [
        p('noted', { note: '배포하기' }),
        p('busy', { commits: [c('b1', '2026-10-06T09:00'), c('b2', '2026-10-06T10:00')] }),
        p('little', { commits: [c('l1', '2026-10-06T09:00')], next: '테스트 추가' }),
        p('focus', { lifecycle: 'focus' }),
        p('gone', { lifecycle: 'archive', note: 'x', commits: [c('g1', '2026-10-06T09:00')] }),
        p('n2', { note: 'a' }),
        p('n3', { note: 'b' }),
      ],
      week,
      prev,
    );
    expect(r.continueList.map((x) => x.name)).toEqual(['focus', 'busy', 'little', 'n2', 'n3']);
    expect(r.continueList[2]).toMatchObject({ reason: 'commits', nextStep: '테스트 추가' });
  });
  it('lists current uncommitted changes', () => {
    expect(weeklyReview([p('a', { dirty: 3 }), p('b')], week, prev).dirty).toEqual([{ name: 'a', dirty: 3 }]);
  });
});
