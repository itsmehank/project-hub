import type { Project, RuntimeSnapshot } from '@hub/shared';
import { PanelLeftClose, PanelLeftOpen, Play } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { TAG_FILTERS, TAG_FILTER_LABEL, type TagFilter } from '../../lib/lifecycle';
import type { Filter, Sort } from '../../lib/status';
import { FilterChips } from './FilterChips';
import { ProjectRow } from './ProjectRow';

export function ProjectList(props: {
  projects: Project[];
  runtime: RuntimeSnapshot | undefined;
  selected: string | null;
  onSelect: (name: string) => void;
  filter: Filter;
  onFilter: (f: Filter) => void;
  sort: Sort;
  onSort: (s: Sort) => void;
  counts: Record<Filter, number>;
  tag: TagFilter;
  onTag: (t: TagFilter) => void;
  hiddenArchived: number;
  now: Date;
  loading: boolean;
  collapsed: boolean;
  onToggle: () => void;
  runningCount: number;
}) {
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => {
    if (props.selected) rowRefs.current.get(props.selected)?.scrollIntoView({ block: 'nearest' });
  }, [props.selected]);

  if (props.collapsed) {
    return (
      <aside className="flex min-h-0 flex-col items-center gap-3 rounded-xl border border-line bg-panel/70 py-3 backdrop-blur">
        <button onClick={props.onToggle} aria-label="프로젝트 목록 펼치기 (⌘B)" title="프로젝트 목록 펼치기 (⌘B)" className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-fg">
          <PanelLeftOpen className="size-4" />
        </button>
        {props.runningCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-live" title={`실행 중 ${props.runningCount}개`}>
            <Play className="size-2.5 fill-current" />
            {props.runningCount}
          </span>
        )}
        <button onClick={props.onToggle} aria-hidden tabIndex={-1} className="w-full flex-1" />
      </aside>
    );
  }

  return (
    <aside className="flex min-h-0 flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <button onClick={props.onToggle} aria-label="프로젝트 목록 접기 (⌘B)" title="프로젝트 목록 접기 (⌘B)" className="mt-0.5 shrink-0 rounded-lg p-1 text-muted hover:bg-white/5 hover:text-fg">
          <PanelLeftClose className="size-4" />
        </button>
        <FilterChips value={props.filter} onChange={props.onFilter} counts={props.counts} />
        <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
          <select
            value={props.tag}
            onChange={(e) => props.onTag(e.target.value as TagFilter)}
            aria-label="태그로 거르기"
            className="rounded-lg border border-line bg-panel px-2 py-0.5 text-[11px] text-muted outline-none"
          >
            {TAG_FILTERS.map((t) => (
              <option key={t} value={t}>
                {t === 'all' ? '태그 전체' : TAG_FILTER_LABEL[t]}
              </option>
            ))}
          </select>
          <select
            value={props.sort}
            onChange={(e) => props.onSort(e.target.value as Sort)}
            className="rounded-lg border border-line bg-panel px-2 py-0.5 text-[11px] text-muted outline-none"
          >
            <option value="recent">최근 활동순</option>
            <option value="oldest">오래된 순</option>
            <option value="name">이름순</option>
            <option value="issues">이슈 많은 순</option>
          </select>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-panel/70 backdrop-blur">
        {props.loading &&
          Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="border-b border-line/70 px-3.5 py-3">
              <div className="h-3 w-32 animate-pulse rounded bg-white/5" />
              <div className="mt-2 h-2.5 w-56 animate-pulse rounded bg-white/5" />
            </div>
          ))}
        {!props.loading && props.projects.length === 0 && (
          <p className="p-6 text-center text-sm text-muted">조건에 맞는 프로젝트가 없습니다.</p>
        )}
        {props.projects.map((p) => (
          <motion.div
            key={p.name}
            layout="position"
            transition={{ duration: 0.2 }}
            ref={(el: HTMLDivElement | null) => {
              if (el) rowRefs.current.set(p.name, el);
              else rowRefs.current.delete(p.name);
            }}
          >
            <ProjectRow
              p={p}
              processes={props.runtime?.byProject[p.name] ?? []}
              selected={p.name === props.selected}
              onSelect={() => props.onSelect(p.name)}
              now={props.now}
            />
          </motion.div>
        ))}
        {!props.loading && props.hiddenArchived > 0 && (
          <button onClick={() => props.onTag('archive')} className="w-full px-3.5 py-2.5 text-center text-[11px] text-muted hover:text-fg">
            보관 {props.hiddenArchived}개 숨김 · 보기
          </button>
        )}
      </div>
    </aside>
  );
}
