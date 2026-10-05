import type { RefreshEvent } from '@hub/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './api';

export const useProjects = () => useQuery({ queryKey: ['projects'], queryFn: api.projects });

export const useRuntime = () =>
  useQuery({ queryKey: ['runtime'], queryFn: api.runtime, refetchInterval: 5_000, refetchIntervalInBackground: false });

export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 60_000 });

export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useRefreshStream() {
  const qc = useQueryClient();
  const [state, setState] = useState({ running: false, done: 0, total: 0, error: null as string | null });
  useEffect(() => {
    const es = new EventSource('/api/refresh/stream');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refetchProjects = () => qc.invalidateQueries({ queryKey: ['projects'] });
    const refetchSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(refetchProjects, 600);
    };
    es.onmessage = (m) => {
      const e = JSON.parse(m.data) as RefreshEvent;
      switch (e.type) {
        case 'state':
          setState((s) => ({ ...s, running: e.running }));
          if (!e.running) {
            refetchProjects();
            qc.invalidateQueries({ queryKey: ['runtime'] });
          }
          break;
        case 'started':
          setState({ running: true, done: 0, total: e.total, error: null });
          break;
        case 'project-updated':
          setState((s) => ({ ...s, done: e.done, total: e.total }));
          refetchSoon();
          break;
        case 'project-removed':
          refetchSoon();
          break;
        case 'error':
          setState((s) => ({ ...s, error: e.message }));
          break;
        case 'done':
          break;
      }
    };
    return () => {
      clearTimeout(timer);
      es.close();
    };
  }, [qc]);
  return state;
}

export function useLogStream(name: string, enabled: boolean): string {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource(`/api/projects/${encodeURIComponent(name)}/logs/stream`);
    es.addEventListener('snapshot', (m) => setText(JSON.parse((m as MessageEvent).data)));
    es.addEventListener('append', (m) =>
      setText((t) => (t + JSON.parse((m as MessageEvent).data)).split('\n').slice(-500).join('\n')),
    );
    return () => es.close();
  }, [name, enabled]);
  return text;
}
