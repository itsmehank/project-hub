import type { Health } from '@hub/shared';
import type { CommandRunner } from './exec';

export async function checkHealth(run: CommandRunner): Promise<Health> {
  const [gh, claude, lsof] = await Promise.all([
    run('gh', ['auth', 'status', '--hostname', 'github.com'], { timeoutMs: 10_000 }),
    run('claude', ['--version'], { timeoutMs: 10_000 }),
    run('lsof', ['-p', String(process.pid)], { timeoutMs: 5_000 }),
  ]);
  const health: Health = { gh: gh.code === 0, claude: claude.code === 0, lsof: lsof.code === 0, messages: [] };
  if (!health.gh)
    health.messages.push('GitHub CLI가 github.com에 로그인되어 있지 않아 이슈·PR·CI를 건너뜁니다. `gh auth login --hostname github.com`을 실행하세요.');
  if (!health.claude) health.messages.push('claude CLI를 찾을 수 없어 프로젝트 요약을 건너뜁니다.');
  if (!health.lsof) health.messages.push('lsof를 실행할 수 없어 실행 상태를 감지하지 못합니다.');
  return health;
}
