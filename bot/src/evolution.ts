import axios from 'axios';
import { env } from './env.ts';

const client = axios.create({
  baseURL: env.EVOLUTION_API_URL,
  headers: {
    apikey: env.EVOLUTION_API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 20_000,
});

export async function sendText(phoneWithoutPlus: string, text: string): Promise<void> {
  await client.post(`/message/sendText/${env.EVOLUTION_INSTANCE}`, {
    number: phoneWithoutPlus,
    text,
  });
}

export async function markRead(phoneWithoutPlus: string, messageId: string): Promise<void> {
  try {
    await client.put(`/chat/markMessageAsRead/${env.EVOLUTION_INSTANCE}`, {
      readMessages: [{ remoteJid: `${phoneWithoutPlus}@s.whatsapp.net`, id: messageId, fromMe: false }],
    });
  } catch {
    // non-critical
  }
}

/**
 * Download audio attachment from Evolution API.
 * Evolution exposes /chat/getBase64FromMediaMessage/{instance} to fetch media as base64.
 */
export async function downloadAudioBase64(messageKey: {
  remoteJid: string;
  id: string;
  fromMe: boolean;
}): Promise<Buffer | null> {
  try {
    const resp = await client.post<{ base64?: string }>(
      `/chat/getBase64FromMediaMessage/${env.EVOLUTION_INSTANCE}`,
      { message: { key: messageKey }, convertToMp4: false },
    );
    if (!resp.data?.base64) return null;
    return Buffer.from(resp.data.base64, 'base64');
  } catch (err) {
    console.error('[evolution] downloadAudioBase64 failed:', (err as Error).message);
    return null;
  }
}

export async function setWebhook(url: string): Promise<void> {
  await client.post(`/webhook/set/${env.EVOLUTION_INSTANCE}`, {
    url,
    enabled: true,
    events: ['MESSAGES_UPSERT'],
    webhook_by_events: false,
    webhook_base64: false,
  });
}

export async function createInstanceIfMissing(): Promise<void> {
  try {
    await client.get(`/instance/connectionState/${env.EVOLUTION_INSTANCE}`);
    return; // exists
  } catch {
    // create
  }
  await client.post('/instance/create', {
    instanceName: env.EVOLUTION_INSTANCE,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
  });
}
