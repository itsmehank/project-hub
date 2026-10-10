import { describe, expect, it } from 'vitest';
import type { TrendDigest, TrendItem } from '@hub/shared';
import { filterItems, isHttpUrl, mergeDigests, trendDateLabel } from './trends';

describe('trends helpers', () => {
  const now = new Date(2026, 9, 8, 9, 0);
  it('labels today, yesterday and older dates with weekday', () => {
    expect(trendDateLabel('2026-10-08', now)).toBe('오늘');
    expect(trendDateLabel('2026-10-07', now)).toBe('어제');
    expect(trendDateLabel('2026-10-05', now)).toBe('10/5(월)');
  });
  it('filters items by category', () => {
    const items = [{ category: 'ai' }, { category: 'life' }] as TrendItem[];
    expect(filterItems(items, 'all')).toHaveLength(2);
    expect(filterItems(items, 'life').map((i) => i.category)).toEqual(['life']);
  });
});

describe('isHttpUrl', () => {
  it('accepts only http(s)', () => {
    expect(isHttpUrl('https://a.com/x')).toBe(true);
    expect(isHttpUrl('HTTP://a.com')).toBe(true);
    for (const u of ['javascript:alert(1)', 'data:text/html,x', 'ftp://a.com', 'garbage', '']) expect(isHttpUrl(u)).toBe(false);
  });
});

describe('mergeDigests', () => {
  const d = (date: string, n: number) => ({ date, items: new Array(n) }) as unknown as TrendDigest;
  it('first page wins on duplicate dates and result is date-desc', () => {
    const r = mergeDigests([d('2026-10-08', 1), d('2026-10-07', 2)], [d('2026-10-07', 9), d('2026-10-05', 3), d('2026-10-06', 4)]);
    expect(r.map((x) => x.date)).toEqual(['2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05']);
    expect(r[1].items).toHaveLength(2);
  });
});
