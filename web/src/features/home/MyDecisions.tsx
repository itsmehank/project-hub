import type { Decision, Project } from '@hub/shared';
import { ChevronDown, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { cn } from '../../lib/cn';
import { decisionTitle, groupDecisions, progressOf } from '../../lib/decisions';
import { useDecisions, useDeleteDecision } from '../../lib/hooks';

const KIND = { candidate: '서비스 후보', cleanup: '정리 제안', idea: '아이디어' } as const;

function Row({ d, known, onOpen, onCancel }: { d: Decision; known: Set<string>; onOpen: (n: string) => void; onCancel: (d: Decision) => void }) {
  const [open, setOpen] = useState(false);
  const p = progressOf(d.checklist);
  const target = d.kind === 'idea' ? null : d.projects.find((n) => known.has(n)) ?? null;
  const idea = d.kind === 'idea' ? (d.snapshot as { pitch: string; firstStep: string }) : null;
  return (
    <li className="text-xs">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[10px] text-muted">{KIND[d.kind]}</span>
        <button
          onClick={() => (idea ? setOpen((v) => !v) : target && onOpen(target))}
          className={cn('truncate text-left hover:text-white', !idea && !target && 'text-muted/60')}
          title={!idea && !target ? '폴더가 없는 프로젝트' : undefined}
        >
          {decisionTitle(d)}
        </button>
        {d.kind === 'candidate' && p.total > 0 && <span className="shrink-0 tabular-nums text-live">{p.done}/{p.total}</span>}
        <button onClick={() => onCancel(d)} aria-label="결정 취소" className="ml-auto shrink-0 text-muted hover:text-bad">
          <X className="size-3" />
        </button>
      </div>
      {open && idea && (
        <p className="mt-1 rounded bg-white/[0.03] px-2 py-1 text-fg/80">
          {idea.pitch}
          <span className="mt-0.5 block text-muted">첫 단계: {idea.firstStep}</span>
        </p>
      )}
      {d.status === 'rejected' && d.reason && <p className="mt-0.5 pl-14 text-muted">이유: {d.reason}</p>}
    </li>
  );
}

export function MyDecisions({ projects, onOpen }: { projects: Project[]; onOpen: (name: string) => void }) {
  const { data: decisions = [] } = useDecisions();
  const del = useDeleteDecision();
  const [cancel, setCancel] = useState<Decision | null>(null);
  if (decisions.length === 0) return null;
  const g = groupDecisions(decisions);
  const known = new Set(projects.map((p) => p.name));
  const row = (d: Decision) => <Row key={d.id} d={d} known={known} onOpen={onOpen} onCancel={setCancel} />;
  return (
    <div className="mb-5 grid gap-3 rounded-xl border border-line bg-black/20 p-4 md:grid-cols-2">
      <div>
        <h4 className="mb-1.5 text-[11px] font-medium text-live">채택 {g.adopted.length}</h4>
        <ul className="space-y-1">{g.adopted.length ? g.adopted.map(row) : <li className="text-xs text-muted">없음</li>}</ul>
      </div>
      <div>
        <h4 className="mb-1.5 text-[11px] font-medium text-warn">보류 {g.held.length}</h4>
        <ul className="space-y-1">{g.held.length ? g.held.map(row) : <li className="text-xs text-muted">없음</li>}</ul>
        {g.rejected.length > 0 && (
          <details className="group mt-3">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] text-muted">
              거절 {g.rejected.length} <ChevronDown className="size-3 transition group-open:rotate-180" />
            </summary>
            <ul className="mt-1.5 space-y-1">{g.rejected.map(row)}</ul>
          </details>
        )}
      </div>
      <Dialog
        open={cancel !== null}
        onClose={() => setCancel(null)}
        title="결정을 취소할까요?"
        footer={
          <>
            <Button onClick={() => setCancel(null)}>닫기</Button>
            <Button variant="danger" onClick={() => cancel && del.mutate(cancel.id, { onSettled: () => setCancel(null) })} disabled={del.isPending}>결정 취소</Button>
          </>
        }
      >
        {cancel && (
          <p>
            "{decisionTitle(cancel)}"에 대한 결정을 지웁니다.
            {cancel.checklist.length > 0 && ' 공개 체크리스트도 함께 지워집니다.'}
          </p>
        )}
      </Dialog>
    </div>
  );
}
