import { describe, expect, it } from 'vitest';
import type { Project } from '@hub/shared';
import { groupByRepo, repoKeyOf } from './repo';

const p = (name: string, githubRepo: string | null, remoteUrl: string | null = null) => ({ name, githubRepo, remoteUrl }) as Project;

describe('repoKeyOf', () => {
  it('prefers githubRepo, then remoteUrl, then the folder name', () => {
    expect(repoKeyOf(p('a', 'me/a', 'git@github.com:me/a.git'))).toBe('me/a');
    expect(repoKeyOf(p('b', null, 'ssh://host/b.git'))).toBe('ssh://host/b.git');
    expect(repoKeyOf(p('c', null))).toBe('local:c');
  });
});

describe('groupByRepo', () => {
  it('groups folders of the same repository, representative first by name', () => {
    const groups = groupByRepo([p('DataBatcher-main', 'me/db'), p('solo', null), p('DataBatcher', 'me/db')]);
    expect(groups.map((g) => g.map((x) => x.name))).toEqual([['DataBatcher', 'DataBatcher-main'], ['solo']]);
  });
});
