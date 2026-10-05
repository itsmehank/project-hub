import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { RunSuggestion, RuntimeProcess, StartResult } from '@hub/shared';
import type { Db } from '../db';
import type { CommandRunner } from '../exec';
import { parseLsofCwd, type RuntimeCache } from './detect';

export interface LauncherDeps {
  db: Db;
  logsDir: string;
  runtime: RuntimeCache;
  run: CommandRunner;
}
export interface StartOptions {
  waitMs?: number;
  pollMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function logPathFor(logsDir: string, name: string): string {
  return path.join(logsDir, `${name.replace(/[^\w.-]+/g, '_')}.log`);
}

export function isAlive(id: number): boolean {
  try {
    process.kill(id, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export async function readLogTail(file: string, lines: number): Promise<string> {
  try {
    return (await readFile(file, 'utf8')).split('\n').slice(-lines).join('\n');
  } catch {
    return '';
  }
}

async function findPortHolder(run: CommandRunner, port: number): Promise<{ pid: number; command: string } | null> {
  // -Fpc 출력은 p/c 레코드라 parseLsofCwd로 이름만 얻는다(cwd는 비어 있음).
  const r = await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'], { timeoutMs: 5_000 });
  const first = [...parseLsofCwd(r.stdout).entries()][0];
  if (!first) return null;
  const [pid, { name }] = first;
  return { pid, command: name };
}

export async function startProject(
  deps: LauncherDeps,
  project: { name: string; path: string },
  cfg: RunSuggestion,
  opts: StartOptions = {},
): Promise<StartResult> {
  const waitMs = opts.waitMs ?? 30_000;
  const pollMs = opts.pollMs ?? 1_000;
  const cwd = path.resolve(project.path, cfg.cwd);
  if (!existsSync(cwd)) return { status: 'failed', logTail: `작업 디렉토리가 없습니다: ${cwd}` };

  if (cfg.expectedPort) {
    const holder = await findPortHolder(deps.run, cfg.expectedPort);
    if (holder) {
      const snap = await deps.runtime.get();
      const owner = Object.entries(snap.byProject).find(([, procs]) =>
        procs.some((p) => p.pid === holder.pid || p.pgid === holder.pid),
      );
      return {
        status: 'port-conflict',
        port: cfg.expectedPort,
        holder: { project: owner?.[0] ?? null, pid: holder.pid, command: holder.command },
      };
    }
  }

  mkdirSync(deps.logsDir, { recursive: true });
  const logPath = logPathFor(deps.logsDir, project.name);
  const fd = openSync(logPath, 'w');
  writeSync(fd, `[project-hub] ${new Date().toISOString()} $ ${cfg.command}\n`);
  const child = spawn('zsh', ['-lc', cfg.command], { cwd, detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  child.on('error', () => {});
  child.unref();
  const pgid = child.pid;
  if (!pgid) return { status: 'failed', logTail: await readLogTail(logPath, 30) };

  deps.db.putLaunch({ name: project.name, pid: pgid, pgid, command: cfg.command, startedAt: new Date().toISOString(), logPath });

  const deadline = Date.now() + waitMs;
  let procs: RuntimeProcess[] = [];
  while (Date.now() < deadline) {
    await sleep(pollMs);
    if (!isAlive(-pgid)) {
      deps.db.deleteLaunch(project.name);
      deps.runtime.invalidate();
      return { status: 'failed', logTail: await readLogTail(logPath, 30) };
    }
    deps.runtime.invalidate();
    procs = ((await deps.runtime.get()).byProject[project.name] ?? []).filter((p) => p.pgid === pgid);
    if (procs.some((p) => p.ports.length > 0)) return { status: 'running', processes: procs };
  }
  return { status: 'running-no-port', processes: procs };
}

export async function stopProcess(
  target: { pid: number; group: boolean },
  opts: { graceMs?: number; pollMs?: number } = {},
): Promise<'stopped' | 'killed' | 'not-running'> {
  const id = target.group ? -target.pid : target.pid;
  const graceMs = opts.graceMs ?? 5_000;
  const pollMs = opts.pollMs ?? 100;
  if (!isAlive(id)) return 'not-running';
  try {
    process.kill(id, 'SIGTERM');
  } catch {
    return 'not-running';
  }
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    if (!isAlive(id)) return 'stopped';
  }
  try {
    process.kill(id, 'SIGKILL');
  } catch {
    return 'stopped';
  }
  for (let i = 0; i < 20 && isAlive(id); i++) await sleep(50);
  return 'killed';
}

export function cleanupLaunches(db: Db): void {
  for (const l of db.listLaunches()) if (!isAlive(-l.pgid)) db.deleteLaunch(l.name);
}
