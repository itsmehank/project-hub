import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Health, Project, ProjectsResponse, RefreshEvent, RuntimeSnapshot, StoredProject, Summary } from '@hub/shared';
import { createApp, type AppDeps } from '../src/app';
import { openDb } from '../src/db';
import type { RefreshController } from '../src/refresh';
import { RuntimeCache } from '../src/runtime/detect';
import { logPathFor } from '../src/runtime/launcher';
import { fakeRunner } from './fakeRunner';

const stored = (name: string): StoredProject => ({
  name,
  path: `/root/${name}`,
  isGit: true,
  remoteUrl: null,
  githubRepo: null,
  stack: [],
  readmeExcerpt: null,
  git: null,
  github: null,
  errors: {},
  updatedAt: 't',
});
const summary = (runSuggestion: Summary['runSuggestion']): Summary => ({
  oneLiner: '한 줄',
  whatItIs: '설명',
  features: [],
  structure: [], techOverview: '', techStack: [],
  currentState: '',
  nextSteps: [],
  runSuggestion,
});

function fakeRefresh(running = false) {
  const listeners = new Set<(e: RefreshEvent) => void>();
  const ctl: RefreshController & { emit(e: RefreshEvent): void; starts: number } = {
    running,
    starts: 0,
    start() {
      if (this.running) return false;
      this.starts++;
      return true;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit(e) {
      listeners.forEach((fn) => fn(e));
    },
    status() {
      return { running: this.running, done: 3, total: 9, error: null, finishedAt: null };
    },
  };
  return ctl;
}

function setup(over: Partial<AppDeps> = {}, snapshot: RuntimeSnapshot = { at: 't', byProject: {} }) {
  const db = openDb(':memory:');
  db.upsertProject(stored('alpha'));
  const launcher = {
    start: vi.fn(async () => ({ status: 'running' as const, processes: [] })),
    stop: vi.fn(async () => 'stopped' as const),
    checkPort: vi.fn(async (): Promise<{ project: string | null; pid: number; command: string } | null> => null),
  };
  const deps: AppDeps = {
    db,
    refresh: fakeRefresh(),
    runtime: new RuntimeCache(async () => snapshot, 0),
    run: fakeRunner(() => ({ code: 0 })),
    logsDir: mkdtempSync(path.join(tmpdir(), 'hub-logs-')),
    health: async () => ({ gh: true, claude: true, lsof: true, messages: [] }),
    launcher,
    ...over,
  };
  return { app: createApp(deps), db, launcher, deps };
}

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

async function readSse(res: Response, until: (text: string) => boolean): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (!until(text)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  await reader.cancel();
  return text;
}

describe('projects', () => {
  it('lists projects with summary and run config attached', async () => {
    const { app, db } = setup();
    db.putSummary('alpha', 'h', summary(null));
    db.putRunConfig('alpha', { command: 'pnpm dev', cwd: '.', expectedPort: 5173, source: 'user' });
    db.setMeta('lastRefreshAt', '2026-10-05T00:00:00.000Z');
    const body = (await (await app.request('/api/projects')).json()) as ProjectsResponse;
    expect(body.lastRefreshAt).toBe('2026-10-05T00:00:00.000Z');
    expect(body.refreshing).toBe(false);
    expect(body.projects[0]).toMatchObject({
      name: 'alpha',
      summary: { oneLiner: '한 줄' },
      runConfig: { command: 'pnpm dev', source: 'user' },
    });
    expect(body.projects[0].summaryAt).toEqual(expect.any(String));
  });
  it('returns 404 for unknown projects', async () => {
    expect((await setup().app.request('/api/projects/nope')).status).toBe(404);
  });
});

describe('refresh', () => {
  it('starts a refresh and rejects a concurrent one', async () => {
    const idle = setup();
    expect((await idle.app.request('/api/refresh', post({}))).status).toBe(202);
    const busy = setup({ refresh: fakeRefresh(true) });
    expect((await busy.app.request('/api/refresh', post({ force: true }))).status).toBe(409);
  });

  it('streams the current state first, then refresh events', async () => {
    const refresh = fakeRefresh(true);
    const { app } = setup({ refresh });
    const res = await app.request('/api/refresh/stream');
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    setTimeout(() => refresh.emit({ type: 'done', durationMs: 5 }), 50);
    const text = await readSse(res, (t) => t.includes('"done"'));
    expect(text.indexOf('{"type":"state","running":true}')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('"state"')).toBeLessThan(text.indexOf('"done"'));
  });
});

describe('start / stop / run-config', () => {
  it('returns 404 when there is no config and no suggestion', async () => {
    const res = await setup().app.request('/api/projects/alpha/start', post({}));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no-run-config' });
  });

  it('requires approval for a suggested command, then saves it as approved', async () => {
    const { app, db, launcher } = setup();
    const suggestion = { command: 'pnpm dev', cwd: '.', expectedPort: 5173 };
    db.putSummary('alpha', 'h', summary(suggestion));
    const first = await app.request('/api/projects/alpha/start', post({}));
    expect(first.status).toBe(428);
    expect(await first.json()).toEqual({ error: 'approval-required', suggestion });
    expect(launcher.start).not.toHaveBeenCalled();

    const second = await app.request('/api/projects/alpha/start', post({ approve: true, suggestion }));
    expect(second.status).toBe(200);
    expect(db.getRunConfig('alpha')).toEqual({ ...suggestion, source: 'approved' });
    expect(launcher.start).toHaveBeenCalledWith(
      expect.objectContaining({ db }),
      { name: 'alpha', path: '/root/alpha' },
      { ...suggestion, source: 'approved' },
      undefined,
    );
  });

  it('refuses an approval when the suggestion changed after the dialog was shown', async () => {
    const { app, db, launcher } = setup();
    const shown = { command: 'pnpm dev', cwd: '.', expectedPort: 5173 };
    const current = { command: 'rm -rf build && pnpm dev', cwd: '.', expectedPort: 5173 };
    db.putSummary('alpha', 'h', summary(current));
    const res = await app.request('/api/projects/alpha/start', post({ approve: true, suggestion: shown }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'suggestion-changed', suggestion: current });
    const missing = await app.request('/api/projects/alpha/start', post({ approve: true }));
    expect(missing.status).toBe(409);
    expect(db.getRunConfig('alpha')).toBeNull();
    expect(launcher.start).not.toHaveBeenCalled();
  });

  it('rejects a second start that arrives while the first is still checking', async () => {
    const { app, db, launcher } = setup();
    const suggestion = { command: 'pnpm dev', cwd: '.', expectedPort: 5173 };
    db.putSummary('alpha', 'h', summary(suggestion));
    let release!: () => void;
    launcher.checkPort.mockImplementationOnce(() => new Promise((r) => (release = () => r(null))));
    const first = app.request('/api/projects/alpha/start', post({ approve: true, suggestion }));
    await new Promise((r) => setTimeout(r, 10));
    const second = await app.request('/api/projects/alpha/start', post({ approve: true, suggestion }));
    expect(second.status).toBe(409);
    release();
    expect((await first).status).toBe(200);
    expect(launcher.start).toHaveBeenCalledTimes(1);
  });

  it('validates and saves a user run config', async () => {
    const { app, db } = setup();
    const bad = await app.request('/api/projects/alpha/run-config', { ...post({ command: '' }), method: 'PUT' });
    expect(bad.status).toBe(400);
    const good = await app.request('/api/projects/alpha/run-config', {
      ...post({ command: 'uv run app.py', cwd: '.', expectedPort: null }),
      method: 'PUT',
    });
    expect(good.status).toBe(200);
    expect(db.getRunConfig('alpha')?.source).toBe('user');
  });

  it('stops hub-launched processes by group and external ones by pid', async () => {
    const snapshot: RuntimeSnapshot = {
      at: 't',
      byProject: {
        alpha: [
          { pid: 10, pgid: 10, command: 'a', cwd: '/root/alpha', ports: [], launchedByHub: true },
          { pid: 21, pgid: 20, command: 'b', cwd: '/root/alpha', ports: [], launchedByHub: false },
        ],
      },
    };
    const { app, launcher, db } = setup({}, snapshot);
    db.putLaunch({ name: 'alpha', pid: 10, pgid: 10, command: 'a', startedAt: 't', logPath: '/l' });
    expect((await app.request('/api/projects/alpha/stop', post({ pid: 10 }))).status).toBe(200);
    expect(launcher.stop).toHaveBeenLastCalledWith({ pid: 10, group: true });
    expect(db.getLaunch('alpha')).toBeNull();
    await app.request('/api/projects/alpha/stop', post({ pid: 21 }));
    expect(launcher.stop).toHaveBeenLastCalledWith({ pid: 21, group: false });
    expect((await app.request('/api/projects/alpha/stop', post({ pid: 99 }))).status).toBe(404);
  });
});

describe('logs and misc', () => {
  it('streams a log snapshot', async () => {
    const { app, deps } = setup();
    writeFileSync(logPathFor(deps.logsDir, 'alpha'), 'line1\nline2\n');
    const res = await app.request('/api/projects/alpha/logs/stream');
    const text = await readSse(res, (t) => t.includes('line2'));
    expect(text).toContain('event: snapshot');
  });

  it('serves runtime and health', async () => {
    const { app } = setup();
    expect(await (await app.request('/api/runtime')).json()).toEqual({ at: 't', byProject: {} });
    expect(((await (await app.request('/api/health')).json()) as Health).gh).toBe(true);
  });

  it('opens the project in the editor picked for its stack', async () => {
    const run = fakeRunner(() => ({ code: 0 }));
    const { app, db } = setup({ run, appInstalled: (name) => name === 'PyCharm' || name === 'IntelliJ IDEA' });
    db.upsertProject({ ...stored('alpha'), stack: ['Python'] });
    const res = await app.request('/api/projects/alpha/open-editor', post({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, editor: 'PyCharm' });
    expect(run.calls[0]).toMatchObject({ cmd: 'open', args: ['-a', 'PyCharm', '/root/alpha'] });
  });
  it('reports a readable error when the editor fails to open', async () => {
    const { app } = setup({ run: fakeRunner(() => ({ code: 1, stderr: 'Unable to find application' })), appInstalled: () => false });
    const res = await app.request('/api/projects/alpha/open-editor', post({}));
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toContain('Finder');
  });
});

describe('request guard', () => {
  it('rejects requests whose Host is not localhost (DNS rebinding)', async () => {
    const { app } = setup();
    const res = await app.request('http://evil.example:4310/api/projects', { headers: { host: 'evil.example:4310' } });
    expect(res.status).toBe(403);
  });
  it('rejects state-changing requests that are not JSON (cross-site simple POST)', async () => {
    const { app, launcher } = setup();
    const res = await app.request('/api/projects/alpha/start', { method: 'POST', body: '{"approve":true}', headers: { 'content-type': 'text/plain' } });
    expect(res.status).toBe(415);
    expect(launcher.start).not.toHaveBeenCalled();
  });
  it('rejects cross-site requests even with a JSON content type', async () => {
    const { app } = setup();
    const res = await app.request('/api/refresh', { ...post({ force: true }), headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' } });
    expect(res.status).toBe(403);
  });
  it('accepts the vite proxy host', async () => {
    const { app } = setup();
    const res = await app.request('http://127.0.0.1:5199/api/projects', { headers: { host: '127.0.0.1:5199' } });
    expect(res.status).toBe(200);
  });
});

describe('request guard (hardened)', () => {
  it('rejects a parameterized non-JSON content type even from a same-site page', async () => {
    const { app, launcher, db } = setup();
    db.putRunConfig('alpha', { command: 'x', cwd: '.', expectedPort: null, source: 'user' });
    const res = await app.request('/api/projects/alpha/start', {
      method: 'POST',
      body: '{"approve":true}',
      headers: { 'content-type': 'text/plain;application/json', 'sec-fetch-site': 'same-site' },
    });
    expect(res.status).toBe(415);
    expect(launcher.start).not.toHaveBeenCalled();
  });
  it('rejects JSON requests from another localhost port', async () => {
    const { app } = setup();
    const res = await app.request('/api/refresh', {
      ...post({}),
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', 'sec-fetch-site': 'same-site' },
    });
    expect(res.status).toBe(403);
  });
  it('accepts JSON requests from the web app origin', async () => {
    const { app } = setup();
    const res = await app.request('/api/refresh', {
      ...post({}),
      headers: { 'content-type': 'application/json; charset=utf-8', origin: 'http://127.0.0.1:5199', 'sec-fetch-site': 'same-origin' },
    });
    expect(res.status).toBe(202);
  });
});

describe('start lock', () => {
  it('rejects a second start while the first is still starting', async () => {
    const { app, launcher, db } = setup();
    db.putRunConfig('alpha', { command: 'x', cwd: '.', expectedPort: null, source: 'user' });
    let release!: () => void;
    launcher.start.mockImplementationOnce(
      () => new Promise((r) => (release = () => r({ status: 'running' as const, processes: [] }))),
    );
    const first = app.request('/api/projects/alpha/start', post({}));
    await new Promise((r) => setTimeout(r, 20));
    const second = await app.request('/api/projects/alpha/start', post({}));
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: 'already-starting' });
    release();
    expect((await first).status).toBe(200);
  });
  it('rejects a start when the hub already runs this project', async () => {
    const { app, launcher, db } = setup();
    db.putRunConfig('alpha', { command: 'x', cwd: '.', expectedPort: null, source: 'user' });
    const pgid = Number(execSync(`ps -o pgid= -p ${process.pid}`).toString().trim());
    db.putLaunch({ name: 'alpha', pid: pgid, pgid, command: 'x', startedAt: 't', logPath: '/l' });
    const res = await app.request('/api/projects/alpha/start', post({}));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already-running' });
    expect(launcher.start).not.toHaveBeenCalled();
  });
});

describe('issues API', () => {
  const ghRun = () =>
    fakeRunner((cmd) =>
      cmd === 'gh'
        ? { stdout: JSON.stringify([{ number: 1, title: 'a', html_url: 'u', labels: [], created_at: 't', updated_at: 't', comments: 0, user: { login: 'me' }, body: 'x' }]) }
        : undefined,
    );
  it('returns all issues for a GitHub project and caches them', async () => {
    const run = ghRun();
    const { app, db } = setup({ run });
    db.upsertProject({ ...stored('alpha'), githubRepo: 'me/alpha' });
    const res = await app.request('/api/projects/alpha/issues?kind=open');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { items: unknown[] }).items).toHaveLength(1);
    await app.request('/api/projects/alpha/issues?kind=open');
    expect(run.calls).toHaveLength(1);
  });
  it('rejects bad kinds and projects without GitHub', async () => {
    const { app, db } = setup({ run: ghRun() });
    expect((await app.request('/api/projects/alpha/issues?kind=bogus')).status).toBe(400);
    expect((await app.request('/api/projects/alpha/issues?kind=open')).status).toBe(404);
    db.upsertProject({ ...stored('beta'), githubRepo: 'me/beta' });
    const { app: failing, db: db2 } = setup({ run: fakeRunner(() => ({ code: 1, stderr: 'HTTP 500' })) });
    db2.upsertProject({ ...stored('beta'), githubRepo: 'me/beta' });
    expect((await failing.request('/api/projects/beta/issues?kind=open')).status).toBe(502);
  });
});

describe('insights API', () => {
  function fakeInsights(generating = false) {
    return {
      get: () => ({ insights: null, generatedAt: null, generating, error: null }),
      regenerate: vi.fn(() => !generating),
    };
  }
  it('returns the current insights state', async () => {
    const { app } = setup({ insights: fakeInsights() });
    expect(await (await app.request('/api/insights')).json()).toEqual({ insights: null, generatedAt: null, generating: false, error: null });
  });
  it('starts a regeneration or reports that one is running', async () => {
    const idle = fakeInsights();
    expect((await setup({ insights: idle }).app.request('/api/insights/regenerate', post({}))).status).toBe(202);
    expect(idle.regenerate).toHaveBeenCalled();
    expect((await setup({ insights: fakeInsights(true) }).app.request('/api/insights/regenerate', post({}))).status).toBe(409);
  });
});

describe('polling endpoints (no long-lived connections)', () => {
  it('returns refresh progress', async () => {
    const { app } = setup({ refresh: fakeRefresh(true) });
    expect(await (await app.request('/api/refresh/status')).json()).toEqual({ running: true, done: 3, total: 9, error: null, finishedAt: null });
  });
  it('returns the log tail, then only what was appended, and resets when the log was rewritten', async () => {
    const { app, deps } = setup();
    const file = logPathFor(deps.logsDir, 'alpha');
    writeFileSync(file, 'line1\nline2\n');
    const first = (await (await app.request('/api/projects/alpha/logs')).json()) as { text: string; offset: number; reset: boolean };
    expect(first).toEqual({ text: 'line1\nline2\n', offset: 12, reset: true, gen: '' });
    writeFileSync(file, 'line1\nline2\nline3\n');
    expect(await (await app.request('/api/projects/alpha/logs?offset=12')).json()).toEqual({ text: 'line3\n', offset: 18, reset: false, gen: '' });
    writeFileSync(file, 'new\n');
    expect(await (await app.request('/api/projects/alpha/logs?offset=18')).json()).toEqual({ text: 'new\n', offset: 4, reset: true, gen: '' });
  });
  it('resets when a new run started even if the new log already outgrew the old offset', async () => {
    const { app, deps, db } = setup();
    const file = logPathFor(deps.logsDir, 'alpha');
    db.putLaunch({ name: 'alpha', pid: 1, pgid: 1, command: 'x', startedAt: 'run-1', logPath: file });
    writeFileSync(file, 'old\n');
    const first = (await (await app.request('/api/projects/alpha/logs')).json()) as { offset: number; gen: string };
    expect(first).toMatchObject({ offset: 4, gen: 'run-1' });
    db.putLaunch({ name: 'alpha', pid: 2, pgid: 2, command: 'x', startedAt: 'run-2', logPath: file });
    writeFileSync(file, 'starting server\nready\n');
    expect(await (await app.request('/api/projects/alpha/logs?offset=4&gen=run-1')).json()).toEqual({
      text: 'starting server\nready\n',
      offset: 22,
      reset: true,
      gen: 'run-2',
    });
  });
  it('never splits a multi-byte character across chunks', async () => {
    const { app, deps } = setup();
    const file = logPathFor(deps.logsDir, 'alpha');
    const full = Buffer.from('준비 완료\n', 'utf8');
    writeFileSync(file, full.subarray(0, 4)); // '준' (3 bytes) + first byte of '비'
    const a = (await (await app.request('/api/projects/alpha/logs?offset=0&gen=')).json()) as { text: string; offset: number };
    expect(a).toMatchObject({ text: '준', offset: 3 });
    writeFileSync(file, full);
    const b = (await (await app.request(`/api/projects/alpha/logs?offset=${a.offset}&gen=`)).json()) as { text: string };
    expect(a.text + b.text).toBe('준비 완료\n');
  });
  it('returns empty text when there is no log yet', async () => {
    const { app } = setup();
    expect(await (await app.request('/api/projects/alpha/logs')).json()).toEqual({ text: '', offset: 0, reset: true, gen: '' });
  });
});

describe('port conflict before approval', () => {
  const suggestion = { command: 'npm run dev', cwd: '.', expectedPort: 5173 };
  it('includes the conflict in the approval request', async () => {
    const { app, db, launcher } = setup();
    db.putSummary('alpha', 'h', summary(suggestion));
    launcher.checkPort.mockResolvedValueOnce({ project: 'kr-by-claude', pid: 1, command: 'node' });
    const res = await app.request('/api/projects/alpha/start', post({}));
    expect(res.status).toBe(428);
    expect(await res.json()).toMatchObject({ portConflict: { port: 5173, holder: { project: 'kr-by-claude' } } });
  });
  it('does not save the approved command when the port is taken', async () => {
    const { app, db, launcher } = setup();
    db.putSummary('alpha', 'h', summary(suggestion));
    launcher.checkPort.mockResolvedValueOnce({ project: 'kr-by-claude', pid: 1, command: 'node' });
    const res = await app.request('/api/projects/alpha/start', post({ approve: true, suggestion }));
    expect(await res.json()).toMatchObject({ status: 'port-conflict', port: 5173 });
    expect(db.getRunConfig('alpha')).toBeNull();
    expect(launcher.start).not.toHaveBeenCalled();
  });
});

const put = (body: unknown) => ({ method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('personal', () => {
  const input = { lifecycle: 'launch', note: '도메인 연결', links: [{ label: '운영', url: 'https://x.dev' }] };
  it('saves personal data and attaches it to project responses', async () => {
    const { app } = setup();
    const res = await app.request('/api/projects/alpha/personal', put(input));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ...input, updatedAt: expect.any(String) });
    const list = (await (await app.request('/api/projects')).json()) as ProjectsResponse;
    expect(list.projects[0].personal).toMatchObject(input);
    expect(((await (await app.request('/api/projects/alpha')).json()) as Project).personal).toMatchObject(input);
  });
  it('defaults to empty personal data', async () => {
    const list = (await (await setup().app.request('/api/projects')).json()) as ProjectsResponse;
    expect(list.projects[0].personal).toEqual({ lifecycle: null, note: '', links: [], updatedAt: null });
  });
  it('rejects invalid input with the violated fields', async () => {
    const res = await setup().app.request('/api/projects/alpha/personal', put({ ...input, links: [{ label: 'x', url: 'javascript:alert(1)' }] }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: { path: unknown[] }[] };
    expect(body.error).toBe('invalid');
    expect(body.issues[0].path).toEqual(['links', 0, 'url']);
  });
  it('returns 404 for unknown projects', async () => {
    expect((await setup().app.request('/api/projects/nope/personal', put(input))).status).toBe(404);
  });
  it('is protected by the request guard', async () => {
    const { app } = setup();
    const noJson = await app.request('/api/projects/alpha/personal', { method: 'PUT', body: JSON.stringify(input) });
    expect(noJson.status).toBe(415);
    const cross = await app.request('/api/projects/alpha/personal', { ...put(input), headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' } });
    expect(cross.status).toBe(403);
  });
});
