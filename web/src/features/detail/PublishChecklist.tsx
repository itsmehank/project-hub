import { ChecklistSchema, type Decision } from '@hub/shared';
import { Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createChecklistQueue } from '../../lib/checklistQueue';
import { newChecklistItem, progressOf } from '../../lib/decisions';
import { api } from '../../lib/api';
import { saveErrorText } from '../../lib/hooks';
import { useQueryClient } from '@tanstack/react-query';

export function PublishChecklist({ decision }: { decision: Decision }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  // 화면은 로컬 목록을 바로 바꾸고, 저장은 큐가 순서대로 보낸다(연속 체크가 서로 덮어쓰지 않게).
  const [items, setItems] = useState(decision.checklist);
  const queue = useRef(
    createChecklistQueue(decision.checklist, (next) => api.saveChecklist(decision.id, next), setItems),
  ).current;
  useEffect(() => {
    if (queue.reset(decision.checklist)) setItems(decision.checklist);
  }, [decision.checklist, queue]);
  const p = progressOf(items);
  const commit = (fn: (xs: typeof items) => typeof items) => {
    const parsed = ChecklistSchema.safeParse(fn(items));
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setError(null);
    queue
      .edit(fn)
      .catch((e) => setError(saveErrorText(e)))
      .finally(() => qc.invalidateQueries({ queryKey: ['decisions'] }));
  };
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="font-medium">공개 체크리스트</span>
        <span className="tabular-nums text-xs text-live">{p.done}/{p.total}</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
          <span className="block h-full rounded-full bg-live" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {items.map((it) => (
          <li key={it.id} className="group flex items-center gap-2 text-xs">
            <input type="checkbox" checked={it.done} onChange={() => commit((xs) => xs.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))} className="accent-[var(--color-live)]" />
            <span className={it.done ? 'text-muted line-through' : 'text-fg/90'}>{it.text}</span>
            <button onClick={() => commit((xs) => xs.filter((x) => x.id !== it.id))} aria-label="항목 삭제" className="ml-auto text-muted opacity-0 group-hover:opacity-100 hover:text-bad">
              <X className="size-3" />
            </button>
          </li>
        ))}
      </ul>
      {items.length < 20 && (
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            const added = newChecklistItem(text.trim());
            commit((xs) => [...xs, added]);
            setText('');
          }}
        >
          <input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="할 일 추가" className="min-w-0 flex-1 rounded-lg border border-line bg-black/30 px-2 py-1 text-xs outline-none focus:border-accent/50" />
          <button type="submit" aria-label="추가" className="rounded-lg border border-line px-2 text-muted hover:text-fg">
            <Plus className="size-3.5" />
          </button>
        </form>
      )}
      {error && <p className="mt-1 text-[11px] text-bad">{error}</p>}
    </div>
  );
}
