import express from 'express';
import type { Request, Response } from 'express';
import { env, ALLOWED_PHONES, WHITELIST_ACTIVE } from './env.ts';
import { seedServices } from './services.ts';
import { handleIncomingMessage } from './conversation.ts';
import { downloadAudioBase64, markRead, sendText } from './evolution.ts';
import { transcribeAudio } from './openai.ts';
import { startReminderJob } from './reminders.ts';
import { renderCalendar } from './views/calendar.ts';
import { renderChat } from './views/chat.ts';
import { resetConversation } from './db.ts';

const DEMO_WEB_PHONE = 'demo-web-test';

seedServices();

const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.get('/calendar', (_req: Request, res: Response) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.send(renderCalendar());
});

app.get('/chat', (_req: Request, res: Response) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.send(renderChat());
});

app.post('/chat', async (req: Request, res: Response) => {
  const text = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!text) {
    res.status(400).json({ error: 'message vacío' });
    return;
  }
  try {
    const reply = await handleIncomingMessage(DEMO_WEB_PHONE, text);
    res.json({ reply });
  } catch (err) {
    console.error('[chat] error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/chat/reset', (_req: Request, res: Response) => {
  resetConversation(DEMO_WEB_PHONE);
  res.json({ ok: true });
});

interface EvolutionMessageEvent {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      audioMessage?: { mimetype?: string };
    };
    messageType?: string;
    pushName?: string;
  };
}

app.post('/webhook/evolution', async (req: Request, res: Response) => {
  // Responder YA al webhook para que Evolution no reintente
  res.status(200).json({ received: true });

  const body = req.body as EvolutionMessageEvent;
  try {
    const event = body?.event;
    const data = body?.data;
    if (event !== 'messages.upsert' || !data?.key) return;
    if (data.key.fromMe) return; // ignorar nuestros propios mensajes
    const remoteJid = data.key.remoteJid ?? '';
    if (remoteJid.endsWith('@g.us')) return; // grupos ignorados
    const phone = remoteJid.replace(/@s\.whatsapp\.net$/, '');
    if (!phone) return;

    // Whitelist durante demo. Fuera de whitelist: ignorar silenciosamente
    // (el mensaje queda unread en tu WhatsApp, lo respondes tú a mano).
    if (WHITELIST_ACTIVE && !ALLOWED_PHONES.has(phone)) {
      console.log(`[bot] ignorado (fuera de whitelist): ${phone}`);
      return;
    }

    let userText: string | null = null;

    const msg = data.message ?? {};
    if (msg.conversation) {
      userText = msg.conversation;
    } else if (msg.extendedTextMessage?.text) {
      userText = msg.extendedTextMessage.text;
    } else if (msg.audioMessage) {
      // Transcribir audio
      const audio = await downloadAudioBase64({
        remoteJid,
        id: data.key.id ?? '',
        fromMe: false,
      });
      if (audio) {
        userText = await transcribeAudio(audio, msg.audioMessage.mimetype ?? 'audio/ogg');
        console.log(`[bot] audio transcrito (${phone}):`, userText);
      }
    }

    if (!userText) return;
    if (data.key.id) await markRead(phone, data.key.id);

    const reply = await handleIncomingMessage(phone, userText);
    await sendText(phone, reply);
  } catch (err) {
    console.error('[webhook] error procesando mensaje:', err);
  }
});

app.listen(env.PORT, () => {
  console.log(`✅ Bot Moxa escuchando en http://localhost:${env.PORT}`);
  console.log(`   Playground:     http://localhost:${env.PORT}/chat`);
  console.log(`   Panel agenda:   http://localhost:${env.PORT}/calendar`);
  console.log(`   Webhook target: ${env.PUBLIC_URL}/webhook/evolution`);
  startReminderJob();
});
