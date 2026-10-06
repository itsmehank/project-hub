import { describe, expect, it } from 'vitest';
import { DecisionInputSchema, decisionId, decisionProjects, sha1Hex } from './index';

const candidate = { project: 'kr-by-claude', pitch: 'p', targetUsers: 't', monetization: 'm', readiness: 'medium' as const, nextSteps: ['a', 'b'] };
const cleanup = { projects: ['나-프로젝트', 'DataBatcher-main', 'DataBatcher'], suggestion: 's', reason: 'r' };
const idea = { title: '주식 일지 앱', pitch: 'p', leverages: ['kr-by-claude'], firstStep: 'f' };

describe('sha1Hex', () => {
  it('matches known vectors, including UTF-8 text', () => {
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(sha1Hex('한글')).toBe('de510ee18f9ec63431a640b3fe6823ca9013da91');
    expect(sha1Hex('a'.repeat(1000))).toBe('291e9a6c66994949b57ba5e650361e98fc36b1ba');
  });
});

describe('decisionId', () => {
  it('builds ids per kind; cleanup sorts project names', () => {
    expect(decisionId({ kind: 'candidate', snapshot: candidate })).toBe('candidate:kr-by-claude');
    expect(decisionId({ kind: 'cleanup', snapshot: cleanup })).toBe(`cleanup:${[...cleanup.projects].sort((a, b) => a.localeCompare(b, 'en')).join(',')}`);
    expect(decisionId({ kind: 'idea', snapshot: idea })).toBe(`idea:${sha1Hex('주식 일지 앱').slice(0, 12)}`);
  });
  it('treats a different idea title as a different decision', () => {
    expect(decisionId({ kind: 'idea', snapshot: { title: '주식 일지 앱 ' } })).not.toBe(decisionId({ kind: 'idea', snapshot: idea }));
  });
  it('lists related projects per kind', () => {
    expect(decisionProjects({ kind: 'candidate', snapshot: candidate })).toEqual(['kr-by-claude']);
    expect(decisionProjects({ kind: 'idea', snapshot: idea })).toEqual(['kr-by-claude']);
  });
});

describe('DecisionInputSchema', () => {
  it('validates the snapshot by kind', () => {
    expect(DecisionInputSchema.safeParse({ kind: 'candidate', status: 'adopted', snapshot: candidate, projects: ['kr-by-claude'] }).success).toBe(true);
    expect(DecisionInputSchema.safeParse({ kind: 'candidate', status: 'adopted', snapshot: idea, projects: [] }).success).toBe(false);
    expect(DecisionInputSchema.safeParse({ kind: 'idea', status: 'maybe', snapshot: idea, projects: [] }).success).toBe(false);
    expect(DecisionInputSchema.safeParse({ kind: 'idea', status: 'rejected', reason: 'a'.repeat(201), snapshot: idea, projects: [] }).success).toBe(false);
  });
  it('defaults the reason to an empty string', () => {
    expect(DecisionInputSchema.parse({ kind: 'idea', status: 'held', snapshot: idea, projects: [] }).reason).toBe('');
  });
});
