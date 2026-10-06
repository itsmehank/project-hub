export function LiveBadge({ label = '실행 중' }: { label?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-live/30 bg-live/10 px-1.5 py-px text-[10px] font-semibold tracking-wide text-live">
      <span className="size-1.5 animate-pulse-dot rounded-full bg-live shadow-[0_0_6px] shadow-live" />
      {label}
    </span>
  );
}
