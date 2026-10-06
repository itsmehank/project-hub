import { describe, expect, it } from 'vitest';
import { PersonalInputSchema, RunConfigInputSchema, SUMMARY_JSON_SCHEMA, SummarySchema } from './index';

const valid = {
  oneLiner: '영화 예매 오픈 감시 봇',
  whatItIs: 'CGV 예매 페이지를 주기적으로 확인합니다.',
  features: ['예매 오픈 감지'],
  structure: [{ path: 'scripts/', role: '실행 스크립트' }],
  currentState: '안정화 단계',
  nextSteps: ['알림 채널 추가'],
  runSuggestion: { command: 'uv run python scripts/server.py', cwd: '.', expectedPort: 8010 },
};

describe('SummarySchema', () => {
  it('accepts a complete summary', () => {
    expect(SummarySchema.parse(valid).oneLiner).toBe('영화 예매 오픈 감시 봇');
  });
  it('accepts a null runSuggestion', () => {
    expect(SummarySchema.parse({ ...valid, runSuggestion: null }).runSuggestion).toBeNull();
  });
  it('rejects an empty oneLiner', () => {
    expect(() => SummarySchema.parse({ ...valid, oneLiner: '' })).toThrow();
  });
});

describe('RunConfigInputSchema', () => {
  it('rejects an empty command', () => {
    expect(() => RunConfigInputSchema.parse({ command: '', cwd: '.', expectedPort: null })).toThrow();
  });
});

describe('SUMMARY_JSON_SCHEMA', () => {
  it('is an object schema requiring oneLiner', () => {
    expect(SUMMARY_JSON_SCHEMA.type).toBe('object');
    expect(SUMMARY_JSON_SCHEMA.required).toContain('oneLiner');
  });
  it('has no $schema key (claude --json-schema rejects it)', () => {
    expect(SUMMARY_JSON_SCHEMA).not.toHaveProperty('$schema');
  });
});

describe('Summary v3 fields', () => {
  it('defaults techOverview/techStack for summaries stored before v3', () => {
    const old = { oneLiner: 'a', whatItIs: 'b', features: [], structure: [], currentState: '', nextSteps: [], runSuggestion: null };
    expect(SummarySchema.parse(old)).toMatchObject({ techOverview: '', techStack: [] });
  });
  it('requires techOverview and techStack from Claude', () => {
    expect(SUMMARY_JSON_SCHEMA.required).toEqual(expect.arrayContaining(['techOverview', 'techStack']));
  });
});

describe('PersonalInputSchema', () => {
  const ok = { lifecycle: 'focus', note: '다음: 배포', links: [{ label: '운영', url: 'https://example.com' }] };
  it('accepts a valid input, empty note and no links', () => {
    expect(PersonalInputSchema.safeParse(ok).success).toBe(true);
    expect(PersonalInputSchema.safeParse({ lifecycle: null, note: '', links: [] }).success).toBe(true);
  });
  it('accepts an upper-case scheme and trims label/url whitespace', () => {
    const r = PersonalInputSchema.parse({ lifecycle: null, note: '', links: [{ label: ' 봇 ', url: ' HTTPS://t.me/x ' }] });
    expect(r.links[0]).toEqual({ label: '봇', url: 'HTTPS://t.me/x' });
  });
  it('rejects too long notes, too many links, bad labels and non-http urls', () => {
    const bad = (o: object) => PersonalInputSchema.safeParse({ ...ok, ...o }).success;
    expect(bad({ note: 'a'.repeat(501) })).toBe(false);
    expect(bad({ links: Array.from({ length: 6 }, () => ok.links[0]) })).toBe(false);
    expect(bad({ links: [{ label: '', url: 'https://a.b' }] })).toBe(false);
    expect(bad({ links: [{ label: 'a'.repeat(31), url: 'https://a.b' }] })).toBe(false);
    expect(bad({ links: [{ label: 'x', url: 'javascript:alert(1)' }] })).toBe(false);
    expect(bad({ links: [{ label: 'x', url: 'ftp://a.b' }] })).toBe(false);
    expect(bad({ links: [{ label: 'x', url: 'not a url' }] })).toBe(false);
    expect(bad({ lifecycle: 'done' })).toBe(false);
  });
});

describe('PersonalInputSchema messages', () => {
  it('reports violations in Korean', () => {
    const msg = (input: object) => {
      const r = PersonalInputSchema.safeParse({ lifecycle: null, note: '', links: [], ...input });
      return r.success ? '' : r.error.issues[0].message;
    };
    for (const m of [
      msg({ links: [{ label: ' ', url: 'https://a.b' }] }),
      msg({ links: [{ label: 'a'.repeat(31), url: 'https://a.b' }] }),
      msg({ note: 'a'.repeat(501) }),
      msg({ links: Array.from({ length: 6 }, () => ({ label: 'x', url: 'https://a.b' })) }),
    ]) {
      expect(m).toMatch(/[가-힣]/);
    }
  });
});
