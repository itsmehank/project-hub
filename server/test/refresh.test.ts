import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RefreshEvent, Summary } from '@hub/shared';
import { openDb } from '../src/db';
import { runCommand, type CommandRunner, type RunResult } from '../src/exec';
import { RefreshManager, runRefresh, type RefreshDeps } from '../src/refresh';
import { commit, git, makeRepo } from './gitFixture';

const SUMMARY: Summary = {
  oneLiner: '요약',
  whatItIs: '설명',
  features: [],
  structure: [], techOverview: '', techStack: [],
  currentState: '',
  nextSteps: [],
  runSuggestion: null,
};
const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '' });

function testRunner(opts: { claude?: () => RunResult; ghLoggedIn?: boolean; delayMs?: number; gitBroken?: boolean } = {}) {
  let summaryCalls = 0;
  const run: CommandRunner = async (cmd, args, o) => {
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (cmd === 'git' && opts.gitBroken) return { code: -1, stdout: '', stderr: '[timeout after 10000ms]' };
    if (cmd === 'git') return runCommand(cmd, args, o);
    if (cmd === 'gh' && args[0] === 'auth') return { code: opts.ghLoggedIn === false ? 1 : 0, stdout: '', stderr: '' };
    if (cmd === 'gh' && args[0] === 'api') return ok(args[3].includes('actions/runs') ? '{"workflow_runs":[]}' : '[]');
    if (cmd === 'claude' && args[0] === '--version') return ok('2.1');
    if (cmd === 'claude') {
      summaryCalls++;
      return opts.claude ? opts.claude() : ok(JSON.stringify({ is_error: false, structured_output: SUMMARY }));
    }
    if (cmd === 'lsof') return ok('');
    return { code: 127, stdout: '', stderr: `unexpected ${cmd}` };
  };
  return { run, summaryCalls: () => summaryCalls };
}

async function makeRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'hub-root-'));
  const alpha = path.join(root, 'alpha');
  mkdirSync(alpha);
  await makeRepo(alpha);
  writeFileSync(path.join(alpha, 'README.md'), '알파 프로젝트입니다.');
  await commit(alpha, 'init');
  await git(alpha, 'remote', 'add', 'origin', 'git@github.com:me/alpha.git');
  mkdirSync(path.join(root, 'plain'));
  writeFileSync(path.join(root, 'plain', 'README.md'), '평범한 폴더입니다.');
  return root;
}

async function refreshOnce(deps: RefreshDeps, force = false) {
  const events: RefreshEvent[] = [];
  await runRefresh(deps, { force }, (e) => events.push(e));
  return events;
}

describe('runRefresh', () => {
  it('collects every stage and emits progress', async () => {
    const root = await makeRoot();
    const db = openDb(':memory:');
    const { run } = testRunner();
    const events = await refreshOnce({ root, exclude: [], db, run, summaryModel: 'sonnet' });

    const alpha = db.getProject('alpha')!;
    expect(alpha).toMatchObject({ isGit: true, githubRepo: 'me/alpha', readmeExcerpt: '알파 프로젝트입니다.', errors: {} });
    expect(alpha.github?.ci.status).toBe('none');
    const plain = db.getProject('plain')!;
    expect(plain).toMatchObject({ isGit: false, git: null, githubRepo: null, github: null });
    expect(db.getSummary('alpha')?.content.oneLiner).toBe('요약');
    expect(db.getSummary('plain')?.content.oneLiner).toBe('요약');
    expect(db.getMeta('lastRefreshAt')).not.toBeNull();

    expect(events[0]).toEqual({ type: 'started', total: 6 });
    const progress = events.filter((e) => e.type === 'project-updated');
    expect(progress).toHaveLength(6);
    expect(progress.map((e) => (e.type === 'project-updated' ? e.done : 0))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('removes projects whose folder disappeared', async () => {
    const root = await makeRoot();
    const db = openDb(':memory:');
    const { run } = testRunner();
    await refreshOnce({ root, exclude: [], db, run, summaryModel: 's' });
    rmSync(path.join(root, 'plain'), { recursive: true });
    const events = await refreshOnce({ root, exclude: [], db, run, summaryModel: 's' });
    expect(events).toContainEqual({ type: 'project-removed', name: 'plain' });
    expect(db.getProject('plain')).toBeNull();
    expect(db.getSummary('plain')).toBeNull();
  });

  it('reuses cached summaries unless forced', async () => {
    const root = await makeRoot();
    const db = openDb(':memory:');
    const t = testRunner();
    const deps = { root, exclude: [], db, run: t.run, summaryModel: 's' };
    await refreshOnce(deps);
    expect(t.summaryCalls()).toBe(2);
    await refreshOnce(deps);
    expect(t.summaryCalls()).toBe(2);
    await refreshOnce(deps, true);
    expect(t.summaryCalls()).toBe(4);
  });

  it('re-summarizes when a clean repo becomes dirty but not when more files change', async () => {
    const root = await makeRoot();
    const db = openDb(':memory:');
    const t = testRunner();
    const deps = { root, exclude: [], db, run: t.run, summaryModel: 's' };
    await refreshOnce(deps);
    expect(t.summaryCalls()).toBe(2);
    writeFileSync(path.join(root, 'alpha', 'wip1.txt'), 'x');
    await refreshOnce(deps);
    expect(t.summaryCalls()).toBe(3);
    writeFileSync(path.join(root, 'alpha', 'wip2.txt'), 'x');
    await refreshOnce(deps);
    expect(t.summaryCalls()).toBe(3);
  });

  it('keeps the previous summary and records the error when claude fails', async () => {
    const root = await makeRoot();
    const db = openDb(':memory:');
    await refreshOnce({ root, exclude: [], db, run: testRunner().run, summaryModel: 's' });
    const failing = testRunner({ claude: () => ({ code: 0, stdout: 'not json', stderr: '' }) });
    const events = await refreshOnce({ root, exclude: [], db, run: failing.run, summaryModel: 's' }, true);
    expect(db.getSummary('alpha')?.content.oneLiner).toBe('요약');
    expect(db.getProject('alpha')?.errors.summary).toContain('JSON');
    expect(events.at(-1)?.type).toBe('done');

    await refreshOnce({ root, exclude: [], db, run: testRunner().run, summaryModel: 's' }, true);
    expect(db.getProject('alpha')?.errors.summary).toBeUndefined();
  });

  it('keeps previous git and GitHub data and records an error when git fails', async () => {
    const root = await makeRoot();
    const db = openDb(':memory:');
    await refreshOnce({ root, exclude: [], db, run: testRunner().run, summaryModel: 's' });
    await refreshOnce({ root, exclude: [], db, run: testRunner({ gitBroken: true }).run, summaryModel: 's' });
    const alpha = db.getProject('alpha')!;
    expect(alpha).toMatchObject({ isGit: true, githubRepo: 'me/alpha' });
    expect(alpha.git?.recentCommits[0].subject).toBe('init');
    expect(alpha.github).not.toBeNull();
    expect(alpha.errors.git).toContain('timeout');
  });

  it('skips GitHub when gh is not logged in', async () => {
    const root = await makeRoot();
    const db = openDb(':memory:');
    const events = await refreshOnce({ root, exclude: [], db, run: testRunner({ ghLoggedIn: false }).run, summaryModel: 's' });
    expect(db.getProject('alpha')?.github).toBeNull();
    const gh = events.filter((e) => e.type === 'project-updated' && e.step === 'github');
    expect(gh.every((e) => e.type === 'project-updated' && e.skipped)).toBe(true);
  });
});

describe('RefreshManager', () => {
  it('refuses a second start while running and notifies subscribers', async () => {
    const root = await makeRoot();
    const db = openDb(':memory:');
    const mgr = new RefreshManager({ root, exclude: [], db, run: testRunner({ delayMs: 20 }).run, summaryModel: 's' });
    const events: RefreshEvent[] = [];
    mgr.subscribe((e) => events.push(e));
    expect(mgr.start()).toBe(true);
    expect(mgr.running).toBe(true);
    expect(mgr.start()).toBe(false);
    await mgr.whenIdle();
    expect(mgr.running).toBe(false);
    expect(events[0]).toEqual({ type: 'state', running: true });
    expect(events.at(-1)).toEqual({ type: 'state', running: false });
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });
});
