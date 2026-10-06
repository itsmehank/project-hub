import { decisionId, type ChecklistItem, type Decision, type DecisionInput, type Project } from '@hub/shared';

type SuggestionRef = Pick<DecisionInput, 'kind' | 'snapshot'>;

export const findDecision = (decisions: Decision[], s: SuggestionRef) => {
  const id = decisionId(s as Parameters<typeof decisionId>[0]);
  return decisions.find((d) => d.id === id);
};

export const progressOf = (items: ChecklistItem[]) => ({ done: items.filter((i) => i.done).length, total: items.length });

export function groupDecisions(decisions: Decision[]) {
  return {
    adopted: decisions.filter((d) => d.status === 'adopted'),
    held: decisions.filter((d) => d.status === 'held'),
    rejected: decisions.filter((d) => d.status === 'rejected'),
  };
}

// 분석 이후 바뀐 태그·메모와 결정 수(재분석 안내). 결정 삭제는 행이 사라져 세지 못한다(스펙 7.4 한계).
export function changesSince(projects: Project[], decisions: Decision[], generatedAt: string | null): number {
  if (!generatedAt) return 0;
  const t = new Date(generatedAt).getTime();
  const later = (iso: string | null) => !!iso && new Date(iso).getTime() > t;
  return projects.filter((p) => later(p.personal.updatedAt)).length + decisions.filter((d) => later(d.updatedAt)).length;
}

export const newChecklistItem = (text: string): ChecklistItem => ({
  id: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  text,
  done: false,
});

export function decisionTitle(d: Decision): string {
  const s = d.snapshot as Record<string, unknown>;
  if (d.kind === 'candidate') return String(s.project);
  if (d.kind === 'cleanup') return (s.projects as string[]).join(', ');
  return String(s.title);
}

export const adoptedCandidateFor = (decisions: Decision[], name: string) =>
  decisions.find((d) => d.kind === 'candidate' && d.status === 'adopted' && (d.snapshot as { project: string }).project === name);

export const pendingCleanupFor = (decisions: Decision[], name: string) =>
  decisions.some((d) => d.kind === 'cleanup' && d.status === 'adopted' && (d.snapshot as { projects: string[] }).projects.includes(name));
