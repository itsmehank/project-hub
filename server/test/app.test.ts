import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Health, ProjectsResponse, RefreshEvent, RuntimeSnapshot, StoredProject, Summary } from '@hub/shared';
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
  structure: [],
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
  };
  return ctl;
}

function setup(over: Partial<AppDeps> = {}, snapshot: RuntimeSnapshot = { at: 't', byProject: {} }) {
  const db = openDb(':memory:');
  db.upsertProject(stored('alpha'));
  const launcher = {
    start: vi.fn(async () => ({ status: 'running' as const, processes: [] })),
    stop: vi.fn(async () => 'stopped' as const),
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

    const second = await app.request('/api/projects/alpha/start', post({ approve: true }));
    expect(second.status).toBe(200);
    expect(db.getRunConfig('alpha')).toEqual({ ...suggestion, source: 'approved' });
    expect(launcher.start).toHaveBeenCalledWith(
      expect.objectContaining({ db }),
      { name: 'alpha', path: '/root/alpha' },
      { ...suggestion, source: 'approved' },
      undefined,
    );
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

  it('opens the editor with the project path', async () => {
    const run = fakeRunner(() => ({ code: 0 }));
    const { app } = setup({ run });
    expect((await app.request('/api/projects/alpha/open-editor', post({}))).status).toBe(200);
    expect(run.calls[0]).toMatchObject({ cmd: 'code', args: ['/root/alpha'] });
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
