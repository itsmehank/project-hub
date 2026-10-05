import type { ProjectErrors, RefreshEvent, RefreshStep, StoredProject } from '@hub/shared';
import { collectGitHub, parseGithubRepo, RateLimitError } from './collectors/github';
import { collectGit, type GitCollectResult } from './collectors/git';
import { collectMeta, type DocsBundle } from './collectors/meta';
import { computeSourceHash, generateSummary } from './collectors/summary';
import type { Db } from './db';
import type { CommandRunner } from './exec';
import { checkHealth } from './health';
import { diffProjects, scanProjects } from './scanner';
import { mapLimit } from './util/limit';

export interface RefreshDeps {
  root: string;
  exclude: string[];
  db: Db;
  run: CommandRunner;
  summaryModel: string;
  now?: () => Date;
}

export interface RefreshController {
  readonly running: boolean;
  start(opts?: { force?: boolean }): boolean;
  subscribe(fn: (e: RefreshEvent) => void): () => void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

export async function runRefresh(deps: RefreshDeps, opts: { force?: boolean }, emit: (e: RefreshEvent) => void) {
  const { db, run } = deps;
  const now = deps.now ?? (() => new Date());
  const startedAt = Date.now();

  const [health, found] = await Promise.all([checkHealth(run), scanProjects(deps.root, deps.exclude)]);
  const { removed } = diffProjects(
    db.listProjects().map((p) => p.name),
    found.map((f) => f.name),
  );
  for (const name of removed) {
    db.deleteProject(name);
    emit({ type: 'project-removed', name });
  }

  const total = found.length * 3;
  let done = 0;
  emit({ type: 'started', total });
  const progress = (name: string, step: RefreshStep, skipped: boolean) =>
    emit({ type: 'project-updated', name, step, skipped, done: ++done, total });

  // 1단계: git + meta (로컬)
  const local = new Map<string, { docs: DocsBundle; tree: string; git: GitCollectResult | null }>();
  await mapLimit(found, 8, async (f) => {
    const prev = db.getProject(f.name);
    const errors: ProjectErrors = { ...(prev?.errors ?? {}) };
    let gitRes: GitCollectResult | null = null;
    try {
      gitRes = await collectGit(f.path, run, now());
      delete errors.git;
    } catch (e) {
      errors.git = message(e);
    }
    let meta: Awaited<ReturnType<typeof collectMeta>> | null = null;
    try {
      meta = await collectMeta(f.path);
      delete errors.meta;
    } catch (e) {
      errors.meta = message(e);
    }
    const githubRepo = parseGithubRepo(gitRes?.remoteUrl ?? null);
    const project: StoredProject = {
      name: f.name,
      path: f.path,
      isGit: gitRes !== null,
      remoteUrl: gitRes?.remoteUrl ?? null,
      githubRepo,
      stack: meta?.stack ?? prev?.stack ?? [],
      readmeExcerpt: meta?.readmeExcerpt ?? prev?.readmeExcerpt ?? null,
      git: gitRes?.git ?? null,
      github: githubRepo && prev?.githubRepo === githubRepo ? prev.github : null,
      errors,
      updatedAt: now().toISOString(),
    };
    db.upsertProject(project);
    if (meta) local.set(f.name, { docs: meta.docs, tree: meta.tree, git: gitRes });
    progress(f.name, 'local', false);
  });

  // 2단계: GitHub
  let rateLimited = false;
  await mapLimit(found, 4, async (f) => {
    const p = db.getProject(f.name);
    if (!p?.githubRepo || !health.gh || rateLimited) {
      progress(f.name, 'github', true);
      return;
    }
    try {
      p.github = await collectGitHub(p.githubRepo, run, now());
      delete p.errors.github;
    } catch (e) {
      if (e instanceof RateLimitError) rateLimited = true;
      p.errors.github = message(e);
    }
    db.upsertProject(p);
    progress(f.name, 'github', false);
  });

  // 3단계: Claude 요약 (변경된 프로젝트만)
  await mapLimit(found, 2, async (f) => {
    const p = db.getProject(f.name);
    const ctx = local.get(f.name);
    if (!p || !ctx || !health.claude) {
      progress(f.name, 'summary', true);
      return;
    }
    const hash = computeSourceHash({
      head: p.git?.recentCommits[0]?.hash ?? null,
      dirty: (p.git?.dirtyCount ?? 0) > 0,
      docMtimes: ctx.docs.docMtimes,
    });
    if (!opts.force && db.getSummary(f.name)?.sourceHash === hash) {
      progress(f.name, 'summary', true);
      return;
    }
    try {
      const summary = await generateSummary(
        { name: f.name, docs: ctx.docs, tree: ctx.tree, commits: p.git?.recentCommits ?? [] },
        run,
        { model: deps.summaryModel },
      );
      db.putSummary(f.name, hash, summary);
      delete p.errors.summary;
    } catch (e) {
      p.errors.summary = message(e);
    }
    db.upsertProject(p);
    progress(f.name, 'summary', false);
  });

  db.setMeta('lastRefreshAt', now().toISOString());
  emit({ type: 'done', durationMs: Date.now() - startedAt });
}

export class RefreshManager implements RefreshController {
  private listeners = new Set<(e: RefreshEvent) => void>();
  private current: Promise<void> | null = null;

  constructor(private deps: RefreshDeps) {}

  get running(): boolean {
    return this.current !== null;
  }

  subscribe(fn: (e: RefreshEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  start(opts: { force?: boolean } = {}): boolean {
    if (this.current) return false;
    const emit = (e: RefreshEvent) => this.listeners.forEach((fn) => fn(e));
    this.current = runRefresh(this.deps, opts, emit)
      .catch((e) => emit({ type: 'error', message: message(e) }))
      .finally(() => {
        this.current = null;
        emit({ type: 'state', running: false });
      });
    emit({ type: 'state', running: true });
    return true;
  }

  whenIdle(): Promise<void> {
    return this.current ?? Promise.resolve();
  }
}
