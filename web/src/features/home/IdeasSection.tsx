import type { Insights } from '@hub/shared';
import { Lightbulb } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { SpotlightCard } from '../../components/ui/SpotlightCard';
import { cn } from '../../lib/cn';
import { DecisionButtons } from './DecisionButtons';

type Idea = Insights['newIdeas'][number] & { contrast?: string };

// 기본 아이디어와 성향 반대의 과감한 아이디어를 탭으로 나눠 보여준다.
export function IdeasSection({ ins, chip }: { ins: Insights; chip: (name: string) => ReactNode }) {
  const [tab, setTab] = useState<'base' | 'wild'>('base');
  const ideas: Idea[] = tab === 'base' ? ins.newIdeas : ins.wildIdeas;
  return (
    <>
      <div className="mt-6 mb-3 flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-accent/15 text-accent [&_svg]:size-4">
          <Lightbulb />
        </span>
        <h3 className="text-base font-semibold">신규 프로젝트 아이디어</h3>
        <div className="ml-2 flex rounded-full border border-line p-0.5 text-[11px]">
          {(['base', 'wild'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn('rounded-full px-2.5 py-0.5 text-muted', tab === t && 'bg-accent/20 text-fg')}>
              {t === 'base' ? '기본' : '과감하게'}
            </button>
          ))}
        </div>
      </div>
      {ideas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-8 text-center text-xs text-muted">과감한 아이디어는 다음 분석 후 표시됩니다.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {ideas.map((idea) => (
            <SpotlightCard key={`${tab}:${idea.title}`}>
              <p className="font-semibold">{idea.title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg/90">{idea.pitch}</p>
              {idea.contrast && (
                <p className="mt-2 text-xs text-accent2">
                  <span className="font-medium">내 성향과 반대: </span>
                  {idea.contrast}
                </p>
              )}
              {idea.leverages.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted">활용할 프로젝트</span>
                  {idea.leverages.map((n) => chip(n))}
                </div>
              )}
              <p className="mt-2.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs">
                <span className="text-accent">이번 주 첫 단계 </span>
                {idea.firstStep}
              </p>
              <DecisionButtons
                suggestion={{ kind: 'idea', snapshot: { title: idea.title, pitch: idea.pitch, leverages: idea.leverages, firstStep: idea.firstStep } }}
              />
            </SpotlightCard>
          ))}
        </div>
      )}
    </>
  );
}
