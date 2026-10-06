import type { Lifecycle, Personal, PersonalInput, Project } from '@hub/shared';

export const LIFECYCLE_LABEL: Record<Lifecycle, { label: string; short: string; cls: string }> = {
  focus: { label: '집중', short: '집중', cls: 'border-accent/40 bg-accent/10 text-accent' },
  maintain: { label: '유지', short: '유지', cls: 'border-live/30 bg-live/10 text-live' },
  launch: { label: '공개 준비', short: '공개', cls: 'border-accent2/40 bg-accent2/10 text-accent2' },
  experiment: { label: '실험', short: '실험', cls: 'border-line bg-white/5 text-muted' },
  archive: { label: '보관', short: '보관', cls: 'border-line bg-white/5 text-muted/70' },
};

export type TagFilter = 'all' | Lifecycle | 'none';
export const TAG_FILTERS: TagFilter[] = ['all', 'focus', 'maintain', 'launch', 'experiment', 'none', 'archive'];
export const TAG_FILTER_LABEL: Record<TagFilter, string> = {
  all: '전체',
  focus: '집중',
  maintain: '유지',
  launch: '공개 준비',
  experiment: '실험',
  none: '미분류',
  archive: '보관',
};

export const isArchived = (p: Project) => p.personal.lifecycle === 'archive';

// "전체"는 보관을 뺀다. 보관은 "보관"을 골랐을 때만 보인다(실행 중이어도 예외 없음).
export function filterByTag(projects: Project[], tag: TagFilter): Project[] {
  if (tag === 'all') return projects.filter((p) => !isArchived(p));
  if (tag === 'none') return projects.filter((p) => p.personal.lifecycle === null);
  return projects.filter((p) => p.personal.lifecycle === tag);
}

export const archivedCount = (projects: Project[]) => projects.filter(isArchived).length;

// 태그만 바꾸고 메모·링크는 그대로 둔다(PUT은 전체 교체라 나머지를 같이 보내야 한다).
export const withLifecycle = (personal: Personal, lifecycle: Lifecycle | null): PersonalInput => ({
  lifecycle,
  note: personal.note,
  links: personal.links,
});

// 메모 입력창에서 포커스가 빠질 때: 바뀐 내용이 있으면 저장하고, 없으면 닫는다(입력한 글을 조용히 버리지 않는다).
export const noteBlurAction = (draft: string, stored: string): 'save' | 'close' => (draft.trim() === stored ? 'close' : 'save');
