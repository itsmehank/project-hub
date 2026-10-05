import type { Project } from '@hub/shared';
import { Box } from '../../components/ui/Box';

export function AboutSection({ p }: { p: Project }) {
  const s = p.summary;
  if (!s) {
    return (
      <Box title="이 프로젝트는">
        <p>{p.readmeExcerpt ?? 'README에서 가져올 설명이 없습니다.'}</p>
        <p className="mt-2 text-xs text-muted">Claude 요약이 아직 없습니다. 새로고침하면 작성됩니다.</p>
      </Box>
    );
  }
  return (
    <>
      <p className="mb-3 text-[15px] leading-relaxed text-fg">{s.oneLiner}</p>
      <Box title="이 프로젝트는">
        <p>{s.whatItIs}</p>
        {(s.features.length > 0 || s.structure.length > 0) && (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {s.features.length > 0 && (
              <div>
                <h4 className="mb-1 text-[11px] tracking-wider text-muted uppercase">주요 기능</h4>
                <ul className="list-disc space-y-0.5 pl-4">
                  {s.features.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </div>
            )}
            {s.structure.length > 0 && (
              <div>
                <h4 className="mb-1 text-[11px] tracking-wider text-muted uppercase">구성</h4>
                <ul className="space-y-0.5">
                  {s.structure.map((x) => (
                    <li key={x.path}>
                      <code className="font-mono text-xs text-accent2/90">{x.path}</code> <span className="text-fg/75">{x.role}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Box>
    </>
  );
}
