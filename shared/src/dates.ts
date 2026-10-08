const pad = (n: number) => String(n).padStart(2, '0');

// 로컬 날짜 'YYYY-MM-DD'. 주간 리뷰·잔디·이슈 묶음이 모두 이 기준을 쓴다.
export const toLocalDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const utcDay = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

export const daysBetween = (from: string, to: string) => Math.round(utcDay(to) - utcDay(from));

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return toLocalDate(new Date(y, m - 1, d + n));
}
