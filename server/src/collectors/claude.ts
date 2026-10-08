import { tmpdir } from 'node:os';
import type { CommandRunner } from '../exec';

// claude -p 를 (기본은 도구 없이) 호출해 JSON 스키마에 맞는 결과(structured_output)를 받는다.
export async function callClaudeJson(
  run: CommandRunner,
  opts: { model: string; schema: object; prompt: string; timeoutMs: number; tools?: string[] },
): Promise<unknown> {
  const r = await run(
    'claude',
    [
      '-p',
      '--output-format', 'json',
      '--model', opts.model,
      // 도구는 기본적으로 주지 않는다. 지정하면 그 도구만 쓰고 묻지 않고 허용한다.
      ...(opts.tools?.length ? ['--tools', ...opts.tools, '--allowedTools', ...opts.tools] : ['--tools', '']),
      '--no-session-persistence',
      '--json-schema', JSON.stringify(opts.schema),
    ],
    { input: opts.prompt, timeoutMs: opts.timeoutMs, cwd: tmpdir() },
  );
  if (r.code !== 0) throw new Error(`claude 종료 코드 ${r.code}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);

  let payload: { is_error?: boolean; result?: unknown; structured_output?: unknown };
  try {
    payload = JSON.parse(r.stdout);
  } catch {
    throw new Error('claude 출력이 JSON이 아닙니다');
  }
  if (payload.is_error) throw new Error(`claude 오류: ${String(payload.result).slice(0, 300)}`);

  if (payload.structured_output !== undefined) return payload.structured_output;
  if (typeof payload.result === 'string') {
    try {
      return JSON.parse(payload.result);
    } catch {
      throw new Error('claude 결과가 JSON이 아닙니다');
    }
  }
  return undefined;
}
