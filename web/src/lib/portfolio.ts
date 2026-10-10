import type { Project, RuntimeSnapshot } from '@hub/shared';
import { isArchived } from './lifecycle';
import { groupByRepo } from './repo';
import { keyOf, mergeStack } from './stack';
import { activityOf, isRunning, type Activity } from './status';

export interface PortfolioStats {
  total: number;
  archived: number;
  running: number;
  openIssues: number;
  openPRs: number;
  activity: Record<Activity, number>;
  stacks: { name: string; count: number }[];
  weekly: number[];
  mostIssues: { name: string; count: number }[];
  mostActive: { name: string; commits: number }[];
}

const WEEKS = 26;

// 첫 화면 "한눈에 보기"용 규칙 기반 통계. Claude 없이 수집 데이터만으로 계산한다.
export function portfolioStats(all: Project[], runtime: RuntimeSnapshot | undefined, now: Date): PortfolioStats {
  // 보관 프로젝트는 지표에서 뺀다(실행 중이어도). 몇 개를 뺐는지는 archived로 알려 준다.
  const projects = all.filter((p) => !isArchived(p));
  const activity: Record<Activity, number> = { active: 0, dormant: 0, stale: 0, unknown: 0 };
  const stackCount = new Map<string, { name: string; count: number }>();
  const weekly = new Array<number>(WEEKS).fill(0);
  let openIssues = 0;
  let openPRs = 0;
  let running = 0;

  for (const p of projects) {
    activity[activityOf(p.git?.lastCommitAt ?? null, now)]++;
    if (isRunning(p, runtime)) running++;

    // "Astro"와 "Astro 7"처럼 같은 도구는 한 번만 센다. 분포에는 버전 없는 이름을 쓴다.
    for (const name of mergeStack([...p.stack, ...(p.summary?.techStack ?? [])])) {
      const key = keyOf(name);
      const entry = stackCount.get(key) ?? { name: name.replace(/\(.*?\)/g, '').replace(/\s+v?\d[\w.+-]*.*$/, '').trim(), count: 0 };
      entry.count++;
      stackCount.set(key, entry);
    }

    const w = p.git?.weeklyCommits ?? [];
    w.slice(-WEEKS).forEach((n, i) => (weekly[WEEKS - w.slice(-WEEKS).length + i] += n));
  }

  // 같은 저장소를 가리키는 폴더가 여럿이면 이슈·PR은 한 번만 센다.
  for (const [rep] of groupByRepo(projects)) {
    openIssues += rep.github?.openIssues.length ?? 0;
    openPRs += rep.github?.openPRs.length ?? 0;
  }

  const recent = (p: Project) => (p.git?.weeklyCommits ?? []).slice(-2).reduce((a, b) => a + b, 0);
  const issues = (p: Project) => (p.github?.openIssues.length ?? 0) + (p.github?.openPRs.length ?? 0);

  return {
    total: projects.length,
    archived: all.length - projects.length,
    running,
    openIssues,
    openPRs,
    activity,
    stacks: [...stackCount.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'en')).slice(0, 8),
    weekly,
    mostIssues: projects
      .filter((p) => issues(p) > 0)
      .sort((a, b) => issues(b) - issues(a))
      .slice(0, 3)
      .map((p) => ({ name: p.name, count: issues(p) })),
    mostActive: projects
      .filter((p) => recent(p) > 0)
      .sort((a, b) => recent(b) - recent(a))
      .slice(0, 3)
      .map((p) => ({ name: p.name, commits: recent(p) })),
  };
}
