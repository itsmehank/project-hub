import { decisionId, decisionProjects, type DecisionInput, type DecisionStatus } from '@hub/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { cn } from '../../lib/cn';
import { findDecision } from '../../lib/decisions';
import { saveErrorText, useDecisions, useSaveDecision } from '../../lib/hooks';

export const STATUS_LABEL: Record<DecisionStatus, { label: string; cls: string }> = {
  adopted: { label: '채택', cls: 'border-live/40 bg-live/10 text-live' },
  held: { label: '보류', cls: 'border-warn/40 bg-warn/10 text-warn' },
  rejected: { label: '거절', cls: 'border-line bg-white/5 text-muted' },
};

type Suggestion = Pick<DecisionInput, 'kind' | 'snapshot'>;

export function DecisionButtons({ suggestion }: { suggestion: Suggestion }) {
  const { data: decisions = [] } = useDecisions();
  const save = useSaveDecision();
  const current = findDecision(decisions, suggestion);
  const [changing, setChanging] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const decide = (status: DecisionStatus, why = '') => {
    save.reset();
    const s = suggestion as Parameters<typeof decisionId>[0];
    const input = { ...suggestion, status, reason: why, projects: decisionProjects(s) } as DecisionInput;
    save.mutate(
      { id: decisionId(s), input },
      {
        onSuccess: () => {
          setChanging(false);
          setRejecting(false);
        },
      },
    );
  };

  if (current && !changing) {
    return (
      <div className="mt-3 flex items-center gap-2 border-t border-line pt-2 text-xs">
        <span className={cn('rounded-full border px-2 py-px text-[10px]', STATUS_LABEL[current.status].cls)}>{STATUS_LABEL[current.status].label}</span>
        {current.status === 'rejected' && current.reason && <span className="truncate text-muted">{current.reason}</span>}
        <button onClick={() => setChanging(true)} className="ml-auto text-[11px] text-muted hover:text-fg">변경</button>
      </div>
    );
  }
  return (
    <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-2">
      <Button size="sm" variant="live" onClick={() => decide('adopted')} disabled={save.isPending}>채택</Button>
      <Button size="sm" onClick={() => decide('held')} disabled={save.isPending}>보류</Button>
      <Button size="sm" onClick={() => { save.reset(); setReason(current?.reason ?? ''); setRejecting(true); }} disabled={save.isPending}>거절</Button>
      {changing && <button onClick={() => setChanging(false)} className="ml-auto text-[11px] text-muted hover:text-fg">취소</button>}
      {save.error && !rejecting && <span className="text-[11px] text-bad">저장하지 못했습니다</span>}
      <Dialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="이 제안을 거절할까요?"
        footer={
          <>
            <Button onClick={() => setRejecting(false)}>취소</Button>
            <Button variant="primary" onClick={() => decide('rejected', reason.trim())} disabled={save.isPending}>거절</Button>
          </>
        }
      >
        <p className="mb-2 text-xs text-muted">이유를 남기면 다음 분석에서 비슷한 제안을 피합니다(선택).</p>
        <textarea value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="예: 운영 부담이 커서 하지 않음" className="w-full rounded-lg border border-line bg-black/30 px-2.5 py-1.5 text-sm outline-none focus:border-accent/50" />
        <p className="text-right text-[10px] text-muted">{reason.length}/200</p>
        {save.error && <p className="mt-1 text-xs text-bad">저장하지 못했습니다: {saveErrorText(save.error)}</p>}
      </Dialog>
    </div>
  );
}
