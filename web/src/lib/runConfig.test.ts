import { describe, expect, it } from 'vitest';
import type { Project } from '@hub/shared';
import { canStart, openUrl, resolveRun } from './runConfig';

const base = { summary: null, runConfig: null } as unknown as Project;
const suggestion = { command: 'pnpm dev', cwd: '.', expectedPort: 5173 };

describe('resolveRun', () => {
  it('prefers a saved config over the Claude suggestion', () => {
    const p = {
      ...base,
      runConfig: { command: 'uv run app.py', cwd: '.', expectedPort: 8000, source: 'user' },
      summary: { runSuggestion: suggestion },
    } as unknown as Project;
    expect(resolveRun(p)).toEqual({ command: 'uv run app.py', cwd: '.', expectedPort: 8000, source: 'user' });
  });
  it('marks a bare suggestion as suggested', () => {
    expect(resolveRun({ ...base, summary: { runSuggestion: suggestion } } as unknown as Project)).toEqual({
      ...suggestion,
      source: 'suggested',
    });
  });
  it('returns null when nothing is known', () => {
    expect(resolveRun(base)).toBeNull();
  });
});

describe('openUrl', () => {
  it('builds a localhost URL', () => {
    expect(openUrl(5173)).toBe('http://localhost:5173');
  });
});

describe('canStart', () => {
  const proc = (over: object) => ({ pid: 1, pgid: 1, command: 'x', cwd: '', ports: [], launchedByHub: false, ...over });
  it('allows starting when only unrelated portless processes run (test watchers, REPLs)', () => {
    expect(canStart([proc({})])).toBe(true);
  });
  it('blocks starting when a server port is open or the hub already launched it', () => {
    expect(canStart([proc({ ports: [3000] })])).toBe(false);
    expect(canStart([proc({ launchedByHub: true })])).toBe(false);
  });
  it('blocks starting when a portless process is already running the same command (bots)', () => {
    const bot = proc({ command: '/opt/homebrew/bin/Python -m mx5bot.bot' });
    expect(canStart([bot], { command: 'python -m mx5bot.bot' })).toBe(false);
    expect(canStart([bot], { command: 'uv run other.py' })).toBe(true);
  });
  it('allows starting when nothing runs', () => {
    expect(canStart([])).toBe(true);
  });
});
