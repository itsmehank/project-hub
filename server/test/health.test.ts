import { describe, expect, it } from 'vitest';
import { checkHealth } from '../src/health';
import { fakeRunner } from './fakeRunner';

describe('checkHealth', () => {
  it('reports everything available', async () => {
    const h = await checkHealth(fakeRunner(() => ({ code: 0 })));
    expect(h).toEqual({ gh: true, claude: true, lsof: true, messages: [] });
  });
  it('explains what is missing', async () => {
    const h = await checkHealth(fakeRunner((cmd) => ({ code: cmd === 'lsof' ? 0 : 1 })));
    expect(h).toMatchObject({ gh: false, claude: false, lsof: true });
    expect(h.messages).toHaveLength(2);
    expect(h.messages[0]).toContain('gh auth login');
  });
});
