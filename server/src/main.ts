import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { openDb } from './db';
import { runCommand } from './exec';
import { checkHealth } from './health';
import { RefreshManager } from './refresh';
import { RuntimeCache, detectRuntime } from './runtime/detect';
import { cleanupLaunches } from './runtime/launcher';

const HUB_DIR = path.resolve(import.meta.dirname, '../..');
const ROOT = realpathSync(process.env.HUB_ROOT ?? path.join(homedir(), 'git/personal'));
const DATA = path.join(HUB_DIR, 'data');
const PORT = Number(process.env.HUB_PORT ?? 4310);

const db = openDb(path.join(DATA, 'hub.db'));
cleanupLaunches(db);

const refresh = new RefreshManager({
  root: ROOT,
  exclude: [path.basename(HUB_DIR)],
  db,
  run: runCommand,
  summaryModel: process.env.HUB_SUMMARY_MODEL ?? 'sonnet',
});
refresh.subscribe((e) => {
  if (e.type === 'done') console.log(`[project-hub] 새로고침 완료 (${Math.round(e.durationMs / 1000)}초)`);
  if (e.type === 'error') console.error(`[project-hub] 새로고침 실패: ${e.message}`);
});

const runtime = new RuntimeCache(() => {
  // 스스로 죽은 실행 기록을 매번 정리해, 재사용된 pgid가 허브 실행으로 오인되지 않게 한다.
  cleanupLaunches(db);
  return detectRuntime(
    {
      projects: db.listProjects().map((p) => ({ name: p.name, path: p.path })),
      launched: new Map(db.listLaunches().map((l) => [l.name, l.pgid])),
    },
    runCommand,
  );
});

const app = createApp({
  db,
  refresh,
  runtime,
  run: runCommand,
  logsDir: path.join(DATA, 'logs'),
  health: () => checkHealth(runCommand),
});

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: PORT }, (info) => {
  console.log(`[project-hub] API http://127.0.0.1:${info.port}  (root: ${ROOT})`);
  if (db.listProjects().length === 0) {
    console.log('[project-hub] DB가 비어 있어 최초 새로고침을 시작합니다');
    refresh.start();
  }
});
