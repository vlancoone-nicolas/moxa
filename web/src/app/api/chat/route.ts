import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { seedServices } from '@/lib/services';
import { getOrCreateSessionId } from '@/lib/session';
import { handleIncomingMessage } from '@/lib/conversation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { message?: unknown };
    const text = typeof body.message === 'string' ? body.message.trim() : '';
    if (!text) return NextResponse.json({ error: 'message vacío' }, { status: 400 });

    await ensureSchema();
    await seedServices();
    const sid = await getOrCreateSessionId();
    const reply = await handleIncomingMessage(sid, text);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error('[api/chat] error:', err);
    const msg = err instanceof Error ? err.message : 'error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
