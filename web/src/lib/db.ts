import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let _sql: NeonQueryFunction<false, false> | null = null;
let _schemaReady = false;

export function getSql(): NeonQueryFunction<false, false> {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no está configurada. Instala Neon via Vercel Marketplace.');
  _sql = neon(url);
  return _sql;
}

/**
 * Crea tablas y seed inicial si no existen. Idempotente.
 * Se llama al inicio de cada API route.
 */
export async function ensureSchema(): Promise<void> {
  if (_schemaReady) return;
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      price_eur REAL NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      client_name TEXT NOT NULL,
      service_id TEXT NOT NULL REFERENCES services(id),
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_appts_starts ON appointments(starts_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_appts_session ON appointments(session_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS conversations (
      session_id TEXT PRIMARY KEY,
      history_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  _schemaReady = true;
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
export interface StoredMessage {
  role: ChatRole;
  content: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
}

const MAX_HISTORY = 20;

export async function getConversationHistory(sessionId: string): Promise<StoredMessage[]> {
  const sql = getSql();
  const rows = (await sql`SELECT history_json FROM conversations WHERE session_id = ${sessionId}`) as Array<{
    history_json: unknown;
  }>;
  const first = rows[0];
  if (!first) return [];
  const h = first.history_json;
  return Array.isArray(h) ? (h as StoredMessage[]) : [];
}

export async function saveConversationHistory(sessionId: string, history: StoredMessage[]): Promise<void> {
  const sql = getSql();
  const trimmed = history.slice(-MAX_HISTORY);
  await sql`
    INSERT INTO conversations (session_id, history_json, updated_at)
    VALUES (${sessionId}, ${JSON.stringify(trimmed)}::jsonb, NOW())
    ON CONFLICT (session_id) DO UPDATE
      SET history_json = EXCLUDED.history_json, updated_at = NOW()
  `;
}

export async function resetConversation(sessionId: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM conversations WHERE session_id = ${sessionId}`;
}
