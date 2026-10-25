import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, '../data/moxa.db');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    duration_min INTEGER NOT NULL,
    price_eur REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    client_name TEXT NOT NULL,
    service_id TEXT NOT NULL REFERENCES services(id),
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed',
    reminder_sent INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_appts_starts ON appointments(starts_at);
  CREATE INDEX IF NOT EXISTS idx_appts_phone ON appointments(phone);

  CREATE TABLE IF NOT EXISTS conversations (
    phone TEXT PRIMARY KEY,
    history_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
export interface StoredMessage {
  role: ChatRole;
  content: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
}

const MAX_HISTORY_MESSAGES = 20;

export function getConversationHistory(phone: string): StoredMessage[] {
  const row = db.prepare('SELECT history_json FROM conversations WHERE phone = ?').get(phone) as
    | { history_json: string }
    | undefined;
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.history_json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConversationHistory(phone: string, history: StoredMessage[]): void {
  const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
  db.prepare(
    `INSERT INTO conversations (phone, history_json, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(phone) DO UPDATE SET history_json = excluded.history_json, updated_at = datetime('now')`,
  ).run(phone, JSON.stringify(trimmed));
}

export function resetConversation(phone: string): void {
  db.prepare('DELETE FROM conversations WHERE phone = ?').run(phone);
}
