import { AnimatePresence, motion } from 'motion/react';
import { useId, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

const GAP = 8;
const MARGIN = 8;

// 다크 테마 툴팁. body에 포털로 띄우고 화면 밖으로 나가지 않게 위치를 보정한다.
// 마우스 오버, 키보드 포커스(:focus-visible)일 때만 열리고 클릭하면 닫힌다.
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
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    if (!anchor.current || !tip.current) return;
    const a = anchor.current.getBoundingClientRect();
    const t = tip.current.getBoundingClientRect();
    let left = align === 'start' ? a.left : align === 'end' ? a.right - t.width : a.left + a.width / 2 - t.width / 2;
    left = Math.min(Math.max(MARGIN, left), window.innerWidth - t.width - MARGIN);
    let top = side === 'bottom' ? a.bottom + GAP : a.top - t.height - GAP;
    if (top + t.height > window.innerHeight - MARGIN) top = a.top - t.height - GAP;
    if (top < MARGIN) top = a.bottom + GAP;
    setPos({ left, top });
  }, [open, align, side]);

  const onFocus = (e: FocusEvent<HTMLSpanElement>) => {
    if ((e.target as HTMLElement).matches?.(':focus-visible')) setOpen(true);
  };

  return (
    <span
      ref={anchor}
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onMouseDown={() => setOpen(false)}
      onFocus={onFocus}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.span
              ref={tip}
              id={id}
              role="tooltip"
              initial={{ opacity: 0, y: side === 'bottom' ? -4 : 4 }}
              animate={{ opacity: pos ? 1 : 0, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
              className="pointer-events-none fixed z-[100] w-max max-w-xs rounded-lg border border-line bg-[#14141c] px-3 py-2 text-left text-[11.5px] leading-relaxed font-normal text-fg/90 shadow-xl shadow-black/50"
            >
              {content}
            </motion.span>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  );
}
