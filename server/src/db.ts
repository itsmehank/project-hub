import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { EMPTY_PERSONAL, type ChecklistItem, type Decision, type DecisionInput, type Personal, type PersonalInput, type RunConfig, type StoredProject, type Summary } from '@hub/shared';

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
  getPersonal(name: string): Personal;
  putPersonal(name: string, input: PersonalInput): Personal;
  listDecisions(): Decision[];
  getDecision(id: string): Decision | null;
  putDecision(id: string, input: DecisionInput): Decision;
  putChecklist(id: string, items: ChecklistItem[]): Decision | null;
  deleteDecision(id: string): boolean;
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
CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', snapshot TEXT NOT NULL, projects TEXT NOT NULL, checklist TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_personal (name TEXT PRIMARY KEY, lifecycle TEXT, note TEXT NOT NULL DEFAULT '', links TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL);
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

  const toDecision = (r: Row): Decision => ({
    id: String(r.id),
    kind: r.kind as Decision['kind'],
    status: r.status as Decision['status'],
    reason: String(r.reason),
    snapshot: JSON.parse(String(r.snapshot)),
    projects: JSON.parse(String(r.projects)),
    checklist: JSON.parse(String(r.checklist)),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  });
  const getDecision = (id: string) => {
    const r = db.prepare('SELECT * FROM decisions WHERE id = ?').get(id) as Row | undefined;
    return r ? toDecision(r) : null;
  };

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
      for (const t of ['projects', 'summaries', 'run_configs', 'launches', 'project_personal']) {
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
    getPersonal: (name) => {
      const r = db.prepare('SELECT * FROM project_personal WHERE name = ?').get(name) as Row | undefined;
      return r
        ? {
            lifecycle: (r.lifecycle as Personal['lifecycle']) ?? null,
            note: String(r.note),
            links: JSON.parse(String(r.links)),
            updatedAt: String(r.updated_at),
          }
        : { ...EMPTY_PERSONAL };
    },
    putPersonal: (name, input) => {
      const updatedAt = new Date().toISOString();
      db.prepare(
        'INSERT INTO project_personal (name, lifecycle, note, links, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET lifecycle = excluded.lifecycle, note = excluded.note, links = excluded.links, updated_at = excluded.updated_at',
      ).run(name, input.lifecycle, input.note, JSON.stringify(input.links), updatedAt);
      return { ...input, updatedAt };
    },
    listDecisions: () => (db.prepare('SELECT * FROM decisions ORDER BY updated_at DESC').all() as Row[]).map(toDecision),
    getDecision,
    putDecision: (id, input) => {
      const now = new Date().toISOString();
      const prev = getDecision(id);
      let checklist = prev?.checklist ?? [];
      // 생성 규칙은 하나뿐: 저장 후 채택된 서비스 후보이고 체크리스트가 비어 있으면 다음 할 일로 만든다.
      if (input.status === 'adopted' && input.kind === 'candidate' && checklist.length === 0) {
        // 빈 항목은 체크리스트 검증(1자 이상)에 걸려 목록 전체를 고칠 수 없게 만들므로 뺀다.
        checklist = input.snapshot.nextSteps
          .map((text) => text.trim())
          .filter(Boolean)
          .slice(0, 20)
          .map((text, i) => ({ id: `s${i + 1}`, text: text.slice(0, 200), done: false }));
      }
      db.prepare(
        'INSERT INTO decisions (id, kind, status, reason, snapshot, projects, checklist, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, status = excluded.status, reason = excluded.reason, snapshot = excluded.snapshot, projects = excluded.projects, checklist = excluded.checklist, updated_at = excluded.updated_at',
      ).run(id, input.kind, input.status, input.reason, JSON.stringify(input.snapshot), JSON.stringify(input.projects), JSON.stringify(checklist), prev?.createdAt ?? now, now);
      return getDecision(id)!;
    },
    putChecklist: (id, items) => {
      if (!getDecision(id)) return null;
      db.prepare('UPDATE decisions SET checklist = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(items), new Date().toISOString(), id);
      return getDecision(id);
    },
    deleteDecision: (id) => Number(db.prepare('DELETE FROM decisions WHERE id = ?').run(id).changes) > 0,
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
