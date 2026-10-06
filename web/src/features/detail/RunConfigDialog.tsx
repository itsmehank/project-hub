import type { Project } from '@hub/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { api } from '../../lib/api';
import type { ResolvedRun } from '../../lib/runConfig';

const input = 'w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xs outline-none focus:border-accent/60';

export function RunConfigDialog({ open, onClose, project, initial }: { open: boolean; onClose: () => void; project: Project; initial: ResolvedRun | null }) {
  const qc = useQueryClient();
  const [command, setCommand] = useState('');
  const [cwd, setCwd] = useState('.');
  const [port, setPort] = useState('');

  // 열릴 때만 초기값을 채운다(initial은 렌더마다 새 객체라 의존성에 넣지 않는다).
  useEffect(() => {
    if (!open) return;
    setCommand(initial?.command ?? '');
    setCwd(initial?.cwd ?? '.');
    setPort(initial?.expectedPort ? String(initial.expectedPort) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = useMutation({
    mutationFn: () =>
      api.saveRunConfig(project.name, { command: command.trim(), cwd: cwd.trim() || '.', expectedPort: port ? Number(port) : null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
  });
  const portValid = port === '' || (/^\d+$/.test(port) && Number(port) > 0 && Number(port) < 65536);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${project.name} 실행 명령`}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="gradient" onClick={() => save.mutate()} disabled={!command.trim() || !portValid || save.isPending}>
            저장
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">명령 (로그인 셸 zsh -lc 로 실행)</span>
          <input className={input} value={command} onChange={(e) => setCommand(e.target.value)} placeholder="pnpm dev" autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">작업 디렉토리 (프로젝트 기준)</span>
            <input className={input} value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="." />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">예상 포트 (선택)</span>
            <input className={input} value={port} onChange={(e) => setPort(e.target.value)} placeholder="5173" inputMode="numeric" />
          </label>
        </div>
        {!portValid && <p className="text-xs text-bad">포트는 1~65535 사이 숫자여야 합니다.</p>}
        {save.error && <p className="text-xs text-bad">저장 실패: {save.error.message}</p>}
      </div>
    </Dialog>
  );
}
