import cron from 'node-cron';
import { getUpcomingAppointmentsForReminder, markReminderSent } from './calendar.ts';
import { getService } from './services.ts';
import { sendText } from './evolution.ts';
import { formatInTimeZone } from 'date-fns-tz';
import { TZ } from './env.ts';

async function runOnce(): Promise<void> {
  const appts = getUpcomingAppointmentsForReminder(15);
  for (const a of appts) {
    const service = getService(a.service_id);
    const when = formatInTimeZone(a.starts_at, TZ, "EEEE d 'de' MMMM 'a las' HH:mm");
    const text = `👋 Hola ${a.client_name.split(' ')[0]}, te recuerdo tu cita en Centro Moxa:\n\n🌿 ${service?.name ?? 'Sesión'}\n📅 ${when}\n\nResponde *SÍ* para confirmar o *CANCELAR* si no puedes venir.`;
    try {
      await sendText(a.phone, text);
      markReminderSent(a.id);
      console.log(`[reminders] enviado a ${a.phone} para cita ${a.id}`);
    } catch (err) {
      console.error(`[reminders] fallo enviando ${a.id}:`, (err as Error).message);
    }
  }
}

export function startReminderJob(): void {
  // Cada 15 minutos
  cron.schedule('*/15 * * * *', () => {
    runOnce().catch((err) => console.error('[reminders] cron error:', err));
  });
  console.log('[reminders] cron activo (cada 15 min)');
}
