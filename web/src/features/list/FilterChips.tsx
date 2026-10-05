import { motion } from 'motion/react';
import { cn } from '../../lib/cn';
import { FILTERS, type Filter } from '../../lib/status';

const LABEL: Record<Filter, string> = {
  all: '전체',
  running: '● 실행 중',
  active: '활성',
  dormant: '휴면',
  stale: '방치',
  dirty: '미커밋',
};

export function FilterChips({ value, onChange, counts }: { value: Filter; onChange: (f: Filter) => void; counts: Record<Filter, number> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FILTERS.map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={cn(
            'relative rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted transition hover:text-fg',
            value === f && 'border-accent/40 text-fg',
          )}
        >
          {value === f && <motion.span layoutId="chip" className="absolute inset-0 -z-10 rounded-full bg-accent/15" />}
          {LABEL[f]} <span className="tabular-nums opacity-60">{counts[f]}</span>
        </button>
      ))}
    </div>
  );
}
