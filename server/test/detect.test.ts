import { describe, expect, it } from 'vitest';
import type { RuntimeSnapshot } from '@hub/shared';
import {
  RuntimeCache,
  detectRuntime,
  isExcludedCommand,
  matchProject,
  parseLsofCwd,
  parseLsofListen,
  parsePs,
} from '../src/runtime/detect';
import { fakeRunner } from './fakeRunner';

const CWD_OUT = [
  'p100', 'cnode', 'fcwd', 'n/root/alpha/web',
  'p101', 'czsh', 'fcwd', 'n/root/alpha',
  'p102', 'cPython', 'fcwd', 'n/root/beta',
  'p103', 'cnode', 'fcwd', 'n/elsewhere',
  'p104', 'cuv', 'fcwd', 'n/root/beta',
  'p105', 'cCode Helper (Plugin)', 'fcwd', 'n/root/alpha',
  'p106', 'ctelegram-bot', 'fcwd', 'n/root/gamma',
].join('\n');
const LISTEN_OUT = ['p100', 'f20', 'n*:5173', 'f21', 'n[::1]:5173', 'p102', 'f7', 'n127.0.0.1:8000', 'p999', 'f3', 'n*:22'].join('\n');
const PS_OUT = [
  '  100   100 node /root/alpha/web/node_modules/.bin/vite',
  '  102   104 /root/beta/.venv/bin/python -m uvicorn app:app',
  '  104   104 uv run uvicorn app:app',
  '  106   106 python bot.py',
].join('\n');

const PROJECTS = [
  { name: 'alpha', path: '/root/alpha' },
  { name: 'beta', path: '/root/beta' },
  { name: 'gamma', path: '/root/gamma' },
];

describe('parsers', () => {
  it('parses lsof cwd records', () => {
    const m = parseLsofCwd(CWD_OUT);
    expect(m.get(100)).toEqual({ name: 'node', cwd: '/root/alpha/web' });
    expect(m.get(105)?.name).toBe('Code Helper (Plugin)');
  });
  it('parses listening ports and dedupes them', () => {
    const m = parseLsofListen(LISTEN_OUT);
    expect(m.get(100)).toEqual([5173]);
    expect(m.get(102)).toEqual([8000]);
  });
  it('parses ps output', () => {
    expect(parsePs(PS_OUT).get(102)).toEqual({ pgid: 104, args: '/root/beta/.venv/bin/python -m uvicorn app:app' });
  });
  it('excludes shells, editors and tools', () => {
    for (const n of ['zsh', '-zsh', 'Code Helper (Plugin)', 'claude', 'claude.exe', 'git', 'tail', 'sleep']) expect(isExcludedCommand(n)).toBe(true);
    for (const n of ['node', 'Python', 'uv']) expect(isExcludedCommand(n)).toBe(false);
  });
  it('matches the longest project path and respects path boundaries', () => {
    const ps = [
      { name: 'alpha', path: '/root/alpha' },
      { name: 'alpha-2', path: '/root/alpha-2' },
    ];
    expect(matchProject('/root/alpha-2/src', ps)).toBe('alpha-2');
    expect(matchProject('/root/alpha', ps)).toBe('alpha');
    expect(matchProject('/root/alphabet', ps)).toBeNull();
  });
});

describe('detectRuntime', () => {
  it('groups project processes by process group and attaches ports', async () => {
    const run = fakeRunner((cmd, args) => {
      if (cmd === 'lsof' && args.includes('cwd')) return { stdout: CWD_OUT };
      if (cmd === 'lsof') return { stdout: LISTEN_OUT };
      if (cmd === 'ps') return { stdout: PS_OUT };
      return undefined;
    });
    const snap = await detectRuntime({ projects: PROJECTS, launched: new Map([['beta', 104], ['alpha', 106]]) }, run);
    expect(snap.byProject.alpha).toEqual([
      { pid: 100, pgid: 100, command: 'node /root/alpha/web/node_modules/.bin/vite', cwd: '/root/alpha/web', ports: [5173], launchedByHub: false },
    ]);
    expect(snap.byProject.beta).toEqual([
      { pid: 104, pgid: 104, command: 'uv run uvicorn app:app', cwd: '/root/beta', ports: [8000], launchedByHub: true },
    ]);
    expect(snap.byProject.gamma).toEqual([
      { pid: 106, pgid: 106, command: 'python bot.py', cwd: '/root/gamma', ports: [], launchedByHub: false },
    ]);
    const psCall = run.calls.find((c) => c.cmd === 'ps');
    expect(psCall?.args.at(-1)?.split(',').map(Number).sort()).toEqual([100, 102, 104, 106]);
  });

  it('excludes processes whose ps command is an excluded tool even if lsof names them differently', async () => {
    const run = fakeRunner((cmd, args) => {
      if (cmd === 'lsof' && args.includes('cwd')) return { stdout: 'p200\ncnode\nfcwd\nn/root/alpha\np201\ncnode\nfcwd\nn/root/alpha' };
      if (cmd === 'lsof') return { stdout: '' };
      if (cmd === 'ps') return { stdout: '  200   200 /opt/homebrew/bin/claude --resume abc\n  201   201 node server.js' };
      return undefined;
    });
    const snap = await detectRuntime({ projects: PROJECTS, launched: new Map() }, run);
    expect(snap.byProject.alpha?.map((p) => p.pid)).toEqual([201]);
  });

  it('returns an empty snapshot when no project process runs', async () => {
    const run = fakeRunner((cmd) => (cmd === 'lsof' ? { stdout: 'p1\ncnode\nfcwd\nn/elsewhere' } : undefined));
    expect((await detectRuntime({ projects: PROJECTS, launched: new Map() }, run)).byProject).toEqual({});
  });

  it('throws when lsof produces nothing and fails', async () => {
    const run = fakeRunner(() => ({ code: 1, stderr: 'lsof: boom' }));
    await expect(detectRuntime({ projects: PROJECTS, launched: new Map() }, run)).rejects.toThrow(/lsof/);
  });
});

describe('RuntimeCache', () => {
  it('caches within the TTL, dedupes concurrent loads and supports invalidate', async () => {
    let now = 0;
    let loads = 0;
    const snap: RuntimeSnapshot = { at: 't', byProject: {} };
    const cache = new RuntimeCache(async () => (loads++, snap), 3000, () => now);
    await Promise.all([cache.get(), cache.get()]);
    expect(loads).toBe(1);
    now = 2000;
    await cache.get();
    expect(loads).toBe(1);
    now = 3500;
    await cache.get();
    expect(loads).toBe(2);
    cache.invalidate();
    await cache.get();
    expect(loads).toBe(3);
  });
});

describe('RuntimeCache invalidate during an in-flight load', () => {
  it('does not return or cache a snapshot that started before invalidate()', async () => {
    let n = 0;
    let releaseFirst!: () => void;
    const cache = new RuntimeCache(async () => {
      const id = ++n;
      if (id === 1) await new Promise<void>((r) => (releaseFirst = r));
      return { at: String(id), byProject: {} };
    }, 60_000);
    const stale = cache.get();
    cache.invalidate();
    const fresh = cache.get();
    releaseFirst();
    expect((await stale).at).toBe('1');
    expect((await fresh).at).toBe('2');
    expect((await cache.get()).at).toBe('2');
  });
});
