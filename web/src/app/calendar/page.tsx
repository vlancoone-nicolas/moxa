import { ensureSchema } from '@/lib/db';
import { seedServices, getServiceSync } from '@/lib/services';
import { getUpcomingWeekAll } from '@/lib/calendar';
import { formatInTimeZone } from 'date-fns-tz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TZ = 'Europe/Madrid';

export default async function CalendarPage() {
  await ensureSchema();
  await seedServices();
  const appts = await getUpcomingWeekAll();

  const byDay = new Map<string, typeof appts>();
  for (const a of appts) {
    const key = formatInTimeZone(a.starts_at, TZ, "EEEE d 'de' MMMM yyyy");
    const bucket = byDay.get(key) ?? [];
    bucket.push(a);
    byDay.set(key, bucket);
  }

  const total = appts.length;
  const now = formatInTimeZone(new Date(), TZ, "d 'de' MMMM, HH:mm");

  return (
    <div>
      <style>{`
        html, body { margin: 0; background: #fafaf7; color: #1a1a1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; }
        header { padding: 24px 32px; border-bottom: 1px solid #e5e5e0; background: #fff; }
        header h1 { margin: 0; font-size: 22px; font-weight: 600; }
        header .sub { color: #666; font-size: 13px; margin-top: 4px; }
        main { max-width: 900px; margin: 0 auto; padding: 24px 32px; }
        section { margin-bottom: 32px; }
        section h2 { font-size: 15px; font-weight: 600; text-transform: capitalize; margin: 0 0 12px; color: #8b5a3c; border-bottom: 1px solid #e5e5e0; padding-bottom: 6px; }
        table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e5e5e0; border-radius: 6px; overflow: hidden; }
        th, td { padding: 10px 14px; text-align: left; font-size: 14px; }
        th { background: #f6f5f1; font-weight: 600; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; }
        tr + tr td { border-top: 1px solid #e5e5e0; }
        td.time { font-variant-numeric: tabular-nums; font-weight: 600; }
        td.price { text-align: right; font-variant-numeric: tabular-nums; }
        .empty { color: #666; background: #fff; padding: 32px; border: 1px dashed #e5e5e0; border-radius: 6px; text-align: center; }
        footer { max-width: 900px; margin: 0 auto; padding: 16px 32px 48px; color: #666; font-size: 12px; }
        a { color: #075e54; text-decoration: none; }
      `}</style>
      <header>
        <h1>Centro Moxa · agenda</h1>
        <div className="sub">{total} {total === 1 ? 'cita' : 'citas'} próxima semana · actualizado {now} · <a href="/chat">volver al chat</a></div>
      </header>
      <main>
        {total === 0 ? <p className="empty">Todavía no hay citas. Haz una reserva desde el chat.</p> : null}
        {[...byDay.entries()].map(([day, rows]) => (
          <section key={day}>
            <h2>{day}</h2>
            <table>
              <thead>
                <tr><th>Hora</th><th>Servicio</th><th>Cliente</th><th>Precio</th></tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const svc = getServiceSync(a.service_id);
                  return (
                    <tr key={a.id}>
                      <td className="time">{formatInTimeZone(a.starts_at, TZ, 'HH:mm')}</td>
                      <td>{svc?.name ?? a.service_id}</td>
                      <td>{a.client_name}</td>
                      <td className="price">{svc?.price_eur ?? '—'}€</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </main>
      <footer>Las reservas llegan automáticamente desde el bot. En producción se sincroniza con tu Google Calendar.</footer>
    </div>
  );
}
