import { db } from './db.ts';

export interface Service {
  id: string;
  name: string;
  description: string;
  duration_min: number;
  price_eur: number;
}

// Catálogo inventado — Nicolás dijo "invéntate lo que sea y ya se adaptará".
// Realista para un centro pequeño de medicina tradicional china.
const CATALOG: Service[] = [
  {
    id: 'consulta-inicial',
    name: 'Consulta inicial diagnóstica',
    description: 'Primera visita. Diagnóstico por pulso y lengua, historia clínica, plan de tratamiento.',
    duration_min: 90,
    price_eur: 60,
  },
  {
    id: 'moxibustion',
    name: 'Sesión de moxibustión',
    description: 'Calentamiento de puntos de acupuntura con moxa (artemisa). Ideal para frío interno, dolores crónicos.',
    duration_min: 60,
    price_eur: 45,
  },
  {
    id: 'acupuntura',
    name: 'Sesión de acupuntura',
    description: 'Tratamiento con agujas finas. Dolor, ansiedad, migrañas, ciclo menstrual.',
    duration_min: 45,
    price_eur: 40,
  },
  {
    id: 'combi-moxa-acupuntura',
    name: 'Combinada moxa + acupuntura',
    description: 'Sesión completa combinada. Recomendada para casos de dolor crónico.',
    duration_min: 75,
    price_eur: 55,
  },
  {
    id: 'tui-na',
    name: 'Masaje Tui-Na',
    description: 'Masaje terapéutico chino. Contracturas, estrés muscular.',
    duration_min: 60,
    price_eur: 50,
  },
];

// Horario del centro — Europe/Madrid
// Weekday: 0=Sunday, 1=Monday, ..., 6=Saturday
export const OPENING_HOURS: Record<number, Array<{ start: string; end: string }>> = {
  1: [{ start: '10:00', end: '14:00' }, { start: '16:00', end: '20:00' }], // L
  2: [{ start: '10:00', end: '14:00' }, { start: '16:00', end: '20:00' }], // M
  3: [{ start: '10:00', end: '14:00' }, { start: '16:00', end: '20:00' }], // X
  4: [{ start: '10:00', end: '14:00' }, { start: '16:00', end: '20:00' }], // J
  5: [{ start: '10:00', end: '14:00' }, { start: '16:00', end: '20:00' }], // V
  6: [{ start: '10:00', end: '14:00' }], // S
  0: [], // D — cerrado
};

export function seedServices(): void {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO services (id, name, description, duration_min, price_eur)
     VALUES (@id, @name, @description, @duration_min, @price_eur)`,
  );
  const txn = db.transaction((rows: Service[]) => {
    for (const r of rows) stmt.run(r);
  });
  txn(CATALOG);
}

export function listServices(): Service[] {
  return db.prepare('SELECT * FROM services ORDER BY price_eur ASC').all() as Service[];
}

export function getService(id: string): Service | undefined {
  return db.prepare('SELECT * FROM services WHERE id = ?').get(id) as Service | undefined;
}
