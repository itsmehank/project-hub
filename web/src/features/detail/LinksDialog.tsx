import { PersonalInputSchema, type PersonalLink, type Project } from '@hub/shared';
import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { saveErrorText, useSavePersonal } from '../../lib/hooks';

const MAX_LINKS = 5;

export function LinksDialog({ project: p, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  const save = useSavePersonal(p.name);
  const [rows, setRows] = useState<PersonalLink[]>(p.personal.links);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setRows(p.personal.links);
      setError(null);
    }
  }, [open, p.personal.links]);

  const update = (i: number, patch: Partial<PersonalLink>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const submit = () => {
    // 둘 다 빈 행은 버린다. 나머지는 서버와 같은 스키마로 먼저 검사한다.
    const links = rows.filter((r) => r.label.trim() || r.url.trim());
    const parsed = PersonalInputSchema.safeParse({ lifecycle: p.personal.lifecycle, note: p.personal.note, links });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(`${typeof issue.path[1] === 'number' ? `${issue.path[1] + 1}번째 링크: ` : ''}${issue.message}`);
      return;
    }
    save.mutate(parsed.data, { onSuccess: onClose, onError: (e) => setError(saveErrorText(e)) });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="바로가기 링크 편집"
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={submit} disabled={save.isPending}>
            저장
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-muted">운영 주소, 관리 화면, 텔레그램 봇(https://t.me/...) 등. 최대 {MAX_LINKS}개, http·https 주소만.</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={r.label}
              maxLength={30}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="이름"
              className="w-28 rounded-lg border border-line bg-black/30 px-2 py-1 text-xs outline-none focus:border-accent/50"
            />
            <input
              value={r.url}
              onChange={(e) => update(i, { url: e.target.value })}
              placeholder="https://"
              className="min-w-0 flex-1 rounded-lg border border-line bg-black/30 px-2 py-1 font-mono text-xs outline-none focus:border-accent/50"
            />
            <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="링크 삭제" className="text-muted hover:text-bad">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
      {rows.length < MAX_LINKS && (
        <button onClick={() => setRows((rs) => [...rs, { label: '', url: '' }])} className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
          <Plus className="size-3" /> 링크 추가
        </button>
      )}
      {error && <p className="mt-3 text-xs text-bad">{error}</p>}
    </Dialog>
  );
}
