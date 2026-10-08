import { daysBetween, toLocalDate, type TrendCategory, type TrendItem } from '@hub/shared';
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
