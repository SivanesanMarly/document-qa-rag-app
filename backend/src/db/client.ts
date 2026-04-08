import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { env } from '../config.js';

const absoluteDbPath = path.resolve(env.DB_PATH);
const dbDirectory = path.dirname(absoluteDbPath);

fs.mkdirSync(dbDirectory, { recursive: true });

export const db = new Database(absoluteDbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    page_number INTEGER,
    text TEXT NOT NULL,
    token_count INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS embeddings (
    id TEXT PRIMARY KEY,
    chunk_id TEXT NOT NULL,
    model TEXT NOT NULL,
    vector_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
  );
`);

const chunkColumns = db.prepare(`PRAGMA table_info(chunks)`).all() as Array<{ name: string }>;
const hasPageNumberColumn = chunkColumns.some((column) => column.name === 'page_number');
if (!hasPageNumberColumn) {
  db.exec(`ALTER TABLE chunks ADD COLUMN page_number INTEGER`);
}
