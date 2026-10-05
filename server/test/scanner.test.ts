import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffProjects, scanProjects } from '../src/scanner';

describe('scanProjects', () => {
  it('lists project directories and applies exclusion rules', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'hub-scan-'));
    for (const d of ['alpha', 'my project', '한글프로젝트', '.hidden', 'foo-worktrees', 'project-hub', 'node_modules']) {
      mkdirSync(path.join(root, d));
    }
    writeFileSync(path.join(root, 'notes.txt'), 'x');
    const found = await scanProjects(root, ['project-hub']);
    expect(found.map((f) => f.name)).toEqual(['alpha', 'my project', '한글프로젝트']);
    expect(found[1].path).toBe(path.join(root, 'my project'));
  });
});

describe('diffProjects', () => {
  it('splits names into added, removed and kept', () => {
    expect(diffProjects(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual({ added: ['d'], removed: ['a'], kept: ['b', 'c'] });
  });
});
