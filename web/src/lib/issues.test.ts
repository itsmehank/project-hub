import { describe, expect, it } from 'vitest';
import type { IssueDetail } from '@hub/shared';
import { collectLabels, filterIssues, sortIssues } from './issues';

const issue = (n: number, over: Partial<IssueDetail> = {}): IssueDetail => ({
  number: n,
  title: `이슈 ${n}`,
  url: `u${n}`,
  labels: [],
  createdAt: `2026-09-0${n}T00:00:00Z`,
  closedAt: null,
  author: 'me',
  comments: 0,
  updatedAt: `2026-09-0${n}T00:00:00Z`,
  body: '',
  ...over,
});

const list = [
  issue(1, { labels: ['bug'], comments: 5, body: 'DART 수집 실패' }),
  issue(2, { labels: ['bug', 'ui'], updatedAt: '2026-09-09T00:00:00Z' }),
  issue(3, { labels: ['ui'], title: '리포트 템플릿' }),
];

describe('filterIssues', () => {
  it('searches title, body and #number', () => {
    expect(filterIssues(list, { query: '리포트', labels: [] }).map((i) => i.number)).toEqual([3]);
    expect(filterIssues(list, { query: 'dart', labels: [] }).map((i) => i.number)).toEqual([1]);
    expect(filterIssues(list, { query: '#2', labels: [] }).map((i) => i.number)).toEqual([2]);
  });
  it('requires every selected label', () => {
    expect(filterIssues(list, { query: '', labels: ['bug'] }).map((i) => i.number)).toEqual([1, 2]);
    expect(filterIssues(list, { query: '', labels: ['bug', 'ui'] }).map((i) => i.number)).toEqual([2]);
  });
});

describe('sortIssues', () => {
  it('sorts by newest, oldest, comments and last update', () => {
    expect(sortIssues(list, 'newest').map((i) => i.number)).toEqual([3, 2, 1]);
    expect(sortIssues(list, 'oldest').map((i) => i.number)).toEqual([1, 2, 3]);
    expect(sortIssues(list, 'comments')[0].number).toBe(1);
    expect(sortIssues(list, 'updated')[0].number).toBe(2);
  });
});

describe('collectLabels', () => {
  it('counts labels, most used first', () => {
    expect(collectLabels(list)).toEqual([
      { label: 'bug', count: 2 },
      { label: 'ui', count: 2 },
    ]);
  });
});
