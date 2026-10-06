import { readdir } from 'node:fs/promises';
import path from 'node:path';

export interface FoundProject {
  name: string;
  path: string;
}

export function isExcluded(name: string, exclude: string[]): boolean {
  return name.startsWith('.') || name.endsWith('-worktrees') || name === 'node_modules' || exclude.includes(name);
}

export async function scanProjects(root: string, exclude: string[] = []): Promise<FoundProject[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !isExcluded(e.name, exclude))
    .map((e) => ({ name: e.name, path: path.join(root, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

export function diffProjects(existing: string[], found: string[]) {
  const e = new Set(existing);
  const f = new Set(found);
  return {
    added: found.filter((n) => !e.has(n)),
    removed: existing.filter((n) => !f.has(n)),
    kept: found.filter((n) => e.has(n)),
  };
}
