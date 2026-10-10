import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, toLocalDate } from './index';

describe('dates', () => {
  it('formats local dates and counts days across month and year ends', () => {
    expect(toLocalDate(new Date(2026, 9, 6, 23, 59))).toBe('2026-10-06');
    expect(toLocalDate(new Date(2027, 0, 1, 0, 0))).toBe('2027-01-01');
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(daysBetween('2026-10-06', '2026-10-06')).toBe(0);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
