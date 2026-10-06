import type { Project } from '@hub/shared';
import { Lightbulb, Rocket, Sparkles, Trash2 } from 'lucide-react';
import { adoptedCandidateFor } from '../../lib/decisions';
import { useDecisions, useInsights } from '../../lib/hooks';
import { insightsFor } from '../../lib/insightsFor';
import { PublishChecklist } from './PublishChecklist';

const READINESS = { high: '바로 공개 가능', medium: '몇 주 작업 필요', low: '큰 작업 필요' } as const;

// 첫 화면 AI 제안 중 이 프로젝트에 해당하는 것을 상세 화면에도 보여준다.
export function AiSuggestions({ p }: { p: Project }) {
  const { data } = useInsights();
  const { data: decisions = [] } = useDecisions();
  const mine = insightsFor(p.name, data?.insights ?? null);
  // 채택한 서비스 후보는 이번 분석에 없어도 체크리스트로 계속 보여준다.
  const adopted = adoptedCandidateFor(decisions, p.name);
  if (!mine && !adopted) return null;
  return (
    <section className="mb-3 rounded-xl border border-accent/25 bg-accent/[0.06] p-4">
      <header className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-accent uppercase">
        <Sparkles className="size-3.5" /> AI 제안 · Claude
      </header>
      <div className="space-y-2.5 text-[13px] leading-relaxed">
        {adopted ? (
          <PublishChecklist decision={adopted} />
        ) : mine?.candidate && (
          <div>
            <p className="flex items-center gap-1.5 font-medium">
              <Rocket className="size-3.5 text-accent" /> 서비스 공개 후보 {mine.candidate.rank}위
              <span className="rounded-full border border-line px-2 py-px text-[10px] font-normal text-muted">
                {READINESS[mine.candidate.readiness]}
              </span>
            </p>
            <p className="mt-0.5 text-fg/85">{mine.candidate.pitch}</p>
            {mine.candidate.nextSteps.length > 0 && (
              <ol className="mt-1 space-y-0.5 text-xs text-fg/80">
                {mine.candidate.nextSteps.map((s, i) => (
                  <li key={i}>
                    {i + 1}. {s}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
        {mine?.cleanup.map((c, i) => (
          <p key={`c${i}`} className="flex gap-1.5">
            <Trash2 className="mt-1 size-3.5 shrink-0 text-warn" />
            <span>
              <b className="font-medium">정리 제안</b> {c.suggestion} <span className="text-muted">({c.projects.join(', ')})</span>
            </span>
          </p>
        ))}
        {mine?.ideas.map((idea, i) => (
          <p key={`i${i}`} className="flex gap-1.5">
            <Lightbulb className="mt-1 size-3.5 shrink-0 text-accent2" />
            <span>
              <b className="font-medium">아이디어에 활용</b> {idea.title}
            </span>
          </p>
        ))}
      </div>
    </section>
  );
}
