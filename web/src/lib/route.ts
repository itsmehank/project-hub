import type { IssueKind } from '@hub/shared';
import { useCallback, useEffect, useState } from 'react';

export type Route =
  | { view: 'home' }
  | { view: 'project'; name: string }
  | { view: 'issues'; name: string; kind?: IssueKind };

const KINDS: IssueKind[] = ['open', 'closed', 'pr'];

const HOME: Route = { view: 'home' };

export function parseRoute(hash: string): Route {
  const m = hash.replace(/^#/, '').match(/^\/p\/([^/]+)(\/issues(?:\/([a-z]+))?)?\/?$/);
  if (!m) return HOME;
  // 이름이 "issues"인 프로젝트도 있으므로 해시 전체가 아니라 /issues 그룹이 잡혔는지로 판단한다.
  const isIssues = m[2] !== undefined;
  try {
    const name = decodeURIComponent(m[1]);
    if (!isIssues) return { view: 'project', name };
    if (m[3] === undefined) return { view: 'issues', name };
    return KINDS.includes(m[3] as IssueKind) ? { view: 'issues', name, kind: m[3] as IssueKind } : HOME;
  } catch {
    return HOME;
  }
}

export function toHash(route: Route): string {
  if (route.view === 'home') return '#/';
  const base = `#/p/${encodeURIComponent(route.name)}`;
  if (route.view === 'project') return base;
  return route.kind ? `${base}/issues/${route.kind}` : `${base}/issues`;
}

// 해시 라우팅: 뒤로 가기·새로고침·링크 공유가 그대로 동작한다.
export function useRoute(): [Route, (r: Route, opts?: { replace?: boolean }) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = useCallback((r: Route, opts: { replace?: boolean } = {}) => {
    const hash = toHash(r);
    if (window.location.hash === hash) return;
    if (opts.replace) {
      // 방문 기록을 쌓지 않는다(키보드 이동, 검색 결과 따라가기). replaceState는 hashchange를 내지 않으므로 직접 반영한다.
      history.replaceState(null, '', hash);
      setRoute(parseRoute(hash));
    } else {
      window.location.hash = hash;
    }
  }, []);
  return [route, navigate];
}
