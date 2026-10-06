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

// 실행기·인터프리터 토큰. 명령을 비교할 때 이것들은 빼고 "무엇을" 실행하는지만 본다.
const LAUNCHER_TOKENS = new Set(['uv', 'run', 'pnpm', 'npm', 'yarn', 'bun', 'npx', 'bunx', 'poetry', 'exec', 'node', 'tsx', 'python', 'python3', '-m']);

const basename = (t: string) => t.split('/').pop() ?? t;

// 같은 대상을 실행 중인지: 실행 명령의 의미 있는 토큰이 모두 프로세스 인자(또는 그 파일명)와 정확히 일치해야 한다.
export function runsSameTarget(processCommand: string, runCommand: string): boolean {
  const wanted = runCommand.trim().split(/\s+/).filter((t) => !LAUNCHER_TOKENS.has(t));
  if (wanted.length === 0) return false;
  const have = new Set(processCommand.trim().split(/\s+/).flatMap((t) => [t, basename(t)]));
  return wanted.every((t) => have.has(t) || have.has(basename(t)));
}

// 포트를 연 서버, 허브가 띄운 프로세스, 같은 대상을 돌리는 프로세스(봇 등)가 없으면 실행할 수 있다.
// 테스트 워처·REPL 같은 무관한 프로세스 때문에 실행 버튼이 사라지지 않게 한다.
export function canStart(processes: RuntimeProcess[], run?: { command: string } | null): boolean {
  return !processes.some((p) => p.launchedByHub || p.ports.length > 0 || (run ? runsSameTarget(p.command, run.command) : false));
}

// 실행 박스에 보일 명령. 절대 경로는 파일명만 남긴다(전체 명령은 툴팁으로).
export function shortenCommand(command: string): string {
  return command
    .trim()
    .split(/\s+/)
    .map((t) => (t.startsWith('/') ? (t.split('/').pop() ?? t) : t))
    .join(' ');
}
