import type { Health, ProjectsResponse, RunConfig, RunSuggestion, RuntimeSnapshot, StartResult } from '@hub/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public body: any,
  ) {
    super(body?.error ?? `HTTP ${status}`);
  }
}

async function request<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

const p = (name: string) => `/api/projects/${encodeURIComponent(name)}`;

export const api = {
  projects: () => request<ProjectsResponse>('/api/projects'),
  runtime: () => request<RuntimeSnapshot>('/api/runtime'),
  health: () => request<Health>('/api/health'),
  refresh: (force = false) => request<{ started: boolean }>('/api/refresh', { method: 'POST', body: { force } }),
  start: (name: string, approve = false) => request<StartResult>(`${p(name)}/start`, { method: 'POST', body: { approve } }),
  stop: (name: string, pid: number) => request<{ result: string }>(`${p(name)}/stop`, { method: 'POST', body: { pid } }),
  saveRunConfig: (name: string, cfg: RunSuggestion) => request<RunConfig>(`${p(name)}/run-config`, { method: 'PUT', body: cfg }),
  openEditor: (name: string) => request<{ ok: true }>(`${p(name)}/open-editor`, { method: 'POST', body: {} }),
};
