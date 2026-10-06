import { describe, expect, it } from 'vitest';
import type { Insights } from '@hub/shared';
import { insightsFor } from './insightsFor';

const ins: Insights = {
  profile: { headline: '', traits: [], strengths: [] },
  serviceCandidates: [
    { project: 'a', pitch: 'p', targetUsers: 't', monetization: 'm', readiness: 'medium', nextSteps: ['s1'] },
    { project: 'b', pitch: 'p', targetUsers: 't', monetization: 'm', readiness: 'high', nextSteps: [] },
  ],
  newIdeas: [{ title: '아이디어', pitch: 'p', leverages: ['a', 'c'], firstStep: 'f' }],
  cleanup: [{ projects: ['a', 'd'], suggestion: '합치기', reason: 'r' }],
};

describe('insightsFor', () => {
  it('collects every AI suggestion that mentions the project', () => {
    expect(insightsFor('a', ins)).toEqual({
      candidate: { rank: 1, ...ins.serviceCandidates[0] },
      ideas: [ins.newIdeas[0]],
      cleanup: [ins.cleanup[0]],
    });
  });
  it('returns null when the project is not mentioned', () => {
    expect(insightsFor('zzz', ins)).toBeNull();
    expect(insightsFor('a', null)).toBeNull();
  });
});
