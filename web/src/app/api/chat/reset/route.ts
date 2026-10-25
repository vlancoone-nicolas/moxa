import { NextResponse } from 'next/server';
import { ensureSchema, resetConversation } from '@/lib/db';
import { readSessionId } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await ensureSchema();
    const sid = await readSessionId();
    if (sid) await resetConversation(sid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
