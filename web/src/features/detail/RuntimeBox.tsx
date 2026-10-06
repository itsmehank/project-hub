import type { Project, RunSuggestion, RuntimeProcess, StartResult } from '@hub/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Play, ScrollText, Square } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { LiveBadge } from '../../components/ui/LiveBadge';
import { api, ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { canStart, openUrl, resolveRun } from '../../lib/runConfig';
import { LogViewer } from './LogViewer';
import { RunConfigDialog } from './RunConfigDialog';

const START_ERRORS: Record<string, string> = {
  'already-starting': '이미 실행을 시작하는 중입니다.',
  'already-running': '허브가 이미 이 프로젝트를 실행하고 있습니다.',
  'no-run-config': '실행 명령이 없습니다. 명령을 먼저 등록하세요.',
};

export function RuntimeBox({ project, processes }: { project: Project; processes: RuntimeProcess[] }) {
  const qc = useQueryClient();
  const run = resolveRun(project);
  const running = processes.length > 0;
  const startable = canStart(processes, run);
  const [editing, setEditing] = useState(false);
  const [approval, setApproval] = useState<RunSuggestion | null>(null);
  const [stopTarget, setStopTarget] = useState<RuntimeProcess | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [result, setResult] = useState<StartResult | null>(null);

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ['runtime'] });
    qc.invalidateQueries({ queryKey: ['projects'] });
  };
  const start = useMutation({
    mutationFn: (approve: boolean) => api.start(project.name, approve),
    onMutate: () => setResult(null),
    onSuccess: (r) => {
      setResult(r);
      refetch();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 428) setApproval(e.body.suggestion);
      else setResult({ status: 'failed', logTail: START_ERRORS[e.message] ?? e.message });
    },
  });
  const stop = useMutation({ mutationFn: (pid: number) => api.stop(project.name, pid), onSettled: refetch });

  return (
    <div
      className={cn(
        'mb-4 rounded-xl border p-3.5',
        running ? 'border-live/30 bg-[linear-gradient(90deg,rgba(52,211,153,0.08),transparent_60%)]' : 'border-line bg-black/20',
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] tracking-wider text-muted uppercase">
        실행 상태
        {running ? <LiveBadge label={`${processes.length}개 프로세스`} /> : <span className="tracking-normal normal-case">○ 중지됨</span>}
        <div className="ml-auto flex gap-1.5 tracking-normal normal-case">
          <Button size="sm" onClick={() => setShowLogs((v) => !v)}>
            <ScrollText /> 로그 {showLogs ? '닫기' : '보기'}
          </Button>
          {run && (
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil /> 명령 편집
            </Button>
          )}
        </div>
      </div>

      {running &&
        processes.map((proc) => (
          <div key={proc.pid} className="flex items-center gap-3 border-t border-dashed border-live/15 py-2 first:border-t-0">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg/80" title={proc.command}>
              {proc.command}
            </code>
            {!proc.launchedByHub && <span className="shrink-0 text-[10px] text-muted">직접 실행</span>}
            {proc.ports.length > 0 ? (
              proc.ports.map((port) => (
                <a key={port} href={openUrl(port)} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="live">localhost:{port} ↗</Button>
                </a>
              ))
            ) : (
              <span className="shrink-0 text-xs text-muted">포트 없음</span>
            )}
            <Button
              size="sm"
              onClick={() => (proc.launchedByHub ? stop.mutate(proc.pid) : setStopTarget(proc))}
              disabled={stop.isPending}
            >
              <Square /> 중지
            </Button>
          </div>
        ))}

      {startable && run && (
        <div className="flex flex-wrap items-center gap-3">
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg/80">{run.command}</code>
          <span className="text-xs text-muted">
            {run.expectedPort ? `예상 포트 ${run.expectedPort}` : '포트 미지정'}
            {run.source === 'suggested' && ' · Claude 추정'}
          </span>
          <Button variant="gradient" onClick={() => start.mutate(false)} disabled={start.isPending}>
            {start.isPending ? (
              <>
                <Loader2 className="animate-spin" /> 시작 중…
              </>
            ) : (
              <>
                <Play /> 실행
              </>
            )}
          </Button>
        </div>
      )}

      {startable && !run && (
        <div className="flex items-center gap-3 text-xs text-muted">
          상시 실행할 대상이 없거나 명령을 아직 모릅니다.
          <Button size="sm" onClick={() => setEditing(true)}>
            <Pencil /> 명령 등록
          </Button>
        </div>
      )}

      {result?.status === 'failed' && (
        <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-bad/30 bg-bad/5 p-2.5 font-mono text-[11px] whitespace-pre-wrap text-bad/90">
          실행에 실패했습니다.{'\n'}
          {result.logTail || '(로그 없음)'}
        </pre>
      )}
      {result?.status === 'port-conflict' && (
        <p className="mt-2 text-xs text-warn">
          포트 {result.port}를 이미 {result.holder.project ?? '다른 프로세스'}(pid {result.holder.pid}, {result.holder.command})가 사용 중입니다.
        </p>
      )}
      {result?.status === 'running-no-port' && (
        <p className="mt-2 text-xs text-muted">실행됐지만 30초 안에 열린 포트를 찾지 못했습니다. 봇이나 백그라운드 작업이면 정상입니다.</p>
      )}

      {showLogs && <LogViewer name={project.name} />}

      <RunConfigDialog open={editing} onClose={() => setEditing(false)} project={project} initial={run} />

      <Dialog
        open={approval !== null}
        onClose={() => setApproval(null)}
        title="이 명령으로 실행할까요?"
        footer={
          <>
            <Button onClick={() => setApproval(null)}>취소</Button>
            <Button
              onClick={() => {
                setApproval(null);
                setEditing(true);
              }}
            >
              편집
            </Button>
            <Button
              variant="gradient"
              onClick={() => {
                setApproval(null);
                start.mutate(true);
              }}
            >
              승인하고 실행
            </Button>
          </>
        }
      >
        <p className="text-muted">Claude가 README와 설정 파일을 보고 추정한 명령입니다. 승인하면 저장되고 다음부터는 바로 실행됩니다.</p>
        {approval && (
          <dl className="mt-3 grid grid-cols-[80px_1fr] gap-y-1.5 text-xs">
            <dt className="text-muted">명령</dt>
            <dd><code className="font-mono">{approval.command}</code></dd>
            <dt className="text-muted">위치</dt>
            <dd><code className="font-mono">{approval.cwd}</code></dd>
            <dt className="text-muted">예상 포트</dt>
            <dd>{approval.expectedPort ?? '없음'}</dd>
          </dl>
        )}
      </Dialog>

      <Dialog
        open={stopTarget !== null}
        onClose={() => setStopTarget(null)}
        title="직접 띄운 프로세스를 중지할까요?"
        footer={
          <>
            <Button onClick={() => setStopTarget(null)}>취소</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (stopTarget) stop.mutate(stopTarget.pid);
                setStopTarget(null);
              }}
            >
              중지
            </Button>
          </>
        }
      >
        <p className="text-muted">허브가 실행하지 않은 프로세스입니다. 터미널에서 실행 중인 작업이라면 그 작업이 종료됩니다.</p>
        {stopTarget && (
          <code className="mt-3 block truncate rounded-lg bg-bg p-2 font-mono text-xs">
            pid {stopTarget.pid} · {stopTarget.command}
          </code>
        )}
      </Dialog>
    </div>
  );
}
