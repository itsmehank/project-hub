import { describe, expect, it } from 'vitest';
import { isCollapseShortcut, readCollapsed, writeCollapsed } from './listPanel';

const key = (k: string, o: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; repeat: boolean }> = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...o,
});

describe('listPanel', () => {
  it('reads and writes the collapsed state, defaulting to open on errors', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readCollapsed(() => storage)).toBe(false);
    writeCollapsed(() => storage, true);
    expect(readCollapsed(() => storage)).toBe(true);
    expect(readCollapsed(() => null)).toBe(false);
    expect(readCollapsed(() => ({ getItem: () => { throw new Error('blocked'); } }))).toBe(false);
    const boom = () => { throw new Error('SecurityError'); };
    expect(readCollapsed(boom)).toBe(false);
    expect(() => writeCollapsed(boom, true)).not.toThrow();
    expect(() => writeCollapsed(() => ({ setItem: () => { throw new Error('blocked'); } }), true)).not.toThrow();
  });
  it('ignores key repeat', () => {
    expect(isCollapseShortcut(key('b', { metaKey: true, repeat: true }))).toBe(false);
  });
  it('recognizes Cmd+B and Ctrl+B only', () => {
    expect(isCollapseShortcut(key('b', { metaKey: true }))).toBe(true);
    expect(isCollapseShortcut(key('B', { ctrlKey: true }))).toBe(true);
    expect(isCollapseShortcut(key('b'))).toBe(false);
    expect(isCollapseShortcut(key('b', { metaKey: true, shiftKey: true }))).toBe(false);
    expect(isCollapseShortcut(key('k', { metaKey: true }))).toBe(false);
  });
});
