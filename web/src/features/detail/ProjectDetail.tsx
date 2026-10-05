import type { Project, RuntimeProcess } from '@hub/shared';

export function ProjectDetail({ project }: { project: Project; processes: RuntimeProcess[]; now: Date }) {
  return (
    <section className="min-h-0 overflow-y-auto rounded-2xl border border-line bg-panel/80 p-6">
      <h2 className="text-xl font-bold">{project.name}</h2>
    </section>
  );
}
