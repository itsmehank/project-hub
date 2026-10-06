import { Search } from 'lucide-react';
import type { RefObject } from 'react';
import { Kbd } from '../../components/ui/Kbd';
import { NumberTicker } from '../../components/ui/NumberTicker';
import { useNow } from '../../lib/hooks';
import { relativeClock } from '../../lib/status';
import { RefreshButton } from './RefreshButton';

export function TopBar(props: {
  query: string;
  onQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  total: number;
  running: number;
  lastRefreshAt: string | null;
  onHome: () => void;
  onWeek: () => void;
}) {
  const now = useNow(30_000);
  return (
    <header className="flex flex-wrap items-center gap-4 px-6 pt-5 pb-4">
      <h1>
        <a
          href="#/"
          onClick={(e) => {
            e.preventDefault();
            props.onHome();
          }}
          title="첫 화면으로"
          className="bg-gradient-to-b from-white to-muted bg-clip-text text-2xl font-extrabold tracking-tight text-transparent transition hover:from-white hover:to-accent"
        >
          Project Hub
        </a>
      </h1>
      <a
        href="#/week"
        onClick={(e) => {
          e.preventDefault();
          props.onWeek();
        }}
        className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition hover:border-accent/50 hover:text-fg"
      >
        주간 리뷰
      </a>
      <label className="relative ml-2 flex w-72 items-center">
        <Search className="absolute left-3 size-4 text-muted" />
        <input
          ref={props.searchRef}
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          placeholder="프로젝트 검색…"
          className="w-full rounded-xl border border-line bg-panel/80 py-1.5 pr-12 pl-9 text-sm outline-none placeholder:text-muted/70 focus:border-accent/60"
        />
        <Kbd className="absolute right-2">⌘K</Kbd>
      </label>
      <div className="ml-auto flex items-center gap-5 text-xs text-muted">
        <span>
          <NumberTicker value={props.total} className="font-semibold text-fg" />개 프로젝트
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-live" />
          실행 중 <NumberTicker value={props.running} className="font-semibold text-fg" />
        </span>
        <span>{props.lastRefreshAt ? `데이터 갱신 ${relativeClock(props.lastRefreshAt, now)}` : '갱신 기록 없음'}</span>
        <RefreshButton />
      </div>
    </header>
  );
}
