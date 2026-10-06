import { useRef, type HTMLAttributes, type MouseEvent } from 'react';
import { cn } from '../../lib/cn';

// Aceternity 스타일 카드: 마우스 위치를 따라 테두리와 배경에 빛이 번진다.
export function SpotlightCard({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--x', `${e.clientX - r.left}px`);
    el.style.setProperty('--y', `${e.clientY - r.top}px`);
  };
  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      className={cn('group relative overflow-hidden rounded-xl border border-line bg-[#0b0b10] p-4 transition-colors hover:border-accent/30', className)}
      {...props}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: 'radial-gradient(320px circle at var(--x) var(--y), rgba(167,139,250,0.12), transparent 70%)' }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
