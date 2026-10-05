import type { Project, RunSuggestion } from '@hub/shared';

export interface ResolvedRun extends RunSuggestion {
  source: 'user' | 'approved' | 'suggested';
}

export function resolveRun(p: Project): ResolvedRun | null {
  if (p.runConfig) return p.runConfig;
  const s = p.summary?.runSuggestion;
  return s ? { ...s, source: 'suggested' } : null;
}

export const openUrl = (port: number) => `http://localhost:${port}`;
