const KEY = 'hub.homeTab';
export const HOME_TABS = ['status', 'candidates', 'cleanup', 'ideas', 'trends'] as const;
export type HomeTab = (typeof HOME_TABS)[number];

const isHomeTab = (v: unknown): v is HomeTab => (HOME_TABS as readonly unknown[]).includes(v);

// 마지막으로 본 탭을 기억한다. 저장소가 막혀 있거나 값이 이상하면 현황 탭으로 연다.
export function readHomeTab(getStorage: () => Pick<Storage, 'getItem'> | null): HomeTab {
  try {
    const v = getStorage()?.getItem(KEY);
    return isHomeTab(v) ? v : 'status';
  } catch {
    return 'status';
  }
}

export function writeHomeTab(getStorage: () => Pick<Storage, 'setItem'> | null, tab: HomeTab): void {
  try {
    getStorage()?.setItem(KEY, tab);
  } catch {
    // 저장하지 못해도 화면 동작에는 영향이 없다.
  }
}

// 탭 목록 키보드 이동(←/→는 순환, Home/End는 처음/끝). 해당 없는 키는 null.
export function nextTab(cur: HomeTab, key: string): HomeTab | null {
  const i = HOME_TABS.indexOf(cur);
  const n = HOME_TABS.length;
  if (key === 'ArrowRight') return HOME_TABS[(i + 1) % n];
  if (key === 'ArrowLeft') return HOME_TABS[(i - 1 + n) % n];
  if (key === 'Home') return HOME_TABS[0];
  if (key === 'End') return HOME_TABS[n - 1];
  return null;
}
