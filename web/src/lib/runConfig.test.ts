import { describe, expect, it } from 'vitest';
import type { Project } from '@hub/shared';
import { openUrl, resolveRun } from './runConfig';

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
