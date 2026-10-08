import { describe, expect, it } from 'vitest';
import { EMPTY_PERSONAL, type Project, type TrendItem } from '@hub/shared';
import { openDb } from '../src/db';
import { TrendsManager, buildTrendsPrompt, sanitizeTrendItems } from '../src/trends';
import { fakeRunner } from './fakeRunner';

const item = (title: string, o: Partial<TrendItem> = {}): TrendItem => ({
  category: 'ai',
  region: '해외',
  title,
  summary: '요약',
  ideaAngle: '관점',
  sourceName: '출처',
  sourceUrl: 'https://example.com/a',
  publishedAt: '2026-10-07',
  ...o,
});
const project = (name: string, lifecycle: 'archive' | null = null) =>
  ({ name, summary: { oneLiner: `${name} 설명` }, personal: { ...EMPTY_PERSONAL, lifecycle } }) as unknown as Project;

describe('sanitizeTrendItems', () => {
  it('drops non-http links and duplicate titles', () => {
    const out = sanitizeTrendItems({
      items: [item('A'), item('B', { sourceUrl: 'javascript:alert(1)' }), item(' a '), item('C', { sourceUrl: 'HTTP://x.dev' })],
    });
    expect(out.map((i) => i.title)).toEqual(['A', 'C']);
  });
  it('fails when nothing usable is left or the shape is wrong', () => {
    expect(() => sanitizeTrendItems({ items: [item('A', { sourceUrl: 'ftp://x' })] })).toThrow();
    expect(() => sanitizeTrendItems({ nope: true })).toThrow();
  });
});

describe('buildTrendsPrompt', () => {
  it('includes date, categories, exclusions, my non-archived projects and recent titles', () => {
    const prompt = buildTrendsPrompt([project('kr-by-claude'), project('old', 'archive')], ['지난 소식'], '2026-10-08');
    expect(prompt).toContain('2026-10-08');
    expect(prompt).toContain('정치');
    expect(prompt).toContain('kr-by-claude: kr-by-claude 설명');
    expect(prompt).not.toContain('old 설명');
    expect(prompt).toContain('- 지난 소식');
  });
});

function manager(result: () => { code: number; stdout?: string }, now = new Date(2026, 9, 8, 10)) {
  const db = openDb(':memory:');
  const run = fakeRunner((cmd) => (cmd === 'claude' ? result() : undefined));
  const m = new TrendsManager({ db, run, model: 'sonnet', projects: () => [project('a')], now: () => now });
  return { db, run, m };
}
const ok = () => ({ code: 0, stdout: JSON.stringify({ structured_output: { items: [item('A')] } }) });

describe('TrendsManager', () => {
  it('collects with web tools only and stores today\'s digest', async () => {
    const { db, run, m } = manager(ok);
    expect(m.collect()).toBe(true);
    expect(m.collect()).toBe(false);
    await m.whenIdle();
    expect(db.getTrendDigest('2026-10-08')?.items.map((i) => i.title)).toEqual(['A']);
    const args = run.calls[0].args;
    expect(args).toEqual(expect.arrayContaining(['--tools', 'WebSearch', 'WebFetch', '--allowedTools']));
    expect(args).not.toContain('Bash');
  });
  it('auto-collects once a day and does not retry automatically after a failure', async () => {
    const fail = manager(() => ({ code: 1, stdout: '' }));
    expect(fail.m.maybeCollect()).toBe(true);
    await fail.m.whenIdle();
    expect(fail.m.get().error).toBeTruthy();
    expect(fail.m.maybeCollect()).toBe(false);
    expect(fail.m.collect()).toBe(true); // 수동은 가능
    await fail.m.whenIdle();

    const good = manager(ok);
    expect(good.m.maybeCollect()).toBe(true);
    await good.m.whenIdle();
    expect(good.m.maybeCollect()).toBe(false);
  });
  it('pages digests newest first with hasMore', () => {
    const { db, m } = manager(ok);
    for (const d of ['2026-10-05', '2026-10-06', '2026-10-07']) db.putTrendDigest({ date: d, items: [item(d)], model: 's', createdAt: 't' });
    expect(m.get(undefined, 2)).toMatchObject({ hasMore: true });
    expect(m.get(undefined, 2).digests.map((d) => d.date)).toEqual(['2026-10-07', '2026-10-06']);
    expect(m.get('2026-10-06', 2)).toMatchObject({ hasMore: false });
    expect(m.get('2026-10-06', 2).digests.map((d) => d.date)).toEqual(['2026-10-05']);
  });
});
