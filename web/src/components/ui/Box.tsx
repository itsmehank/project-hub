import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Box({ title, right, children, className }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mb-3 rounded-xl border border-line bg-black/20 p-4', className)}>
      <header className="mb-2 flex items-center gap-2 text-[11px] font-medium tracking-wider text-muted uppercase">
        {title}
        {right && <div className="ml-auto normal-case tracking-normal">{right}</div>}
      </header>
      <div className="text-[13px] leading-relaxed text-fg/90">{children}</div>
    </section>
  );
}
