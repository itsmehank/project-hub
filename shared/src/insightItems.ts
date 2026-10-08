import { z } from 'zod';

// AI 제안 항목 스키마. InsightsSchema와 결정 snapshot 검증이 함께 쓴다.
export const ServiceCandidateSchema = z.object({
  project: z.string(),
  pitch: z.string(),
  targetUsers: z.string(),
  monetization: z.string(),
  readiness: z.enum(['high', 'medium', 'low']),
  nextSteps: z.array(z.string()),
});
export const NewIdeaSchema = z.object({ title: z.string(), pitch: z.string(), leverages: z.array(z.string()), firstStep: z.string() });
export const CleanupSchema = z.object({ projects: z.array(z.string()), suggestion: z.string(), reason: z.string() });

// 성향과 정반대로 제안하는 과감한 아이디어. 반대 방향이 어떤 점인지 contrast에 적는다.
export const WildIdeaSchema = NewIdeaSchema.extend({ contrast: z.string() });
