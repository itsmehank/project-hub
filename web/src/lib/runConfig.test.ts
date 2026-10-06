import { describe, expect, it } from 'vitest';
import type { Project } from '@hub/shared';
import { canStart, openUrl, resolveRun, shortenCommand } from './runConfig';

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
  it('matches commands by their meaningful tokens, not substrings', () => {
    const run = (command: string, procCommand: string) => canStart([proc({ command: procCommand })], { command });
    expect(run('pnpm dev', 'node /Users/me/git/personal/dev-notes/x.js')).toBe(true);
    expect(run('python bot.py', 'python -m pytest tests/test_bot.py')).toBe(true);
    expect(run('uv run python bot.py', '/repo/.venv/bin/python3 bot.py')).toBe(false);
    expect(run('npm run dev', 'node /usr/local/bin/npm run dev')).toBe(false);
  });
  it('allows starting when nothing runs', () => {
    expect(canStart([])).toBe(true);
  });
});

describe('shortenCommand', () => {
  it('replaces absolute paths with file names', () => {
    expect(shortenCommand('/opt/homebrew/Cellar/python@3.14/3.14.6/Frameworks/Python.framework/Versions/3.14/Resources/Python.app/Contents/MacOS/Python -m mx5bot.bot')).toBe('Python -m mx5bot.bot');
    expect(shortenCommand('/opt/homebrew/Cellar/node/25.9.0_2/bin/node /Users/me/hw-note/node_modules/astro/bin/astro.mjs dev --json')).toBe('node astro.mjs dev --json');
  });
  it('leaves relative commands untouched', () => {
    expect(shortenCommand('uv run uvicorn api.main:app --reload --port 8000')).toBe('uv run uvicorn api.main:app --reload --port 8000');
  });
});
