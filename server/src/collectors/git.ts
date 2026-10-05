import { realpath } from 'node:fs/promises';
import type { Commit, GitInfo } from '@hub/shared';
import type { CommandRunner } from '../exec';

export const WEEKS = 26;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface GitCollectResult {
  git: GitInfo;
  remoteUrl: string | null;
}

export function parseLog(out: string): Commit[] {
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, at] = line.split('\x1f');
      return { hash, subject, at };
    });
}

export function bucketWeekly(isoDates: string[], now: Date): number[] {
  const weeks = new Array<number>(WEEKS).fill(0);
  for (const iso of isoDates) {
    const age = Math.max(0, now.getTime() - new Date(iso).getTime());
    const w = Math.floor(age / WEEK_MS);
    if (w < WEEKS) weeks[WEEKS - 1 - w] += 1;
  }
  return weeks;
}

export async function collectGit(dir: string, run: CommandRunner, now = new Date()): Promise<GitCollectResult | null> {
  const git = (args: string[]) => run('git', ['--no-optional-locks', ...args], { cwd: dir, timeoutMs: 10_000 });

  const top = await git(['rev-parse', '--show-toplevel']);
  if (top.code !== 0) return null;
  if ((await realpath(top.stdout.trim())) !== (await realpath(dir))) return null;

  const since = new Date(now.getTime() - WEEKS * WEEK_MS).toISOString();
  const [branchR, logR, statusR, upR, weeklyR, remoteR] = await Promise.all([
    git(['symbolic-ref', '--short', '-q', 'HEAD']),
    git(['log', '-n', '10', '--format=%H%x1f%s%x1f%cI']),
    git(['status', '--porcelain']),
    git(['rev-list', '--left-right', '--count', '@{u}...HEAD']),
    git(['log', `--since=${since}`, '--format=%cI']),
    git(['remote', 'get-url', 'origin']),
  ]);

  const recentCommits = logR.code === 0 ? parseLog(logR.stdout) : [];
  let hasUpstream = false;
  let behind = 0;
  let ahead = 0;
  if (upR.code === 0) {
    const [b, a] = upR.stdout.trim().split(/\s+/).map(Number);
    hasUpstream = true;
    behind = b || 0;
    ahead = a || 0;
  }

  return {
    git: {
      branch: branchR.code === 0 ? branchR.stdout.trim() : 'HEAD',
      lastCommitAt: recentCommits[0]?.at ?? null,
      dirtyCount: statusR.stdout.split('\n').filter(Boolean).length,
      hasUpstream,
      ahead,
      behind,
      recentCommits,
      weeklyCommits: bucketWeekly(weeklyR.code === 0 ? weeklyR.stdout.split('\n').filter(Boolean) : [], now),
    },
    remoteUrl: remoteR.code === 0 ? remoteR.stdout.trim() || null : null,
  };
}
