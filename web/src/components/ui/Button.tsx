import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const VARIANTS = {
  primary: 'bg-fg text-bg hover:bg-white',
  ghost: 'border border-[#34344a] text-fg/85 hover:border-muted hover:text-fg',
  danger: 'bg-bad/90 text-black hover:bg-bad',
  gradient: 'bg-gradient-to-r from-accent to-accent2 font-semibold text-[#0a0a12] hover:brightness-110',
  live: 'bg-live font-semibold text-[#04120d] hover:brightness-110',
};
const SIZES = { sm: 'h-7 px-2.5 text-xs gap-1 [&_svg]:size-3.5', md: 'h-8 px-3.5 text-sm gap-1.5 [&_svg]:size-4' };

export function Button({
  variant = 'ghost',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    />
  );
}
