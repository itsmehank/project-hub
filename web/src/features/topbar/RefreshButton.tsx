import { RefreshCw } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { ProgressRing } from '../../components/ui/ProgressRing';
import { ShimmerButton } from '../../components/ui/ShimmerButton';
import { api, ApiError } from '../../lib/api';
import { useRefreshStatus } from '../../lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { REFRESH_TIP } from '../../lib/tooltips';
import { Tooltip } from '../../components/ui/Tooltip';

export function RefreshButton() {
  const { running, done, total, error } = useRefreshStatus();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const busy = running || pending;

  const onClick = async (e: MouseEvent) => {
    setPending(true);
    try {
      await api.refresh(e.shiftKey);
      await qc.invalidateQueries({ queryKey: ['refresh-status'] });
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
      <Tooltip
        align="end"
        content={
          <span className="block">
            <b className="mb-1 block text-fg">새로고침이 하는 일</b>
            {REFRESH_TIP.map((line) => (
              <span key={line} className="block">{line}</span>
            ))}
          </span>
        }
      >
        <ShimmerButton onClick={onClick} disabled={busy}>
          {busy ? <ProgressRing value={total ? done / total : 0} /> : <RefreshCw className="size-3.5" />}
          {busy ? `새로고침 중 ${done}/${total || '…'}` : '새로고침'}
        </ShimmerButton>
      </Tooltip>
    </div>
  );
}
