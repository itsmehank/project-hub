import { describe, expect, it } from 'vitest';
import { EMPTY_PERSONAL, type Lifecycle, type Project } from '@hub/shared';
import { archivedCount, filterByTag, withLifecycle } from './lifecycle';

const p = (name: string, lifecycle: Lifecycle | null) => ({ name, personal: { ...EMPTY_PERSONAL, lifecycle } }) as Project;
const all = [p('a', 'focus'), p('b', null), p('c', 'archive'), p('d', 'experiment')];
const names = (xs: Project[]) => xs.map((x) => x.name);

describe('filterByTag', () => {
  it('hides archived projects under "all"', () => {
    expect(names(filterByTag(all, 'all'))).toEqual(['a', 'b', 'd']);
  });
  it('shows archived projects only under "archive"', () => {
    expect(names(filterByTag(all, 'archive'))).toEqual(['c']);
  });
  it('matches a single tag, and "none" means untagged', () => {
    expect(names(filterByTag(all, 'focus'))).toEqual(['a']);
    expect(names(filterByTag(all, 'none'))).toEqual(['b']);
  });
  it('counts archived projects', () => {
    expect(archivedCount(all)).toBe(1);
  });
});

describe('withLifecycle', () => {
  it('changes only the tag and keeps note and links', () => {
    const personal = { lifecycle: null, note: '메모', links: [{ label: 'x', url: 'https://x.dev' }], updatedAt: 't' };
    expect(withLifecycle(personal, 'experiment')).toEqual({ lifecycle: 'experiment', note: '메모', links: personal.links });
  });
});

describe('noteBlurAction', () => {
  it('saves a changed draft on blur and just closes an unchanged one', async () => {
    const { noteBlurAction } = await import('./lifecycle');
    expect(noteBlurAction('새 메모', '')).toBe('save');
    expect(noteBlurAction(' 그대로 ', '그대로')).toBe('close');
    expect(noteBlurAction('', '')).toBe('close');
  });
});

describe('applyPersonalPatch', () => {
  it('merges a patch into the latest cached personal data so quick edits compose', async () => {
    const { applyPersonalPatch } = await import('./lifecycle');
    const cache = { projects: [p('a', null), p('b', null)], lastRefreshAt: null, refreshing: false };
    const afterNote = applyPersonalPatch(cache, 'a', { note: '새 메모' });
    expect(afterNote.input).toEqual({ lifecycle: null, note: '새 메모', links: [] });
    const afterTag = applyPersonalPatch(afterNote.next, 'a', { lifecycle: 'focus' });
    expect(afterTag.input).toEqual({ lifecycle: 'focus', note: '새 메모', links: [] });
    expect(afterTag.next.projects[1]).toBe(cache.projects[1]);
  });
});
