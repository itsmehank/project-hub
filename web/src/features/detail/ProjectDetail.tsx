import type { Project, RuntimeProcess } from '@hub/shared';
import { useMutation } from '@tanstack/react-query';
import { Code2, ExternalLink, TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Box } from '../../components/ui/Box';
import { Button } from '../../components/ui/Button';
import { LiveBadge } from '../../components/ui/LiveBadge';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { activityOf } from '../../lib/status';
import { ACTIVITY } from '../list/activity';
import { AboutSection } from './AboutSection';
import { CommitsSection } from './CommitsSection';
import { GitHubSection } from './GitHubSection';
import { StateSection } from './StateSection';

const STAGE_LABEL: Record<string, string> = { git: 'git', meta: '파일 읽기', github: 'GitHub', summary: 'Claude 요약' };
const CI: Record<string, { label: string; cls: string }> = {
  success: { label: 'CI ✓', cls: 'text-live' },
  failure: { label: 'CI ✗', cls: 'text-bad' },
  in_progress: { label: 'CI ●', cls: 'text-warn' },
};

function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-fg/75', className)}>{children}</span>;
}

export function ProjectDetail({ project: p, processes, now }: { project: Project; processes: RuntimeProcess[]; now: Date }) {
  const act = activityOf(p.git?.lastCommitAt ?? null, now);
  const openEditor = useMutation({ mutationFn: () => api.openEditor(p.name) });
  const git = p.git;
  const ci = p.github ? CI[p.github.ci.status] : undefined;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="min-h-0 overflow-y-auto rounded-2xl border border-line bg-panel/80 p-6 backdrop-blur"
    >
      <div className="flex items-center gap-2.5">
        <span className={cn('size-2.5 rounded-full', ACTIVITY[act].dot)} title={ACTIVITY[act].label} />
        <h2 className="text-xl font-bold tracking-tight">{p.name}</h2>
        {processes.length > 0 && <LiveBadge />}
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={() => openEditor.mutate()} disabled={openEditor.isPending} title={openEditor.error?.message}>
            <Code2 /> VS Code로 열기
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

      {/* RUNTIME_BOX: Task 17에서 <RuntimeBox project={p} processes={processes} />로 교체 */}

      <AboutSection p={p} />
      <StateSection p={p} />
      <div className="grid gap-x-3 xl:grid-cols-2">
        <GitHubSection p={p} now={now} />
        <CommitsSection p={p} now={now} />
      </div>

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
