import type { ReactNode } from 'react';

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        html, body { height: 100%; background: #e5ddd5; }
        @keyframes moxaBlink { 0%, 60%, 100% { opacity: 0.3; } 30% { opacity: 1; } }
      `}</style>
      {children}
    </>
  );
}
