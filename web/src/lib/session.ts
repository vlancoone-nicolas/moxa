import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';

const COOKIE = 'moxa_sid';
const MAX_AGE = 60 * 60 * 24 * 7; // 1 semana

/**
 * Devuelve el session ID del visitante (lo crea si no existe).
 * Cada visitante tiene su propia conversación aislada.
 */
export async function getOrCreateSessionId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return existing;
  const sid = randomUUID();
  jar.set(COOKIE, sid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE,
    path: '/',
  });
  return sid;
}

export async function readSessionId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}
