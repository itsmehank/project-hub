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

export async function collectGit(
  dir: string,
  run: CommandRunner,
  now = new Date(),
  opts: { fetch?: boolean } = {},
): Promise<GitCollectResult | null> {
  const git = (args: string[]) => run('git', ['--no-optional-locks', ...args], { cwd: dir, timeoutMs: 10_000 });

  const top = await git(['rev-parse', '--show-toplevel']);
  // code -1은 git을 실행하지 못했거나 시간 초과. "git 저장소 아님"과 구분해 오류로 올린다.
  if (top.code === -1) throw new Error(`git 실행 실패: ${top.stderr.trim()}`);
  if (top.code !== 0) return null;
  if ((await realpath(top.stdout.trim())) !== (await realpath(dir))) return null;

  // 앞섬/뒤처짐이 실제 원격 기준이 되도록 먼저 가져온다. 실패해도(오프라인 등) 수집은 계속한다.
  if (opts.fetch) {
    await run('git', ['fetch', '--quiet', '--no-tags', '--no-recurse-submodules'], {
      cwd: dir,
      timeoutMs: 15_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' },
    });
  }

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
