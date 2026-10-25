'use client';

import { useEffect, useRef, useState } from 'react';

interface Msg {
  role: 'user' | 'bot' | 'sys';
  text: string;
  time: string;
}

function hhmm(d = new Date()): string {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMessages([
      { role: 'sys', text: 'Playground · cada visitante tiene su propia conversación · pruebas sin WhatsApp', time: hhmm() },
    ]);
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    setMessages((m) => [...m, { role: 'user', text, time: hhmm() }]);
    setTyping(true);
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = (await resp.json()) as { reply?: string; error?: string };
      setMessages((m) => [...m, { role: 'bot', text: data.reply ?? data.error ?? '(sin respuesta)', time: hhmm() }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'error';
      setMessages((m) => [...m, { role: 'bot', text: `⚠️ ${msg}`, time: hhmm() }]);
    } finally {
      setTyping(false);
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function reset() {
    if (!confirm('¿Borrar la conversación y empezar de cero?')) return;
    await fetch('/api/chat/reset', { method: 'POST' });
    setMessages([{ role: 'sys', text: 'Conversación reseteada', time: hhmm() }]);
    inputRef.current?.focus();
  }

  return (
    <div style={styles.shell as React.CSSProperties}>
      <header style={styles.header as React.CSSProperties}>
        <div>
          <h1 style={styles.h1 as React.CSSProperties}>Centro Moxa · playground</h1>
          <div style={styles.sub as React.CSSProperties}>bot conectado · pruebas sin WhatsApp</div>
        </div>
        <button onClick={reset} style={styles.resetBtn as React.CSSProperties}>Reset</button>
      </header>

      <div ref={logRef} style={styles.log as React.CSSProperties}>
        {messages.map((m, i) => {
          if (m.role === 'sys') return <div key={i} style={styles.sys as React.CSSProperties}>{m.text}</div>;
          const bubble = { ...(styles.msg as React.CSSProperties), ...(m.role === 'user' ? styles.user : styles.bot) };
          return (
            <div key={i} style={bubble}>
              {m.text}
              <span style={styles.time as React.CSSProperties}>{m.time}</span>
            </div>
          );
        })}
        {typing ? (
          <div style={{ ...(styles.msg as React.CSSProperties), ...styles.bot, display: 'flex', gap: 4, padding: '10px 14px' }}>
            <Dot delay={0} /><Dot delay={0.2} /><Dot delay={0.4} />
          </div>
        ) : null}
      </div>

      <form onSubmit={send} style={styles.form as React.CSSProperties}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe un mensaje..."
          autoComplete="off"
          required
          style={styles.input as React.CSSProperties}
          disabled={sending}
        />
        <button type="submit" disabled={sending || !input.trim()} style={styles.submit as React.CSSProperties} title="Enviar">→</button>
      </form>
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        width: 6, height: 6, background: '#9aa', borderRadius: '50%',
        display: 'inline-block', animation: `moxaBlink 1.2s ${delay}s infinite`,
      }}
    />
  );
}

const styles = {
  shell: { maxWidth: 540, height: '100vh', margin: '0 auto', display: 'flex', flexDirection: 'column', background: '#efeae2' },
  header: { background: '#075e54', color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  h1: { fontSize: 15, fontWeight: 600, margin: 0 },
  sub: { fontSize: 11, opacity: 0.8, marginTop: 2 },
  resetBtn: { background: 'rgba(255,255,255,0.15)', color: '#fff', border: 0, padding: '6px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  log: { flex: 1, overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 6 },
  msg: { maxWidth: '78%', padding: '7px 11px 8px', borderRadius: 8, fontSize: 14, lineHeight: 1.35, wordWrap: 'break-word', whiteSpace: 'pre-wrap', boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)', position: 'relative' },
  user: { alignSelf: 'flex-end', background: '#d9fdd3' },
  bot: { alignSelf: 'flex-start', background: '#fff' },
  sys: { alignSelf: 'center', background: '#ffeeba', color: '#665200', fontSize: 12, padding: '5px 10px', borderRadius: 6 },
  time: { display: 'block', fontSize: 10, color: 'rgba(0,0,0,0.45)', textAlign: 'right', marginTop: 2 },
  form: { display: 'flex', gap: 8, padding: 10, background: '#f0f0f0', borderTop: '1px solid rgba(0,0,0,0.08)' },
  input: { flex: 1, border: 0, borderRadius: 20, padding: '10px 14px', fontSize: 14, outline: 'none', background: '#fff' },
  submit: { background: '#075e54', color: '#fff', border: 0, width: 42, height: 42, borderRadius: '50%', fontSize: 18, cursor: 'pointer' },
};
