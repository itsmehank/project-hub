import { describe, expect, it } from 'vitest';
import type { Summary } from '@hub/shared';
import { buildSummaryPrompt, computeSourceHash, generateSummary, sanitizeRunSuggestion, type SummaryContext } from '../src/collectors/summary';
import { fakeRunner } from './fakeRunner';

const ctx: SummaryContext = {
  name: 'movie-sniper',
  docs: { readme: '# Movie Sniper\n예매 감시', claudeMd: '규칙', manifests: { 'pyproject.toml': '[project]' }, extraDocs: {}, docMtimes: [1] },
  tree: 'scripts/\n  server.py',
  commits: [{ hash: 'abc', subject: 'feat: 알림', at: '2026-10-01T10:00:00+09:00' }],
};

const summary: Summary = {
  oneLiner: '영화 예매 감시 봇',
  whatItIs: '예매 페이지를 감시합니다.',
  features: ['감시'],
  structure: [{ path: 'scripts/', role: '서버' }], techOverview: '', techStack: [],
  currentState: '안정화',
  nextSteps: [],
  runSuggestion: { command: 'uv run python scripts/server.py --port 8010', cwd: '.', expectedPort: 8010 },
};

const claudeOk = (payload: unknown) =>
  fakeRunner((cmd) => (cmd === 'claude' ? { stdout: JSON.stringify(payload) } : undefined));

describe('computeSourceHash', () => {
  it('is stable and changes with inputs', () => {
    const a = computeSourceHash({ head: 'abc', dirty: false, docMtimes: [1, 2] });
    expect(computeSourceHash({ head: 'abc', dirty: false, docMtimes: [1, 2] })).toBe(a);
    expect(computeSourceHash({ head: 'abc', dirty: true, docMtimes: [1, 2] })).not.toBe(a);
    expect(computeSourceHash({ head: 'abd', dirty: false, docMtimes: [1, 2] })).not.toBe(a);
  });
});

describe('buildSummaryPrompt', () => {
  it('includes all sources and truncates huge docs', () => {
    const prompt = buildSummaryPrompt({ ...ctx, docs: { ...ctx.docs, readme: '가'.repeat(20_000) } });
    expect(prompt).toContain('"movie-sniper"');
    expect(prompt).toContain('scripts/\n  server.py');
    expect(prompt).toContain('2026-10-01 feat: 알림');
    expect(prompt).toContain('## CLAUDE.md\n규칙');
    expect(prompt).toContain('## pyproject.toml');
    expect(prompt).toContain('…(생략)');
    expect(prompt.length).toBeLessThan(15_000);
  });
});

describe('generateSummary', () => {
  it('passes the schema and prompt to claude and returns structured_output', async () => {
    const run = claudeOk({ is_error: false, result: '', structured_output: summary });
    expect(await generateSummary(ctx, run, { model: 'sonnet' })).toEqual(summary);
    const call = run.calls[0];
    expect(call.args).toEqual(expect.arrayContaining(['-p', '--output-format', 'json', '--model', 'sonnet', '--no-session-persistence']));
    expect(call.args[call.args.indexOf('--tools') + 1]).toBe('');
    expect(JSON.parse(call.args[call.args.indexOf('--json-schema') + 1]).required).toContain('oneLiner');
    expect(call.opts?.input).toContain('movie-sniper');
    expect(call.opts?.timeoutMs).toBe(90_000);
  });

  it('falls back to parsing the result string', async () => {
    const run = claudeOk({ is_error: false, result: JSON.stringify(summary) });
    expect((await generateSummary(ctx, run, { model: 'sonnet' })).oneLiner).toBe('영화 예매 감시 봇');
  });

  it('throws on is_error, non-JSON output, non-zero exit and schema mismatch', async () => {
    await expect(generateSummary(ctx, claudeOk({ is_error: true, result: 'quota' }), { model: 's' })).rejects.toThrow(/quota/);
    await expect(
      generateSummary(ctx, fakeRunner(() => ({ stdout: 'not json' })), { model: 's' }),
    ).rejects.toThrow(/JSON/);
    await expect(
      generateSummary(ctx, fakeRunner(() => ({ code: 1, stderr: 'boom' })), { model: 's' }),
    ).rejects.toThrow(/boom/);
    await expect(
      generateSummary(ctx, claudeOk({ is_error: false, structured_output: { oneLiner: '' } }), { model: 's' }),
    ).rejects.toThrow();
  });
});

describe('extra docs in prompt', () => {
  it('includes nested docs so the model does not guess from the name', () => {
    const prompt = buildSummaryPrompt({ ...ctx, docs: { ...ctx.docs, readme: null, extraDocs: { 'knowledge/CLAUDE.md': '싼타페 MX5 하이브리드' } } });
    expect(prompt).toContain('## knowledge/CLAUDE.md\n싼타페 MX5 하이브리드');
  });
});

describe('sanitizeRunSuggestion', () => {
  it('drops one-shot scripts (demo/test/build/lint) that are not long-running', () => {
    for (const command of ['pnpm demo', 'npm run test', 'pnpm build', 'npm run lint', 'pnpm typecheck', 'uv run pytest']) {
      expect(sanitizeRunSuggestion({ command, cwd: '.', expectedPort: null })).toBeNull();
    }
  });
  it('keeps servers and bots', () => {
    for (const command of ['pnpm dev', 'npm start', 'uv run uvicorn app:app', 'python -m mx5bot.bot']) {
      expect(sanitizeRunSuggestion({ command, cwd: '.', expectedPort: null })?.command).toBe(command);
    }
    expect(sanitizeRunSuggestion(null)).toBeNull();
  });
});

describe('v3 prompt', () => {
  it('asks for a consumer-facing description and a separate tech overview', () => {
    const prompt = buildSummaryPrompt(ctx);
    expect(prompt).toContain('그대로 쓰지 않고 풀어 쓴다');
    expect(prompt).toContain('- techOverview:');
    expect(prompt).toContain('- techStack:');
  });
});

describe('v4 prompt (writing guidelines)', () => {
  const prompt = buildSummaryPrompt({ ...ctx, repo: { isGit: false, branch: null, sharedRemoteWith: [] } });
  it('forbids describing plans as finished services', () => {
    expect(prompt).toContain('설계했습니다');
  });
  it('asks for three sentences of about 50 characters and plain words', () => {
    expect(prompt).toContain('정확히 3문장');
    expect(prompt).toContain('50자');
    expect(prompt).toContain('괄호로 풀어');
  });
  it('fixes the one-liner and feature formats and unifies terms', () => {
    expect(prompt).toContain('25~35자');
    expect(prompt).toContain('~하기');
    expect(prompt).toContain('유튜브');
  });
  it('tells the model this folder is not under git', () => {
    expect(prompt).toContain('git으로 관리하지 않는 폴더');
  });
  it('mentions folders that share the same remote', () => {
    const shared = buildSummaryPrompt({ ...ctx, repo: { isGit: true, branch: 'mail', sharedRemoteWith: ['DataBatcher'] } });
    expect(shared).toContain('DataBatcher');
    expect(shared).toContain('mail');
  });
});
