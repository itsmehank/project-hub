import type { Project, RuntimeSnapshot } from '@hub/shared';

export function HomePage(_: { projects: Project[]; runtime: RuntimeSnapshot | undefined; now: Date; onOpen: (name: string) => void }) {
  return <section className="rounded-2xl border border-line bg-panel/80 p-6">포트폴리오 인사이트</section>;
}
