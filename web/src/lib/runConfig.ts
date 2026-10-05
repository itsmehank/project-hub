import type { Project, RunSuggestion, RuntimeProcess } from '@hub/shared';

export interface ResolvedRun extends RunSuggestion {
  source: 'user' | 'approved' | 'suggested';
}

export function resolveRun(p: Project): ResolvedRun | null {
  if (p.runConfig) return p.runConfig;
  const s = p.summary?.runSuggestion;
  return s ? { ...s, source: 'suggested' } : null;
}

export const openUrl = (port: number) => `http://localhost:${port}`;

// 포트를 연 서버, 허브가 띄운 프로세스, 같은 명령을 돌리는 프로세스(봇 등)가 없으면 실행할 수 있다.
// 테스트 워처·REPL 같은 무관한 프로세스 때문에 실행 버튼이 사라지지 않게 한다.
export function canStart(processes: RuntimeProcess[], run?: { command: string } | null): boolean {
  // 인터프리터 경로는 달라도(python vs /opt/.../Python) 인자 부분이 같으면 같은 대상으로 본다.
  const args = run?.command.trim().split(/\s+/).slice(1).join(' ') ?? '';
  return !processes.some((p) => p.launchedByHub || p.ports.length > 0 || (args !== '' && p.command.includes(args)));
}
