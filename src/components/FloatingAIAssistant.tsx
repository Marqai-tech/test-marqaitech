'use client';

/**
 * Task 152/153 — Floating AI Assistant (violet bot, every dashboard page).
 * - Desktop: violet bot FAB bottom-right on EVERY page; opens a compact chat
 *   panel wired to /api/ai-chat (same endpoint the AI Assistant page uses).
 * - Closable via the panel ✕ — but the dismissal is PER-PAGE ONLY: navigating
 *   to another page (or reloading) brings the bot back, so it is always
 *   available yet never "stagnant" for users who do not want it on screen.
 * - Mobile layout: rendered with `hideFab` — the raised CENTER button in the
 *   mobile footer is the entry point and dispatches the `tb:toggle-ai-assistant`
 *   event, which opens this same bot panel (PhonePe-style center dock button).
 */

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { FiX, FiSend, FiCpu } from 'react-icons/fi';

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const GREETING: Msg[] = [
  {
    id: 'greet',
    role: 'assistant',
    content:
      "Hi! I'm your 3Boxes AI Assistant. Ask me about leave, payroll, attendance, policies or any HRMS module.",
  },
];

const QUICK_CHIPS = ['My leave balance', 'Company holidays', 'How do I apply for leave?'];

/** Custom window event fired by the mobile footer's raised center AI button. */
export const AI_ASSISTANT_TOGGLE_EVENT = 'tb:toggle-ai-assistant';

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function FloatingAIAssistant({ hideFab = false }: { hideFab?: boolean }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(GREETING);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  // Task 158 — /api/ai-chat requires a sessionId for conversation history.
  // The FAB panel previously sent only { message } so every question returned
  // "Message and sessionId are required". The FIRST message omits sessionId —
  // the API generates one and returns it — and every later message reuses it,
  // so the whole panel conversation shares one AI session.
  const sessionIdRef = useRef<string>('');

  // Per-page visibility: the bot re-appears on every page navigation.
  // Closing it only hides it for the CURRENT page (fixes "bot not visible"
  // — the old session-persistent dismissal kept it hidden for the whole
  // browser session, even across reloads).
  useEffect(() => {
    setDismissed(false);
    setOpen(false);
  }, [pathname]);

  // Mobile footer center button toggles this panel.
  useEffect(() => {
    const onToggle = () => {
      setDismissed(false);
      setOpen((prev) => !prev);
    };
    window.addEventListener(AI_ASSISTANT_TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(AI_ASSISTANT_TOGGLE_EVENT, onToggle);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  const close = () => {
    setOpen(false);
    setDismissed(true);
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    setInput('');
    setMessages((prev) => [...prev, { id: `u${Date.now()}`, role: 'user', content }]);
    setBusy(true);
    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message: content,
          ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
          context: 'floating_assistant',
        }),
      });
      const data = await res.json().catch(() => ({}));
      // Server issues the session id on the first message — keep it.
      if (!sessionIdRef.current && data?.sessionId) {
        sessionIdRef.current = String(data.sessionId);
      }
      const reply = data?.reply || data?.response || data?.message || data?.error || 'Sorry — I could not process that right now.';
      setMessages((prev) => [...prev, { id: `a${Date.now()}`, role: 'assistant', content: String(reply) }]);
    } catch {
      setMessages((prev) => [...prev, { id: `e${Date.now()}`, role: 'assistant', content: 'Network issue — please try again in a moment.' }]);
    } finally {
      setBusy(false);
    }
  };

  if (dismissed && !hideFab) return null;

  return (
    <>
      {/* Chat panel — sits above the mobile footer / desktop FAB */}
      {open && (
        <div className="fixed bottom-[6.5rem] right-3 sm:right-5 sm:bottom-24 z-[70] w-[min(24rem,calc(100vw-1.5rem))] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-slide-in-down">
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <FiCpu className="w-4 h-4" />
              </span>
              <div>
                <p className="text-sm font-bold leading-tight">AI Assistant</p>
                <p className="text-[10px] text-violet-100 leading-tight">3Boxes HRMS · always here to help</p>
              </div>
            </div>
            <button onClick={close} title="Close assistant" className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
              <FiX className="w-4 h-4" />
            </button>
          </div>
          {/* Messages */}
          <div ref={scrollRef} className="h-72 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50/60">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-[13px] leading-snug whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-violet-600 text-white rounded-br-md'
                    : 'bg-white border border-slate-200 text-slate-700 rounded-bl-md'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 px-3 py-2 rounded-2xl rounded-bl-md text-slate-400 text-[13px]">
                  Thinking…
                </div>
              </div>
            )}
          </div>
          {/* Quick chips */}
          <div className="px-3 pt-2 pb-1 bg-white flex flex-wrap gap-1.5">
            {QUICK_CHIPS.map((chip) => (
              <button key={chip} onClick={() => send(chip)} disabled={busy}
                className="text-[11px] px-2.5 py-1 rounded-full border border-violet-200 text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-50">
                {chip}
              </button>
            ))}
          </div>
          {/* Composer */}
          <div className="p-2.5 bg-white border-t border-slate-100 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(input); }}
              placeholder="Ask anything…"
              className="flex-1 px-3 py-2 text-[13px] rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
            />
            <button onClick={() => send(input)} disabled={busy || !input.trim()}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center disabled:opacity-40 shadow-sm"
              title="Send">
              <FiSend className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bot FAB (desktop — hidden on mobile where the footer center button is the entry) */}
      {!hideFab && (
        <button
          onClick={() => (open ? setOpen(false) : setOpen(true))}
          title={open ? 'Close AI Assistant' : 'Open AI Assistant'}
          className="fixed bottom-6 right-5 z-[70] w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 text-white shadow-xl shadow-violet-500/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        >
          {open ? <FiX className="w-6 h-6" /> : <FiCpu className="w-6 h-6" />}
          {!open && <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-white" />}
        </button>
      )}
    </>
  );
}
