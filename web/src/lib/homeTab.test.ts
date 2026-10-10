import { describe, expect, it } from 'vitest';
import { HOME_TABS, nextTab, readHomeTab, writeHomeTab } from './homeTab';

describe('homeTab', () => {
  it('reads and writes the last tab, defaulting to status', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readHomeTab(() => storage)).toBe('status');
    writeHomeTab(() => storage, 'ideas');
    expect(readHomeTab(() => storage)).toBe('ideas');
  });
  it('falls back to status on unknown values and blocked storage', () => {
    expect(readHomeTab(() => ({ getItem: () => 'nope' }))).toBe('status');
    expect(readHomeTab(() => null)).toBe('status');
    const boom = () => { throw new Error('SecurityError'); };
    expect(readHomeTab(boom)).toBe('status');
    expect(readHomeTab(() => ({ getItem: () => { throw new Error('blocked'); } }))).toBe('status');
    expect(() => writeHomeTab(boom, 'trends')).not.toThrow();
    expect(() => writeHomeTab(() => ({ setItem: () => { throw new Error('blocked'); } }), 'trends')).not.toThrow();
  });
  it('moves with arrow keys and wraps around', () => {
    expect(HOME_TABS[0]).toBe('status');
    expect(nextTab('status', 'ArrowRight')).toBe('candidates');
    expect(nextTab('status', 'ArrowLeft')).toBe('trends');
    expect(nextTab('trends', 'ArrowRight')).toBe('status');
    expect(nextTab('cleanup', 'Home')).toBe('status');
    expect(nextTab('cleanup', 'End')).toBe('trends');
    expect(nextTab('cleanup', 'Enter')).toBeNull();
  });
});
