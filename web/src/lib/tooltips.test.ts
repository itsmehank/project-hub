import { describe, expect, it } from 'vitest';
import { FILTERS } from './status';
import { FILTER_TIPS, REFRESH_TIP } from './tooltips';

describe('tooltips', () => {
  it('explains every filter chip', () => {
    for (const f of FILTERS) expect(FILTER_TIPS[f].length).toBeGreaterThan(5);
    expect(FILTER_TIPS.active).toContain('14일');
    expect(FILTER_TIPS.dormant).toContain('15~60일');
    expect(FILTER_TIPS.stale).toContain('60일');
  });
  it('describes what refresh does, including shift-click', () => {
    expect(REFRESH_TIP.join(' ')).toContain('git fetch');
    expect(REFRESH_TIP.join(' ')).toContain('Shift');
  });
});
