import { LIFECYCLES, type Lifecycle, type Project } from '@hub/shared';
import { ExternalLink, Pencil } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/cn';
import { saveErrorText, useSavePersonal } from '../../lib/hooks';
import { LIFECYCLE_LABEL, noteBlurAction, withLifecycle } from '../../lib/lifecycle';
import { LinksDialog } from './LinksDialog';

export function LifecycleSelect({ project: p }: { project: Project }) {
  const save = useSavePersonal(p.name);
  const value = p.personal.lifecycle;
  return (
    <select
      value={value ?? ''}
      onChange={(e) => save.mutate(withLifecycle(p.personal, (e.target.value || null) as Lifecycle | null))}
      disabled={save.isPending}
      aria-label="프로젝트 태그"
      className={cn('rounded-full border px-2 py-0.5 text-[11px] outline-none', value ? LIFECYCLE_LABEL[value].cls : 'border-line bg-transparent text-muted')}
    >
      <option value="">미분류</option>
      {LIFECYCLES.map((l) => (
        <option key={l} value={l}>
          {LIFECYCLE_LABEL[l].label}
        </option>
      ))}
    </select>
  );
}

// 한 줄 메모. 눌러서 편집하고 Enter로 저장, Esc로 취소한다. 바뀐 채로 포커스가 빠지면 저장한다.
export function NoteLine({ project: p }: { project: Project }) {
  const save = useSavePersonal(p.name);
  const [draft, setDraft] = useState<string | null>(null);
  const submit = () => {
    if (draft === null || save.isPending) return;
    save.mutate({ ...withLifecycle(p.personal, p.personal.lifecycle), note: draft.trim() }, { onSuccess: () => setDraft(null) });
  };
  if (draft !== null) {
    return (
      <div className="mt-1.5">
        <input
          autoFocus
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
            if (e.key === 'Escape') setDraft(null);
          }}
          onBlur={() => (noteBlurAction(draft, p.personal.note) === 'save' ? submit() : setDraft(null))}
          placeholder="다음에 할 일을 한 줄로 (Enter 저장 · Esc 취소)"
          className="w-full rounded-lg border border-accent/40 bg-black/30 px-2.5 py-1 text-sm outline-none"
        />
        {save.error && <p className="mt-1 text-[11px] text-bad">{saveErrorText(save.error)}</p>}
      </div>
    );
  }
  return (
    <button onClick={() => setDraft(p.personal.note)} className="group mt-1.5 flex items-center gap-1.5 text-left text-sm text-fg/80 hover:text-fg">
      <span className="text-[11px] text-muted">메모</span>
      {p.personal.note || <span className="text-muted">눌러서 메모 남기기</span>}
      <Pencil className="size-3 text-muted opacity-0 group-hover:opacity-100" />
    </button>
  );
}

// 바로가기 링크 칩. 실행 여부와 관계없이 항상 보인다.
export function LinkChips({ project: p }: { project: Project }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {p.personal.links.map((l) => (
        <a
          key={`${l.label}-${l.url}`}
          href={l.url}
          target="_blank"
          rel="noreferrer noopener"
          title={l.url}
          className="inline-flex items-center gap-1 rounded-full border border-line bg-white/[0.03] px-2 py-0.5 text-[11px] text-fg/85 hover:border-accent/50"
        >
          {l.label} <ExternalLink className="size-3" />
        </a>
      ))}
      <button onClick={() => setEditing(true)} className="text-[11px] text-muted hover:text-fg">
        {p.personal.links.length ? '링크 편집' : '+ 바로가기 링크'}
      </button>
      <LinksDialog project={p} open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}
