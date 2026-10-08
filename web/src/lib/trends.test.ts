import { describe, expect, it } from 'vitest';
import type { TrendItem } from '@hub/shared';
import { filterItems, trendDateLabel } from './trends';

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
