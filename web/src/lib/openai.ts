import OpenAI from 'openai';

let _client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY no configurada');
  _client = new OpenAI({ apiKey: key });
  return _client;
}

export const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
