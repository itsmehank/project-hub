import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export function ShimmerButton({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        'relative inline-flex items-center gap-2 rounded-full border border-[#3a3360] px-4 py-1.5 text-sm font-medium text-fg',
        'animate-shimmer bg-[linear-gradient(110deg,#1a1630_45%,#3a2f6b_55%,#1a1630)] bg-[length:200%_100%]',
        'shadow-[0_0_24px_-8px] shadow-accent/50 transition hover:border-accent/70 disabled:cursor-wait',
        className,
      )}
    >
      {children}
    </button>
  );
}
