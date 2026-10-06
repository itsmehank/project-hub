import type { Project } from '@hub/shared';

export function IssuesPage({ project }: { project: Project; now: Date; onBack: () => void }) {
  return <section className="rounded-2xl border border-line bg-panel/80 p-6">{project.name} 이슈</section>;
}
