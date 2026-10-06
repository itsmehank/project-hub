import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export interface DocsBundle {
  readme: string | null;
  claudeMd: string | null;
  manifests: Record<string, string>;
  // 루트 README가 없을 때 대신 읽는 문서(하위 폴더 README/CLAUDE.md, 루트의 다른 .md). 경로 → 내용
  extraDocs: Record<string, string>;
  docMtimes: number[];
}
export interface MetaResult {
  stack: string[];
  readmeExcerpt: string | null;
  docs: DocsBundle;
  tree: string;
}

const README_NAMES = ['README.md', 'readme.md', 'Readme.md', 'README'];
const MANIFESTS = [
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'Makefile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'Procfile',
];
const TREE_IGNORE = new Set([
  'node_modules', '.git', '.venv', 'venv', 'dist', 'build', '__pycache__', '.next', '.turbo',
  '.pytest_cache', '.mypy_cache', '.ruff_cache', '.superpowers', 'coverage', '.DS_Store',
]);
const MAX_MANIFEST = 3000;
const MAX_EXTRA_DOCS = 4;
const MAX_EXTRA_DOC = 3000;

async function readText(file: string): Promise<{ text: string; mtime: number } | null> {
  try {
    const [text, s] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
    return { text, mtime: s.mtimeMs };
  } catch {
    return null;
  }
}

export function detectStack(files: string[], manifests: Record<string, string>): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    if (!out.includes(s)) out.push(s);
  };
  if (files.includes('package.json')) {
    add('Node');
    let deps: Record<string, string> = {};
    try {
      const pkg = JSON.parse(manifests['package.json'] ?? '{}');
      deps = { ...pkg.dependencies, ...pkg.devDependencies };
    } catch {
      // 깨진 package.json은 Node로만 표시
    }
    const rules: [string, string][] = [
      ['typescript', 'TypeScript'], ['next', 'Next.js'], ['astro', 'Astro'], ['react', 'React'],
      ['vue', 'Vue'], ['svelte', 'Svelte'], ['vite', 'Vite'], ['hono', 'Hono'], ['express', 'Express'],
      ['electron', 'Electron'],
    ];
    for (const [dep, label] of rules) if (dep in deps) add(label);
  }
  const py = manifests['pyproject.toml'] ?? manifests['requirements.txt'];
  if (files.includes('pyproject.toml') || files.includes('requirements.txt')) {
    add('Python');
    const lower = (py ?? '').toLowerCase();
    const rules: [string, string][] = [
      ['fastapi', 'FastAPI'], ['django', 'Django'], ['flask', 'Flask'], ['streamlit', 'Streamlit'],
      ['python-telegram-bot', 'Telegram Bot'], ['aiogram', 'Telegram Bot'], ['playwright', 'Playwright'],
    ];
    for (const [dep, label] of rules) if (lower.includes(dep)) add(label);
  }
  if (files.includes('Dockerfile') || files.some((f) => f.startsWith('docker-compose'))) add('Docker');
  if (files.includes('Cargo.toml')) add('Rust');
  if (files.includes('go.mod')) add('Go');
  return out;
}

export function readmeExcerpt(readme: string | null): string | null {
  if (!readme) return null;
  const skip = /^(#|!\[|\[!\[|<|```|---|\||>)/;
  for (const block of readme.split(/\n\s*\n/)) {
    const text = block.trim();
    if (!text || skip.test(text)) continue;
    const flat = text.replace(/\s+/g, ' ');
    return flat.length > 300 ? `${flat.slice(0, 299)}…` : flat;
  }
  return null;
}

export async function dirTree(dir: string, depth = 2, maxEntries = 80): Promise<string> {
  const lines: string[] = [];
  let truncated = false;
  const walk = async (current: string, level: number) => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const e of entries) {
      if (TREE_IGNORE.has(e.name)) continue;
      if (lines.length >= maxEntries) {
        truncated = true;
        return;
      }
      lines.push(`${'  '.repeat(level)}${e.name}${e.isDirectory() ? '/' : ''}`);
      if (e.isDirectory() && level + 1 < depth) await walk(path.join(current, e.name), level + 1);
    }
  };
  await walk(dir, 0);
  if (truncated) lines.push('…');
  return lines.join('\n');
}

export async function collectMeta(dir: string): Promise<MetaResult> {
  const files = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
  const docMtimes: number[] = [];

  let readme: string | null = null;
  const readmeName = README_NAMES.find((n) => files.includes(n));
  if (readmeName) {
    const r = await readText(path.join(dir, readmeName));
    if (r) {
      readme = r.text;
      docMtimes.push(r.mtime);
    }
  }
  let claudeMd: string | null = null;
  if (files.includes('CLAUDE.md')) {
    const r = await readText(path.join(dir, 'CLAUDE.md'));
    if (r) {
      claudeMd = r.text;
      docMtimes.push(r.mtime);
    }
  }

  const manifestNames = [...MANIFESTS.filter((m) => files.includes(m)), ...files.filter((f) => f.endsWith('.sh')).slice(0, 3)];
  const manifests: Record<string, string> = {};
  for (const name of manifestNames) {
    const r = await readText(path.join(dir, name));
    if (r) manifests[name] = r.text.slice(0, MAX_MANIFEST);
  }

  // 루트 README가 없으면 이름만 보고 추측하지 않도록 다른 문서를 찾아 넣는다.
  const extraDocs: Record<string, string> = {};
  if (!readme) {
    const candidates = files.filter((f) => f.endsWith('.md') && f !== 'CLAUDE.md').sort((a, b) => a.localeCompare(b, 'en'));
    const subdirs = (await readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !TREE_IGNORE.has(e.name))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, 'en'));
    for (const sub of subdirs) {
      let names: string[] = [];
      try {
        names = await readdir(path.join(dir, sub));
      } catch {
        continue;
      }
      for (const n of ['README.md', 'CLAUDE.md']) if (names.includes(n)) candidates.push(`${sub}/${n}`);
    }
    for (const rel of candidates.slice(0, MAX_EXTRA_DOCS)) {
      const r = await readText(path.join(dir, rel));
      if (r) {
        extraDocs[rel] = r.text.slice(0, MAX_EXTRA_DOC);
        docMtimes.push(r.mtime);
      }
    }
  }

  return {
    stack: detectStack(files, manifests),
    readmeExcerpt: readmeExcerpt(readme),
    docs: { readme, claudeMd, manifests, extraDocs, docMtimes },
    tree: await dirTree(dir),
  };
}
