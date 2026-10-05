import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn('rounded-md border border-line bg-bg/80 px-1.5 py-px font-mono text-[10px] text-muted', className)}>{children}</kbd>
  );
}
