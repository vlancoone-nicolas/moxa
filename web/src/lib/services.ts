import { getSql } from './db';

export interface Service {
  id: string;
  name: string;
  description: string;
  duration_min: number;
  price_eur: number;
}

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
    description: 'Calentamiento de puntos con moxa (artemisa). Ideal para frío interno y dolores crónicos.',
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

// Weekday: 0=Sunday, 1=Monday, ..., 6=Saturday
export const OPENING_HOURS: Record<number, Array<{ start: string; end: string }>> = {
  1: [{ start: '10:00', end: '14:00' }, { start: '16:00', end: '20:00' }],
  2: [{ start: '10:00', end: '14:00' }, { start: '16:00', end: '20:00' }],
  3: [{ start: '10:00', end: '14:00' }, { start: '16:00', end: '20:00' }],
  4: [{ start: '10:00', end: '14:00' }, { start: '16:00', end: '20:00' }],
  5: [{ start: '10:00', end: '14:00' }, { start: '16:00', end: '20:00' }],
  6: [{ start: '10:00', end: '14:00' }],
  0: [],
};

let seeded = false;

export async function seedServices(): Promise<void> {
  if (seeded) return;
  const sql = getSql();
  for (const s of CATALOG) {
    await sql`
      INSERT INTO services (id, name, description, duration_min, price_eur)
      VALUES (${s.id}, ${s.name}, ${s.description}, ${s.duration_min}, ${s.price_eur})
      ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            duration_min = EXCLUDED.duration_min,
            price_eur = EXCLUDED.price_eur
    `;
  }
  seeded = true;
}

export async function listServices(): Promise<Service[]> {
  const sql = getSql();
  const rows = (await sql`SELECT id, name, description, duration_min, price_eur FROM services ORDER BY price_eur ASC`) as Service[];
  return rows;
}

export async function getService(id: string): Promise<Service | undefined> {
  const sql = getSql();
  const rows = (await sql`SELECT id, name, description, duration_min, price_eur FROM services WHERE id = ${id}`) as Service[];
  return rows[0];
}

export function getServiceSync(id: string): Service | undefined {
  return CATALOG.find((s) => s.id === id);
}

export function catalogSync(): Service[] {
  return CATALOG;
}
