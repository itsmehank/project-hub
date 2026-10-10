import { describe, expect, it } from 'vitest';
import { EMPTY_PERSONAL, type Lifecycle, type Project } from '@hub/shared';
import { dailyTotals, dayLabel, heatmapGrid } from './heatmap';

const NOW = new Date(2026, 9, 6, 12, 0); // 2026-10-06(화) 로컬
const days = (last: number[]) => [...new Array(182 - last.length).fill(0), ...last];
const p = (name: string, o: { daily?: number[]; until?: string; repo?: string; lifecycle?: Lifecycle } = {}) =>
  ({
    name,
    githubRepo: o.repo ?? null,
    remoteUrl: null,
    git: o.daily ? { dailyCommits: o.daily, dailyUntil: o.until ?? '2026-10-06' } : { weeklyCommits: [] },
    personal: { ...EMPTY_PERSONAL, lifecycle: o.lifecycle ?? null },
  }) as unknown as Project;

describe('dailyTotals', () => {
  it('sums projects per day, ending today', () => {
    const t = dailyTotals([p('a', { daily: days([1, 2]) }), p('b', { daily: days([0, 3]) })], NOW);
    expect(t).toHaveLength(182);
    expect(t.at(-1)).toEqual({ date: '2026-10-06', count: 5 });
    expect(t.at(-2)).toEqual({ date: '2026-10-05', count: 1 });
    expect(t[0].date).toBe('2026-04-08');
  });
  it('shifts data collected on an earlier day so dates line up and today is empty', () => {
    const t = dailyTotals([p('a', { daily: days([4]), until: '2026-10-05' })], NOW);
    expect(t.at(-1)).toEqual({ date: '2026-10-06', count: 0 });
    expect(t.at(-2)).toEqual({ date: '2026-10-05', count: 4 });
  });
  it('counts a repository once and excludes archived projects', () => {
    const t = dailyTotals(
      [p('DataBatcher', { daily: days([2]), repo: 'me/db' }), p('DataBatcher-main', { daily: days([2]), repo: 'me/db' }), p('old', { daily: days([9]), lifecycle: 'archive' })],
      NOW,
    );
    expect(t.at(-1)?.count).toBe(2);
  });
  it('returns nothing when no project has daily data yet', () => {
    expect(dailyTotals([p('a')], NOW)).toEqual([]);
  });
});

describe('heatmapGrid', () => {
  it('starts columns on Monday, pads out-of-range cells, and assigns levels', () => {
    const t = dailyTotals([p('a', { daily: days([0, 1, 4, 8]) })], NOW);
    const g = heatmapGrid(t);
    // 2026-04-08은 수요일 → 첫 열의 월·화는 빈칸
    expect(g.weeks[0][0]).toBeNull();
    expect(g.weeks[0][1]).toBeNull();
    expect(g.weeks[0][2]?.date).toBe('2026-04-08');
    const last = g.weeks.at(-1)!;
    expect(last[1]).toMatchObject({ date: '2026-10-06', count: 8, level: 4 }); // 화요일
    expect(last[2]).toBeNull();
    expect(last[0]).toMatchObject({ date: '2026-10-05', count: 4, level: 2 });
    expect(g.weeks.at(-2)![6]).toMatchObject({ date: '2026-10-04', count: 1, level: 1 });
    expect(g.weeks.flat().filter((c) => c && c.count === 0).every((c) => c!.level === 0)).toBe(true);
  });
  it('labels the first column of each month, across a year end', () => {
    const now = new Date(2027, 0, 2, 12, 0);
    const t = dailyTotals([p('a', { daily: days([1]), until: '2027-01-02' })], now);
    const g = heatmapGrid(t);
    expect(g.monthLabels).toHaveLength(g.weeks.length);
    expect(g.monthLabels.filter(Boolean).slice(-2)).toEqual(['12월', '1월']);
  });
});

describe('dayLabel', () => {
  it('shows month/day and weekday', () => {
    expect(dayLabel('2026-10-06')).toBe('10/6(화)');
    expect(dayLabel('2027-01-03')).toBe('1/3(일)');
  });
});
