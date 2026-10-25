---
title: Demo WhatsApp Centro Moxa — bot reservas conversacional
type: plan
created: 2026-10-16
status: en-ejecución
owner: nicolás
scope: proyecto ~/Projects/moxa/
survives: /clear
origin: Conversación 2026-10-16 23:00 — Nicolás necesita demo funcional para cerrar venta con Centro Moxa (centro de terapias / moxibustión / acupuntura). Dolor del cliente: pasar manualmente a limpio todas las citas que recibe por WhatsApp.
---

# Demo WhatsApp Centro Moxa — bot reservas conversacional

## Context

Centro Moxa (centro de terapias tradicionales) recibe reservas por WhatsApp personal y pasa todas las citas a mano a un calendario. Pierde horas. NO quiere web. Quiere que WhatsApp responda automáticamente, deje reservar, y las citas aparezcan en un calendario que él vea.

Esta demo es la bala para cerrar la venta: prototipo funcional sobre el número personal de Nicolás (vinculado por QR via Evolution API) donde su compañero prueba el flujo entero. Si funciona la demo, cerramos venta, migramos a VPS y conectamos a Google Calendar real.

Decisiones ya cerradas con Nicolás:
- Prototipo funcional real (no mockup)
- Evolution API en Mac (vía Docker) vinculado al número de Nicolás por QR
- Bot conversacional con OpenAI gpt-4o-mini + Whisper (entiende audios WhatsApp)
- Confirmación inmediata + recordatorio automático 24h antes
- Horario fijo + calendario simulado SQLite (NO conectar a Google real todavía, demo "finge" calendario)
- Hosting demo: Mac + Cloudflare Tunnel (si cerramos, migra a Oracle VPS)
- NO ElevenLabs (mala UX en WhatsApp, encarece sin aportar valor claro al caso)

## Estado actual

Entorno verificado: Node 24, pnpm 11, Docker 29, cloudflared instalado. Carpeta `~/Projects/moxa/` creada con `.git` inicial, estructura `src/`, `docs/plans/`, `data/`.

## Principios inviolables del plan

1. **Plan-files persisten en disco.** Cualquier `/clear` reconstruye desde aquí.
2. **Surgical precision.** Toca solo lo que el step describe.
3. **Verificar después de cada step.** Cada `[x]` requiere check explícito.
4. **Zero credenciales en código.** OpenAI key, Evolution API token: solo `.env.local` (git-ignored).
5. **Demo = no production.** SQLite local, cron en proceso, Cloudflare quick tunnel. Si cerramos venta, otro plan-file se encarga de prod.

---

## Step 1 — Scaffold proyecto base

Crear archivos de configuración raíz.

**Archivos a editar**:

- [x] 1.1 — `package.json` con dependencias (express, openai, better-sqlite3, node-cron, axios, date-fns-tz, zod, dotenv, tsx, typescript)
- [x] 1.2 — `tsconfig.json` strict modern (ES2023, moduleResolution bundler, noUncheckedIndexedAccess, exactOptionalPropertyTypes, verbatimModuleSyntax)
- [x] 1.3 — `.gitignore` (node_modules, data/*.db, .env.local, dist)
- [x] 1.4 — `.env.example` con todas las keys documentadas (vacías)
- [x] 1.5 — `data/.gitkeep`

**Verificación**:
- `cd ~/Projects/moxa && pnpm install` completa sin error

**Exit criteria**:
- `node_modules/` existe
- `pnpm typecheck` corre (aunque falle por falta de código, al menos arranque TS OK)

---

## Step 2 — Docker Evolution API + Redis

Levantar Evolution API local vinculado al número de Nicolás por QR.

**Archivos a editar**:

- [x] 2.1 — `docker-compose.yml` con services: evolution-api (atendai/evolution-api), redis
- [x] 2.2 — Variables env Evolution API: AUTHENTICATION_API_KEY, DATABASE_PROVIDER=postgresql (fallback to internal), CACHE_REDIS_ENABLED=true
- [x] 2.3 — Healthcheck Redis + volumen persistente para session WhatsApp

**Verificación**:
- `docker compose up -d` arranca ambos containers healthy
- `curl http://localhost:8080/manager` responde (UI Evolution)
- Crear instancia por API → obtener QR → escanear con WhatsApp móvil → status connected

**Exit criteria**:
- Evolution API accesible en `localhost:8080`
- Sesión WhatsApp conectada (número Nicolás)

---

## Step 3 — Backend: env, db, catálogo servicios

Fundamento del bot.

**Archivos a editar**:

- [x] 3.1 — `src/env.ts` con validación zod de env vars
- [x] 3.2 — `src/db.ts` SQLite con `better-sqlite3`, schema (services, appointments, conversations), migraciones inline, timezone Europe/Madrid
- [x] 3.3 — `src/services.ts` catálogo moxa inventado (consulta inicial 90min/60€, moxibustión 60min/45€, acupuntura 45min/40€, combi 75min/55€, tui-na 60min/50€). Horario L-V 10-14 y 16-20, S 10-14, Europe/Madrid
- [x] 3.4 — `src/calendar.ts` funciones puras: `getAvailableSlots(serviceId, daysAhead)`, `bookAppointment(...)`, `getAppointmentsByPhone(phone)`, `cancelAppointment(id, phone)`

**Verificación**:
- `pnpm tsx src/calendar.ts` smoke: imprimir 5 slots disponibles

**Exit criteria**:
- SQLite file se crea con tablas correctas
- `getAvailableSlots` devuelve slots futuros respetando horario y citas ya reservadas

---

## Step 4 — Backend: Evolution API client + OpenAI client

Wrapper HTTP sobre Evolution y OpenAI.

**Archivos a editar**:

- [x] 4.1 — `src/evolution.ts` métodos: `sendText(phone, text)`, `downloadAudio(messageId)`, `markRead`
- [x] 4.2 — `src/openai.ts`: `transcribeAudio(buffer)` con Whisper, `chat(messages, tools)` con gpt-4o-mini + tool calling

**Verificación**:
- Unit smoke manual: mandar audio dummy a Whisper, verificar transcript

**Exit criteria**:
- Ambos clients tipados y aislados (interfaz limpia para el handler conversación)

---

## Step 5 — Backend: conversation handler + reminders cron

Core del bot.

**Archivos a editar**:

- [x] 5.1 — `src/conversation.ts` handler principal: recibe webhook payload Evolution, extrae phone+texto (o audio→Whisper), carga memoria conversación de SQLite, construye mensajes para LLM con tools, ejecuta tool calls, guarda nueva memoria, manda respuesta via Evolution client
- [x] 5.2 — Tools LLM: `list_services`, `get_available_slots`, `book_appointment`, `get_my_appointments`, `cancel_appointment`
- [x] 5.3 — System prompt castellano: recepcionista Centro Moxa, cálido y profesional, nunca inventa huecos, siempre usa tools
- [x] 5.4 — `src/reminders.ts` cron cada 15min: buscar appointments 24h±15min ahead, `reminder_sent=false`, mandar WhatsApp recordatorio, marcar sent

**Verificación**:
- Enviar texto "hola" desde otro WhatsApp → bot saluda y pregunta en qué puede ayudar
- Pedir reservar moxa mañana → bot propone slots → confirmar → cita aparece en SQLite
- Enviar audio voz → Whisper transcribe → bot responde consecuentemente

**Exit criteria**:
- Flujo completo reserva funciona end-to-end por texto
- Flujo completo reserva funciona end-to-end por audio
- Recordatorio 24h se dispara (test con cita a now+24h)

---

## Step 6 — Vista calendario HTML (panel dueño)

Endpoint que simula "cómo verá el dueño sus citas".

**Archivos a editar**:

- [x] 6.1 — `src/views/calendar.ts` server-render HTML (zero JS, CSS inline), tabla agrupada por día, próximos 7 días con todas las citas, nombre, teléfono, servicio, hora
- [x] 6.2 — `src/index.ts` Express app: webhook `/webhook/evolution`, panel `/calendar`, health `/health`

**Verificación**:
- Visitar `http://localhost:8080/calendar` muestra las citas creadas en el flujo del Step 5

**Exit criteria**:
- Panel renderiza citas creadas vía bot
- URL comparable con compañero por Cloudflare Tunnel

---

## Step 7 — README + demo script

Instrucciones para arrancar y enseñar.

**Archivos a editar**:

- [x] 7.1 — `README.md` con: setup (`pnpm install` + `.env.local` + `docker compose up`), vincular WhatsApp (QR), arrancar bot (`pnpm dev`), exponer con `cloudflared tunnel`, URL del panel calendario, demo script (secuencia exacta de mensajes a enviar para enseñar al compañero)

**Verificación**:
- README leído de arriba a abajo arranca el demo en <15min desde cero

**Exit criteria**:
- Nicolás puede seguir el README sin preguntar a Claude

---

## Step 8 — Smoke test completo

Verificar en Mac antes de dar por terminado.

**Archivos a editar**: ninguno

**Verificación**:
- `pnpm install` → verde
- `pnpm typecheck` → verde
- `docker compose up -d` → healthy
- Mandar WhatsApp desde otro número → bot responde

**Exit criteria**:
- Demo arranca sin tocar código adicional

---

## Exit criteria del plan completo

- [x] Repo `~/Projects/moxa/` con todo el código + README
- [x] Plan-file persistido (este archivo)
- [x] Demo arranca con `docker compose up -d && pnpm dev` tras pegar keys en `.env.local`
- [x] Compañero puede probar flujo real desde su móvil mandando WhatsApp al número de Nicolás
- [x] Panel `/calendar` muestra citas en vivo

## Orden de ejecución sugerido

Lineal: Step 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Cada step depende del anterior.

## Memo entre /clear

> "Lee `~/Projects/moxa/docs/plans/2026-10-16-moxa-whatsapp-demo.md` y continúa desde el primer `[ ]` no marcado".

## Lo que NO hace este plan

- NO conecta a Google Calendar real (calendario simulado SQLite, Step 6 solo)
- NO verifica Meta Business ni compra número WhatsApp oficial (Evolution API vincula el personal via QR)
- NO despliega a Oracle VPS (eso es V2 post-venta)
- NO soporta pagos online (el centro cobra en persona, scope V2 si procede)
- NO integra ElevenLabs TTS/STT (ver conversación 2026-10-16: justificación de descartarlo)
- NO migra a Postgres/Supabase (SQLite local es suficiente para demo)
