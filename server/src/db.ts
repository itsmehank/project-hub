import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { RunConfig, StoredProject, Summary } from '@hub/shared';

export interface LaunchRecord {
  name: string;
  pid: number;
  pgid: number;
  command: string;
  startedAt: string;
  logPath: string;
}
export interface SummaryRecord {
  sourceHash: string;
  content: Summary;
  createdAt: string;
}
export interface Db {
  listProjects(): StoredProject[];
  getProject(name: string): StoredProject | null;
  upsertProject(p: StoredProject): void;
  deleteProject(name: string): void;
  getSummary(name: string): SummaryRecord | null;
  putSummary(name: string, sourceHash: string, content: Summary): void;
  getRunConfig(name: string): RunConfig | null;
  putRunConfig(name: string, cfg: RunConfig): void;
  getLaunch(name: string): LaunchRecord | null;
  listLaunches(): LaunchRecord[];
  putLaunch(l: LaunchRecord): void;
  deleteLaunch(name: string): void;
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (name TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS summaries (name TEXT PRIMARY KEY, source_hash TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS run_configs (name TEXT PRIMARY KEY, command TEXT NOT NULL, cwd TEXT NOT NULL, expected_port INTEGER, source TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS launches (name TEXT PRIMARY KEY, pid INTEGER NOT NULL, pgid INTEGER NOT NULL, command TEXT NOT NULL, started_at TEXT NOT NULL, log_path TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

type Row = Record<string, unknown>;

export function openDb(file: string): Db {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);

  const toLaunch = (r: Row): LaunchRecord => ({
    name: String(r.name),
    pid: Number(r.pid),
    pgid: Number(r.pgid),
    command: String(r.command),
    startedAt: String(r.started_at),
    logPath: String(r.log_path),
  });

  return {
    listProjects: () =>
      (db.prepare('SELECT data FROM projects ORDER BY name').all() as Row[]).map((r) => JSON.parse(String(r.data))),
    getProject: (name) => {
      const r = db.prepare('SELECT data FROM projects WHERE name = ?').get(name) as Row | undefined;
      return r ? JSON.parse(String(r.data)) : null;
    },
    upsertProject: (p) => {
      db.prepare(
        'INSERT INTO projects (name, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
      ).run(p.name, JSON.stringify(p), p.updatedAt);
    },
    deleteProject: (name) => {
      for (const t of ['projects', 'summaries', 'run_configs', 'launches']) {
        db.prepare(`DELETE FROM ${t} WHERE name = ?`).run(name);
      }
    },
    getSummary: (name) => {
      const r = db.prepare('SELECT * FROM summaries WHERE name = ?').get(name) as Row | undefined;
      return r
        ? { sourceHash: String(r.source_hash), content: JSON.parse(String(r.content)), createdAt: String(r.created_at) }
        : null;
    },
    putSummary: (name, sourceHash, content) => {
      db.prepare(
        'INSERT INTO summaries (name, source_hash, content, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET source_hash = excluded.source_hash, content = excluded.content, created_at = excluded.created_at',
      ).run(name, sourceHash, JSON.stringify(content), new Date().toISOString());
    },
    getRunConfig: (name) => {
      const r = db.prepare('SELECT * FROM run_configs WHERE name = ?').get(name) as Row | undefined;
      return r
        ? {
            command: String(r.command),
            cwd: String(r.cwd),
            expectedPort: r.expected_port === null ? null : Number(r.expected_port),
            source: r.source as RunConfig['source'],
          }
        : null;
    },
    putRunConfig: (name, cfg) => {
      db.prepare(
        'INSERT INTO run_configs (name, command, cwd, expected_port, source, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET command = excluded.command, cwd = excluded.cwd, expected_port = excluded.expected_port, source = excluded.source, updated_at = excluded.updated_at',
      ).run(name, cfg.command, cfg.cwd, cfg.expectedPort, cfg.source, new Date().toISOString());
    },
    getLaunch: (name) => {
      const r = db.prepare('SELECT * FROM launches WHERE name = ?').get(name) as Row | undefined;
      return r ? toLaunch(r) : null;
    },
    listLaunches: () => (db.prepare('SELECT * FROM launches').all() as Row[]).map(toLaunch),
    putLaunch: (l) => {
      db.prepare(
        'INSERT INTO launches (name, pid, pgid, command, started_at, log_path) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET pid = excluded.pid, pgid = excluded.pgid, command = excluded.command, started_at = excluded.started_at, log_path = excluded.log_path',
      ).run(l.name, l.pid, l.pgid, l.command, l.startedAt, l.logPath);
    },
    deleteLaunch: (name) => {
      db.prepare('DELETE FROM launches WHERE name = ?').run(name);
    },
    getMeta: (key) => {
      const r = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as Row | undefined;
      return r ? String(r.value) : null;
    },
    setMeta: (key, value) => {
      db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
        key,
        value,
      );
    },
    close: () => db.close(),
  };
}
