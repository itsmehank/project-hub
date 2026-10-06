import { describe, expect, it } from 'vitest';
import { runCommand } from '../src/exec';

describe('runCommand', () => {
  it('captures stdout and exit code 0', async () => {
    const r = await runCommand('sh', ['-c', 'echo hello']);
    expect(r).toEqual({ code: 0, stdout: 'hello\n', stderr: '' });
  });
  it('returns non-zero exit codes without throwing', async () => {
    const r = await runCommand('sh', ['-c', 'echo oops >&2; exit 3']);
    expect(r.code).toBe(3);
    expect(r.stderr).toBe('oops\n');
  });
  it('returns code -1 for a missing binary', async () => {
    const r = await runCommand('definitely-not-a-binary-xyz', []);
    expect(r.code).toBe(-1);
    expect(r.stderr).toContain('ENOENT');
  });
  it('kills and reports timeouts', async () => {
    const started = Date.now();
    const r = await runCommand('sleep', ['5'], { timeoutMs: 200 });
    expect(r.code).toBe(-1);
    expect(r.stderr).toContain('timeout');
    expect(Date.now() - started).toBeLessThan(2000);
  });
  it('pipes input to stdin', async () => {
    const r = await runCommand('cat', [], { input: '한글 입력' });
    expect(r.stdout).toBe('한글 입력');
  });
  it('runs in the given cwd', async () => {
    const r = await runCommand('pwd', [], { cwd: '/tmp' });
    expect(r.stdout.trim()).toMatch(/\/tmp$/);
  });
});
