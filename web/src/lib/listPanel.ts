const KEY = 'hub.listCollapsed';
export const LIST_WIDTH = { open: 400, collapsed: 56 } as const;

// 브라우저 저장소는 막혀 있을 수 있다(사생활 보호 모드 등). 실패하면 펼친 상태로 본다.
export function readCollapsed(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return storage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function writeCollapsed(storage: Pick<Storage, 'setItem'> | null, value: boolean): void {
  try {
    storage?.setItem(KEY, value ? '1' : '0');
  } catch {
    // 저장하지 못해도 화면 동작에는 영향이 없다.
  }
}

export const isCollapseShortcut = (e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }) =>
  (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b';
