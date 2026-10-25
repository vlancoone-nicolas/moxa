# Centro Moxa · demo WhatsApp bot

Bot WhatsApp que atiende reservas automáticamente para Centro Moxa (centro de medicina tradicional china).
Cliente escribe o manda audio → bot responde, propone huecos, reserva → cita aparece en el panel del dueño.
Recordatorio automático 24h antes de cada cita.

**Esta versión es la demo para cerrar venta.** Calendario simulado en SQLite local (sin Google Calendar aún).
Si cerramos venta, migramos a VPS Oracle + Google Calendar real + número oficial WhatsApp Business.

---

## Stack

- **Evolution API** v2.3.7 (Docker) → vincula tu WhatsApp personal por QR como si fuera WhatsApp Web
- **PostgreSQL + Redis** (Docker) → requeridos por Evolution API para persistir sesión y cache
- **Node.js + Express + TypeScript** → bot que atiende webhooks
- **OpenAI gpt-4o-mini + Whisper** → entiende texto Y audios en español
- **SQLite** (file-based) → persiste citas, catálogo y memoria conversacional
- **node-cron** → recordatorios 24h antes
- **Cloudflare Tunnel** → expone tu Mac a internet (gratis)

---

## Setup inicial (una sola vez · ~10 min)

### 1. Pegar tus API keys

```bash
cd ~/Projects/moxa
cp .env.example .env.local
```

Edita `.env.local` y pega tu **OpenAI API key** (saca una en https://platform.openai.com/api-keys):

```
OPENAI_API_KEY=sk-proj-...
```

El resto déjalo como está (el `EVOLUTION_API_KEY=moxa-demo-key-change-me` coincide con el valor del `docker-compose.yml`).

### 2. Instalar dependencias

```bash
pnpm install
```

### 3. Levantar Evolution API + Redis

```bash
docker compose up -d
```

Espera ~30s a que los healthchecks estén en verde:

```bash
docker compose ps
```

Verifica que Evolution responde:

```bash
curl -s http://localhost:8080/manager | head
```

### 4. Crear instancia WhatsApp + escanear QR

Abre en el navegador: **http://localhost:8080/manager**

- Login con la API key: `moxa-demo-key-change-me`
- "Instance" → "Create instance" → nombre `moxa`
- Pulsa "QR Code"
- En tu móvil: WhatsApp → ⚙️ Dispositivos vinculados → Vincular dispositivo → escanea
- Estado pasa a **CONNECTED** ✅

### 5. Configurar webhook de Evolution hacia el bot

Desde el panel de Evolution Manager, en tu instancia `moxa`:

- "Webhook" → URL: `http://host.docker.internal:3000/webhook/evolution`
- Events: marca **MESSAGES_UPSERT**
- "Enabled": sí

> **¿Por qué `host.docker.internal`?** Es la forma que tienen los containers Docker en Mac de llamar a `localhost` del Mac. Si usas Linux, cámbialo por la IP del host.

### 6. Arrancar el bot

```bash
pnpm dev
```

Deberías ver:

```
✅ Bot Moxa escuchando en http://localhost:3000
   Panel agenda:   http://localhost:3000/calendar
[reminders] cron activo (cada 15 min)
```

---

## Probar el bot

### Opción A: tu compañero prueba desde su móvil (recomendado)

Tu compañero manda WhatsApp al **número de Nicolás** (el vinculado por QR). Secuencia a probar:

```
Compañero: hola
Bot:       ¡Hola! Soy la recepcionista virtual de Centro Moxa. ¿En qué puedo ayudarte?

Compañero: quería reservar una sesión de moxa
Bot:       Perfecto. Tenemos huecos:
           📅 jueves 23 oct, 17:00
           📅 jueves 23 oct, 18:00
           📅 viernes 24 oct, 10:00
           📅 viernes 24 oct, 11:00
           ¿Cuál te viene mejor? Y dime tu nombre, porfa.

Compañero: Juan Pérez el jueves 23 a las 18:00
Bot:       Confirmo: moxibustión jueves 23 oct 18:00, 60 min, 45€. ¿Reservo?

Compañero: sí
Bot:       🌿 Reservado. Jueves 23 oct 18:00, moxibustión (45€).
           Te mando recordatorio 24h antes. Hasta mañana, Juan.
```

Luego el dueño abre **http://localhost:3000/calendar** y ve la cita.

### Opción B: probar con audio

Que tu compañero mande un audio: *"Hola quería una moxa para mañana por la tarde"*.
Whisper lo transcribe → GPT entiende → bot responde.

### Opción C: exponer la demo para que la pruebe desde fuera

Si quieres que tu compañero pruebe sin estar en tu red (o le compartes la demo a otro):

```bash
pnpm tunnel
```

Esto arranca Cloudflare Tunnel y te da una URL pública tipo `https://xxx-xxx-xxx.trycloudflare.com`.
Actualiza `PUBLIC_URL` en `.env.local` y reinicia el bot si quieres que coincida.
La URL del panel sería `https://xxx.trycloudflare.com/calendar`.

> **Nota**: para probar el bot EN SÍ el tunnel no hace falta — Evolution ya le pega al bot via `host.docker.internal`. El tunnel solo sirve si quieres compartir el panel `/calendar` con el dueño para que lo vea en su móvil.

---

## Script de demo para enseñar al compañero

**Objetivo**: 90 segundos. El dueño tiene que decir "lo quiero".

1. **Mostrar el problema actual (10s)**: "ahora cuando te escriben por WhatsApp, apuntas la cita a mano, ¿verdad? ¿Cuánto tiempo pierdes al día?"
2. **Mostrar el bot funcionando (60s)**:
   - "Mira. Voy a escribir desde este otro móvil como si fuera un cliente nuevo."
   - Mandar: `"hola, me duele mucho la espalda y querría una sesión de moxa cuanto antes"`
   - Bot responde proponiendo huecos
   - Elegir uno, dar nombre
   - Bot confirma reserva
   - **Abrir `/calendar` en el móvil del dueño** → "mira, aquí la tienes, con nombre, teléfono, hora y precio"
3. **Mostrar el audio (10s)**: "¿Y si el cliente te manda un audio porque va conduciendo?" → mandar audio. Bot responde igual.
4. **Mostrar recordatorio (10s)**: "Y 24h antes el bot le manda recordatorio automático. Se acabó el 'no se me acordó la cita' y perder la hora."
5. **Cerrar**: "Esto es la demo. Si lo quieres, lo monto con tu Google Calendar real, tu número oficial de WhatsApp y queda rodando 24/7."

---

## Qué incluye la demo y qué NO

**Incluye**:
- Flujo de reserva end-to-end por texto y audio
- Memoria conversacional por cliente (últimos 20 mensajes)
- Catálogo de 5 servicios (consulta inicial, moxibustión, acupuntura, combi, Tui-Na)
- Horario fijo L-V 10-14 + 16-20, S 10-14
- Panel web del dueño (`/calendar`)
- Recordatorio automático 24h antes
- Cancelación / consulta de citas por WhatsApp

**NO incluye (porque es demo, en V2 sí)**:
- Conexión real a Google Calendar (ahora SQLite simula)
- Número oficial Business API (ahora Evolution + número personal via QR)
- Panel edición manual del dueño (ahora solo lectura)
- Multi-practitioner (ahora un único hueco por slot)
- Cobro online (centro cobra en persona)

---

## Troubleshooting

**`docker compose up` falla con "port 8080 already in use"**
→ Mata lo que esté en 8080 (`lsof -i :8080`) o cambia el puerto en `docker-compose.yml`.

**El QR expira antes de escanearlo**
→ Vuelve a pulsar "QR Code" en Evolution Manager. Da 30 QRs antes de bloquear.

**Bot no responde a mensajes**
→ Comprueba:
1. `docker compose logs evolution-api` → ¿llegan mensajes?
2. `pnpm dev` output → ¿llega el webhook?
3. ¿Webhook configurado como `http://host.docker.internal:3000/webhook/evolution`?

**Whisper devuelve texto raro con audios**
→ El audio llega en formato OGG Opus. Si Whisper lo rechaza, verifica que `OPENAI_API_KEY` tenga acceso al modelo `whisper-1`.

**La sesión WhatsApp se desconecta**
→ Es Evolution/Baileys. Vuelve a escanear el QR. En producción tipo Oracle VPS esto se estabiliza porque el host no se duerme.

---

## Si cerramos venta, qué cambia

Entra un plan-file V2 con:

1. **Migración a Oracle Cloud Always Free VM** (24/7, gratis para siempre)
2. **Google Calendar OAuth** → citas aterrizan en el Calendar del dueño
3. **Número WhatsApp oficial** → verificación Meta Business + Twilio o Meta Cloud API
4. **Backups automáticos** SQLite → S3/R2 cada 6h
5. **Monitoring** Sentry
6. **Multi-practitioner opcional** si tiene colaboradores

Precio orientativo: setup 1500-2500€ + 50€/mes mantenimiento (según banda Vlanco "Standard" / "Premium" si procede).

---

## Comandos útiles

```bash
# Arrancar todo
docker compose up -d && pnpm dev

# Ver logs del bot
# (pnpm dev ya muestra logs en vivo)

# Ver logs Evolution
docker compose logs -f evolution-api

# Resetear sesión WhatsApp (nuevo QR)
docker compose down && docker volume rm moxa_evolution_instances && docker compose up -d

# Resetear base de datos
rm data/moxa.db*

# Parar todo
docker compose down
```
