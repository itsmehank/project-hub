import { daysBetween, toLocalDate, type TrendCategory, type TrendDigest, type TrendItem } from '@hub/shared';
import { dayLabel } from './heatmap';

export const CATEGORY_LABEL: Record<TrendCategory, string> = {
  ai: 'AI·개발',
  consumer: '앱·서비스',
  life: '생활·소비',
  invest: '투자·모빌리티·데이터',
};
export type CategoryFilter = 'all' | TrendCategory;

// 날짜 머리글: 오늘/어제는 말로, 그 이전은 '10/6(월)' 형식
export function trendDateLabel(date: string, now: Date): string {
  const back = daysBetween(date, toLocalDate(now));
  return back === 0 ? '오늘' : back === 1 ? '어제' : dayLabel(date);
}

export const filterItems = (items: TrendItem[], f: CategoryFilter) => (f === 'all' ? items : items.filter((i) => i.category === f));

// 링크는 http(s)만 허용 (javascript: 등 차단)
export function isHttpUrl(url: string): boolean {
  try {
    const p = new URL(url).protocol;
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
}

// 첫 페이지(최신 갱신본)와 이전 페이지를 날짜로 합친다. 중복 날짜는 첫 페이지 우선, 최신순 정렬
export function mergeDigests(first: TrendDigest[], older: TrendDigest[]): TrendDigest[] {
  const byDate = new Map<string, TrendDigest>();
  for (const d of [...older, ...first]) byDate.set(d.date, d);
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
