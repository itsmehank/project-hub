import { describe, expect, it } from 'vitest';
import { mergeStack } from './stack';

describe('mergeStack', () => {
  it('merges names that differ only by version, keeping the more specific label', () => {
    expect(mergeStack(['Astro', 'Astro 7', 'Node', 'React 18', 'React', 'Python 3.11+', 'python'])).toEqual([
      'Astro 7',
      'Node',
      'React 18',
      'Python 3.11+',
    ]);
  });
  it('treats parenthesised details as the same tool', () => {
    expect(mergeStack(['PostgreSQL(psycopg)', 'PostgreSQL', 'Vite'])).toEqual(['PostgreSQL(psycopg)', 'Vite']);
  });
  it('keeps distinct tools apart', () => {
    expect(mergeStack(['Node', 'Node 25 (Node 22.13+)', 'Next.js', 'Nest'])).toEqual(['Node 25 (Node 22.13+)', 'Next.js', 'Nest']);
  });
});
