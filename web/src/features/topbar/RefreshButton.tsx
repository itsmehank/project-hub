import { RefreshCw } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { ProgressRing } from '../../components/ui/ProgressRing';
import { ShimmerButton } from '../../components/ui/ShimmerButton';
import { api, ApiError } from '../../lib/api';
import { useRefreshStream } from '../../lib/hooks';

export function RefreshButton() {
  const { running, done, total, error } = useRefreshStream();
  const [pending, setPending] = useState(false);
  const busy = running || pending;

  const onClick = async (e: MouseEvent) => {
    setPending(true);
    try {
      await api.refresh(e.shiftKey);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 409)) console.error(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="text-xs text-bad" title={error}>
          새로고침 실패
        </span>
      )}
      <ShimmerButton onClick={onClick} disabled={busy} title="Shift+클릭: Claude 요약까지 전부 다시 생성">
        {busy ? <ProgressRing value={total ? done / total : 0} /> : <RefreshCw className="size-3.5" />}
        {busy ? `새로고침 중 ${done}/${total || '…'}` : '새로고침'}
      </ShimmerButton>
    </div>
  );
}
