import type { IssueDetail, IssueKind, Project } from '@hub/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, CircleCheck, CircleDot, ExternalLink, GitPullRequest, Loader2, MessageSquare, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { collectLabels, filterIssues, sortIssues, type IssueSort } from '../../lib/issues';
import { relativeTime } from '../../lib/status';

const TABS: { kind: IssueKind; label: string; icon: typeof CircleDot; color: string }[] = [
  { kind: 'open', label: '열린 이슈', icon: CircleDot, color: 'text-live' },
  { kind: 'closed', label: '닫힌 이슈', icon: CircleCheck, color: 'text-muted' },
  { kind: 'pr', label: '열린 PR', icon: GitPullRequest, color: 'text-accent' },
];

const SORTS: { value: IssueSort; label: string }[] = [
  { value: 'newest', label: '최신순' },
  { value: 'oldest', label: '오래된 순' },
  { value: 'comments', label: '댓글 많은 순' },
  { value: 'updated', label: '최근 업데이트순' },
];

export function IssuesPage({
  project,
  initialKind,
  now,
  onBack,
}: {
  project: Project;
  initialKind?: IssueKind;
  now: Date;
  onBack: () => void;
}) {
  const [kind, setKind] = useState<IssueKind>(initialKind ?? 'open');
  const [query, setQuery] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [sort, setSort] = useState<IssueSort>('newest');
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['issues', project.name, kind],
    queryFn: () => api.issues(project.name, kind),
    enabled: !!project.githubRepo,
    staleTime: 60_000,
    retry: false,
  });

  const items = data?.items ?? [];
  const allLabels = useMemo(() => collectLabels(items), [items]);
  const shown = useMemo(() => sortIssues(filterIssues(items, { query, labels }), sort), [items, query, labels, sort]);
  const counts: Partial<Record<IssueKind, number>> = {
    open: project.github?.openIssues.length,
    pr: project.github?.openPRs.length,
  };

  const switchKind = (k: IssueKind) => {
    setKind(k);
    setLabels([]);
    setExpanded(null);
  };
  const toggleLabel = (l: string) => setLabels((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]));

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="rounded-2xl border border-line bg-panel/80 p-6 backdrop-blur"
    >
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-fg">
          <ArrowLeft className="size-3.5" /> {project.name}
        </button>
        {project.github && (
          <a href={`${project.github.url}/issues`} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
            GitHub에서 보기 <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <h2 className="mt-2 text-xl font-bold tracking-tight">이슈 · PR 전체</h2>

      {!project.githubRepo ? (
        <p className="mt-6 text-sm text-muted">GitHub 저장소가 연결되어 있지 않은 프로젝트입니다 (로컬 전용).</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-1.5 border-b border-line pb-3">
            {TABS.map((t) => (
              <button
                key={t.kind}
                onClick={() => switchKind(t.kind)}
                className={cn(
                  'relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted transition hover:text-fg',
                  kind === t.kind && 'text-fg',
                )}
              >
                {kind === t.kind && <motion.span layoutId="issue-tab" className="absolute inset-0 -z-10 rounded-lg bg-white/[0.06]" />}
                <t.icon className={cn('size-3.5', t.color)} />
                {t.label}
                {counts[t.kind] !== undefined && <span className="text-xs tabular-nums text-muted">{counts[t.kind]}</span>}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="relative flex min-w-56 flex-1 items-center">
              <Search className="absolute left-3 size-3.5 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="제목·본문·#번호 검색"
                className="w-full rounded-lg border border-line bg-bg/60 py-1.5 pr-3 pl-8 text-sm outline-none placeholder:text-muted/70 focus:border-accent/60"
              />
            </label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as IssueSort)}
              className="rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-muted outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {allLabels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {allLabels.map(({ label, count }) => (
                <button
                  key={label}
                  onClick={() => toggleLabel(label)}
                  className={cn(
                    'rounded-full border border-line px-2 py-0.5 text-[11px] text-muted transition hover:text-fg',
                    labels.includes(label) && 'border-accent/50 bg-accent/15 text-fg',
                  )}
                >
                  {label} <span className="opacity-60">{count}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-4">
            {isLoading && (
              <p className="flex items-center gap-2 py-6 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" /> GitHub에서 가져오는 중…
              </p>
            )}
            {error && (
              <p className="py-6 text-sm text-bad">
                불러오지 못했습니다: {error instanceof ApiError ? String(error.body?.error ?? error.message) : String(error)}
              </p>
            )}
            {data && (
              <p className="mb-2 text-xs text-muted">
                {shown.length}개 표시 / 전체 {items.length}개{data.truncated && ' (최근 1,000개까지만 가져왔습니다)'}
              </p>
            )}
            {data && shown.length === 0 && <p className="py-6 text-center text-sm text-muted">조건에 맞는 항목이 없습니다.</p>}
            <ul className="divide-y divide-line/70 rounded-xl border border-line">
              {shown.map((i) => (
                <IssueRow
                  key={i.number}
                  issue={i}
                  kind={kind}
                  now={now}
                  open={expanded === i.number}
                  onToggle={() => setExpanded((cur) => (cur === i.number ? null : i.number))}
                />
              ))}
            </ul>
          </div>
        </>
      )}
    </motion.section>
  );
}

function IssueRow({ issue: i, kind, now, open, onToggle }: { issue: IssueDetail; kind: IssueKind; now: Date; open: boolean; onToggle: () => void }) {
  const Icon = kind === 'pr' ? GitPullRequest : kind === 'closed' ? CircleCheck : CircleDot;
  const color = kind === 'pr' ? 'text-accent' : kind === 'closed' ? 'text-muted' : 'text-live';
  return (
    <li className="list-none">
      <button onClick={onToggle} className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition hover:bg-white/[0.03]">
        <Icon className={cn('mt-0.5 size-4 shrink-0', color)} />
        <span className="min-w-0 flex-1">
          <span className="text-sm text-fg/95">{i.title}</span>
          {i.labels.map((l) => (
            <span key={l} className="ml-1.5 rounded bg-white/5 px-1.5 py-px text-[10px] text-muted">
              {l}
            </span>
          ))}
          <span className="mt-0.5 block text-[11px] text-muted">
            #{i.number} · {i.author ?? '알 수 없음'} · {kind === 'closed' ? `${relativeTime(i.closedAt, now)} 닫힘` : `${relativeTime(i.createdAt, now)} 열림`}
          </span>
        </span>
        {i.comments > 0 && (
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[11px] text-muted">
            <MessageSquare className="size-3" /> {i.comments}
          </span>
        )}
        <ChevronDown className={cn('mt-0.5 size-4 shrink-0 text-muted transition', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mx-4 mb-3 rounded-lg border border-line bg-bg/60 p-3">
              <p className="max-h-72 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap text-fg/80">{i.body || '(본문 없음)'}</p>
              <a href={i.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                GitHub에서 열기 <ExternalLink className="size-3" />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
