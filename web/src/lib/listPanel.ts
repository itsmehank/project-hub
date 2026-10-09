const KEY = 'hub.listCollapsed';
export const LIST_WIDTH = { open: 400, collapsed: 56 } as const;

// 브라우저 저장소는 막혀 있을 수 있다(사생활 보호 모드 등). 실패하면 펼친 상태로 본다.
// localStorage 접근 자체가 던질 수 있어, 저장소를 얻는 getter까지 try 안에서 호출한다.
export function readCollapsed(getStorage: () => Pick<Storage, 'getItem'> | null): boolean {
  try {
    return getStorage()?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function writeCollapsed(getStorage: () => Pick<Storage, 'setItem'> | null, value: boolean): void {
  try {
    getStorage()?.setItem(KEY, value ? '1' : '0');
  } catch {
    // 저장하지 못해도 화면 동작에는 영향이 없다.
  }
}

export const isCollapseShortcut = (e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; repeat?: boolean }) =>
  !e.repeat && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b';
