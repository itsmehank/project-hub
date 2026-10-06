import { TriangleAlert } from 'lucide-react';
import { useHealth } from '../../lib/hooks';

export function HealthBanner() {
  const { data } = useHealth();
  if (!data?.messages.length) return null;
  return (
    <div className="mx-6 mb-3 rounded-xl border border-warn/30 bg-warn/5 px-4 py-2.5 text-xs text-warn">
      {data.messages.map((m) => (
        <p key={m} className="flex items-center gap-2">
          <TriangleAlert className="size-3.5 shrink-0" /> {m}
        </p>
      ))}
    </div>
  );
}
