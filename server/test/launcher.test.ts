import { mkdtempSync, realpathSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db';
import { runCommand } from '../src/exec';
import { RuntimeCache, detectRuntime } from '../src/runtime/detect';
import { cleanupLaunches, isAlive, startProject, stopProcess, type LauncherDeps } from '../src/runtime/launcher';

const toStop: number[] = [];
afterEach(async () => {
  for (const pgid of toStop.splice(0)) await stopProcess({ pid: pgid, group: true }, { graceMs: 500 });
});

function setup() {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'hub-launch-')));
  const project = { name: 'demo', path: dir };
  const db = openDb(':memory:');
  const runtime = new RuntimeCache(
    () => detectRuntime({ projects: [project], launchedPgids: new Set(db.listLaunches().map((l) => l.pgid)) }, runCommand),
    0,
  );
  const deps: LauncherDeps = { db, logsDir: path.join(dir, '.logs'), runtime, run: runCommand };
  return { project, db, deps };
}

const IDLE = `node -e "setInterval(()=>{},1000)"`;
const STUBBORN = `node -e "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"`;
const SERVER = `node -e "require('http').createServer((q,s)=>s.end('ok')).listen(0,'127.0.0.1',()=>console.log('listening'))"`;

describe('startProject', () => {
  it('starts a server, detects its port, then stops the group', async () => {
    const { project, db, deps } = setup();
    const result = await startProject(deps, project, { command: SERVER, cwd: '.', expectedPort: null }, { pollMs: 300 });
    expect(result.status).toBe('running');
    if (result.status !== 'running') return;
    const proc = result.processes[0];
    toStop.push(proc.pgid);
    expect(proc.launchedByHub).toBe(true);
    expect(db.getLaunch('demo')?.pgid).toBe(proc.pgid);
    const res = await fetch(`http://127.0.0.1:${proc.ports[0]}`);
    expect(await res.text()).toBe('ok');

    expect(await stopProcess({ pid: proc.pgid, group: true })).toBe('stopped');
    expect(isAlive(-proc.pgid)).toBe(false);
  });

  it('fails fast with the log tail when the command exits', async () => {
    const { project, db, deps } = setup();
    const started = Date.now();
    const result = await startProject(deps, project, { command: 'echo boom; exit 3', cwd: '.', expectedPort: null }, { pollMs: 200 });
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.logTail).toContain('boom');
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(db.getLaunch('demo')).toBeNull();
  });

  it('fails when the working directory does not exist', async () => {
    const { project, deps } = setup();
    const result = await startProject(deps, project, { command: 'true', cwd: 'nope', expectedPort: null });
    expect(result).toMatchObject({ status: 'failed' });
    if (result.status === 'failed') expect(result.logTail).toContain('nope');
  });

  it('reports a port conflict before launching', async () => {
    const { project, deps } = setup();
    const server: Server = createServer().listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const port = (server.address() as AddressInfo).port;
    try {
      const result = await startProject(deps, project, { command: SERVER, cwd: '.', expectedPort: port });
      expect(result).toMatchObject({ status: 'port-conflict', port, holder: { pid: process.pid, project: null } });
    } finally {
      server.close();
    }
  });

  it('returns running-no-port for long-running processes without a port', async () => {
    const { project, deps } = setup();
    const result = await startProject(deps, project, { command: IDLE, cwd: '.', expectedPort: null }, { waitMs: 1500, pollMs: 300 });
    expect(result.status).toBe('running-no-port');
    if (result.status === 'running-no-port') toStop.push(result.processes[0].pgid);
  });
});

describe('stopProcess', () => {
  it('escalates to SIGKILL when SIGTERM is ignored', async () => {
    const { project, deps } = setup();
    const result = await startProject(
      deps,
      project,
      { command: STUBBORN, cwd: '.', expectedPort: null },
      { waitMs: 1000, pollMs: 300 },
    );
    if (result.status !== 'running-no-port') throw new Error(`unexpected ${result.status}`);
    const pgid = result.processes[0].pgid;
    expect(await stopProcess({ pid: pgid, group: true }, { graceMs: 500 })).toBe('killed');
    expect(isAlive(-pgid)).toBe(false);
  });

  it('returns not-running for dead processes', async () => {
    expect(await stopProcess({ pid: 999_999, group: false })).toBe('not-running');
  });
});

describe('cleanupLaunches', () => {
  it('removes records of dead process groups', () => {
    const db = openDb(':memory:');
    db.putLaunch({ name: 'dead', pid: 999_999, pgid: 999_999, command: 'x', startedAt: 't', logPath: '/x' });
    cleanupLaunches(db);
    expect(db.listLaunches()).toEqual([]);
  });
});
