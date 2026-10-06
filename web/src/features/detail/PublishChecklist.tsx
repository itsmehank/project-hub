import { ChecklistSchema, type Decision } from '@hub/shared';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { newChecklistItem, progressOf } from '../../lib/decisions';
import { saveErrorText, useSaveChecklist } from '../../lib/hooks';

export function PublishChecklist({ decision }: { decision: Decision }) {
  const save = useSaveChecklist();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const items = decision.checklist;
  const p = progressOf(items);
  const commit = (next: typeof items) => {
    const parsed = ChecklistSchema.safeParse(next);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setError(null);
    save.mutate({ id: decision.id, items: parsed.data }, { onError: (e) => setError(saveErrorText(e)) });
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
            <input type="checkbox" checked={it.done} onChange={() => commit(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))} className="accent-[var(--color-live)]" />
            <span className={it.done ? 'text-muted line-through' : 'text-fg/90'}>{it.text}</span>
            <button onClick={() => commit(items.filter((x) => x.id !== it.id))} aria-label="항목 삭제" className="ml-auto text-muted opacity-0 group-hover:opacity-100 hover:text-bad">
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
            commit([...items, newChecklistItem(text.trim())]);
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
