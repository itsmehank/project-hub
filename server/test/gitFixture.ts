import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCommand } from '../src/exec';

export async function git(dir: string, ...args: string[]): Promise<string> {
  const r = await runCommand('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir });
  if (r.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

export async function makeRepo(dir = mkdtempSync(path.join(tmpdir(), 'hub-git-'))): Promise<string> {
  await git(dir, 'init', '-q', '-b', 'main');
  return dir;
}

let counter = 0;
export async function commit(dir: string, message: string, isoDate?: string): Promise<void> {
  writeFileSync(path.join(dir, `f${counter++}.txt`), message);
  await git(dir, 'add', '-A');
  const env = isoDate ? { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate } : process.env;
  const r = await runCommand('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', message], {
    cwd: dir,
    env,
  });
  if (r.code !== 0) throw new Error(r.stderr);
}
