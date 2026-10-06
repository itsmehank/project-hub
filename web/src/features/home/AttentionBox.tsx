import type { Lifecycle, Project } from '@hub/shared';
import { ChevronDown, HardDriveDownload } from 'lucide-react';
import type { ReactNode } from 'react';
import { Box } from '../../components/ui/Box';
import { attentionCount, attentionSignals } from '../../lib/attention';
import { useSavePersonal } from '../../lib/hooks';
import { withLifecycle } from '../../lib/lifecycle';
import { relativeTime } from '../../lib/status';

function Row({ name, onOpen, right }: { name: string; onOpen: (n: string) => void; right: string }) {
  return (
    <button onClick={() => onOpen(name)} className="flex w-full justify-between gap-2 py-0.5 text-left text-xs hover:text-white">
      <span className="truncate">{name}</span>
      <span className="shrink-0 text-warn">{right}</span>
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-0.5 text-[11px] text-muted">{title}</h4>
      {children}
    </div>
  );
}

function QuickTag({ project, lifecycle, label }: { project: Project; lifecycle: Lifecycle; label: string }) {
  const save = useSavePersonal(project.name);
  return (
    <button
      onClick={() => save.mutate(withLifecycle(project.personal, lifecycle))}
      disabled={save.isPending}
      className="rounded-md border border-line px-1.5 py-px text-[10px] text-muted hover:border-accent/50 hover:text-fg disabled:opacity-50"
    >
      {label}
    </button>
  );
}

export function AttentionBox({ projects, now, onOpen }: { projects: Project[]; now: Date; onOpen: (name: string) => void }) {
  const s = attentionSignals(projects, now);
  const byName = new Map(projects.map((p) => [p.name, p]));
  return (
    <div className="mt-3 grid gap-3 xl:grid-cols-[2fr_1fr]">
      <Box title="주의할 것" className="mb-0">
        {attentionCount(s) === 0 ? (
          <p className="text-xs text-muted">지금 처리할 것이 없습니다.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {s.unpushed.length > 0 && (
              <Group title="push 안 한 커밋">
                {s.unpushed.map((x) => (
                  <Row key={x.name} name={x.name} onOpen={onOpen} right={`↑${x.ahead} push 안 함`} />
                ))}
              </Group>
            )}
            {s.stalePRs.length > 0 && (
              <Group title="30일 넘게 열린 PR">
                {s.stalePRs.map((x) => (
                  <Row key={x.name} name={x.name} onOpen={onOpen} right={`PR ${x.count}개 · 최장 ${x.oldestDays}일`} />
                ))}
              </Group>
            )}
            {s.forgotten.length > 0 && (
              <Group title="잊혀진 변경 · 휴면·방치인데 커밋 안 한 변경">
                {s.forgotten.map((x) => (
                  <Row key={x.name} name={x.name} onOpen={onOpen} right={`±${x.dirty} · ${relativeTime(x.lastCommitAt, now)}`} />
                ))}
              </Group>
            )}
          </div>
        )}
      </Box>

      {/* 경고가 아닌 참고 목록이라 접어 둔다. 실험·보관으로 표시하면 목록에서 빠진다. */}
      <details className="group self-start rounded-xl border border-line bg-black/20 p-3.5">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium">
          <HardDriveDownload className="size-3.5 text-muted" /> 백업 없음 {s.noBackup.length}개
          <ChevronDown className="ml-auto size-3.5 text-muted transition group-open:rotate-180" />
        </summary>
        <p className="mt-2 text-[11px] text-muted">원격 저장소(GitHub 등)가 없어 이 컴퓨터에만 있는 프로젝트입니다.</p>
        <ul className="mt-2 space-y-1">
          {s.noBackup.map((x) => {
            const p = byName.get(x.name)!;
            return (
              <li key={x.name} className="flex items-center gap-1.5 text-xs">
                <button onClick={() => onOpen(x.name)} className="truncate hover:text-white">
                  {x.name}
                </button>
                <span className="shrink-0 text-[10px] text-muted">{x.reason === 'not-git' ? 'git 아님' : '원격 없음'}</span>
                <span className="ml-auto flex shrink-0 gap-1">
                  <QuickTag project={p} lifecycle="experiment" label="실험으로 표시" />
                  <QuickTag project={p} lifecycle="archive" label="보관으로 표시" />
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
