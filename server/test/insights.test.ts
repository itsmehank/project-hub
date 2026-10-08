import { describe, expect, it } from 'vitest';
import { EMPTY_PERSONAL, INSIGHTS_JSON_SCHEMA, type Decision, type Insights, type Project, type TrendDigest } from '@hub/shared';
import { openDb } from '../src/db';
import type { RunResult } from '../src/exec';
import { INSIGHTS_PROMPT_VERSION, InsightsManager, buildInsightsPrompt, generateInsights, insightsSourceHash } from '../src/insights';
import { fakeRunner } from './fakeRunner';

const NOW = new Date('2026-10-06T00:00:00Z');

function project(name: string, oneLiner: string, summaryAt = 't1'): Project {
  return {
    name,
    path: `/r/${name}`,
    isGit: true,
    remoteUrl: null,
    githubRepo: null,
    stack: ['Python'],
    readmeExcerpt: null,
    git: {
      branch: 'main',
      lastCommitAt: '2026-10-03T00:00:00Z',
      dirtyCount: 0,
      hasUpstream: true,
      ahead: 0,
      behind: 0,
      recentCommits: [],
      weeklyCommits: [],
    },
    github: null,
    errors: {},
    updatedAt: '',
    summary: {
      oneLiner,
      whatItIs: `${name} 설명`,
      features: ['기능1'],
      structure: [],
      techOverview: '',
      techStack: ['FastAPI'],
      currentState: '',
      nextSteps: [],
      runSuggestion: null,
    },
    summaryAt,
    runConfig: null,
    personal: EMPTY_PERSONAL,
  };
}

const INSIGHTS: Insights = {
  profile: { headline: '데이터 자동화형 개발자', traits: ['a'], strengths: ['b'] },
  serviceCandidates: [
    { project: 'movie-sniper', pitch: 'p', targetUsers: 'u', monetization: 'm', readiness: 'high', nextSteps: ['s'] },
    { project: 'ghost-project', pitch: 'p', targetUsers: 'u', monetization: 'm', readiness: 'low', nextSteps: [] },
  ],
  newIdeas: [{ title: 'i', pitch: 'p', leverages: ['mx5-bot', 'nope'], firstStep: 'f' }],
  wildIdeas: [{ title: 'w', pitch: 'p', leverages: ['movie-sniper', 'nope'], firstStep: 'f', contrast: 'c' }],
  cleanup: [
    { projects: ['nope'], suggestion: 's', reason: 'r' },
    { projects: ['mx5-bot', 'movie-sniper'], suggestion: 's', reason: 'r' },
  ],
};

const PROJECTS = [project('movie-sniper', '영화 추천'), project('mx5-bot', '싼타페 도우미 봇')];

const claudeReturning = (payload: unknown) =>
  fakeRunner((cmd) => (cmd === 'claude' ? { stdout: JSON.stringify({ is_error: false, structured_output: payload }) } : undefined));

describe('buildInsightsPrompt', () => {
  it('lists every project with its one-liner and overall stats', () => {
    const prompt = buildInsightsPrompt(PROJECTS, [], NOW);
    expect(prompt).toContain('movie-sniper');
    expect(prompt).toContain('싼타페 도우미 봇');
    expect(prompt).toContain('전체 2개');
  });
});

describe('generateInsights', () => {
  it('calls the given model and removes project names that do not exist', async () => {
    const run = claudeReturning(INSIGHTS);
    const ins = await generateInsights(PROJECTS, [], run, { model: 'opus' }, NOW);
    expect(run.calls[0].args).toEqual(expect.arrayContaining(['--model', 'opus', '--json-schema']));
    expect(run.calls[0].opts?.timeoutMs).toBe(180_000);
    expect(ins.serviceCandidates.map((c) => c.project)).toEqual(['movie-sniper']);
    expect(ins.newIdeas[0].leverages).toEqual(['mx5-bot']);
    expect(ins.wildIdeas[0].leverages).toEqual(['movie-sniper']);
    expect(ins.cleanup).toEqual([{ projects: ['mx5-bot', 'movie-sniper'], suggestion: 's', reason: 'r' }]);
  });
});

describe('insightsSourceHash', () => {
  it('changes when the project set or any summary changes', () => {
    const a = insightsSourceHash(PROJECTS);
    expect(insightsSourceHash([...PROJECTS])).toBe(a);
    expect(insightsSourceHash([PROJECTS[0]])).not.toBe(a);
    expect(insightsSourceHash([PROJECTS[0], project('mx5-bot', '싼타페 도우미 봇', 't2')])).not.toBe(a);
  });
});

describe('InsightsManager', () => {
  function manager(claude: () => RunResult, projects = PROJECTS) {
    const db = openDb(':memory:');
    const run = fakeRunner((cmd) => (cmd === 'claude' ? claude() : undefined));
    return { db, run, mgr: new InsightsManager({ db, run, model: 'opus', projects: () => projects }) };
  }
  const ok = (): RunResult => ({ code: 0, stdout: JSON.stringify({ is_error: false, structured_output: INSIGHTS }), stderr: '' });

  it('generates once per source hash and stores the result', async () => {
    const { mgr, run } = manager(ok);
    expect(mgr.get()).toMatchObject({ insights: null, generating: false });
    expect(mgr.maybeGenerate()).toBe(true);
    expect(mgr.get().generating).toBe(true);
    expect(mgr.regenerate()).toBe(false);
    await mgr.whenIdle();
    expect(mgr.get().insights?.profile.headline).toBe('데이터 자동화형 개발자');
    expect(mgr.get().generatedAt).not.toBeNull();
    expect(mgr.maybeGenerate()).toBe(false);
    expect(run.calls).toHaveLength(1);
  });

  it('survives a restart by reading the stored insights', async () => {
    const { mgr, db } = manager(ok);
    mgr.maybeGenerate();
    await mgr.whenIdle();
    const again = new InsightsManager({ db, run: fakeRunner(() => undefined), model: 'opus', projects: () => PROJECTS });
    expect(again.get().insights?.profile.headline).toBe('데이터 자동화형 개발자');
    expect(again.maybeGenerate()).toBe(false);
  });

  it('keeps previous insights and records the error when claude fails', async () => {
    let fail = false;
    const { mgr } = manager(() => (fail ? { code: 1, stdout: '', stderr: 'boom' } : ok()));
    mgr.maybeGenerate();
    await mgr.whenIdle();
    fail = true;
    expect(mgr.regenerate()).toBe(true);
    await mgr.whenIdle();
    expect(mgr.get().insights?.profile.headline).toBe('데이터 자동화형 개발자');
    expect(mgr.get().error).toContain('boom');
  });

  it('does nothing when there are no summarized projects', () => {
    const { mgr } = manager(ok, []);
    expect(mgr.maybeGenerate()).toBe(false);
  });
});

describe('InsightsManager follow-ups', () => {
  it('runs once more after the current run when a refresh asked for it meanwhile', async () => {
    let projects = PROJECTS;
    const db = openDb(':memory:');
    let calls = 0;
    let release!: () => void;
    const run = fakeRunner((cmd) => {
      if (cmd !== 'claude') return undefined;
      calls++;
      return { stdout: JSON.stringify({ is_error: false, structured_output: INSIGHTS }) };
    });
    const slowRun: typeof run = Object.assign(
      async (...a: Parameters<typeof run>) => {
        if (calls === 0) await new Promise<void>((r) => (release = r));
        return run(...a);
      },
      { calls: run.calls },
    );
    const mgr = new InsightsManager({ db, run: slowRun, model: 'opus', projects: () => projects });
    expect(mgr.maybeGenerate()).toBe(true);
    projects = [PROJECTS[0], project('mx5-bot', '싼타페 도우미 봇', 't2')];
    expect(mgr.maybeGenerate()).toBe(false);
    release();
    await mgr.whenIdle();
    await mgr.whenIdle();
    expect(calls).toBe(2);
  });

  it('does not retry automatically after a failure for the same summaries', async () => {
    const db = openDb(':memory:');
    let calls = 0;
    const run = fakeRunner((cmd) => (cmd === 'claude' ? (calls++, { code: 1, stderr: 'boom' }) : undefined));
    const mgr = new InsightsManager({ db, run, model: 'opus', projects: () => PROJECTS });
    expect(mgr.maybeGenerate()).toBe(true);
    await mgr.whenIdle();
    expect(mgr.maybeGenerate()).toBe(false);
    expect(calls).toBe(1);
    expect(mgr.regenerate()).toBe(true);
    await mgr.whenIdle();
    expect(calls).toBe(2);
  });

  it('ignores a stored blob that no longer matches the schema', () => {
    const db = openDb(':memory:');
    db.setMeta('insights', JSON.stringify({ content: { profile: 'old' }, sourceHash: 'x', generatedAt: 't' }));
    const mgr = new InsightsManager({ db, run: fakeRunner(() => undefined), model: 'opus', projects: () => PROJECTS });
    expect(mgr.get().insights).toBeNull();
  });
});

describe('insights prompt v2', () => {
  const prompt = buildInsightsPrompt(PROJECTS, [], NOW);
  it('requires evidence, consistent counts and grounded money math', () => {
    expect(prompt).toContain('근거');
    expect(prompt).toContain('가정');
    expect(prompt).toContain('측정');
    expect(prompt).toContain('법적');
  });
});

describe('insights prompt v3', () => {
  it('includes tags, notes and archived marks', () => {
    const a = { ...project('a', 'x'), personal: { lifecycle: 'focus' as const, note: '결제 붙이기', links: [], updatedAt: 't' } };
    const b = { ...project('b', 'y'), personal: { lifecycle: 'archive' as const, note: '', links: [], updatedAt: 't' } };
    const prompt = buildInsightsPrompt([a, b], [], NOW);
    expect(prompt).toContain('- 내 태그: 집중');
    expect(prompt).toContain('- 내 메모: 결제 붙이기');
    expect(prompt).toContain('보관(추천 대상 아님)');
  });
  it('lists decisions with rules per status, and reasons for rejections', () => {
    const d = (id: string, status: Decision['status'], kind: Decision['kind'], snapshot: Decision['snapshot'], reason = ''): Decision =>
      ({ id, kind, status, reason, snapshot, projects: [], checklist: [], createdAt: 't', updatedAt: 't' });
    const prompt = buildInsightsPrompt([project('a', 'x')], [
      d('candidate:a', 'adopted', 'candidate', { project: 'a', pitch: '', targetUsers: '', monetization: '', readiness: 'high', nextSteps: [] }),
      d('idea:x', 'rejected', 'idea', { title: '쇼핑몰', pitch: '', leverages: [], firstStep: '' }, '관심 없음'),
      d('cleanup:a', 'held', 'cleanup', { projects: ['a'], suggestion: '보관하기', reason: '' }),
    ], NOW);
    expect(prompt).toContain('## 내 결정');
    expect(prompt).toContain('[채택] 서비스 후보: a');
    expect(prompt).toContain('[거절] 아이디어: 쇼핑몰 — 이유: 관심 없음');
    expect(prompt).toContain('[보류] 정리 제안: a — 보관하기');
    expect(prompt).toMatch(/채택한 항목은 다시 제안하지/);
  });
  it('says there are no decisions when the table is empty', () => {
    expect(buildInsightsPrompt([project('a', 'x')], [], NOW)).toContain('아직 내린 결정이 없습니다');
  });
  it('bumps the prompt version to 3', () => {
    expect(INSIGHTS_PROMPT_VERSION).toBeGreaterThanOrEqual(3);
  });
});

describe('insights prompt v4', () => {
  const digest = (date: string, title: string): TrendDigest => ({
    date,
    model: 's',
    createdAt: 't',
    items: [{ category: 'ai', region: '해외', title, summary: 's', ideaAngle: 'a', sourceName: 'n', sourceUrl: 'https://x.dev', publishedAt: date }],
  });
  it('asks for wild ideas opposite to the profile', () => {
    const prompt = buildInsightsPrompt([project('a', 'x')], [], NOW);
    expect(prompt).toContain('wildIdeas');
    expect(prompt).toContain('정반대');
    expect(INSIGHTS_PROMPT_VERSION).toBe(4);
  });
  it('adds recent trends only when there are some', () => {
    expect(buildInsightsPrompt([project('a', 'x')], [], NOW)).not.toContain('## 최근 이슈');
    const prompt = buildInsightsPrompt([project('a', 'x')], [], NOW, [digest('2026-10-05', '새 에이전트 도구')]);
    expect(prompt).toContain('## 최근 이슈');
    expect(prompt).toContain('[AI·개발] 새 에이전트 도구');
  });
  it('keeps the JSON schema requiring wildIdeas', () => {
    expect(INSIGHTS_JSON_SCHEMA.required).toContain('wildIdeas');
  });
});

describe('stored insights from before v4', () => {
  it('fills wildIdeas with an empty list', () => {
    const db = openDb(':memory:');
    const old = { profile: { headline: 'h', traits: [], strengths: [] }, serviceCandidates: [], newIdeas: [], cleanup: [] };
    db.setMeta('insights', JSON.stringify({ content: old, sourceHash: 'x', generatedAt: 't' }));
    const m = new InsightsManager({ db, run: fakeRunner(() => undefined), model: 'opus', projects: () => [] });
    expect(m.get().insights?.wildIdeas).toEqual([]);
  });
});
