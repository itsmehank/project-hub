import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectMeta, detectStack, dirTree, readmeExcerpt } from '../src/collectors/meta';

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hub-meta-'));
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ dependencies: { react: '19', vite: '8' }, devDependencies: { typescript: '7' } }),
  );
  writeFileSync(
    path.join(dir, 'README.md'),
    '# Title\n\n[![badge](x)](y)\n\n이 프로젝트는   책을\n학습 노트로 바꿉니다.\n\n## More\n',
  );
  writeFileSync(path.join(dir, 'CLAUDE.md'), 'rules');
  writeFileSync(path.join(dir, 'run.sh'), 'pnpm dev');
  mkdirSync(path.join(dir, 'src'));
  writeFileSync(path.join(dir, 'src', 'a.ts'), '');
  mkdirSync(path.join(dir, 'node_modules', 'x'), { recursive: true });
  return dir;
}

describe('collectMeta', () => {
  it('collects stack, excerpt, docs and tree', async () => {
    const meta = await collectMeta(fixture());
    expect(meta.stack).toEqual(['Node', 'TypeScript', 'React', 'Vite']);
    expect(meta.readmeExcerpt).toBe('이 프로젝트는 책을 학습 노트로 바꿉니다.');
    expect(meta.docs.claudeMd).toBe('rules');
    expect(Object.keys(meta.docs.manifests).sort()).toEqual(['package.json', 'run.sh']);
    expect(meta.docs.docMtimes).toHaveLength(2);
    expect(meta.tree).toContain('src/');
    expect(meta.tree).toContain('  a.ts');
    expect(meta.tree).not.toContain('node_modules');
  });

  it('works on an empty folder', async () => {
    const meta = await collectMeta(mkdtempSync(path.join(tmpdir(), 'hub-empty-')));
    expect(meta).toMatchObject({ stack: [], readmeExcerpt: null, docs: { readme: null, claudeMd: null, docMtimes: [] } });
  });
});

describe('detectStack', () => {
  it('detects Python frameworks and docker', () => {
    expect(
      detectStack(['pyproject.toml', 'Dockerfile'], { 'pyproject.toml': 'dependencies = ["fastapi", "python-telegram-bot"]' }),
    ).toEqual(['Python', 'FastAPI', 'Telegram Bot', 'Docker']);
  });
  it('survives a broken package.json', () => {
    expect(detectStack(['package.json'], { 'package.json': '{oops' })).toEqual(['Node']);
  });
});

describe('readmeExcerpt', () => {
  it('truncates long paragraphs to 300 chars', () => {
    const s = readmeExcerpt('가'.repeat(400));
    expect(s?.length).toBe(300);
    expect(s?.endsWith('…')).toBe(true);
  });
  it('returns null when only headings exist', () => {
    expect(readmeExcerpt('# a\n\n## b\n')).toBeNull();
  });
});

describe('dirTree', () => {
  it('caps the number of entries', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hub-tree-'));
    for (let i = 0; i < 10; i++) writeFileSync(path.join(dir, `f${i}.txt`), '');
    const tree = await dirTree(dir, 2, 5);
    expect(tree.split('\n')).toHaveLength(6);
    expect(tree.endsWith('…')).toBe(true);
  });
});
