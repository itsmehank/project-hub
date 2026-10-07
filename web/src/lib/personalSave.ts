import type { Personal, PersonalInput, ProjectsResponse } from '@hub/shared';
import type { QueryClient } from '@tanstack/react-query';
import { applyPersonalPatch } from './lifecycle';

// 바꿀 필드만 받고, 나머지는 최신 캐시에서 채운다. 캐시도 바로 고쳐 다음 저장이 이 값을 이어받게 한다.
export async function savePersonalPatch(
  qc: QueryClient,
  name: string,
  patch: Partial<PersonalInput>,
  send: (name: string, input: PersonalInput) => Promise<Personal>,
): Promise<Personal> {
  // 저장 전에 보낸 목록 조회가 늦게 돌아와 옛 값으로 캐시를 덮지 않도록 먼저 취소한다(저장 후 다시 불러온다).
  await qc.cancelQueries({ queryKey: ['projects'] });
  const cache = qc.getQueryData<ProjectsResponse>(['projects']);
  if (!cache) return send(name, { lifecycle: null, note: '', links: [], ...patch });
  const { input, next } = applyPersonalPatch(cache, name, patch);
  qc.setQueryData(['projects'], next);
  return send(name, input);
}
