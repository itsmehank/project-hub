import { describe, expect, it } from 'vitest';
import { resolveEditor } from '../src/editor';

const has = (...apps: string[]) => (name: string) => apps.includes(name);

describe('resolveEditor', () => {
  it('prefers PyCharm for Python projects and IntelliJ IDEA otherwise', () => {
    expect(resolveEditor(['Python', 'FastAPI'], has('PyCharm', 'IntelliJ IDEA'))).toBe('PyCharm');
    expect(resolveEditor(['Node', 'React'], has('PyCharm', 'IntelliJ IDEA'))).toBe('IntelliJ IDEA');
  });
  it('falls back to VS Code, then Finder', () => {
    expect(resolveEditor(['Node'], has('Visual Studio Code'))).toBe('Visual Studio Code');
    expect(resolveEditor(['Node'], has())).toBeNull();
  });
  it('uses HUB_EDITOR when set and installed', () => {
    expect(resolveEditor(['Python'], has('PyCharm', 'Cursor'), 'Cursor')).toBe('Cursor');
  });
});
