import { describe, expect, it } from 'vitest';
import { RunConfigInputSchema, SUMMARY_JSON_SCHEMA, SummarySchema } from './index';

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
