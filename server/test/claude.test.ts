import { describe, expect, it } from 'vitest';
import { callClaudeJson } from '../src/collectors/claude';
import { fakeRunner } from './fakeRunner';

const ok = () => ({ stdout: JSON.stringify({ structured_output: { a: 1 } }) });
const base = { model: 'm', schema: {}, prompt: 'p', timeoutMs: 1000 };

describe('callClaudeJson MCP isolation', () => {
  it('adds --strict-mcp-config and --permission-mode default without tools', async () => {
    const run = fakeRunner(ok);
    await callClaudeJson(run, base);
    const a = run.calls[0].args;
    expect(a).toContain('--strict-mcp-config');
    const i = a.indexOf('--permission-mode');
    expect(a.slice(i, i + 2)).toEqual(['--permission-mode', 'default']);
    const t = a.indexOf('--tools');
    expect(a.slice(t, t + 2)).toEqual(['--tools', '']);
  });
  it('keeps tools adjacent to allowedTools and still isolates MCP', async () => {
    const run = fakeRunner(ok);
    await callClaudeJson(run, { ...base, tools: ['WebSearch', 'WebFetch'] });
    const a = run.calls[0].args;
    expect(a).toContain('--strict-mcp-config');
    const i = a.indexOf('--permission-mode');
    expect(a.slice(i, i + 2)).toEqual(['--permission-mode', 'default']);
    const t = a.indexOf('--tools');
    expect(a.slice(t, t + 6)).toEqual(['--tools', 'WebSearch', 'WebFetch', '--allowedTools', 'WebSearch', 'WebFetch']);
  });
});
