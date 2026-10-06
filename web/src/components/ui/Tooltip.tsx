import { AnimatePresence, motion } from 'motion/react';
import { useId, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

// 마우스 오버·키보드 포커스로 뜨는 다크 테마 툴팁.
export function Tooltip({
  content,
  children,
  side = 'bottom',
  align = 'center',
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            id={id}
            role="tooltip"
            // motion이 transform을 직접 쓰므로 가운데 정렬도 x 값으로 준다.
            initial={{ opacity: 0, x: align === 'center' ? '-50%' : 0, y: side === 'bottom' ? -4 : 4, scale: 0.97 }}
            animate={{ opacity: 1, x: align === 'center' ? '-50%' : 0, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: align === 'center' ? '-50%' : 0, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'pointer-events-none absolute z-50 w-max max-w-xs rounded-lg border border-line bg-[#14141c] px-3 py-2 text-left text-[11.5px] leading-relaxed font-normal text-fg/90 shadow-xl shadow-black/40 backdrop-blur',
              side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
              align === 'center' && 'left-1/2',
              align === 'start' && 'left-0',
              align === 'end' && 'right-0',
            )}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
