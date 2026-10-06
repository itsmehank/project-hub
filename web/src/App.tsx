import { useEffect, useMemo, useRef, useState } from 'react';
import { GridBackground } from './components/ui/GridBackground';
import { ProjectDetail } from './features/detail/ProjectDetail';
import { HomePage } from './features/home/HomePage';
import { IssuesPage } from './features/issues/IssuesPage';
import { ProjectList } from './features/list/ProjectList';
import { HealthBanner } from './features/topbar/HealthBanner';
import { TopBar } from './features/topbar/TopBar';
import { useNow, useProjects, useRuntime } from './lib/hooks';
import { useRoute } from './lib/route';
import { countFilters, filterProjects, sortProjects, type Filter, type Sort } from './lib/status';

export default function App() {
  const { data, isLoading, error } = useProjects();
  const { data: runtime } = useRuntime();
  const now = useNow();
  const [route, navigate] = useRoute();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const searchRef = useRef<HTMLInputElement>(null);

  const projects = data?.projects ?? [];
  const visible = useMemo(
    () => sortProjects(filterProjects(projects, filter, runtime, query, now), sort),
    [projects, filter, runtime, query, now, sort],
  );
  const counts = useMemo(() => countFilters(projects, runtime, now), [projects, runtime, now]);
  // 선택은 주소(해시)가 결정한다. 필터에서 빠져도 보고 있던 프로젝트는 그대로 보인다.
  const selectedName = route.view === 'home' ? null : route.name;
  const current = selectedName ? (projects.find((p) => p.name === selectedName) ?? null) : null;
  const openProject = (name: string, replace = false) => navigate({ view: 'project', name }, { replace });

  // 상세 화면에서 검색어·필터를 바꿔 보던 프로젝트가 목록에서 빠지면 첫 결과로 이동한다.
  const lastCriteria = useRef(`${query}\u0000${filter}`);
  useEffect(() => {
    const key = `${query}\u0000${filter}`;
    if (key === lastCriteria.current) return;
    lastCriteria.current = key;
    if (route.view === 'project' && visible.length > 0 && !visible.some((p) => p.name === route.name)) {
      openProject(visible[0].name, true);
    }
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      const target = e.target as HTMLElement;
      // ↑↓ 프로젝트 이동은 상세 화면이나 검색창에서만. 첫 화면·이슈 페이지에서는 스크롤에 쓴다.
      if (route.view !== 'project' && target !== searchRef.current) return;
      if (target.closest('input, textarea, select, [role="dialog"]')) {
        if (e.key === 'Escape' && target === searchRef.current) {
          setQuery('');
          searchRef.current?.blur();
        }
        if (target !== searchRef.current || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      if (!visible.length) return;
      const idx = selectedName ? visible.findIndex((p) => p.name === selectedName) : -1;
      const next = Math.min(visible.length - 1, Math.max(0, idx + (e.key === 'ArrowDown' ? 1 : -1)));
      openProject(visible[next].name, true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const runningCount = Object.keys(runtime?.byProject ?? {}).length;

  let main;
  if (route.view === 'home') {
    main = <HomePage projects={projects} runtime={runtime} now={now} onOpen={openProject} />;
  } else if (!current) {
    main = (
      <section className="grid place-items-center gap-2 rounded-2xl border border-dashed border-line py-16 text-sm text-muted">
        {isLoading ? '프로젝트 정보를 불러오는 중입니다…' : error ? 'API 서버에 연결할 수 없습니다.' : `'${route.name}' 프로젝트를 찾을 수 없습니다.`}
        <button onClick={() => navigate({ view: 'home' })} className="text-xs text-accent hover:underline">
          첫 화면으로
        </button>
      </section>
    );
  } else if (route.view === 'issues') {
    main = (
      <IssuesPage
        key={`${current.name}:${route.kind ?? 'open'}`}
        project={current}
        initialKind={route.kind}
        now={now}
        onBack={() => openProject(current.name)}
      />
    );
  } else {
    main = (
      <ProjectDetail
        key={current.name}
        project={current}
        processes={runtime?.byProject[current.name] ?? []}
        now={now}
        onOpenIssues={(kind) => navigate({ view: 'issues', name: current.name, kind })}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <GridBackground />
      <TopBar
        query={query}
        onQuery={setQuery}
        searchRef={searchRef}
        total={projects.length}
        running={runningCount}
        lastRefreshAt={data?.lastRefreshAt ?? null}
        onHome={() => navigate({ view: 'home' })}
      />
      <HealthBanner />
      {error && (
        <p className="mx-6 mb-3 rounded-xl border border-bad/30 bg-bad/5 px-4 py-2.5 text-xs text-bad">
          API 서버(127.0.0.1:4310)에 연결할 수 없습니다. 루트에서 <code>pnpm dev</code>로 서버가 실행 중인지 확인하세요.
        </p>
      )}
      <main className="grid min-h-0 flex-1 grid-cols-[400px_1fr] gap-4 px-6 pb-6">
        <ProjectList
          projects={visible}
          runtime={runtime}
          selected={selectedName}
          onSelect={openProject}
          filter={filter}
          onFilter={setFilter}
          sort={sort}
          onSort={setSort}
          counts={counts}
          now={now}
          loading={isLoading || (projects.length === 0 && !!data?.refreshing)}
        />
        <div className="min-h-0 overflow-y-auto">{main}</div>
      </main>
    </div>
  );
}
