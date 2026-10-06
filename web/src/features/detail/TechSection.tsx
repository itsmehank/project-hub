import type { Project } from '@hub/shared';
import { Box } from '../../components/ui/Box';
import { mergeStack } from '../../lib/stack';

// 개발자를 위한 기술 구성: 동작 방식, 기술 스택, 디렉토리 구성.
export function TechSection({ p }: { p: Project }) {
  const s = p.summary;
  const stack = mergeStack([...(s?.techStack ?? []), ...p.stack]);
  if (!s?.techOverview && stack.length === 0 && !s?.structure.length) return null;
  return (
    <Box title="기술 구성">
      {s?.techOverview && <p>{s.techOverview}</p>}
      {stack.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {stack.map((t) => (
            <span key={t} className="rounded-md border border-line bg-white/[0.03] px-2 py-0.5 text-[11px] text-fg/80">
              {t}
            </span>
          ))}
        </div>
      )}
      {s && s.structure.length > 0 && (
        <ul className="mt-3 space-y-0.5">
          {s.structure.map((x) => (
            <li key={x.path}>
              <code className="font-mono text-xs text-accent2/90">{x.path}</code> <span className="text-fg/75">{x.role}</span>
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}
