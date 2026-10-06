import type { Activity } from '../../lib/status';

export const ACTIVITY: Record<Activity, { label: string; dot: string }> = {
  active: { label: '활성', dot: 'bg-live shadow-[0_0_8px] shadow-live/60' },
  dormant: { label: '휴면', dot: 'bg-warn' },
  stale: { label: '방치', dot: 'bg-bad/80' },
  unknown: { label: '기록 없음', dot: 'bg-muted/50' },
};

// 커밋 기록이 없는 경우를 git 아님 / 커밋 없음으로 나눠 부른다.
export const activityLabel = (act: Activity, isGit: boolean) => (act === 'unknown' ? (isGit ? '커밋 없음' : 'git 아님') : ACTIVITY[act].label);
