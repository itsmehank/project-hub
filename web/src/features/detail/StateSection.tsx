import type { Project } from '@hub/shared';
import { Box } from '../../components/ui/Box';

export function StateSection({ p }: { p: Project }) {
  const s = p.summary;
  if (!s || (!s.currentState && s.nextSteps.length === 0)) return null;
  return (
    <Box title="현재 상태 · 다음 할 일">
      {s.currentState && <p>{s.currentState}</p>}
      {s.nextSteps.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {s.nextSteps.map((n) => (
            <li key={n} className="flex gap-2">
              <span className="text-accent">→</span>
              {n}
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}
