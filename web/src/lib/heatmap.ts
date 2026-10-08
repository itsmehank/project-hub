import { addDays, daysBetween, toLocalDate, type Project } from '@hub/shared';
import { isArchived } from './lifecycle';
import { groupByRepo } from './repo';

export const DAYS = 182;
export interface DayCount {
  date: string;
  count: number;
}
export interface HeatCell extends DayCount {
  level: 0 | 1 | 2 | 3 | 4;
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const parse = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function dayLabel(date: string): string {
  const d = parse(date);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY[d.getDay()]})`;
}

// 첫 화면 잔디: 보관 제외, 같은 저장소는 대표 폴더 하나만, 새로고침한 날짜가 오늘과 다르면 날짜를 맞춰 옮긴다.
export function dailyTotals(projects: Project[], now: Date): DayCount[] {
  const today = toLocalDate(now);
  const totals = new Array<number>(DAYS).fill(0);
  let any = false;
  for (const [rep] of groupByRepo(projects.filter((p) => !isArchived(p)))) {
    const daily = rep.git?.dailyCommits;
    const until = rep.git?.dailyUntil;
    if (!daily || !until) continue;
    any = true;
    const shift = daysBetween(until, today);
    daily.forEach((n, i) => {
      const j = i - shift;
      if (j >= 0 && j < DAYS) totals[j] += n;
    });
  }
  if (!any) return [];
  return totals.map((count, i) => ({ date: addDays(today, i - (DAYS - 1)), count }));
}

export function heatmapGrid(days: DayCount[]): { weeks: (HeatCell | null)[][]; monthLabels: string[] } {
  if (days.length === 0) return { weeks: [], monthLabels: [] };
  const max = Math.max(1, ...days.map((d) => d.count));
  const level = (n: number): HeatCell['level'] => (n === 0 ? 0 : (Math.min(4, Math.max(1, Math.ceil((n / max) * 4))) as HeatCell['level']));
  const lead = (parse(days[0].date).getDay() + 6) % 7; // 월요일 = 0
  const cells: (HeatCell | null)[] = [...new Array(lead).fill(null), ...days.map((d) => ({ ...d, level: level(d.count) }))];
  while (cells.length % 7) cells.push(null);
  const weeks: (HeatCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  let prev = -1;
  const monthLabels = weeks.map((w) => {
    // 1일이 낀 주가 새 달 라벨을 받도록 주의 마지막 칸 기준으로 달을 정한다.
    const last = w.findLast((c) => c !== null)!;
    const month = parse(last.date).getMonth();
    const label = month !== prev ? `${month + 1}월` : '';
    prev = month;
    return label;
  });
  return { weeks, monthLabels };
}
