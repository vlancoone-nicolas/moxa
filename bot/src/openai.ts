import OpenAI from 'openai';
import { env } from './env.ts';

export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function transcribeAudio(audio: Buffer, mimetype = 'audio/ogg'): Promise<string> {
  const file = new File([audio], 'audio.ogg', { type: mimetype });
  const resp = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'es',
  });
  return resp.text;
}
