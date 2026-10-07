import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { EMPTY_PERSONAL, type PersonalInput, type Project, type ProjectsResponse } from '@hub/shared';
import { savePersonalPatch } from './personalSave';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const data = (note: string): ProjectsResponse => ({
  projects: [{ name: 'a', personal: { ...EMPTY_PERSONAL, note } } as Project],
  lastRefreshAt: null,
  refreshing: false,
});

describe('savePersonalPatch', () => {
  it('cancels an in-flight projects refetch so its stale response cannot undo the next edit', async () => {
    const qc = new QueryClient();
    qc.setQueryData(['projects'], data(''));
    // 저장 전에 보낸 목록 조회: 옛 메모를 들고 늦게 돌아온다.
    qc.fetchQuery({ queryKey: ['projects'], queryFn: () => sleep(30).then(() => data('')), staleTime: 0 }).catch(() => {});
    const sent: PersonalInput[] = [];
    const send = async (_name: string, input: PersonalInput) => {
      sent.push(input);
      return { ...input, updatedAt: 't' };
    };
    await savePersonalPatch(qc, 'a', { note: '새 메모' }, send);
    await sleep(60);
    await savePersonalPatch(qc, 'a', { lifecycle: 'focus' }, send);
    expect(sent[1]).toEqual({ lifecycle: 'focus', note: '새 메모', links: [] });
  });
});
