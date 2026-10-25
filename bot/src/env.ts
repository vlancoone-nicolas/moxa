import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { z } from 'zod';

// Preferir .env.local (gitignored) sobre .env
if (existsSync('.env.local')) loadDotenv({ path: '.env.local' });
else loadDotenv();

const schema = z.object({
  OPENAI_API_KEY: z.string().min(10, 'Define OPENAI_API_KEY en .env.local'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  EVOLUTION_API_URL: z.string().url().default('http://localhost:8080'),
  EVOLUTION_API_KEY: z.string().min(1),
  EVOLUTION_INSTANCE: z.string().default('moxa'),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  TZ: z.string().default('Europe/Madrid'),
  // Whitelist: lista de teléfonos (sin +, con prefijo país) separados por coma.
  // Vacío = responde a todos (modo producción futuro). Durante demo SIEMPRE con valores.
  ALLOWED_PHONES: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Env inválido:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const TZ = env.TZ;

const whitelist = env.ALLOWED_PHONES.split(',').map((s) => s.trim()).filter(Boolean);
export const ALLOWED_PHONES = new Set(whitelist);
export const WHITELIST_ACTIVE = ALLOWED_PHONES.size > 0;

if (WHITELIST_ACTIVE) {
  console.log(`🔒 Modo demo · whitelist activa (${ALLOWED_PHONES.size} números): ${[...ALLOWED_PHONES].join(', ')}`);
} else {
  console.log('⚠️  ALLOWED_PHONES vacío · bot responderá a CUALQUIER número que te escriba. Configura la whitelist en .env.local.');
}
