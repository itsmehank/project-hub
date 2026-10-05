import type { CommandRunner, RunOptions, RunResult } from '../src/exec';

type Handler = (cmd: string, args: string[], opts?: RunOptions) => Partial<RunResult> | undefined;

export function fakeRunner(handler: Handler) {
  const calls: { cmd: string; args: string[]; opts?: RunOptions }[] = [];
  const run: CommandRunner = async (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const r = handler(cmd, args, opts);
    if (!r) return { code: 127, stdout: '', stderr: `unexpected command: ${cmd} ${args.join(' ')}` };
    return { code: 0, stdout: '', stderr: '', ...r };
  };
  return Object.assign(run, { calls });
}
