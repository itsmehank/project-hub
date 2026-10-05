import { userInfo } from 'node:os';
import path from 'node:path';
import type { RuntimeProcess, RuntimeSnapshot } from '@hub/shared';
import type { CommandRunner } from '../exec';

const EXCLUDED = new Set([
  'zsh', 'bash', 'sh', 'fish', 'login', 'tmux', 'tmux: server', 'screen', 'vim', 'nvim', 'vi', 'emacs',
  'claude', 'git', 'lsof', 'ssh', 'less', 'more', 'man', 'top', 'htop', 'ps', 'sudo', 'tail', 'watch', 'code', 'cursor',
  'sleep', 'caffeinate',
]);

export function isExcludedCommand(name: string): boolean {
  const n = name.toLowerCase().replace(/^-/, '').replace(/\.exe$/, '');
  return EXCLUDED.has(n) || n.startsWith('code helper') || n.startsWith('cursor helper') || n.startsWith('electron');
}

function parseRecords(out: string, onField: (pid: number, tag: string, value: string) => void) {
  let pid = -1;
  for (const line of out.split('\n')) {
    if (!line) continue;
    const tag = line[0];
    const value = line.slice(1);
    if (tag === 'p') pid = Number(value);
    else if (pid > 0) onField(pid, tag, value);
  }
}

export function parseLsofCwd(out: string): Map<number, { name: string; cwd: string }> {
  const m = new Map<number, { name: string; cwd: string }>();
  parseRecords(out, (pid, tag, value) => {
    const entry = m.get(pid) ?? { name: '', cwd: '' };
    if (tag === 'c') entry.name = value;
    if (tag === 'n') entry.cwd = value;
    m.set(pid, entry);
  });
  return m;
}

export function parseLsofListen(out: string): Map<number, number[]> {
  const m = new Map<number, number[]>();
  parseRecords(out, (pid, tag, value) => {
    if (tag !== 'n') return;
    const port = Number(value.slice(value.lastIndexOf(':') + 1));
    if (!Number.isInteger(port)) return;
    const ports = m.get(pid) ?? [];
    if (!ports.includes(port)) ports.push(port);
    m.set(pid, ports.sort((a, b) => a - b));
  });
  return m;
}

export function parsePs(out: string): Map<number, { pgid: number; args: string }> {
  const m = new Map<number, { pgid: number; args: string }>();
  for (const line of out.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (match) m.set(Number(match[1]), { pgid: Number(match[2]), args: match[3] });
  }
  return m;
}

export function matchProject(cwd: string, projects: { name: string; path: string }[]): string | null {
  let best: { name: string; len: number } | null = null;
  for (const p of projects) {
    if ((cwd === p.path || cwd.startsWith(p.path + path.sep)) && (!best || p.path.length > best.len)) {
      best = { name: p.name, len: p.path.length };
    }
  }
  return best?.name ?? null;
}

export interface DetectInput {
  projects: { name: string; path: string }[];
  // 프로젝트 이름 → 허브가 띄운 프로세스 그룹. 다른 프로젝트의 재사용된 pgid와 섞이지 않게 프로젝트별로 본다.
  launched: Map<string, number>;
}

export async function detectRuntime(input: DetectInput, run: CommandRunner): Promise<RuntimeSnapshot> {
  const user = process.env.USER ?? userInfo().username;
  const [cwdR, listenR] = await Promise.all([
    run('lsof', ['+c', '0', '-a', '-d', 'cwd', '-u', user, '-Fpcn'], { timeoutMs: 5_000 }),
    run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'], { timeoutMs: 5_000 }),
  ]);
  // lsof는 일부 항목을 못 읽어도 exit 1을 내므로, 출력이 전혀 없을 때만 실패로 본다.
  if (!cwdR.stdout && cwdR.code !== 0) throw new Error(`lsof 실패: ${cwdR.stderr.trim()}`);

  const cwds = parseLsofCwd(cwdR.stdout);
  const listen = parseLsofListen(listenR.stdout);
  const candidates: { pid: number; project: string; cwd: string }[] = [];
  for (const [pid, { name, cwd }] of cwds) {
    if (isExcludedCommand(name)) continue;
    const project = matchProject(cwd, input.projects);
    if (project) candidates.push({ pid, project, cwd });
  }
  const snapshot: RuntimeSnapshot = { at: new Date().toISOString(), byProject: {} };
  if (candidates.length === 0) return snapshot;

  const psR = await run('ps', ['-o', 'pid=,pgid=,args=', '-p', candidates.map((c) => c.pid).join(',')], { timeoutMs: 5_000 });
  const ps = parsePs(psR.stdout);

  const groups = new Map<string, { project: string; members: { pid: number; cwd: string }[]; pgid: number }>();
  for (const c of candidates) {
    const info = ps.get(c.pid);
    if (!info) continue; // 그 사이 종료됨
    // lsof 이름이 달라도(claude.exe 등) 실제 실행 파일이 제외 대상이면 거른다.
    if (isExcludedCommand(path.basename(info.args.split(/\s+/)[0] ?? ''))) continue;
    const key = `${c.project}:${info.pgid}`;
    const g = groups.get(key) ?? { project: c.project, members: [], pgid: info.pgid };
    g.members.push({ pid: c.pid, cwd: c.cwd });
    groups.set(key, g);
  }

  for (const g of groups.values()) {
    const leader = g.members.find((m) => m.pid === g.pgid) ?? [...g.members].sort((a, b) => a.pid - b.pid)[0];
    const ports = [...new Set(g.members.flatMap((m) => listen.get(m.pid) ?? []))].sort((a, b) => a - b);
    const proc: RuntimeProcess = {
      pid: leader.pid,
      pgid: g.pgid,
      command: (ps.get(leader.pid)?.args ?? '').slice(0, 200),
      cwd: leader.cwd,
      ports,
      launchedByHub: input.launched.get(g.project) === g.pgid,
    };
    (snapshot.byProject[g.project] ??= []).push(proc);
  }
  for (const list of Object.values(snapshot.byProject)) list.sort((a, b) => a.pid - b.pid);
  return snapshot;
}

export class RuntimeCache {
  private value: RuntimeSnapshot | null = null;
  private loadedAt = 0;
  private inflight: Promise<RuntimeSnapshot> | null = null;

  constructor(
    private load: () => Promise<RuntimeSnapshot>,
    private ttlMs = 3_000,
    private clock: () => number = Date.now,
  ) {}

  get(): Promise<RuntimeSnapshot> {
    if (this.value && this.clock() - this.loadedAt < this.ttlMs) return Promise.resolve(this.value);
    this.inflight ??= this.load()
      .then((v) => {
        this.value = v;
        this.loadedAt = this.clock();
        return v;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  invalidate(): void {
    this.value = null;
  }
}
