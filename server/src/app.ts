import { open, stat } from 'node:fs/promises';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  RunConfigInputSchema,
  type Health,
  type Project,
  type ProjectsResponse,
  type RefreshEvent,
  type RunConfig,
  type StoredProject,
} from '@hub/shared';
import type { Db } from './db';
import type { CommandRunner } from './exec';
import type { RefreshController } from './refresh';
import type { RuntimeCache } from './runtime/detect';
import { logPathFor, readLogTail, startProject, stopProcess, type StartOptions } from './runtime/launcher';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface Launcher {
  start: typeof startProject;
  stop: typeof stopProcess;
}

export interface AppDeps {
  db: Db;
  refresh: RefreshController;
  runtime: RuntimeCache;
  run: CommandRunner;
  logsDir: string;
  health: () => Promise<Health>;
  launcher?: Launcher;
  startOptions?: StartOptions;
}

export function toProject(db: Db, p: StoredProject): Project {
  const s = db.getSummary(p.name);
  return { ...p, summary: s?.content ?? null, summaryAt: s?.createdAt ?? null, runConfig: db.getRunConfig(p.name) };
}

async function body(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown>> {
  const b = await c.req.json().catch(() => ({}));
  return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
}

export function createApp(deps: AppDeps) {
  const { db, refresh, runtime, run, logsDir } = deps;
  const launcher: Launcher = deps.launcher ?? { start: startProject, stop: stopProcess };
  const app = new Hono();

  // 로컬 API를 다른 웹페이지가 조작하지 못하게 막는다.
  // Host 검사는 DNS 리바인딩을, JSON 강제와 Sec-Fetch-Site 검사는 교차 사이트 단순 POST를 막는다.
  app.use('/api/*', async (c, next) => {
    const host = (c.req.header('host') ?? new URL(c.req.url).host).replace(/:\d+$/, '');
    if (!LOCAL_HOSTS.has(host)) return c.json({ error: 'forbidden-host' }, 403);
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      if (c.req.header('sec-fetch-site') === 'cross-site') return c.json({ error: 'cross-site' }, 403);
      if (!(c.req.header('content-type') ?? '').includes('application/json')) return c.json({ error: 'json-required' }, 415);
    }
    await next();
  });

  app.get('/api/projects', (c) =>
    c.json<ProjectsResponse>({
      projects: db.listProjects().map((p) => toProject(db, p)),
      lastRefreshAt: db.getMeta('lastRefreshAt'),
      refreshing: refresh.running,
    }),
  );

  app.get('/api/projects/:name', (c) => {
    const p = db.getProject(c.req.param('name'));
    return p ? c.json(toProject(db, p)) : c.json({ error: 'not-found' }, 404);
  });

  app.post('/api/refresh', async (c) => {
    const b = await body(c);
    return refresh.start({ force: b.force === true })
      ? c.json({ started: true }, 202)
      : c.json({ error: 'already-running' }, 409);
  });

  app.get('/api/refresh/stream', (c) =>
    streamSSE(c, async (stream) => {
      const queue: RefreshEvent[] = [{ type: 'state', running: refresh.running }];
      let wake: (() => void) | null = null;
      const unsubscribe = refresh.subscribe((e) => {
        queue.push(e);
        wake?.();
      });
      stream.onAbort(() => {
        unsubscribe();
        wake?.();
      });
      while (!stream.aborted) {
        while (queue.length) await stream.writeSSE({ data: JSON.stringify(queue.shift()) });
        const timedOut = await new Promise<boolean>((resolve) => {
          const t = setTimeout(() => resolve(true), 15_000);
          wake = () => {
            clearTimeout(t);
            resolve(false);
          };
        });
        wake = null;
        if (timedOut && !stream.aborted) await stream.writeSSE({ event: 'ping', data: '' });
      }
      unsubscribe();
    }),
  );

  app.get('/api/runtime', async (c) => c.json(await runtime.get()));
  app.get('/api/health', async (c) => c.json(await deps.health()));

  app.post('/api/projects/:name/start', async (c) => {
    const name = c.req.param('name');
    const p = db.getProject(name);
    if (!p) return c.json({ error: 'not-found' }, 404);
    const b = await body(c);
    let cfg: RunConfig | null = db.getRunConfig(name);
    if (!cfg) {
      const suggestion = db.getSummary(name)?.content.runSuggestion;
      if (!suggestion) return c.json({ error: 'no-run-config' }, 404);
      if (b.approve !== true) return c.json({ error: 'approval-required', suggestion }, 428);
      cfg = { ...suggestion, source: 'approved' };
      db.putRunConfig(name, cfg);
    }
    const result = await launcher.start({ db, logsDir, runtime, run }, { name, path: p.path }, cfg, deps.startOptions);
    return c.json(result);
  });

  app.post('/api/projects/:name/stop', async (c) => {
    const name = c.req.param('name');
    const pid = Number((await body(c)).pid);
    runtime.invalidate();
    const proc = (await runtime.get()).byProject[name]?.find((p) => p.pid === pid);
    if (!proc) return c.json({ error: 'not-running' }, 404);
    const result = proc.launchedByHub
      ? await launcher.stop({ pid: proc.pgid, group: true })
      : await launcher.stop({ pid: proc.pid, group: false });
    if (proc.launchedByHub) db.deleteLaunch(name);
    runtime.invalidate();
    return c.json({ result });
  });

  app.put('/api/projects/:name/run-config', async (c) => {
    const name = c.req.param('name');
    if (!db.getProject(name)) return c.json({ error: 'not-found' }, 404);
    const parsed = RunConfigInputSchema.safeParse(await body(c));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const cfg: RunConfig = { ...parsed.data, source: 'user' };
    db.putRunConfig(name, cfg);
    return c.json(cfg);
  });

  app.get('/api/projects/:name/logs/stream', (c) => {
    const file = logPathFor(logsDir, c.req.param('name'));
    return streamSSE(c, async (stream) => {
      const size = async () => (await stat(file).catch(() => null))?.size ?? 0;
      let offset = await size();
      await stream.writeSSE({ event: 'snapshot', data: JSON.stringify(await readLogTail(file, 200)) });
      while (!stream.aborted) {
        await stream.sleep(1_000);
        const current = await size();
        if (current < offset) {
          // 새로 실행되어 로그가 덮어써짐
          offset = current;
          await stream.writeSSE({ event: 'snapshot', data: JSON.stringify(await readLogTail(file, 200)) });
        } else if (current > offset) {
          const fh = await open(file, 'r');
          const buf = Buffer.alloc(current - offset);
          await fh.read(buf, 0, buf.length, offset);
          await fh.close();
          offset = current;
          await stream.writeSSE({ event: 'append', data: JSON.stringify(buf.toString('utf8')) });
        }
      }
    });
  });

  app.post('/api/projects/:name/open-editor', async (c) => {
    const p = db.getProject(c.req.param('name'));
    if (!p) return c.json({ error: 'not-found' }, 404);
    const r = await run('code', [p.path], { timeoutMs: 10_000 });
    return r.code === 0 ? c.json({ ok: true }) : c.json({ error: r.stderr.trim() || 'code 실행 실패' }, 500);
  });

  return app;
}
