import { db } from './db.ts';
import { getService, OPENING_HOURS } from './services.ts';
import { TZ } from './env.ts';
import { addDays, addMinutes, format, parseISO } from 'date-fns';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';

export interface Slot {
  starts_at: string; // ISO UTC
  starts_at_local: string; // human readable in Madrid
  ends_at: string;
}

export interface Appointment {
  id: number;
  phone: string;
  client_name: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  reminder_sent: number;
  created_at: string;
}

const SLOT_STEP_MIN = 15; // granularidad de huecos

export function getAvailableSlots(serviceId: string, daysAhead = 7, limit = 8): Slot[] {
  const service = getService(serviceId);
  if (!service) return [];

  const now = new Date();
  const slots: Slot[] = [];

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
        // Future and not conflicting
        if (cursor > now && !hasConflict(cursor.toISOString(), slotEnd.toISOString())) {
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

function hasConflict(startIso: string, endIso: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM appointments
       WHERE status = 'confirmed'
         AND NOT (ends_at <= ? OR starts_at >= ?)
       LIMIT 1`,
    )
    .get(startIso, endIso);
  return !!row;
}

export function bookAppointment(input: {
  phone: string;
  client_name: string;
  service_id: string;
  starts_at: string; // ISO
}): { ok: true; appointment: Appointment } | { ok: false; reason: string } {
  const service = getService(input.service_id);
  if (!service) return { ok: false, reason: 'Servicio no encontrado' };

  const start = parseISO(input.starts_at);
  if (isNaN(start.getTime())) return { ok: false, reason: `Fecha inválida: '${input.starts_at}'. Debes usar un starts_at exacto devuelto por get_available_slots.` };
  if (start <= new Date()) return { ok: false, reason: `La hora '${input.starts_at}' ya pasó. Pregunta al cliente qué otro horario prefiere; NO llames a get_available_slots sin preguntar.` };

  const end = addMinutes(start, service.duration_min);
  if (hasConflict(start.toISOString(), end.toISOString())) {
    return { ok: false, reason: 'Ese hueco ya está reservado. Elige otro.' };
  }

  // Verify slot aligns with opening hours
  const local = toZonedTime(start, TZ);
  const weekday = local.getDay();
  const periods = OPENING_HOURS[weekday] ?? [];
  const localTime = `${pad(local.getHours())}:${pad(local.getMinutes())}`;
  const insidePeriod = periods.some((p) => localTime >= p.start && addLocalMinutesLe(localTime, service.duration_min, p.end));
  if (!insidePeriod) return { ok: false, reason: 'Fuera de horario del centro' };

  const result = db
    .prepare(
      `INSERT INTO appointments (phone, client_name, service_id, starts_at, ends_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(input.phone, input.client_name, input.service_id, start.toISOString(), end.toISOString());

  const appt = db
    .prepare('SELECT * FROM appointments WHERE id = ?')
    .get(result.lastInsertRowid) as Appointment;

  return { ok: true, appointment: appt };
}

export function getAppointmentsByPhone(phone: string, futureOnly = true): Appointment[] {
  const sql = futureOnly
    ? `SELECT * FROM appointments WHERE phone = ? AND starts_at >= datetime('now') AND status = 'confirmed' ORDER BY starts_at ASC`
    : `SELECT * FROM appointments WHERE phone = ? ORDER BY starts_at DESC`;
  return db.prepare(sql).all(phone) as Appointment[];
}

export function cancelAppointment(id: number, phone: string): { ok: true } | { ok: false; reason: string } {
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ? AND phone = ?').get(id, phone) as
    | Appointment
    | undefined;
  if (!appt) return { ok: false, reason: 'Cita no encontrada' };
  if (appt.status !== 'confirmed') return { ok: false, reason: 'Cita ya cancelada' };
  db.prepare(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`).run(id);
  return { ok: true };
}

export function getUpcomingAppointmentsForReminder(windowMinutes = 15): Appointment[] {
  // Appointments between 24h-window and 24h+window from now, not yet reminded
  const sql = `
    SELECT * FROM appointments
    WHERE status = 'confirmed'
      AND reminder_sent = 0
      AND starts_at BETWEEN datetime('now', '+' || (24 * 60 - ?) || ' minutes')
                        AND datetime('now', '+' || (24 * 60 + ?) || ' minutes')
    ORDER BY starts_at ASC
  `;
  return db.prepare(sql).all(windowMinutes, windowMinutes) as Appointment[];
}

export function markReminderSent(id: number): void {
  db.prepare('UPDATE appointments SET reminder_sent = 1 WHERE id = ?').run(id);
}

export function getUpcomingWeekAppointments(): Appointment[] {
  return db
    .prepare(
      `SELECT * FROM appointments
       WHERE status = 'confirmed'
         AND starts_at BETWEEN datetime('now') AND datetime('now', '+7 days')
       ORDER BY starts_at ASC`,
    )
    .all() as Appointment[];
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
