import { describe, expect, it } from 'vitest';
import { parseRoute, toHash } from './route';

describe('route', () => {
  it('parses home, project and issues routes', () => {
    expect(parseRoute('')).toEqual({ view: 'home' });
    expect(parseRoute('#/')).toEqual({ view: 'home' });
    expect(parseRoute('#/p/kr-by-claude')).toEqual({ view: 'project', name: 'kr-by-claude' });
    expect(parseRoute('#/p/kr-by-claude/issues')).toEqual({ view: 'issues', name: 'kr-by-claude' });
  });
  it('round-trips names with Korean, spaces and slashes-like characters', () => {
    for (const name of ['한글 프로젝트', 'my app', 'a#b%c']) {
      expect(parseRoute(toHash({ view: 'project', name }))).toEqual({ view: 'project', name });
      expect(parseRoute(toHash({ view: 'issues', name }))).toEqual({ view: 'issues', name });
    }
  });
  it('opens the detail page of a project named "issues"', () => {
    expect(parseRoute('#/p/issues')).toEqual({ view: 'project', name: 'issues' });
    expect(parseRoute('#/p/issues/issues/pr')).toEqual({ view: 'issues', name: 'issues', kind: 'pr' });
  });
  it('falls back to home for unknown or malformed hashes', () => {
    expect(parseRoute('#/nope')).toEqual({ view: 'home' });
    expect(parseRoute('#/p/')).toEqual({ view: 'home' });
    expect(parseRoute('#/p/%E0%A4%A')).toEqual({ view: 'home' });
  });
});

describe('issues tab in route', () => {
  it('carries the issues tab kind', () => {
    expect(parseRoute('#/p/a/issues/closed')).toEqual({ view: 'issues', name: 'a', kind: 'closed' });
    expect(parseRoute('#/p/a/issues/pr')).toEqual({ view: 'issues', name: 'a', kind: 'pr' });
    expect(toHash({ view: 'issues', name: 'a', kind: 'closed' })).toBe('#/p/a/issues/closed');
    expect(parseRoute('#/p/a/issues/bogus')).toEqual({ view: 'home' });
  });
});
