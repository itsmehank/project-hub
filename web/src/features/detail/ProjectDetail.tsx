import type { IssueKind, Project, RuntimeProcess } from '@hub/shared';
import { useMutation } from '@tanstack/react-query';
import { Code2, ExternalLink, TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Box } from '../../components/ui/Box';
import { Button } from '../../components/ui/Button';
import { LiveBadge } from '../../components/ui/LiveBadge';
import { api, ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { activityOf } from '../../lib/status';
import { ACTIVITY } from '../list/activity';
import { AboutSection } from './AboutSection';
import { CommitsSection } from './CommitsSection';
import { GitHubSection } from './GitHubSection';
import { RuntimeBox } from './RuntimeBox';
import { StateSection } from './StateSection';
import { TechSection } from './TechSection';

const STAGE_LABEL: Record<string, string> = { git: 'git', meta: '파일 읽기', github: 'GitHub', summary: 'Claude 요약' };
const CI: Record<string, { label: string; cls: string }> = {
  success: { label: 'CI ✓', cls: 'text-live' },
  failure: { label: 'CI ✗', cls: 'text-bad' },
  in_progress: { label: 'CI ●', cls: 'text-warn' },
};

function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-fg/75', className)}>{children}</span>;
}

export function ProjectDetail({
  project: p,
  processes,
  now,
  onOpenIssues,
}: {
  project: Project;
  processes: RuntimeProcess[];
  now: Date;
  onOpenIssues: (kind?: IssueKind) => void;
}) {
  const act = activityOf(p.git?.lastCommitAt ?? null, now);
  const openEditor = useMutation({ mutationFn: () => api.openEditor(p.name) });
  const git = p.git;
  const ci = p.github ? CI[p.github.ci.status] : undefined;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="rounded-2xl border border-line bg-panel/80 p-6 backdrop-blur"
    >
      <div className="flex items-center gap-2.5">
        <span className={cn('size-2.5 rounded-full', ACTIVITY[act].dot)} title={ACTIVITY[act].label} />
        <h2 className="text-xl font-bold tracking-tight">{p.name}</h2>
        {processes.length > 0 && <LiveBadge />}
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={() => openEditor.mutate()} disabled={openEditor.isPending}>
            <Code2 /> 편집기에서 열기
          </Button>
          {p.github && (
            <a href={p.github.url} target="_blank" rel="noreferrer">
              <Button size="sm">
                <ExternalLink /> GitHub
              </Button>
            </a>
          )}
        </div>
      </div>

      {(openEditor.error || openEditor.data) && (
        <p className={cn('mt-1 text-right text-[11px]', openEditor.error ? 'text-bad' : 'text-muted')}>
          {openEditor.error
            ? openEditor.error instanceof ApiError
              ? String(openEditor.error.body?.error ?? openEditor.error.message)
              : openEditor.error.message
            : `${openEditor.data?.editor}에서 열었습니다.`}
        </p>
      )}

      <div className="mt-2 mb-4 flex flex-wrap gap-1.5">
        <Tag>{ACTIVITY[act].label}</Tag>
        {p.stack.map((s) => <Tag key={s}>{s}</Tag>)}
        {git && (
          <Tag>
            ⎇ {git.branch}
            {git.ahead > 0 && ` ↑${git.ahead}`}
            {git.behind > 0 && ` ↓${git.behind}`}
            {git.hasUpstream ? '' : ' · upstream 없음'}
          </Tag>
        )}
        {git && git.dirtyCount > 0 && <Tag className="text-warn">미커밋 {git.dirtyCount}</Tag>}
        {ci && p.github?.ci.url ? (
          <a href={p.github.ci.url} target="_blank" rel="noreferrer">
            <Tag className={ci.cls}>{ci.label}</Tag>
          </a>
        ) : (
          ci && <Tag className={ci.cls}>{ci.label}</Tag>
        )}
        {!p.isGit && <Tag className="text-muted">git 아님</Tag>}
      </div>

      <RuntimeBox project={p} processes={processes} />

      <AboutSection p={p} />
      <StateSection p={p} />
      <div className="grid gap-x-3 xl:grid-cols-2">
        <GitHubSection p={p} now={now} onOpenIssues={onOpenIssues} />
        <CommitsSection p={p} now={now} />
      </div>
      <TechSection p={p} />

      {Object.keys(p.errors).length > 0 && (
        <Box title={<span className="flex items-center gap-1.5 text-warn"><TriangleAlert className="size-3.5" /> 수집 경고</span>}>
          <ul className="space-y-1 text-xs">
            {Object.entries(p.errors).map(([stage, msg]) => (
              <li key={stage}>
                <b className="text-warn">{STAGE_LABEL[stage] ?? stage}</b> <span className="text-muted">{msg}</span>
              </li>
            ))}
          </ul>
        </Box>
      )}
    </motion.section>
  );
}
