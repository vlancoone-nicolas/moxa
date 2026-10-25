import { getSql } from './db';
import { getServiceSync, OPENING_HOURS } from './services';
import { addDays, addMinutes, format, parseISO } from 'date-fns';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';

const TZ = 'Europe/Madrid';
const SLOT_STEP_MIN = 15;

export interface Slot {
  starts_at: string;
  starts_at_local: string;
  ends_at: string;
}

export interface Appointment {
  id: number;
  session_id: string;
  client_name: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  created_at: string;
}

export async function getAvailableSlots(serviceId: string, daysAhead = 7, limit = 6): Promise<Slot[]> {
  const service = getServiceSync(serviceId);
  if (!service) return [];

  const now = new Date();
  const slots: Slot[] = [];
  const sql = getSql();

  // Obtener todas las reservas confirmadas futuras una vez
  const until = new Date(Date.now() + daysAhead * 86_400_000).toISOString();
  const bookings = (await sql`
    SELECT starts_at, ends_at FROM appointments
    WHERE status = 'confirmed'
      AND starts_at >= NOW()
      AND starts_at < ${until}
  `) as Array<{ starts_at: string; ends_at: string }>;

  const booked = bookings.map((b) => ({
    start: new Date(b.starts_at).getTime(),
    end: new Date(b.ends_at).getTime(),
  }));

  for (let d = 0; d < daysAhead && slots.length < limit; d++) {
    const dayLocal = toZonedTime(addDays(now, d), TZ);
    const weekday = dayLocal.getDay();
    const periods = OPENING_HOURS[weekday] ?? [];

    for (const period of periods) {
      const [sh, sm] = period.start.split(':').map(Number) as [number, number];
      const [eh, em] = period.end.split(':').map(Number) as [number, number];
      const dateStr = format(dayLocal, 'yyyy-MM-dd');
      let cursor = fromZonedTime(`${dateStr}T${pad(sh)}:${pad(sm)}:00`, TZ);
      const periodEnd = fromZonedTime(`${dateStr}T${pad(eh)}:${pad(em)}:00`, TZ);

      while (cursor.getTime() + service.duration_min * 60_000 <= periodEnd.getTime()) {
        const slotEnd = addMinutes(cursor, service.duration_min);
        if (cursor > now && !conflicts(cursor.getTime(), slotEnd.getTime(), booked)) {
          slots.push({
            starts_at: cursor.toISOString(),
            starts_at_local: formatInTimeZone(cursor, TZ, "EEEE d 'de' MMMM, HH:mm"),
            ends_at: slotEnd.toISOString(),
          });
          if (slots.length >= limit) return slots;
        }
        cursor = addMinutes(cursor, SLOT_STEP_MIN);
      }
    }
  }
  return slots;
}

function conflicts(start: number, end: number, booked: Array<{ start: number; end: number }>): boolean {
  return booked.some((b) => !(end <= b.start || start >= b.end));
}

export async function bookAppointment(input: {
  session_id: string;
  client_name: string;
  service_id: string;
  starts_at: string;
}): Promise<{ ok: true; appointment: Appointment } | { ok: false; reason: string }> {
  const service = getServiceSync(input.service_id);
  if (!service) return { ok: false, reason: `Servicio '${input.service_id}' no existe. IDs válidos: consulta-inicial, moxibustion, acupuntura, combi-moxa-acupuntura, tui-na.` };

  const start = parseISO(input.starts_at);
  if (isNaN(start.getTime())) {
    return { ok: false, reason: `Fecha inválida: '${input.starts_at}'. Debes usar un starts_at exacto devuelto por get_available_slots.` };
  }
  if (start <= new Date()) {
    return { ok: false, reason: `La hora '${input.starts_at}' ya pasó. Pregunta al cliente qué otro horario prefiere; NO llames a get_available_slots sin preguntar.` };
  }

  const end = addMinutes(start, service.duration_min);
  const local = toZonedTime(start, TZ);
  const weekday = local.getDay();
  const periods = OPENING_HOURS[weekday] ?? [];
  const localTime = `${pad(local.getHours())}:${pad(local.getMinutes())}`;
  const insidePeriod = periods.some((p) => localTime >= p.start && addLocalMinutesLe(localTime, service.duration_min, p.end));
  if (!insidePeriod) return { ok: false, reason: 'La hora elegida está fuera del horario del centro.' };

  const sql = getSql();
  const conflict = (await sql`
    SELECT 1 FROM appointments
    WHERE status = 'confirmed'
      AND NOT (ends_at <= ${start.toISOString()} OR starts_at >= ${end.toISOString()})
    LIMIT 1
  `) as Array<{ '?column?': number }>;
  if (conflict.length > 0) return { ok: false, reason: 'Ese hueco acaba de ocuparse. Pide al cliente otro horario.' };

  const rows = (await sql`
    INSERT INTO appointments (session_id, client_name, service_id, starts_at, ends_at)
    VALUES (${input.session_id}, ${input.client_name}, ${input.service_id}, ${start.toISOString()}, ${end.toISOString()})
    RETURNING id, session_id, client_name, service_id, starts_at::text, ends_at::text, status, created_at::text
  `) as Appointment[];
  const appt = rows[0];
  if (!appt) return { ok: false, reason: 'Error al guardar la cita.' };
  return { ok: true, appointment: appt };
}

export async function getAppointmentsBySession(sessionId: string): Promise<Appointment[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, session_id, client_name, service_id, starts_at::text, ends_at::text, status, created_at::text
    FROM appointments
    WHERE session_id = ${sessionId}
      AND starts_at >= NOW()
      AND status = 'confirmed'
    ORDER BY starts_at ASC
  `) as Appointment[];
  return rows;
}

export async function cancelAppointment(id: number, sessionId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE appointments SET status = 'cancelled'
    WHERE id = ${id} AND session_id = ${sessionId} AND status = 'confirmed'
    RETURNING id
  `) as Array<{ id: number }>;
  if (rows.length === 0) return { ok: false, reason: 'Cita no encontrada o ya cancelada.' };
  return { ok: true };
}

export async function getUpcomingWeekAll(): Promise<Appointment[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, session_id, client_name, service_id, starts_at::text, ends_at::text, status, created_at::text
    FROM appointments
    WHERE status = 'confirmed'
      AND starts_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
    ORDER BY starts_at ASC
  `) as Appointment[];
  return rows;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function addLocalMinutesLe(hhmm: string, mins: number, limit: string): boolean {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const total = h * 60 + m + mins;
  const [lh, lm] = limit.split(':').map(Number) as [number, number];
  return total <= lh * 60 + lm;
}
