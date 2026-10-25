import { getUpcomingWeekAppointments } from '../calendar.ts';
import { getService } from '../services.ts';
import { formatInTimeZone } from 'date-fns-tz';
import { TZ } from '../env.ts';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderCalendar(): string {
  const appts = getUpcomingWeekAppointments();

  const byDay = new Map<string, typeof appts>();
  for (const a of appts) {
    const dayKey = formatInTimeZone(a.starts_at, TZ, "EEEE d 'de' MMMM yyyy");
    const bucket = byDay.get(dayKey) ?? [];
    bucket.push(a);
    byDay.set(dayKey, bucket);
  }

  const totalCount = appts.length;
  const nowStr = formatInTimeZone(new Date(), TZ, "d 'de' MMMM, HH:mm");

  const sections = [...byDay.entries()]
    .map(([day, rows]) => {
      const items = rows
        .map((a) => {
          const service = getService(a.service_id);
          const time = formatInTimeZone(a.starts_at, TZ, 'HH:mm');
          return `
            <tr>
              <td class="time">${escapeHtml(time)}</td>
              <td class="service">${escapeHtml(service?.name ?? a.service_id)}</td>
              <td class="client">${escapeHtml(a.client_name)}</td>
              <td class="phone">${escapeHtml(a.phone)}</td>
              <td class="price">${service?.price_eur ?? '—'}€</td>
            </tr>
          `;
        })
        .join('');
      return `
        <section>
          <h2>${escapeHtml(day)}</h2>
          <table>
            <thead>
              <tr><th>Hora</th><th>Servicio</th><th>Cliente</th><th>WhatsApp</th><th>Precio</th></tr>
            </thead>
            <tbody>${items}</tbody>
          </table>
        </section>
      `;
    })
    .join('');

  const empty = totalCount === 0
    ? `<p class="empty">Todavía no hay citas esta semana. En cuanto alguien reserve por WhatsApp, aparecerá aquí.</p>`
    : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Centro Moxa · Agenda</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { --fg: #1a1a1a; --muted: #666; --accent: #8b5a3c; --bg: #fafaf7; --border: #e5e5e0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--fg); line-height: 1.5; }
  header { padding: 24px 32px; border-bottom: 1px solid var(--border); background: #fff; }
  header h1 { margin: 0; font-size: 22px; font-weight: 600; }
  header .sub { color: var(--muted); font-size: 13px; margin-top: 4px; }
  main { max-width: 900px; margin: 0 auto; padding: 24px 32px; }
  section { margin-bottom: 32px; }
  section h2 { font-size: 15px; font-weight: 600; text-transform: capitalize; margin: 0 0 12px; color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  th, td { padding: 10px 14px; text-align: left; font-size: 14px; }
  th { background: #f6f5f1; font-weight: 600; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; }
  tr + tr td { border-top: 1px solid var(--border); }
  td.time { font-variant-numeric: tabular-nums; font-weight: 600; }
  td.phone { font-family: 'SF Mono', Menlo, monospace; font-size: 13px; color: var(--muted); }
  td.price { text-align: right; font-variant-numeric: tabular-nums; }
  .empty { color: var(--muted); background: #fff; padding: 32px; border: 1px dashed var(--border); border-radius: 6px; text-align: center; }
  footer { max-width: 900px; margin: 0 auto; padding: 16px 32px 48px; color: var(--muted); font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>Centro Moxa · Agenda próxima semana</h1>
  <div class="sub">${totalCount} ${totalCount === 1 ? 'cita' : 'citas'} · actualizado ${escapeHtml(nowStr)}</div>
</header>
<main>
  ${empty}
  ${sections}
</main>
<footer>Demo · las reservas llegan automáticamente desde WhatsApp. En producción se sincroniza con tu Google Calendar.</footer>
</body>
</html>`;
}
