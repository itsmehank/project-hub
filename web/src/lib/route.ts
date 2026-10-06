import { useCallback, useEffect, useState } from 'react';

export type Route = { view: 'home' } | { view: 'project'; name: string } | { view: 'issues'; name: string };

const HOME: Route = { view: 'home' };

export function parseRoute(hash: string): Route {
  const m = hash.replace(/^#/, '').match(/^\/p\/([^/]+)(\/issues)?\/?$/);
  if (!m) return HOME;
  try {
    const name = decodeURIComponent(m[1]);
    return m[2] ? { view: 'issues', name } : { view: 'project', name };
  } catch {
    return HOME;
  }
}

export function toHash(route: Route): string {
  if (route.view === 'home') return '#/';
  const base = `#/p/${encodeURIComponent(route.name)}`;
  return route.view === 'issues' ? `${base}/issues` : base;
}

// 해시 라우팅: 뒤로 가기·새로고침·링크 공유가 그대로 동작한다.
export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = useCallback((r: Route) => {
    const hash = toHash(r);
    if (window.location.hash !== hash) window.location.hash = hash;
  }, []);
  return [route, navigate];
}
