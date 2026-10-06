import { open, stat } from 'node:fs/promises';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  ISSUE_KINDS,
  ChecklistSchema,
  DecisionInputSchema,
  decisionId,
  PersonalInputSchema,
  RunConfigInputSchema,
  RunSuggestionSchema,
  type Health,
  type InsightsResponse,
  type IssueKind,
  type IssueList,
  type LogChunk,
  type Project,
  type ProjectsResponse,
  type RefreshEvent,
  type RunConfig,
  type RunSuggestion,
  type StoredProject,
} from '@hub/shared';
import { fetchIssues } from './collectors/issues';
import type { Db } from './db';
import type { CommandRunner } from './exec';
import type { RefreshController } from './refresh';
import type { RuntimeCache } from './runtime/detect';
import { checkPortConflict, isAlive, logPathFor, readLogTail, startProject, stopProcess, type StartOptions } from './runtime/launcher';
import { appInstalled as defaultAppInstalled, resolveEditor } from './editor';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
// 상태를 바꾸는 요청을 보낼 수 있는 출처: 웹 앱(5199)과 API 자신(4310)뿐.
const DEFAULT_ORIGIN_PORTS = ['4310', '5199'];

function isAllowedOrigin(origin: string, ports: string[]): boolean {
  try {
    const u = new URL(origin);
    return LOCAL_HOSTS.has(u.hostname) && ports.includes(u.port);
  } catch {
    return false;
  }
}

export interface Launcher {
  start: typeof startProject;
  stop: typeof stopProcess;
  checkPort: (port: number) => Promise<{ project: string | null; pid: number; command: string } | null>;
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
  originPorts?: string[];
  insights?: InsightsController;
  appInstalled?: (app: string) => boolean;
  editor?: string;
}

export interface InsightsController {
  get(): InsightsResponse;
  regenerate(): boolean;
}

export function toProject(db: Db, p: StoredProject): Project {
  const s = db.getSummary(p.name);
  return {
    ...p,
    summary: s?.content ?? null,
    summaryAt: s?.createdAt ?? null,
    runConfig: db.getRunConfig(p.name),
    personal: db.getPersonal(p.name),
  };
}

// buf 끝에 완성되지 않은 UTF-8 문자가 있으면 그 시작 위치를, 아니면 전체 길이를 돌려준다.
export function completeUtf8Length(buf: Buffer): number {
  for (let i = buf.length - 1, back = 0; i >= 0 && back < 4; i--, back++) {
    const byte = buf[i];
    if ((byte & 0xc0) === 0x80) continue; // 이어지는 바이트
    const need = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
    return buf.length - i >= need ? buf.length : i;
  }
  return buf.length;
}

function sameSuggestion(shown: unknown, current: RunSuggestion): boolean {
  const parsed = RunSuggestionSchema.safeParse(shown);
  return (
    parsed.success &&
    parsed.data.command === current.command &&
    parsed.data.cwd === current.cwd &&
    parsed.data.expectedPort === current.expectedPort
  );
}

async function body(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown>> {
  const b = await c.req.json().catch(() => ({}));
  return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
}

export function createApp(deps: AppDeps) {
  const { db, refresh, runtime, run, logsDir } = deps;
  const launcher: Launcher = deps.launcher ?? {
    start: startProject,
    stop: stopProcess,
    checkPort: (port) => checkPortConflict({ run, runtime }, port),
  };
  const app = new Hono();

  // 로컬 API를 다른 웹페이지가 조작하지 못하게 막는다.
  // Host 검사는 DNS 리바인딩을, JSON 강제와 Sec-Fetch-Site 검사는 교차 사이트 단순 POST를 막는다.
  app.use('/api/*', async (c, next) => {
    const host = (c.req.header('host') ?? new URL(c.req.url).host).replace(/:\d+$/, '');
    if (!LOCAL_HOSTS.has(host)) return c.json({ error: 'forbidden-host' }, 403);
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      // MIME을 정확히 비교한다. 'text/plain;application/json' 같은 값은 브라우저가 preflight 없이 보낸다.
      const mime = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (mime !== 'application/json') return c.json({ error: 'json-required' }, 415);
      const site = c.req.header('sec-fetch-site');
      if (site && site !== 'same-origin' && site !== 'none') return c.json({ error: 'cross-site' }, 403);
      const origin = c.req.header('origin');
      if (origin && !isAllowedOrigin(origin, deps.originPorts ?? DEFAULT_ORIGIN_PORTS)) return c.json({ error: 'forbidden-origin' }, 403);
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

  app.get('/api/refresh/status', (c) => c.json(refresh.status()));

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

  // 이슈 전체 페이지. GitHub 호출이 많아 60초 동안 메모리에 둔다.
  const issueCache = new Map<string, { at: number; list: IssueList }>();
  app.get('/api/projects/:name/issues', async (c) => {
    const name = c.req.param('name');
    const kind = c.req.query('kind') ?? 'open';
    if (!(ISSUE_KINDS as readonly string[]).includes(kind)) return c.json({ error: 'bad-kind' }, 400);
    const repo = db.getProject(name)?.githubRepo;
    if (!repo) return c.json({ error: 'no-github' }, 404);
    const key = `${name}:${kind}`;
    const hit = issueCache.get(key);
    if (hit && Date.now() - hit.at < 60_000) return c.json(hit.list);
    try {
      const list = await fetchIssues(repo, kind as IssueKind, run);
      issueCache.set(key, { at: Date.now(), list });
      return c.json(list);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  });

  app.get('/api/insights', (c) =>
    c.json<InsightsResponse>(deps.insights?.get() ?? { insights: null, generatedAt: null, generating: false, error: null }),
  );
  app.post('/api/insights/regenerate', (c) =>
    deps.insights?.regenerate() ? c.json({ started: true }, 202) : c.json({ error: 'already-running' }, 409),
  );

  app.get('/api/runtime', async (c) => c.json(await runtime.get()));
  app.get('/api/health', async (c) => c.json(await deps.health()));

  // 같은 프로젝트를 동시에 두 번 실행하지 않게 막는다(탭 두 개, 빠른 연타).
  const starting = new Set<string>();

  app.post('/api/projects/:name/start', async (c) => {
    const name = c.req.param('name');
    const p = db.getProject(name);
    if (!p) return c.json({ error: 'not-found' }, 404);
    if (starting.has(name)) return c.json({ error: 'already-starting' }, 409);
    // await 전에 잠근다. 검사와 잠금 사이에 await가 있으면 동시에 온 두 요청이 모두 통과한다.
    starting.add(name);
    try {
      const launch = db.getLaunch(name);
      if (launch && isAlive(-launch.pgid)) return c.json({ error: 'already-running' }, 409);
      const b = await body(c);
      let cfg: RunConfig | null = db.getRunConfig(name);
      if (!cfg) {
        const suggestion = db.getSummary(name)?.content.runSuggestion;
        if (!suggestion) return c.json({ error: 'no-run-config' }, 404);
        // 포트 충돌은 승인 전에 알려 주고, 충돌이면 승인된 명령을 저장하지 않는다.
        const holder = suggestion.expectedPort ? await launcher.checkPort(suggestion.expectedPort) : null;
        const portConflict = holder && suggestion.expectedPort ? { port: suggestion.expectedPort, holder } : undefined;
        if (b.approve !== true) return c.json({ error: 'approval-required', suggestion, portConflict }, 428);
        // 사용자가 대화상자에서 본 명령과 지금 저장된 추천이 같을 때만 실행한다(그 사이 새로고침으로 바뀔 수 있다).
        if (!sameSuggestion(b.suggestion, suggestion)) return c.json({ error: 'suggestion-changed', suggestion, portConflict }, 409);
        if (portConflict) return c.json({ status: 'port-conflict', ...portConflict });
        cfg = { ...suggestion, source: 'approved' };
        db.putRunConfig(name, cfg);
      }
      const result = await launcher.start({ db, logsDir, runtime, run }, { name, path: p.path }, cfg, deps.startOptions);
      return c.json(result);
    } finally {
      starting.delete(name);
    }
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

  // 내 태그·메모·바로가기 링크. 본문 전체로 교체한다.
  app.put('/api/projects/:name/personal', async (c) => {
    const name = c.req.param('name');
    if (!db.getProject(name)) return c.json({ error: 'not-found' }, 404);
    const parsed = PersonalInputSchema.safeParse(await body(c));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    return c.json(db.putPersonal(name, parsed.data));
  });

  app.get('/api/decisions', (c) => c.json(db.listDecisions()));

  // AI 제안 결정. ID는 snapshot에서 다시 계산해 URL과 맞을 때만 저장한다.
  app.put('/api/decisions/:id', async (c) => {
    const id = c.req.param('id');
    const parsed = DecisionInputSchema.safeParse(await body(c));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const expected = decisionId(parsed.data);
    if (expected !== id) return c.json({ error: 'id-mismatch', expected }, 400);
    return c.json(db.putDecision(id, parsed.data));
  });

  app.put('/api/decisions/:id/checklist', async (c) => {
    const parsed = ChecklistSchema.safeParse((await body(c)).items);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const d = db.putChecklist(c.req.param('id'), parsed.data);
    return d ? c.json(d) : c.json({ error: 'not-found' }, 404);
  });

  app.delete('/api/decisions/:id', (c) =>
    db.deleteDecision(c.req.param('id')) ? c.json({ ok: true }) : c.json({ error: 'not-found' }, 404),
  );

  // 로그 폴링: offset 이후에 붙은 내용만 돌려준다.
  // 새 실행(gen이 바뀜)이거나 파일이 줄었으면 꼬리 전체를 다시 보낸다. 새 로그가 이전 offset보다 커져도 섞이지 않게 gen으로 구분한다.
  app.get('/api/projects/:name/logs', async (c) => {
    const name = c.req.param('name');
    const file = logPathFor(logsDir, name);
    const gen = db.getLaunch(name)?.startedAt ?? '';
    const size = (await stat(file).catch(() => null))?.size ?? 0;
    const offset = Number(c.req.query('offset'));
    const clientGen = c.req.query('gen');
    if (!Number.isFinite(offset) || c.req.query('offset') === undefined || size < offset || (clientGen !== undefined && clientGen !== gen)) {
      return c.json<LogChunk>({ text: await readLogTail(file, 200), offset: size, reset: true, gen });
    }
    if (size === offset) return c.json<LogChunk>({ text: '', offset, reset: false, gen });
    const fh = await open(file, 'r');
    try {
      const buf = Buffer.alloc(size - offset);
      await fh.read(buf, 0, buf.length, offset);
      // 여러 바이트 문자(한글 등)가 잘린 채 끝나면 그 앞까지만 보내고 나머지는 다음 조회로 미룬다.
      const end = completeUtf8Length(buf);
      return c.json<LogChunk>({ text: buf.subarray(0, end).toString('utf8'), offset: offset + end, reset: false, gen });
    } finally {
      await fh.close();
    }
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
    const editor = resolveEditor(p.stack, deps.appInstalled ?? defaultAppInstalled, deps.editor);
    // 설치된 편집기가 없으면 Finder로 폴더를 연다.
    const r = await run('open', editor ? ['-a', editor, p.path] : [p.path], { timeoutMs: 10_000 });
    if (r.code === 0) return c.json({ ok: true, editor: editor ?? 'Finder' });
    return c.json({ error: `${editor ?? 'Finder'}로 열지 못했습니다: ${r.stderr.trim() || '알 수 없는 오류'}` }, 500);
  });

  return app;
}
