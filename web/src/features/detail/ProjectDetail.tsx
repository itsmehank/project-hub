import type { IssueKind, Project, RuntimeProcess } from '@hub/shared';
import { useMutation } from '@tanstack/react-query';
import { Code2, ExternalLink, Play, TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Box } from '../../components/ui/Box';
import { Button } from '../../components/ui/Button';
import { api, ApiError } from '../../lib/api';
import { pendingCleanupFor } from '../../lib/decisions';
import { useDecisions } from '../../lib/hooks';
import { cn } from '../../lib/cn';
import { openUrl } from '../../lib/runConfig';
import { mergeStack } from '../../lib/stack';
import { activityOf, formatDate, relativeTime } from '../../lib/status';
import { ACTIVITY, activityLabel } from '../list/activity';
import { AboutSection } from './AboutSection';
import { AiSuggestions } from './AiSuggestions';
import { CommitsSection } from './CommitsSection';
import { GitHubSection } from './GitHubSection';
import { LifecycleSelect, LinkChips, NoteLine } from './PersonalHeader';
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

// 실행 중이면 헤더에 접속 링크 칩을 보여준다(자세한 실행 정보는 아래 "개발 정보"의 실행 상태).
function RunChips({ processes }: { processes: RuntimeProcess[] }) {
  if (processes.length === 0) return null;
  const ports = [...new Set(processes.flatMap((p) => p.ports))];
  if (ports.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-live/30 bg-live/10 px-2 py-0.5 text-[11px] text-live">
        <Play className="size-3 fill-current" /> 실행 중(포트 없음)
      </span>
    );
  }
  return (
    <>
      {ports.map((port) => (
        <a
          key={port}
          href={openUrl(port)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-live/30 bg-live/10 px-2 py-0.5 text-[11px] font-medium text-live transition hover:bg-live/20"
        >
          <Play className="size-3 fill-current" /> :{port} ↗
        </a>
      ))}
    </>
  );
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
  const { data: decisions = [] } = useDecisions();
  const git = p.git;
  const ci = p.github ? CI[p.github.ci.status] : undefined;
  const oneLiner = p.summary?.oneLiner ?? p.readmeExcerpt;
  const issues = p.github ? p.github.openIssues.length + p.github.openPRs.length : 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="rounded-2xl border border-line bg-panel/80 p-6 backdrop-blur"
    >
      {/* 무엇인지 → 지금 어디쯤인지 → 개발 정보 순서 */}
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={cn('size-2.5 rounded-full', ACTIVITY[act].dot)} title={activityLabel(act, p.isGit)} />
        <h2 className="text-xl font-bold tracking-tight">{p.name}</h2>
        <LifecycleSelect project={p} />
        {pendingCleanupFor(decisions, p.name) && (
          <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] text-warn">정리 예정</span>
        )}
        <RunChips processes={processes} />
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

      {oneLiner && <p className="mt-3 text-lg leading-snug font-semibold text-fg">{oneLiner}</p>}
      <NoteLine project={p} />
      <LinkChips project={p} />
      <p className="mt-1.5 mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span>{activityLabel(act, p.isGit)}</span>
        {git?.lastCommitAt && (
          <>
            <span>·</span>
            <span>
              마지막 개발 <b className="font-medium text-fg/85">{formatDate(git.lastCommitAt)}</b> ({relativeTime(git.lastCommitAt, now)})
            </span>
          </>
        )}
        {git && git.dirtyCount > 0 && (
          <>
            <span>·</span>
            <span className="text-warn">커밋 안 한 변경 {git.dirtyCount}개</span>
          </>
        )}
        {issues > 0 && (
          <>
            <span>·</span>
            <button onClick={() => onOpenIssues()} className="hover:text-fg">
              열린 이슈·PR {issues}개
            </button>
          </>
        )}
      </p>

      <AboutSection p={p} />
      <StateSection p={p} />
      <AiSuggestions p={p} />

      <div className="mt-7 mb-3 flex items-center gap-3 text-[11px] font-medium tracking-wider text-muted uppercase">
        개발 정보
        <span className="h-px flex-1 bg-line" />
      </div>

      <RuntimeBox project={p} processes={processes} />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {mergeStack(p.stack).map((s) => (
          <Tag key={s}>{s}</Tag>
        ))}
        {git && (
          <Tag>
            ⎇ {git.branch}
            {git.ahead > 0 && ` ↑${git.ahead}`}
            {git.behind > 0 && ` ↓${git.behind}`}
            {git.hasUpstream ? '' : ' · upstream 없음'}
          </Tag>
        )}
        {ci && p.github?.ci.url ? (
          <a href={p.github.ci.url} target="_blank" rel="noreferrer">
            <Tag className={ci.cls}>{ci.label}</Tag>
          </a>
        ) : (
          ci && <Tag className={ci.cls}>{ci.label}</Tag>
        )}
      </div>

      {!p.githubRepo && !git ? (
        // 둘 다 비어 있으면 빈 상자 두 개 대신 한 줄로 접는다.
        <p className="mb-3 rounded-xl border border-dashed border-line px-4 py-2.5 text-xs text-muted">
          git으로 관리하지 않는 폴더라 커밋·GitHub 정보가 없습니다.
        </p>
      ) : (
        <div className="grid gap-x-3 xl:grid-cols-2">
          <GitHubSection p={p} now={now} onOpenIssues={onOpenIssues} />
          <CommitsSection p={p} now={now} />
        </div>
      )}
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
