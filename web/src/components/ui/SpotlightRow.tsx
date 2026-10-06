import { useRef, type HTMLAttributes, type MouseEvent } from 'react';
import { cn } from '../../lib/cn';

export function SpotlightRow({ active, className, children, ...props }: HTMLAttributes<HTMLDivElement> & { active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--x', `${e.clientX - r.left}px`);
    el.style.setProperty('--y', `${e.clientY - r.top}px`);
  };
  return (
    <div ref={ref} onMouseMove={onMouseMove} className={cn('group relative overflow-hidden', active && 'bg-accent/10', className)} {...props}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: 'radial-gradient(260px circle at var(--x) var(--y), rgba(167,139,250,0.13), transparent 70%)' }}
      />
      {active && <div aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-accent to-accent2" />}
      <div className="relative">{children}</div>
    </div>
  );
}
