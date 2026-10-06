import type { Insights } from '@hub/shared';

export interface ProjectInsights {
  candidate: (Insights['serviceCandidates'][number] & { rank: number }) | null;
  ideas: Insights['newIdeas'];
  cleanup: Insights['cleanup'];
}

// 첫 화면의 AI 제안 중 이 프로젝트를 언급한 것만 모은다(상세 화면에 표시).
export function insightsFor(name: string, ins: Insights | null): ProjectInsights | null {
  if (!ins) return null;
  const idx = ins.serviceCandidates.findIndex((c) => c.project === name);
  const result: ProjectInsights = {
    candidate: idx >= 0 ? { rank: idx + 1, ...ins.serviceCandidates[idx] } : null,
    ideas: ins.newIdeas.filter((i) => i.leverages.includes(name)),
    cleanup: ins.cleanup.filter((c) => c.projects.includes(name)),
  };
  return result.candidate || result.ideas.length || result.cleanup.length ? result : null;
}
