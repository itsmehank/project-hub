import { describe, expect, it } from 'vitest';
import type { ChecklistItem } from '@hub/shared';
import { createChecklistQueue } from './checklistQueue';

const item = (id: string, done = false): ChecklistItem => ({ id, text: id, done });

describe('createChecklistQueue', () => {
  it('applies quick successive edits on top of each other and sends them one at a time', async () => {
    const sent: ChecklistItem[][] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const send = async (items: ChecklistItem[]) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      sent.push(items);
      inFlight--;
    };
    const shown: ChecklistItem[][] = [];
    const q = createChecklistQueue([item('a'), item('b')], send, (items) => shown.push(items));
    const toggle = (id: string) => (xs: ChecklistItem[]) => xs.map((x) => (x.id === id ? { ...x, done: !x.done } : x));
    q.edit(toggle('a'));
    await q.edit(toggle('b'));
    expect(shown.at(-1)).toEqual([item('a', true), item('b', true)]);
    expect(sent.at(-1)).toEqual([item('a', true), item('b', true)]);
    expect(maxInFlight).toBe(1);
  });
  it('keeps sending later edits after a failed one and reports the failure', async () => {
    let fail = true;
    const sent: ChecklistItem[][] = [];
    const q = createChecklistQueue([item('a')], async (items) => {
      if (fail) {
        fail = false;
        throw new Error('boom');
      }
      sent.push(items);
    }, () => {});
    await expect(q.edit((xs) => [...xs, item('b')])).rejects.toThrow('boom');
    await q.edit((xs) => [...xs, item('c')]);
    expect(sent).toEqual([[item('a'), item('b'), item('c')]]);
  });
});
