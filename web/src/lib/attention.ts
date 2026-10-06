import type { Project } from '@hub/shared';
import { isArchived } from './lifecycle';
import { groupByRepo } from './repo';
import { activityOf } from './status';

export interface AttentionSignals {
  unpushed: { name: string; ahead: number }[];
  stalePRs: { name: string; count: number; oldestDays: number }[];
  forgotten: { name: string; dirty: number; lastCommitAt: string | null }[];
  noBackup: { name: string; reason: 'no-remote' | 'not-git' }[];
}

export const STALE_PR_DAYS = 30;
const DAY = 86_400_000;

// 행동이 필요한 신호(주의)와 참고 목록(백업 없음)을 수집 데이터만으로 계산한다.
export function attentionSignals(projects: Project[], now: Date): AttentionSignals {
  const unpushed = projects
    .filter((p) => (p.git?.ahead ?? 0) > 0)
    .map((p) => ({ name: p.name, ahead: p.git!.ahead }))
    .sort((a, b) => b.ahead - a.ahead || a.name.localeCompare(b.name, 'en'));

  // 같은 저장소의 폴더가 여럿이면 대표(이름순 첫 번째) 하나로 센다.
  const stalePRs = groupByRepo(projects)
    .map(([rep]) => {
      const ages = (rep.github?.openPRs ?? [])
        .map((x) => Math.floor((now.getTime() - new Date(x.createdAt).getTime()) / DAY))
        .filter((d) => d >= STALE_PR_DAYS);
      return { name: rep.name, count: ages.length, oldestDays: Math.max(0, ...ages) };
    })
    .filter((x) => x.count > 0)
    .sort((a, b) => b.oldestDays - a.oldestDays);

  const lastAt = (p: Project) => (p.git?.lastCommitAt ? new Date(p.git.lastCommitAt).getTime() : 0);
  const forgotten = projects
    .filter(
      (p) => !isArchived(p) && (p.git?.dirtyCount ?? 0) > 0 && ['dormant', 'stale'].includes(activityOf(p.git?.lastCommitAt ?? null, now)),
    )
    .sort((a, b) => lastAt(a) - lastAt(b))
    .map((p) => ({ name: p.name, dirty: p.git!.dirtyCount, lastCommitAt: p.git!.lastCommitAt }));

  const noBackup = projects
    .filter((p) => !['archive', 'experiment'].includes(p.personal.lifecycle ?? '') && (!p.isGit || !p.remoteUrl))
    .map((p) => ({ name: p.name, reason: p.isGit ? ('no-remote' as const) : ('not-git' as const) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));

  return { unpushed, stalePRs, forgotten, noBackup };
}

export const attentionCount = (s: AttentionSignals) => s.unpushed.length + s.stalePRs.length + s.forgotten.length;
