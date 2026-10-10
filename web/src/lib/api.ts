import type { ChecklistItem, Decision, DecisionInput, Health, InsightsResponse, IssueKind, IssueList, LogChunk, Personal, PersonalInput, ProjectsResponse, RefreshStatus, RunConfig, RunSuggestion, RuntimeSnapshot, StartResult, TrendsResponse } from '@hub/shared';

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
  // 승인할 때는 대화상자에 보여준 명령을 함께 보낸다. 서버는 저장된 추천과 같을 때만 실행한다.
  start: (name: string, approved?: RunSuggestion) =>
    request<StartResult>(`${p(name)}/start`, { method: 'POST', body: approved ? { approve: true, suggestion: approved } : { approve: false } }),
  stop: (name: string, pid: number) => request<{ result: string }>(`${p(name)}/stop`, { method: 'POST', body: { pid } }),
  savePersonal: (name: string, input: PersonalInput) => request<Personal>(`${p(name)}/personal`, { method: 'PUT', body: input }),
  decisions: () => request<Decision[]>('/api/decisions'),
  saveDecision: (id: string, input: DecisionInput) => request<Decision>(`/api/decisions/${encodeURIComponent(id)}`, { method: 'PUT', body: input }),
  saveChecklist: (id: string, items: ChecklistItem[]) =>
    request<Decision>(`/api/decisions/${encodeURIComponent(id)}/checklist`, { method: 'PUT', body: { items } }),
  // 요청 가드가 DELETE에도 JSON 헤더를 요구하므로 빈 본문을 보낸다.
  deleteDecision: (id: string) => request<{ ok: true }>(`/api/decisions/${encodeURIComponent(id)}`, { method: 'DELETE', body: {} }),
  saveRunConfig: (name: string, cfg: RunSuggestion) => request<RunConfig>(`${p(name)}/run-config`, { method: 'PUT', body: cfg }),
  refreshStatus: () => request<RefreshStatus>('/api/refresh/status'),
  logs: (name: string, from?: { offset: number; gen: string }) =>
    request<LogChunk>(`${p(name)}/logs${from ? `?offset=${from.offset}&gen=${encodeURIComponent(from.gen)}` : ''}`),
  issues: (name: string, kind: IssueKind) => request<IssueList>(`${p(name)}/issues?kind=${kind}`),
  insights: () => request<InsightsResponse>('/api/insights'),
  regenerateInsights: () => request<{ started: boolean }>('/api/insights/regenerate', { method: 'POST', body: {} }),
  trends: (before?: string) => request<TrendsResponse>(`/api/trends${before ? `?before=${before}` : ''}`),
  collectTrends: () => request<{ started: boolean }>('/api/trends/collect', { method: 'POST', body: {} }),
  openEditor: (name: string) => request<{ ok: true; editor: string }>(`${p(name)}/open-editor`, { method: 'POST', body: {} }),
};
