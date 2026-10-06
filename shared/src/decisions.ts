import { z } from 'zod';
import { CleanupSchema, NewIdeaSchema, ServiceCandidateSchema } from './insightItems';

export const DECISION_KINDS = ['candidate', 'cleanup', 'idea'] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];
export const DECISION_STATUSES = ['adopted', 'held', 'rejected'] as const;
export const DecisionStatusSchema = z.enum(DECISION_STATUSES);
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

export const ChecklistItemSchema = z.object({
  id: z.string().min(1).max(60),
  text: z.string().trim().min(1, '항목 내용을 입력하세요').max(200, '항목은 200자까지 쓸 수 있습니다'),
  done: z.boolean(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
export const ChecklistSchema = z.array(ChecklistItemSchema).max(20, '체크리스트는 20개까지 만들 수 있습니다');

const base = {
  status: DecisionStatusSchema,
  reason: z.string().max(200, '이유는 200자까지 쓸 수 있습니다').default(''),
  projects: z.array(z.string()),
};
export const DecisionInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('candidate'), snapshot: ServiceCandidateSchema, ...base }),
  z.object({ kind: z.literal('cleanup'), snapshot: CleanupSchema, ...base }),
  z.object({ kind: z.literal('idea'), snapshot: NewIdeaSchema, ...base }),
]);
export type DecisionInput = z.infer<typeof DecisionInputSchema>;
export type DecisionSnapshot = DecisionInput['snapshot'];

export interface Decision {
  id: string;
  kind: DecisionKind;
  status: DecisionStatus;
  reason: string;
  snapshot: DecisionSnapshot;
  projects: string[];
  checklist: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

type IdInput =
  | { kind: 'candidate'; snapshot: { project: string } }
  | { kind: 'cleanup'; snapshot: { projects: string[] } }
  | { kind: 'idea'; snapshot: { title: string; leverages?: string[] } };

const byName = (a: string, b: string) => a.localeCompare(b, 'en');

// 분석마다 문장이 바뀌므로 결정은 이 키가 같을 때만 새 제안과 연결한다(서버·웹 공통).
export function decisionId(d: IdInput): string {
  if (d.kind === 'candidate') return `candidate:${d.snapshot.project}`;
  if (d.kind === 'cleanup') return `cleanup:${[...d.snapshot.projects].sort(byName).join(',')}`;
  return `idea:${sha1Hex(d.snapshot.title).slice(0, 12)}`;
}

export function decisionProjects(d: IdInput): string[] {
  if (d.kind === 'candidate') return [d.snapshot.project];
  if (d.kind === 'cleanup') return [...d.snapshot.projects];
  return [...(d.snapshot.leverages ?? [])];
}

// 브라우저에도 동기 sha1이 필요해 직접 구현한다(아이디어 ID 12자에만 쓰며 보안 용도가 아니다).
export function sha1Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const words = new Uint32Array((((bytes.length + 8) >> 6) + 1) * 16);
  bytes.forEach((b, i) => (words[i >> 2] |= b << (24 - (i % 4) * 8)));
  words[bytes.length >> 2] |= 0x80 << (24 - (bytes.length % 4) * 8);
  words[words.length - 1] = bytes.length * 8;
  let [h0, h1, h2, h3, h4] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  for (let i = 0; i < words.length; i += 16) {
    for (let t = 0; t < 80; t++) w[t] = t < 16 ? words[i + t] : rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let t = 0; t < 80; t++) {
      const f = t < 20 ? (b & c) | (~b & d) : t < 40 ? b ^ c ^ d : t < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const tmp = (rotl(a, 5) + f + e + k + w[t]) >>> 0;
      [e, d, c, b, a] = [d, c, rotl(b, 30) >>> 0, a, tmp];
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, '0')).join('');
}
