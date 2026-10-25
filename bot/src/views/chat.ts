export function renderChat(): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Centro Moxa · playground</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #e5ddd5; color: #111; }
  .shell { max-width: 540px; height: 100vh; margin: 0 auto; display: flex; flex-direction: column; background: #efeae2; }
  header { background: #075e54; color: #fff; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; }
  header h1 { font-size: 15px; font-weight: 600; }
  header .sub { font-size: 11px; opacity: 0.8; margin-top: 2px; }
  header button { background: rgba(255,255,255,0.15); color: #fff; border: 0; padding: 6px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; }
  header button:hover { background: rgba(255,255,255,0.25); }
  #log { flex: 1; overflow-y: auto; padding: 16px 12px; display: flex; flex-direction: column; gap: 6px; }
  .msg { max-width: 78%; padding: 7px 11px 8px; border-radius: 8px; font-size: 14px; line-height: 1.35; word-wrap: break-word; white-space: pre-wrap; box-shadow: 0 1px 0.5px rgba(0,0,0,0.13); position: relative; }
  .msg .time { display: block; font-size: 10px; color: rgba(0,0,0,0.45); text-align: right; margin-top: 2px; }
  .user { align-self: flex-end; background: #d9fdd3; }
  .bot { align-self: flex-start; background: #fff; }
  .sys { align-self: center; background: #ffeeba; color: #665200; font-size: 12px; padding: 5px 10px; border-radius: 6px; }
  form { display: flex; gap: 8px; padding: 10px; background: #f0f0f0; border-top: 1px solid rgba(0,0,0,0.08); }
  input[type=text] { flex: 1; border: 0; border-radius: 20px; padding: 10px 14px; font-size: 14px; outline: none; background: #fff; }
  button[type=submit] { background: #075e54; color: #fff; border: 0; width: 42px; height: 42px; border-radius: 50%; font-size: 18px; cursor: pointer; }
  button[type=submit]:disabled { opacity: 0.5; cursor: not-allowed; }
  .typing { align-self: flex-start; background: #fff; padding: 10px 14px; border-radius: 8px; display: flex; gap: 4px; }
  .typing span { width: 6px; height: 6px; background: #9aa; border-radius: 50%; animation: blink 1.2s infinite; }
  .typing span:nth-child(2) { animation-delay: 0.2s; }
  .typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes blink { 0%, 60%, 100% { opacity: 0.3; } 30% { opacity: 1; } }
</style>
</head>
<body>
<div class="shell">
  <header>
    <div>
      <h1>Centro Moxa · playground</h1>
      <div class="sub">bot conectado · prueba sin WhatsApp</div>
    </div>
    <button id="reset">Reset conversación</button>
  </header>
  <div id="log"></div>
  <form id="form">
    <input id="input" type="text" placeholder="Escribe un mensaje..." autocomplete="off" required />
    <button type="submit" title="Enviar">→</button>
  </form>
</div>

<script>
const log = document.getElementById('log');
const form = document.getElementById('form');
const input = document.getElementById('input');
const resetBtn = document.getElementById('reset');

function nowHHMM() {
  const d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function addMsg(cls, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + cls;
  div.textContent = text;
  const t = document.createElement('span');
  t.className = 'time';
  t.textContent = nowHHMM();
  div.appendChild(t);
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function addSys(text) {
  const div = document.createElement('div');
  div.className = 'sys';
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function showTyping() {
  const d = document.createElement('div');
  d.className = 'typing';
  d.id = 'typing';
  for (let i = 0; i < 3; i++) d.appendChild(document.createElement('span'));
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}
function hideTyping() {
  const t = document.getElementById('typing');
  if (t) t.remove();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  addMsg('user', text);
  input.value = '';
  input.disabled = true;
  showTyping();
  try {
    const resp = await fetch('/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
    const data = await resp.json();
    hideTyping();
    addMsg('bot', data.reply ?? '(sin respuesta)');
  } catch (err) {
    hideTyping();
    addMsg('bot', '⚠️ Error: ' + err.message);
  } finally {
    input.disabled = false;
    input.focus();
  }
});

resetBtn.addEventListener('click', async () => {
  if (!confirm('¿Borrar conversación y empezar de cero?')) return;
  await fetch('/chat/reset', { method: 'POST' });
  log.replaceChildren();
  addSys('Conversación reseteada');
  input.focus();
});

addSys('Playground · teléfono virtual demo-web-test · nada de esto llega a WhatsApp');
input.focus();
</script>
</body>
</html>`;
}
