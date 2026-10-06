import type { Project } from '@hub/shared';

// 같은 저장소를 가리키는 폴더(예: DataBatcher 두 폴더)를 하나로 보기 위한 키.
export const repoKeyOf = (p: Project) => p.githubRepo ?? p.remoteUrl ?? `local:${p.name}`;

const byName = (a: Project, b: Project) => a.name.localeCompare(b.name, 'en');

export function groupByRepo(projects: Project[]): Project[][] {
  const groups = new Map<string, Project[]>();
  for (const p of projects) {
    const key = repoKeyOf(p);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.values()].map((g) => [...g].sort(byName)).sort((a, b) => byName(a[0], b[0]));
}
