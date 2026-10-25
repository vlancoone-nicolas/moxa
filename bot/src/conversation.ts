import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { openai } from './openai.ts';
import { env } from './env.ts';
import { getConversationHistory, saveConversationHistory, type StoredMessage } from './db.ts';
import { listServices, getService } from './services.ts';
import {
  getAvailableSlots,
  bookAppointment,
  getAppointmentsByPhone,
  cancelAppointment,
} from './calendar.ts';
import { formatInTimeZone } from 'date-fns-tz';
import { TZ } from './env.ts';

const SYSTEM_PROMPT = `Eres el recepcionista virtual de Centro Moxa, un centro de medicina tradicional china en España (moxibustión, acupuntura, Tui-Na).

Tu tarea: ayudar al cliente a reservar, consultar o cancelar su cita por WhatsApp.

Hablas de ti mismo SIEMPRE en masculino: "encantado", "listo", "preparado", "atento". NUNCA uses formas femeninas al referirte a ti mismo ("encantada", "lista") — eres un asistente masculino.

HOY ES ${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' })}. Hora actual: ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })} (Madrid).

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

5. Habla en español castellano, cálido y profesional, pero breve. Esto es WhatsApp: respuestas cortas, nada de párrafos.
6. Al proponer horarios, 3-4 opciones máximo. Formato: "📅 sábado 17 oct, 11:00".
7. Si el cliente pregunta algo fuera de reservas (ej. "qué es la moxibustión"), responde con 1-2 frases y vuelve a reservas.
8. Si el cliente escribe en catalán, gallego, euskera o inglés, respóndele en el mismo idioma.
9. Máximo 1-2 emojis por mensaje. Nada de signos de exclamación en cadena.
10. No des el teléfono del centro, tú ERES el canal.
11. Si el cliente pide reagendar: primero muestra sus citas con get_my_appointments, cancela la que indique, y luego inicia el flujo de reserva nuevo.

El centro abre lunes a viernes 10:00-14:00 y 16:00-20:00, sábados 10:00-14:00. Domingos cerrado.`;

const TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_services',
      description: 'Devuelve el catálogo completo de servicios del centro con precio y duración.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_available_slots',
      description: 'Devuelve huecos libres para un servicio en los próximos días. Úsalo SIEMPRE antes de proponer horarios al cliente.',
      parameters: {
        type: 'object',
        properties: {
          service_id: {
            type: 'string',
            description: 'ID del servicio (ej. moxibustion, acupuntura, consulta-inicial, combi-moxa-acupuntura, tui-na).',
          },
          days_ahead: {
            type: 'number',
            description: 'Rango de días a mirar hacia adelante. Default 7.',
          },
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
      description: 'Reserva una cita en firme. Solo llama a esta función cuando: (1) el cliente haya confirmado explícitamente servicio y hora, (2) tengas su nombre, (3) hayas llamado antes a get_available_slots y el starts_at salga directamente de ahí.',
      parameters: {
        type: 'object',
        properties: {
          service_id: { type: 'string', description: 'ID del servicio (consulta-inicial, moxibustion, acupuntura, combi-moxa-acupuntura, tui-na).' },
          starts_at: {
            type: 'string',
            description: 'OBLIGATORIO: copia EXACTA del campo starts_at (ISO 8601) que te devolvió get_available_slots para el hueco elegido. NO inventes esta fecha. NO la modifiques. Si no la tienes, llama primero a get_available_slots.',
          },
          client_name: { type: 'string', description: 'Nombre completo del cliente' },
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
      description: 'Devuelve las citas futuras del cliente actual. Úsalo si el cliente pregunta "qué citas tengo" o antes de cancelar.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Cancela una cita del cliente actual por su ID. Antes pídele confirmación explícita.',
      parameters: {
        type: 'object',
        properties: { appointment_id: { type: 'number' } },
        required: ['appointment_id'],
        additionalProperties: false,
      },
    },
  },
];

function runTool(name: string, args: Record<string, unknown>, phone: string): unknown {
  switch (name) {
    case 'list_services':
      return listServices();
    case 'get_available_slots': {
      const serviceId = String(args.service_id);
      const daysAhead = typeof args.days_ahead === 'number' ? args.days_ahead : 7;
      const service = getService(serviceId);
      if (!service) return { error: `Servicio '${serviceId}' no existe. IDs válidos: ${listServices().map((s) => s.id).join(', ')}` };
      const slots = getAvailableSlots(serviceId, daysAhead, 8);
      return {
        service: { id: service.id, name: service.name, duration_min: service.duration_min, price_eur: service.price_eur },
        slots,
      };
    }
    case 'book_appointment': {
      const result = bookAppointment({
        phone,
        client_name: String(args.client_name),
        service_id: String(args.service_id),
        starts_at: String(args.starts_at),
      });
      if (!result.ok) return { ok: false, reason: result.reason };
      const a = result.appointment;
      const service = getService(a.service_id);
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
      const appts = getAppointmentsByPhone(phone);
      return appts.map((a) => ({
        id: a.id,
        service: getService(a.service_id)?.name,
        starts_at_local: formatInTimeZone(a.starts_at, TZ, "EEEE d 'de' MMMM, HH:mm"),
      }));
    }
    case 'cancel_appointment': {
      const id = Number(args.appointment_id);
      const result = cancelAppointment(id, phone);
      return result;
    }
    default:
      return { error: `Tool desconocida: ${name}` };
  }
}

export async function handleIncomingMessage(phone: string, userText: string): Promise<string> {
  const history = getConversationHistory(phone);

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(history.filter((m) => m.role !== 'system') as unknown as ChatCompletionMessageParam[]),
    { role: 'user', content: userText },
  ];

  const maxToolRounds = 5;
  for (let round = 0; round < maxToolRounds; round++) {
    const completion = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
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
      const assistantText = msg.content ?? '…';
      const persisted: StoredMessage[] = [
        ...history,
        { role: 'user', content: userText },
        { role: 'assistant', content: assistantText },
      ];
      saveConversationHistory(phone, persisted);
      return assistantText;
    }

    for (const call of msg.tool_calls) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        parsedArgs = {};
      }
      const result = runTool(call.function.name, parsedArgs, phone);
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  // Fallback si el LLM se encicla
  const fallback = 'Perdona, se me ha liado algo. ¿Puedes repetirme qué necesitas?';
  saveConversationHistory(phone, [
    ...history,
    { role: 'user', content: userText },
    { role: 'assistant', content: fallback },
  ]);
  return fallback;
}
