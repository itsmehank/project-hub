import type { ChecklistItem } from '@hub/shared';

// 체크리스트 저장은 전체 교체(PUT)라, 빠르게 연달아 바꾸면 앞의 변경이 덮어써질 수 있다.
// 편집은 항상 가장 최근 목록 위에 적용하고, 저장은 한 번에 하나씩 순서대로 보낸다.
export function createChecklistQueue(
  initial: ChecklistItem[],
  send: (items: ChecklistItem[]) => Promise<unknown>,
  onChange: (items: ChecklistItem[]) => void,
) {
  let items = initial;
  let chain: Promise<unknown> = Promise.resolve();
  let pending = 0;
  return {
    edit(fn: (items: ChecklistItem[]) => ChecklistItem[]): Promise<unknown> {
      items = fn(items);
      onChange(items);
      const snapshot = items;
      pending++;
      const run = chain.then(() => send(snapshot));
      // 실패는 호출한 쪽(run)으로 알리고, 내부 체인은 다음 저장을 위해 계속 이어간다.
      chain = run.finally(() => pending--).catch(() => {});
      return run;
    },
    // 서버 값으로 맞춘다. 보내는 중인 변경이 있으면 그 결과를 덮지 않도록 건너뛴다.
    reset(next: ChecklistItem[]) {
      if (pending === 0) items = next;
      return pending === 0;
    },
  };
}
