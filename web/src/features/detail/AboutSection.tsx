import type { Project } from '@hub/shared';
import { Box } from '../../components/ui/Box';

// 처음 보는 사람을 위한 설명: 어떤 서비스인지와 할 수 있는 일만 보여준다. 기술 구성은 TechSection.
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
        <p className="text-[14px] leading-relaxed">{s.whatItIs}</p>
        {s.features.length > 0 && (
          <div className="mt-3">
            <h4 className="mb-1.5 text-[11px] tracking-wider text-muted uppercase">할 수 있는 일</h4>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {s.features.map((f) => (
                <li key={f} className="flex gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                  <span className="text-accent">✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Box>
    </>
  );
}
