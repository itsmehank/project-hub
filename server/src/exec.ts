import { spawn } from 'node:child_process';

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  input?: string;
  env?: NodeJS.ProcessEnv;
}
export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}
export type CommandRunner = (cmd: string, args: string[], opts?: RunOptions) => Promise<RunResult>;

// 절대 throw하지 않는다. 실행 실패/타임아웃은 code -1.
export const runCommand: CommandRunner = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    const finish = (r: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ code: -1, stdout, stderr: `${stderr}\n[timeout after ${timeoutMs}ms]` });
    }, timeoutMs);
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    child.on('error', (err) => finish({ code: -1, stdout, stderr: err.message }));
    child.on('close', (code) => finish({ code: code ?? -1, stdout, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(opts.input ?? '');
  });
