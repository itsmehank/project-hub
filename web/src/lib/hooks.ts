import type { RefreshStatus } from '@hub/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';

export const useProjects = () => useQuery({ queryKey: ['projects'], queryFn: api.projects });

export const useRuntime = () =>
  useQuery({ queryKey: ['runtime'], queryFn: api.runtime, refetchInterval: 5_000, refetchIntervalInBackground: false });

export const useInsights = () =>
  useQuery({
    queryKey: ['insights'],
    queryFn: api.insights,
    // 분석 중에는 3초마다 확인한다.
    refetchInterval: (q) => (q.state.data?.generating ? 3_000 : false),
  });

export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 60_000 });

export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const IDLE_STATUS: RefreshStatus = { running: false, done: 0, total: 0, error: null, finishedAt: null };

// 새로고침 진행 상황. 상시 연결(SSE)은 탭마다 브라우저 동시 연결(호스트당 6개)을 차지해
// 다른 요청을 막으므로 짧은 주기로 조회한다. 탭이 숨겨지면 조회를 멈춘다(react-query 기본).
export function useRefreshStatus(): RefreshStatus {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['refresh-status'],
    queryFn: api.refreshStatus,
    refetchInterval: (q) => (q.state.data?.running ? 1_000 : 10_000),
  });
  const prev = useRef<RefreshStatus | undefined>(undefined);
  useEffect(() => {
    const p = prev.current;
    prev.current = data;
    if (!data || !p) return;
    if (data.running && data.done !== p.done) qc.invalidateQueries({ queryKey: ['projects'] });
    if (p.running && !data.running) {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['runtime'] });
      qc.invalidateQueries({ queryKey: ['insights'] });
    }
  }, [data, qc]);
  return data ?? IDLE_STATUS;
}

// 로그 보기: offset 이후에 붙은 내용만 1.5초마다 가져온다.
export function useLogStream(name: string, enabled: boolean): string {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let offset: number | undefined;
    let stopped = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const chunk = await api.logs(name, offset);
        if (stopped) return;
        offset = chunk.offset;
        if (chunk.reset) setText(chunk.text);
        else if (chunk.text) setText((t) => (t + chunk.text).split('\n').slice(-500).join('\n'));
      } catch {
        // 일시적인 실패는 다음 주기에 다시 시도한다.
      }
    };
    void tick();
    const timer = setInterval(tick, 1_500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [name, enabled]);
  return text;
}
