import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { getOpenAI, MODEL } from './openai';
import { getConversationHistory, saveConversationHistory, type StoredMessage } from './db';
import { catalogSync, getServiceSync } from './services';
import {
  getAvailableSlots,
  bookAppointment,
  getAppointmentsBySession,
  cancelAppointment,
} from './calendar';
import { formatInTimeZone } from 'date-fns-tz';

const TZ = 'Europe/Madrid';

function systemPrompt(): string {
  const now = new Date();
  const today = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
  const nowStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ });

  return `Eres el recepcionista virtual de Centro Moxa, un centro de medicina tradicional china en España (moxibustión, acupuntura, Tui-Na).

Tu tarea: ayudar al cliente a reservar, consultar o cancelar su cita por WhatsApp.

Hablas de ti mismo SIEMPRE en masculino: "encantado", "listo", "preparado", "atento". NUNCA uses formas femeninas al referirte a ti mismo ("encantada", "lista") — eres un asistente masculino.

HOY ES ${today}. Hora actual: ${nowStr} (Madrid).

== REGLAS CRÍTICAS SOBRE FECHAS Y HORAS ==

1. NUNCA inventes el campo starts_at. SIEMPRE copia EXACTAMENTE uno de los valores starts_at (ISO 8601) devueltos por get_available_slots. Si no has llamado antes a get_available_slots, llámalo PRIMERO.

2. Flujo correcto para reservar:
   a) Pregunta qué servicio quiere (o deduce del mensaje).
   b) Llama a get_available_slots con el service_id.
   c) Enseña al cliente 3-4 horarios en lenguaje natural (ej. "sábado 17 oct, 11:00").
   d) El cliente elige uno.
   e) Pídele el nombre completo si no te lo ha dado.
   f) Confirma los datos (servicio, día, hora, precio) y espera un "sí" explícito.
   g) Llama a book_appointment con EL MISMO starts_at ISO que devolvió get_available_slots para ese hueco.

3. Si book_appointment devuelve un error, NO llames otra vez a get_available_slots automáticamente. Lee el motivo del error y díselo al cliente, pregúntale qué prefiere hacer.

4. Si el cliente dice "a las 10" sin especificar día, PREGUNTA de qué día. No asumas "hoy" ni "mañana".

== REGLAS DE TONO ==

5. Español castellano, cálido y profesional, pero breve. Esto es WhatsApp: respuestas cortas, nada de párrafos.
6. Al proponer horarios, 3-4 opciones máximo. Formato: "📅 sábado 17 oct, 11:00".
7. Si el cliente pregunta algo fuera de reservas (ej. "qué es la moxibustión"), responde con 1-2 frases y vuelve a reservas.
8. Si el cliente escribe en catalán, gallego, euskera o inglés, respóndele en el mismo idioma.
9. Máximo 1-2 emojis por mensaje. Nada de signos de exclamación en cadena.
10. No des el teléfono del centro, tú ERES el canal.
11. Para reagendar: get_my_appointments → cancela la indicada → inicia reserva nueva.

El centro abre lunes a viernes 10:00-14:00 y 16:00-20:00, sábados 10:00-14:00. Domingos cerrado.`;
}

const TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_services',
      description: 'Devuelve el catálogo de servicios del centro con precio y duración.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_available_slots',
      description: 'Devuelve huecos libres reales para un servicio en los próximos días. Úsalo SIEMPRE antes de proponer horarios.',
      parameters: {
        type: 'object',
        properties: {
          service_id: { type: 'string', description: 'ID del servicio (consulta-inicial, moxibustion, acupuntura, combi-moxa-acupuntura, tui-na).' },
          days_ahead: { type: 'number', description: 'Días hacia adelante (default 7).' },
        },
        required: ['service_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Reserva en firme. Solo tras: (1) confirmación explícita del cliente, (2) tener su nombre, (3) haber llamado antes a get_available_slots y usar su starts_at exacto.',
      parameters: {
        type: 'object',
        properties: {
          service_id: { type: 'string' },
          starts_at: {
            type: 'string',
            description: 'OBLIGATORIO: copia EXACTA del starts_at (ISO 8601) devuelto por get_available_slots. NO inventes. NO modifiques.',
          },
          client_name: { type: 'string' },
        },
        required: ['service_id', 'starts_at', 'client_name'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_appointments',
      description: 'Lista las citas futuras del cliente actual.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Cancela una cita del cliente actual por su ID. Pide confirmación explícita antes.',
      parameters: {
        type: 'object',
        properties: { appointment_id: { type: 'number' } },
        required: ['appointment_id'],
        additionalProperties: false,
      },
    },
  },
];

async function runTool(name: string, args: Record<string, unknown>, sessionId: string): Promise<unknown> {
  switch (name) {
    case 'list_services':
      return catalogSync();
    case 'get_available_slots': {
      const serviceId = String(args.service_id);
      const daysAhead = typeof args.days_ahead === 'number' ? args.days_ahead : 7;
      const service = getServiceSync(serviceId);
      if (!service) return { error: `Servicio '${serviceId}' no existe. IDs válidos: ${catalogSync().map((s) => s.id).join(', ')}` };
      const slots = await getAvailableSlots(serviceId, daysAhead, 6);
      return {
        service: { id: service.id, name: service.name, duration_min: service.duration_min, price_eur: service.price_eur },
        slots,
      };
    }
    case 'book_appointment': {
      const result = await bookAppointment({
        session_id: sessionId,
        client_name: String(args.client_name),
        service_id: String(args.service_id),
        starts_at: String(args.starts_at),
      });
      if (!result.ok) return { ok: false, reason: result.reason };
      const a = result.appointment;
      const service = getServiceSync(a.service_id);
      return {
        ok: true,
        appointment: {
          id: a.id,
          service: service?.name,
          starts_at_local: formatInTimeZone(a.starts_at, TZ, "EEEE d 'de' MMMM, HH:mm"),
          price_eur: service?.price_eur,
        },
      };
    }
    case 'get_my_appointments': {
      const appts = await getAppointmentsBySession(sessionId);
      return appts.map((a) => ({
        id: a.id,
        service: getServiceSync(a.service_id)?.name,
        starts_at_local: formatInTimeZone(a.starts_at, TZ, "EEEE d 'de' MMMM, HH:mm"),
      }));
    }
    case 'cancel_appointment': {
      const id = Number(args.appointment_id);
      return cancelAppointment(id, sessionId);
    }
    default:
      return { error: `Tool desconocida: ${name}` };
  }
}

export async function handleIncomingMessage(sessionId: string, userText: string): Promise<string> {
  const history = await getConversationHistory(sessionId);
  const openai = getOpenAI();

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt() },
    ...(history.filter((m) => m.role !== 'system') as unknown as ChatCompletionMessageParam[]),
    { role: 'user', content: userText },
  ];

  const maxRounds = 5;
  for (let round = 0; round < maxRounds; round++) {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.3,
    });
    const choice = completion.choices[0];
    if (!choice) throw new Error('OpenAI sin choices');
    const msg = choice.message;
    messages.push(msg as ChatCompletionMessageParam);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const reply = msg.content ?? '…';
      const persisted: StoredMessage[] = [
        ...history,
        { role: 'user', content: userText },
        { role: 'assistant', content: reply },
      ];
      await saveConversationHistory(sessionId, persisted);
      return reply;
    }

    for (const call of msg.tool_calls) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        parsed = {};
      }
      const result = await runTool(call.function.name, parsed, sessionId);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  const fallback = 'Perdona, se me ha liado algo. ¿Puedes repetirme qué necesitas?';
  await saveConversationHistory(sessionId, [
    ...history,
    { role: 'user', content: userText },
    { role: 'assistant', content: fallback },
  ]);
  return fallback;
}
